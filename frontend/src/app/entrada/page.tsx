'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { PackagePlus, Save, Search, AlertCircle, CheckCircle2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { Page } from '@/components/ui/Page';
import { apiUrl, apiFetch } from '@/lib/api';

interface Central {
  id: string;
  nome: string;
}

interface Almoxarifado {
  id: string;
  nome: string;
  central_id?: string;
}

interface SubAlmoxarifado {
  id: string;
  nome: string;
  almoxarifado_id?: string;
}

interface ProdutoResumo {
  id: string;
  nome: string;
  codigo?: string;
  unidade?: string;
  categoria?: string;
}

const normalizeId = (value: unknown) => {
  if (value == null) return '';
  const s = String(value).trim();
  const m = s.match(/^ObjectId\(["']([0-9a-fA-F]{24})["']\)$/);
  return (m?.[1] || s).trim();
};

const idCandidates = (value: unknown) => {
  const s = normalizeId(value);
  if (!s) return [];
  const out = [s];
  if (/^\d+$/.test(s)) out.push(String(parseInt(s, 10)));
  return Array.from(new Set(out));
};

const idEq = (a: unknown, b: unknown) => {
  const as = new Set(idCandidates(a));
  return idCandidates(b).some(x => as.has(x));
};

export default function NovaEntradaPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const [searching, setSearching] = useState(false);
  const [produtoQuery, setProdutoQuery] = useState('');
  const [produtoResults, setProdutoResults] = useState<ProdutoResumo[]>([]);
  const [produtoSelected, setProdutoSelected] = useState<ProdutoResumo | null>(null);
  const [showProdutoDropdown, setShowProdutoDropdown] = useState(false);
  const searchSeq = useRef(0);

  const [centrais, setCentrais] = useState<Central[]>([]);
  const [almoxarifados, setAlmoxarifados] = useState<Almoxarifado[]>([]);
  const [subAlmoxarifados, setSubAlmoxarifados] = useState<SubAlmoxarifado[]>([]);
  
  // Form State
  const [formData, setFormData] = useState({
    quantidade: '',
    preco_unitario: '',
    central_id: '',
    almoxarifado_id: '',
    sub_almoxarifado_id: '',
    destino_is_sub: false,
    fornecedor: '',
    nota_fiscal: '',
    observacoes: '',
    lote: '',
    data_validade: ''
  });

  useEffect(() => {
    if (authLoading) return;
    if (!user) return;
    if (user.role === 'operador_setor') {
      router.replace('/setor');
    }
  }, [authLoading, router, user]);

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
    if (authLoading) return;
    if (!user) return;
    Promise.all([
      apiFetch('/api/centrais').then(r => r.ok ? r.json() : []),
      apiFetch('/api/almoxarifados').then(r => r.ok ? r.json() : []),
      apiFetch('/api/sub_almoxarifados').then(r => r.ok ? r.json() : [])
    ]).then(([c, a, s]) => {
      setCentrais(c);
      setAlmoxarifados(a);
      setSubAlmoxarifados(s);
    }).catch(() => {
      setError('Erro ao carregar hierarquia');
    });
  }, [authLoading, user]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) return;
    if (user.role !== 'resp_sub_almox') return;
    if (!user.scope_id) return;

    setFormData(prev => {
      let changed = false;
      const next = { ...prev };

      if (!next.destino_is_sub) {
        next.destino_is_sub = true;
        changed = true;
      }
      const sub = subAlmoxarifados.find(s => idEq(s.id, user.scope_id));
      const subId = sub?.id || user.scope_id || '';
      const almoxIdRaw = sub?.almoxarifado_id || '';
      const almox = almoxarifados.find(a => idEq(a.id, almoxIdRaw));
      const almoxId = almox?.id || almoxIdRaw;
      const centralId = almox?.central_id || user.central_id || (centrais.length === 1 ? centrais[0]?.id : '');

      if (subId && !next.sub_almoxarifado_id) {
        next.sub_almoxarifado_id = subId;
        changed = true;
      }

      if (centralId && !next.central_id) {
        next.central_id = centralId;
        changed = true;
      }
      if (almoxId && !next.almoxarifado_id) {
        next.almoxarifado_id = almoxId;
        changed = true;
      }

      return changed ? next : prev;
    });
  }, [almoxarifados, authLoading, centrais, subAlmoxarifados, user]);

  const almoxOptions = useMemo(() => {
    if (!formData.central_id) return [];
    return almoxarifados.filter(a => a.central_id === formData.central_id);
  }, [almoxarifados, formData.central_id]);

  const subOptions = useMemo(() => {
    if (!formData.almoxarifado_id) return [];
    return subAlmoxarifados.filter(s => s.almoxarifado_id === formData.almoxarifado_id);
  }, [subAlmoxarifados, formData.almoxarifado_id]);

  const allowDecimalQuantidade = useMemo(() => {
    const u = (produtoSelected?.unidade || '').trim().toUpperCase();
    return u === 'KG' || u === 'L' || u === 'MT';
  }, [produtoSelected?.unidade]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess(false);

    try {
      if (!user) throw new Error('Usuário não autenticado');
      if (!produtoSelected) throw new Error('Selecione um produto');

      const destinoTipo = formData.destino_is_sub ? 'sub_almoxarifado' : 'almoxarifado';
      const destinoId = formData.destino_is_sub ? formData.sub_almoxarifado_id : formData.almoxarifado_id;

      if (!destinoId) throw new Error('Selecione o destino');
      if (!formData.lote.trim()) throw new Error('Lote é obrigatório');
      if (!formData.data_validade) throw new Error('Validade é obrigatória');

      const dataValidade = new Date(`${formData.data_validade}T00:00:00`).toISOString();
      const quantidade = Number(formData.quantidade);
      if (!Number.isFinite(quantidade) || quantidade <= 0) throw new Error('Quantidade inválida');
      if (!allowDecimalQuantidade && !Number.isInteger(quantidade)) throw new Error('Quantidade inválida');

      const payload = {
        produto_id: produtoSelected.id,
        quantidade,
        ...(formData.preco_unitario.trim() !== '' ? { preco_unitario: Number(formData.preco_unitario) } : {}),
        destino_tipo: destinoTipo,
        destino_id: destinoId,
        fornecedor: formData.fornecedor || undefined,
        nota_fiscal: formData.nota_fiscal || undefined,
        observacoes: formData.observacoes || undefined,
        lote: formData.lote,
        data_validade: dataValidade
      };

      const res = await apiFetch('/api/movimentacoes/entrada', {
        method: 'POST',
        body: JSON.stringify(payload)
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || 'Erro ao registrar entrada');
      
      setSuccess(true);
      setTimeout(() => {
        router.push('/movimentacoes');
      }, 1500);
      
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : null;
      setError(message || 'Erro ao registrar entrada');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Page width="md">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <PackagePlus className="h-6 w-6 text-green-600" />
          Nova Entrada de Estoque
        </h1>
        <p className="text-gray-500 mt-1">Registre o recebimento de produtos de fornecedores.</p>
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
              <CheckCircle2 className="h-4 w-4" /> Entrada registrada com sucesso! Redirecionando...
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Produto */}
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Produto (ID/Código)</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input 
                  type="text" 
                  required
                  placeholder="Digite o ID ou Código do produto..."
                  className="soft-input w-full pl-10 pr-4 py-2 outline-none"
                  value={produtoQuery}
                  onFocus={() => setShowProdutoDropdown(true)}
                  onBlur={() => setTimeout(() => setShowProdutoDropdown(false), 150)}
                  onChange={e => {
                    setProdutoQuery(e.target.value);
                    setProdutoSelected(null);
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
                        }}
                      >
                        <div className="text-sm font-medium text-gray-900">{p.nome}</div>
                        <div className="text-xs text-gray-500 flex gap-2">
                          {p.codigo && <span>Cód: {p.codigo}</span>}
                          {p.unidade && <span>Un: {p.unidade}</span>}
                          {p.categoria && <span>Cat: {p.categoria}</span>}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <p className="text-xs text-gray-500 mt-1">Aceita ID ou Código.</p>
              {produtoSelected && (
                <div className="mt-2 p-3 rounded-lg border border-green-200 bg-green-50 text-sm">
                  <div className="font-semibold text-green-900">{produtoSelected.nome}</div>
                  <div className="text-green-800 text-xs flex gap-2 flex-wrap">
                    <span>ID: {produtoSelected.id}</span>
                    {produtoSelected.codigo && <span>Código: {produtoSelected.codigo}</span>}
                    {produtoSelected.unidade && <span>Unidade: {produtoSelected.unidade}</span>}
                    {produtoSelected.categoria && <span>Categoria: {produtoSelected.categoria}</span>}
                  </div>
                </div>
              )}
            </div>

            {/* Quantidade */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Quantidade</label>
              <input 
                type="number" 
                required
                min={allowDecimalQuantidade ? '0.01' : '1'}
                step={allowDecimalQuantidade ? '0.01' : '1'}
                className="soft-input w-full px-4 py-2 outline-none"
                value={formData.quantidade}
                onChange={e => setFormData({...formData, quantidade: e.target.value})}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Preço Unitário (opcional)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                className="soft-input w-full px-4 py-2 outline-none"
                value={formData.preco_unitario}
                onChange={e => setFormData({ ...formData, preco_unitario: e.target.value })}
              />
            </div>

            {/* Local de Destino */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Destino</label>
              <div className="grid grid-cols-1 gap-2">
                <select
                  className="soft-input w-full px-4 py-2 outline-none"
                  value={formData.central_id}
                  onChange={e => setFormData({ ...formData, central_id: e.target.value, almoxarifado_id: '', sub_almoxarifado_id: '' })}
                  required
                  disabled={user?.role === 'resp_sub_almox'}
                >
                  <option value="">Central...</option>
                  {centrais.map(c => (
                    <option key={c.id} value={c.id}>{c.nome}</option>
                  ))}
                </select>

                <select
                  className="soft-input w-full px-4 py-2 outline-none"
                  value={formData.almoxarifado_id}
                  onChange={e => setFormData({ ...formData, almoxarifado_id: e.target.value, sub_almoxarifado_id: '' })}
                  required
                  disabled={!formData.central_id || user?.role === 'resp_sub_almox'}
                >
                  <option value="">Almoxarifado...</option>
                  {almoxOptions.map(a => (
                    <option key={a.id} value={a.id}>{a.nome}</option>
                  ))}
                </select>

                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={formData.destino_is_sub}
                    onChange={e => setFormData({ ...formData, destino_is_sub: e.target.checked, sub_almoxarifado_id: '' })}
                    disabled={!formData.almoxarifado_id || user?.role === 'resp_sub_almox'}
                  />
                  Entrada direto no Sub-Almoxarifado
                </label>

                {formData.destino_is_sub && (
                  <select
                    className="soft-input w-full px-4 py-2 outline-none"
                    value={formData.sub_almoxarifado_id}
                    onChange={e => setFormData({ ...formData, sub_almoxarifado_id: e.target.value })}
                    required
                    disabled={!formData.almoxarifado_id || user?.role === 'resp_sub_almox'}
                  >
                    <option value="">Sub-Almoxarifado...</option>
                    {subOptions.map(s => (
                      <option key={s.id} value={s.id}>{s.nome}</option>
                    ))}
                  </select>
                )}
              </div>
            </div>

            {/* Nota Fiscal */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nota Fiscal</label>
              <input 
                type="text" 
                className="soft-input w-full px-4 py-2 outline-none"
                value={formData.nota_fiscal}
                onChange={e => setFormData({...formData, nota_fiscal: e.target.value})}
              />
            </div>

            {/* Lote */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Lote</label>
              <input 
                type="text" 
                required
                className="soft-input w-full px-4 py-2 outline-none"
                value={formData.lote}
                onChange={e => setFormData({...formData, lote: e.target.value})}
              />
            </div>

            {/* Validade */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Validade</label>
              <input 
                type="date" 
                required
                className="soft-input w-full px-4 py-2 outline-none"
                value={formData.data_validade}
                onChange={e => setFormData({...formData, data_validade: e.target.value})}
              />
            </div>

            {/* Fornecedor */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Fornecedor</label>
              <input 
                type="text" 
                className="soft-input w-full px-4 py-2 outline-none"
                value={formData.fornecedor}
                onChange={e => setFormData({...formData, fornecedor: e.target.value})}
              />
            </div>

            {/* Observações */}
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Observações</label>
              <textarea 
                rows={3}
                className="soft-input w-full px-4 py-2 outline-none"
                value={formData.observacoes}
                onChange={e => setFormData({...formData, observacoes: e.target.value})}
              />
            </div>
          </div>

          <div className="flex justify-end pt-4 border-t border-gray-100">
            <button 
              type="submit" 
              disabled={loading}
              className="soft-btn-primary flex items-center gap-2 px-6 py-2 disabled:opacity-50"
            >
              {loading ? 'Salvando...' : <><Save className="h-4 w-4" /> Registrar Entrada</>}
            </button>
          </div>
        </form>
      </div>
    </Page>
  );
}
