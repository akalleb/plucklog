'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Package, ArrowLeftRight, ShoppingCart } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { InlineLoading } from '@/components/ui/Page';
import { apiUrl } from '@/lib/api';

type SetorInfo = { id: string; nome: string };

export default function SetorHomePage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [setor, setSetor] = useState<SetorInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

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
    Promise.resolve().then(() => setLoading(true));
    fetch(apiUrl(`/api/setores/${encodeURIComponent(user.scope_id)}`), { headers })
      .then(async r => (r.ok ? r.json() : null))
      .then(data => {
        if (!data) throw new Error('Setor não encontrado');
        setSetor(data);
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Erro ao carregar setor'))
      .finally(() => setLoading(false));
  }, [authLoading, user, router]);

  if (authLoading) return null;
  if (!user) return null;

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Meu Setor</h1>
        <p className="text-gray-500 mt-1">{loading ? <InlineLoading label="Carregando" /> : setor?.nome || '-'}</p>
      </div>

      {error && (
        <div className="mb-6 bg-red-50 text-red-700 p-4 rounded-lg text-sm">{error}</div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Link
          href="/setor/estoque"
          className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 hover:bg-gray-50 transition-colors"
        >
          <div className="flex items-center gap-3">
            <Package className="h-5 w-5 text-blue-600" />
            <div>
              <div className="font-semibold text-gray-900">Estoque do Setor</div>
              <div className="text-xs text-gray-500 mt-1">Ver produtos e quantidades disponíveis.</div>
            </div>
          </div>
        </Link>

        <Link
          href="/setor/consumo"
          className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 hover:bg-gray-50 transition-colors"
        >
          <div className="flex items-center gap-3">
            <ArrowLeftRight className="h-5 w-5 text-orange-600" />
            <div>
              <div className="font-semibold text-gray-900">Registrar Consumo</div>
              <div className="text-xs text-gray-500 mt-1">Dar saída do que foi utilizado no setor.</div>
            </div>
          </div>
        </Link>

        <Link
          href="/setor/demandas"
          className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 hover:bg-gray-50 transition-colors"
        >
          <div className="flex items-center gap-3">
            <ShoppingCart className="h-5 w-5 text-green-600" />
            <div>
              <div className="font-semibold text-gray-900">Demandas</div>
              <div className="text-xs text-gray-500 mt-1">Solicitar materiais ao almoxarifado.</div>
            </div>
          </div>
        </Link>
      </div>
    </div>
  );
}

