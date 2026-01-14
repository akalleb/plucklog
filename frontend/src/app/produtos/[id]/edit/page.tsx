'use client';

import { useState, useEffect } from 'react';
import { Package, Save, ArrowLeft, Loader2, Trash2 } from 'lucide-react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { Loading } from '@/components/ui/Page';
import { useAuth } from '@/context/AuthContext';
import { apiUrl } from '@/lib/api';

interface Categoria {
  id: string;
  nome: string;
}

interface ProdutoResponse {
  nome: string;
  codigo: string;
  categoria?: string;
  unidade?: string;
  descricao?: string;
  observacao?: string;
}

export default function EditarProdutoPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;
  const { user, loading: authLoading } = useAuth();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  
  const [formData, setFormData] = useState({
    nome: '',
    codigo: '',
    categoria_id: '',
    unidade: 'UN',
    descricao: '',
    observacao: '',
    ativo: true
  });

  useEffect(() => {
    if (authLoading) return;
    if (!user) return;
    const headers = { 'X-User-Id': user.id };
    Promise.all([
      fetch(apiUrl(`/api/produtos/${id}`), { headers }).then(res => res.json()),
      fetch(apiUrl('/api/categorias')).then(res => res.json())
    ]).then(([prod, cats]) => {
      const produto = prod as ProdutoResponse;
      const categorias = cats as Categoria[];

      setFormData({
        nome: produto.nome,
        codigo: produto.codigo,
        categoria_id: categorias.find((c) => c.nome === produto.categoria)?.id || '',
        unidade: produto.unidade || 'UN',
        descricao: produto.descricao || '',
        observacao: produto.observacao || '',
        ativo: true
      });
      setCategorias(categorias);
      setLoading(false);
    }).catch(err => {
      console.error(err);
      alert('Erro ao carregar dados');
    });
  }, [authLoading, id, user]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSaving(true);
    try {
      const res = await fetch(apiUrl(`/api/produtos/${id}`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'X-User-Id': user.id },
        body: JSON.stringify(formData)
      });
      
      if (res.ok) {
        // alert('Produto atualizado!');
        router.push(`/produtos/${id}`);
      } else {
        alert('Erro ao atualizar');
      }
    } catch {
      alert('Erro de conexão');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Tem certeza absoluta que deseja excluir este produto? Esta ação não pode ser desfeita.')) return;
    if (!user) return;
    
    try {
      const res = await fetch(apiUrl(`/api/produtos/${id}`), { method: 'DELETE', headers: { 'X-User-Id': user.id } });
      if (res.ok) {
        router.push('/');
      } else {
        alert('Erro: Não é possível excluir produto com histórico de movimentações.');
      }
    } catch {
      alert('Erro de conexão');
    }
  };

  if (loading) return <Loading />;

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="mb-6 flex justify-between items-start">
        <div>
          <Link href={`/produtos/${id}`} className="flex items-center text-gray-500 hover:text-blue-600 mb-4 transition-colors w-fit">
            <ArrowLeft className="h-4 w-4 mr-1" /> Voltar aos Detalhes
          </Link>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Package className="h-6 w-6 text-blue-600" />
            Editar Produto
          </h1>
        </div>
        <button 
          onClick={handleDelete}
          className="flex items-center gap-2 px-4 py-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors border border-red-200"
        >
          <Trash2 className="h-4 w-4" /> Excluir Produto
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Nome */}
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Nome do Produto</label>
              <input 
                required
                type="text" 
                className="w-full px-4 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 outline-none"
                value={formData.nome}
                onChange={e => setFormData({...formData, nome: e.target.value})}
              />
            </div>

            {/* Código (Leitura) */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Código</label>
              <input 
                disabled
                type="text" 
                className="w-full px-4 py-2 rounded-lg border border-gray-200 bg-gray-50 text-gray-500 cursor-not-allowed font-mono"
                value={formData.codigo}
              />
              <p className="text-xs text-gray-400 mt-1">O código não pode ser alterado.</p>
            </div>

            {/* Categoria */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Categoria</label>
              <select 
                className="w-full px-4 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 outline-none bg-white"
                value={formData.categoria_id}
                onChange={e => setFormData({...formData, categoria_id: e.target.value})}
              >
                <option value="">Selecione...</option>
                {categorias.map(cat => (
                  <option key={cat.id} value={cat.id}>{cat.nome}</option>
                ))}
              </select>
            </div>

            {/* Unidade */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Unidade</label>
              <select 
                className="w-full px-4 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 outline-none bg-white"
                value={formData.unidade}
                onChange={e => setFormData({...formData, unidade: e.target.value})}
              >
                <option value="UN">Unidade (UN)</option>
                <option value="CX">Caixa (CX)</option>
                <option value="PCT">Pacote (PCT)</option>
                <option value="FR">Frasco (FR)</option>
                <option value="KG">Quilo (KG)</option>
                <option value="L">Litro (L)</option>
                <option value="MT">Metro (MT)</option>
              </select>
            </div>

            {/* Descrição */}
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Descrição Detalhada</label>
              <textarea 
                rows={3}
                className="w-full px-4 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 outline-none"
                value={formData.descricao}
                onChange={e => setFormData({...formData, descricao: e.target.value})}
              />
            </div>

            {/* Observações */}
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Observações Internas</label>
              <input 
                type="text" 
                className="w-full px-4 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 outline-none"
                value={formData.observacao}
                onChange={e => setFormData({...formData, observacao: e.target.value})}
              />
            </div>
          </div>

          <div className="flex justify-end pt-4 border-t border-gray-100">
            <button 
              type="submit" 
              disabled={saving}
              className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {saving ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Salvando...</>
              ) : (
                <><Save className="h-4 w-4" /> Salvar Alterações</>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
