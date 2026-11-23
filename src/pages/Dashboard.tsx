/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/src/hooks/useAuth';
import { useNavigate } from 'react-router-dom';
import { collection, onSnapshot, query, where, orderBy, setDoc, updateDoc, doc } from 'firebase/firestore';
import { db } from '@/src/firebase';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/src/components/ui/Card';
import { Button } from '@/src/components/ui/Button';
import {
  FileText,
  Clock,
  CheckCircle2,
  ArrowRight,
  Plus,
  Users,
  DollarSign,
  Ticket,
  PlaneTakeoff,
  Calendar,
  UserCheck,
} from 'lucide-react';
import { cn } from '@/src/lib/utils';
import { PROCESS_STATUSES } from '@/src/constants';
import { TravelProcess, FinancialTransaction, AdvisoryRequest, UserProfile } from '@/src/types';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

export function Dashboard() {
  const { profile, user, isAdmin, isEmployee, hasPermission } = useAuth();
  const navigate = useNavigate();

  const [processes, setProcesses] = useState<TravelProcess[]>([]);
  const [clientsCount, setClientsCount] = useState(0);
  const [bookingsCount, setBookingsCount] = useState(0);
  const [transactions, setTransactions] = useState<FinancialTransaction[]>([]);
  const [advisoryRequests, setAdvisoryRequests] = useState<AdvisoryRequest[]>([]);

  const isStaff = isAdmin || isEmployee;

  useEffect(() => {
    if (!user) return;

    const qProc = isStaff
      ? query(collection(db, 'processes'), orderBy('createdAt', 'desc'))
      : query(collection(db, 'processes'), where('clientUid', '==', user.uid));

    const unsubProc = onSnapshot(qProc, (snap) => {
      const list = snap.docs.map((d) => ({
        ...d.data(),
        id: d.id,
        createdAt: d.data().createdAt?.toDate?.()?.toISOString() || d.data().createdAt || '',
      })) as TravelProcess[];
      setProcesses(list);
    });

    let unsubClients: (() => void) | undefined;
    let unsubTrans: (() => void) | undefined;
    let unsubBookings: (() => void) | undefined;

    let unsubStaffSync: (() => void) | undefined;
    let unsubAdvisory: (() => void) | undefined;

    if (isStaff) {
      unsubClients = onSnapshot(query(collection(db, 'users'), where('role', '==', 'client')), (snap) => {
        setClientsCount(snap.size);
      });
      unsubTrans = onSnapshot(collection(db, 'financial_transactions'), (snap) => {
        setTransactions(snap.docs.map((d) => ({ id: d.id, ...d.data() } as FinancialTransaction)));
      });
      unsubBookings = onSnapshot(collection(db, 'bookings'), (snap) => {
        setBookingsCount(snap.size);
      });
      unsubAdvisory = onSnapshot(collection(db, 'advisory_requests'), (snap) => {
        const list = snap.docs.map((d) => ({
          ...d.data(),
          id: d.id,
          createdAt: d.data().createdAt?.toDate?.()?.toISOString() || d.data().createdAt || '',
        })) as AdvisoryRequest[];
        list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        setAdvisoryRequests(list);
      });
      unsubStaffSync = onSnapshot(query(collection(db, 'users'), where('role', 'in', ['employee', 'admin'])), (snap) => {
        snap.docs.forEach((d) => {
          const data = d.data() as UserProfile;
          setDoc(
            doc(db, 'consultants', d.id),
            {
              uid: d.id,
              displayName: data.displayName || data.username || 'Consultor',
              role: data.role,
              specialty: data.role === 'admin' ? 'Direção & Consultoria' : 'Consultor de Vistos',
              active: data.active !== false,
            },
            { merge: true }
          ).catch(() => {});
        });
      });
    }

    return () => {
      unsubProc();
      unsubClients?.();
      unsubTrans?.();
      unsubBookings?.();
      unsubAdvisory?.();
      unsubStaffSync?.();
    };
  }, [user, isStaff]);

  const handleUpdateAdvisoryStatus = async (reqId: string, status: AdvisoryRequest['status']) => {
    try {
      await updateDoc(doc(db, 'advisory_requests', reqId), { status });
    } catch (err) {
      console.error('Erro ao atualizar solicitação:', err);
    }
  };

  const currentMonth = new Date().toISOString().slice(0, 7);
  const monthlyRevenue = useMemo(() => {
    return transactions
      .filter((t) => t.type === 'income' && (t.date || '').startsWith(currentMonth))
      .reduce((sum, t) => sum + (t.amount || 0), 0);
  }, [transactions, currentMonth]);

  const chartData = useMemo(() => {
    const months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
    const now = new Date();
    const last6 = Array.from({ length: 6 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
      const ym = d.toISOString().slice(0, 7);
      const count = processes.filter((p) => (p.createdAt || '').startsWith(ym)).length;
      return { name: months[d.getMonth()], value: count };
    });
    return last6;
  }, [processes]);

  const formatAOA = (val: number) =>
    new Intl.NumberFormat('pt-AO', { style: 'currency', currency: 'AOA' }).format(val || 0);

  if (isStaff) {
    return (
      <div className="space-y-8 animate-in fade-in duration-500">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 tracking-tight font-display">Dashboard Operacional</h1>
            <p className="text-gray-500 mt-1 text-sm">
              Bem-vindo, {profile?.displayName || profile?.email}. Resumo em tempo real da agência.
            </p>
          </div>
          <div className="flex gap-3">
            {hasPermission('manage_clients') && (
              <Button
                onClick={() => navigate('/admin/clients')}
                variant="outline"
                className="gap-2 border-teal text-teal hover:bg-teal-light"
              >
                <Users className="w-4 h-4" />
                Clientes
              </Button>
            )}
            {hasPermission('manage_processes') && (
              <Button onClick={() => navigate('/admin/processes')} className="bg-teal hover:bg-teal-dark gap-2 shadow-lg shadow-teal/20">
                <Plus className="w-4 h-4" />
                Processos
              </Button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <StatCard title="Total de Processos" value={String(processes.length)} icon={FileText} color="text-teal" bg="bg-teal-light" />
          <StatCard title="Clientes Registados" value={String(clientsCount)} icon={Users} color="text-teal-dark" bg="bg-teal-light/60" />
          <StatCard title="Receita do Mês" value={formatAOA(monthlyRevenue)} icon={DollarSign} color="text-teal-dark" bg="bg-teal-light/80" />
          <StatCard title="Reservas & Transfers" value={String(bookingsCount)} icon={Ticket} color="text-gray-700" bg="bg-gray-100" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <Card className="shadow-sm border border-gray-200 bg-white">
            <CardHeader>
              <CardTitle className="text-lg font-bold">Volume de Processos (6 Meses)</CardTitle>
              <CardDescription>Processos abertos nos últimos 6 meses</CardDescription>
            </CardHeader>
            <CardContent className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f5f5f5" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 11, fontWeight: 600 }} />
                  <YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 11, fontWeight: 600 }} />
                  <Tooltip
                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                    cursor={{ fill: '#f8fafc' }}
                  />
                  <Bar dataKey="value" fill="#0B7B6B" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card className="shadow-sm border border-gray-200 bg-white">
            <CardHeader>
              <CardTitle className="text-lg font-bold">Processos Recentes</CardTitle>
              <CardDescription>Últimas atualizações de atendimento</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {processes.slice(0, 4).map((proc) => (
                  <div
                    key={proc.id}
                    onClick={() => navigate('/admin/processes')}
                    className="flex items-center justify-between cursor-pointer p-2.5 -mx-2 rounded-xl hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-xl bg-teal-light flex items-center justify-center shrink-0">
                        <FileText className="w-5 h-5 text-teal" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-gray-900 truncate">
                          {proc.serviceName || 'Processo'} — {proc.clientName || 'Cliente'}
                        </p>
                        <p className="text-xs text-gray-400 font-medium">
                          {proc.createdAt ? new Date(proc.createdAt).toLocaleDateString('pt-AO') : ''} · {proc.progress || 0}%
                        </p>
                      </div>
                    </div>
                    <span
                      className={cn(
                        'font-bold text-[10px] uppercase px-2.5 py-1 rounded-md shrink-0',
                        proc.status === 'approved'
                          ? 'bg-emerald-100 text-emerald-800'
                          : proc.status === 'rejected'
                          ? 'bg-red-100 text-red-800'
                          : 'bg-amber-100 text-amber-800'
                      )}
                    >
                      {PROCESS_STATUSES.find((s) => s.id === proc.status)?.label || proc.status}
                    </span>
                  </div>
                ))}
                {processes.length === 0 && (
                  <p className="text-sm text-gray-400 text-center py-8">Nenhum processo criado ainda.</p>
                )}
              </div>
              <Button variant="ghost" onClick={() => navigate('/admin/processes')} className="w-full mt-4 text-teal font-bold hover:bg-teal-light">
                Ver todos os processos
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Consultorias & Pedidos de Assessoria Recebidos */}
        <Card className="shadow-sm border border-gray-200 bg-white">
          <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-gray-100">
            <div>
              <CardTitle className="text-lg font-bold flex items-center gap-2">
                <Calendar className="w-5 h-5 text-teal" />
                Consultorias & Solicitações de Assessoria ({advisoryRequests.length})
              </CardTitle>
              <CardDescription>
                Pedidos submetidos pelos clientes no Portal do Cliente com escolha de consultor.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="pt-5">
            {advisoryRequests.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-6">
                Nenhuma solicitação de consultoria ou assessoria recebida até ao momento.
              </p>
            ) : (
              <div className="space-y-3">
                {advisoryRequests.slice(0, 8).map((req) => (
                  <div
                    key={req.id}
                    className="p-4 rounded-xl border border-gray-200 bg-gray-50/50 flex flex-col md:flex-row md:items-center justify-between gap-4"
                  >
                    <div className="space-y-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={cn(
                            'text-[10px] font-bold uppercase px-2 py-0.5 rounded',
                            req.type === 'consultoria' ? 'bg-blue-100 text-blue-800' : 'bg-teal-light text-teal-dark'
                          )}
                        >
                          {req.type === 'consultoria' ? 'Consultoria' : 'Assessoria'}
                        </span>
                        <p className="text-sm font-bold text-gray-900 truncate">
                          {req.clientName} · {req.serviceName || 'Serviço Geral'}
                        </p>
                      </div>
                      <p className="text-xs text-gray-500 flex flex-wrap items-center gap-x-3 gap-y-1">
                        <span className="inline-flex items-center gap-1">
                          <UserCheck className="w-3.5 h-3.5 text-teal" />
                          Consultor: <strong className="text-gray-700">{req.employeeName}</strong>
                        </span>
                        {req.clientPhone && <span>Tel: {req.clientPhone}</span>}
                        {req.preferredDate && (
                          <span className="inline-flex items-center gap-1">
                            <Clock className="w-3.5 h-3.5 text-gray-400" />
                            {req.preferredDate} {req.preferredTime || ''}
                          </span>
                        )}
                      </p>
                      {req.notes && <p className="text-xs text-gray-600 italic">"{req.notes}"</p>}
                    </div>

                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      <span
                        className={cn(
                          'text-[10px] font-bold uppercase px-2.5 py-1 rounded-md',
                          req.status === 'completed'
                            ? 'bg-emerald-100 text-emerald-800'
                            : req.status === 'confirmed'
                            ? 'bg-blue-100 text-blue-800'
                            : req.status === 'cancelled'
                            ? 'bg-red-100 text-red-800'
                            : 'bg-amber-100 text-amber-800'
                        )}
                      >
                        {req.status === 'pending'
                          ? 'Pendente'
                          : req.status === 'confirmed'
                          ? 'Confirmado'
                          : req.status === 'completed'
                          ? 'Concluído'
                          : 'Cancelado'}
                      </span>
                      {req.status === 'pending' && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleUpdateAdvisoryStatus(req.id, 'confirmed')}
                          className="h-8 text-xs font-bold border-teal/30 text-teal hover:bg-teal-light"
                        >
                          Confirmar
                        </Button>
                      )}
                      {(req.status === 'pending' || req.status === 'confirmed') && (
                        <Button
                          size="sm"
                          onClick={() => handleUpdateAdvisoryStatus(req.id, 'completed')}
                          className="h-8 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white"
                        >
                          Concluir
                        </Button>
                      )}
                      {req.processId && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => navigate('/admin/processes')}
                          className="h-8 text-xs font-bold"
                        >
                          Ver Processo
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  const primaryProcess = processes[0];

  return (
    <div className="space-y-8 animate-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 tracking-tight font-display">
            Olá, {profile?.displayName || profile?.email}!
          </h1>
          <p className="text-gray-500 mt-1 text-sm">Acompanhe o progresso dos seus processos e serviços.</p>
        </div>
        <div className="flex gap-3">
          <Button onClick={() => navigate('/bookings')} variant="outline" className="gap-2 border-gray-200">
            <Ticket className="w-4 h-4" />
            Reservas e Bilhetes
          </Button>
          <Button onClick={() => navigate('/services')} className="bg-teal hover:bg-teal-dark gap-2">
            <Plus className="w-4 h-4" />
            Explorar Serviços
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          {primaryProcess ? (
            <Card className="overflow-hidden border-none shadow-lg bg-gradient-to-br from-teal to-teal-dark text-white">
              <CardContent className="p-8">
                <div className="flex justify-between items-start gap-4">
                  <div className="space-y-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-teal-light">Processo em Curso</span>
                    <h2 className="text-2xl font-extrabold font-display">{primaryProcess.serviceName}</h2>
                    <p className="text-sm text-white/80">
                      Estado atual: {PROCESS_STATUSES.find((s) => s.id === primaryProcess.status)?.label}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-4xl font-extrabold tabular-nums">{primaryProcess.progress || 0}%</p>
                    <p className="text-[10px] text-teal-light font-bold uppercase tracking-widest mt-1">Progresso</p>
                  </div>
                </div>
                <div className="mt-8 space-y-2">
                  <div className="h-2.5 w-full bg-black/20 rounded-full overflow-hidden">
                    <div className="h-full bg-white rounded-full transition-all duration-700" style={{ width: `${primaryProcess.progress || 0}%` }} />
                  </div>
                  <Button
                    onClick={() => navigate('/processes')}
                    variant="secondary"
                    size="sm"
                    className="mt-4 bg-white text-teal hover:bg-teal-light font-bold"
                  >
                    Ver Documentos e Detalhes
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card className="border border-gray-200 bg-white p-8 text-center space-y-4">
              <PlaneTakeoff className="w-10 h-10 text-teal mx-auto" />
              <h3 className="text-lg font-bold text-gray-900">Sem processos ativos</h3>
              <p className="text-sm text-gray-500">Consulte o nosso catálogo de serviços para iniciar o seu pedido.</p>
              <Button onClick={() => navigate('/services')} className="bg-teal hover:bg-teal-dark text-white">
                Ver Serviços Disponíveis
              </Button>
            </Card>
          )}
        </div>

        <Card className="shadow-sm border border-gray-200 bg-white">
          <CardHeader>
            <CardTitle className="text-lg font-bold">Meus Processos ({processes.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {processes.map((p) => (
              <button
                key={p.id}
                onClick={() => navigate('/processes')}
                className="w-full flex items-center justify-between p-3 rounded-xl border border-gray-100 hover:border-teal/40 text-left transition-colors"
              >
                <div className="min-w-0">
                  <p className="text-sm font-bold text-gray-900 truncate">{p.serviceName}</p>
                  <p className="text-xs text-gray-500">
                    {PROCESS_STATUSES.find((s) => s.id === p.status)?.label} · {p.progress}%
                  </p>
                </div>
                <ArrowRight className="w-4 h-4 text-gray-400 shrink-0" />
              </button>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function StatCard({ title, value, icon: Icon, color, bg }: any) {
  return (
    <Card className="shadow-sm border border-gray-200 bg-white">
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <div className={cn('p-3 rounded-xl', bg)}>
            <Icon className={cn('w-5 h-5', color)} />
          </div>
        </div>
        <div className="mt-4">
          <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">{title}</p>
          <h3 className="text-2xl font-black text-gray-900 mt-1 tabular-nums">{value}</h3>
        </div>
      </CardContent>
    </Card>
  );
}
