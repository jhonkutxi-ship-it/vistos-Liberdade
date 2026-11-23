/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/src/hooks/useAuth';
import { useCompanySettings } from '@/src/hooks/useCompanySettings';
import { cn } from '@/src/lib/utils';
import { Button } from './ui/Button';
import { PermissionKey } from '@/src/types';
import {
  LayoutDashboard,
  FileText,
  Settings,
  Users,
  BarChart3,
  PlaneTakeoff,
  Ticket,
  ShieldCheck,
  Wallet,
  Users2,
  PlusCircle,
  SlidersHorizontal,
  CheckSquare,
} from 'lucide-react';

export function Sidebar() {
  const { profile, hasPermission, isClient } = useAuth();
  const { company } = useCompanySettings();
  const location = useLocation();
  const navigate = useNavigate();

  const navItems: {
    label: string;
    path: string;
    icon: any;
    roles: string[];
    permission?: PermissionKey;
  }[] = [
    { label: 'Dashboard', path: '/', icon: LayoutDashboard, roles: ['employee', 'admin'] },
    { label: 'Pacotes & Assessoria', path: '/', icon: PlaneTakeoff, roles: ['client'] },
    { label: 'Meus Processos', path: '/processes', icon: FileText, roles: ['client'] },
    {
      label: 'Gestão de Processos',
      path: '/admin/processes',
      icon: FileText,
      roles: ['employee', 'admin'],
      permission: 'manage_processes',
    },
    {
      label: 'Clientes',
      path: '/admin/clients',
      icon: Users,
      roles: ['employee', 'admin'],
      permission: 'manage_clients',
    },
    {
      label: 'Faturas & Caixa',
      path: '/admin/finances',
      icon: Wallet,
      roles: ['employee', 'admin'],
      permission: 'manage_finances',
    },
    {
      label: 'Relatórios',
      path: '/admin/analytics',
      icon: BarChart3,
      roles: ['employee', 'admin'],
      permission: 'view_reports',
    },
    { label: 'Serviços Públicos', path: '/services', icon: PlaneTakeoff, roles: ['employee', 'admin'] },
    {
      label: 'Gerir Serviços & Preços',
      path: '/admin/services',
      icon: SlidersHorizontal,
      roles: ['employee', 'admin'],
      permission: 'manage_services',
    },
    {
      label: 'RH & Funcionários',
      path: '/admin/employees',
      icon: Users2,
      roles: ['employee', 'admin'],
      permission: 'manage_employees',
    },
    {
      label: 'Tarefas & Prazos',
      path: '/admin/tasks',
      icon: CheckSquare,
      roles: ['employee', 'admin'],
    },
    { label: 'Reservas e Bilhetes', path: '/bookings', icon: Ticket, roles: ['client', 'employee', 'admin'] },
    { label: 'Configurações', path: '/settings', icon: Settings, roles: ['client', 'employee', 'admin'] },
  ];

  const filteredItems = navItems.filter((item) => {
    const roleOk = item.roles.includes(profile?.role || '');
    if (!roleOk) return false;
    if (item.permission) {
      return hasPermission(item.permission);
    }
    return true;
  });

  return (
    <aside className="w-64 bg-white border-r border-gray-100 hidden lg:flex flex-col h-screen sticky top-0 shadow-sm z-40">
      <div className="p-6 flex items-center gap-3">
        {company.logoUrl ? (
          <img
            src={company.logoUrl}
            alt={company.name}
            referrerPolicy="no-referrer"
            className="w-10 h-10 rounded-lg object-contain border border-gray-100 bg-white shrink-0"
          />
        ) : (
          <div className="w-10 h-10 bg-teal rounded-lg flex items-center justify-center shadow-lg shadow-teal/20 shrink-0">
            <ShieldCheck className="w-6 h-6 text-white" />
          </div>
        )}
        <span className="text-lg font-bold text-gray-900 tracking-tight font-display truncate">
          {company.name}
        </span>
      </div>
      <nav className="flex-1 px-4 space-y-1 overflow-y-auto py-4">
        {filteredItems.map((item) => {
          const Icon = item.icon;
          const isActive = location.pathname === item.path;
          return (
            <Link
              key={item.path}
              to={item.path}
              className={cn(
                'flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-semibold transition-all duration-200 group',
                isActive
                  ? 'bg-teal-light text-teal shadow-sm border border-teal/10'
                  : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900'
              )}
            >
              <Icon
                className={cn(
                  'w-5 h-5 transition-colors shrink-0',
                  isActive ? 'text-teal' : 'text-gray-400 group-hover:text-gray-600'
                )}
              />
              <span className="truncate">{item.label}</span>
            </Link>
          );
        })}
      </nav>
      <div className="p-4 border-t border-gray-100 bg-gray-50/50">
        <div className="bg-gradient-to-br from-teal to-teal-dark rounded-xl p-4 text-white shadow-md">
          <p className="text-[10px] font-bold opacity-80 uppercase tracking-[0.1em] mb-1">Acesso Rápido</p>
          <p className="text-sm font-bold mb-3 leading-tight">Pronto para começar um novo pedido?</p>
          <Button
            onClick={() => navigate(isClient ? '/services?new=1' : '/admin/processes?new=1')}
            variant="secondary"
            size="sm"
            className="w-full text-teal font-extrabold bg-white hover:bg-teal-light border-none shadow-sm shadow-black/5 gap-2"
          >
            <PlusCircle className="w-4 h-4" />
            Iniciar Processo
          </Button>
        </div>
      </div>
    </aside>
  );
}
