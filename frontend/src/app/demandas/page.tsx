'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, CheckCircle2, Filter, ShoppingCart, Trash2 } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { Loading, Page } from '@/components/ui/Page';
import { apiUrl } from '@/lib/api';

type DemandaItem = {
  produto_id: string;
  produto_nome: string;
  produto_codigo: string;
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

  const refresh = async (uid: string, selectedStatus: string) => {
    const headers = { 'X-User-Id': uid };
    const qs = new URLSearchParams({ per_page: '50', page: '1' });
    if (selectedStatus !== 'todas') qs.set('status', selectedStatus);
    const res = await fetch(apiUrl(`/api/demandas?${qs.toString()}`), { headers });
    const data = await res.json().catch(() => ({ items: [] }));
    if (!res.ok) throw new Error(data.detail || 'Erro ao carregar demandas');
    setDemandas(data.items || []);
  };

  const handleDelete = async (demanda: DemandaResumo) => {
    if (!user) return;
    setError('');
    setSuccess('');

    const ok = window.confirm(`Excluir a demanda #${demanda.id.slice(0, 10)}?`);
    if (!ok) return;

    setDeletingId(demanda.id);
    try {
      const headers = { 'X-User-Id': user.id };
      const res = await fetch(apiUrl(`/api/demandas/${demanda.id}`), { method: 'DELETE', headers });
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
  }, [authLoading, user, router, canAccess, status]);

  const demandasOrdenadas = useMemo(() => {
    const list = [...demandas];
    list.sort((a, b) => String(b.updated_at || b.created_at || '').localeCompare(String(a.updated_at || a.created_at || '')));
    return list;
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

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
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
            className="w-full md:w-56 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white"
          >
            <option value="pendente">Pendente</option>
            <option value="parcial">Parcial</option>
            <option value="atendido">Atendido</option>
            <option value="todas">Todas</option>
          </select>
        </div>

        <div className="mt-5">
          {loading ? (
            <Loading size="sm" className="items-start text-left" />
          ) : demandasOrdenadas.length === 0 ? (
            <div className="text-gray-500">Nenhuma demanda encontrada.</div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {demandasOrdenadas.map(d => {
                const total = (d.items || []).reduce((acc, it) => acc + Number(it.quantidade || 0), 0);
                const atend = (d.items || []).reduce((acc, it) => acc + Number(it.atendido || 0), 0);
                const pct = total > 0 ? Math.min(100, Math.round((atend / total) * 100)) : 0;
                const deletable = (d.status || '').toLowerCase() !== 'atendido' && atend <= 0;
                return (
                  <div key={d.id} className="rounded-xl border border-gray-200 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="font-semibold text-gray-900 truncate">#{d.id.slice(0, 10)}</div>
                        <div className="text-xs text-gray-500 mt-1">
                          {d.setor_nome ? `Setor: ${d.setor_nome}` : d.setor_id ? `Setor: ${d.setor_id}` : 'Setor: -'}
                        </div>
                        <div className="text-xs text-gray-500">
                          Destino: {d.destino_tipo ? String(d.destino_tipo) : '-'}
                        </div>
                      </div>
                      <div className={`text-xs px-2 py-1 rounded-full capitalize ${statusColor(d.status)}`}>{d.status}</div>
                    </div>

                    <div className="mt-4">
                      <div className="flex items-center justify-between text-xs text-gray-600">
                        <span>
                          Itens: {(d.items || []).length} | Qtd: {atend.toFixed(2)}/{total.toFixed(2)}
                        </span>
                        <span>{pct}%</span>
                      </div>
                      <div className="h-2 bg-gray-100 rounded-full mt-2 overflow-hidden">
                        <div className="h-full bg-blue-600" style={{ width: `${pct}%` }} />
                      </div>
                    </div>

                    <div className="mt-4 flex items-center justify-between gap-3">
                      <div className="text-xs text-gray-500">
                        {d.updated_at ? `Atualizado: ${new Date(d.updated_at).toLocaleString('pt-BR')}` : d.created_at ? `Criado: ${new Date(d.created_at).toLocaleString('pt-BR')}` : ''}
                      </div>
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

