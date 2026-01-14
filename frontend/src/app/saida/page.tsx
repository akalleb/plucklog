'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { MapPin, Search } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { Loading, Page } from '@/components/ui/Page';
import { apiUrl } from '@/lib/api';

interface Central {
  id: string;
  nome: string;
}

interface Setor {
  id: string;
  nome: string;
  central_id?: string | null;
}

export default function SaidaPage() {
  const { user, loading: authLoading } = useAuth();
  const [loading, setLoading] = useState(true);
  const [centrais, setCentrais] = useState<Central[]>([]);
  const [setores, setSetores] = useState<Setor[]>([]);
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (authLoading) return;
    if (!user) return;
    const headers = { 'X-User-Id': user.id };
    Promise.all([
      fetch(apiUrl('/api/centrais'), { headers }).then(r => (r.ok ? r.json() : [])),
      fetch(apiUrl('/api/setores'), { headers }).then(r => (r.ok ? r.json() : [])),
    ])
      .then(([c, sets]) => {
        setCentrais(c);
        setSetores(sets);
      })
      .finally(() => setLoading(false));
  }, [authLoading, user]);

  const centralNameById = useMemo(() => new Map(centrais.map(c => [c.id, c.nome])), [centrais]);

  const grupos = useMemo(() => {
    const allowedCentralIds = user?.role === 'super_admin' ? null : new Set(centrais.map(c => String(c.id)));
    const scopedSetores =
      !allowedCentralIds
        ? setores
        : setores.filter(s => {
            const cid = s.central_id ? String(s.central_id) : '';
            if (!cid) return false;
            return allowedCentralIds.has(cid);
          });

    const q = query.trim().toLowerCase();
    const view = !q
      ? scopedSetores
      : scopedSetores.filter(s => {
          const nome = (s.nome || '').toLowerCase();
          const cid = s.central_id ? String(s.central_id) : '';
          const cNome = (centralNameById.get(cid) || cid || '-').toLowerCase();
          return nome.includes(q) || cNome.includes(q);
        });

    const byCentral = new Map<string, Setor[]>();
    for (const s of view) {
      const cid = s.central_id ? String(s.central_id) : '';
      const key = cid || '-';
      const arr = byCentral.get(key) || [];
      arr.push(s);
      byCentral.set(key, arr);
    }

    const out = [...byCentral.entries()].map(([centralId, list]) => {
      const centralNome = centralId === '-' ? '-' : (centralNameById.get(centralId) || centralId);
      const setoresOrdenados = [...list].sort((a, b) => a.nome.localeCompare(b.nome));
      return { centralId, centralNome, setores: setoresOrdenados };
    });

    out.sort((a, b) => {
      if (a.centralId === '-' && b.centralId !== '-') return 1;
      if (b.centralId === '-' && a.centralId !== '-') return -1;
      return a.centralNome.localeCompare(b.centralNome);
    });

    return out;
  }, [centralNameById, centrais, query, setores, user?.role]);

  if (!user) return null;
  if (loading) {
    return (
      <Page width="lg">
        <Loading />
      </Page>
    );
  }

  return (
    <Page width="lg">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <MapPin className="h-6 w-6 text-orange-600" />
          Saída para Setores
        </h1>
        <p className="text-gray-500 mt-1">Selecione um setor para registrar saídas.</p>
      </div>

      <div className="mb-4 bg-white rounded-xl border border-gray-200 shadow-sm p-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Buscar setor..."
            className="w-full pl-10 pr-4 py-2 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-orange-500"
          />
        </div>
      </div>

      {grupos.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-500">Nenhum setor encontrado.</div>
      ) : (
        <div className="space-y-6">
          {grupos.map(g => (
            <div key={g.centralId}>
              <div className="mb-3 flex items-end justify-between gap-3">
                <div>
                  <div className="text-xs text-gray-500">Central</div>
                  <div className="text-lg font-semibold text-gray-900">{g.centralNome}</div>
                </div>
                <div className="text-xs text-gray-500">{g.setores.length} setores</div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {g.setores.map(s => (
                  <Link
                    key={s.id}
                    href={`/saida/${s.id}`}
                    className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 hover:bg-gray-50 transition-colors"
                  >
                    <div className="font-semibold text-gray-900">{s.nome}</div>
                    <div className="text-xs text-gray-500 mt-1">{`Central: ${g.centralNome}`}</div>
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </Page>
  );
}
