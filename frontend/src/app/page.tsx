'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
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

interface ProdutoResumo {
  id: string;
  nome?: string;
  codigo?: string;
  unidade?: string;
  categoria?: string;
}

type DisplayRow =
  | { kind: 'estoque'; item: EstoqueItem }
  | { kind: 'produto'; produto_nome: string; produto_codigo: string; quantidade_disponivel: number; status: string; locais_count: number };

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
  const [showProdutosModal, setShowProdutosModal] = useState(false);
  const [produtosQuery, setProdutosQuery] = useState('');
  const [produtosPage, setProdutosPage] = useState(1);
  const [produtosLoading, setProdutosLoading] = useState(false);
  const [produtos, setProdutos] = useState<ProdutoResumo[]>([]);

  // Função para buscar dados do Backend FastAPI
  const fetchData = useCallback(async () => {
    if (!user?.id) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const perPage = searchTerm.trim() ? 100 : 10;
      const res = await fetch(apiUrl(`/api/estoque/hierarquia?page=${page}&per_page=${perPage}&produto=${encodeURIComponent(searchTerm)}`), {
        headers: { 'X-User-Id': user.id }
      });
      if (!res.ok) throw new Error('Falha ao buscar dados');
      const json = await res.json();
      setData(json);
    } catch {
      toast.error('Falha ao carregar estoque', 'Dashboard');
    } finally {
      setLoading(false);
    }
  }, [page, searchTerm, toast, user?.id]);

  useEffect(() => {
    if (authLoading) return;
    if (!user?.id) {
      router.replace('/login');
      return;
    }
    if (user?.role === 'operador_setor') {
      router.replace('/setor');
      return;
    }
    fetch(apiUrl('/api/dashboard/stats'), { headers: { 'X-User-Id': user.id } })
      .then(res => res.json())
      .then(data => setStats(data))
      .catch(() => toast.error('Falha ao carregar estatísticas', 'Dashboard'));
  }, [authLoading, user?.id, user?.role, router, toast]);

  useEffect(() => {
    setPage(1);
  }, [searchTerm]);

  // Recarregar quando página ou busca mudam
  useEffect(() => {
    // Debounce simples para busca
    const timer = setTimeout(() => {
      fetchData();
    }, 300);
    return () => clearTimeout(timer);
  }, [fetchData]);

  const loadProdutos = useCallback(async () => {
    if (!user?.id) return;
    setProdutosLoading(true);
    try {
      const q = produtosQuery.trim();
      const res = await fetch(
        apiUrl(`/api/produtos/search?q=${encodeURIComponent(q)}&limit=50&page=${produtosPage}`),
        { headers: { 'X-User-Id': user.id } },
      );
      const json = await res.json().catch(() => []);
      if (!res.ok) {
        throw new Error((json && json.detail) || 'Falha ao buscar produtos');
      }
      setProdutos(Array.isArray(json) ? json : []);
    } catch {
      setProdutos([]);
      toast.error('Falha ao carregar produtos', 'Dashboard');
    } finally {
      setProdutosLoading(false);
    }
  }, [produtosPage, produtosQuery, toast, user?.id]);

  useEffect(() => {
    if (!showProdutosModal) return;
    const t = setTimeout(() => {
      loadProdutos();
    }, 250);
    return () => clearTimeout(t);
  }, [loadProdutos, showProdutosModal]);

  const displayRows = useMemo<DisplayRow[]>(() => {
    const items = data?.items || [];
    if (!items.length) return [];
    if (!searchTerm.trim()) return items.map(item => ({ kind: 'estoque', item }));

    const severity = (s: string) => {
      const v = (s || '').toLowerCase();
      if (v === 'crítico' || v === 'critico') return 2;
      if (v === 'baixo') return 1;
      return 0;
    };

    const maxStatus = (a: string, b: string) => (severity(a) >= severity(b) ? a : b);

    const agg = new Map<
      string,
      { produto_nome: string; produto_codigo: string; quantidade_disponivel: number; status: string; locais_count: number }
    >();

    for (const it of items) {
      const key = it.produto_codigo || it.produto_nome || 'produto';
      const prev = agg.get(key);
      const qtd = Number.isFinite(it.quantidade_disponivel) ? Number(it.quantidade_disponivel) : 0;
      if (!prev) {
        agg.set(key, {
          produto_nome: it.produto_nome,
          produto_codigo: it.produto_codigo,
          quantidade_disponivel: qtd,
          status: it.status,
          locais_count: 1,
        });
      } else {
        agg.set(key, {
          ...prev,
          produto_nome: prev.produto_nome || it.produto_nome,
          produto_codigo: prev.produto_codigo || it.produto_codigo,
          quantidade_disponivel: prev.quantidade_disponivel + qtd,
          status: maxStatus(prev.status, it.status),
          locais_count: prev.locais_count + 1,
        });
      }
    }

    return Array.from(agg.values())
      .sort((a, b) => b.quantidade_disponivel - a.quantidade_disponivel)
      .map(v => ({
        kind: 'produto',
        produto_nome: v.produto_nome,
        produto_codigo: v.produto_codigo,
        quantidade_disponivel: v.quantidade_disponivel,
        status: v.status,
        locais_count: v.locais_count,
      }));
  }, [data?.items, searchTerm]);

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
          <div
            className="soft-card p-6 cursor-pointer select-none"
            role="button"
            tabIndex={0}
            onClick={() => {
              setShowProdutosModal(true);
              setProdutosQuery('');
              setProdutosPage(1);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setShowProdutosModal(true);
                setProdutosQuery('');
                setProdutosPage(1);
              }
            }}
          >
            <div className="flex items-center justify-between pb-2">
              <h3 className="text-sm font-medium text-gray-500">Total Catalogado</h3>
              <Package className="h-4 w-4 text-gray-400" />
            </div>
            <div className="text-2xl font-bold">{stats.total_produtos}</div>
          </div>
          <div className="soft-card p-6">
             <div className="flex items-center justify-between pb-2">
              <h3 className="text-sm font-medium text-gray-500">Locais Ativos</h3>
              <MapPin className="h-4 w-4 text-gray-400" />
            </div>
            <div className="text-2xl font-bold">{stats.locais_ativos}</div>
          </div>
          <div className="soft-card p-6">
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
              className="soft-input w-full pl-10 pr-4 py-2 outline-none"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        {/* Table */}
        <div className="soft-card overflow-hidden">
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
                  displayRows.map((row, idx) => {
                    if (row.kind === 'estoque') {
                      const item = row.item;
                      return (
                        <tr key={`${idx}-${item.produto_codigo}-${item.local_nome}`} className="hover:bg-gray-50 transition-colors">
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
                            {Math.round(item.quantidade_disponivel).toLocaleString('pt-BR')}
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
                            <Link href={`/produtos/${encodeURIComponent(item.produto_codigo)}`} className="text-blue-600 hover:text-blue-800 font-medium text-xs flex items-center justify-end gap-1 ml-auto">
                              Detalhes <ArrowRight className="h-3 w-3" />
                            </Link>
                          </td>
                        </tr>
                      );
                    }

                    return (
                      <tr key={`${idx}-${row.produto_codigo}`} className="hover:bg-gray-50 transition-colors">
                        <td className="px-6 py-4">
                          <div className="font-medium text-gray-900">{row.produto_nome}</div>
                          <div className="text-xs text-gray-500">{row.produto_codigo}</div>
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-gray-700">{row.locais_count} locais</span>
                        </td>
                        <td className="px-6 py-4 font-mono font-medium text-gray-700">
                          {Math.round(row.quantidade_disponivel).toLocaleString('pt-BR')}
                        </td>
                        <td className="px-6 py-4">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            row.status === 'Normal' ? 'bg-green-100 text-green-800' :
                            row.status === 'Baixo' ? 'bg-yellow-100 text-yellow-800' :
                            'bg-red-100 text-red-800'
                          }`}>
                            {row.status}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <Link href={`/produtos/${encodeURIComponent(row.produto_codigo)}`} className="text-blue-600 hover:text-blue-800 font-medium text-xs flex items-center justify-end gap-1 ml-auto">
                            Detalhes <ArrowRight className="h-3 w-3" />
                          </Link>
                        </td>
                      </tr>
                    );
                  })
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
                  className="soft-btn px-3 py-1 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Anterior
                </button>
                <button 
                  onClick={() => setPage(p => p + 1)}
                  disabled={page >= data.pagination.pages}
                  className="soft-btn px-3 py-1 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Próxima
                </button>
              </div>
            </div>
          )}
        </div>

        {showProdutosModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="soft-card-strong w-full max-w-2xl overflow-hidden">
              <div className="p-4 border-b border-gray-200 flex items-center justify-between gap-3">
                <div className="font-semibold text-gray-900">Produtos catalogados</div>
                <button
                  type="button"
                  className="soft-btn px-3 py-1.5 text-sm text-gray-700"
                  onClick={() => setShowProdutosModal(false)}
                >
                  Fechar
                </button>
              </div>

              <div className="p-4 border-b border-gray-100">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Filtrar por nome ou código..."
                    className="soft-input w-full pl-10 pr-4 py-2 outline-none"
                    value={produtosQuery}
                    onChange={(e) => {
                      setProdutosQuery(e.target.value);
                      setProdutosPage(1);
                    }}
                  />
                </div>
              </div>

              <div className="p-4 max-h-[70vh] overflow-y-auto">
                {produtosLoading ? (
                  <div className="text-sm text-gray-500 py-6 text-center">Carregando...</div>
                ) : produtos.length === 0 ? (
                  <div className="text-sm text-gray-500 py-6 text-center">Nenhum produto encontrado.</div>
                ) : (
                  <div className="divide-y divide-gray-100">
                    {produtos.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        className="w-full text-left py-3 hover:bg-gray-50 px-2 rounded-lg transition-colors"
                        onClick={() => {
                          setShowProdutosModal(false);
                          router.push(`/produtos/${encodeURIComponent(p.codigo || p.id)}`);
                        }}
                      >
                        <div className="font-medium text-gray-900">{p.nome || 'Produto sem nome'}</div>
                        <div className="text-xs text-gray-500">{p.codigo || p.id}</div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="p-4 border-t border-gray-200 flex items-center justify-between">
                <button
                  type="button"
                  className="soft-btn px-3 py-2 text-sm text-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  onClick={() => setProdutosPage(p => Math.max(1, p - 1))}
                  disabled={produtosPage <= 1 || produtosLoading}
                >
                  Anterior
                </button>
                <div className="text-sm text-gray-500">Página {produtosPage}</div>
                <button
                  type="button"
                  className="soft-btn px-3 py-2 text-sm text-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  onClick={() => setProdutosPage(p => p + 1)}
                  disabled={produtosLoading || produtos.length < 50}
                >
                  Próxima
                </button>
              </div>
            </div>
          </div>
        )}

    </Page>
  );
}
