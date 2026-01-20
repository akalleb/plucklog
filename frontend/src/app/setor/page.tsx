'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Package, ArrowLeftRight, ShoppingCart } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { InlineLoading } from '@/components/ui/Page';
import { apiUrl } from '@/lib/api';

type SetorInfo = { id: string; nome: string };
type EstoqueItem = { produto_id: string; produto_nome?: string; produto_codigo?: string; quantidade_disponivel: number };
type Demanda = { id: string; status: string };
type MovItem = { id: string; produto_nome: string; tipo: string; quantidade: number; data: string; origem: string; destino: string };

export default function SetorHomePage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [setor, setSetor] = useState<SetorInfo | null>(null);
  const [estoqueItems, setEstoqueItems] = useState<EstoqueItem[]>([]);
  const [demandas, setDemandas] = useState<Demanda[]>([]);
  const [movs, setMovs] = useState<MovItem[]>([]);
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
    Promise.resolve().then(() => {
      setLoading(true);
      setError('');
    });
    Promise.all([
      fetch(apiUrl(`/api/setores/${encodeURIComponent(user.scope_id)}`), { headers }).then(r => (r.ok ? r.json() : null)),
      fetch(apiUrl(`/api/estoque/setor/${encodeURIComponent(user.scope_id)}`), { headers }).then(r => (r.ok ? r.json() : { items: [] })),
      fetch(apiUrl('/api/demandas?mine=true&per_page=100'), { headers }).then(r => (r.ok ? r.json() : { items: [] })),
      fetch(apiUrl(`/api/movimentacoes/setor/${encodeURIComponent(user.scope_id)}?per_page=12`), { headers }).then(r =>
        r.ok ? r.json() : { items: [] }
      ),
    ])
      .then(([s, est, dem, mov]) => {
        if (!s) throw new Error('Setor não encontrado');
        setSetor(s);
        setEstoqueItems(Array.isArray(est?.items) ? est.items : []);
        setDemandas(Array.isArray(dem?.items) ? dem.items : []);
        setMovs(Array.isArray(mov?.items) ? mov.items : []);
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Erro ao carregar setor'))
      .finally(() => setLoading(false));
  }, [authLoading, user, router]);

  const formatDateTime = (value?: string | null) => {
    if (!value) return '-';
    const normalized =
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(value) ? `${value}Z` : value;
    return new Date(normalized).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  const estoqueResumo = useMemo(() => {
    const items = estoqueItems || [];
    let zerado = 0;
    let baixo = 0;
    let totalDisponivel = 0;
    for (const it of items) {
      const disp = Number(it?.quantidade_disponivel ?? 0);
      const v = Number.isFinite(disp) ? disp : 0;
      totalDisponivel += v;
      if (v <= 0) zerado += 1;
      else if (v <= 5) baixo += 1;
    }
    return {
      totalProdutos: items.length,
      zerado,
      baixo,
      totalDisponivel,
    };
  }, [estoqueItems]);

  const baixoEstoque = useMemo(() => {
    const list = (estoqueItems || [])
      .filter(i => {
        const v = Number(i?.quantidade_disponivel ?? 0);
        return Number.isFinite(v) && v > 0 && v <= 5;
      })
      .map(i => ({
        produto_id: String(i.produto_id || ''),
        produto_nome: String(i.produto_nome || ''),
        produto_codigo: String(i.produto_codigo || ''),
        quantidade_disponivel: Number(i.quantidade_disponivel || 0),
      }))
      .filter(i => i.produto_id);
    list.sort((a, b) => a.quantidade_disponivel - b.quantidade_disponivel || a.produto_nome.localeCompare(b.produto_nome));
    return list.slice(0, 12);
  }, [estoqueItems]);

  const enviadosRecentes = useMemo(() => {
    const setorNome = String(setor?.nome || '').trim();
    const list = (movs || []).filter(m => (m.tipo || '').toLowerCase() === 'distribuicao' || (!!setorNome && m.destino === setorNome));
    return list.slice(0, 10);
  }, [movs, setor?.nome]);

  const demandasResumo = useMemo(() => {
    const items = demandas || [];
    let pendente = 0;
    let parcial = 0;
    let atendido = 0;
    let outras = 0;
    for (const d of items) {
      const st = String(d?.status || '').trim().toLowerCase();
      if (st === 'pendente') pendente += 1;
      else if (st === 'parcial') parcial += 1;
      else if (st === 'atendido') atendido += 1;
      else outras += 1;
    }
    return { total: items.length, pendente, parcial, atendido, outras };
  }, [demandas]);

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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <div className="flex items-center justify-between gap-3 mb-3">
            <div className="font-semibold text-gray-900">Resumo do Estoque</div>
            <Link href="/setor/estoque" className="text-sm text-blue-600 hover:underline">
              Ver estoque
            </Link>
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-lg bg-gray-50 p-3">
              <div className="text-gray-500">Produtos</div>
              <div className="font-semibold text-gray-900">{loading ? '-' : estoqueResumo.totalProdutos}</div>
            </div>
            <div className="rounded-lg bg-gray-50 p-3">
              <div className="text-gray-500">Disponível total</div>
              <div className="font-semibold text-gray-900">{loading ? '-' : estoqueResumo.totalDisponivel.toFixed(2)}</div>
            </div>
            <div className="rounded-lg bg-gray-50 p-3">
              <div className="text-gray-500">Baixo (≤ 5)</div>
              <div className="font-semibold text-gray-900">{loading ? '-' : estoqueResumo.baixo}</div>
            </div>
            <div className="rounded-lg bg-gray-50 p-3">
              <div className="text-gray-500">Zerado</div>
              <div className="font-semibold text-gray-900">{loading ? '-' : estoqueResumo.zerado}</div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <div className="flex items-center justify-between gap-3 mb-3">
            <div className="font-semibold text-gray-900">Resumo de Demandas</div>
            <Link href="/setor/demandas" className="text-sm text-green-700 hover:underline">
              Ver demandas
            </Link>
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-lg bg-gray-50 p-3">
              <div className="text-gray-500">Pendentes</div>
              <div className="font-semibold text-gray-900">{loading ? '-' : demandasResumo.pendente}</div>
            </div>
            <div className="rounded-lg bg-gray-50 p-3">
              <div className="text-gray-500">Parciais</div>
              <div className="font-semibold text-gray-900">{loading ? '-' : demandasResumo.parcial}</div>
            </div>
            <div className="rounded-lg bg-gray-50 p-3">
              <div className="text-gray-500">Atendidas</div>
              <div className="font-semibold text-gray-900">{loading ? '-' : demandasResumo.atendido}</div>
            </div>
            <div className="rounded-lg bg-gray-50 p-3">
              <div className="text-gray-500">Total</div>
              <div className="font-semibold text-gray-900">{loading ? '-' : demandasResumo.total}</div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <div className="flex items-center justify-between gap-3 mb-3">
            <div className="font-semibold text-gray-900">Produtos Recentemente Enviados</div>
            <Link href="/setor/estoque" className="text-sm text-blue-600 hover:underline">
              Ver estoque
            </Link>
          </div>
          {loading ? (
            <div className="text-sm text-gray-500">
              <InlineLoading label="Carregando" />
            </div>
          ) : enviadosRecentes.length === 0 ? (
            <div className="text-sm text-gray-500 italic">Nenhum envio recente.</div>
          ) : (
            <div className="space-y-3">
              {enviadosRecentes.map(m => (
                <div key={m.id} className="flex items-start justify-between gap-4 pb-3 border-b border-gray-100 last:border-0">
                  <div className="min-w-0">
                    <div className="font-medium text-gray-900 truncate">{m.produto_nome}</div>
                    <div className="text-xs text-gray-500 truncate">
                      {m.origem} &rarr; {m.destino} · {formatDateTime(m.data)}
                    </div>
                  </div>
                  <div className="font-semibold text-gray-900 whitespace-nowrap">+{Number(m.quantidade || 0).toFixed(2)}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <div className="flex items-center justify-between gap-3 mb-3">
            <div className="font-semibold text-gray-900">Estoque Baixo (≤ 5)</div>
            <Link href="/setor/estoque" className="text-sm text-blue-600 hover:underline">
              Ver estoque
            </Link>
          </div>
          {loading ? (
            <div className="text-sm text-gray-500">
              <InlineLoading label="Carregando" />
            </div>
          ) : baixoEstoque.length === 0 ? (
            <div className="text-sm text-gray-500 italic">Nenhum item com estoque baixo.</div>
          ) : (
            <div className="space-y-3">
              {baixoEstoque.map(i => (
                <div key={i.produto_id} className="flex items-start justify-between gap-4 pb-3 border-b border-gray-100 last:border-0">
                  <div className="min-w-0">
                    <div className="font-medium text-gray-900 truncate">{i.produto_nome || i.produto_id}</div>
                    <div className="text-xs text-gray-500 truncate">Cód: {i.produto_codigo || '-'}</div>
                  </div>
                  <div className="font-semibold text-gray-900 whitespace-nowrap">{Number(i.quantidade_disponivel || 0).toFixed(2)}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

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
