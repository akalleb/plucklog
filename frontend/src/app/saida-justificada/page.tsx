'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, ArrowLeftRight, CheckCircle2, Search } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { Page } from '@/components/ui/Page';
import { apiUrl } from '@/lib/api';

interface ProdutoResumo {
  id: string;
  nome?: string;
  codigo?: string;
  unidade?: string;
  categoria?: string;
}

interface ProdutoDetalhes {
  id: string;
  nome: string;
  codigo: string;
  unidade?: string;
  categoria?: string;
  estoque_locais: Array<{
    local_id?: string | null;
    local_nome: string;
    local_tipo: string;
    quantidade: number;
    quantidade_disponivel?: number;
  }>;
}

interface SubAlmoxarifado {
  id: string;
  nome: string;
  almoxarifado_id?: string;
}

const toLocalDateTimeInput = (d: Date) => {
  const tzOffsetMs = d.getTimezoneOffset() * 60 * 1000;
  return new Date(d.getTime() - tzOffsetMs).toISOString().slice(0, 16);
};

export default function SaidaJustificadaPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();

  const [subAlmoxarifados, setSubAlmoxarifados] = useState<SubAlmoxarifado[]>([]);
  const subById = useMemo(() => new Map(subAlmoxarifados.map(s => [s.id, s])), [subAlmoxarifados]);

  const [produtoQuery, setProdutoQuery] = useState('');
  const [produtoResults, setProdutoResults] = useState<ProdutoResumo[]>([]);
  const [produtoSelected, setProdutoSelected] = useState<ProdutoResumo | null>(null);
  const [produtoDetalhes, setProdutoDetalhes] = useState<ProdutoDetalhes | null>(null);
  const [searching, setSearching] = useState(false);
  const [showProdutoDropdown, setShowProdutoDropdown] = useState(false);
  const searchSeq = useRef(0);

  const [origemTipo, setOrigemTipo] = useState<'almoxarifado' | 'sub_almoxarifado'>('almoxarifado');
  const [origemId, setOrigemId] = useState('');
  const [quantidade, setQuantidade] = useState('');
  const [justificativa, setJustificativa] = useState('');
  const [dataMov, setDataMov] = useState(() => toLocalDateTimeInput(new Date()));

  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    if (authLoading) return;
    if (!user?.id) {
      router.replace('/login');
      return;
    }
    if (!['super_admin', 'admin_central', 'gerente_almox', 'resp_sub_almox'].includes(user.role)) {
      router.replace('/');
      return;
    }
    fetch(apiUrl('/api/sub_almoxarifados'), { headers: { 'X-User-Id': user.id } })
      .then(r => (r.ok ? r.json() : []))
      .then(setSubAlmoxarifados)
      .catch(() => setSubAlmoxarifados([]));
  }, [authLoading, router, user?.id, user?.role]);

  useEffect(() => {
    if (!produtoQuery.trim()) {
      setProdutoResults([]);
      setSearching(false);
      return;
    }
    if (!user?.id) return;
    const mySeq = ++searchSeq.current;
    setSearching(true);
    const t = setTimeout(() => {
      fetch(apiUrl(`/api/produtos/search?q=${encodeURIComponent(produtoQuery.trim())}`), {
        headers: { 'X-User-Id': user.id }
      })
        .then(async r => (r.ok ? r.json() : []))
        .then((data: ProdutoResumo[]) => {
          if (mySeq !== searchSeq.current) return;
          setProdutoResults(Array.isArray(data) ? data : []);
          setShowProdutoDropdown(true);
        })
        .catch(() => {
          if (mySeq !== searchSeq.current) return;
          setProdutoResults([]);
        })
        .finally(() => {
          if (mySeq !== searchSeq.current) return;
          setSearching(false);
        });
    }, 250);
    return () => clearTimeout(t);
  }, [produtoQuery, user?.id]);

  useEffect(() => {
    if (!produtoSelected) {
      setProdutoDetalhes(null);
      return;
    }
    if (!user?.id) return;
    fetch(apiUrl(`/api/produtos/${encodeURIComponent(produtoSelected.id)}`), { headers: { 'X-User-Id': user.id } })
      .then(async r => (r.ok ? r.json() : null))
      .then((data: ProdutoDetalhes | null) => setProdutoDetalhes(data))
      .catch(() => setProdutoDetalhes(null));
  }, [produtoSelected, user?.id]);

  const origensDisponiveis = useMemo(() => {
    const items = produtoDetalhes?.estoque_locais || [];
    const base = items
      .map(i => ({
        ...i,
        local_id: i.local_id ? String(i.local_id) : '',
        quantidade_disponivel: typeof i.quantidade_disponivel === 'number' ? i.quantidade_disponivel : i.quantidade,
        local_tipo: (i.local_tipo || '').trim(),
      }))
      .filter(i => (i.local_tipo === 'almoxarifado' || i.local_tipo === 'sub_almoxarifado') && (i.quantidade_disponivel || 0) > 0 && i.local_id);

    if (!user) return [];
    if (user.role === 'super_admin') return base;
    const scopeId = user.scope_id || '';
    if (!scopeId) return [];

    const isAllowed = (tipo: string, id: string) => {
      if (user.role === 'resp_sub_almox') return tipo === 'sub_almoxarifado' && id === scopeId;
      if (user.role === 'gerente_almox') {
        if (tipo === 'almoxarifado') return id === scopeId;
        if (tipo === 'sub_almoxarifado') {
          const sub = subById.get(id);
          return !!sub?.almoxarifado_id && sub.almoxarifado_id === scopeId;
        }
        return false;
      }
      if (user.role === 'admin_central') return tipo === 'almoxarifado' || tipo === 'sub_almoxarifado';
      return false;
    };

    return base.filter(o => isAllowed(o.local_tipo, o.local_id || ''));
  }, [produtoDetalhes, subById, user]);

  const origemSelecionada = useMemo(() => {
    if (!origemId) return null;
    return origensDisponiveis.find(o => o.local_tipo === origemTipo && o.local_id === origemId) || null;
  }, [origensDisponiveis, origemId, origemTipo]);

  useEffect(() => {
    if (!origemSelecionada) return;
    setOrigemTipo(origemSelecionada.local_tipo as 'almoxarifado' | 'sub_almoxarifado');
    setOrigemId(origemSelecionada.local_id || '');
  }, [origemSelecionada]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    if (!user?.id) return;
    if (!produtoSelected) {
      setError('Selecione um produto');
      return;
    }
    if (!origemId) {
      setError('Selecione a origem');
      return;
    }
    const q = Number(quantidade);
    if (!q || q <= 0 || !Number.isInteger(q)) {
      setError('Quantidade inválida');
      return;
    }
    const max = Number(origemSelecionada?.quantidade_disponivel || 0);
    if (q > max) {
      setError('Quantidade maior que o disponível na origem');
      return;
    }
    const j = justificativa.trim();
    if (!j) {
      setError('Justificativa é obrigatória');
      return;
    }

    setSending(true);
    try {
      const payload: Record<string, unknown> = {
        produto_id: produtoSelected.id,
        origem_tipo: origemTipo,
        origem_id: origemId,
        quantidade: q,
        justificativa: j,
      };
      if (dataMov) {
        payload.data_movimentacao = new Date(dataMov).toISOString();
      }
      const res = await fetch(apiUrl('/api/movimentacoes/saida_justificada'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-User-Id': user.id },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || 'Erro ao registrar saída justificada');

      if (produtoSelected) {
        const refreshed = await fetch(apiUrl(`/api/produtos/${encodeURIComponent(produtoSelected.id)}`), { headers: { 'X-User-Id': user.id } })
          .then(r => (r.ok ? r.json() : null))
          .catch(() => null);
        if (refreshed) setProdutoDetalhes(refreshed);
      }
      setQuantidade('');
      setJustificativa('');
      setSuccess('Saída justificada registrada com sucesso');
    } catch (e2: unknown) {
      setError(e2 instanceof Error ? e2.message : 'Erro ao registrar saída justificada');
    } finally {
      setSending(false);
    }
  };

  if (authLoading) return null;
  if (!user) return null;

  return (
    <Page width="lg">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <ArrowLeftRight className="h-6 w-6 text-orange-600" />
          Saída Justificada
        </h1>
        <p className="text-gray-500 mt-1">Registre saídas sem destino interno com justificativa obrigatória.</p>
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

      <div className="soft-card p-6">
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Produto</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                value={produtoQuery}
                onChange={e => {
                  setProdutoQuery(e.target.value);
                  setProdutoSelected(null);
                  setProdutoDetalhes(null);
                  setOrigemId('');
                }}
                onFocus={() => setShowProdutoDropdown(true)}
                onBlur={() => setTimeout(() => setShowProdutoDropdown(false), 150)}
                placeholder="Buscar por nome ou código..."
                className="soft-input w-full pl-10 pr-4 py-2 outline-none"
              />
              {showProdutoDropdown && (produtoResults.length > 0 || searching) && (
                <div className="absolute z-10 mt-1 w-full soft-card max-h-64 overflow-auto">
                  {searching ? (
                    <div className="px-3 py-2 text-sm text-gray-500">Buscando...</div>
                  ) : (
                    produtoResults.map(p => (
                      <button
                        key={p.id}
                        type="button"
                        className="w-full text-left px-3 py-2 hover:bg-gray-50"
                        onMouseDown={e => e.preventDefault()}
                        onClick={() => {
                          setProdutoSelected(p);
                          setProdutoQuery(`${p.nome || 'Produto'} (${p.codigo || p.id})`);
                          setShowProdutoDropdown(false);
                        }}
                      >
                        <div className="text-sm text-gray-900">{p.nome || 'Produto sem nome'}</div>
                        <div className="text-xs text-gray-500">{p.codigo || p.id}</div>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Origem</label>
            <select
              value={origemId ? `${origemTipo}:${origemId}` : ''}
              onChange={e => {
                const [t, id] = e.target.value.split(':');
                setOrigemTipo(t as 'almoxarifado' | 'sub_almoxarifado');
                setOrigemId(id || '');
              }}
              className="soft-input w-full px-3 py-2 outline-none"
            >
              <option value="">Selecione</option>
              {origensDisponiveis.map(o => (
                <option key={`${o.local_tipo}:${o.local_id}`} value={`${o.local_tipo}:${o.local_id}`}>
                  {o.local_nome} ({o.local_tipo}) - Disp: {Math.round(Number(o.quantidade_disponivel || 0))}
                </option>
              ))}
            </select>
            {produtoSelected && origensDisponiveis.length === 0 && (
              <div className="text-xs text-gray-500 mt-1">Sem estoque disponível nas origens que você pode usar.</div>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Data e hora</label>
            <input
              type="datetime-local"
              value={dataMov}
              onChange={e => setDataMov(e.target.value)}
              className="soft-input w-full px-3 py-2 outline-none"
            />
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
            {origemSelecionada && (
              <div className="text-xs text-gray-500 mt-1">
                Disponível na origem: {Math.round(Number(origemSelecionada.quantidade_disponivel || 0))}
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Justificativa</label>
            <textarea
              value={justificativa}
              onChange={e => setJustificativa(e.target.value)}
              className="soft-input w-full px-3 py-2 outline-none min-h-24"
              placeholder="Obrigatório"
            />
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={sending}
              className="soft-btn px-4 py-2 bg-orange-600 text-white border-orange-500/30 hover:bg-orange-700 disabled:opacity-50"
            >
              {sending ? 'Registrando...' : 'Registrar Saída'}
            </button>
          </div>
        </form>
      </div>
    </Page>
  );
}
