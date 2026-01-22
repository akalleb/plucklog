'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Package, ShoppingCart, Layers, AlertCircle, CheckCircle2 } from 'lucide-react';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import { Loading, Page } from '@/components/ui/Page';
import { apiUrl } from '@/lib/api';

type Origem = { tipo: 'almoxarifado' | 'sub_almoxarifado'; id: string; nome: string; quantidade_disponivel: number };
type CentralProduto = { produto_id: string; produto_nome: string; produto_codigo: string; total_disponivel: number; origens: Origem[] };
type SetorProduto = { produto_id: string; produto_nome: string; produto_codigo: string; quantidade_disponivel: number };

type SetorInfo = {
  id: string;
  nome: string;
  central_id?: string | null;
};

type CartItem = {
  produto_id: string;
  produto_nome: string;
  produto_codigo: string;
  quantidade: string;
  origem?: Origem;
  showOrigens: boolean;
  origens: Origem[];
};

export default function SaidaSetorPage() {
  const params = useParams();
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();

  const setorId = String(params.id || '');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [setor, setSetor] = useState<SetorInfo | null>(null);
  const [centralProdutos, setCentralProdutos] = useState<CentralProduto[]>([]);
  const [setorProdutos, setSetorProdutos] = useState<SetorProduto[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [selectedCentralProductId, setSelectedCentralProductId] = useState<string | null>(null);

  const [tab, setTab] = useState<'central' | 'selecionados' | 'setor'>('central');
  const [filtro, setFiltro] = useState('');
  const [undoProdutoId, setUndoProdutoId] = useState<string | null>(null);
  const [undoQuantidade, setUndoQuantidade] = useState('');
  const [undoDestinoKey, setUndoDestinoKey] = useState('');

  const fetchAll = useCallback(async (u: { id: string }) => {
    const headers = { 'X-User-Id': u.id };
    const setorRes = await fetch(apiUrl(`/api/setores/${encodeURIComponent(setorId)}`), { headers });
    const setorData = setorRes.ok ? await setorRes.json() : null;
    if (!setorRes.ok || !setorData) throw new Error('Setor não encontrado');
    setSetor(setorData);

    const centralId = setorData.central_id;
    if (!centralId) throw new Error('Setor sem central associada');

    const [resCentral, resSetor] = await Promise.all([
      fetch(apiUrl(`/api/estoque/central/${encodeURIComponent(String(centralId))}`), { headers }),
      fetch(apiUrl(`/api/estoque/setor/${encodeURIComponent(setorId)}`), { headers }),
    ]);
    const centralJson = resCentral.ok ? await resCentral.json() : { items: [] };
    const setorJson = resSetor.ok ? await resSetor.json() : { items: [] };
    setCentralProdutos(centralJson.items || []);
    setSetorProdutos(setorJson.items || []);
  }, [setorId]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) return;
    setLoading(true);
    setError('');
    fetchAll(user)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Erro ao carregar'))
      .finally(() => setLoading(false));
  }, [authLoading, user, fetchAll]);

  const centralFiltrados = useMemo(() => {
    const q = filtro.trim().toLowerCase();
    if (!q) return centralProdutos;
    return centralProdutos.filter(p => (p.produto_nome || '').toLowerCase().includes(q) || (p.produto_codigo || '').toLowerCase().includes(q));
  }, [centralProdutos, filtro]);

  const destinosByProdutoId = useMemo(() => {
    const map = new Map<string, Origem[]>();
    for (const p of centralProdutos) {
      const origens = [...(p.origens || [])].sort((a, b) => (b.quantidade_disponivel || 0) - (a.quantidade_disponivel || 0));
      map.set(p.produto_id, origens);
    }
    return map;
  }, [centralProdutos]);

  const addToCart = (p: CentralProduto) => {
    setSuccess('');
    setError('');
    setTab('selecionados');
    setSelectedCentralProductId(p.produto_id);
  };

  const addToCartFromOrigem = (p: CentralProduto, origem: Origem) => {
    setSuccess('');
    setError('');
    setTab('selecionados');
    setCart(prev => {
      if (prev.some(x => x.produto_id === p.produto_id)) return prev;
      const sortedOrigens = [...(p.origens || [])].sort((a, b) => (b.quantidade_disponivel || 0) - (a.quantidade_disponivel || 0));
      return [
        ...prev,
        {
          produto_id: p.produto_id,
          produto_nome: p.produto_nome,
          produto_codigo: p.produto_codigo,
          quantidade: '',
          origem,
          showOrigens: false,
          origens: sortedOrigens,
        },
      ];
    });
    setSelectedCentralProductId(null);
  };

  const removeFromCart = (produto_id: string) => {
    setCart(prev => prev.filter(x => x.produto_id !== produto_id));
  };

  const toggleOrigens = (produto_id: string) => {
    setCart(prev => prev.map(x => (x.produto_id === produto_id ? { ...x, showOrigens: !x.showOrigens } : x)));
  };

  const setOrigem = (produto_id: string, origem: Origem) => {
    setCart(prev => prev.map(x => (x.produto_id === produto_id ? { ...x, origem, showOrigens: false } : x)));
  };

  const setQuantidade = (produto_id: string, quantidade: string) => {
    setCart(prev => prev.map(x => (x.produto_id === produto_id ? { ...x, quantidade } : x)));
  };

  const validar = (): string | null => {
    if (!user) return 'Usuário não autenticado';
    if (!setor) return 'Setor não carregado';
    if (cart.length === 0) return 'Selecione pelo menos um produto';
    for (const item of cart) {
      const q = Number(item.quantidade);
      if (!item.origem) return `Selecione a origem para ${item.produto_nome}`;
      if (!q || q <= 0 || !Number.isInteger(q)) return `Quantidade inválida para ${item.produto_nome}`;
      if (q > (item.origem.quantidade_disponivel || 0)) return `Quantidade maior que o disponível para ${item.produto_nome}`;
    }
    return null;
  };

  const enviar = async () => {
    setSuccess('');
    setError('');
    const err = validar();
    if (err) {
      setError(err);
      return;
    }
    if (!user) return;
    setLoading(true);
    try {
      for (const item of cart) {
        const res = await fetch(apiUrl('/api/movimentacoes/distribuicao'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-User-Id': user.id },
          body: JSON.stringify({
            produto_id: item.produto_id,
            quantidade: Number(item.quantidade),
            origem_tipo: item.origem!.tipo,
            origem_id: item.origem!.id,
            destino_tipo: 'setor',
            destino_id: setorId,
            observacoes: `Saída para setor: ${setor!.nome}`,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.detail || 'Erro ao enviar');
      }
      await fetchAll(user);
      setCart([]);
      setSuccess('Saída registrada com sucesso');
      setTab('setor');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro ao enviar');
    } finally {
      setLoading(false);
    }
  };

  const iniciarEstorno = (produto_id: string) => {
    setSuccess('');
    setError('');
    setTab('setor');
    setUndoProdutoId(produto_id);
    setUndoQuantidade('');
    const opts = destinosByProdutoId.get(produto_id) || [];
    const first = opts[0];
    setUndoDestinoKey(first ? `${first.tipo}:${first.id}` : '');
  };

  const cancelarEstorno = () => {
    setUndoProdutoId(null);
    setUndoQuantidade('');
    setUndoDestinoKey('');
  };

  const confirmarEstorno = async (p: SetorProduto) => {
    setSuccess('');
    setError('');
    if (!user) return;
    if (!setor) return;
    const q = Number(undoQuantidade);
    if (!q || q <= 0 || !Number.isInteger(q)) {
      setError('Quantidade inválida para estorno');
      return;
    }
    if (q > (p.quantidade_disponivel || 0)) {
      setError('Quantidade maior que o disponível no setor');
      return;
    }
    if (!undoDestinoKey) {
      setError('Selecione o destino do estorno');
      return;
    }
    const [destino_tipo, destino_id] = undoDestinoKey.split(':');
    if (!destino_tipo || !destino_id) {
      setError('Destino inválido');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(apiUrl('/api/movimentacoes/estorno_distribuicao'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-User-Id': user.id },
        body: JSON.stringify({
          produto_id: p.produto_id,
          quantidade: q,
          origem_tipo: 'setor',
          origem_id: setorId,
          destino_tipo,
          destino_id,
          observacoes: `Estorno de envio do setor: ${setor.nome}`,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || 'Erro ao estornar');
      await fetchAll(user);
      setSuccess('Estorno realizado com sucesso');
      cancelarEstorno();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro ao estornar');
    } finally {
      setLoading(false);
    }
  };

  if (loading && !setor)
    return (
      <Page width="xl">
        <Loading />
      </Page>
    );
  if (error && !setor)
    return (
      <Page width="xl">
        <div className="text-center text-red-600">{error}</div>
      </Page>
    );

  return (
    <Page width="xl">
      <div className="mb-6 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => router.push('/saida')}
            className="flex items-center gap-2 text-gray-600 hover:text-orange-700"
          >
            <ArrowLeft className="h-4 w-4" /> Voltar
          </button>
          <div>
            <h1 className="text-xl font-bold text-gray-900">{setor?.nome || 'Setor'}</h1>
            <p className="text-xs text-gray-500">Saída de produtos para este setor</p>
          </div>
        </div>

        <button
          type="button"
          onClick={enviar}
          disabled={loading || cart.length === 0}
          className="px-4 py-2 rounded-lg bg-orange-600 text-white font-medium hover:bg-orange-700 disabled:opacity-50"
        >
          Enviar ({cart.length})
        </button>
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

      <div className="lg:hidden mb-4 grid grid-cols-3 gap-2">
        <button
          type="button"
          onClick={() => setTab('central')}
          className={`px-3 py-2 rounded-lg border text-sm font-medium ${tab === 'central' ? 'bg-orange-600 text-white border-orange-600' : 'bg-white text-gray-700 border-gray-300'}`}
        >
          Central
        </button>
        <button
          type="button"
          onClick={() => setTab('selecionados')}
          className={`px-3 py-2 rounded-lg border text-sm font-medium ${tab === 'selecionados' ? 'bg-orange-600 text-white border-orange-600' : 'bg-white text-gray-700 border-gray-300'}`}
        >
          Selecionados
        </button>
        <button
          type="button"
          onClick={() => setTab('setor')}
          className={`px-3 py-2 rounded-lg border text-sm font-medium ${tab === 'setor' ? 'bg-orange-600 text-white border-orange-600' : 'bg-white text-gray-700 border-gray-300'}`}
        >
          No Setor
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className={`${tab !== 'central' ? 'hidden' : ''} lg:block bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden`}>
          <div className="p-4 border-b border-gray-100">
            <div className="flex items-center justify-between">
              <div className="font-semibold text-gray-900 flex items-center gap-2">
                <Package className="h-5 w-5 text-orange-600" /> Produtos da Central
              </div>
              <Link href="/almoxarifados" className="text-xs text-gray-500 hover:underline">Ver hierarquia</Link>
            </div>
            <input
              type="text"
              placeholder="Buscar produto..."
              className="mt-3 w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 outline-none"
              value={filtro}
              onChange={e => setFiltro(e.target.value)}
            />
          </div>
          <div className="max-h-[70vh] overflow-auto divide-y divide-gray-100">
            {centralFiltrados.map(p => {
              const expanded = selectedCentralProductId === p.produto_id;
              return (
                <div key={p.produto_id} className="p-4">
                  <button
                    type="button"
                    onClick={() => addToCart(p)}
                    className="w-full text-left hover:bg-gray-50 rounded-lg"
                  >
                    <div className="flex items-center justify-between gap-4">
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-gray-900 truncate">{p.produto_nome}</div>
                        <div className="text-xs text-gray-500 truncate">{p.produto_codigo}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-semibold text-gray-900">{Math.round(p.total_disponivel || 0)}</div>
                        <div className="text-xs text-gray-500">disp.</div>
                      </div>
                    </div>
                    <div className="mt-2 text-xs text-orange-700">Selecionar origem</div>
                  </button>

                  {expanded && (
                    <div className="mt-2 rounded-lg border border-gray-200 overflow-hidden">
                      {(p.origens || []).length === 0 ? (
                        <div className="px-3 py-2 text-sm text-gray-500">Sem origens disponíveis.</div>
                      ) : (
                        (p.origens || [])
                          .filter(o => (o.quantidade_disponivel || 0) > 0)
                          .sort((a, b) => (b.quantidade_disponivel || 0) - (a.quantidade_disponivel || 0))
                          .map(o => (
                            <button
                              key={`${p.produto_id}:${o.tipo}:${o.id}`}
                              type="button"
                              className="w-full text-left px-3 py-2 border-b last:border-b-0 hover:bg-gray-50"
                              onClick={() => addToCartFromOrigem(p, o)}
                            >
                              <div className="flex items-center justify-between gap-3">
                                <div className="min-w-0">
                                  <div className="text-sm font-medium text-gray-900 truncate">{o.nome}</div>
                                  <div className="text-xs text-gray-500">{o.tipo}</div>
                                </div>
                              <div className="text-sm font-semibold text-gray-900">{Math.round(o.quantidade_disponivel || 0)}</div>
                              </div>
                            </button>
                          ))
                      )}
                    </div>
                  )}
                </div>
              );
            })}
            {centralFiltrados.length === 0 && (
              <div className="p-4 text-sm text-gray-500">Nenhum produto disponível.</div>
            )}
          </div>
        </div>

        <div className={`${tab !== 'selecionados' ? 'hidden' : ''} lg:block bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden`}>
          <div className="p-4 border-b border-gray-100">
            <div className="font-semibold text-gray-900 flex items-center gap-2">
              <ShoppingCart className="h-5 w-5 text-orange-600" /> Selecionados
            </div>
            <p className="text-xs text-gray-500 mt-1">Defina origem e quantidade para cada item.</p>
          </div>
          <div className="max-h-[70vh] overflow-auto divide-y divide-gray-100">
            {cart.map(item => (
              <div key={item.produto_id} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-gray-900 truncate">{item.produto_nome}</div>
                    <div className="text-xs text-gray-500 truncate">{item.produto_codigo}</div>
                  </div>
                  <button type="button" onClick={() => removeFromCart(item.produto_id)} className="text-sm text-red-600 hover:underline">
                    Remover
                  </button>
                </div>

                <div className="mt-3 grid grid-cols-1 gap-2">
                  <button
                    type="button"
                    onClick={() => toggleOrigens(item.produto_id)}
                    className="w-full flex items-center justify-between px-3 py-2 rounded-lg border border-gray-300 hover:bg-gray-50"
                  >
                    <div className="text-left">
                      <div className="text-xs text-gray-500">Origem</div>
                      <div className="text-sm font-medium text-gray-900">{item.origem ? item.origem.nome : 'Selecione'}</div>
                    </div>
                    <Layers className="h-4 w-4 text-gray-500" />
                  </button>

                  {item.showOrigens && (
                    <div className="rounded-lg border border-gray-200 overflow-hidden">
                      {item.origens.map(o => {
                        const selected = item.origem?.tipo === o.tipo && item.origem?.id === o.id;
                        return (
                          <button
                            key={`${o.tipo}:${o.id}`}
                            type="button"
                            className={`w-full text-left px-3 py-2 border-b last:border-b-0 ${selected ? 'bg-orange-50' : 'hover:bg-gray-50'}`}
                            onClick={() => setOrigem(item.produto_id, o)}
                          >
                            <div className="flex items-center justify-between gap-3">
                              <div className="min-w-0">
                                <div className="text-sm font-medium text-gray-900 truncate">{o.nome}</div>
                                <div className="text-xs text-gray-500">{o.tipo}</div>
                              </div>
                              <div className="text-sm font-semibold text-gray-900">{Math.round(o.quantidade_disponivel || 0)}</div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}

                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Quantidade</label>
                    <input
                      type="number"
                      min="1"
                      step="1"
                      max={item.origem ? item.origem.quantidade_disponivel : undefined}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 outline-none"
                      value={item.quantidade}
                      onChange={e => setQuantidade(item.produto_id, e.target.value)}
                    />
                    {item.origem && (
                      <p className="text-xs text-gray-500 mt-1">Disponível: {Math.round(item.origem.quantidade_disponivel || 0)}</p>
                    )}
                  </div>
                </div>
              </div>
            ))}
            {cart.length === 0 && (
              <div className="p-4 text-sm text-gray-500">Nenhum item selecionado.</div>
            )}
          </div>
        </div>

        <div className={`${tab !== 'setor' ? 'hidden' : ''} lg:block bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden`}>
          <div className="p-4 border-b border-gray-100">
            <div className="font-semibold text-gray-900 flex items-center gap-2">
              <Package className="h-5 w-5 text-orange-600" /> Estoque no Setor
            </div>
            <p className="text-xs text-gray-500 mt-1">Produtos já existentes e suas quantidades.</p>
          </div>
          <div className="max-h-[70vh] overflow-auto divide-y divide-gray-100">
            {setorProdutos.map(p => {
              const open = undoProdutoId === p.produto_id;
              const destinos = destinosByProdutoId.get(p.produto_id) || [];
              return (
                <div key={p.produto_id} className="p-4">
                  <div className="flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-gray-900 truncate">{p.produto_nome}</div>
                      <div className="text-xs text-gray-500 truncate">{p.produto_codigo}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-semibold text-gray-900">{Math.round(p.quantidade_disponivel || 0)}</div>
                      <div className="text-xs text-gray-500">disp.</div>
                    </div>
                  </div>

                  <div className="mt-3 flex items-center justify-between gap-3">
                    <button
                      type="button"
                      onClick={() => (open ? cancelarEstorno() : iniciarEstorno(p.produto_id))}
                      className="text-xs font-medium text-orange-700 hover:underline disabled:opacity-50"
                      disabled={loading || (p.quantidade_disponivel || 0) <= 0}
                    >
                      {open ? 'Cancelar estorno' : 'Desfazer envio'}
                    </button>
                    {destinos.length === 0 && (
                      <div className="text-xs text-gray-500">Sem destinos disponíveis na central.</div>
                    )}
                  </div>

                  {open && (
                    <div className="mt-3 grid grid-cols-1 gap-2 rounded-lg border border-gray-200 p-3">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">Destino</label>
                          <select
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 outline-none bg-white"
                            value={undoDestinoKey}
                            onChange={e => setUndoDestinoKey(e.target.value)}
                          >
                            {(destinos || []).map(d => (
                              <option key={`${d.tipo}:${d.id}`} value={`${d.tipo}:${d.id}`}>
                                {d.nome} ({d.tipo})
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">Quantidade</label>
                          <input
                            type="number"
                            min="1"
                            step="1"
                            max={p.quantidade_disponivel || 0}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 outline-none"
                            value={undoQuantidade}
                            onChange={e => setUndoQuantidade(e.target.value)}
                          />
                          <p className="text-xs text-gray-500 mt-1">No setor: {Math.round(p.quantidade_disponivel || 0)}</p>
                        </div>
                      </div>

                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => confirmarEstorno(p)}
                          disabled={loading || destinos.length === 0}
                          className="px-3 py-2 rounded-lg bg-orange-600 text-white text-sm font-medium hover:bg-orange-700 disabled:opacity-50"
                        >
                          Confirmar estorno
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
            {setorProdutos.length === 0 && (
              <div className="p-4 text-sm text-gray-500">Nenhum produto no setor.</div>
            )}
          </div>
        </div>
      </div>
    </Page>
  );
}

