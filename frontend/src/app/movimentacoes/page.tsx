'use client';

import { useState, useEffect, useCallback } from 'react';
import { ArrowLeftRight, Search, Calendar, Download } from 'lucide-react';
import { apiUrl } from '@/lib/api';

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
  const [data, setData] = useState<MovimentacaoResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [filterTipo, setFilterTipo] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      let url = apiUrl(`/api/movimentacoes?page=${page}&per_page=15`);
      if (filterTipo) url += `&tipo=${filterTipo}`;
      if (searchTerm) url += `&produto=${searchTerm}`;
      
      const res = await fetch(url);
      if (!res.ok) throw new Error('Erro ao carregar');
      const json = await res.json();
      setData(json);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  }, [page, filterTipo, searchTerm]);

  useEffect(() => {
    const timer = setTimeout(() => fetchData(), 300);
    return () => clearTimeout(timer);
  }, [fetchData]);

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
           <button className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50">
             <Download className="h-4 w-4" />
             Exportar
           </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm mb-6 flex flex-col md:flex-row gap-4">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input 
            type="text"
            placeholder="Buscar por produto..."
            className="w-full pl-10 pr-4 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="w-full md:w-48">
          <select 
            className="w-full px-4 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 outline-none bg-white"
            value={filterTipo}
            onChange={e => setFilterTipo(e.target.value)}
          >
            <option value="">Todos os Tipos</option>
            <option value="entrada">Entrada</option>
            <option value="saida">Saída</option>
            <option value="transferencia">Transferência</option>
            <option value="distribuicao">Distribuição</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
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
                  <tr key={mov.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 text-gray-500 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <Calendar className="h-3 w-3" />
                        {formatDate(mov.data)}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${
                        mov.tipo === 'entrada' ? 'bg-green-100 text-green-800' :
                        mov.tipo === 'saida' ? 'bg-red-100 text-red-800' :
                        'bg-blue-100 text-blue-800'
                      }`}>
                        {mov.tipo}
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
                      {mov.tipo === 'saida' || mov.tipo === 'distribuicao' ? '-' : '+'}
                      {mov.quantidade}
                    </td>
                    <td className="px-6 py-4 text-gray-500 text-xs">
                      {mov.usuario || 'Sistema'}
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
                className="px-3 py-1 text-sm border border-gray-300 rounded hover:bg-white disabled:opacity-50"
              >
                Anterior
              </button>
              <button 
                onClick={() => setPage(p => p + 1)}
                disabled={page >= data.pagination.pages}
                className="px-3 py-1 text-sm border border-gray-300 rounded hover:bg-white disabled:opacity-50"
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
