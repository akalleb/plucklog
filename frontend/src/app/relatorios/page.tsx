'use client';

import { CalendarDays, FileText, Filter, RefreshCw, Search, TrendingUp } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip as RechartsTooltip, XAxis, YAxis } from 'recharts';
import { apiUrl } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { Loading, Page } from '@/components/ui/Page';

type ConsumoSetorItem = {
  setor_id: string;
  setor_nome: string;
  consumo_semana: number;
  consumo_mes: number;
};

type ConsumoSetoresResponse = {
  items: ConsumoSetorItem[];
  range?: { week_start?: string | null; month_start?: string | null; now?: string | null };
};

export default function RelatoriosPage() {
  const router = useRouter();
  const { user, loading: authLoading, canAccess } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [data, setData] = useState<ConsumoSetoresResponse | null>(null);
  const [query, setQuery] = useState('');
  const [periodo, setPeriodo] = useState<'semana' | 'mes'>('semana');
  const [apenasComConsumo, setApenasComConsumo] = useState(false);
  const [ordem, setOrdem] = useState<'desc' | 'asc'>('desc');

  const formatQty = useCallback((value: number) => {
    const v = Number.isFinite(value) ? value : 0;
    return new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(v);
  }, []);

  const formatQtyCompact = useCallback((value: number) => {
    const v = Number.isFinite(value) ? value : 0;
    return new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 2 }).format(v);
  }, []);

  const formatDate = useCallback((value?: string | null) => {
    if (!value) return '';
    const v = String(value || '');
    const normalized =
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(v) ? `${v}Z` : v;
    const dt = new Date(normalized);
    if (Number.isNaN(dt.getTime())) return '';
    return dt.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }, []);

  const fetchData = useCallback(async (uid: string) => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(apiUrl('/api/relatorios/consumo_setores'), { headers: { 'X-User-Id': uid } });
      const json: unknown = await res.json().catch(() => null);
      if (!res.ok) {
        const detail = json && typeof json === 'object' && 'detail' in json ? String((json as { detail?: unknown }).detail || '') : '';
        throw new Error(detail || 'Falha ao carregar relatórios');
      }
      const parsed = (json || {}) as ConsumoSetoresResponse;
      setData(parsed);
    } catch (e: unknown) {
      setData(null);
      setError(e instanceof Error ? e.message : 'Falha ao carregar relatórios');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (!user?.id) {
      router.replace('/login');
      return;
    }
    if (!canAccess(['super_admin', 'admin_central'])) return;
    fetchData(user.id).catch(() => {});
  }, [authLoading, canAccess, fetchData, router, user?.id]);

  const filtered = useMemo(() => {
    const items = Array.isArray(data?.items) ? data!.items : [];
    const q = query.trim().toLowerCase();
    let list = items;
    if (q) {
      list = list.filter(
        it => String(it.setor_nome || '').toLowerCase().includes(q) || String(it.setor_id || '').toLowerCase().includes(q),
      );
    }
    if (apenasComConsumo) {
      list = list.filter(it => (Number(it.consumo_semana) || 0) > 0 || (Number(it.consumo_mes) || 0) > 0);
    }
    return list;
  }, [apenasComConsumo, data, query]);

  const sorted = useMemo(() => {
    const list = [...filtered];
    const getV = (it: ConsumoSetorItem) => (periodo === 'semana' ? Number(it.consumo_semana) || 0 : Number(it.consumo_mes) || 0);
    list.sort((a, b) => {
      const diff = getV(b) - getV(a);
      if (diff !== 0) return ordem === 'desc' ? diff : -diff;
      return String(a.setor_nome || '').localeCompare(String(b.setor_nome || ''), 'pt-BR', { sensitivity: 'base' });
    });
    return list;
  }, [filtered, ordem, periodo]);

  const maxSemana = useMemo(() => Math.max(0, ...sorted.map(it => Number(it.consumo_semana) || 0)), [sorted]);
  const maxMes = useMemo(() => Math.max(0, ...sorted.map(it => Number(it.consumo_mes) || 0)), [sorted]);

  const resumo = useMemo(() => {
    const items = sorted;
    const sumSemana = items.reduce((acc, it) => acc + (Number(it.consumo_semana) || 0), 0);
    const sumMes = items.reduce((acc, it) => acc + (Number(it.consumo_mes) || 0), 0);
    const ativosSemana = items.filter(it => (Number(it.consumo_semana) || 0) > 0).length;
    const ativosMes = items.filter(it => (Number(it.consumo_mes) || 0) > 0).length;
    const topSemana = [...items].sort((a, b) => (Number(b.consumo_semana) || 0) - (Number(a.consumo_semana) || 0))[0] || null;
    const topMes = [...items].sort((a, b) => (Number(b.consumo_mes) || 0) - (Number(a.consumo_mes) || 0))[0] || null;
    return { sumSemana, sumMes, ativosSemana, ativosMes, topSemana, topMes };
  }, [sorted]);

  const chartSemana = useMemo(() => {
    const list = [...sorted]
      .filter(it => (Number(it.consumo_semana) || 0) > 0)
      .sort((a, b) => (Number(b.consumo_semana) || 0) - (Number(a.consumo_semana) || 0))
      .slice(0, 8)
      .map(it => ({ name: it.setor_nome, value: Number(it.consumo_semana) || 0 }));
    return list.reverse();
  }, [sorted]);

  const chartMes = useMemo(() => {
    const list = [...sorted]
      .filter(it => (Number(it.consumo_mes) || 0) > 0)
      .sort((a, b) => (Number(b.consumo_mes) || 0) - (Number(a.consumo_mes) || 0))
      .slice(0, 8)
      .map(it => ({ name: it.setor_nome, value: Number(it.consumo_mes) || 0 }));
    return list.reverse();
  }, [sorted]);

  const shownCount = sorted.length;
  const totalCount = Array.isArray(data?.items) ? data!.items.length : 0;

  if (authLoading) return null;
  if (!user) {
    return (
      <Page>
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
          <div className="text-gray-900 font-semibold mb-1">Você precisa estar logado para ver relatórios.</div>
          <Link href="/login" className="text-blue-700 hover:text-blue-800 underline">
            Ir para login
          </Link>
        </div>
      </Page>
    );
  }
  if (!canAccess(['super_admin', 'admin_central'])) {
    return (
      <Page>
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
          <div className="text-gray-900 font-semibold mb-1">Acesso negado.</div>
          <Link href="/" className="text-blue-700 hover:text-blue-800 underline">
            Voltar ao início
          </Link>
        </div>
      </Page>
    );
  }

  return (
    <Page>
      <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <FileText className="h-6 w-6 text-blue-600" />
            Relatórios
          </h1>
          <div className="text-gray-500 mt-1">Consumo por setor na semana e no mês (até hoje).</div>
          <div className="text-xs text-gray-400 mt-1">
            Semana: {formatDate(data?.range?.week_start)} · Mês: {formatDate(data?.range?.month_start)} · Agora: {formatDate(data?.range?.now)}
          </div>
          <div className="text-xs text-gray-400 mt-1">
            Mostrando {shownCount} de {totalCount} setores
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
          <div className="flex rounded-lg border border-gray-200 bg-white p-1">
            <button
              className={`px-3 py-1.5 rounded-md text-sm ${periodo === 'semana' ? 'bg-blue-600 text-white' : 'text-gray-700 hover:bg-gray-50'}`}
              onClick={() => setPeriodo('semana')}
            >
              Semana
            </button>
            <button
              className={`px-3 py-1.5 rounded-md text-sm ${periodo === 'mes' ? 'bg-blue-600 text-white' : 'text-gray-700 hover:bg-gray-50'}`}
              onClick={() => setPeriodo('mes')}
            >
              Mês
            </button>
          </div>
          <div className="relative">
            <Search className="h-4 w-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Filtrar setor..."
              className="w-full sm:w-72 pl-9 pr-3 py-2 border border-gray-200 rounded-lg bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <button
            onClick={() => setOrdem(o => (o === 'desc' ? 'asc' : 'desc'))}
            className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm hover:bg-gray-50"
            disabled={loading}
            title="Alternar ordem"
          >
            <TrendingUp className={`h-4 w-4 ${ordem === 'asc' ? 'rotate-180' : ''}`} />
            Ordem
          </button>
          <button
            onClick={() => (user?.id ? fetchData(user.id) : Promise.resolve())}
            className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm hover:bg-gray-50"
            disabled={loading}
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Atualizar
          </button>
        </div>
      </div>

      {loading ? (
        <Loading label="Carregando relatórios" />
      ) : error ? (
        <div className="bg-white rounded-xl border border-red-200 shadow-sm p-6">
          <div className="text-red-700 font-semibold">Erro ao carregar</div>
          <div className="text-sm text-red-600 mt-1">{error}</div>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
              <div className="text-xs text-gray-500 flex items-center gap-2">
                <CalendarDays className="h-4 w-4 text-blue-600" />
                Consumo na Semana
              </div>
              <div className="text-2xl font-bold text-gray-900 mt-2 tabular-nums">{formatQtyCompact(resumo.sumSemana)}</div>
              <div className="text-xs text-gray-400 mt-1">{resumo.ativosSemana} setores com consumo</div>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
              <div className="text-xs text-gray-500 flex items-center gap-2">
                <CalendarDays className="h-4 w-4 text-blue-600" />
                Consumo no Mês
              </div>
              <div className="text-2xl font-bold text-gray-900 mt-2 tabular-nums">{formatQtyCompact(resumo.sumMes)}</div>
              <div className="text-xs text-gray-400 mt-1">{resumo.ativosMes} setores com consumo</div>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
              <div className="text-xs text-gray-500 flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-blue-600" />
                Top da Semana
              </div>
              <div className="text-sm font-semibold text-gray-900 mt-2 truncate">{resumo.topSemana?.setor_nome || '—'}</div>
              <div className="text-xs text-gray-400 mt-1 tabular-nums">
                {resumo.topSemana ? formatQty(resumo.topSemana.consumo_semana) : '0'}
              </div>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
              <div className="text-xs text-gray-500 flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-blue-600" />
                Top do Mês
              </div>
              <div className="text-sm font-semibold text-gray-900 mt-2 truncate">{resumo.topMes?.setor_nome || '—'}</div>
              <div className="text-xs text-gray-400 mt-1 tabular-nums">{resumo.topMes ? formatQty(resumo.topMes.consumo_mes) : '0'}</div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
              <div className="text-sm font-semibold text-gray-900 mb-3">Top consumo na semana</div>
              <div className="h-72">
                {chartSemana.length ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartSemana} layout="vertical" margin={{ left: 8, right: 16, top: 8, bottom: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                      <XAxis type="number" tickLine={false} axisLine={false} fontSize={12} tickFormatter={v => formatQtyCompact(Number(v) || 0)} />
                      <YAxis
                        type="category"
                        dataKey="name"
                        tickLine={false}
                        axisLine={false}
                        fontSize={12}
                        width={140}
                        tickFormatter={(v: string) => (String(v || '').length > 20 ? `${String(v).slice(0, 20)}…` : String(v))}
                      />
                      <RechartsTooltip formatter={(v: unknown) => formatQty(Number(v) || 0)} />
                      <Bar dataKey="value" fill="#2563eb" radius={[6, 6, 6, 6]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex items-center justify-center text-gray-500">Sem consumo na semana</div>
                )}
              </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
              <div className="text-sm font-semibold text-gray-900 mb-3">Top consumo no mês</div>
              <div className="h-72">
                {chartMes.length ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartMes} layout="vertical" margin={{ left: 8, right: 16, top: 8, bottom: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                      <XAxis type="number" tickLine={false} axisLine={false} fontSize={12} tickFormatter={v => formatQtyCompact(Number(v) || 0)} />
                      <YAxis
                        type="category"
                        dataKey="name"
                        tickLine={false}
                        axisLine={false}
                        fontSize={12}
                        width={140}
                        tickFormatter={(v: string) => (String(v || '').length > 20 ? `${String(v).slice(0, 20)}…` : String(v))}
                      />
                      <RechartsTooltip formatter={(v: unknown) => formatQty(Number(v) || 0)} />
                      <Bar dataKey="value" fill="#16a34a" radius={[6, 6, 6, 6]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex items-center justify-center text-gray-500">Sem consumo no mês</div>
                )}
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-sm font-semibold text-gray-900">Setores</div>
              <label className="inline-flex items-center gap-2 text-sm text-gray-700 select-none">
                <input
                  type="checkbox"
                  checked={apenasComConsumo}
                  onChange={e => setApenasComConsumo(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="inline-flex items-center gap-1">
                  <Filter className="h-4 w-4 text-gray-400" />
                  Apenas com consumo
                </span>
              </label>
            </div>
            <div className="overflow-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 text-gray-600">
                  <tr>
                    <th className="text-left font-semibold px-4 py-3">Setor</th>
                    <th className="text-right font-semibold px-4 py-3 whitespace-nowrap">Semana</th>
                    <th className="text-right font-semibold px-4 py-3 whitespace-nowrap">Mês</th>
                    <th className="text-right font-semibold px-4 py-3 whitespace-nowrap">Destaque</th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.length ? (
                    sorted.map(it => {
                      const vSemana = Number(it.consumo_semana) || 0;
                      const vMes = Number(it.consumo_mes) || 0;
                      const pSemana = maxSemana > 0 ? Math.min(100, (vSemana / maxSemana) * 100) : 0;
                      const pMes = maxMes > 0 ? Math.min(100, (vMes / maxMes) * 100) : 0;
                      const destaqueValor = periodo === 'semana' ? vSemana : vMes;
                      const destaqueMax = periodo === 'semana' ? maxSemana : maxMes;
                      const pDestaque = destaqueMax > 0 ? Math.min(100, (destaqueValor / destaqueMax) * 100) : 0;

                      return (
                        <tr key={`${it.setor_id}`} className="border-t border-gray-100 hover:bg-gray-50">
                          <td className="px-4 py-3">
                            <div className="text-gray-900 font-medium">{it.setor_nome}</div>
                            <div className="text-xs text-gray-400">{it.setor_id}</div>
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums">
                            <div className="flex items-center justify-end gap-3">
                              <div className="w-28 h-2 bg-gray-100 rounded-full overflow-hidden hidden sm:block">
                                <div className="h-full bg-blue-600" style={{ width: `${pSemana}%` }} />
                              </div>
                              <span className="min-w-[72px]">{formatQty(vSemana)}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums">
                            <div className="flex items-center justify-end gap-3">
                              <div className="w-28 h-2 bg-gray-100 rounded-full overflow-hidden hidden sm:block">
                                <div className="h-full bg-green-600" style={{ width: `${pMes}%` }} />
                              </div>
                              <span className="min-w-[72px]">{formatQty(vMes)}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right">
                            {destaqueValor > 0 ? (
                              <span className="inline-flex items-center gap-2 justify-end w-full">
                                <span className="text-xs text-gray-500">{periodo === 'semana' ? 'Semana' : 'Mês'}</span>
                                <span className="inline-flex items-center px-2 py-1 rounded-full bg-blue-50 text-blue-700 text-xs font-semibold tabular-nums">
                                  {formatQtyCompact(destaqueValor)}
                                </span>
                                <span className="text-xs text-gray-400 tabular-nums">{Math.round(pDestaque)}%</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-2 py-1 rounded-full bg-gray-100 text-gray-600 text-xs">Sem consumo</span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={4} className="px-4 py-8 text-center text-gray-500">
                        Nenhum setor encontrado.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </Page>
  );
}
