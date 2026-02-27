'use client';

import { useState, useEffect, useCallback } from 'react';
import { ArrowLeftRight, Search, Calendar, Download } from 'lucide-react';
import { apiUrl, apiFetch } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';

// Tipagem
interface Movimentacao {
  id: string;
  produto_nome: string;
  tipo: string;
  quantidade: number;
  data: string;
  origem: string;
  destino: string;
  usuario: string;
  nota_fiscal: string;
}

interface MovimentacaoResponse {
  items: Movimentacao[];
  pagination: {
    page: number;
    total: number;
    pages: number;
  };
}

export default function MovimentacoesPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [data, setData] = useState<MovimentacaoResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [filterTipo, setFilterTipo] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  const getTipoInfo = (tipo: string) => {
    const t = (tipo || '').toLowerCase();
    if (t === 'entrada') {
      return { label: 'Entrada', badge: 'bg-green-100 text-green-800', negative: false };
    }
    if (t === 'saida') {
      return { label: 'Saída', badge: 'bg-red-100 text-red-800', negative: true };
    }
    if (t === 'saida_justificada') {
      return { label: 'Saída Justificada', badge: 'bg-red-100 text-red-800', negative: true };
    }
    if (t === 'distribuicao') {
      return { label: 'Distribuição', badge: 'bg-red-100 text-red-800', negative: true };
    }
    if (t === 'estorno_distribuicao') {
      return { label: 'Estorno', badge: 'bg-blue-100 text-blue-800', negative: false };
    }
    if (t === 'transferencia') {
      return { label: 'Transferência', badge: 'bg-blue-100 text-blue-800', negative: false };
    }
    const label = (tipo || '').replace(/_/g, ' ').trim() || 'Outros';
    return { label, badge: 'bg-blue-100 text-blue-800', negative: false };
  };

  const fetchData = useCallback(async () => {
    if (!user?.id) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const qs = new URLSearchParams({ page: String(page), per_page: '15' });
      if (filterTipo) qs.set('tipo', filterTipo);
      if (searchTerm) qs.set('produto', searchTerm);
      
      const res = await apiFetch(`/api/movimentacoes?${qs.toString()}`);
      if (!res.ok) throw new Error('Erro ao carregar');
      const json = await res.json();
      setData(json);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  }, [filterTipo, page, searchTerm, user?.id]);

  useEffect(() => {
    if (authLoading) return;
    if (!user?.id) {
      router.replace('/login');
      return;
    }
    const timer = setTimeout(() => fetchData(), 300);
    return () => clearTimeout(timer);
  }, [authLoading, fetchData, router, user?.id]);

  // Formatar data
  const formatDate = (dateStr: string) => {
    const normalized =
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(dateStr) ? `${dateStr}Z` : dateStr;
    return new Date(normalized).toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className="p-8">
      <div className="mb-8 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <ArrowLeftRight className="h-6 w-6 text-blue-600" />
            Histórico de Movimentações
          </h1>
          <p className="text-gray-500 mt-1">Rastreie todas as entradas, saídas e transferências.</p>
        </div>
        
        <div className="flex gap-2">
           <button className="soft-btn flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700">
             <Download className="h-4 w-4" />
             Exportar
           </button>
        </div>
      </div>

      {/* Filters */}
      <div className="soft-card p-4 mb-6 flex flex-col md:flex-row gap-4">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input 
            type="text"
            placeholder="Buscar por produto..."
            className="soft-input w-full pl-10 pr-4 py-2 outline-none"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="w-full md:w-48">
          <select 
            className="soft-input w-full px-4 py-2 outline-none"
            value={filterTipo}
            onChange={e => setFilterTipo(e.target.value)}
          >
            <option value="">Todos os Tipos</option>
            <option value="entrada">Entrada</option>
            <option value="saida">Saída</option>
            <option value="saida_justificada">Saída Justificada</option>
            <option value="transferencia">Transferência</option>
            <option value="distribuicao">Distribuição</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="soft-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-gray-50 text-gray-500 font-medium border-b border-gray-200">
              <tr>
                <th className="px-6 py-4">Data</th>
                <th className="px-6 py-4">Tipo</th>
                <th className="px-6 py-4">Produto</th>
                <th className="px-6 py-4">Origem &rarr; Destino</th>
                <th className="px-6 py-4 text-right">Qtd.</th>
                <th className="px-6 py-4">Usuário</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                 [...Array(5)].map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td colSpan={6} className="px-6 py-4"><div className="h-4 bg-gray-200 rounded"></div></td>
                  </tr>
                ))
              ) : data?.items.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-gray-500">Nenhum registro encontrado.</td>
                </tr>
              ) : (
                data?.items.map((mov) => (
                  (() => {
                    const tipoInfo = getTipoInfo(mov.tipo);
                    return (
                  <tr key={mov.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 text-gray-500 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <Calendar className="h-3 w-3" />
                        {formatDate(mov.data)}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${tipoInfo.badge}`}>
                        {tipoInfo.label}
                      </span>
                    </td>
                    <td className="px-6 py-4 font-medium text-gray-900">{mov.produto_nome}</td>
                    <td className="px-6 py-4 text-gray-600">
                      <div className="flex flex-col text-xs">
                        <span className="text-gray-400">De: {mov.origem}</span>
                        <span className="text-gray-900 font-medium">Para: {mov.destino}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right font-mono font-medium">
                      {tipoInfo.negative ? '-' : '+'}
                      {Math.round(mov.quantidade)}
                    </td>
                    <td className="px-6 py-4 text-gray-500 text-xs">
                      {mov.usuario || 'Sistema'}
                    </td>
                  </tr>
                    );
                  })()
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
    </div>
  );
}
