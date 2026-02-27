'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Truck, Send, Search, AlertCircle, CheckCircle2, ChevronDown, ChevronRight } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { Page } from '@/components/ui/Page';
import { apiUrl, apiFetch } from '@/lib/api';

interface Central {
  id: string;
  nome: string;
}

interface SubAlmoxarifado {
  id: string;
  nome: string;
  almoxarifado_id?: string;
}

interface Setor {
  id: string;
  nome: string;
  central_id?: string | null;
}

interface ProdutoResumo {
  id: string;
  nome: string;
  codigo?: string;
  unidade?: string;
  categoria?: string;
}

interface ProdutoDetalhes {
  id: string;
  nome: string;
  codigo: string;
  unidade?: string;
  categoria?: string;
  estoque_locais: Array<{
    local_id?: string | null;
    local_nome: string;
    local_tipo: string;
    quantidade: number;
    quantidade_disponivel?: number;
  }>;
}

export default function DistribuicaoPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const [produtoQuery, setProdutoQuery] = useState('');
  const [produtoResults, setProdutoResults] = useState<ProdutoResumo[]>([]);
  const [produtoSelected, setProdutoSelected] = useState<ProdutoResumo | null>(null);
  const [produtoDetalhes, setProdutoDetalhes] = useState<ProdutoDetalhes | null>(null);
  const [searching, setSearching] = useState(false);
  const [showProdutoDropdown, setShowProdutoDropdown] = useState(false);
  const [showEvidencias, setShowEvidencias] = useState(false);
  const searchSeq = useRef(0);
  
  const [centrais, setCentrais] = useState<Central[]>([]);
  const [subAlmoxarifados, setSubAlmoxarifados] = useState<SubAlmoxarifado[]>([]);
  const [setores, setSetores] = useState<Setor[]>([]);
  const [includeInterCentral, setIncludeInterCentral] = useState(false);
  
  const [formData, setFormData] = useState({
    quantidade: '',
    origem_tipo: 'almoxarifado',
    origem_id: '',
    destino_tipo: 'setor',
    destino_id: '',
    observacoes: ''
  });

  useEffect(() => {
    if (authLoading) return;
    if (!user) return;
    const includeAll = ['super_admin', 'admin_central', 'gerente_almox', 'resp_sub_almox'].includes(user.role);
    const qsCentrais = includeAll ? '?include_all=1' : '';
    const qsInter = includeInterCentral ? '?include_inter_central=1' : '';
    Promise.all([
      apiFetch(`/api/centrais${qsCentrais}`).then(r => (r.ok ? r.json() : [])),
      apiFetch(`/api/sub_almoxarifados${qsInter}`).then(r => (r.ok ? r.json() : [])),
      apiFetch(`/api/setores${qsInter}`).then(r => (r.ok ? r.json() : [])),
    ]).then(([c, s, sets]) => {
      setCentrais(c);
      setSubAlmoxarifados(s);
      setSetores(sets);
    }).catch(() => setError('Erro ao carregar hierarquia'));
  }, [authLoading, includeInterCentral, user]);

  useEffect(() => {
    if (!formData.destino_id) return;
    if (formData.destino_tipo === 'sub_almoxarifado') {
      if (subAlmoxarifados.some(s => s.id === formData.destino_id)) return;
    } else if (formData.destino_tipo === 'setor') {
      if (setores.some(s => s.id === formData.destino_id)) return;
    }
    setFormData(prev => ({ ...prev, destino_id: '' }));
  }, [formData.destino_id, formData.destino_tipo, setores, subAlmoxarifados]);

  useEffect(() => {
    if (!produtoQuery.trim()) {
      setProdutoResults([]);
      setSearching(false);
      return;
    }
    if (!user) return;
    const mySeq = ++searchSeq.current;
    setSearching(true);
    const t = setTimeout(() => {
      apiFetch(`/api/produtos/search?q=${encodeURIComponent(produtoQuery.trim())}`)
        .then(async r => (r.ok ? r.json() : []))
        .then((data: ProdutoResumo[]) => {
          if (mySeq !== searchSeq.current) return;
          setProdutoResults(data);
          setShowProdutoDropdown(true);
        })
        .catch(() => {
          if (mySeq !== searchSeq.current) return;
          setProdutoResults([]);
        })
        .finally(() => {
          if (mySeq !== searchSeq.current) return;
          setSearching(false);
        });
    }, 250);
    return () => clearTimeout(t);
  }, [produtoQuery, user]);

  useEffect(() => {
    if (!produtoSelected) {
      setProdutoDetalhes(null);
      return;
    }
    if (!user) return;
    apiFetch(`/api/produtos/${encodeURIComponent(produtoSelected.id)}`)
      .then(async r => (r.ok ? r.json() : null))
      .then((data: ProdutoDetalhes | null) => setProdutoDetalhes(data))
      .catch(() => setProdutoDetalhes(null));
  }, [produtoSelected, user]);

  const evidencias = useMemo(() => {
    const items = produtoDetalhes?.estoque_locais || [];
    return items
      .map(i => ({
        ...i,
        quantidade_disponivel: typeof i.quantidade_disponivel === 'number' ? i.quantidade_disponivel : i.quantidade,
      }))
      .sort((a, b) => (b.quantidade_disponivel || 0) - (a.quantidade_disponivel || 0));
  }, [produtoDetalhes]);

  const subById = useMemo(() => new Map(subAlmoxarifados.map(s => [s.id, s])), [subAlmoxarifados]);

  const origensDisponiveis = useMemo(() => {
    const base = evidencias.filter(
      e => (e.local_tipo === 'almoxarifado' || e.local_tipo === 'sub_almoxarifado') && (e.quantidade_disponivel || 0) > 0 && e.local_id
    );

    if (!user) return [];
    if (user.role === 'super_admin') return base;

    const scopeId = user.scope_id || '';
    if (!scopeId) return [];

    const isAllowed = (tipo: string, id: string) => {
      if (user.role === 'resp_sub_almox') {
        return tipo === 'sub_almoxarifado' && id === scopeId;
      }

      if (user.role === 'gerente_almox') {
        if (tipo === 'almoxarifado') return id === scopeId;
        if (tipo === 'sub_almoxarifado') {
          const sub = subById.get(id);
          return !!sub?.almoxarifado_id && sub.almoxarifado_id === scopeId;
        }
        return false;
      }

      if (user.role === 'admin_central') {
        return tipo === 'almoxarifado' || tipo === 'sub_almoxarifado';
      }

      return false;
    };

    return base.filter(o => isAllowed(o.local_tipo, o.local_id || ''));
  }, [evidencias, subById, user]);

  const [destinoQuery, setDestinoQuery] = useState('');
  const centralById = useMemo(() => new Map(centrais.map(c => [c.id, c])), [centrais]);

  const destinoOptions = useMemo(() => {
    const q = destinoQuery.trim().toLowerCase();
    const match = (name?: string) => !q || (name || '').toLowerCase().includes(q);

    if (formData.destino_tipo === 'sub_almoxarifado') {
      return subAlmoxarifados
        .filter(s => match(s.nome))
        .map(s => {
          return { id: s.id, tipo: 'sub_almoxarifado', nome: s.nome, extra: '' };
        });
    }

    if (formData.destino_tipo === 'setor') {
      return setores
        .filter(s => match(s.nome))
        .map(s => {
          const cid = s.central_id ? String(s.central_id) : '';
          const central = cid ? centralById.get(cid) : undefined;
          return { id: s.id, tipo: 'setor', nome: s.nome, extra: central ? `Central: ${central.nome}` : '' };
        });
    }

    return [];
  }, [centralById, destinoQuery, formData.destino_tipo, setores, subAlmoxarifados]);

  const origemDisponivel = useMemo(() => {
    if (!formData.origem_id) return null;
    const found = origensDisponiveis.find(o => o.local_tipo === formData.origem_tipo && o.local_id === formData.origem_id);
    return found ? (found.quantidade_disponivel || 0) : null;
  }, [formData.origem_id, formData.origem_tipo, origensDisponiveis]);

  const getLocalBadge = (tipo: string) => {
    if (tipo === 'central') return { label: 'Central', className: 'bg-purple-50 text-purple-700 border-purple-200' };
    if (tipo === 'almoxarifado') return { label: 'Almox', className: 'bg-blue-50 text-blue-700 border-blue-200' };
    if (tipo === 'sub_almoxarifado') return { label: 'Sub', className: 'bg-gray-50 text-gray-700 border-gray-200' };
    if (tipo === 'setor') return { label: 'Setor', className: 'bg-green-50 text-green-700 border-green-200' };
    return { label: tipo, className: 'bg-slate-50 text-slate-700 border-slate-200' };
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess(false);

    try {
      if (!user) throw new Error('Usuário não autenticado');
      if (!produtoSelected) throw new Error('Selecione um produto');
      const origemId = formData.origem_id;
      if (!origemId) throw new Error('Selecione a origem');
      const qtd = Number(formData.quantidade);
      if (!qtd || qtd <= 0 || !Number.isInteger(qtd)) throw new Error('Quantidade inválida');
      if (origemDisponivel !== null && qtd > origemDisponivel) throw new Error('Quantidade maior que o disponível na origem');

      if (!formData.destino_id) throw new Error('Selecione o destino');

      const res = await apiFetch('/api/movimentacoes/distribuicao', {
        method: 'POST',
        body: JSON.stringify({
          produto_id: produtoSelected.id,
          quantidade: qtd,
          origem_tipo: formData.origem_tipo,
          origem_id: origemId,
          destino_tipo: formData.destino_tipo,
          destino_id: formData.destino_id,
          observacoes: formData.observacoes || undefined
        })
      });
      
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Erro ao processar distribuição');
      
      setSuccess(true);
      setTimeout(() => router.push('/movimentacoes'), 1500);
      
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao processar distribuição');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Page width="md">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Truck className="h-6 w-6 text-orange-600" />
          Distribuição de Produtos
        </h1>
        <p className="text-gray-500 mt-1">Envie produtos do almoxarifado para setores ou outros locais.</p>
      </div>

      <div className="soft-card overflow-hidden">
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          
          {error && (
            <div className="bg-red-50 text-red-700 p-4 rounded-lg flex items-center gap-2 text-sm">
              <AlertCircle className="h-4 w-4" /> {error}
            </div>
          )}
          
          {success && (
            <div className="bg-green-50 text-green-700 p-4 rounded-lg flex items-center gap-2 text-sm">
              <CheckCircle2 className="h-4 w-4" /> Distribuição realizada com sucesso!
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Produto (ID/Código)</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  required
                  type="text"
                  placeholder="Digite o ID ou Código do produto..."
                  className="soft-input w-full pl-10 pr-4 py-2 outline-none"
                  value={produtoQuery}
                  onFocus={() => setShowProdutoDropdown(true)}
                  onBlur={() => setTimeout(() => setShowProdutoDropdown(false), 150)}
                  onChange={e => {
                    setProdutoQuery(e.target.value);
                    setProdutoSelected(null);
                    setProdutoDetalhes(null);
                    setFormData({
                      ...formData,
                      origem_id: '',
                      quantidade: ''
                    });
                  }}
                />
                {showProdutoDropdown && (produtoResults.length > 0 || searching) && (
                  <div className="absolute z-20 mt-2 w-full soft-card overflow-hidden">
                    {searching && (
                      <div className="px-3 py-2 text-sm text-gray-500">Buscando...</div>
                    )}
                    {produtoResults.slice(0, 10).map(p => (
                      <button
                        type="button"
                        key={p.id}
                        className="w-full text-left px-3 py-2 hover:bg-gray-50"
                        onClick={() => {
                          setProdutoSelected(p);
                          setProdutoQuery(`${p.nome}${p.codigo ? ` (${p.codigo})` : ''}`);
                          setShowProdutoDropdown(false);
                          setFormData({
                            ...formData,
                            origem_id: '',
                            quantidade: ''
                          });
                        }}
                      >
                        <div className="text-sm font-medium text-gray-900">{p.nome}</div>
                        <div className="text-xs text-gray-500 flex gap-2 flex-wrap">
                          {p.codigo && <span>Cód: {p.codigo}</span>}
                          {p.unidade && <span>Un: {p.unidade}</span>}
                          {p.categoria && <span>Cat: {p.categoria}</span>}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {produtoSelected && (
                <div className="mt-2 p-3 rounded-lg border border-orange-200 bg-orange-50 text-sm">
                  <div className="font-semibold text-orange-900">{produtoSelected.nome}</div>
                  <div className="text-orange-800 text-xs flex gap-2 flex-wrap">
                    <span>ID: {produtoSelected.id}</span>
                    {produtoSelected.codigo && <span>Código: {produtoSelected.codigo}</span>}
                    {produtoSelected.unidade && <span>Unidade: {produtoSelected.unidade}</span>}
                    {produtoSelected.categoria && <span>Categoria: {produtoSelected.categoria}</span>}
                  </div>
                </div>
              )}
            </div>

            {produtoDetalhes && (
              <div className="col-span-2">
                <button
                  type="button"
                  className="soft-btn w-full flex items-center justify-between p-3 text-left"
                  onClick={() => setShowEvidencias(v => !v)}
                >
                  <div className="text-left">
                    <div className="text-sm font-medium text-gray-900">Evidências de Estoque (por local)</div>
                    <div className="text-xs text-gray-500">{evidencias.length} locais encontrados</div>
                  </div>
                  {showEvidencias ? <ChevronDown className="h-5 w-5 text-gray-500" /> : <ChevronRight className="h-5 w-5 text-gray-500" />}
                </button>

                {showEvidencias && (
                  <div className="mt-2 grid grid-cols-1 gap-2">
                    {evidencias.map((e, idx) => {
                      const badge = getLocalBadge(e.local_tipo);
                      return (
                        <div key={`${e.local_tipo}-${e.local_id}-${idx}`} className="soft-card p-3 flex items-center justify-between">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className={`text-[10px] px-2 py-0.5 rounded-full border ${badge.className}`}>{badge.label}</span>
                              <div className="text-sm font-medium text-gray-900 truncate">{e.local_nome}</div>
                            </div>
                            <div className="text-xs text-gray-500 truncate">{e.local_id || '-'}</div>
                          </div>
                          <div className="text-right">
                            <div className="text-sm font-semibold text-gray-900">{Math.round(e.quantidade_disponivel || 0)}</div>
                            <div className="text-xs text-gray-500">disp.</div>
                          </div>
                        </div>
                      );
                    })}
                    {evidencias.length === 0 && (
                      <div className="text-sm text-gray-500">Nenhum estoque encontrado para este produto.</div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Origem */}
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Origem (Saindo de)</label>
              {produtoDetalhes && origensDisponiveis.length > 0 && (
                <div className="mb-2">
                  <div className="text-xs text-gray-500 mb-2">Locais com saldo disponível (toque para selecionar)</div>
                  <div className="grid grid-cols-1 gap-2">
                    {origensDisponiveis.map(o => {
                      const selected = (formData.origem_tipo === o.local_tipo) && (formData.origem_id === o.local_id);
                      return (
                        <button
                          key={`${o.local_tipo}-${o.local_id}`}
                          type="button"
                          className={`w-full text-left p-3 rounded-lg border transition-colors ${selected ? 'border-orange-400 bg-orange-50' : 'border-gray-200 bg-white hover:bg-gray-50'}`}
                          onClick={() => {
                            setFormData({
                              ...formData,
                              origem_tipo: o.local_tipo,
                              origem_id: o.local_id || '',
                            });
                          }}
                        >
                          <div className="flex items-center justify-between gap-4">
                            <div className="min-w-0">
                              <div className="text-sm font-medium text-gray-900 truncate">{o.local_nome}</div>
                              <div className="text-xs text-gray-500">{o.local_tipo}</div>
                            </div>
                            <div className="text-sm font-semibold text-gray-900">{Math.round(o.quantidade_disponivel || 0)}</div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
              {produtoDetalhes && origensDisponiveis.length === 0 && (
                <div className="text-sm text-gray-500">Sem saldo disponível em Almox/Sub para este produto.</div>
              )}
              {formData.origem_id && (
                <div className="mt-2 flex items-center justify-between p-3 rounded-lg border border-orange-200 bg-orange-50">
                  <div className="text-sm text-orange-900">
                    Origem selecionada: <span className="font-semibold">{formData.origem_tipo}</span> #{formData.origem_id}
                  </div>
                  <button
                    type="button"
                    className="text-sm text-orange-700 hover:underline"
                    onClick={() => setFormData({ ...formData, origem_id: '' })}
                  >
                    Limpar
                  </button>
                </div>
              )}
            </div>

            {/* Quantidade */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Quantidade a Enviar</label>
              <input 
                type="number" 
                required
                min="1"
                step="1"
                max={origemDisponivel !== null ? origemDisponivel : undefined}
                className="soft-input w-full px-4 py-2 outline-none"
                value={formData.quantidade}
                onChange={e => setFormData({...formData, quantidade: e.target.value})}
              />
              {origemDisponivel !== null && (
                <p className="text-xs text-gray-500 mt-1">Disponível na origem: {Math.round(origemDisponivel)}</p>
              )}
            </div>

            {/* Destino */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Destino</label>
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    className="h-4 w-4"
                    checked={includeInterCentral}
                    onChange={e => setIncludeInterCentral(e.target.checked)}
                  />
                  Incluir destinos &quot;Receber de Outra Central&quot;
                </label>
                <div className="flex gap-2">
                  {(['setor', 'sub_almoxarifado'] as const).map(t => {
                    const active = formData.destino_tipo === t;
                    const label = t === 'setor' ? 'Setor' : t === 'sub_almoxarifado' ? 'Sub' : 'Almox';
                    return (
                      <button
                        key={t}
                        type="button"
                        className={`flex-1 px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
                          active ? 'bg-orange-600 text-white border-orange-600' : 'soft-btn text-gray-700'
                        }`}
                        onClick={() => setFormData({ ...formData, destino_tipo: t, destino_id: '' })}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>

                <input
                  type="text"
                  placeholder="Buscar destino..."
                  className="soft-input w-full px-4 py-2 outline-none"
                  value={destinoQuery}
                  onChange={e => setDestinoQuery(e.target.value)}
                />

                <div className="max-h-64 overflow-auto soft-card divide-y divide-gray-100">
                  {destinoOptions.length === 0 ? (
                    <div className="px-3 py-3 text-sm text-gray-500">Nenhum destino encontrado.</div>
                  ) : (
                    destinoOptions.slice(0, 100).map(d => {
                      const badge = getLocalBadge(d.tipo);
                      const selected = formData.destino_tipo === d.tipo && formData.destino_id === d.id;
                      return (
                        <button
                          key={`${d.tipo}-${d.id}`}
                          type="button"
                          className={`w-full text-left px-3 py-3 transition-colors ${
                            selected ? 'bg-orange-50' : 'hover:bg-gray-50'
                          }`}
                          onClick={() => setFormData({ ...formData, destino_tipo: d.tipo, destino_id: d.id })}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <span className={`text-[10px] px-2 py-0.5 rounded-full border ${badge.className}`}>{badge.label}</span>
                                <div className="text-sm font-medium text-gray-900 truncate">{d.nome}</div>
                              </div>
                              {d.extra && <div className="text-xs text-gray-500 truncate mt-0.5">{d.extra}</div>}
                            </div>
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>

                {formData.destino_id && (
                  <div className="flex items-center justify-between p-3 rounded-lg border border-orange-200 bg-orange-50">
                    <div className="text-sm text-orange-900">
                      Destino selecionado: <span className="font-semibold">{formData.destino_tipo}</span> #{formData.destino_id}
                    </div>
                    <button
                      type="button"
                      className="text-sm text-orange-700 hover:underline"
                      onClick={() => setFormData({ ...formData, destino_id: '' })}
                    >
                      Limpar
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Observações */}
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Observações / Motivo</label>
              <textarea 
                rows={2}
                className="w-full px-4 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-orange-500 outline-none"
                value={formData.observacoes}
                onChange={e => setFormData({...formData, observacoes: e.target.value})}
              />
            </div>
          </div>

          <div className="flex justify-end pt-4 border-t border-gray-100">
            <button 
              type="submit" 
              disabled={loading}
              className="flex items-center gap-2 px-6 py-2 bg-orange-600 text-white font-medium rounded-lg hover:bg-orange-700 disabled:opacity-50 transition-colors"
            >
              {loading ? 'Processando...' : <><Send className="h-4 w-4" /> Confirmar Distribuição</>}
            </button>
          </div>
        </form>
      </div>
    </Page>
  );
}
