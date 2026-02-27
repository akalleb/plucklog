'use client';

import { useState, useEffect } from 'react';
import { PackagePlus, Save, ArrowLeft, Wand2, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { apiUrl, apiFetch } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';

interface Categoria {
  id: string;
  nome: string;
}

interface Central {
  id: string;
  nome: string;
}

export default function NovoProdutoPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [loading, setLoading] = useState(false);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [centrais, setCentrais] = useState<Central[]>([]);
  
  const [formData, setFormData] = useState({
    central_id: '',
    nome: '',
    codigo: '',
    categoria_id: '',
    unidade: 'UN',
    descricao: '',
    observacao: ''
  });

  useEffect(() => {
    apiFetch('/api/categorias')
      .then(res => res.ok ? res.json() : [])
      .then(data => setCategorias(data))
      .catch(err => console.error(err));
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (!user) return;

    apiFetch('/api/centrais')
      .then(async (res) => (res.ok ? res.json() : []))
      .then((data: Central[]) => {
        setCentrais(data);
        if (user.role === 'admin_central' && user.scope_id) {
          setFormData(prev => ({ ...prev, central_id: user.scope_id || '' }));
          return;
        }
        if (user.role === 'resp_sub_almox' && user.central_id) {
          setFormData(prev => ({ ...prev, central_id: user.central_id || '' }));
          return;
        }
        if (data.length === 1) {
          setFormData(prev => ({ ...prev, central_id: data[0]?.id || '' }));
        }
      })
      .catch(err => console.error(err));
  }, [authLoading, user]);

  const gerarCodigo = async () => {
    try {
      const res = await apiFetch('/api/produtos/gerar-codigo', {
        method: 'POST',
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
      if (!formData.central_id) {
        alert('Selecione a central');
        return;
      }
      const res = await apiFetch('/api/produtos', {
        method: 'POST',
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

      <div className="soft-card overflow-hidden">
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Central */}
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Central</label>
              <select
                required
                className="soft-input w-full px-4 py-2 outline-none"
                value={formData.central_id}
                onChange={e => setFormData({ ...formData, central_id: e.target.value })}
                disabled={user?.role === 'admin_central' || (user?.role === 'resp_sub_almox' && !!formData.central_id)}
              >
                <option value="">Selecione...</option>
                {centrais.map(c => (
                  <option key={c.id} value={c.id}>{c.nome}</option>
                ))}
              </select>
            </div>

            {/* Nome */}
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Nome do Produto</label>
              <input 
                autoFocus
                required
                type="text" 
                className="soft-input w-full px-4 py-2 outline-none"
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
                  className="soft-input w-full px-4 py-2 outline-none font-mono"
                  placeholder="Ex: PROD-001"
                  value={formData.codigo}
                  onChange={e => setFormData({...formData, codigo: e.target.value})}
                />
                <button 
                  type="button"
                  onClick={gerarCodigo}
                  className="soft-btn px-3 py-2 text-gray-700"
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
                className="soft-input w-full px-4 py-2 outline-none"
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
                className="soft-input w-full px-4 py-2 outline-none"
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
                className="soft-input w-full px-4 py-2 outline-none"
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
                className="soft-input w-full px-4 py-2 outline-none"
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
              className="soft-btn-primary flex items-center gap-2 px-6 py-2 disabled:opacity-50"
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
