'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ArrowLeftRight, AlertCircle, CheckCircle2 } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { Loading } from '@/components/ui/Page';
import { apiUrl } from '@/lib/api';

type EstoqueItem = { produto_id: string; produto_nome: string; produto_codigo: string; quantidade_disponivel: number };
type SetorInfo = { id: string; nome: string };

export default function SetorConsumoPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [setor, setSetor] = useState<SetorInfo | null>(null);
  const [items, setItems] = useState<EstoqueItem[]>([]);
  const [produtoId, setProdutoId] = useState('');
  const [produtoQuery, setProdutoQuery] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [quantidade, setQuantidade] = useState('');
  const [observacoes, setObservacoes] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const selected = useMemo(() => items.find(i => i.produto_id === produtoId) || null, [items, produtoId]);
  const suggestions = useMemo(() => {
    const q = (produtoQuery || '').trim().toLowerCase();
    const base = items.filter(i => (i.quantidade_disponivel || 0) > 0);
    if (!q) return base.slice(0, 12);
    return base
      .filter(i => {
        const nome = (i.produto_nome || '').toLowerCase();
        const codigo = (i.produto_codigo || '').toLowerCase();
        return nome.includes(q) || codigo.includes(q);
      })
      .slice(0, 12);
  }, [items, produtoQuery]);

  const refresh = async (u: { id: string; scope_id: string }) => {
    const headers = { 'X-User-Id': u.id };
    const [s, est] = await Promise.all([
      fetch(apiUrl(`/api/setores/${encodeURIComponent(u.scope_id)}`), { headers }).then(r => (r.ok ? r.json() : null)),
      fetch(apiUrl(`/api/estoque/setor/${encodeURIComponent(u.scope_id)}`), { headers }).then(r => (r.ok ? r.json() : { items: [] })),
    ]);
    if (!s) throw new Error('Setor não encontrado');
    setSetor(s);
    setItems(est.items || []);
  };

  useEffect(() => {
    if (authLoading) return;
    if (!user) return;
    if (user.role !== 'operador_setor') {
      router.replace('/');
      return;
    }
    if (!user.scope_id) {
      setError('Usuário sem setor associado');
      setLoading(false);
      return;
    }
    setLoading(true);
    refresh({ id: user.id, scope_id: user.scope_id })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Erro ao carregar'))
      .finally(() => setLoading(false));
  }, [authLoading, user, router]);

  useEffect(() => {
    if (!produtoId) return;
    if (!selected) return;
    setProdutoQuery(`${selected.produto_nome} (${selected.produto_codigo})`);
  }, [produtoId, selected]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    if (!user) return;
    if (!user.scope_id) return;
    const q = Number(quantidade);
    if (!produtoId) {
      setError('Selecione um produto');
      return;
    }
    if (!q || q <= 0 || !Number.isInteger(q)) {
      setError('Quantidade inválida');
      return;
    }
    if (selected && q > (selected.quantidade_disponivel || 0)) {
      setError('Quantidade maior que o disponível');
      return;
    }
    setSending(true);
    try {
      const res = await fetch(apiUrl('/api/movimentacoes/consumo'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-User-Id': user.id },
        body: JSON.stringify({ produto_id: produtoId, quantidade: q, observacoes: observacoes || undefined }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || 'Erro ao registrar consumo');
      await refresh({ id: user.id, scope_id: user.scope_id });
      setQuantidade('');
      setObservacoes('');
      setSuccess('Consumo registrado com sucesso');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro ao registrar consumo');
    } finally {
      setSending(false);
    }
  };

  if (authLoading) return null;
  if (!user) return null;

  return (
    <div className="p-8 max-w-3xl mx-auto">
      <div className="mb-6 flex items-center justify-between gap-3">
        <button type="button" onClick={() => router.push('/setor')} className="flex items-center gap-2 text-gray-600 hover:text-orange-700">
          <ArrowLeft className="h-4 w-4" /> Voltar
        </button>
        <div className="text-right">
          <div className="text-sm text-gray-500">Setor</div>
          <div className="font-semibold text-gray-900">{setor?.nome || '-'}</div>
        </div>
      </div>

      <div className="soft-card p-6">
        <div className="flex items-center gap-2 font-semibold text-gray-900 mb-4">
          <ArrowLeftRight className="h-5 w-5 text-orange-600" /> Registrar Consumo
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

        {loading ? (
          <Loading size="sm" className="items-start text-left" />
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Produto</label>
              <div className="relative">
                <input
                  value={produtoQuery}
                  onChange={e => {
                    setProdutoQuery(e.target.value);
                    setProdutoId('');
                    setShowSuggestions(true);
                  }}
                  onFocus={() => setShowSuggestions(true)}
                  onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
                  className="soft-input w-full px-3 py-2 outline-none"
                  placeholder="Buscar por nome ou código..."
                />
                {showSuggestions && (
                  <div className="absolute z-10 mt-1 w-full soft-card max-h-64 overflow-auto">
                    {suggestions.length === 0 ? (
                      <div className="px-3 py-2 text-sm text-gray-500">Nenhum produto encontrado.</div>
                    ) : (
                      suggestions.map(i => (
                        <button
                          key={i.produto_id}
                          type="button"
                          className="w-full text-left px-3 py-2 hover:bg-gray-50"
                          onMouseDown={e => e.preventDefault()}
                          onClick={() => {
                            setProdutoId(i.produto_id);
                            setProdutoQuery(`${i.produto_nome} (${i.produto_codigo})`);
                            setShowSuggestions(false);
                          }}
                        >
                          <div className="text-sm text-gray-900">
                            {i.produto_nome} <span className="text-gray-500">({i.produto_codigo})</span>
                          </div>
                          <div className="text-xs text-gray-500">
                            Disponível: {Math.round(Number(i.quantidade_disponivel || 0))}
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
              {items.length === 0 && <div className="text-xs text-gray-500 mt-1">Nenhum produto disponível no setor.</div>}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Quantidade</label>
              <input
                type="number"
                min="0"
                step="1"
                value={quantidade}
                onChange={e => setQuantidade(e.target.value)}
                className="soft-input w-full px-3 py-2 outline-none"
                placeholder="0"
              />
              {selected && <div className="text-xs text-gray-500 mt-1">Disponível: {Math.round(Number(selected.quantidade_disponivel || 0))}</div>}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Observações</label>
              <input
                type="text"
                value={observacoes}
                onChange={e => setObservacoes(e.target.value)}
                className="soft-input w-full px-3 py-2 outline-none"
                placeholder="Opcional"
              />
            </div>

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={sending}
                className="soft-btn px-4 py-2 bg-orange-600 text-white border-orange-500/30 hover:bg-orange-700 disabled:opacity-50"
              >
                {sending ? 'Registrando...' : 'Registrar'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
