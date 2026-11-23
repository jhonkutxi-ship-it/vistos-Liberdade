/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { collection, doc, onSnapshot, query, updateDoc, where, writeBatch } from 'firebase/firestore';
import { db } from '@/src/firebase';
import { useAuth } from '@/src/hooks/useAuth';
import { useCompanySettings } from '@/src/hooks/useCompanySettings';
import { AppNotification, StaffTask } from '@/src/types';
import { Button } from './ui/Button';
import { LogOut, User, Menu, X, Settings, Bell, Check, ArrowRight, UserCheck, AlertTriangle } from 'lucide-react';
import { cn } from '@/src/lib/utils';

export function Navbar() {
  const { user, profile, logout, hasPermission } = useAuth();
  const { company } = useCompanySettings();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [personalNotifs, setPersonalNotifs] = useState<AppNotification[]>([]);
  const [defaultManpeNotifs, setDefaultManpeNotifs] = useState<AppNotification[]>([]);
  const [staffTasks, setStaffTasks] = useState<StaffTask[]>([]);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const [overdueBannerDismissed, setOverdueBannerDismissed] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  const isClientRole = profile?.role === 'client';
  const isStaff = profile?.role === 'admin' || profile?.role === 'employee';

  useEffect(() => {
    if (!profile?.uid) return;

    const qMain = query(collection(db, 'notifications'), where('recipientUid', '==', profile.uid));
    const unsubMain = onSnapshot(
      qMain,
      (snap) => {
        const list = snap.docs.map((d) => ({
          ...d.data(),
          id: d.id,
          createdAt: d.data().createdAt?.toDate?.()?.toISOString() || d.data().createdAt || '',
        })) as AppNotification[];
        setPersonalNotifs(list);
      },
      () => {}
    );

    let unsubManpe: (() => void) | undefined;
    if (profile.email?.toLowerCase().includes('manpe') && profile.uid !== 'manpe123-default') {
      const qManpe = query(collection(db, 'notifications'), where('recipientUid', '==', 'manpe123-default'));
      unsubManpe = onSnapshot(
        qManpe,
        (snap) => {
          const list = snap.docs.map((d) => ({
            ...d.data(),
            id: d.id,
            createdAt: d.data().createdAt?.toDate?.()?.toISOString() || d.data().createdAt || '',
          })) as AppNotification[];
          setDefaultManpeNotifs(list);
        },
        () => {}
      );
    }

    return () => {
      unsubMain();
      unsubManpe?.();
    };
  }, [profile?.uid, profile?.email]);

  const notifications = useMemo(() => {
    const map = new Map<string, AppNotification>();
    [...personalNotifs, ...defaultManpeNotifs].forEach((n) => map.set(n.id, n));
    return Array.from(map.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }, [personalNotifs, defaultManpeNotifs]);

  useEffect(() => {
    if (!isStaff) {
      setStaffTasks([]);
      return;
    }
    const timer = setInterval(() => setNowMs(Date.now()), 30000);
    const unsubTasks = onSnapshot(
      collection(db, 'tasks'),
      (snap) => {
        const list = snap.docs.map((d) => ({ ...d.data(), id: d.id })) as StaffTask[];
        setStaffTasks(list);
      },
      () => {}
    );
    return () => {
      clearInterval(timer);
      unsubTasks();
    };
  }, [isStaff]);

  const overdueTasks = useMemo(() => {
    if (!isStaff) return [];
    return staffTasks.filter((t) => {
      if (t.status === 'completed' || !t.dueDate) return false;
      const isMine =
        t.assignedToUid === profile?.uid ||
        (Array.isArray(t.assigneeUids) && t.assigneeUids.includes(profile?.uid || ''));
      if (profile?.role !== 'admin' && !isMine) return false;
      const safeTime = t.dueTime && /^\d{2}:\d{2}$/.test(t.dueTime) ? t.dueTime : '18:00';
      const dueMs = new Date(`${t.dueDate}T${safeTime}:00`).getTime();
      return !Number.isNaN(dueMs) && dueMs < nowMs;
    });
  }, [staffTasks, isStaff, profile?.role, profile?.uid, nowMs]);

  const unreadNotifications = useMemo(() => notifications.filter((n) => !n.read), [notifications]);

  const handleMarkAsRead = async (notif: AppNotification, shouldNavigate = false) => {
    try {
      if (!notif.read) {
        await updateDoc(doc(db, 'notifications', notif.id), { read: true });
      }
      if (shouldNavigate) {
        setNotificationsOpen(false);
        if (notif.taskId) {
          navigate('/admin/tasks');
        } else if (notif.processId) {
          navigate(isStaff ? '/admin/processes' : '/processes');
        } else {
          navigate('/');
        }
      }
    } catch (err) {
      console.error('Erro ao marcar notificação:', err);
    }
  };

  const handleMarkAllRead = async () => {
    if (unreadNotifications.length === 0) return;
    try {
      const batch = writeBatch(db);
      unreadNotifications.forEach((n) => {
        batch.update(doc(db, 'notifications', n.id), { read: true });
      });
      await batch.commit();
    } catch (err) {
      console.error('Erro ao limpar notificações:', err);
    }
  };

  const mobileLinks = [
    { label: isClientRole ? 'Pacotes & Assessoria' : 'Dashboard', path: '/', show: true },
    { label: isClientRole ? 'Meus Processos' : 'Processos', path: isClientRole ? '/processes' : '/admin/processes', show: true },
    { label: 'Clientes', path: '/admin/clients', show: hasPermission('manage_clients') },
    { label: 'Faturas & Caixa', path: '/admin/finances', show: hasPermission('manage_finances') || hasPermission('issue_receipts') },
    { label: 'Relatórios', path: '/admin/analytics', show: hasPermission('view_reports') },
    { label: 'Serviços', path: '/services', show: !isClientRole },
    { label: 'Gerir Serviços', path: '/admin/services', show: hasPermission('manage_services') },
    { label: 'Funcionários', path: '/admin/employees', show: hasPermission('manage_employees') },
    { label: 'Tarefas & Prazos', path: '/admin/tasks', show: isStaff },
    { label: 'Configurações', path: '/settings', show: true },
  ].filter((l) => l.show);

  return (
    <>
      <header className="h-16 bg-white border-b border-gray-100 px-6 flex items-center justify-between sticky top-0 z-30 shadow-sm">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="lg:hidden p-2 rounded-lg text-gray-600 hover:bg-gray-100"
            aria-label="Abrir Menu"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
          <h2 className="text-lg font-bold text-teal font-display truncate">{company.name}</h2>
        </div>

        <div className="flex items-center gap-2 sm:gap-3 relative">
          {isStaff && overdueTasks.length > 0 && (
            <button
              type="button"
              onClick={() => navigate('/admin/tasks')}
              title="Tarefas com prazo expirado"
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-red-50 border border-red-200 text-red-700 hover:bg-red-100 text-xs font-extrabold transition-colors"
            >
              <AlertTriangle className="w-3.5 h-3.5 text-red-600 animate-pulse" />
              <span className="hidden sm:inline">{overdueTasks.length} Atrasada(s)</span>
              <span className="sm:hidden">{overdueTasks.length}</span>
            </button>
          )}
          {/* Sino de Notificações Real */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setNotificationsOpen((prev) => !prev)}
              title="Notificações"
              aria-label="Notificações"
              className="relative p-2 rounded-lg text-gray-500 hover:bg-teal-light hover:text-teal transition-colors"
            >
              <Bell className="w-5 h-5" />
              {unreadNotifications.length > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-red-600 text-white text-[10px] font-black flex items-center justify-center tabular-nums shadow">
                  {unreadNotifications.length > 9 ? '9+' : unreadNotifications.length}
                </span>
              )}
            </button>

            {notificationsOpen && (
              <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-white rounded-2xl border border-gray-200 shadow-2xl z-50 overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between bg-gray-50/70">
                  <div>
                    <p className="text-sm font-bold text-gray-900">Notificações</p>
                    <p className="text-[11px] text-gray-500">
                      {unreadNotifications.length} não lida(s)
                    </p>
                  </div>
                  {unreadNotifications.length > 0 && (
                    <button
                      type="button"
                      onClick={handleMarkAllRead}
                      className="text-xs font-bold text-teal hover:underline inline-flex items-center gap-1"
                    >
                      <Check className="w-3.5 h-3.5" />
                      Marcar todas
                    </button>
                  )}
                </div>

                <div className="max-h-80 overflow-y-auto divide-y divide-gray-100">
                  {notifications.length === 0 ? (
                    <div className="p-6 text-center text-xs text-gray-500">
                      Sem notificações no momento.
                    </div>
                  ) : (
                    notifications.slice(0, 15).map((notif) => (
                      <div
                        key={notif.id}
                        onClick={() => handleMarkAsRead(notif, true)}
                        className={cn(
                          'p-3.5 cursor-pointer transition-colors hover:bg-gray-50 flex items-start gap-3',
                          !notif.read ? 'bg-teal-light/25' : 'bg-white'
                        )}
                      >
                        <div
                          className={cn(
                            'w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5',
                            !notif.read ? 'bg-teal text-white' : 'bg-gray-100 text-gray-400'
                          )}
                        >
                          <UserCheck className="w-4 h-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-xs font-bold text-gray-900 truncate">{notif.title}</p>
                            {!notif.read && (
                              <span className="text-[10px] font-bold text-teal shrink-0">Nova</span>
                            )}
                          </div>
                          <p className="text-xs text-gray-600 mt-0.5 line-clamp-2">{notif.message}</p>
                          <p className="text-[10px] text-gray-400 mt-1">
                            {notif.createdAt ? new Date(notif.createdAt).toLocaleString('pt-AO') : ''}
                          </p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          <Link
            to="/settings"
            title="Definições"
            className="p-2 rounded-lg text-gray-500 hover:bg-teal-light hover:text-teal transition-colors"
          >
            <Settings className="w-5 h-5" />
          </Link>

          <div className="flex items-center gap-3 pl-3 border-l border-gray-100">
            <div className="text-right hidden sm:block">
              <p className="text-sm font-bold text-gray-900 leading-tight">
                {profile?.displayName || user?.displayName || profile?.email}
              </p>
              <p className="text-[10px] text-teal font-bold uppercase tracking-wider">
                {profile?.role === 'admin' ? 'Administrador' : profile?.role === 'employee' ? 'Funcionário' : 'Cliente'}
              </p>
            </div>
            {user?.photoURL ? (
              <img
                src={user.photoURL}
                alt="User"
                className="w-9 h-9 rounded-full border border-gray-100 object-cover"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="w-9 h-9 rounded-full bg-teal-light flex items-center justify-center border border-teal/10 shadow-inner">
                <User className="w-5 h-5 text-teal" />
              </div>
            )}
            <Button
              variant="ghost"
              size="icon"
              onClick={logout}
              title="Sair"
              className="hover:bg-red-50 hover:text-red-500 transition-colors"
            >
              <LogOut className="w-5 h-5" />
            </Button>
          </div>
        </div>

        {mobileMenuOpen && (
          <div className="lg:hidden fixed inset-x-0 top-16 bg-white border-b border-gray-200 shadow-xl z-40 p-4 space-y-1">
            {mobileLinks.map((link) => (
              <Link
                key={link.path}
                to={link.path}
                onClick={() => setMobileMenuOpen(false)}
                className={cn(
                  'block px-4 py-2.5 rounded-lg text-sm font-semibold',
                  location.pathname === link.path
                    ? 'bg-teal-light text-teal'
                    : 'text-gray-600 hover:bg-gray-50'
                )}
              >
                {link.label}
              </Link>
            ))}
          </div>
        )}
      </header>

      {/* Notificação imediata ao fazer login quando o operador foi solicitado */}
      {!bannerDismissed && unreadNotifications.length > 0 && (
        <div className="bg-teal text-white px-6 py-3 shadow-md animate-in slide-in-from-top-2 duration-300">
          <div className="max-w-7xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start sm:items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-white/15 flex items-center justify-center shrink-0">
                <Bell className="w-4 h-4 text-white" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-black uppercase tracking-wider text-teal-light">
                  {unreadNotifications.length === 1
                    ? unreadNotifications[0].title
                    : `${unreadNotifications.length} Novas Solicitações para Si`}
                </p>
                <p className="text-sm font-medium text-white truncate">
                  {unreadNotifications[0].message}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button
                type="button"
                size="sm"
                onClick={() => handleMarkAsRead(unreadNotifications[0], true)}
                className="bg-white text-teal hover:bg-teal-light font-bold text-xs h-8 gap-1.5 whitespace-nowrap"
              >
                Ver Solicitação
                <ArrowRight className="w-3.5 h-3.5" />
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setBannerDismissed(true)}
                className="text-white/85 hover:text-white hover:bg-white/10 text-xs h-8 whitespace-nowrap"
              >
                Fechar
              </Button>
            </div>
          </div>
        </div>
      )}
      {/* Alerta automático de tarefas não concluídas dentro do prazo */}
      {isStaff && !overdueBannerDismissed && overdueTasks.length > 0 && location.pathname !== '/admin/tasks' && (
        <div className="bg-red-600 text-white px-6 py-2.5 shadow-md">
          <div className="max-w-7xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <AlertTriangle className="w-4 h-4 shrink-0 animate-pulse" />
              <p className="text-xs sm:text-sm font-bold truncate">
                Alerta de Prazo: {overdueTasks.length} tarefa(s) por concluir ultrapassaram a data/hora limite ({overdueTasks[0].title}).
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button
                type="button"
                size="sm"
                onClick={() => navigate('/admin/tasks')}
                className="bg-white text-red-700 hover:bg-red-50 font-bold text-xs h-7 px-3"
              >
                Abrir Tarefas
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setOverdueBannerDismissed(true)}
                className="text-white/85 hover:text-white hover:bg-white/10 text-xs h-7 px-2"
              >
                Dispensar
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

