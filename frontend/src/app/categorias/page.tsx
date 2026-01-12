'use client';

import { useState, useEffect } from 'react';
import { Box, Plus, Search, Trash2 } from 'lucide-react';
import { Loading } from '@/components/ui/Page';
import { apiUrl } from '@/lib/api';

interface Categoria {
  id: string;
  nome: string;
  descricao?: string;
}

export default function CategoriasPage() {
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [newCat, setNewCat] = useState({ nome: '', descricao: '' });
  const [editingId, setEditingId] = useState<string | null>(null);

  useEffect(() => {
    fetchCategorias();
  }, []);

  const fetchCategorias = async () => {
    try {
      const res = await fetch(apiUrl('/api/categorias'));
      if (res.ok) {
        const data = await res.json();
        setCategorias(data);
      }
    } catch (error) {
      console.error('Erro ao buscar categorias:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (cat: Categoria) => {
    setNewCat({ nome: cat.nome, descricao: cat.descricao || '' });
    setEditingId(cat.id);
    setShowModal(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Tem certeza que deseja excluir esta categoria?')) return;
    try {
      const res = await fetch(apiUrl(`/api/categorias/${id}`), { method: 'DELETE' });
      if (res.ok) fetchCategorias();
      else alert('Erro ao excluir');
    } catch {
      alert('Erro de conexão');
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const url = editingId 
        ? apiUrl(`/api/categorias/${editingId}`)
        : apiUrl('/api/categorias');
      
      const method = editingId ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method: method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newCat)
      });
      
      if (res.ok) {
        setShowModal(false);
        setNewCat({ nome: '', descricao: '' });
        setEditingId(null);
        fetchCategorias();
      }
    } catch {
      alert('Erro ao salvar categoria');
    }
  };

  const openNewModal = () => {
    setNewCat({ nome: '', descricao: '' });
    setEditingId(null);
    setShowModal(true);
  }

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Box className="h-6 w-6 text-blue-600" />
            Categorias de Produtos
          </h1>
          <p className="text-gray-500 mt-1">Gerencie as categorias para organizar seu estoque.</p>
        </div>
        <button 
          onClick={openNewModal}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus className="h-4 w-4" /> Nova Categoria
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-gray-100 bg-gray-50 flex gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input 
              type="text" 
              placeholder="Buscar categorias..."
              className="w-full pl-10 pr-4 py-2 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        <table className="w-full text-left">
          <thead>
            <tr className="bg-gray-50 text-gray-500 text-sm">
              <th className="px-6 py-3 font-medium">Nome</th>
              <th className="px-6 py-3 font-medium">Descrição</th>
              <th className="px-6 py-3 font-medium text-right">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr>
                <td colSpan={3} className="p-0">
                  <Loading size="sm" />
                </td>
              </tr>
            ) : categorias.map(cat => (
              <tr key={cat.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => handleEdit(cat)}>
                <td className="px-6 py-3 font-medium text-gray-900">{cat.nome}</td>
                <td className="px-6 py-3 text-gray-500">{cat.descricao || '-'}</td>
                <td className="px-6 py-3 text-right">
                  <button 
                    onClick={(e) => { e.stopPropagation(); handleDelete(cat.id); }}
                    className="text-gray-400 hover:text-red-600 p-1"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            ))}
            {!loading && categorias.length === 0 && (
              <tr><td colSpan={3} className="p-8 text-center text-gray-400">Nenhuma categoria encontrada.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Modal Simplificado */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md shadow-xl">
            <h2 className="text-xl font-bold mb-4">{editingId ? 'Editar Categoria' : 'Nova Categoria'}</h2>
            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nome</label>
                <input 
                  autoFocus
                  required
                  type="text" 
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  value={newCat.nome}
                  onChange={e => setNewCat({...newCat, nome: e.target.value})}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Descrição</label>
                <textarea 
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  rows={3}
                  value={newCat.descricao}
                  onChange={e => setNewCat({...newCat, descricao: e.target.value})}
                />
              </div>
              <div className="flex justify-end gap-2 pt-4">
                <button 
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
                >
                  Cancelar
                </button>
                <button 
                  type="submit"
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  Salvar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
