'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Package, ArrowLeft, MapPin, History, Box, Activity, Edit2 } from 'lucide-react';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import { Loading } from '@/components/ui/Page';
import { apiUrl } from '@/lib/api';

interface ProdutoDetalhes {
  id: string;
  nome: string;
  codigo: string;
  descricao?: string;
  unidade?: string;
  categoria?: string;
  observacao?: string;
  estoque_total: number;
  estoque_locais: {
    local_nome: string;
    local_tipo: string;
    quantidade: number;
    updated_at?: string;
  }[];
  historico_recente: {
    data: string;
    tipo: string;
    quantidade: number;
    origem: string;
    destino: string;
  }[];
  lotes: {
    id: string;
    numero: string;
    validade?: string | null;
    quantidade: number;
    preco_unitario?: number | null;
    status: string;
    local_id?: string | null;
    local_nome?: string;
    local_tipo?: string;
  }[];
}

export default function ProdutoDetalhesPage() {
  const params = useParams();
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [produto, setProduto] = useState<ProdutoDetalhes | null>(null);
  const [loading, setLoading] = useState(true);
  const [cleaningProduto, setCleaningProduto] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [savingLote, setSavingLote] = useState(false);
  const [deletingLote, setDeletingLote] = useState(false);
  const [editingLote, setEditingLote] = useState<{
    id: string;
    numero: string;
    validade: string;
    quantidade: string;
    preco_unitario: string;
    local_nome?: string;
    local_tipo?: string;
  } | null>(null);
  const [editingLoteOriginal, setEditingLoteOriginal] = useState<{
    id: string;
    numero: string;
    validade: string;
    quantidade: string;
    preco_unitario: string;
    local_nome?: string;
    local_tipo?: string;
  } | null>(null);

  const formatDate = (value?: string | null) => {
    if (!value) return '-';
    const normalized =
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(value) ? `${value}Z` : value;
    return new Date(normalized).toLocaleDateString('pt-BR');
  };

  const formatDateTime = (value?: string | null) => {
    if (!value) return '-';
    const normalized =
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(value) ? `${value}Z` : value;
    return new Date(normalized).toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  useEffect(() => {
    if (authLoading) return;
    if (!params.id) return;
    if (!user) return;
    if (user.role === 'operador_setor') {
      router.replace('/setor');
      return;
    }
    fetch(apiUrl(`/api/produtos/${params.id}`), { headers: { 'X-User-Id': user.id } })
        .then(res => {
          if (!res.ok) throw new Error('Produto não encontrado');
          return res.json();
        })
        .then(data => setProduto(data))
        .catch(err => console.error(err))
        .finally(() => setLoading(false));
  }, [authLoading, params.id, router, user]);

  const openEditLote = (lote: {
    id: string;
    numero: string;
    validade?: string | null;
    quantidade?: number;
    preco_unitario?: number | null;
    local_nome?: string;
    local_tipo?: string;
  }) => {
    const numero = String(lote.numero || '');
    const validade = lote.validade ? new Date(lote.validade).toISOString().slice(0, 10) : '';
    const quantidade =
      typeof lote.quantidade === 'number' && Number.isFinite(lote.quantidade) ? String(Math.round(lote.quantidade)) : '';
    const preco_unitario =
      typeof lote.preco_unitario === 'number' && Number.isFinite(lote.preco_unitario) ? String(lote.preco_unitario) : '';
    const next = { id: lote.id, numero, validade, quantidade, preco_unitario, local_nome: lote.local_nome, local_tipo: lote.local_tipo };
    setEditingLote(next);
    setEditingLoteOriginal(next);
    setShowModal(true);
  };

  const saveLote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingLote) return;
    if (!editingLoteOriginal) return;
    if (!user) {
      alert('Usuário não autenticado');
      return;
    }
    setSavingLote(true);
    try {
      const payload: Record<string, unknown> = {
        numero_lote: editingLote.numero.trim()
      };
      payload.data_validade = editingLote.validade ? new Date(`${editingLote.validade}T00:00:00`).toISOString() : null;

      if (editingLote.quantidade.trim() !== '') {
        const qtd = Number(editingLote.quantidade);
        if (!Number.isInteger(qtd)) {
          alert('Informe uma quantidade inteira');
          return;
        }
        payload.quantidade_atual = qtd;
      }
      if (editingLote.preco_unitario.trim() !== '') {
        payload.preco_unitario = Number(editingLote.preco_unitario);
      }

      const changes: string[] = [];
      if (editingLote.numero.trim() !== editingLoteOriginal.numero.trim()) {
        changes.push(`Número: "${editingLoteOriginal.numero}" → "${editingLote.numero.trim()}"`);
      }
      if (editingLote.validade !== editingLoteOriginal.validade) {
        changes.push(`Validade: ${editingLoteOriginal.validade || '-'} → ${editingLote.validade || '-'}`);
      }
      if (editingLote.quantidade.trim() !== editingLoteOriginal.quantidade.trim()) {
        changes.push(`Quantidade: ${editingLoteOriginal.quantidade || '0'} → ${editingLote.quantidade.trim() || '0'}`);
      }
      if (editingLote.preco_unitario.trim() !== editingLoteOriginal.preco_unitario.trim()) {
        changes.push(`Preço unitário: ${editingLoteOriginal.preco_unitario || '-'} → ${editingLote.preco_unitario.trim() || '-'}`);
      }
      if (changes.length === 0) {
        alert('Nenhuma alteração detectada.');
        return;
      }
      const localLabel = editingLoteOriginal.local_nome
        ? `${editingLoteOriginal.local_nome}${editingLoteOriginal.local_tipo ? ` (${editingLoteOriginal.local_tipo})` : ''}`
        : '';
      const ok = window.confirm(
        `Confirmar alteração do lote "${editingLoteOriginal.numero}"?\n${localLabel ? `Local: ${localLabel}\n` : ''}${changes.join('\n')}`,
      );
      if (!ok) return;

      const res = await fetch(apiUrl(`/api/lotes/${editingLote.id}`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'X-User-Id': user.id },
        body: JSON.stringify(payload)
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || 'Erro ao salvar lote');

      if (params.id) {
        const refreshed = await fetch(apiUrl(`/api/produtos/${params.id}`), { headers: { 'X-User-Id': user.id } }).then(r => r.json());
        setProduto(refreshed);
      }
      setShowModal(false);
      setEditingLote(null);
      setEditingLoteOriginal(null);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Erro ao salvar lote';
      alert(message);
    } finally {
      setSavingLote(false);
    }
  };

  const deleteLote = async () => {
    if (!editingLote) return;
    if (!editingLoteOriginal) return;
    if (!user) {
      alert('Usuário não autenticado');
      return;
    }
    const localLabel = editingLoteOriginal.local_nome
      ? `${editingLoteOriginal.local_nome}${editingLoteOriginal.local_tipo ? ` (${editingLoteOriginal.local_tipo})` : ''}`
      : '';
    const okDelete = window.confirm(
      `Excluir o lote "${editingLoteOriginal.numero}"?\n${localLabel ? `Local: ${localLabel}\n` : ''}Quantidade: ${editingLoteOriginal.quantidade || '0'}\n\nEssa ação não pode ser desfeita.`,
    );
    if (!okDelete) return;

    const canPurge = user.role === 'super_admin' && (produto?.lotes?.length || 0) <= 1;
    let purgeProduto = false;
    if (canPurge) {
      purgeProduto = window.confirm(
        'Você também quer apagar os dados do produto?\n\nIsso remove:\n- Distribuição por Local (estoques)\n- Últimas Movimentações\n\nE grava uma observação no produto informando a limpeza.',
      );
    }

    setDeletingLote(true);
    try {
      const qs = purgeProduto ? '?purge_produto=true' : '';
      const res = await fetch(apiUrl(`/api/lotes/${editingLote.id}${qs}`), {
        method: 'DELETE',
        headers: { 'X-User-Id': user.id }
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || 'Erro ao excluir lote');

      if (params.id) {
        const refreshed = await fetch(apiUrl(`/api/produtos/${params.id}`), { headers: { 'X-User-Id': user.id } }).then(r => r.json());
        setProduto(refreshed);
      }
      setShowModal(false);
      setEditingLote(null);
      setEditingLoteOriginal(null);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Erro ao excluir lote';
      alert(message);
    } finally {
      setDeletingLote(false);
    }
  };

  const limparDadosSemLotes = async () => {
    if (!user) return;
    if (!params.id) return;
    if (!produto) return;
    const ok = window.confirm(
      'Este produto está sem lotes, mas ainda possui dados em Distribuição por Local / Últimas Movimentações.\n\nDeseja apagar esses dados agora?\n\nEssa ação não pode ser desfeita.',
    );
    if (!ok) return;

    setCleaningProduto(true);
    try {
      const res = await fetch(apiUrl(`/api/produtos/${params.id}/limpar_dados_sem_lotes`), {
        method: 'POST',
        headers: { 'X-User-Id': user.id }
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || 'Erro ao limpar dados');

      const refreshed = await fetch(apiUrl(`/api/produtos/${params.id}`), { headers: { 'X-User-Id': user.id } }).then(r => r.json());
      setProduto(refreshed);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Erro ao limpar dados';
      alert(message);
    } finally {
      setCleaningProduto(false);
    }
  };

  if (authLoading) return null;
  if (!user) return null;
  if (user.role === 'operador_setor') return null;
  if (loading) return <Loading label="Carregando detalhes" />;
  if (!produto) return <div className="p-8 text-center text-red-500">Produto não encontrado.</div>;

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-6 flex justify-between items-start">
        <Link href="/" className="flex items-center text-gray-500 hover:text-blue-600 mb-4 transition-colors w-fit">
          <ArrowLeft className="h-4 w-4 mr-1" /> Voltar ao Dashboard
        </Link>
        
        <Link 
          href={`/produtos/${params.id}/edit`}
          className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors shadow-sm"
        >
          <Edit2 className="h-4 w-4" /> Editar Produto
        </Link>
      </div>
      <div className="mb-6">
        <div className="flex items-start justify-between">
          <div>
             <h1 className="text-3xl font-bold text-gray-900">{produto.nome}</h1>
             <div className="flex items-center gap-4 mt-2 text-gray-500">
               <span className="flex items-center gap-1 bg-gray-100 px-2 py-1 rounded text-sm"><Box className="h-3 w-3" /> Cód: {produto.codigo}</span>
               {produto.unidade && <span className="text-sm">Unidade: {produto.unidade}</span>}
             </div>
             {produto.descricao && <p className="mt-4 text-gray-600 max-w-2xl">{produto.descricao}</p>}
          </div>
          <div className="bg-blue-50 border border-blue-100 p-6 rounded-xl text-center min-w-[150px]">
            <span className="block text-sm text-blue-600 font-medium mb-1">Estoque Total</span>
            <span className="block text-4xl font-bold text-blue-900">{Math.round(produto.estoque_total).toLocaleString('pt-BR')}</span>
          </div>
        </div>

        {produto.lotes.length === 0 && (produto.estoque_locais.length > 0 || produto.historico_recente.length > 0) && (
          <div className="mt-4">
            <button
              type="button"
              disabled={cleaningProduto}
              onClick={limparDadosSemLotes}
              className="px-4 py-2 rounded-lg border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 disabled:opacity-50"
            >
              {cleaningProduto ? 'Limpando...' : 'Limpar dados residuais (sem lotes)'}
            </button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Locais */}
        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
          <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
            <MapPin className="h-5 w-5 text-gray-500" /> Distribuição por Local
          </h2>
          {produto.estoque_locais.length === 0 ? (
            <p className="text-gray-500 italic">Nenhum estoque registrado.</p>
          ) : (
            <div className="space-y-3">
              {produto.estoque_locais.map((loc, idx) => (
                <div key={idx} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className={`w-2 h-2 rounded-full ${
                      loc.local_tipo === 'setor' ? 'bg-purple-500' : 
                      loc.local_tipo === 'almoxarifado' ? 'bg-orange-500' : 'bg-blue-500'
                    }`} />
                    <div>
                      <span className="block font-medium text-gray-900">{loc.local_nome}</span>
                      <span className="text-xs text-gray-500 capitalize">{loc.local_tipo}</span>
                    </div>
                  </div>
                  <span className="font-mono font-bold text-gray-700">{Math.round(loc.quantidade)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Histórico Recente */}
        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
          <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
            <History className="h-5 w-5 text-gray-500" /> Últimas Movimentações
          </h2>
          {produto.historico_recente.length === 0 ? (
             <p className="text-gray-500 italic">Nenhuma movimentação recente.</p>
          ) : (
            <div className="space-y-4">
              {produto.historico_recente.map((hist, idx) => (
                <div key={idx} className="flex items-start gap-3 pb-3 border-b border-gray-100 last:border-0">
                   <div className={`mt-1 p-1.5 rounded-full ${
                      hist.tipo === 'entrada' ? 'bg-green-100 text-green-600' :
                      hist.tipo === 'saida' ? 'bg-red-100 text-red-600' : 'bg-blue-100 text-blue-600'
                   }`}>
                      <Activity className="h-3 w-3" />
                   </div>
                   <div className="flex-1">
                    <div className="flex justify-between">
                      <span className="text-sm font-medium text-gray-900 capitalize">{hist.tipo}</span>
                      <span className="text-xs text-gray-500">{formatDateTime(hist.data)}</span>
                    </div>
                     <p className="text-xs text-gray-600 mt-0.5">
                       {hist.origem} &rarr; {hist.destino}
                     </p>
                   </div>
                   <span className={`text-sm font-bold ${
                      hist.tipo === 'saida' ? 'text-red-600' : 'text-green-600'
                   }`}>
                      {hist.tipo === 'saida' ? '-' : '+'}{Math.round(hist.quantidade)}
                   </span>
                </div>
              ))}
            </div>
          )}
        </div>
        {/* Lotes e Validades */}
        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm lg:col-span-2">
          <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
            <Package className="h-5 w-5 text-gray-500" /> Lotes e Validades
          </h2>
          {!produto.lotes || produto.lotes.length === 0 ? (
             <p className="text-gray-500 italic text-sm">Nenhum lote registrado para este produto.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="bg-gray-50 text-gray-500">
                    <th className="px-4 py-2 font-medium">Lote</th>
                    <th className="px-4 py-2 font-medium">Validade</th>
                    <th className="px-4 py-2 font-medium">Quantidade</th>
                    <th className="px-4 py-2 font-medium">Preço Unitário</th>
                    <th className="px-4 py-2 font-medium">Status</th>
                    <th className="px-4 py-2 font-medium text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {produto.lotes.map((lote, idx) => (
                    <tr key={idx} className="hover:bg-gray-50">
                      <td className="px-4 py-2 font-medium text-gray-900">{lote.numero}</td>
                      <td className="px-4 py-2 text-gray-600">{formatDate(lote.validade)}</td>
                      <td className="px-4 py-2 text-gray-900">{Math.round(lote.quantidade)}</td>
                      <td className="px-4 py-2 text-gray-900">
                        {typeof lote.preco_unitario === 'number' && Number.isFinite(lote.preco_unitario)
                          ? lote.preco_unitario.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
                          : '-'}
                      </td>
                      <td className="px-4 py-2">
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                          lote.status === 'Vencido' ? 'bg-red-100 text-red-700' : 
                          lote.status === 'Crítico' ? 'bg-yellow-100 text-yellow-700' : 'bg-green-100 text-green-700'
                        }`}>
                          {lote.status}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-right">
                        <button
                          type="button"
                          className="text-blue-600 hover:underline text-sm"
                          onClick={() => openEditLote(lote)}
                        >
                          Editar
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {showModal && editingLote && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md shadow-xl">
            <h2 className="text-xl font-bold mb-4">Editar Lote</h2>
            <form onSubmit={saveLote} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Local</label>
                <div className="w-full px-3 py-2 border border-gray-200 bg-gray-50 rounded-lg text-sm text-gray-800">
                  {editingLote.local_nome
                    ? `${editingLote.local_nome}${editingLote.local_tipo ? ` (${editingLote.local_tipo})` : ''}`
                    : '-'}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Número do Lote</label>
                <input
                  autoFocus
                  required
                  type="text"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  value={editingLote.numero || ''}
                  onChange={e => setEditingLote({ ...editingLote, numero: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Validade</label>
                <input
                  type="date"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  value={editingLote.validade || ''}
                  onChange={e => setEditingLote({ ...editingLote, validade: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Quantidade</label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  value={editingLote.quantidade || ''}
                  onChange={e => setEditingLote({ ...editingLote, quantidade: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Preço Unitário</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  value={editingLote.preco_unitario || ''}
                  onChange={e => setEditingLote({ ...editingLote, preco_unitario: e.target.value })}
                />
              </div>
              <div className="flex justify-end gap-2 pt-4">
                <button
                  type="button"
                  onClick={deleteLote}
                  disabled={savingLote || deletingLote}
                  className="mr-auto px-4 py-2 text-red-700 hover:bg-red-50 rounded-lg disabled:opacity-50"
                >
                  {deletingLote ? 'Excluindo...' : 'Excluir lote'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowModal(false);
                    setEditingLote(null);
                    setEditingLoteOriginal(null);
                  }}
                  className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingLote || deletingLote}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  {savingLote ? 'Salvando...' : 'Salvar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
