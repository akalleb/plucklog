'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, CheckCircle2, Filter, Search, ShoppingCart, Trash2 } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { Loading, Page } from '@/components/ui/Page';
import { apiUrl, apiFetch } from '@/lib/api';

type DemandaItem = {
  produto_id: string;
  produto_nome?: string;
  produto_codigo?: string;
  quantidade: number;
  atendido: number;
  observacao?: string;
};

type DemandaResumo = {
  id: string;
  setor_id?: string | null;
  setor_nome?: string | null;
  destino_tipo?: string | null;
  status: string;
  observacoes?: string | null;
  items: DemandaItem[];
  created_at?: string | null;
  updated_at?: string | null;
};

type StatusFilter = 'pendente' | 'parcial' | 'atendido' | 'todas';

type ProdutoInfo = { id: string; nome?: string; codigo?: string };

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

const statusColor = (status: string) => {
  const s = (status || '').toLowerCase();
  if (s === 'atendido') return 'bg-green-50 text-green-700';
  if (s === 'parcial') return 'bg-orange-50 text-orange-700';
  return 'bg-gray-100 text-gray-700';
};

export default function DemandasPage() {
  const router = useRouter();
  const { user, loading: authLoading, canAccess } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [status, setStatus] = useState<StatusFilter>('pendente');
  const [demandas, setDemandas] = useState<DemandaResumo[]>([]);
  const [produtoById, setProdutoById] = useState<Record<string, ProdutoInfo>>({});
  const [estoqueSetorBySetorId, setEstoqueSetorBySetorId] = useState<Record<string, Record<string, number>>>({});
  const [query, setQuery] = useState('');
  const loadSeq = useRef(0);
  const estoqueSeq = useRef(0);

  const formatDateTime = (value?: string | null) => {
    if (!value) return '';
    const normalized =
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(value) ? `${value}Z` : value;
    return new Date(normalized).toLocaleString('pt-BR');
  };

  const mergeProdutos = useCallback((incoming: Record<string, ProdutoInfo>) => {
    setProdutoById(prev => {
      const next: Record<string, ProdutoInfo> = { ...prev };
      for (const [pid, info] of Object.entries(incoming)) {
        const prevInfo = next[pid];
        const prevNome = prevInfo?.nome;
        const prevCodigo = prevInfo?.codigo;
        const nextNome = info?.nome;
        const nextCodigo = info?.codigo;

        const prevNomeIsPlaceholder = !prevNome || prevNome === pid;
        const nextNomeIsReal = !!nextNome && nextNome !== pid;
        const nextCodigoIsReal = !!nextCodigo && nextCodigo !== '-';

        if (!prevInfo) {
          next[pid] = { id: pid, nome: nextNome || pid, codigo: nextCodigo || '-' };
          continue;
        }

        const nome = nextNomeIsReal ? nextNome : prevNome;
        const codigo = nextCodigoIsReal ? nextCodigo : prevCodigo;
        if ((nextNomeIsReal && nome !== prevNome) || (prevNomeIsPlaceholder && nome && nome !== pid)) next[pid] = { ...prevInfo, id: pid, nome, codigo };
        else if (nextCodigoIsReal && codigo !== prevCodigo) next[pid] = { ...prevInfo, id: pid, nome, codigo };
      }
      return next;
    });
  }, []);

  const loadProdutoInfo = useCallback(async (_uid: string, produtoId: string) => {
    const res = await apiFetch(`/api/produtos/${encodeURIComponent(produtoId)}`);
    const data: unknown = await res.json().catch(() => ({}));
    if (!res.ok) return { id: produtoId, nome: produtoId, codigo: '-' };
    if (!isRecord(data)) return { id: produtoId, nome: produtoId, codigo: '-' };
    const nome = typeof data.nome === 'string' ? data.nome : produtoId;
    const codigo = typeof data.codigo === 'string' ? data.codigo : '-';
    return { id: produtoId, nome, codigo };
  }, []);

  const loadEstoqueSetor = useCallback(
    async (_uid: string, setorId: string) => {
      const res = await apiFetch(`/api/estoque/setor/${encodeURIComponent(setorId)}`);
      const data: unknown = await res.json().catch(() => ({ items: [] }));
      if (!res.ok) return { setorId, map: {} as Record<string, number>, infoMap: {} as Record<string, ProdutoInfo> };
      const map: Record<string, number> = {};
      const infoMap: Record<string, ProdutoInfo> = {};
      const items = isRecord(data) && Array.isArray(data.items) ? data.items : [];
      for (const raw of items) {
        if (!isRecord(raw)) continue;
        const pid = raw.produto_id != null ? String(raw.produto_id) : '';
        if (!pid) continue;
        const disp = Number(raw.quantidade_disponivel ?? 0);
        map[pid] = Number.isFinite(disp) ? disp : 0;
        const nome = raw.produto_nome != null ? String(raw.produto_nome) : '';
        const codigo = raw.produto_codigo != null ? String(raw.produto_codigo) : '';
        if (nome.trim()) infoMap[pid] = { id: pid, nome: nome.trim(), codigo: codigo.trim() || '-' };
      }
      return { setorId, map, infoMap };
    },
    []
  );

  const refresh = useCallback(async (uid: string, selectedStatus: string) => {
    const qs = new URLSearchParams({ per_page: '50', page: '1' });
    if (selectedStatus !== 'todas') qs.set('status', selectedStatus);
    const res = await apiFetch(`/api/demandas?${qs.toString()}`);
    const data = await res.json().catch(() => ({ items: [] }));
    if (!res.ok) throw new Error(data.detail || 'Erro ao carregar demandas');
    const items: unknown[] = Array.isArray(data.items) ? data.items : [];
    setDemandas(items as DemandaResumo[]);
    const infoMap: Record<string, ProdutoInfo> = {};
    for (const d of items) {
      const rec = isRecord(d) ? d : {};
      const list = Array.isArray(rec.items) ? rec.items : [];
      for (const it of list) {
        if (!isRecord(it)) continue;
        const pid = it.produto_id != null ? String(it.produto_id) : '';
        if (!pid) continue;
        const nome = it.produto_nome != null ? String(it.produto_nome) : '';
        const codigo = it.produto_codigo != null ? String(it.produto_codigo) : '';
        if (nome.trim()) infoMap[pid] = { id: pid, nome: nome.trim(), codigo: codigo.trim() || '-' };
      }
    }
    mergeProdutos(infoMap);
  }, [mergeProdutos]);

  const handleDelete = async (demanda: DemandaResumo) => {
    if (!user) return;
    setError('');
    setSuccess('');

    const ok = window.confirm(`Excluir a demanda #${demanda.id.slice(0, 10)}?`);
    if (!ok) return;

    setDeletingId(demanda.id);
    try {
      const res = await apiFetch(`/api/demandas/${demanda.id}`, { method: 'DELETE' });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error((data && typeof data.detail === 'string' && data.detail) || 'Erro ao excluir demanda');
      setDemandas(prev => prev.filter(d => d.id !== demanda.id));
      setSuccess('Demanda excluída com sucesso');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro ao excluir demanda');
    } finally {
      setDeletingId(null);
    }
  };

  useEffect(() => {
    if (authLoading) return;
    if (!user) return;
    if (!canAccess(['super_admin', 'admin_central', 'gerente_almox', 'resp_sub_almox'])) {
      router.replace('/');
      return;
    }
    Promise.resolve().then(() => {
      setLoading(true);
      setError('');
      refresh(user.id, status)
        .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Erro ao carregar demandas'))
        .finally(() => setLoading(false));
    });
  }, [authLoading, user, router, canAccess, status, refresh]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) return;
    if (loading) return;
    const mySeq = ++loadSeq.current;

    const missing = new Set<string>();
    for (const d of demandas) {
      for (const it of d.items || []) {
        const pid = String(it.produto_id || '');
        if (!pid) continue;
        const existing = produtoById[pid];
        const hasRealName = !!existing?.nome && existing.nome !== pid;
        const hasInlineName = !!it.produto_nome && it.produto_nome !== pid;
        if (!hasRealName && !hasInlineName) missing.add(pid);
      }
    }

    if (missing.size === 0) return;
    const ids = Array.from(missing);
    const concurrency = 6;

    (async () => {
      for (let i = 0; i < ids.length; i += concurrency) {
        if (mySeq !== loadSeq.current) return;
        const chunk = ids.slice(i, i + concurrency);
        const infos = await Promise.all(chunk.map(pid => loadProdutoInfo(user.id, pid)));
        if (mySeq !== loadSeq.current) return;
        const map: Record<string, ProdutoInfo> = {};
        for (const info of infos) map[info.id] = info;
        mergeProdutos(map);
      }
    })().catch(() => {});
  }, [authLoading, user, loading, demandas, produtoById, loadProdutoInfo, mergeProdutos]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) return;
    if (loading) return;
    const mySeq = ++estoqueSeq.current;

    const missing = new Set<string>();
    for (const d of demandas) {
      const sid = d.setor_id != null ? String(d.setor_id) : '';
      if (!sid) continue;
      if (!estoqueSetorBySetorId[sid]) missing.add(sid);
    }
    if (missing.size === 0) return;

    const ids = Array.from(missing);
    const concurrency = 4;

    (async () => {
      for (let i = 0; i < ids.length; i += concurrency) {
        if (mySeq !== estoqueSeq.current) return;
        const chunk = ids.slice(i, i + concurrency);
        const results = await Promise.all(chunk.map(sid => loadEstoqueSetor(user.id, sid)));
        if (mySeq !== estoqueSeq.current) return;

        const nextSetores: Record<string, Record<string, number>> = {};
        const nextProdutos: Record<string, ProdutoInfo> = {};
        for (const r of results) {
          nextSetores[r.setorId] = r.map;
          for (const [pid, info] of Object.entries(r.infoMap)) nextProdutos[pid] = info;
        }
        setEstoqueSetorBySetorId(prev => ({ ...prev, ...nextSetores }));
        if (Object.keys(nextProdutos).length) mergeProdutos(nextProdutos);
      }
    })().catch(() => {});
  }, [authLoading, user, loading, demandas, estoqueSetorBySetorId, loadEstoqueSetor, mergeProdutos]);

  const demandasOrdenadas = useMemo(() => {
    const list = [...demandas];
    list.sort((a, b) => String(b.updated_at || b.created_at || '').localeCompare(String(a.updated_at || a.created_at || '')));
    return list;
  }, [demandas]);

  const demandasFiltradas = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return demandasOrdenadas;
    return demandasOrdenadas.filter(d => {
      const idMatch = String(d.id || '').toLowerCase().includes(q);
      const setorMatch = String(d.setor_nome || d.setor_id || '').toLowerCase().includes(q);
      const statusMatch = String(d.status || '').toLowerCase().includes(q);
      if (idMatch || setorMatch || statusMatch) return true;
      for (const it of d.items || []) {
        const pid = String(it.produto_id || '');
        const info = produtoById[pid];
        const nome = String(it.produto_nome || info?.nome || '').toLowerCase();
        const codigo = String(it.produto_codigo || info?.codigo || '').toLowerCase();
        if (nome.includes(q) || codigo.includes(q)) return true;
      }
      return false;
    });
  }, [demandasOrdenadas, produtoById, query]);

  const resumo = useMemo(() => {
    const counts = { pendente: 0, parcial: 0, atendido: 0, total: 0 };
    let restanteTotal = 0;
    let enviadoTotal = 0;
    let solicitadoTotal = 0;
    for (const d of demandas) {
      const st = String(d.status || '').toLowerCase();
      if (st === 'pendente') counts.pendente += 1;
      else if (st === 'parcial') counts.parcial += 1;
      else if (st === 'atendido') counts.atendido += 1;
      counts.total += 1;
      for (const it of d.items || []) {
        const sol = Number(it.quantidade || 0);
        const ate = Number(it.atendido || 0);
        solicitadoTotal += sol;
        enviadoTotal += ate;
        restanteTotal += Math.max(0, sol - ate);
      }
    }
    return { counts, solicitadoTotal, enviadoTotal, restanteTotal };
  }, [demandas]);

  if (authLoading) return null;
  if (!user) return null;

  return (
    <Page width="lg">
      <div className="mb-6 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 font-semibold text-gray-900">
          <ShoppingCart className="h-5 w-5 text-blue-600" /> Demandas (Gestão)
        </div>
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

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
        <div className="soft-ui-card p-5">
          <div className="text-xs text-gray-500">Pendentes</div>
          <div className="text-2xl font-bold text-gray-900">{resumo.counts.pendente}</div>
        </div>
        <div className="soft-ui-card p-5">
          <div className="text-xs text-gray-500">Parciais</div>
          <div className="text-2xl font-bold text-gray-900">{resumo.counts.parcial}</div>
        </div>
        <div className="soft-ui-card p-5">
          <div className="text-xs text-gray-500">Atendidas</div>
          <div className="text-2xl font-bold text-gray-900">{resumo.counts.atendido}</div>
        </div>
        <div className="soft-ui-card p-5">
          <div className="text-xs text-gray-500">Restante total</div>
          <div className="text-2xl font-bold text-gray-900">{Math.round(resumo.restanteTotal)}</div>
          <div className="text-xs text-gray-500 mt-1">Atendido {Math.round(resumo.enviadoTotal)}/{Math.round(resumo.solicitadoTotal)}</div>
        </div>
      </div>

      <div className="soft-ui-card p-5">
        <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="flex items-center gap-2 text-sm text-gray-700">
              <Filter className="h-4 w-4" />
              <span className="font-medium">Status</span>
            </div>
            <select
              value={status}
              onChange={e => {
                setError('');
                setSuccess('');
                const v = e.target.value;
                if (v === 'pendente' || v === 'parcial' || v === 'atendido' || v === 'todas') setStatus(v);
              }}
              className="w-full sm:w-56 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white"
            >
              <option value="pendente">Pendente</option>
              <option value="parcial">Parcial</option>
              <option value="atendido">Atendido</option>
              <option value="todas">Todas</option>
            </select>
          </div>

          <div className="relative w-full lg:w-96">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Buscar por setor, status, produto, código ou ID..."
              className="w-full pl-10 pr-4 py-2 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        <div className="mt-5">
          {loading ? (
            <Loading size="sm" className="items-start text-left" />
          ) : demandasFiltradas.length === 0 ? (
            <div className="text-gray-500">Nenhuma demanda encontrada.</div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {demandasFiltradas.map(d => {
                const total = (d.items || []).reduce((acc, it) => acc + Number(it.quantidade || 0), 0);
                const atend = (d.items || []).reduce((acc, it) => acc + Number(it.atendido || 0), 0);
                const restante = Math.max(0, total - atend);
                const pct = total > 0 ? Math.min(100, Math.round((atend / total) * 100)) : 0;
                const deletable = (d.status || '').toLowerCase() !== 'atendido' && atend <= 0;
                const setorId = d.setor_id != null ? String(d.setor_id) : '';
                const estoqueSetor = setorId ? estoqueSetorBySetorId[setorId] : undefined;
                const itensResumo = (d.items || [])
                  .map(it => {
                    const pid = String(it.produto_id || '');
                    const info = produtoById[pid];
                    const nomeRaw = String(it.produto_nome || info?.nome || '');
                    const nome = nomeRaw && nomeRaw !== pid ? nomeRaw : `Produto ${pid.slice(0, 8)}…`;
                    const codigo = String(it.produto_codigo || info?.codigo || '');
                    const sol = Number(it.quantidade || 0);
                    const ate = Number(it.atendido || 0);
                    const rest = Math.max(0, sol - ate);
                    const noSetor = estoqueSetor ? Number(estoqueSetor[pid] ?? 0) : null;
                    return { pid, nome, codigo, sol, ate, rest, noSetor };
                  })
                  .sort((a, b) => b.rest - a.rest || a.nome.localeCompare(b.nome));
                return (
                  <div key={d.id} className="rounded-xl border border-gray-200 p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="font-semibold text-gray-900 truncate">{d.setor_nome || d.setor_id || `Demanda #${d.id.slice(0, 10)}`}</div>
                        <div className="text-xs text-gray-500 mt-1">Demanda #{d.id.slice(0, 10)} · Destino: {d.destino_tipo ? String(d.destino_tipo) : '-'}</div>
                        <div className="text-xs text-gray-500">
                          {d.updated_at ? `Atualizado: ${formatDateTime(d.updated_at)}` : d.created_at ? `Criado: ${formatDateTime(d.created_at)}` : ''}
                        </div>
                      </div>
                      <div className={`text-xs px-2 py-1 rounded-full capitalize ${statusColor(d.status)}`}>{d.status}</div>
                    </div>

                    <div className="mt-4 grid grid-cols-3 gap-2 text-xs">
                      <div className="rounded-lg bg-gray-50 border border-gray-200 p-3">
                        <div className="text-gray-500">Itens</div>
                        <div className="font-semibold text-gray-900">{(d.items || []).length}</div>
                      </div>
                      <div className="rounded-lg bg-gray-50 border border-gray-200 p-3">
                        <div className="text-gray-500">Atendido</div>
                        <div className="font-semibold text-gray-900">{Math.round(atend)}/{Math.round(total)}</div>
                      </div>
                      <div className="rounded-lg bg-blue-50 border border-blue-100 p-3">
                        <div className="text-blue-700">Restante</div>
                        <div className="font-semibold text-blue-900">{Math.round(restante)}</div>
                      </div>
                    </div>

                    <div className="mt-4">
                      <div className="flex items-center justify-between text-xs text-gray-600">
                        <span>Progresso</span>
                        <span>{pct}%</span>
                      </div>
                      <div className="h-2 bg-gray-100 rounded-full mt-2 overflow-hidden">
                        <div className="h-full bg-blue-600" style={{ width: `${pct}%` }} />
                      </div>
                    </div>

                    {itensResumo.length > 0 && (
                      <div className="mt-4 rounded-xl border border-gray-200 bg-gray-50/50 p-4">
                        <div className="text-xs font-medium text-gray-700">Principais itens (restante e no setor)</div>
                        <div className="mt-2 space-y-2">
                          {itensResumo.slice(0, 3).map(it => (
                            <div key={`${d.id}:${it.pid}`} className="flex items-center justify-between gap-3">
                              <div className="min-w-0">
                                <div className="text-sm font-semibold text-gray-900 truncate">{it.nome}</div>
                                <div className="text-xs text-gray-500">
                                  {it.codigo && it.codigo !== '-' ? `Cód: ${it.codigo}` : `ID: ${it.pid}`}
                                  {setorId ? ` · No setor: ${it.noSetor != null ? Math.round(it.noSetor) : '...'}` : ''}
                                </div>
                              </div>
                              <div className="text-sm font-semibold text-gray-900 whitespace-nowrap">{Math.round(it.rest)}</div>
                            </div>
                          ))}
                          {itensResumo.length > 3 && <div className="text-xs text-gray-600">+{itensResumo.length - 3} itens...</div>}
                        </div>
                      </div>
                    )}

                    <div className="mt-4 flex items-center justify-between gap-3">
                      <div className="text-xs text-gray-500">{d.observacoes ? String(d.observacoes) : ''}</div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleDelete(d)}
                          disabled={!deletable || deletingId === d.id}
                          className="px-3 py-2 rounded-lg border border-gray-200 text-gray-700 text-sm font-medium hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-2"
                          title={deletable ? 'Excluir demanda' : 'Demanda não pode ser excluída'}
                        >
                          <Trash2 className="h-4 w-4" />
                          Excluir
                        </button>
                        <Link
                          href={`/demandas/${d.id}`}
                          className="px-3 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700"
                        >
                          Abrir
                        </Link>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </Page>
  );
}

