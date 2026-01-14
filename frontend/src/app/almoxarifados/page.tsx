'use client';

import { useState, useEffect } from 'react';
import { Warehouse, Plus, Trash2, MapPin, Edit2, ChevronRight, ChevronDown, Building2, Layers } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { Loading } from '@/components/ui/Page';
import { apiUrl } from '@/lib/api';

// Tipos atualizados para refletir o backend
interface Central {
  id: string;
  nome: string;
  endereco?: string;
  tipo: 'central';
}

interface Almoxarifado {
  id: string;
  nome: string;
  endereco?: string;
  tipo: 'almoxarifado';
  central_id?: string;
  can_receive_inter_central?: boolean;
}

interface SubAlmoxarifado {
  id: string;
  nome: string;
  descricao?: string;
  tipo: 'sub_almoxarifado';
  almoxarifado_id?: string;
  can_receive_inter_central?: boolean;
}

interface Setor {
  id: string;
  nome: string;
  responsavel?: string;
  email?: string;
  parent_id?: string;
  sub_almoxarifado_id?: string;
  sub_almoxarifado_ids?: string[];
  almoxarifado_id?: string;
  tipo: 'setor';
  can_receive_inter_central?: boolean;
}

type TreeItem = Central | Almoxarifado | SubAlmoxarifado | Setor;

