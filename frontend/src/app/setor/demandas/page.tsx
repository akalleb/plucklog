'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, AlertCircle, CheckCircle2, Search, ShoppingCart } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { Loading } from '@/components/ui/Page';
import { apiUrl } from '@/lib/api';

type ProdutoResumo = { id: string; nome: string; codigo?: string; unidade?: string; categoria?: string };
type DemandaItem = { produto_id: string; produto_nome: string; produto_codigo: string; quantidade: number; atendido: number; observacao?: string };
type Demanda = { id: string; status: string; created_at?: string | null; items: DemandaItem[] };

type CartItem = { produto_id: string; produto_nome: string; produto_codigo: string; quantidade: string; observacao: string };

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;
const formatDateTime = (value?: string | null) => {
  if (!value) return '';
  const normalized =
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(value) ? `${value}Z` : value;
  return new Date(normalized).toLocaleString('pt-BR');
};

export default function SetorDemandasPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [demandas, setDemandas] = useState<Demanda[]>([]);
  const [destinoTipo, setDestinoTipo] = useState<'almoxarifado' | 'sub_almoxarifado' | 'central'>('almoxarifado');
  const [observacoes, setObservacoes] = useState('');

  const [produtoQuery, setProdutoQuery] = useState('');
  const [produtoResults, setProdutoResults] = useState<ProdutoResumo[]>([]);
  const [produtoSelected, setProdutoSelected] = useState<ProdutoResumo | null>(null);
  const [showProdutoDropdown, setShowProdutoDropdown] = useState(false);
  const [quantidade, setQuantidade] = useState('');
  const [itemObs, setItemObs] = useState('');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [estoqueSetorByProdutoId, setEstoqueSetorByProdutoId] = useState<Record<string, number>>({});
  const searchSeq = useRef(0);

  const refreshDemandas = async (uid: string) => {
    const headers = { 'X-User-Id': uid };
    const res = await fetch(apiUrl('/api/demandas?mine=true&per_page=50'), { headers });
    const data = await res.json().catch(() => ({ items: [] }));
    setDemandas(data.items || []);
  };

  const refreshEstoqueSetor = async (uid: string, setorId: string) => {
    if (!setorId) return;
    const headers = { 'X-User-Id': uid };
    const res = await fetch(apiUrl(`/api/estoque/setor/${encodeURIComponent(setorId)}`), { headers });
    const data = await res.json().catch(() => ({ items: [] }));
    if (!res.ok) throw new Error(data.detail || 'Erro ao carregar estoque do setor');
    const map: Record<string, number> = {};
    const items = isRecord(data) && Array.isArray(data.items) ? data.items : [];
    for (const raw of items) {
      if (!isRecord(raw)) continue;
      const pid = raw.produto_id != null ? String(raw.produto_id) : '';
      if (!pid) continue;
      const disp = Number(raw.quantidade_disponivel ?? 0);
      map[pid] = Number.isFinite(disp) ? disp : 0;
    }
    setEstoqueSetorByProdutoId(map);
  };

  useEffect(() => {
    if (authLoading) return;
    if (!user) return;
    if (user.role !== 'operador_setor') {
      router.replace('/');
      return;
    }
    setLoading(true);
    setError('');
    Promise.all([refreshDemandas(user.id), refreshEstoqueSetor(user.id, user.scope_id || '')])
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Erro ao carregar demandas'))
      .finally(() => setLoading(false));
  }, [authLoading, user, router]);

  useEffect(() => {
    if (!produtoQuery.trim()) {
      setProdutoResults([]);
      return;
    }
    if (!user) return;
    const mySeq = ++searchSeq.current;
    const headers = { 'X-User-Id': user.id };
    const t = setTimeout(() => {
      fetch(apiUrl(`/api/produtos/search?q=${encodeURIComponent(produtoQuery.trim())}`), { headers })
        .then(async r => (r.ok ? r.json() : []))
        .then((data: ProdutoResumo[]) => {
          if (mySeq !== searchSeq.current) return;
          setProdutoResults(data || []);
          setShowProdutoDropdown(true);
        })
        .catch(() => {
          if (mySeq !== searchSeq.current) return;
          setProdutoResults([]);
        });
    }, 250);
    return () => clearTimeout(t);
  }, [produtoQuery, user]);

  const addItem = () => {
    setError('');
    if (!produtoSelected) {
      setError('Selecione um produto');
      return;
    }
    const q = Number(quantidade);
    if (!q || q <= 0 || !Number.isInteger(q)) {
      setError('Quantidade inválida');
      return;
    }
    setCart(prev => {
      if (prev.some(i => i.produto_id === produtoSelected.id)) return prev;
      return [
        ...prev,
        {
          produto_id: produtoSelected.id,
          produto_nome: produtoSelected.nome,
          produto_codigo: produtoSelected.codigo || '-',
          quantidade: String(q),
          observacao: itemObs,
        },
      ];
    });
    setProdutoSelected(null);
    setProdutoQuery('');
    setQuantidade('');
    setItemObs('');
  };

  const removeItem = (produto_id: string) => setCart(prev => prev.filter(i => i.produto_id !== produto_id));

  const enviar = async () => {
    setError('');
    setSuccess('');
    if (!user) return;
    if (cart.length === 0) {
      setError('Adicione pelo menos um item');
      return;
    }
    const items = cart.map(i => ({ produto_id: i.produto_id, quantidade: Number(i.quantidade), observacao: i.observacao || undefined }));
    if (items.some(i => !i.quantidade || i.quantidade <= 0 || !Number.isInteger(i.quantidade))) {
      setError('Há itens com quantidade inválida');
      return;
    }
    setSending(true);
    try {
      const res = await fetch(apiUrl('/api/demandas'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-User-Id': user.id },
        body: JSON.stringify({ destino_tipo: destinoTipo, observacoes: observacoes || undefined, items }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || 'Erro ao enviar demanda');
      setCart([]);
      setObservacoes('');
      setSuccess('Demanda enviada com sucesso');
      await refreshDemandas(user.id);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro ao enviar demanda');
    } finally {
      setSending(false);
    }
  };

  const demandasOrdenadas = useMemo(() => {
    const list = [...demandas];
    list.sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
    return list;
  }, [demandas]);

  if (authLoading) return null;
  if (!user) return null;

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="mb-6 flex items-center justify-between gap-3">
        <button type="button" onClick={() => router.push('/setor')} className="flex items-center gap-2 text-gray-600 hover:text-green-700">
          <ArrowLeft className="h-4 w-4" /> Voltar
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
          <div className="flex items-center gap-2 font-semibold text-gray-900 mb-4">
            <ShoppingCart className="h-5 w-5 text-green-600" /> Nova Demanda
          </div>

          {error && (
            <div className="mb-4 bg-red-50 text-red-700 p-4 rounded-lg flex items-center gap-2 text-sm">
              <AlertCircle className="h-4 w-4" /> {error}
            </div>
          )}
          {success && (
            <div className="mb-4 bg-green-50 text-green-700 p-4 rounded-lg flex items-center gap-2 text-sm">
              <CheckCircle2 className="h-4 w-4" /> {success}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Destino</label>
              <select
                value={destinoTipo}
                onChange={e => {
                  const v = e.target.value;
                  if (v === 'almoxarifado' || v === 'sub_almoxarifado' || v === 'central') setDestinoTipo(v);
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 outline-none bg-white"
              >
                <option value="almoxarifado">Almoxarifado</option>
                <option value="sub_almoxarifado">Sub-Almoxarifado</option>
                <option value="central">Central</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Observações</label>
              <input
                value={observacoes}
                onChange={e => setObservacoes(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 outline-none"
                placeholder="Opcional"
              />
            </div>
          </div>

          <div className="mt-5">
            <label className="block text-sm font-medium text-gray-700 mb-1">Produto</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                value={produtoQuery}
                onFocus={() => setShowProdutoDropdown(true)}
                onBlur={() => setTimeout(() => setShowProdutoDropdown(false), 150)}
                onChange={e => {
                  setProdutoQuery(e.target.value);
                  setProdutoSelected(null);
                }}
                placeholder="Buscar por nome/código..."
                className="w-full pl-10 pr-4 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-green-500 outline-none"
              />
              {showProdutoDropdown && produtoResults.length > 0 && (
                <div className="absolute z-20 mt-2 w-full bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
                  {produtoResults.slice(0, 10).map(p => (
                    <button
                      type="button"
                      key={p.id}
                      className="w-full text-left px-3 py-2 hover:bg-gray-50"
                      onClick={() => {
                        setProdutoSelected(p);
                        setProdutoQuery(`${p.nome}${p.codigo ? ` (${p.codigo})` : ''}`);
                        setShowProdutoDropdown(false);
                      }}
                    >
                      <div className="text-sm font-medium text-gray-900">{p.nome}</div>
                      <div className="text-xs text-gray-500 flex flex-wrap gap-x-2 gap-y-1">
                        {p.codigo && <span>Cód: {p.codigo}</span>}
                        {p.unidade && <span>Un: {p.unidade}</span>}
                        {p.categoria && <span>Cat: {p.categoria}</span>}
                        <span className="text-gray-600">Em estoque: {Math.round(Number(estoqueSetorByProdutoId[String(p.id)] || 0))}</span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
            {produtoSelected && (
              <div className="mt-2 text-xs text-gray-500">
                Selecionado: {produtoSelected.nome} · Em estoque no setor: {Math.round(Number(estoqueSetorByProdutoId[String(produtoSelected.id)] || 0))}
              </div>
            )}
          </div>

          <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Quantidade</label>
              <input
                type="number"
                min="1"
                step="1"
                value={quantidade}
                onChange={e => setQuantidade(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 outline-none"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Observação do item</label>
              <input
                value={itemObs}
                onChange={e => setItemObs(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 outline-none"
                placeholder="Opcional"
              />
            </div>
          </div>

          <div className="mt-4 flex justify-between items-center gap-3">
            <button type="button" onClick={addItem} className="px-4 py-2 rounded-lg bg-white border border-gray-300 text-gray-700 hover:bg-gray-50">
              Adicionar item
            </button>
            <button
              type="button"
              onClick={enviar}
              disabled={sending || cart.length === 0}
              className="px-4 py-2 rounded-lg bg-green-600 text-white font-medium hover:bg-green-700 disabled:opacity-50"
            >
              {sending ? 'Enviando...' : `Enviar (${cart.length})`}
            </button>
          </div>

          {cart.length > 0 && (
            <div className="mt-5 rounded-xl border border-gray-200 overflow-hidden">
              <div className="bg-gray-50 px-4 py-2 text-sm font-medium text-gray-700">Itens</div>
              <div className="divide-y divide-gray-100">
                {cart.map(i => (
                  <div key={i.produto_id} className="p-4 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-medium text-gray-900 truncate">{i.produto_nome}</div>
                      <div className="text-xs text-gray-500">{i.produto_codigo}</div>
                      <div className="text-xs text-gray-500 mt-1">Qtd: {i.quantidade}</div>
                      <div className="text-xs text-gray-600 mt-1">Em estoque no setor: {Math.round(Number(estoqueSetorByProdutoId[String(i.produto_id)] || 0))}</div>
                      {i.observacao && <div className="text-xs text-gray-500 mt-1">Obs: {i.observacao}</div>}
                    </div>
                    <button type="button" onClick={() => removeItem(i.produto_id)} className="text-sm text-red-600 hover:underline">
                      Remover
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
          <div className="font-semibold text-gray-900 mb-4">Minhas Demandas</div>
          {loading ? (
            <Loading size="sm" className="items-start text-left" />
          ) : demandasOrdenadas.length === 0 ? (
            <div className="text-gray-500">Nenhuma demanda encontrada.</div>
          ) : (
            <div className="space-y-3">
              {demandasOrdenadas.slice(0, 20).map(d => (
                <div key={d.id} className="rounded-xl border border-gray-200 p-4">
                  <div className="flex items-center justify-between">
                    <div className="font-semibold text-gray-900">#{d.id.slice(0, 8)}</div>
                    <div className="text-xs text-gray-600 capitalize">{d.status}</div>
                  </div>
                  <div className="text-xs text-gray-500 mt-1">{d.created_at ? formatDateTime(d.created_at) : ''}</div>
                  <div className="mt-3 space-y-2">
                    {(d.items || []).slice(0, 5).map((it, idx) => (
                      <div key={`${d.id}:${idx}`} className="text-sm text-gray-800 flex items-center justify-between gap-2">
                        <span className="truncate">{it.produto_nome}</span>
                        <span className="text-xs text-gray-600">
                          {Math.round(Number(it.atendido || 0))}/{Math.round(Number(it.quantidade || 0))}
                        </span>
                      </div>
                    ))}
                    {(d.items || []).length > 5 && <div className="text-xs text-gray-500">+{(d.items || []).length - 5} itens</div>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

