'use client';

import { useState, useEffect } from 'react';
import { PackagePlus, Save, ArrowLeft, Wand2, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { apiUrl } from '@/lib/api';

interface Categoria {
  id: string;
  nome: string;
}

export default function NovoProdutoPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  
  const [formData, setFormData] = useState({
    nome: '',
    codigo: '',
    categoria_id: '',
    unidade: 'UN',
    descricao: '',
    observacao: ''
  });

  useEffect(() => {
    fetch(apiUrl('/api/categorias'))
      .then(res => res.json())
      .then(data => setCategorias(data))
      .catch(err => console.error(err));
  }, []);

  const gerarCodigo = async () => {
    try {
      const res = await fetch(apiUrl('/api/produtos/gerar-codigo'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ categoria_id: formData.categoria_id })
      });
      const data = await res.json();
      if (data.codigo) {
        setFormData(prev => ({ ...prev, codigo: data.codigo }));
      }
    } catch (error) {
      console.error(error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch(apiUrl('/api/produtos'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });
      const data = await res.json();
      
      if (data.exists) {
        alert('Erro: Já existe um produto com este código.');
      } else if (data.id) {
        // alert('Produto criado com sucesso!');
        router.push(`/produtos/${data.id}`);
      } else {
        alert('Erro: ' + (data.message || 'Desconhecido'));
      }
    } catch {
      alert('Erro de conexão ao salvar');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="mb-6">
        <Link href="/" className="flex items-center text-gray-500 hover:text-blue-600 mb-4 transition-colors w-fit">
          <ArrowLeft className="h-4 w-4 mr-1" /> Voltar ao Dashboard
        </Link>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <PackagePlus className="h-6 w-6 text-blue-600" />
          Novo Produto
        </h1>
        <p className="text-gray-500 mt-1">Cadastre um novo item no catálogo do almoxarifado.</p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Nome */}
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Nome do Produto</label>
              <input 
                autoFocus
                required
                type="text" 
                className="w-full px-4 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 outline-none"
                placeholder="Ex: Luva de Procedimento M"
                value={formData.nome}
                onChange={e => setFormData({...formData, nome: e.target.value})}
              />
            </div>

            {/* Código */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Código</label>
              <div className="flex gap-2">
                <input 
                  required
                  type="text" 
                  className="w-full px-4 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 outline-none font-mono"
                  placeholder="Ex: PROD-001"
                  value={formData.codigo}
                  onChange={e => setFormData({...formData, codigo: e.target.value})}
                />
                <button 
                  type="button"
                  onClick={gerarCodigo}
                  className="px-3 py-2 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 border border-gray-200"
                  title="Gerar Código Automático"
                >
                  <Wand2 className="h-4 w-4" />
                </button>
              </div>
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
                placeholder="Detalhes técnicos, marca, dimensões..."
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
                placeholder="Avisos sobre armazenamento, fornecedor preferencial..."
                value={formData.observacao}
                onChange={e => setFormData({...formData, observacao: e.target.value})}
              />
            </div>
          </div>

          <div className="flex justify-end pt-4 border-t border-gray-100">
            <button 
              type="submit" 
              disabled={loading}
              className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {loading ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Salvando...</>
              ) : (
                <><Save className="h-4 w-4" /> Cadastrar Produto</>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