const HierarchyNode = ({ 
  item, 
  allCentrais,
  allAlmoxarifados,
  allSubAlmoxarifados,
  allSetores, 
  level = 0,
  onEdit,
  onDelete
}: { 
  item: TreeItem, 
  allCentrais: Central[],
  allAlmoxarifados: Almoxarifado[], 
  allSubAlmoxarifados: SubAlmoxarifado[],
  allSetores: Setor[],
  level?: number,
  onEdit: (item: TreeItem) => void,
  onDelete: (id: string, tipo: string) => void
}) => {
  const [expanded, setExpanded] = useState(true);

  // Determinar filhos com base no tipo
  let children: TreeItem[] = [];
  
  if (item.tipo === 'central') {
    children = allAlmoxarifados.filter(a => a.central_id === item.id);
  } else if (item.tipo === 'almoxarifado') {
    const subs = allSubAlmoxarifados.filter(s => s.almoxarifado_id === item.id);
    const sets = allSetores.filter(s => {
      const hasSubs = Boolean(s.sub_almoxarifado_id) || Boolean(s.sub_almoxarifado_ids && s.sub_almoxarifado_ids.length > 0);
      return s.almoxarifado_id === item.id && !hasSubs;
    });
    children = [...subs, ...sets];
  } else if (item.tipo === 'sub_almoxarifado') {
    children = allSetores.filter(s => {
      if (s.sub_almoxarifado_id === item.id) return true;
      if (s.sub_almoxarifado_ids && s.sub_almoxarifado_ids.includes(item.id)) return true;
      return false;
    });
  } else {
    children = [];
  }

  const hasChildren = children.length > 0;

  const getTypeColor = (type?: string) => {
    switch(type) {
      case 'central': return 'bg-purple-100 text-purple-700 border-purple-200';
      case 'sub_almoxarifado': return 'bg-gray-100 text-gray-700 border-gray-200';
      case 'setor': return 'bg-green-100 text-green-700 border-green-200';
      default: return 'bg-blue-100 text-blue-700 border-blue-200';
    }
  };

  const getTypeLabel = (type?: string) => {
    switch(type) {
      case 'central': return 'Central';
      case 'sub_almoxarifado': return 'Sub-Almox.';
      case 'setor': return 'Setor';
      default: return 'Almoxarifado';
    }
  };

  const endereco = 'endereco' in item ? item.endereco : undefined;
  const descricao = 'descricao' in item ? item.descricao : undefined;

  return (
    <div className="mb-2">
      <div 
        className={`group flex items-center justify-between p-3 rounded-lg border hover:shadow-sm transition-all ${
          level === 0 ? 'bg-white border-gray-200 mb-2' : 'bg-gray-50/50 border-gray-100 ml-6 border-l-2 border-l-blue-200'
        }`}
      >
        <div className="flex items-center gap-3">
          {hasChildren ? (
            <button 
              onClick={() => setExpanded(!expanded)}
              className="p-1 hover:bg-gray-200 rounded text-gray-500"
            >
              {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </button>
          ) : (
            <div className="w-6" /> // Spacer
          )}
          
          <div className={`p-2 rounded-lg ${getTypeColor(item.tipo)} bg-opacity-20`}>
            {item.tipo === 'sub_almoxarifado' ? (
              <Layers className="h-5 w-5" />
            ) : item.tipo === 'setor' ? (
              <Building2 className="h-5 w-5" />
            ) : (
              <Warehouse className="h-5 w-5" />
            )}
          </div>
          
          <div>
            <h3 className="font-semibold text-gray-900 flex items-center gap-2">
              {item.nome}
              <span className={`text-[10px] px-2 py-0.5 rounded-full border ${getTypeColor(item.tipo)}`}>
                {getTypeLabel(item.tipo)}
              </span>
            </h3>
            {endereco && (
              <p className="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
                <MapPin className="h-3 w-3" /> {endereco}
              </p>
            )}
            {descricao && (
              <p className="text-xs text-gray-400 mt-0.5 italic">
                 {descricao}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
           <button 
             onClick={() => onEdit(item)}
             className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
             title="Editar"
           >
             <Edit2 className="h-4 w-4" />
           </button>
           <button 
             onClick={() => onDelete(item.id, item.tipo)}
             className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
             title="Excluir"
           >
             <Trash2 className="h-4 w-4" />
           </button>
        </div>
      </div>

      {expanded && (
        <div className="border-l-2 border-gray-100 ml-4 pl-2 space-y-2 mt-2">
          {children.map((child) => {
            return (
              <HierarchyNode 
                key={child.id} 
                item={child} 
                allCentrais={allCentrais}
                allAlmoxarifados={allAlmoxarifados} 
                allSubAlmoxarifados={allSubAlmoxarifados}
                allSetores={allSetores}
                level={level + 1}
                onEdit={onEdit}
                onDelete={onDelete}
              />
            );
          })}
        </div>
      )}
    </div>
  );
};

export default function AlmoxarifadosPage() {
  const { user, loading: authLoading } = useAuth();
  const [centrais, setCentrais] = useState<Central[]>([]);
  const [almoxarifados, setAlmoxarifados] = useState<Almoxarifado[]>([]);
  const [subAlmoxarifados, setSubAlmoxarifados] = useState<SubAlmoxarifado[]>([]);
  const [setores, setSetores] = useState<Setor[]>([]);
  
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  
  const [formData, setFormData] = useState({ 
    nome: '', 
    endereco: '', 
    descricao: '',
    responsavel: '',
    email: '',
    tipo: 'almoxarifado',
    parent_ref: '',
    setor_almoxarifado_id: '',
    setor_sub_almoxarifado_ids: [] as string[],
    can_receive_inter_central: false
  });

  useEffect(() => {
    if (authLoading) return;
    if (!user) return;
    fetchData(user.id);
  }, [authLoading, user]);

  const fetchData = async (userId: string) => {
    try {
      const headers = { 'X-User-Id': userId };
      const [resC, resA, resS, resSet] = await Promise.all([
        fetch(apiUrl('/api/centrais'), { headers }),
        fetch(apiUrl('/api/almoxarifados'), { headers }),
        fetch(apiUrl('/api/sub_almoxarifados'), { headers }),
        fetch(apiUrl('/api/setores'), { headers })
      ]);

      if (resC.ok && resA.ok && resS.ok && resSet.ok) {
        const [centraisData, almoxData, subData, setoresData] = await Promise.all([
          resC.json(),
          resA.json(),
          resS.json(),
          resSet.json()
        ]);
        setCentrais(centraisData.map((c: Omit<Central, 'tipo'>) => ({ ...c, tipo: 'central' })));
        setAlmoxarifados(almoxData.map((a: Almoxarifado) => ({ ...a, tipo: a.tipo ?? 'almoxarifado' })));
        setSubAlmoxarifados(subData.map((s: SubAlmoxarifado) => ({ ...s, tipo: s.tipo ?? 'sub_almoxarifado' })));
        setSetores(setoresData.map((s: Omit<Setor, 'tipo'>) => ({ ...s, tipo: 'setor' })));
      }
    } catch (error) {
      console.error('Erro ao buscar dados:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (item: TreeItem) => {
    let parentRef = '';
    if (item.tipo === 'almoxarifado') parentRef = item.central_id ? `central:${item.central_id}` : '';
    if (item.tipo === 'sub_almoxarifado') parentRef = item.almoxarifado_id ? `almox:${item.almoxarifado_id}` : '';
    let setorAlmoxId = '';
    let setorSubs: string[] = [];
    if (item.tipo === 'setor') {
      setorAlmoxId = item.almoxarifado_id || '';
      setorSubs = item.sub_almoxarifado_ids?.length
        ? item.sub_almoxarifado_ids
        : item.sub_almoxarifado_id
          ? [item.sub_almoxarifado_id]
          : [];
      if (!setorAlmoxId && setorSubs.length) {
        const sub = subAlmoxarifados.find(s => s.id === setorSubs[0]);
        setorAlmoxId = sub?.almoxarifado_id || '';
      }
    }

    const endereco = 'endereco' in item ? item.endereco ?? '' : '';
    const descricao = 'descricao' in item ? item.descricao ?? '' : '';
    const responsavel = 'responsavel' in item ? item.responsavel ?? '' : '';
    const email = 'email' in item ? item.email ?? '' : '';
    const canReceive = 'can_receive_inter_central' in item ? Boolean(item.can_receive_inter_central) : false;

    setFormData({ 
      nome: item.nome, 
      endereco,
      descricao,
      responsavel,
      email,
      tipo: item.tipo,
      parent_ref: parentRef,
      setor_almoxarifado_id: setorAlmoxId,
      setor_sub_almoxarifado_ids: setorSubs,
      can_receive_inter_central: canReceive
    });
    setEditingId(item.id);
    setShowModal(true);
  };

  const handleDelete = async (id: string, tipo: string) => {
    if (!confirm('Tem certeza que deseja excluir este item?')) return;
    
    let endpoint = '';
    if (tipo === 'central') endpoint = 'centrais';
    else if (tipo === 'almoxarifado') endpoint = 'almoxarifados';
    else if (tipo === 'sub_almoxarifado') endpoint = 'sub_almoxarifados';
    else if (tipo === 'setor') endpoint = 'setores';
    else return;
    
    try {
      if (!user) return;
      const res = await fetch(apiUrl(`/api/${endpoint}/${id}`), {
        method: 'DELETE',
        headers: { 'X-User-Id': user.id }
      });
      if (res.ok) fetchData(user.id);
      else alert('Erro ao excluir. Verifique se existem itens vinculados.');
    } catch {
      alert('Erro de conexão');
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (!user) return;
        let endpoint = '';
        if (formData.tipo === 'central') endpoint = 'centrais';
        else if (formData.tipo === 'almoxarifado') endpoint = 'almoxarifados';
        else if (formData.tipo === 'sub_almoxarifado') endpoint = 'sub_almoxarifados';
        else if (formData.tipo === 'setor') endpoint = 'setores';

      const url = editingId 
        ? apiUrl(`/api/${endpoint}/${editingId}`)
        : apiUrl(`/api/${endpoint}`);
      
      const method = editingId ? 'PUT' : 'POST';

      const payload: Record<string, unknown> = { nome: formData.nome };
      const parentId = formData.parent_ref ? formData.parent_ref.split(':', 2)[1] : '';
      if (formData.tipo === 'central') {
          payload.endereco = formData.endereco;
          payload.descricao = formData.descricao;
      } else if (formData.tipo === 'almoxarifado') {
          payload.endereco = formData.endereco;
          payload.central_id = parentId;
      } else if (formData.tipo === 'sub_almoxarifado') {
          payload.descricao = formData.descricao;
          payload.almoxarifado_id = parentId;
      } else if (formData.tipo === 'setor') {
          if (formData.responsavel) payload.responsavel = formData.responsavel;
          if (formData.email) payload.email = formData.email;
          payload.almoxarifado_id = formData.setor_almoxarifado_id;
          payload.sub_almoxarifado_ids = formData.setor_sub_almoxarifado_ids.length ? formData.setor_sub_almoxarifado_ids : undefined;
      }
      if (formData.tipo !== 'central') {
        payload.can_receive_inter_central = formData.can_receive_inter_central;
      }

      const res = await fetch(url, {
        method: method,
        headers: { 'Content-Type': 'application/json', 'X-User-Id': user.id },
        body: JSON.stringify(payload)
      });
      
      if (res.ok) {
        setShowModal(false);
        resetForm();
        fetchData(user.id);
      } else {
        const err = await res.json();
        alert('Erro ao salvar: ' + (err.detail || 'Erro desconhecido'));
      }
    } catch {
      alert('Erro de conexão');
    }
  };

  const resetForm = () => {
    setFormData({
      nome: '',
      endereco: '',
      descricao: '',
      responsavel: '',
      email: '',
      tipo: 'almoxarifado',
      parent_ref: '',
      setor_almoxarifado_id: '',
      setor_sub_almoxarifado_ids: [],
      can_receive_inter_central: false
    });
    setEditingId(null);
  };

  const openNewModal = () => {
    resetForm();
    setShowModal(true);
  };

  // Opções para select de pai
  const getAvailableParents = () => {
      if (formData.tipo === 'almoxarifado') return centrais.map(c => ({ id: `central:${c.id}`, nome: c.nome, tipo: 'Central' }));
      if (formData.tipo === 'sub_almoxarifado') return almoxarifados.map(a => ({ id: `almox:${a.id}`, nome: a.nome, tipo: 'Almoxarifado' }));
      return [];
  };

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Warehouse className="h-6 w-6 text-blue-600" />
            Hierarquia de Locais
          </h1>
          <p className="text-gray-500 mt-1">Visualize e gerencie: Centrais &gt; Almoxarifados &gt; Sub-almoxarifados &gt; Setores</p>
        </div>
        <button 
          onClick={openNewModal}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus className="h-4 w-4" /> Novo Item
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 min-h-[400px]">
        {loading ? (
          <Loading label="Carregando estrutura" size="md" className="min-h-[340px]" />
        ) : centrais.length === 0 ? (
           <div className="text-center py-12">
             <Warehouse className="h-12 w-12 text-gray-300 mx-auto mb-4" />
             <p className="text-gray-500">Nenhuma central cadastrada.</p>
             <button onClick={openNewModal} className="text-blue-600 font-medium mt-2 hover:underline">
               Cadastrar primeira Central
             </button>
           </div>
        ) : (
          <div className="space-y-4">
            {centrais.map(central => (
              <HierarchyNode 
                key={central.id} 
                item={central} 
                allCentrais={centrais}
                allAlmoxarifados={almoxarifados} 
                allSubAlmoxarifados={subAlmoxarifados}
                allSetores={setores}
                onEdit={handleEdit}
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md shadow-xl">
            <h2 className="text-xl font-bold mb-4">{editingId ? 'Editar Item' : 'Novo Item'}</h2>
            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tipo de Local</label>
                <select 
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white"
                    value={formData.tipo}
                    onChange={e => setFormData({
                      ...formData,
                      tipo: e.target.value,
                      parent_ref: '',
                      setor_almoxarifado_id: '',
                      setor_sub_almoxarifado_ids: [],
                      can_receive_inter_central: false
                    })}
                    disabled={!!editingId} // Não mudar tipo na edição para simplificar
                  >
                    <option value="central">Central</option>
                    <option value="almoxarifado">Almoxarifado</option>
                    <option value="sub_almoxarifado">Sub-Almoxarifado</option>
                    <option value="setor">Setor</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nome</label>
                <input 
                  autoFocus
                  required
                  type="text" 
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  value={formData.nome}
                  onChange={e => setFormData({...formData, nome: e.target.value})}
                />
              </div>

              {(formData.tipo === 'almoxarifado' || formData.tipo === 'sub_almoxarifado') && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Vincular a ({formData.tipo === 'almoxarifado' ? 'Central' : 'Almoxarifado'})
                  </label>
                  <select 
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white"
                    value={formData.parent_ref}
                    onChange={e => setFormData({...formData, parent_ref: e.target.value})}
                  >
                    <option value="">Selecione...</option>
                    {getAvailableParents().map(p => (
                      <option key={p.id} value={p.id}>{p.nome}</option>
                    ))}
                  </select>
                </div>
              )}

              {formData.tipo === 'setor' && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Almoxarifado (Base)</label>
                    <select 
                      required
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white"
                      value={formData.setor_almoxarifado_id}
                      onChange={e => setFormData({ ...formData, setor_almoxarifado_id: e.target.value, setor_sub_almoxarifado_ids: [] })}
                    >
                      <option value="">Selecione o almoxarifado...</option>
                      {almoxarifados.map(a => (
                        <option key={a.id} value={a.id}>{a.nome}</option>
                      ))}
                    </select>
                  </div>

                  {formData.setor_almoxarifado_id && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Sub-Almoxarifados (Múltiplos)</label>
                      <div className="border border-gray-200 rounded-lg max-h-44 overflow-auto divide-y divide-gray-100">
                        {subAlmoxarifados
                          .filter(s => s.almoxarifado_id === formData.setor_almoxarifado_id)
                          .map(s => {
                            const checked = formData.setor_sub_almoxarifado_ids.includes(s.id);
                            return (
                              <label key={s.id} className="flex items-center gap-2 px-3 py-2 text-sm text-gray-700">
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() => {
                                    const next = checked
                                      ? formData.setor_sub_almoxarifado_ids.filter(x => x !== s.id)
                                      : [...formData.setor_sub_almoxarifado_ids, s.id];
                                    setFormData({ ...formData, setor_sub_almoxarifado_ids: next });
                                  }}
                                />
                                <span>{s.nome}</span>
                              </label>
                            );
                          })}
                      </div>
                      <p className="text-xs text-gray-500 mt-1">Deixe vazio para o Setor ficar direto no Almoxarifado.</p>
                    </div>
                  )}
                </>
              )}
              
              {(formData.tipo === 'central' || formData.tipo === 'almoxarifado') && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Endereço</label>
                    <input 
                      type="text" 
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                      value={formData.endereco}
                      onChange={e => setFormData({...formData, endereco: e.target.value})}
                    />
                  </div>
              )}

              {(formData.tipo === 'central' || formData.tipo === 'sub_almoxarifado') && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Descrição</label>
                    <textarea 
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                      rows={2}
                      value={formData.descricao}
                      onChange={e => setFormData({...formData, descricao: e.target.value})}
                    />
                  </div>
              )}

              {formData.tipo === 'setor' && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Responsável</label>
                    <input 
                      type="text" 
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                      value={formData.responsavel}
                      onChange={e => setFormData({...formData, responsavel: e.target.value})}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                    <input 
                      type="email" 
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                      value={formData.email}
                      onChange={e => setFormData({...formData, email: e.target.value})}
                    />
                  </div>
                </>
              )}

              {formData.tipo !== 'central' && (
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={formData.can_receive_inter_central}
                    onChange={() => setFormData({ ...formData, can_receive_inter_central: !formData.can_receive_inter_central })}
                  />
                  <span>Receber de Outra Central</span>
                </label>
              )}

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
