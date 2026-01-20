'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Package, Search } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { Loading } from '@/components/ui/Page';
import { apiUrl } from '@/lib/api';

type EstoqueItem = { produto_id: string; produto_nome: string; produto_codigo: string; quantidade_disponivel: number };
type SetorInfo = { id: string; nome: string };
type MovItem = { id: string; produto_nome: string; tipo: string; quantidade: number; data: string; origem: string; destino: string };
type LoteItem = { id: string; numero: string; validade?: string | null; quantidade: number; preco_unitario?: number | null; status: string };

export default function SetorEstoquePage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [setor, setSetor] = useState<SetorInfo | null>(null);
  const [items, setItems] = useState<EstoqueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [showDetails, setShowDetails] = useState(false);
  const [selected, setSelected] = useState<EstoqueItem | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsError, setDetailsError] = useState('');
  const [detailsMovs, setDetailsMovs] = useState<MovItem[]>([]);
  const [detailsLotes, setDetailsLotes] = useState<LoteItem[]>([]);
  const detailsSeq = useRef(0);

  useEffect(() => {
    if (authLoading) return;
    if (!user) return;
    if (user.role !== 'operador_setor') {
      router.replace('/');
      return;
    }
    if (!user.scope_id) {
      Promise.resolve().then(() => {
        setError('Usuário sem setor associado');
        setLoading(false);
      });
      return;
    }
    const headers = { 'X-User-Id': user.id };
    Promise.resolve().then(() => {
      setLoading(true);
      setError('');
    });
    Promise.all([
      fetch(apiUrl(`/api/setores/${encodeURIComponent(user.scope_id)}`), { headers }).then(r => (r.ok ? r.json() : null)),
      fetch(apiUrl(`/api/estoque/setor/${encodeURIComponent(user.scope_id)}`), { headers }).then(r => (r.ok ? r.json() : { items: [] })),
    ])
      .then(([s, est]) => {
        if (!s) throw new Error('Setor não encontrado');
        setSetor(s);
        setItems(est.items || []);
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Erro ao carregar estoque'))
      .finally(() => setLoading(false));
  }, [authLoading, user, router]);

  const formatDate = (value?: string | null) => {
    if (!value) return '-';
    const normalized =
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(value) ? `${value}Z` : value;
    return new Date(normalized).toLocaleDateString('pt-BR');
  };

  const formatDateTime = (value?: string | null) => {
    if (!value) return '-';
    const normalized =
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(value) ? `${value}Z` : value;
    return new Date(normalized).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  const openDetails = async (it: EstoqueItem) => {
    if (!user?.scope_id) return;
    const mySeq = ++detailsSeq.current;
    setSelected(it);
    setShowDetails(true);
    setDetailsLoading(true);
    setDetailsError('');
    setDetailsMovs([]);
    setDetailsLotes([]);
    try {
      const headers = { 'X-User-Id': user.id };
      const [movRes, prodRes] = await Promise.all([
        fetch(
          apiUrl(`/api/movimentacoes/setor/${encodeURIComponent(user.scope_id)}?per_page=10&produto_id=${encodeURIComponent(it.produto_id)}`),
          { headers }
        ),
        fetch(apiUrl(`/api/produtos/${encodeURIComponent(it.produto_id)}`), { headers }),
      ]);

      const movJson = await movRes.json().catch(() => ({ items: [] }));
      const prodJson = await prodRes.json().catch(() => ({}));
      if (mySeq !== detailsSeq.current) return;

      if (!movRes.ok) throw new Error(movJson.detail || 'Erro ao carregar movimentações');
      if (!prodRes.ok) throw new Error(prodJson.detail || 'Erro ao carregar lotes');

      setDetailsMovs(Array.isArray(movJson?.items) ? movJson.items : []);
      setDetailsLotes(Array.isArray(prodJson?.lotes) ? prodJson.lotes : []);
    } catch (e: unknown) {
      if (mySeq !== detailsSeq.current) return;
      setDetailsError(e instanceof Error ? e.message : 'Erro ao carregar detalhes');
    } finally {
      if (mySeq !== detailsSeq.current) return;
      setDetailsLoading(false);
    }
  };

  const closeDetails = () => {
    detailsSeq.current += 1;
    setShowDetails(false);
    setSelected(null);
    setDetailsError('');
    setDetailsMovs([]);
    setDetailsLotes([]);
    setDetailsLoading(false);
  };

  const filtrados = useMemo(() => {
    const q = query.trim().toLowerCase();
    const emEstoque = items.filter(i => Number(i.quantidade_disponivel ?? 0) > 0);
    const base = !q ? emEstoque : emEstoque.filter(i => (i.produto_nome || '').toLowerCase().includes(q) || (i.produto_codigo || '').toLowerCase().includes(q));
    return [...base].sort((a, b) => (a.produto_nome || '').localeCompare(b.produto_nome || ''));
  }, [items, query]);

  if (authLoading) return null;
  if (!user) return null;

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="mb-6 flex items-center justify-between gap-3">
        <button type="button" onClick={() => router.push('/setor')} className="flex items-center gap-2 text-gray-600 hover:text-blue-700">
          <ArrowLeft className="h-4 w-4" /> Voltar
        </button>
        <div className="text-right">
          <div className="text-sm text-gray-500">Setor</div>
          <div className="font-semibold text-gray-900">{setor?.nome || '-'}</div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 mb-4">
        <div className="flex items-center gap-2 font-semibold text-gray-900 mb-3">
          <Package className="h-5 w-5 text-blue-600" /> Estoque do Setor
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Buscar produto..."
            className="w-full pl-10 pr-4 py-2 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {error && <div className="mb-4 bg-red-50 text-red-700 p-4 rounded-lg text-sm">{error}</div>}

      {loading ? (
        <div className="bg-white rounded-xl border border-gray-200">
          <Loading />
        </div>
      ) : filtrados.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-500">Nenhum item encontrado.</div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 text-gray-500">
              <tr>
                <th className="px-4 py-2 font-medium">Produto</th>
                <th className="px-4 py-2 font-medium">Código</th>
                <th className="px-4 py-2 font-medium text-right">Disponível</th>
                <th className="px-4 py-2 font-medium text-right">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtrados.map(i => (
                <tr key={i.produto_id} className="hover:bg-gray-50">
                  <td className="px-4 py-2 font-medium text-gray-900">{i.produto_nome}</td>
                  <td className="px-4 py-2 text-gray-600">{i.produto_codigo}</td>
                  <td className="px-4 py-2 text-right font-semibold text-gray-900">{Math.round(Number(i.quantidade_disponivel || 0))}</td>
                  <td className="px-4 py-2 text-right">
                    <button type="button" className="text-blue-600 hover:underline" onClick={() => openDetails(i)}>
                      Detalhes
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showDetails && selected && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onMouseDown={closeDetails} role="presentation">
          <div className="bg-white rounded-xl p-6 w-full max-w-3xl shadow-xl" onMouseDown={e => e.stopPropagation()} role="presentation">
            <div className="flex items-start justify-between gap-3 mb-4">
              <div className="min-w-0">
                <div className="text-lg font-bold text-gray-900 truncate">{selected.produto_nome}</div>
                <div className="text-xs text-gray-500">
                  Cód: {selected.produto_codigo} · Disponível no setor: {Math.round(Number(selected.quantidade_disponivel || 0))}
                </div>
              </div>
              <button type="button" onClick={closeDetails} className="px-3 py-2 text-gray-600 hover:bg-gray-100 rounded-lg">
                Fechar
              </button>
            </div>

            {detailsError && <div className="mb-4 bg-red-50 text-red-700 p-4 rounded-lg text-sm">{detailsError}</div>}

            {detailsLoading ? (
              <div className="bg-gray-50 rounded-lg p-6">
                <Loading />
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
                  <div className="font-semibold text-gray-900 mb-3">Últimas Movimentações</div>
                  {detailsMovs.length === 0 ? (
                    <div className="text-sm text-gray-500 italic">Nenhuma movimentação recente.</div>
                  ) : (
                    <div className="space-y-3">
                      {detailsMovs.map(m => (
                        <div key={m.id} className="flex items-start justify-between gap-4 pb-3 border-b border-gray-100 last:border-0">
                          <div className="min-w-0">
                            <div className="text-sm font-medium text-gray-900 capitalize truncate">{m.tipo}</div>
                            <div className="text-xs text-gray-500 truncate">
                              {m.origem} &rarr; {m.destino} · {formatDateTime(m.data)}
                            </div>
                          </div>
                          <div className={`font-semibold whitespace-nowrap ${String(m.tipo || '').toLowerCase() === 'saida' ? 'text-red-600' : 'text-green-700'}`}>
                            {String(m.tipo || '').toLowerCase() === 'saida' ? '-' : '+'}
                            {Math.round(Number(m.quantidade || 0))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
                  <div className="font-semibold text-gray-900 mb-3">Lotes (somente leitura)</div>
                  {detailsLotes.length === 0 ? (
                    <div className="text-sm text-gray-500 italic">Nenhum lote registrado.</div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-sm">
                        <thead>
                          <tr className="bg-gray-50 text-gray-500">
                            <th className="px-3 py-2 font-medium">Lote</th>
                            <th className="px-3 py-2 font-medium">Validade</th>
                            <th className="px-3 py-2 font-medium text-right">Quantidade</th>
                            <th className="px-3 py-2 font-medium text-right">Preço Unitário</th>
                            <th className="px-3 py-2 font-medium">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {detailsLotes.map(l => (
                            <tr key={l.id} className="hover:bg-gray-50">
                              <td className="px-3 py-2 font-medium text-gray-900">{l.numero}</td>
                              <td className="px-3 py-2 text-gray-600">{formatDate(l.validade)}</td>
                              <td className="px-3 py-2 text-right text-gray-900">{Math.round(Number(l.quantidade || 0))}</td>
                              <td className="px-3 py-2 text-right text-gray-900">
                                {typeof l.preco_unitario === 'number' && Number.isFinite(l.preco_unitario)
                                  ? l.preco_unitario.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
                                  : '-'}
                              </td>
                              <td className="px-3 py-2">
                                <span
                                  className={`px-2 py-0.5 rounded text-xs font-medium ${
                                    l.status === 'Vencido' ? 'bg-red-100 text-red-700' : l.status === 'Crítico' ? 'bg-yellow-100 text-yellow-700' : 'bg-green-100 text-green-700'
                                  }`}
                                >
                                  {l.status || '-'}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

