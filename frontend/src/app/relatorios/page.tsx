'use client';

import { BarChart, TrendingUp, DollarSign, Calendar, ArrowUpRight, ArrowDownRight, Package } from 'lucide-react';
import { useState, useEffect } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip, Legend, LineChart, Line, XAxis, YAxis, CartesianGrid } from 'recharts';
import Link from 'next/link';
import { apiUrl } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';

export default function RelatoriosPage() {
  const { user, loading: authLoading, canAccess } = useAuth();
  const [stats, setStats] = useState({
    total_produtos: 0,
    baixo_estoque: 0,
    locais_ativos: 0,
    status_sistema: 'Online'
  });

  const [consumoData, setConsumoData] = useState([]);
  const [movData, setMovData] = useState([]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) return;
    if (!canAccess(['super_admin', 'admin_central'])) return;

    const headers = { 'X-User-Id': user.id };
    const controller = new AbortController();
    const { signal } = controller;

    const safeJson = async (res: Response) => res.json().catch(() => ({}));
    const ignoreAbort = (err: unknown) => {
      if (err && typeof err === 'object' && 'name' in err && (err as { name?: unknown }).name === 'AbortError') return;
      console.error(err);
    };

    fetch(apiUrl('/api/dashboard/stats'), { headers, signal })
      .then(res => safeJson(res))
      .then(data => setStats(data))
      .catch(ignoreAbort);

    fetch(apiUrl('/api/dashboard/charts/consumo'), { headers, signal })
      .then(res => safeJson(res))
      .then(data => setConsumoData(data))
      .catch(ignoreAbort);

    fetch(apiUrl('/api/dashboard/charts/movimentacoes'), { headers, signal })
      .then(res => safeJson(res))
      .then(data => setMovData(data))
      .catch(ignoreAbort);

    return () => controller.abort();
  }, [authLoading, canAccess, user]);

  const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

  const formatChartDate = (value: string) => {
    const v = String(value || '');
    if (/^\d{4}-\d{2}-\d{2}$/.test(v)) {
      return new Date(`${v}T00:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
    }
    return new Date(v).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  };

  const formatChartDateLabel = (value: string) => {
    const v = String(value || '');
    if (/^\d{4}-\d{2}-\d{2}$/.test(v)) {
      return new Date(`${v}T00:00:00`).toLocaleDateString('pt-BR');
    }
    return new Date(v).toLocaleDateString('pt-BR');
  };

  if (authLoading) return null;
  if (!user) {
    return (
      <div className="p-8 max-w-6xl mx-auto">
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
          <div className="text-gray-900 font-semibold mb-1">Você precisa estar logado para ver relatórios.</div>
          <Link href="/login" className="text-blue-700 hover:text-blue-800 underline">
            Ir para login
          </Link>
        </div>
      </div>
    );
  }
  if (!canAccess(['super_admin', 'admin_central'])) {
    return (
      <div className="p-8 max-w-6xl mx-auto">
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
          <div className="text-gray-900 font-semibold mb-1">Acesso negado.</div>
          <Link href="/" className="text-blue-700 hover:text-blue-800 underline">
            Voltar ao início
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <BarChart className="h-6 w-6 text-blue-600" />
          Relatórios e Métricas
        </h1>
        <p className="text-gray-500 mt-1">Visão geral do desempenho e consumo por setor.</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
          <div className="flex justify-between items-start mb-4">
            <div className="bg-blue-50 p-3 rounded-lg">
              <Package className="h-6 w-6 text-blue-600" />
            </div>
            <span className="text-xs font-medium bg-green-100 text-green-700 px-2 py-1 rounded-full flex items-center gap-1">
              <ArrowUpRight className="h-3 w-3" /> +2%
            </span>
          </div>
          <p className="text-sm text-gray-500 font-medium">Itens em Estoque</p>
          <h3 className="text-2xl font-bold text-gray-900">{stats.total_produtos}</h3>
        </div>

        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
          <div className="flex justify-between items-start mb-4">
            <div className="bg-green-50 p-3 rounded-lg">
              <DollarSign className="h-6 w-6 text-green-600" />
            </div>
          </div>
          <p className="text-sm text-gray-500 font-medium">Valor Estimado</p>
          <h3 className="text-2xl font-bold text-gray-900">R$ --</h3>
          <p className="text-xs text-gray-400 mt-1">Em desenvolvimento</p>
        </div>

        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
          <div className="flex justify-between items-start mb-4">
            <div className="bg-orange-50 p-3 rounded-lg">
              <TrendingUp className="h-6 w-6 text-orange-600" />
            </div>
            <span className="text-xs font-medium bg-red-100 text-red-700 px-2 py-1 rounded-full flex items-center gap-1">
              <ArrowDownRight className="h-3 w-3" /> Crítico
            </span>
          </div>
          <p className="text-sm text-gray-500 font-medium">Abaixo do Mínimo</p>
          <h3 className="text-2xl font-bold text-gray-900">{stats.baixo_estoque}</h3>
        </div>

        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
          <div className="flex justify-between items-start mb-4">
            <div className="bg-purple-50 p-3 rounded-lg">
              <Calendar className="h-6 w-6 text-purple-600" />
            </div>
          </div>
          <p className="text-sm text-gray-500 font-medium">Movimentações (Hoje)</p>
          <h3 className="text-2xl font-bold text-gray-900">--</h3>
          <p className="text-xs text-gray-400 mt-1">Sincronizando...</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Placeholder Charts */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 flex flex-col">
          <h3 className="text-lg font-bold text-gray-900 mb-4">Consumo por Setor (Top 5)</h3>
          <div className="h-64 w-full">
            {consumoData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={consumoData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    fill="#8884d8"
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {consumoData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <RechartsTooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-gray-400">Sem dados de consumo</div>
            )}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 flex flex-col">
          <h3 className="text-lg font-bold text-gray-900 mb-4">Movimentações (Últimos 7 dias)</h3>
          <div className="h-64 w-full">
            {movData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={movData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eee" />
                  <XAxis dataKey="date" tickFormatter={formatChartDate} fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis fontSize={12} tickLine={false} axisLine={false} />
                  <RechartsTooltip 
                    contentStyle={{ backgroundColor: '#fff', borderRadius: '8px', border: '1px solid #eee' }}
                    labelFormatter={formatChartDateLabel}
                  />
                  <Legend />
                  <Line type="monotone" dataKey="entrada" name="Entradas" stroke="#10b981" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="saida" name="Saídas" stroke="#ef4444" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-gray-400">Sem histórico recente</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
