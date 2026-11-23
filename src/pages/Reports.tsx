/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '@/src/firebase';
import { useCompanySettings } from '@/src/hooks/useCompanySettings';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/src/components/ui/Card';
import { Button } from '@/src/components/ui/Button';
import { Input } from '@/src/components/ui/Input';
import {
  BarChart3,
  Users,
  Wallet,
  CheckCircle2,
  Clock,
  Download,
  Printer,
  FileSpreadsheet,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import { TravelProcess, Invoice, UserProfile, FinancialTransaction } from '@/src/types';
import { PROCESS_STATUSES } from '@/src/constants';
import { generateReportPDF } from '@/src/utils/pdfGenerator';

export function Reports() {
  const { company } = useCompanySettings();
  const [processes, setProcesses] = useState<TravelProcess[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [transactions, setTransactions] = useState<FinancialTransaction[]>([]);
  const [clients, setClients] = useState<UserProfile[]>([]);

  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d.toISOString().slice(0, 10);
  });
  const [endDate, setEndDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [showAllDates, setShowAllDates] = useState(true);

  useEffect(() => {
    const unsubProc = onSnapshot(collection(db, 'processes'), (snap) => {
      setProcesses(
        snap.docs.map((d) => ({
          id: d.id,
          ...d.data(),
          createdAt: d.data().createdAt?.toDate?.()?.toISOString() || d.data().createdAt || '',
        })) as TravelProcess[]
      );
    });
    const unsubInv = onSnapshot(collection(db, 'invoices'), (snap) => {
      setInvoices(snap.docs.map((d) => ({ id: d.id, ...d.data() })) as Invoice[]);
    });
    const unsubTrans = onSnapshot(collection(db, 'financial_transactions'), (snap) => {
      setTransactions(snap.docs.map((d) => ({ id: d.id, ...d.data() })) as FinancialTransaction[]);
    });
    const unsubClients = onSnapshot(query(collection(db, 'users'), where('role', '==', 'client')), (snap) => {
      setClients(snap.docs.map((d) => ({ uid: d.id, ...d.data() })) as UserProfile[]);
    });

    return () => {
      unsubProc();
      unsubInv();
      unsubTrans();
      unsubClients();
    };
  }, []);

  const filteredProcesses = useMemo(() => {
    if (showAllDates) return processes;
    return processes.filter((p) => {
      const dateStr = (p.createdAt || '').slice(0, 10);
      return (!startDate || dateStr >= startDate) && (!endDate || dateStr <= endDate);
    });
  }, [processes, showAllDates, startDate, endDate]);

  const filteredInvoices = useMemo(() => {
    if (showAllDates) return invoices;
    return invoices.filter((i) => {
      const dateStr = (i.createdAt || '').slice(0, 10);
      return (!startDate || dateStr >= startDate) && (!endDate || dateStr <= endDate);
    });
  }, [invoices, showAllDates, startDate, endDate]);

  const filteredTransactions = useMemo(() => {
    if (showAllDates) return transactions;
    return transactions.filter((t) => {
      const dateStr = (t.date || '').slice(0, 10);
      return (!startDate || dateStr >= startDate) && (!endDate || dateStr <= endDate);
    });
  }, [transactions, showAllDates, startDate, endDate]);

  const totalInvoicePaid = filteredInvoices
    .filter((i) => i.status === 'paid')
    .reduce((sum, i) => sum + (i.amount || 0), 0);
  const totalCashIncome = filteredTransactions
    .filter((t) => t.type === 'income')
    .reduce((sum, t) => sum + (t.amount || 0), 0);
  const totalRevenue = Math.max(totalInvoicePaid, totalCashIncome);

  const totalExpenses = filteredTransactions
    .filter((t) => t.type === 'expense')
    .reduce((sum, t) => sum + (t.amount || 0), 0);
  const netBalance = totalRevenue - totalExpenses;

  const pendingInvoices = filteredInvoices.filter((i) => i.status === 'pending');
  const pendingRevenue = pendingInvoices.reduce((sum, i) => sum + (i.amount || 0), 0);

  const approvedCount = filteredProcesses.filter((p) => p.status === 'approved').length;
  const decidedCount = filteredProcesses.filter((p) => p.status === 'approved' || p.status === 'rejected').length;
  const approvalRate = decidedCount > 0 ? Math.round((approvedCount / decidedCount) * 100) : filteredProcesses.length > 0 ? Math.round((approvedCount / filteredProcesses.length) * 100) : 0;

  const statusData = [
    { name: 'Aprovados', value: approvedCount, color: '#10b981' },
    { name: 'Pendentes', value: filteredProcesses.filter((p) => p.status === 'pending').length, color: '#f59e0b' },
    { name: 'Em Revisão', value: filteredProcesses.filter((p) => p.status === 'in-review').length, color: '#0B7B6B' },
    { name: 'Rejeitados', value: filteredProcesses.filter((p) => p.status === 'rejected').length, color: '#ef4444' },
  ];

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('pt-AO', { style: 'currency', currency: 'AOA' }).format(val || 0);
  };

  const periodLabel = showAllDates ? 'Histórico Completo' : `${startDate} a ${endDate}`;

  const handleExportPDF = () => {
    generateReportPDF(
      {
        periodLabel,
        totalRevenue,
        totalExpenses,
        netBalance,
        pendingRevenue,
        totalClients: clients.length,
        processes: filteredProcesses,
        transactions: filteredTransactions,
      },
      company
    );
  };

  const handleExportCSV = () => {
    const headers = ['ID Processo', 'Cliente', 'Serviço', 'Estado', 'Progresso (%)', 'Pagamento', 'Valor (AOA)', 'Data'];
    const rows = filteredProcesses.map((p) => [
      p.id,
      `"${(p.clientName || '').replace(/"/g, '""')}"`,
      `"${(p.serviceName || '').replace(/"/g, '""')}"`,
      PROCESS_STATUSES.find((s) => s.id === p.status)?.label || p.status,
      String(p.progress || 0),
      p.paymentStatus === 'paid' ? 'Pago' : 'Pendente',
      String(p.price || 0),
      (p.createdAt || '').slice(0, 10),
    ]);

    const csv = '\uFEFF' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Relatorio_Processos_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 3000);
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-12">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 print:hidden">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-teal rounded-xl flex items-center justify-center text-white shadow-lg shadow-teal/20">
            <BarChart3 className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-gray-900 tracking-tight font-display">Relatórios & Analytics</h1>
            <p className="text-gray-500 text-sm">
              Análise de desempenho, receitas reais e exportação em PDF, CSV ou Impressão.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant={showAllDates ? 'default' : 'outline'}
            size="sm"
            onClick={() => setShowAllDates(!showAllDates)}
            className={showAllDates ? 'bg-teal text-white' : 'border-gray-200 text-gray-600'}
          >
            {showAllDates ? 'Todos os Registos' : 'Filtrar Datas'}
          </Button>
          {!showAllDates && (
            <>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-36 h-9 bg-white border-gray-200 text-xs"
              />
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-36 h-9 bg-white border-gray-200 text-xs"
              />
            </>
          )}
          <Button
            type="button"
            variant="outline"
            onClick={handlePrint}
            className="gap-1.5 border-gray-200 h-9 text-xs font-bold"
          >
            <Printer className="w-4 h-4 text-teal" />
            Imprimir
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={handleExportCSV}
            className="gap-1.5 border-gray-200 h-9 text-xs font-bold"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
            Excel / CSV
          </Button>
          <Button
            type="button"
            onClick={handleExportPDF}
            className="gap-1.5 bg-teal hover:bg-teal-dark text-white h-9 text-xs font-bold"
          >
            <Download className="w-4 h-4" />
            Guardar PDF
          </Button>
        </div>
      </div>

      {/* Print-only agency header */}
      <div className="hidden print:block border-b border-gray-200 pb-4 mb-6">
        <h2 className="text-xl font-bold text-gray-900">{company.name} — Relatório Executivo</h2>
        <p className="text-xs text-gray-500">
          NIF: {company.nif} · {company.address} · Período: {periodLabel}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          icon={<Wallet className="text-teal" />}
          label="Receita Confirmada"
          val={formatCurrency(totalRevenue)}
          sub={`Saldo Líquido: ${formatCurrency(netBalance)}`}
        />
        <StatCard
          icon={<Clock className="text-amber-600" />}
          label="Faturas Em Aberto"
          val={formatCurrency(pendingRevenue)}
          sub={`${pendingInvoices.length} pendente(s)`}
        />
        <StatCard
          icon={<Users className="text-blue-600" />}
          label="Clientes Registados"
          val={String(clients.length)}
          sub={`${filteredProcesses.length} processos no período`}
        />
        <StatCard
          icon={<CheckCircle2 className="text-emerald-600" />}
          label="Vistos Aprovados"
          val={String(approvedCount)}
          sub={`${approvalRate}% taxa de aprovação`}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <Card className="lg:col-span-2 shadow-sm border border-gray-200 rounded-2xl bg-white">
          <CardHeader className="p-6 border-b border-gray-100">
            <CardTitle className="text-lg font-bold">Performance de Processos</CardTitle>
            <CardDescription>Distribuição de processos por estado ({periodLabel}).</CardDescription>
          </CardHeader>
          <CardContent className="p-6 h-[340px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={statusData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 11, fontWeight: 700, fill: '#6b7280' }} />
                <YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={{ fontSize: 11, fontWeight: 700, fill: '#6b7280' }} />
                <Tooltip
                  cursor={{ fill: '#f8fafc' }}
                  contentStyle={{ borderRadius: '0.75rem', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                />
                <Bar dataKey="value" radius={[8, 8, 0, 0]}>
                  {statusData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="shadow-sm border border-gray-200 rounded-2xl bg-white">
          <CardHeader className="p-6 border-b border-gray-100">
            <CardTitle className="text-lg font-bold">Taxa de Aprovação</CardTitle>
            <CardDescription>Eficiência operacional calculada em tempo real.</CardDescription>
          </CardHeader>
          <CardContent className="p-6 flex flex-col items-center justify-center h-[340px]">
            <div className="relative w-44 h-44 mb-6">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={statusData} innerRadius={56} outerRadius={76} paddingAngle={4} dataKey="value">
                    {statusData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <p className="text-[10px] font-bold text-gray-400 uppercase">Aprovação</p>
                <p className="text-3xl font-black text-gray-900 tabular-nums">{approvalRate}%</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 w-full">
              {statusData.map((s, i) => (
                <div key={i} className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                  <span className="text-xs font-semibold text-gray-600 truncate">
                    {s.name} ({s.value})
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Detailed Processes Table */}
      <Card className="shadow-sm border border-gray-200 rounded-2xl bg-white overflow-hidden">
        <CardHeader className="p-6 border-b border-gray-100">
          <CardTitle className="text-lg font-bold">Detalhamento de Processos ({filteredProcesses.length})</CardTitle>
          <CardDescription>Listagem incluída nas exportações PDF e CSV.</CardDescription>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-gray-50 text-xs font-bold text-gray-500 uppercase border-b border-gray-100">
                <th className="px-6 py-4">Cliente</th>
                <th className="px-6 py-4">Serviço</th>
                <th className="px-6 py-4">Estado</th>
                <th className="px-6 py-4">Progresso</th>
                <th className="px-6 py-4 text-right">Valor</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredProcesses.length > 0 ? (
                filteredProcesses.map((p) => (
                  <tr key={p.id} className="hover:bg-gray-50/60">
                    <td className="px-6 py-4 text-sm font-bold text-gray-900">{p.clientName || 'Cliente'}</td>
                    <td className="px-6 py-4 text-sm text-gray-700">{p.serviceName || 'Serviço'}</td>
                    <td className="px-6 py-4 text-xs font-bold text-gray-700">
                      {PROCESS_STATUSES.find((s) => s.id === p.status)?.label || p.status}
                    </td>
                    <td className="px-6 py-4 text-xs font-bold text-teal tabular-nums">{p.progress || 0}%</td>
                    <td className="px-6 py-4 text-sm font-bold text-gray-900 text-right tabular-nums">
                      {formatCurrency(p.price || 0)}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="px-6 py-10 text-center text-sm text-gray-400">
                    Nenhum processo encontrado para o período seleccionado.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({ icon, label, val, sub }: { icon: React.ReactNode; label: string; val: string; sub: string }) {
  return (
    <Card className="shadow-sm border border-gray-200 rounded-2xl bg-white">
      <CardContent className="p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="w-10 h-10 bg-gray-50 rounded-xl flex items-center justify-center">
            {React.cloneElement(icon as React.ReactElement<any>, { className: 'w-5 h-5' })}
          </div>
        </div>
        <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">{label}</p>
        <h3 className="text-2xl font-black text-gray-900 tracking-tight font-display tabular-nums">{val}</h3>
        <p className="text-xs text-gray-400 mt-1">{sub}</p>
      </CardContent>
    </Card>
  );
}
