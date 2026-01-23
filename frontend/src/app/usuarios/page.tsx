'use client';

import { useState, useEffect } from 'react';
import { Users, Search, Plus, Trash2, Edit2, Mail, Briefcase, MapPin } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { Loading } from '@/components/ui/Page';
import { apiUrl } from '@/lib/api';

interface User {
  id: string;
  nome: string;
  email: string;
  cargo?: string;
  role: string;
  scope_id?: string;
  central_id?: string;
  categoria_ids?: string[];
  ativo: boolean;
}

interface Location {
  id: string;
  nome: string;
  tipo?: string; // central, almoxarifado, sub_almoxarifado
  central_id?: string;
  almoxarifado_id?: string;
}

interface Setor {
  id: string;
  nome: string;
  central_id?: string;
}

interface Categoria {
  id: string;
  nome: string;
}

interface UserUpsertPayload {
  nome: string;
  email: string;
  password?: string;
  cargo: string;
  role: string;
  scope_id: string | null;
  central_id?: string | null;
  categoria_ids?: string[] | null;
}

export default function UsuariosPage() {
  const { user, loading: authLoading } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [setores, setSetores] = useState<Setor[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    nome: '',
    email: '',
    password: '',
    cargo: '',
    role: 'operador',
    scope_id: '',
    central_id: '',
    categoria_ids: [] as string[]
  });

  useEffect(() => {
    if (authLoading) return;
    if (!user) return;
    fetchData(user.id);
  }, [authLoading, user]);

  useEffect(() => {
    if (formData.role === 'super_admin') return;
    if (formData.central_id) return;

    const fixedCentralId = user?.role === 'admin_central' ? (user.scope_id || '') : '';
    if (fixedCentralId) {
      setFormData(prev => {
        if (prev.central_id) return prev;
        const next = { ...prev, central_id: fixedCentralId };
        if (next.role === 'admin_central') next.scope_id = fixedCentralId;
        return next;
      });
      return;
    }

    const centrais = locations.filter(l => l.tipo === 'central');
    if (centrais.length === 1) {
      const onlyCentralId = centrais[0]?.id || '';
      if (onlyCentralId) {
        setFormData(prev => {
          if (prev.central_id) return prev;
          const next = { ...prev, central_id: onlyCentralId };
          if (next.role === 'admin_central') next.scope_id = onlyCentralId;
          return next;
        });
      }
    }
  }, [formData.central_id, formData.role, locations, user]);

  const fetchData = async (userId: string) => {
    try {
      const headers = { 'X-User-Id': userId };
      const [resUsers, resCentrais, resAlmox, resSubs, resSets, resCats] = await Promise.all([
        fetch(apiUrl('/api/usuarios'), { headers }),
        fetch(apiUrl('/api/centrais'), { headers }),
        fetch(apiUrl('/api/almoxarifados'), { headers }),
        fetch(apiUrl('/api/sub_almoxarifados'), { headers }),
        fetch(apiUrl('/api/setores'), { headers }),
        fetch(apiUrl('/api/categorias'))
      ]);
      
      if (resUsers.ok) setUsers(await resUsers.json());
      const [centraisData, almoxData, subsData] = await Promise.all([
        resCentrais.ok ? resCentrais.json() : [],
        resAlmox.ok ? resAlmox.json() : [],
        resSubs.ok ? resSubs.json() : []
      ]);
      setLocations([
        ...centraisData.map((c: Location) => ({ ...c, tipo: 'central' })),
        ...almoxData.map((a: Location) => ({ ...a, tipo: 'almoxarifado' })),
        ...subsData.map((s: Location) => ({ ...s, tipo: 'sub_almoxarifado' }))
      ]);
      if (resSets.ok) setSetores(await resSets.json());
      if (resCats.ok) setCategorias(await resCats.json());

    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (u: User) => {
    const fixedCentralId = user?.role === 'admin_central' ? (user.scope_id || '') : '';
    setFormData({
      nome: u.nome,
      email: u.email,
      password: '', // Não preenche senha
      cargo: u.cargo || '',
      role: u.role,
      scope_id: u.scope_id || '',
      central_id: u.central_id || fixedCentralId,
      categoria_ids: u.categoria_ids || []
    });
    setEditingId(u.id);
    setShowModal(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Tem certeza que deseja excluir este usuário?')) return;
    try {
      const res = await fetch(apiUrl(`/api/usuarios/${id}`), { method: 'DELETE' });
      if (res.ok && user) fetchData(user.id);
    } catch {
      alert('Erro ao excluir');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (!user) return;
      const url = editingId 
        ? apiUrl(`/api/usuarios/${editingId}`)
        : apiUrl('/api/usuarios');
      
      const method = editingId ? 'PUT' : 'POST';
      
      // Se estiver editando e senha estiver vazia, remove do payload
      const payload: UserUpsertPayload = {
        nome: formData.nome,
        email: formData.email,
        cargo: formData.cargo,
        role: formData.role,
        scope_id: formData.scope_id || null,
        password: formData.password || undefined,
        categoria_ids: formData.categoria_ids,
        central_id: (formData.central_id || '').trim() || null
      };

      if (editingId && !payload.password) delete payload.password;
      if (!editingId && !payload.password) {
        alert("Senha é obrigatória para novos usuários");
        return;
      }
      // Limpar scope_id se for super_admin
      if (payload.role === 'super_admin') payload.scope_id = null;
      if (payload.role === 'super_admin') payload.categoria_ids = null;
      if (payload.role === 'super_admin') payload.central_id = null;

      if (payload.role !== 'super_admin') {
        if (!payload.central_id) {
          alert('Central é obrigatória');
          return;
        }
        if (payload.role === 'admin_central') {
          payload.scope_id = payload.central_id;
        }
      }

      const res = await fetch(url, {
        method: method,
        headers: { 'Content-Type': 'application/json', 'X-User-Id': user.id },
        body: JSON.stringify(payload)
      });
      
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Erro ao salvar');
      }
      
      setShowModal(false);
      const fixedCentralId = user?.role === 'admin_central' ? (user.scope_id || '') : '';
      setFormData({ nome: '', email: '', password: '', cargo: '', role: 'operador', scope_id: '', central_id: fixedCentralId, categoria_ids: [] });
      setEditingId(null);
      fetchData(user.id);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Erro ao salvar';
      alert(message);
    }
  };

  const openNewModal = () => {
    const fixedCentralId = user?.role === 'admin_central' ? (user.scope_id || '') : '';
    setFormData({ nome: '', email: '', password: '', cargo: '', role: 'operador', scope_id: '', central_id: fixedCentralId, categoria_ids: [] });
    setEditingId(null);
    setShowModal(true);
  };

  const getRoleLabel = (role: string) => {
    const map: Record<string, string> = {
      'super_admin': 'Super Admin',
      'admin_central': 'Admin Central',
      'gerente_almox': 'Gerente Almox.',
      'resp_sub_almox': 'Resp. Sub-Almox.',
      'operador_setor': 'Operador Setor',
      'operador': 'Operador',
      'admin': 'Admin (Legado)'
    };
    return map[role] || role;
  };

  const getScopeName = (id?: string) => {
    if (!id) return '-';
    const loc = locations.find(l => l.id === id);
    if (loc) return loc.nome;
    const set = setores.find(s => s.id === id);
    if (set) return set.nome;
    return id;
  };

  // Filtrar locais com base no papel selecionado
  const getAvailableScopes = () => {
    const role = formData.role;
    const centralId = formData.central_id;
    if (role === 'admin_central') {
      if (centralId) return locations.filter(l => l.tipo === 'central' && l.id === centralId);
      return locations.filter(l => l.tipo === 'central');
    }
    if (role === 'gerente_almox') {
      return locations.filter(l => l.tipo === 'almoxarifado' && (!centralId || l.central_id === centralId));
    }
    if (role === 'resp_sub_almox') {
      return locations.filter(l => {
        if (l.tipo !== 'sub_almoxarifado') return false;
        if (!centralId) return true;
        const almoxId = l.almoxarifado_id;
        const almoxCentralId = almoxId ? locations.find(a => a.tipo === 'almoxarifado' && a.id === almoxId)?.central_id : undefined;
        return almoxCentralId === centralId;
      });
    }
    if (role === 'operador_setor') return setores; // Precisa converter Setor para formato compatível ou usar outro map
    return [];
  };

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Users className="h-6 w-6 text-blue-600" />
            Gestão de Usuários e Acesso
          </h1>
          <p className="text-gray-500 mt-1">Controle quem tem acesso ao sistema e suas permissões hierárquicas.</p>
        </div>
        <button 
          onClick={openNewModal}
          className="soft-btn-primary flex items-center gap-2 px-4 py-2"
        >
          <Plus className="h-4 w-4" /> Novo Usuário
        </button>
      </div>

      <div className="soft-card overflow-hidden">
        <div className="p-4 border-b border-gray-100/70 bg-white/40 flex gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input 
              type="text" 
              placeholder="Buscar usuários..."
              className="soft-input w-full pl-10 pr-4 py-2 outline-none"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-gray-50 text-gray-500 text-sm">
                <th className="px-6 py-3 font-medium">Usuário</th>
                <th className="px-6 py-3 font-medium">Email / Cargo</th>
                <th className="px-6 py-3 font-medium">Perfil & Acesso</th>
                <th className="px-6 py-3 font-medium text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr>
                  <td colSpan={4} className="p-0">
                    <Loading size="sm" />
                  </td>
                </tr>
              ) : users.map(user => (
                <tr key={user.id} className="hover:bg-gray-50">
                  <td className="px-6 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold text-xs">
                        {user.nome.substring(0, 2).toUpperCase()}
                      </div>
                      <span className="font-medium text-gray-900">{user.nome}</span>
                    </div>
                  </td>
                  <td className="px-6 py-3">
                    <div className="flex flex-col text-sm">
                      <span className="text-gray-900 flex items-center gap-1"><Mail className="h-3 w-3 text-gray-400"/> {user.email}</span>
                      <span className="text-gray-500 flex items-center gap-1"><Briefcase className="h-3 w-3 text-gray-400"/> {user.cargo || 'Não informado'}</span>
                    </div>
                  </td>
                  <td className="px-6 py-3">
                    <div className="flex flex-col gap-1 items-start">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium capitalize ${
                        user.role === 'super_admin' ? 'bg-purple-100 text-purple-800' : 'bg-blue-50 text-blue-700'
                      }`}>
                        {getRoleLabel(user.role)}
                      </span>
                      {user.scope_id && (
                        <span className="text-xs text-gray-500 flex items-center gap-1">
                          <MapPin className="h-3 w-3" /> {getScopeName(user.scope_id)}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-3 text-right">
                    <div className="flex justify-end gap-2">
                      <button onClick={() => handleEdit(user)} className="text-gray-400 hover:text-blue-600 p-1">
                        <Edit2 className="h-4 w-4" />
                      </button>
                      <button onClick={() => handleDelete(user.id)} className="text-gray-400 hover:text-red-600 p-1">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {!loading && users.length === 0 && (
                <tr><td colSpan={4} className="p-8 text-center text-gray-400">Nenhum usuário cadastrado.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="soft-card-strong p-6 w-full max-w-md">
            <h2 className="text-xl font-bold mb-4">{editingId ? 'Editar Usuário' : 'Novo Usuário'}</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nome Completo</label>
                <input 
                  autoFocus
                  required
                  type="text" 
                  className="soft-input w-full px-3 py-2 outline-none"
                  value={formData.nome}
                  onChange={e => setFormData({...formData, nome: e.target.value})}
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input 
                  required
                  type="email" 
                  className="soft-input w-full px-3 py-2 outline-none"
                  value={formData.email}
                  onChange={e => setFormData({...formData, email: e.target.value})}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Senha {editingId && <span className="text-gray-400 font-normal">(Deixe em branco para manter)</span>}
                </label>
                <input 
                  type="password" 
                  className="soft-input w-full px-3 py-2 outline-none"
                  value={formData.password}
                  onChange={e => setFormData({...formData, password: e.target.value})}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Cargo</label>
                  <input 
                    type="text" 
                    className="soft-input w-full px-3 py-2 outline-none"
                    value={formData.cargo}
                    onChange={e => setFormData({...formData, cargo: e.target.value})}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Perfil (Role)</label>
                  <select 
                    className="soft-input w-full px-3 py-2 outline-none"
                    value={formData.role}
                    onChange={e => {
                      const nextRole = e.target.value;
                      setFormData(prev => {
                        if (nextRole === 'super_admin') {
                          return { ...prev, role: nextRole, scope_id: '', central_id: '' };
                        }
                        if (nextRole === 'admin_central') {
                          const nextCentralId = prev.central_id || '';
                          return { ...prev, role: nextRole, scope_id: nextCentralId };
                        }
                        return { ...prev, role: nextRole, scope_id: '' };
                      });
                    }}
                  >
                    <option value="operador">Operador</option>
                    <option value="super_admin">Super Admin</option>
                    <option value="admin_central">Admin Central</option>
                    <option value="gerente_almox">Gerente Almox.</option>
                    <option value="resp_sub_almox">Resp. Sub-Almox.</option>
                    <option value="operador_setor">Operador Setor</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Central {formData.role !== 'super_admin' && <span className="text-red-600">*</span>}
                </label>
                <select
                  required={formData.role !== 'super_admin'}
                  className="soft-input w-full px-3 py-2 outline-none"
                  value={formData.central_id}
                  onChange={e => {
                    const nextCentralId = (e.target.value || '').trim();
                    setFormData(prev => {
                      const next: typeof prev = { ...prev, central_id: nextCentralId };
                      if (next.role === 'admin_central') {
                        next.scope_id = nextCentralId;
                      } else {
                        next.scope_id = '';
                      }
                      return next;
                    });
                  }}
                  disabled={user?.role === 'admin_central' && !!user.scope_id}
                >
                  <option value="">Selecione a central...</option>
                  {locations
                    .filter(l => l.tipo === 'central')
                    .map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </select>
              </div>

              {/* Seleção de Escopo (Local) - Condicional */}
              {['admin_central', 'gerente_almox', 'resp_sub_almox', 'operador_setor'].includes(formData.role) && (
                 <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Local de Atuação
                    </label>
                    <select 
                      required
                      className="soft-input w-full px-3 py-2 outline-none"
                      value={formData.scope_id}
                      onChange={e => setFormData({...formData, scope_id: e.target.value})}
                    >
                      <option value="">Selecione o local...</option>
                      {formData.role === 'operador_setor' 
                        ? setores
                            .filter(s => !formData.central_id || s.central_id === formData.central_id)
                            .map(s => <option key={s.id} value={s.id}>{s.nome}</option>)
                        : getAvailableScopes().map(l => <option key={l.id} value={l.id}>{l.nome}</option>)
                      }
                    </select>
                 </div>
              )}

              {formData.role !== 'super_admin' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Categorias Responsáveis</label>
                  <div className="soft-card max-h-44 overflow-auto divide-y divide-gray-100">
                    {categorias.map(cat => {
                      const checked = formData.categoria_ids.includes(cat.id);
                      return (
                        <label key={cat.id} className="flex items-center gap-2 px-3 py-2 text-sm text-gray-700">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => {
                              const next = checked
                                ? formData.categoria_ids.filter(x => x !== cat.id)
                                : [...formData.categoria_ids, cat.id];
                              setFormData({ ...formData, categoria_ids: next });
                            }}
                          />
                          <span>{cat.nome}</span>
                        </label>
                      );
                    })}
                  </div>
                  <p className="text-xs text-gray-500 mt-1">Se vazio, usuário não fica limitado por categoria.</p>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-4">
                <button 
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="soft-btn px-4 py-2 text-gray-700"
                >
                  Cancelar
                </button>
                <button 
                  type="submit"
                  className="soft-btn-primary px-4 py-2"
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
