'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Package, Search } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { Loading } from '@/components/ui/Page';
import { apiUrl } from '@/lib/api';

type EstoqueItem = { produto_id: string; produto_nome: string; produto_codigo: string; quantidade_disponivel: number };
type SetorInfo = { id: string; nome: string };

export default function SetorEstoquePage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [setor, setSetor] = useState<SetorInfo | null>(null);
  const [items, setItems] = useState<EstoqueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (authLoading) return;
    if (!user) return;
    if (user.role !== 'operador_setor') {
      router.replace('/');
      return;
    }
    if (!user.scope_id) {
      Promise.resolve().then(() => {
        setError('Usuário sem setor associado');
        setLoading(false);
      });
      return;
    }
    const headers = { 'X-User-Id': user.id };
    Promise.resolve().then(() => {
      setLoading(true);
      setError('');
    });
    Promise.all([
      fetch(apiUrl(`/api/setores/${encodeURIComponent(user.scope_id)}`), { headers }).then(r => (r.ok ? r.json() : null)),
      fetch(apiUrl(`/api/estoque/setor/${encodeURIComponent(user.scope_id)}`), { headers }).then(r => (r.ok ? r.json() : { items: [] })),
    ])
      .then(([s, est]) => {
        if (!s) throw new Error('Setor não encontrado');
        setSetor(s);
        setItems(est.items || []);
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Erro ao carregar estoque'))
      .finally(() => setLoading(false));
  }, [authLoading, user, router]);

  const filtrados = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = !q ? items : items.filter(i => (i.produto_nome || '').toLowerCase().includes(q) || (i.produto_codigo || '').toLowerCase().includes(q));
    return [...base].sort((a, b) => (a.produto_nome || '').localeCompare(b.produto_nome || ''));
  }, [items, query]);

  if (authLoading) return null;
  if (!user) return null;

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="mb-6 flex items-center justify-between gap-3">
        <button type="button" onClick={() => router.push('/setor')} className="flex items-center gap-2 text-gray-600 hover:text-blue-700">
          <ArrowLeft className="h-4 w-4" /> Voltar
        </button>
        <div className="text-right">
          <div className="text-sm text-gray-500">Setor</div>
          <div className="font-semibold text-gray-900">{setor?.nome || '-'}</div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 mb-4">
        <div className="flex items-center gap-2 font-semibold text-gray-900 mb-3">
          <Package className="h-5 w-5 text-blue-600" /> Estoque do Setor
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Buscar produto..."
            className="w-full pl-10 pr-4 py-2 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {error && <div className="mb-4 bg-red-50 text-red-700 p-4 rounded-lg text-sm">{error}</div>}

      {loading ? (
        <div className="bg-white rounded-xl border border-gray-200">
          <Loading />
        </div>
      ) : filtrados.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-500">Nenhum item encontrado.</div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 text-gray-500">
              <tr>
                <th className="px-4 py-2 font-medium">Produto</th>
                <th className="px-4 py-2 font-medium">Código</th>
                <th className="px-4 py-2 font-medium text-right">Disponível</th>
                <th className="px-4 py-2 font-medium text-right">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtrados.map(i => (
                <tr key={i.produto_id} className="hover:bg-gray-50">
                  <td className="px-4 py-2 font-medium text-gray-900">{i.produto_nome}</td>
                  <td className="px-4 py-2 text-gray-600">{i.produto_codigo}</td>
                  <td className="px-4 py-2 text-right font-semibold text-gray-900">{Number(i.quantidade_disponivel || 0).toFixed(2)}</td>
                  <td className="px-4 py-2 text-right">
                    <Link className="text-blue-600 hover:underline" href={`/produtos/${encodeURIComponent(i.produto_id)}`}>
                      Detalhes
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

