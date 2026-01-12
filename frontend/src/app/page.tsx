'use client';

import { useState, useEffect, useCallback } from 'react';
import { Package, Search, MapPin, ArrowRight, AlertTriangle } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { Page } from '@/components/ui/Page';
import { useToast } from '@/components/ui/ToastProvider';
import { apiUrl } from '@/lib/api';

// Tipagem dos dados vindos da API FastAPI
interface EstoqueItem {
  produto_nome: string;
  produto_codigo: string;
  local_nome: string;
  local_tipo: string;
  quantidade: number;
  quantidade_disponivel: number;
  status: string;
}

interface EstoqueResponse {
  items: EstoqueItem[];
  pagination: {
    page: number;
    total: number;
    pages: number;
  };
}

export default function Dashboard() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const toast = useToast();
  const [data, setData] = useState<EstoqueResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState('');
  const [stats, setStats] = useState({
    total_produtos: 0,
    baixo_estoque: 0,
    locais_ativos: 0,
    status_sistema: 'Online'
  });

  // Função para buscar dados do Backend FastAPI
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(apiUrl(`/api/estoque/hierarquia?page=${page}&per_page=10&produto=${searchTerm}`));
      if (!res.ok) throw new Error('Falha ao buscar dados');
      const json = await res.json();
      setData(json);
    } catch {
      toast.error('Falha ao carregar estoque', 'Dashboard');
    } finally {
      setLoading(false);
    }
  }, [page, searchTerm, toast]);

  useEffect(() => {
    if (authLoading) return;
    if (user?.role === 'operador_setor') {
      router.replace('/setor');
      return;
    }
    fetch(apiUrl('/api/dashboard/stats'))
      .then(res => res.json())
      .then(data => setStats(data))
      .catch(() => toast.error('Falha ao carregar estatísticas', 'Dashboard'));
  }, [authLoading, user, router, toast]);

  // Recarregar quando página ou busca mudam
  useEffect(() => {
    // Debounce simples para busca
    const timer = setTimeout(() => {
      fetchData();
    }, 300);
    return () => clearTimeout(timer);
  }, [fetchData]);

  if (authLoading) return null;
  if (user?.role === 'operador_setor') return null;

  return (
    <Page width="xl">
      <div className="flex items-center justify-between gap-3 mb-6">
        <div className="flex items-center gap-2 font-semibold text-gray-900">
          <Package className="h-5 w-5 text-blue-600" /> Visão Geral
        </div>
      </div>
        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
            <div className="flex items-center justify-between pb-2">
              <h3 className="text-sm font-medium text-gray-500">Total Catalogado</h3>
              <Package className="h-4 w-4 text-gray-400" />
            </div>
            <div className="text-2xl font-bold">{stats.total_produtos}</div>
          </div>
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
             <div className="flex items-center justify-between pb-2">
              <h3 className="text-sm font-medium text-gray-500">Locais Ativos</h3>
              <MapPin className="h-4 w-4 text-gray-400" />
            </div>
            <div className="text-2xl font-bold">{stats.locais_ativos}</div>
          </div>
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
             <div className="flex items-center justify-between pb-2">
              <h3 className="text-sm font-medium text-gray-500">Estoque Baixo</h3>
              <AlertTriangle className="h-4 w-4 text-orange-500" />
            </div>
            <div className="text-2xl font-bold text-orange-600">{stats.baixo_estoque}</div>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-4 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input 
              type="text"
              placeholder="Buscar produto por nome ou código..."
              className="w-full pl-10 pr-4 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        {/* Table */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-gray-50 text-gray-500 font-medium border-b border-gray-200">
                <tr>
                  <th className="px-6 py-4">Produto</th>
                  <th className="px-6 py-4">Local</th>
                  <th className="px-6 py-4">Qtd. Disponível</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {loading ? (
                  // Skeleton Loading
                  [...Array(5)].map((_, i) => (
                    <tr key={i} className="animate-pulse">
                      <td className="px-6 py-4"><div className="h-4 bg-gray-200 rounded w-3/4"></div></td>
                      <td className="px-6 py-4"><div className="h-4 bg-gray-200 rounded w-1/2"></div></td>
                      <td className="px-6 py-4"><div className="h-4 bg-gray-200 rounded w-1/4"></div></td>
                      <td className="px-6 py-4"><div className="h-6 bg-gray-200 rounded-full w-20"></div></td>
                      <td className="px-6 py-4"></td>
                    </tr>
                  ))
                ) : data?.items.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center text-gray-500">
                      Nenhum produto encontrado.
                    </td>
                  </tr>
                ) : (
                  data?.items.map((item, idx) => (
                    <tr key={idx} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="font-medium text-gray-900">{item.produto_nome}</div>
                        <div className="text-xs text-gray-500">{item.produto_codigo}</div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider ${
                            item.local_tipo === 'setor' ? 'bg-purple-100 text-purple-700' :
                            item.local_tipo === 'almoxarifado' ? 'bg-orange-100 text-orange-700' :
                            'bg-blue-100 text-blue-700'
                          }`}>
                            {item.local_tipo}
                          </span>
                          <span className="text-gray-700">{item.local_nome}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 font-mono font-medium text-gray-700">
                        {item.quantidade_disponivel.toLocaleString('pt-BR')}
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          item.status === 'Normal' ? 'bg-green-100 text-green-800' :
                          item.status === 'Baixo' ? 'bg-yellow-100 text-yellow-800' :
                          'bg-red-100 text-red-800'
                        }`}>
                          {item.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <Link href={`/produtos/${item.produto_codigo}`} className="text-blue-600 hover:text-blue-800 font-medium text-xs flex items-center justify-end gap-1 ml-auto">
                          Detalhes <ArrowRight className="h-3 w-3" />
                        </Link>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          
          {/* Pagination */}
          {data && (
            <div className="bg-gray-50 px-6 py-4 border-t border-gray-200 flex items-center justify-between">
              <span className="text-sm text-gray-500">
                Página {data.pagination.page} de {data.pagination.pages}
              </span>
              <div className="flex gap-2">
                <button 
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="px-3 py-1 text-sm border border-gray-300 rounded hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Anterior
                </button>
                <button 
                  onClick={() => setPage(p => p + 1)}
                  disabled={page >= data.pagination.pages}
                  className="px-3 py-1 text-sm border border-gray-300 rounded hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Próxima
                </button>
              </div>
            </div>
          )}
        </div>
    </Page>
  );
}
