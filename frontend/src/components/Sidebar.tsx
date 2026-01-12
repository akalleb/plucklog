'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import { Package, ArrowLeftRight, Home, LogOut, PackagePlus, Truck, Box, Users, BarChart, Menu, Warehouse, UserCircle, MapPin, ShoppingCart } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';

export default function Sidebar() {
  const [isOpen, setIsOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout, canAccess, loading } = useAuth();

  useEffect(() => {
    if (!loading && !user && pathname !== '/login') {
      router.push('/login');
    }
  }, [user, loading, pathname, router]);

  if (loading) return null;

  // Não exibir sidebar na página de login
  if (pathname === '/login') return null;

  // Se não estiver logado (e não for página de login), não renderizar nada enquanto redireciona
  if (!user) return null;

  const getRoleLabel = (role?: string) => {
    const map: Record<string, string> = {
      'super_admin': 'Super Admin',
      'admin_central': 'Admin Central',
      'gerente_almox': 'Gerente',
      'resp_sub_almox': 'Resp. Sub',
      'operador_setor': 'Operador',
    };
    return map[role || ''] || role;
  };

  return (
    <>
      {/* Mobile Header Bar - Visible only on mobile */}
      <div className="md:hidden fixed top-0 left-0 right-0 h-16 bg-white border-b border-gray-200 z-30 flex items-center px-4 justify-between">
        <button 
          onClick={() => setIsOpen(true)}
          className="p-2 -ml-2 text-gray-700 hover:bg-gray-100 rounded-lg"
        >
          <Menu className="h-6 w-6" />
        </button>
        <Image src="/assets/logo_pluck.svg" alt="Pluck" width={240} height={64} className="h-10 w-auto" priority />
        <div className="w-8"></div> {/* Spacer for balance */}
      </div>

      {/* Overlay Background */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-30 md:hidden backdrop-blur-sm"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Sidebar Aside */}
      <aside className={`fixed left-0 top-0 h-full w-64 bg-white border-r border-gray-200 z-40 transition-transform duration-300 ease-in-out 
        ${isOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0`}>
        
        <div className="flex flex-col h-full">
          {/* Logo & Close Button */}
          <div className="h-16 flex items-center justify-between px-6 border-b border-gray-100">
            <Image src="/assets/logo_pluck.svg" alt="Pluck" width={240} height={64} className="h-10 w-auto" priority />
          </div>

          {/* Navigation */}
          <nav className="flex-1 py-6 px-3 space-y-1 overflow-y-auto">
            {user.role === 'operador_setor' ? (
              <>
                <Link
                  href="/setor"
                  onClick={() => setIsOpen(false)}
                  className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-colors group ${
                    pathname?.startsWith('/setor') ? 'bg-blue-50 text-blue-600' : 'text-gray-600 hover:bg-blue-50 hover:text-blue-600'
                  }`}
                >
                  <Home className="h-5 w-5" />
                  <span className="font-medium">Meu Setor</span>
                </Link>

                <Link
                  href="/setor/estoque"
                  onClick={() => setIsOpen(false)}
                  className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-colors group ${
                    pathname === '/setor/estoque' ? 'bg-blue-50 text-blue-600' : 'text-gray-600 hover:bg-blue-50 hover:text-blue-600'
                  }`}
                >
                  <Package className="h-5 w-5" />
                  <span className="font-medium">Estoque do Setor</span>
                </Link>

                <Link
                  href="/setor/consumo"
                  onClick={() => setIsOpen(false)}
                  className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-colors group ${
                    pathname === '/setor/consumo' ? 'bg-orange-50 text-orange-600' : 'text-gray-600 hover:bg-orange-50 hover:text-orange-600'
                  }`}
                >
                  <ArrowLeftRight className="h-5 w-5" />
                  <span className="font-medium">Registrar Consumo</span>
                </Link>

                <Link
                  href="/setor/demandas"
                  onClick={() => setIsOpen(false)}
                  className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-colors group ${
                    pathname === '/setor/demandas' ? 'bg-green-50 text-green-600' : 'text-gray-600 hover:bg-green-50 hover:text-green-600'
                  }`}
                >
                  <ShoppingCart className="h-5 w-5" />
                  <span className="font-medium">Demandas</span>
                </Link>
              </>
            ) : (
              <>
            <Link 
              href="/" 
              onClick={() => setIsOpen(false)}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-colors group ${
                pathname === '/' ? 'bg-blue-50 text-blue-600' : 'text-gray-600 hover:bg-blue-50 hover:text-blue-600'
              }`}
            >
              <Home className="h-5 w-5" />
              <span className="font-medium">Visão Geral</span>
            </Link>
          
          {(canAccess(['super_admin', 'admin_central', 'gerente_almox'])) && (
            <Link 
              href="/entrada" 
              onClick={() => setIsOpen(false)}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-colors group ${
                pathname === '/entrada' ? 'bg-green-50 text-green-600' : 'text-gray-600 hover:bg-green-50 hover:text-green-600'
              }`}
            >
              <PackagePlus className="h-5 w-5" />
              <span className="font-medium">Nova Entrada</span>
            </Link>
          )}

          {(canAccess(['super_admin', 'admin_central', 'gerente_almox', 'resp_sub_almox'])) && (
            <Link 
              href="/distribuicao" 
              onClick={() => setIsOpen(false)}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-colors group ${
                pathname === '/distribuicao' ? 'bg-orange-50 text-orange-600' : 'text-gray-600 hover:bg-orange-50 hover:text-orange-600'
              }`}
            >
              <Truck className="h-5 w-5" />
              <span className="font-medium">Distribuição</span>
            </Link>
          )}

          {(canAccess(['super_admin', 'admin_central', 'gerente_almox', 'resp_sub_almox'])) && (
            <Link 
              href="/saida" 
              onClick={() => setIsOpen(false)}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-colors group ${
                pathname?.startsWith('/saida') ? 'bg-orange-50 text-orange-600' : 'text-gray-600 hover:bg-orange-50 hover:text-orange-600'
              }`}
            >
              <MapPin className="h-5 w-5" />
              <span className="font-medium">Saída (Setores)</span>
            </Link>
          )}

          {(canAccess(['super_admin', 'admin_central', 'gerente_almox', 'resp_sub_almox'])) && (
            <Link
              href="/demandas"
              onClick={() => setIsOpen(false)}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-colors group ${
                pathname?.startsWith('/demandas') ? 'bg-blue-50 text-blue-600' : 'text-gray-600 hover:bg-blue-50 hover:text-blue-600'
              }`}
            >
              <ShoppingCart className="h-5 w-5" />
              <span className="font-medium">Demandas (Gestão)</span>
            </Link>
          )}

          <div className="pt-4 pb-2">
            <p className="px-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Gestão</p>
          </div>

          {(canAccess(['super_admin', 'admin_central'])) && (
            <>
              <Link 
                href="/produtos/novo" 
                onClick={() => setIsOpen(false)}
                className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-colors group ${
                  pathname === '/produtos/novo' ? 'bg-blue-50 text-blue-600' : 'text-gray-600 hover:bg-blue-50 hover:text-blue-600'
                }`}
              >
                <Package className="h-5 w-5" />
                <span className="font-medium">Cadastrar Produto</span>
              </Link>

              <Link 
                href="/categorias" 
                onClick={() => setIsOpen(false)}
                className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-colors group ${
                  pathname === '/categorias' ? 'bg-blue-50 text-blue-600' : 'text-gray-600 hover:bg-blue-50 hover:text-blue-600'
                }`}
              >
                <Box className="h-5 w-5" />
                <span className="font-medium">Categorias</span>
              </Link>

              <Link 
                href="/almoxarifados" 
                onClick={() => setIsOpen(false)}
                className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-colors group ${
                  pathname === '/almoxarifados' ? 'bg-blue-50 text-blue-600' : 'text-gray-600 hover:bg-blue-50 hover:text-blue-600'
                }`}
              >
                <Warehouse className="h-5 w-5" />
                <span className="font-medium">Hierarquia</span>
              </Link>
            </>
          )}

          {(canAccess(['super_admin'])) && (
            <Link 
              href="/usuarios" 
              onClick={() => setIsOpen(false)}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-colors group ${
                pathname === '/usuarios' ? 'bg-blue-50 text-blue-600' : 'text-gray-600 hover:bg-blue-50 hover:text-blue-600'
              }`}
            >
              <Users className="h-5 w-5" />
              <span className="font-medium">Usuários</span>
            </Link>
          )}

          <div className="pt-4 pb-2">
            <p className="px-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Relatórios</p>
          </div>

          <Link 
            href="/relatorios" 
            onClick={() => setIsOpen(false)}
            className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-colors group ${
              pathname === '/relatorios' ? 'bg-blue-50 text-blue-600' : 'text-gray-600 hover:bg-blue-50 hover:text-blue-600'
            }`}
          >
            <BarChart className="h-5 w-5" />
            <span className="font-medium">Financeiro & Ops</span>
          </Link>

          <Link 
            href="/movimentacoes" 
            onClick={() => setIsOpen(false)}
            className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-colors group ${
              pathname === '/movimentacoes' ? 'bg-blue-50 text-blue-600' : 'text-gray-600 hover:bg-blue-50 hover:text-blue-600'
            }`}
          >
            <ArrowLeftRight className="h-5 w-5" />
            <span className="font-medium">Histórico</span>
          </Link>
              </>
            )}
        </nav>

        {/* User / Footer */}
        <div className="p-4 border-t border-gray-100 bg-gray-50/50">
          {user ? (
            <div className="mb-3 flex items-center gap-3 px-2">
              <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold text-xs">
                {user.nome.substring(0, 2).toUpperCase()}
              </div>
              <div className="flex-1 overflow-hidden">
                <p className="text-sm font-semibold text-gray-900 truncate">{user.nome}</p>
                <p className="text-xs text-gray-500 truncate">{getRoleLabel(user.role)}</p>
              </div>
            </div>
          ) : (
            <div className="mb-3 px-2 flex items-center gap-2 text-gray-400 text-sm">
              <UserCircle className="h-5 w-5" />
              <span>Não autenticado</span>
            </div>
          )}
          
          <button 
            onClick={logout}
            className="flex items-center gap-2 text-sm text-red-600 hover:bg-red-50 px-3 py-2 rounded-lg w-full transition-colors justify-center font-medium"
          >
            <LogOut className="h-4 w-4" />
            <span>{user ? 'Sair do Sistema' : 'Ir para Login'}</span>
          </button>
        </div>
      </div>
    </aside>
    </>
  );
}
