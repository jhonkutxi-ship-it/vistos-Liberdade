/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, query, orderBy, onSnapshot, addDoc, setDoc, doc, deleteDoc, writeBatch } from 'firebase/firestore';
import JSZip from 'jszip';
import { db, OperationType, handleFirestoreError } from '@/src/firebase';
import { useCompanySettings } from '@/src/hooks/useCompanySettings';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/src/components/ui/Card';
import { Button } from '@/src/components/ui/Button';
import { Input } from '@/src/components/ui/Input';
import {
  Wallet,
  TrendingUp,
  Plus,
  Search,
  Download,
  Users2,
  Clock,
  FileText,
  MessageCircle,
  Eye,
  Trash2,
  Loader2,
  ReceiptText,
  Archive,
  AlertTriangle,
} from 'lucide-react';
import { cn } from '@/src/lib/utils';
import { EXPENSE_CATEGORIES, PAYMENT_METHODS } from '@/src/constants';
import { FinancialTransaction, EmployeeAdvance, Invoice } from '@/src/types';
import { ReceiptModal } from '@/src/components/ReceiptModal';
import { generateInvoicePDF } from '@/src/utils/pdfGenerator';
import {
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
} from 'recharts';

export function Finances() {
  const navigate = useNavigate();
  const { company } = useCompanySettings();
  const [transactions, setTransactions] = useState<FinancialTransaction[]>([]);
  const [advances, setAdvances] = useState<EmployeeAdvance[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7));
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalType, setModalType] = useState<'transaction' | 'advance'>('transaction');

  const [activeReceipt, setActiveReceipt] = useState<Invoice | null>(null);
  const [invoiceToDelete, setInvoiceToDelete] = useState<Invoice | null>(null);
  const [deletingInvoice, setDeletingInvoice] = useState(false);
  const [clearModalOpen, setClearModalOpen] = useState(false);
  const [clearScope, setClearScope] = useState<'month' | 'all'>('month');
  const [clearingRecords, setClearingRecords] = useState(false);
  const [exportingZip, setExportingZip] = useState(false);
  const [isInvoiceModalOpen, setIsInvoiceModalOpen] = useState(false);
  const [newInvoice, setNewInvoice] = useState({
    clientName: '',
    clientPhone: '',
    clientDocument: '',
    amount: '',
    type: 'recibo' as 'recibo' | 'fatura' | 'fatura_proforma',
    description: '',
  });

  const [newTrans, setNewTrans] = useState({
    type: 'expense' as 'income' | 'expense',
    expenseScope: 'daily' as 'daily' | 'operational' | 'payroll' | 'other',
    category: EXPENSE_CATEGORIES[0] as string,
    amount: '',
    description: '',
    date: new Date().toISOString().slice(0, 10),
    paymentMethod: PAYMENT_METHODS[0] as string,
  });

  const [newAdvance, setNewAdvance] = useState({
    employeeName: '',
    amount: '',
    reason: '',
    type: 'advance' as 'loan' | 'advance',
    date: new Date().toISOString().slice(0, 10),
  });

  const chartData = useMemo(() => {
    const days = Array.from({ length: 30 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (29 - i));
      return d.toISOString().slice(0, 10);
    });

    return days.map((day) => {
      const dayTrans = transactions.filter((t) => t.date === day);
      const income = dayTrans.filter((t) => t.type === 'income').reduce((sum, t) => sum + t.amount, 0);
      const expense = dayTrans.filter((t) => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0);
      return {
        date: day.slice(8, 10) + '/' + day.slice(5, 7),
        Entradas: income,
        Saídas: expense,
      };
    });
  }, [transactions]);

  useEffect(() => {
    const qTrans = query(collection(db, 'financial_transactions'), orderBy('date', 'desc'));
    const qAdvances = query(collection(db, 'employee_advances'), orderBy('date', 'desc'));
    const qInvoices = query(collection(db, 'invoices'), orderBy('createdAt', 'desc'));

    const unsubTrans = onSnapshot(
      qTrans,
      (snapshot) => {
        setTransactions(snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as FinancialTransaction)));
        setLoading(false);
      },
      (error) => handleFirestoreError(error, OperationType.GET, 'financial_transactions')
    );

    const unsubAdvances = onSnapshot(
      qAdvances,
      (snapshot) => {
        setAdvances(snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as EmployeeAdvance)));
      },
      (error) => handleFirestoreError(error, OperationType.GET, 'employee_advances')
    );

    const unsubInvoices = onSnapshot(
      qInvoices,
      (snapshot) => {
        setInvoices(snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as Invoice)));
      },
      (error) => handleFirestoreError(error, OperationType.GET, 'invoices')
    );

    return () => {
      unsubTrans();
      unsubAdvances();
      unsubInvoices();
    };
  }, []);

  const filteredTransactions = useMemo(() => {
    return transactions.filter((t) => {
      const matchesSearch =
        t.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
        t.category.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesMonth = !selectedMonth || t.date.startsWith(selectedMonth);
      return matchesSearch && matchesMonth;
    });
  }, [transactions, searchTerm, selectedMonth]);

  const stats = useMemo(() => {
    const monthTrans = selectedMonth ? transactions.filter((t) => t.date.startsWith(selectedMonth)) : transactions;
    const income = monthTrans.filter((t) => t.type === 'income').reduce((sum, t) => sum + t.amount, 0);
    const expenses = monthTrans.filter((t) => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0);
    const activeLoans = advances
      .filter((a) => a.status === 'approved' && a.repaymentStatus !== 'fully_repaid')
      .reduce((sum, a) => sum + a.amount, 0);
    const pendingInvoices = invoices.filter((inv) => inv.status === 'pending').reduce((sum, inv) => sum + inv.amount, 0);

    return { income, expenses, balance: income - expenses, activeLoans, pendingInvoices };
  }, [transactions, advances, invoices, selectedMonth]);

  const expensesList = useMemo(() => {
    const monthExpenses = transactions.filter(
      (t) => t.type === 'expense' && (!selectedMonth || t.date.startsWith(selectedMonth))
    );
    const todayStr = new Date().toISOString().slice(0, 10);
    const todayTotal = transactions
      .filter((t) => t.type === 'expense' && t.date === todayStr)
      .reduce((sum, t) => sum + t.amount, 0);
    const monthTotal = monthExpenses.reduce((sum, t) => sum + t.amount, 0);
    return { items: monthExpenses, todayTotal, monthTotal };
  }, [transactions, selectedMonth]);

  const handleAddTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (modalType === 'transaction') {
        await addDoc(collection(db, 'financial_transactions'), {
          type: newTrans.type,
          ...(newTrans.type === 'expense' ? { expenseScope: newTrans.expenseScope } : {}),
          category: newTrans.category || (newTrans.type === 'expense' ? 'Outras Despesas' : 'Serviços'),
          amount: parseFloat(newTrans.amount),
          description: newTrans.description,
          date: newTrans.date,
          paymentMethod: newTrans.paymentMethod,
          status: 'completed',
          createdAt: new Date().toISOString(),
        });
        setNewTrans({
          type: 'expense',
          expenseScope: 'daily',
          category: EXPENSE_CATEGORIES[0],
          amount: '',
          description: '',
          date: new Date().toISOString().slice(0, 10),
          paymentMethod: PAYMENT_METHODS[0],
        });
      } else {
        await addDoc(collection(db, 'employee_advances'), {
          employeeUid: 'staff',
          employeeName: newAdvance.employeeName,
          amount: parseFloat(newAdvance.amount),
          reason: newAdvance.reason,
          type: newAdvance.type,
          date: newAdvance.date,
          status: 'approved',
          repaymentStatus: 'pending',
          createdAt: new Date().toISOString(),
        });
        setNewAdvance({
          employeeName: '',
          amount: '',
          reason: '',
          type: 'advance',
          date: new Date().toISOString().slice(0, 10),
        });
      }
      setIsModalOpen(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, modalType === 'transaction' ? 'financial_transactions' : 'employee_advances');
    }
  };

  const handleIssueInvoice = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const amountValue = parseFloat(newInvoice.amount);
      const docRef = doc(collection(db, 'invoices'));
      const invoiceData: Invoice = {
        id: docRef.id,
        clientName: newInvoice.clientName,
        clientPhone: newInvoice.clientPhone,
        clientDocument: newInvoice.clientDocument,
        amount: amountValue,
        type: newInvoice.type,
        status: newInvoice.type === 'recibo' ? 'paid' : 'pending',
        createdAt: new Date().toISOString(),
        dueDate: new Date().toISOString(),
        items: [
          {
            description: newInvoice.description || 'Prestação de Serviços',
            quantity: 1,
            price: amountValue,
          },
        ],
        processId: 'manual',
        clientUid: 'manual',
      };

      await setDoc(docRef, invoiceData);

      if (invoiceData.status === 'paid') {
        await addDoc(collection(db, 'financial_transactions'), {
          type: 'income',
          category: 'Vendas/Serviços',
          amount: amountValue,
          description: `${newInvoice.type.toUpperCase()}: ${newInvoice.clientName}`,
          date: new Date().toISOString().slice(0, 10),
          paymentMethod: 'Cash/Transfer',
          status: 'completed',
          createdAt: new Date().toISOString(),
        });
      }

      setIsInvoiceModalOpen(false);
      setNewInvoice({
        clientName: '',
        clientPhone: '',
        clientDocument: '',
        amount: '',
        type: 'recibo',
        description: '',
      });
      setActiveReceipt(invoiceData);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'invoices');
    }
  };

  const handleDeleteInvoice = async () => {
    if (!invoiceToDelete) return;
    setDeletingInvoice(true);
    try {
      await deleteDoc(doc(db, 'invoices', invoiceToDelete.id));
      if (activeReceipt?.id === invoiceToDelete.id) {
        setActiveReceipt(null);
      }
      setInvoiceToDelete(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `invoices/${invoiceToDelete.id}`);
    } finally {
      setDeletingInvoice(false);
    }
  };

  const handleDeleteTransaction = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'financial_transactions', id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `financial_transactions/${id}`);
    }
  };

  const handleClearTransactions = async () => {
    const targets =
      clearScope === 'month' && selectedMonth
        ? transactions.filter((t) => t.date.startsWith(selectedMonth))
        : transactions;
    if (targets.length === 0) {
      setClearModalOpen(false);
      return;
    }
    setClearingRecords(true);
    try {
      for (let i = 0; i < targets.length; i += 400) {
        const chunk = targets.slice(i, i + 400);
        const batch = writeBatch(db);
        chunk.forEach((t) => batch.delete(doc(db, 'financial_transactions', t.id)));
        await batch.commit();
      }
      setClearModalOpen(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, 'financial_transactions');
    } finally {
      setClearingRecords(false);
    }
  };

  const buildTransactionsCSV = (items: FinancialTransaction[]) => {
    const headers = ['Data', 'Tipo', 'Âmbito', 'Categoria', 'Descrição', 'Método', 'Valor (AOA)'];
    const rows = items.map((t) => [
      t.date,
      t.type === 'income' ? 'Entrada' : 'Saída',
      t.expenseScope || '',
      `"${(t.category || '').replace(/"/g, '""')}"`,
      `"${(t.description || '').replace(/"/g, '""')}"`,
      `"${(t.paymentMethod || '').replace(/"/g, '""')}"`,
      t.type === 'income' ? String(t.amount) : String(-t.amount),
    ]);
    return '\uFEFF' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
  };

  const handleExportCSV = () => {
    const csvContent = buildTransactionsCSV(filteredTransactions);
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Caixa_${selectedMonth || 'Geral'}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 3000);
  };

  const handleExportMonthlyZIP = async () => {
    setExportingZip(true);
    try {
      const monthKey = selectedMonth || 'Geral';
      const monthTrans = selectedMonth
        ? transactions.filter((t) => t.date.startsWith(selectedMonth))
        : transactions;
      const monthExpenses = monthTrans.filter((t) => t.type === 'expense');
      const monthInvoices = selectedMonth
        ? invoices.filter((inv) => (inv.createdAt || '').startsWith(selectedMonth))
        : invoices;
      const monthAdvances = selectedMonth
        ? advances.filter((a) => (a.date || '').startsWith(selectedMonth))
        : advances;

      const zip = new JSZip();

      const summaryLines = [
        `RELATÓRIO FINANCEIRO MENSAL - ${company.name}`,
        `NIF: ${company.nif}`,
        `Período: ${monthKey}`,
        `Gerado em: ${new Date().toLocaleString('pt-AO')}`,
        `==================================================`,
        `Total de Entradas: ${formatCurrency(stats.income)}`,
        `Total de Saídas / Despesas: ${formatCurrency(stats.expenses)}`,
        `Saldo Líquido: ${formatCurrency(stats.balance)}`,
        `Total de Transações no Período: ${monthTrans.length}`,
        `Despesas Registadas: ${monthExpenses.length}`,
        `Recibos/Faturas Emitidas: ${monthInvoices.length}`,
        `Adiantamentos/Empréstimos: ${monthAdvances.length}`,
      ].join('\n');

      zip.file(`01_Resumo_Mensal_${monthKey}.txt`, summaryLines);
      zip.file(`02_Transacoes_${monthKey}.csv`, buildTransactionsCSV(monthTrans));
      zip.file(`03_Despesas_${monthKey}.csv`, buildTransactionsCSV(monthExpenses));

      const invHeaders = ['ID', 'Data', 'Cliente', 'Tipo', 'Estado', 'Valor (AOA)'];
      const invRows = monthInvoices.map((inv) => [
        inv.id,
        inv.createdAt?.slice(0, 10) || '',
        `"${(inv.clientName || '').replace(/"/g, '""')}"`,
        inv.type || 'recibo',
        inv.status,
        String(inv.amount || 0),
      ]);
      zip.file(
        `04_Faturas_Recibos_${monthKey}.csv`,
        '\uFEFF' + [invHeaders.join(','), ...invRows.map((r) => r.join(','))].join('\n')
      );

      const advHeaders = ['Data', 'Funcionário', 'Tipo', 'Motivo', 'Estado', 'Valor (AOA)'];
      const advRows = monthAdvances.map((a) => [
        a.date,
        `"${(a.employeeName || '').replace(/"/g, '""')}"`,
        a.type,
        `"${(a.reason || '').replace(/"/g, '""')}"`,
        a.status,
        String(a.amount || 0),
      ]);
      zip.file(
        `05_Adiantamentos_${monthKey}.csv`,
        '\uFEFF' + [advHeaders.join(','), ...advRows.map((r) => r.join(','))].join('\n')
      );

      const blob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `Registos_Financeiros_${monthKey}.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    } finally {
      setExportingZip(false);
    }
  };

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('pt-AO', {
      style: 'currency',
      currency: 'AOA',
    }).format(val);
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-teal rounded-xl flex items-center justify-center text-white shadow-lg shadow-teal/20">
            <TrendingUp className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-gray-900 tracking-tight font-display">Finanças & Faturação</h1>
            <p className="text-gray-500 text-sm">Controlo do fluxo de caixa, emissão de recibos e envio via WhatsApp.</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Input
            type="month"
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="w-44 bg-white border-gray-200 h-10 font-bold text-gray-700 rounded-xl"
          />
          <Button
            onClick={() => setIsInvoiceModalOpen(true)}
            className="bg-blue-600 hover:bg-blue-700 text-white gap-2 h-10 px-4 font-bold rounded-xl text-xs"
          >
            <FileText className="w-4 h-4" />
            Emitir Recibo / Fatura
          </Button>
          <Button
            onClick={() => {
              setModalType('transaction');
              setIsModalOpen(true);
            }}
            className="bg-teal hover:bg-teal-dark text-white gap-2 h-10 px-4 font-bold rounded-xl text-xs"
          >
            <Plus className="w-4 h-4" />
            Novo Registro
          </Button>
          <Button
            variant="outline"
            onClick={handleExportCSV}
            className="gap-2 border-gray-200 h-10 px-4 rounded-xl font-bold text-gray-600 hover:bg-gray-50 text-xs"
          >
            <Download className="w-4 h-4" />
            Exportar CSV
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatsCard
          title="Receita Mensal"
          val={formatCurrency(stats.income)}
          sub="Entradas confirmadas"
          icon={<TrendingUp className="w-5 h-5" />}
          color="teal"
        />
        <StatsCard
          title="Facturas Pendentes"
          val={formatCurrency(stats.pendingInvoices)}
          sub="A receber de clientes"
          icon={<Clock className="w-5 h-5" />}
          color="yellow"
        />
        <StatsCard
          title="Saldo Líquido"
          val={formatCurrency(stats.balance)}
          sub="Resultado do período"
          icon={<Wallet className="w-5 h-5" />}
          color={stats.balance >= 0 ? 'blue' : 'red'}
        />
        <StatsCard
          title="Empréstimos Ativos"
          val={formatCurrency(stats.activeLoans)}
          sub="Adiantamentos à equipa"
          icon={<Users2 className="w-5 h-5" />}
          color="red"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-8">
          <Card className="shadow-sm border border-gray-200 overflow-hidden bg-white">
            <CardHeader className="border-b border-gray-100 pb-4">
              <CardTitle className="text-lg">Fluxo de Caixa (Últimos 30 dias)</CardTitle>
              <CardDescription>Visualização analítica de entradas e saídas.</CardDescription>
            </CardHeader>
            <CardContent className="h-[280px] p-6">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="colorIncome" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#0B7B6B" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#0B7B6B" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                  <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 700 }} />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 700 }}
                    tickFormatter={(val) => `${val / 1000}k`}
                  />
                  <Tooltip
                    contentStyle={{
                      borderRadius: '12px',
                      border: 'none',
                      boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)',
                      fontWeight: 'bold',
                    }}
                  />
                  <Area type="monotone" dataKey="Entradas" stroke="#0B7B6B" fillOpacity={1} fill="url(#colorIncome)" strokeWidth={3} />
                  <Area type="monotone" dataKey="Saídas" stroke="#ef4444" fill="transparent" strokeWidth={2} strokeDasharray="5 5" />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card className="shadow-sm border border-gray-200 bg-white">
            <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-100 pb-4">
              <div>
                <CardTitle className="text-lg">Recibos & Faturas Emitidas</CardTitle>
                <CardDescription>Imprima, guarde em PDF ou envie diretamente para o WhatsApp do cliente.</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="bg-gray-50 text-xs font-bold text-gray-500 uppercase border-b border-gray-100">
                      <th className="px-6 py-4">Cliente</th>
                      <th className="px-6 py-4">Valor</th>
                      <th className="px-6 py-4">Estado</th>
                      <th className="px-6 py-4 text-right">Acções</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {invoices.length > 0 ? (
                      invoices.map((inv) => (
                        <tr key={inv.id} className="hover:bg-gray-50/60 transition-colors">
                          <td className="px-6 py-4">
                            <p className="text-sm font-bold text-gray-900">{inv.clientName}</p>
                            <p className="text-xs text-gray-500">
                              {(inv.type || 'recibo').replace('_', ' ').toUpperCase()} ·{' '}
                              {new Date(inv.createdAt).toLocaleDateString('pt-AO')}
                            </p>
                          </td>
                          <td className="px-6 py-4 text-sm font-bold text-gray-900 tabular-nums">
                            {formatCurrency(inv.amount)}
                          </td>
                          <td className="px-6 py-4">
                            <span
                              className={cn(
                                'text-[10px] font-black uppercase px-2.5 py-1 rounded-md',
                                inv.status === 'paid' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                              )}
                            >
                              {inv.status === 'paid' ? 'Pago' : 'Pendente'}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-right space-x-1 whitespace-nowrap">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              title="Visualizar / Imprimir / WhatsApp"
                              onClick={() => setActiveReceipt(inv)}
                              className="h-9 w-9 text-gray-500 hover:text-teal hover:bg-teal-light"
                            >
                              <Eye className="w-4 h-4" />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              title="Guardar PDF"
                              onClick={() => generateInvoicePDF(inv, company)}
                              className="h-9 w-9 text-gray-500 hover:text-teal hover:bg-teal-light"
                            >
                              <Download className="w-4 h-4" />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              title="Enviar via WhatsApp"
                              onClick={() => setActiveReceipt(inv)}
                              className="h-9 w-9 text-emerald-600 hover:bg-emerald-50"
                            >
                              <MessageCircle className="w-4 h-4" />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              title="Eliminar Documento"
                              onClick={() => setInvoiceToDelete(inv)}
                              className="h-9 w-9 text-gray-400 hover:text-red-600 hover:bg-red-50"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={4} className="px-6 py-10 text-center text-sm text-gray-400">
                          Nenhum recibo emitido ainda.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-sm border border-gray-200 bg-white">
            <CardHeader className="flex flex-col gap-4 border-b border-gray-100 pb-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <CardTitle className="text-lg">Transações de {selectedMonth || 'Todos'}</CardTitle>
                  <CardDescription>Fluxo detalhado de entradas e saídas.</CardDescription>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={exportingZip}
                    onClick={handleExportMonthlyZIP}
                    className="h-9 text-xs font-bold gap-1.5 border-teal/30 text-teal hover:bg-teal-light"
                  >
                    {exportingZip ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Archive className="w-3.5 h-3.5" />}
                    Exportar ZIP Mensal
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={transactions.length === 0}
                    onClick={() => setClearModalOpen(true)}
                    className="h-9 text-xs font-bold gap-1.5 border-red-200 text-red-600 hover:bg-red-50"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Limpar Registos
                  </Button>
                </div>
              </div>
              <div className="relative w-full sm:w-72">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <Input
                  placeholder="Pesquisar..."
                  className="pl-10 bg-gray-50 border-gray-200 h-10"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="bg-gray-50 text-xs font-bold text-gray-500 uppercase border-b border-gray-100">
                      <th className="px-6 py-4">Data</th>
                      <th className="px-6 py-4">Tipo</th>
                      <th className="px-6 py-4">Descrição</th>
                      <th className="px-6 py-4">Categoria</th>
                      <th className="px-6 py-4 text-right">Valor</th>
                      <th className="px-4 py-4 text-right">Acção</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {!loading && filteredTransactions.length > 0 ? (
                      filteredTransactions.map((t) => (
                        <tr key={t.id} className="hover:bg-gray-50/50 transition-colors">
                          <td className="px-6 py-4 text-xs text-gray-600 font-semibold tabular-nums">
                            {new Date(t.date).toLocaleDateString('pt-AO')}
                          </td>
                          <td className="px-6 py-4">
                            <span
                              className={cn(
                                'text-[10px] font-black uppercase px-2.5 py-1 rounded-md',
                                t.type === 'income' ? 'bg-teal-light text-teal' : 'bg-red-50 text-red-600'
                              )}
                            >
                              {t.type === 'income' ? 'Entrada' : 'Saída'}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <p className="text-sm font-bold text-gray-900">{t.description}</p>
                            <p className="text-[11px] text-gray-400">{t.paymentMethod}</p>
                          </td>
                          <td className="px-6 py-4 text-xs font-semibold text-gray-600">{t.category}</td>
                          <td className="px-6 py-4 text-right">
                            <span
                              className={cn(
                                'text-sm font-bold tabular-nums',
                                t.type === 'income' ? 'text-teal' : 'text-red-600'
                              )}
                            >
                              {t.type === 'income' ? '+' : '-'} {formatCurrency(t.amount)}
                            </span>
                          </td>
                          <td className="px-4 py-4 text-right">
                            <button
                              type="button"
                              onClick={() => handleDeleteTransaction(t.id)}
                              title="Remover transação"
                              className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={6} className="px-6 py-10 text-center text-gray-400 text-sm">
                          Nenhuma transação encontrada para este filtro.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-8">
          <Card className="shadow-sm border border-gray-200 bg-white">
            <CardHeader className="border-b border-gray-100">
              <CardTitle className="text-lg">Empréstimos & Adiantamentos</CardTitle>
              <CardDescription>Controlo de adiantamentos a funcionários.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 pt-5">
              {advances.slice(0, 5).map((a) => (
                <div key={a.id} className="flex items-center justify-between p-3 rounded-xl border border-gray-100">
                  <div>
                    <p className="text-sm font-bold text-gray-900">{a.employeeName}</p>
                    <p className="text-[11px] text-gray-500">
                      {a.type === 'loan' ? 'Empréstimo' : 'Adiantamento'} · {a.date}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-gray-900 tabular-nums">{formatCurrency(a.amount)}</p>
                    <span className="text-[10px] font-bold text-emerald-700 uppercase">
                      {a.status === 'approved' ? 'Aprovado' : 'Pendente'}
                    </span>
                  </div>
                </div>
              ))}
              <Button
                onClick={() => {
                  setModalType('advance');
                  setIsModalOpen(true);
                }}
                variant="outline"
                className="w-full h-10 border-dashed border-gray-300 text-gray-600 hover:text-teal hover:border-teal hover:bg-teal-light"
              >
                <Plus className="w-4 h-4 mr-2" />
                Registar Adiantamento
              </Button>
            </CardContent>
          </Card>

          {/* Despesas Diárias & Outras Despesas (por baixo do Empréstimo) */}
          <Card className="shadow-sm border border-gray-200 bg-white">
            <CardHeader className="border-b border-gray-100">
              <CardTitle className="text-lg flex items-center gap-2">
                <ReceiptText className="w-5 h-5 text-red-600" />
                Despesas Diárias & Operacionais
              </CardTitle>
              <CardDescription>Registe gastos diários da agência, taxas, alimentação e custos gerais.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 pt-5">
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 rounded-xl bg-red-50/70 border border-red-100">
                  <p className="text-[10px] font-bold uppercase text-red-700">Hoje</p>
                  <p className="text-sm font-black text-red-800 tabular-nums mt-0.5">
                    {formatCurrency(expensesList.todayTotal)}
                  </p>
                </div>
                <div className="p-3 rounded-xl bg-gray-50 border border-gray-200">
                  <p className="text-[10px] font-bold uppercase text-gray-500">Total no Mês</p>
                  <p className="text-sm font-black text-gray-900 tabular-nums mt-0.5">
                    {formatCurrency(expensesList.monthTotal)}
                  </p>
                </div>
              </div>

              <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
                {expensesList.items.length === 0 ? (
                  <p className="text-xs text-gray-400 text-center py-4">
                    Nenhuma despesa registada neste período.
                  </p>
                ) : (
                  expensesList.items.slice(0, 8).map((exp) => (
                    <div
                      key={exp.id}
                      className="flex items-center justify-between gap-2 p-3 rounded-xl border border-gray-100 hover:bg-gray-50"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-gray-900 truncate">{exp.description}</p>
                        <p className="text-[11px] text-gray-500 truncate">
                          <span className="font-semibold text-red-600">
                            {exp.expenseScope === 'daily'
                              ? 'Diária'
                              : exp.expenseScope === 'payroll'
                              ? 'Salários'
                              : exp.expenseScope === 'operational'
                              ? 'Operacional'
                              : 'Outra'}
                          </span>{' '}
                          · {exp.category} · {exp.date}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-sm font-bold text-red-600 tabular-nums">
                          -{formatCurrency(exp.amount)}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleDeleteTransaction(exp.id)}
                          title="Eliminar despesa"
                          className="p-1 text-gray-400 hover:text-red-600"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>

              <Button
                type="button"
                onClick={() => {
                  setModalType('transaction');
                  setNewTrans({
                    type: 'expense',
                    expenseScope: 'daily',
                    category: EXPENSE_CATEGORIES[0],
                    amount: '',
                    description: '',
                    date: new Date().toISOString().slice(0, 10),
                    paymentMethod: PAYMENT_METHODS[0],
                  });
                  setIsModalOpen(true);
                }}
                variant="outline"
                className="w-full h-10 border-dashed border-red-300 text-red-700 hover:bg-red-50 hover:border-red-400 font-bold"
              >
                <Plus className="w-4 h-4 mr-2" />
                Adicionar Despesa
              </Button>
            </CardContent>
          </Card>

          <Card className="bg-teal text-white shadow-lg border-none overflow-hidden">
            <CardHeader className="pb-2">
              <CardTitle className="text-xl font-bold">Resumo & Relatórios</CardTitle>
              <CardDescription className="text-white/80">Faturamento acumulado e análise detalhada.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider opacity-80">Total Recebido no Período</p>
                <p className="text-3xl font-black tracking-tight tabular-nums mt-1">{formatCurrency(stats.income)}</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-white/10 p-3 rounded-xl">
                  <p className="text-[10px] font-bold uppercase opacity-75">Emitidos</p>
                  <p className="text-base font-bold tabular-nums">{invoices.length} Docs</p>
                </div>
                <div className="bg-white/10 p-3 rounded-xl">
                  <p className="text-[10px] font-bold uppercase opacity-75">Pagos</p>
                  <p className="text-base font-bold tabular-nums">{invoices.filter((i) => i.status === 'paid').length} Docs</p>
                </div>
              </div>
              <Button
                onClick={() => navigate('/admin/analytics')}
                className="w-full bg-white text-teal hover:bg-teal-light font-bold h-11 rounded-xl text-xs uppercase tracking-wider"
              >
                Gerar Relatório Detalhado
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Modal Emitir Documento */}
      {isInvoiceModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <Card className="w-full max-w-md shadow-2xl border border-gray-200 bg-white">
            <CardHeader className="border-b border-gray-100 flex flex-row items-center justify-between">
              <div>
                <CardTitle>Emitir Recibo / Fatura</CardTitle>
                <CardDescription>Após emitir, poderá imprimir, guardar em PDF ou enviar no WhatsApp.</CardDescription>
              </div>
              <Button variant="ghost" size="icon" onClick={() => setIsInvoiceModalOpen(false)} className="rounded-full">
                <Plus className="w-5 h-5 rotate-45" />
              </Button>
            </CardHeader>
            <CardContent className="pt-6">
              <form onSubmit={handleIssueInvoice} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-gray-600 uppercase">Tipo de Documento</label>
                  <select
                    value={newInvoice.type}
                    onChange={(e) => setNewInvoice({ ...newInvoice, type: e.target.value as any })}
                    className="w-full h-11 bg-gray-50 rounded-lg border border-gray-200 px-3 text-sm font-bold text-gray-700"
                  >
                    <option value="recibo">Recibo de Pagamento</option>
                    <option value="fatura">Factura Comercial</option>
                    <option value="fatura_proforma">Factura Pró-forma</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-gray-600 uppercase">Nome do Cliente</label>
                  <Input
                    placeholder="Nome completo"
                    value={newInvoice.clientName}
                    onChange={(e) => setNewInvoice({ ...newInvoice, clientName: e.target.value })}
                    className="bg-gray-50 border-gray-200 h-11"
                    required
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-gray-600 uppercase">BI / Passaporte</label>
                    <Input
                      placeholder="Número"
                      value={newInvoice.clientDocument}
                      onChange={(e) => setNewInvoice({ ...newInvoice, clientDocument: e.target.value })}
                      className="bg-gray-50 border-gray-200 h-11 uppercase"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-gray-600 uppercase">WhatsApp / Telefone</label>
                    <Input
                      placeholder="9XX XXX XXX"
                      value={newInvoice.clientPhone}
                      onChange={(e) => setNewInvoice({ ...newInvoice, clientPhone: e.target.value })}
                      className="bg-gray-50 border-gray-200 h-11"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-gray-600 uppercase">Valor Total (AOA)</label>
                  <Input
                    type="number"
                    placeholder="0.00"
                    value={newInvoice.amount}
                    onChange={(e) => setNewInvoice({ ...newInvoice, amount: e.target.value })}
                    className="bg-gray-50 border-gray-200 h-11 font-bold"
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-gray-600 uppercase">Descrição do Serviço</label>
                  <Input
                    placeholder="Ex: Assessoria de Visto Schengen"
                    value={newInvoice.description}
                    onChange={(e) => setNewInvoice({ ...newInvoice, description: e.target.value })}
                    className="bg-gray-50 border-gray-200 h-11"
                    required
                  />
                </div>

                <div className="flex gap-3 pt-4">
                  <Button type="button" variant="ghost" onClick={() => setIsInvoiceModalOpen(false)} className="flex-1">
                    Cancelar
                  </Button>
                  <Button type="submit" className="flex-1 bg-blue-600 hover:bg-blue-700 font-bold text-white">
                    Emitir Documento
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Modal Registar Transação / Adiantamento */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <Card className="w-full max-w-md shadow-2xl border border-gray-200 bg-white">
            <CardHeader className="border-b border-gray-100 flex flex-row items-center justify-between">
              <div>
                <CardTitle>{modalType === 'transaction' ? 'Novo Registo Financeiro' : 'Registar Adiantamento'}</CardTitle>
                <CardDescription>Preencha os dados com atenção.</CardDescription>
              </div>
              <Button variant="ghost" size="icon" onClick={() => setIsModalOpen(false)} className="rounded-full">
                <Plus className="w-5 h-5 rotate-45" />
              </Button>
            </CardHeader>
            <CardContent className="pt-6">
              <form onSubmit={handleAddTransaction} className="space-y-4">
                {modalType === 'transaction' ? (
                  <>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <label className="text-xs font-bold text-gray-600 uppercase">Tipo</label>
                        <select
                          value={newTrans.type}
                          onChange={(e) => setNewTrans({ ...newTrans, type: e.target.value as any })}
                          className="w-full h-10 bg-gray-50 rounded-lg border border-gray-200 px-3 text-sm font-bold text-gray-700"
                        >
                          <option value="expense">Saída / Despesa</option>
                          <option value="income">Entrada / Receita</option>
                        </select>
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs font-bold text-gray-600 uppercase">Data</label>
                        <Input
                          type="date"
                          value={newTrans.date}
                          onChange={(e) => setNewTrans({ ...newTrans, date: e.target.value })}
                          className="bg-gray-50 border-gray-200 h-10"
                          required
                        />
                      </div>
                    </div>

                    {newTrans.type === 'expense' && (
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                          <label className="text-xs font-bold text-gray-600 uppercase">Natureza da Despesa</label>
                          <select
                            value={newTrans.expenseScope}
                            onChange={(e) => setNewTrans({ ...newTrans, expenseScope: e.target.value as any })}
                            className="w-full h-10 bg-gray-50 rounded-lg border border-gray-200 px-3 text-sm font-bold text-gray-700"
                          >
                            <option value="daily">Despesa Diária</option>
                            <option value="operational">Operacional / Fixa</option>
                            <option value="payroll">Folha / Salários</option>
                            <option value="other">Outra Despesa</option>
                          </select>
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-xs font-bold text-gray-600 uppercase">Método Pagamento</label>
                          <select
                            value={newTrans.paymentMethod}
                            onChange={(e) => setNewTrans({ ...newTrans, paymentMethod: e.target.value })}
                            className="w-full h-10 bg-gray-50 rounded-lg border border-gray-200 px-3 text-sm font-semibold text-gray-700"
                          >
                            {PAYMENT_METHODS.map((pm) => (
                              <option key={pm} value={pm}>
                                {pm}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                    )}

                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-gray-600 uppercase">Valor (AOA)</label>
                      <Input
                        type="number"
                        placeholder="0.00"
                        value={newTrans.amount}
                        onChange={(e) => setNewTrans({ ...newTrans, amount: e.target.value })}
                        className="bg-gray-50 border-gray-200 h-10 font-bold"
                        required
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-gray-600 uppercase">Categoria</label>
                      {newTrans.type === 'expense' ? (
                        <select
                          value={EXPENSE_CATEGORIES.includes(newTrans.category as any) ? newTrans.category : 'Outras Despesas'}
                          onChange={(e) => setNewTrans({ ...newTrans, category: e.target.value })}
                          className="w-full h-10 bg-gray-50 rounded-lg border border-gray-200 px-3 text-sm font-semibold text-gray-700"
                        >
                          {EXPENSE_CATEGORIES.map((cat) => (
                            <option key={cat} value={cat}>
                              {cat}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <Input
                          placeholder="Ex: Assessoria, Visto, Reserva..."
                          value={newTrans.category}
                          onChange={(e) => setNewTrans({ ...newTrans, category: e.target.value })}
                          className="bg-gray-50 border-gray-200 h-10"
                          required
                        />
                      )}
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-gray-600 uppercase">Descrição</label>
                      <Input
                        placeholder="Motivo desta transação ou despesa"
                        value={newTrans.description}
                        onChange={(e) => setNewTrans({ ...newTrans, description: e.target.value })}
                        className="bg-gray-50 border-gray-200 h-10"
                        required
                      />
                    </div>
                  </>
                ) : (
                  <>
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-gray-600 uppercase">Nome do Funcionário</label>
                      <Input
                        placeholder="Ex: João Manuel"
                        value={newAdvance.employeeName}
                        onChange={(e) => setNewAdvance({ ...newAdvance, employeeName: e.target.value })}
                        className="bg-gray-50 border-gray-200 h-10"
                        required
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <label className="text-xs font-bold text-gray-600 uppercase">Tipo</label>
                        <select
                          value={newAdvance.type}
                          onChange={(e) => setNewAdvance({ ...newAdvance, type: e.target.value as any })}
                          className="w-full h-10 bg-gray-50 rounded-lg border border-gray-200 px-3 text-sm font-bold text-gray-700"
                        >
                          <option value="advance">Adiantamento</option>
                          <option value="loan">Empréstimo</option>
                        </select>
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs font-bold text-gray-600 uppercase">Data</label>
                        <Input
                          type="date"
                          value={newAdvance.date}
                          onChange={(e) => setNewAdvance({ ...newAdvance, date: e.target.value })}
                          className="bg-gray-50 border-gray-200 h-10"
                          required
                        />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-gray-600 uppercase">Valor (AOA)</label>
                      <Input
                        type="number"
                        placeholder="0.00"
                        value={newAdvance.amount}
                        onChange={(e) => setNewAdvance({ ...newAdvance, amount: e.target.value })}
                        className="bg-gray-50 border-gray-200 h-10 font-bold"
                        required
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-gray-600 uppercase">Motivo</label>
                      <Input
                        placeholder="Descrição ou observação"
                        value={newAdvance.reason}
                        onChange={(e) => setNewAdvance({ ...newAdvance, reason: e.target.value })}
                        className="bg-gray-50 border-gray-200 h-10"
                        required
                      />
                    </div>
                  </>
                )}

                <div className="flex gap-3 pt-4">
                  <Button type="button" variant="ghost" onClick={() => setIsModalOpen(false)} className="flex-1">
                    Cancelar
                  </Button>
                  <Button type="submit" className="flex-1 bg-teal hover:bg-teal-dark text-white font-bold">
                    Guardar Registo
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}

      <ReceiptModal
        invoice={activeReceipt}
        onClose={() => setActiveReceipt(null)}
        onUpdated={(updated) => setActiveReceipt(updated)}
      />

      {invoiceToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <Card className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden">
            <CardHeader className="border-b border-gray-100">
              <CardTitle className="text-lg font-bold text-red-700 flex items-center gap-2">
                <Trash2 className="w-5 h-5" />
                Eliminar Documento
              </CardTitle>
              <CardDescription>
                Tem a certeza que deseja eliminar {(invoiceToDelete.type || 'recibo').replace('_', ' ').toUpperCase()} de{' '}
                <strong>{invoiceToDelete.clientName}</strong> ({formatCurrency(invoiceToDelete.amount)})? Esta ação é permanente.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-6 flex justify-end gap-3">
              <Button
                type="button"
                variant="ghost"
                disabled={deletingInvoice}
                onClick={() => setInvoiceToDelete(null)}
              >
                Cancelar
              </Button>
              <Button
                type="button"
                disabled={deletingInvoice}
                onClick={handleDeleteInvoice}
                className="bg-red-600 hover:bg-red-700 text-white font-bold gap-2"
              >
                {deletingInvoice ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                Confirmar Eliminação
              </Button>
            </CardContent>
          </Card>
        </div>
      )}
      {clearModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <Card className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden">
            <CardHeader className="border-b border-gray-100">
              <CardTitle className="text-lg font-bold text-red-700 flex items-center gap-2">
                <AlertTriangle className="w-5 h-5" />
                Limpar Registos de Transações
              </CardTitle>
              <CardDescription>
                Escolha quais registos deseja eliminar permanentemente da base de dados financeira.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-6 space-y-4">
              <div className="space-y-2">
                <label className="flex items-center gap-3 p-3 rounded-xl border border-gray-200 cursor-pointer hover:bg-gray-50">
                  <input
                    type="radio"
                    name="clearScope"
                    checked={clearScope === 'month'}
                    onChange={() => setClearScope('month')}
                    className="accent-red-600"
                  />
                  <div>
                    <p className="text-sm font-bold text-gray-900">
                      Apenas do Mês Selecionado ({selectedMonth || 'Todos'})
                    </p>
                    <p className="text-xs text-gray-500">
                      {transactions.filter((t) => !selectedMonth || t.date.startsWith(selectedMonth)).length} registo(s) serão apagados.
                    </p>
                  </div>
                </label>
                <label className="flex items-center gap-3 p-3 rounded-xl border border-red-200 bg-red-50/40 cursor-pointer hover:bg-red-50">
                  <input
                    type="radio"
                    name="clearScope"
                    checked={clearScope === 'all'}
                    onChange={() => setClearScope('all')}
                    className="accent-red-600"
                  />
                  <div>
                    <p className="text-sm font-bold text-red-900">Todos os Registos Históricos</p>
                    <p className="text-xs text-red-700">
                      {transactions.length} registo(s) totais (entradas e despesas) serão apagados.
                    </p>
                  </div>
                </label>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <Button
                  type="button"
                  variant="ghost"
                  disabled={clearingRecords}
                  onClick={() => setClearModalOpen(false)}
                >
                  Cancelar
                </Button>
                <Button
                  type="button"
                  disabled={clearingRecords}
                  onClick={handleClearTransactions}
                  className="bg-red-600 hover:bg-red-700 text-white font-bold gap-2"
                >
                  {clearingRecords ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                  Confirmar Limpeza
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

function StatsCard({ title, val, sub, icon, color }: { title: string; val: string; sub: string; icon: React.ReactNode; color: string }) {
  const colors: Record<string, string> = {
    teal: 'bg-teal-light text-teal',
    red: 'bg-red-50 text-red-600',
    blue: 'bg-blue-50 text-blue-600',
    yellow: 'bg-amber-50 text-amber-600',
  };

  return (
    <Card className="shadow-sm border border-gray-200 bg-white">
      <CardContent className="p-6">
        <div className="flex items-start justify-between mb-4">
          <div className={cn('p-2.5 rounded-xl', colors[color])}>{icon}</div>
        </div>
        <div className="space-y-1">
          <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">{title}</p>
          <h3 className="text-2xl font-extrabold text-gray-900 tracking-tight font-display tabular-nums">{val}</h3>
          <p className="text-xs text-gray-400 font-medium">{sub}</p>
        </div>
      </CardContent>
    </Card>
  );
}
