/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import {
  collection,
  onSnapshot,
  query,
  where,
  orderBy,
  doc,
  updateDoc,
  setDoc,
  getDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { db, OperationType, handleFirestoreError } from '@/src/firebase';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/src/components/ui/Card';
import { Button } from '@/src/components/ui/Button';
import { Input } from '@/src/components/ui/Input';
import {
  Search,
  Plus,
  Mail,
  Phone,
  MapPin,
  FileText,
  Edit2,
  MessageSquare,
  ClipboardList,
  CreditCard,
  Download,
  Plane,
  Users as Users2,
  Eye,
  Printer,
} from 'lucide-react';
import { UserProfile, TravelProcess, Invoice, ClientProfile, ProcessDocument } from '@/src/types';
import { PROCESS_STATUSES } from '@/src/constants';
import { cn } from '@/src/lib/utils';
import { NewClientModal } from '@/src/components/NewClientModal';
import { DocumentViewerModal } from '@/src/components/DocumentViewerModal';
import { ReceiptModal } from '@/src/components/ReceiptModal';
import { downloadFileFromUrlOrData } from '@/src/utils/fileHelpers';

export function CRM() {
  const [searchTerm, setSearchTerm] = useState('');
  const [clients, setClients] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedClient, setSelectedClient] = useState<UserProfile | null>(null);
  const [selectedClientExtra, setSelectedClientExtra] = useState<ClientProfile | null>(null);
  const [isNewClientModalOpen, setIsNewClientModalOpen] = useState(false);
  const [isEditClientOpen, setIsEditClientOpen] = useState(false);

  const [editForm, setEditForm] = useState({
    displayName: '',
    phone: '',
    passportNumber: '',
    address: '',
  });

  const [clientProcesses, setClientProcesses] = useState<TravelProcess[]>([]);
  const [clientInvoices, setClientInvoices] = useState<Invoice[]>([]);
  const [clientDocuments, setClientDocuments] = useState<ProcessDocument[]>([]);
  const [viewerDoc, setViewerDoc] = useState<ProcessDocument | null>(null);
  const [activeReceipt, setActiveReceipt] = useState<Invoice | null>(null);

  useEffect(() => {
    const q = query(collection(db, 'users'), where('role', '==', 'client'), orderBy('email', 'asc'));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        setClients(snapshot.docs.map((d) => ({ ...d.data(), uid: d.id }) as UserProfile));
        setLoading(false);
      },
      (error) => handleFirestoreError(error, OperationType.LIST, 'users')
    );

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!selectedClient) return;

    const unsubExtra = onSnapshot(doc(db, 'clients', selectedClient.uid), (snap) => {
      if (snap.exists()) {
        setSelectedClientExtra(snap.data() as ClientProfile);
      } else {
        setSelectedClientExtra(null);
      }
    });

    const qProc = query(collection(db, 'processes'), where('clientUid', '==', selectedClient.uid));
    const unsubProc = onSnapshot(qProc, (snapshot) => {
      setClientProcesses(snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as TravelProcess)));
    });

    const qInv = query(collection(db, 'invoices'), where('clientUid', '==', selectedClient.uid));
    const unsubInv = onSnapshot(qInv, (snapshot) => {
      setClientInvoices(snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as Invoice)));
    });

    const qDocs = query(collection(db, 'documents'), where('clientUid', '==', selectedClient.uid));
    const unsubDocs = onSnapshot(qDocs, (snapshot) => {
      setClientDocuments(snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as ProcessDocument)));
    });

    return () => {
      unsubExtra();
      unsubProc();
      unsubInv();
      unsubDocs();
    };
  }, [selectedClient]);

  const filteredClients = clients.filter(
    (c) =>
      (c.displayName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('pt-AO', { style: 'currency', currency: 'AOA' }).format(val || 0);
  };

  const pendingBalance = clientInvoices
    .filter((i) => i.status !== 'paid' && i.status !== 'cancelled')
    .reduce((sum, i) => sum + (i.amount || 0), 0);

  const clientPhone = selectedClientExtra?.phone || (selectedClient as any)?.phone || '';
  const clientAddress = selectedClientExtra?.address || (selectedClient as any)?.address || '';
  const clientPassport = selectedClientExtra?.passportNumber || (selectedClient as any)?.passportNumber || '';

  const handleOpenEditClient = () => {
    if (!selectedClient) return;
    setEditForm({
      displayName: selectedClient.displayName || '',
      phone: clientPhone,
      passportNumber: clientPassport,
      address: clientAddress,
    });
    setIsEditClientOpen(true);
  };

  const handleSaveEditClient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedClient) return;
    try {
      await updateDoc(doc(db, 'users', selectedClient.uid), {
        displayName: editForm.displayName,
        updatedAt: serverTimestamp(),
      });
      await setDoc(
        doc(db, 'clients', selectedClient.uid),
        {
          uid: selectedClient.uid,
          displayName: editForm.displayName,
          email: selectedClient.email,
          phone: editForm.phone,
          passportNumber: editForm.passportNumber,
          address: editForm.address,
        },
        { merge: true }
      );
      setSelectedClient({ ...selectedClient, displayName: editForm.displayName });
      setIsEditClientOpen(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `clients/${selectedClient.uid}`);
    }
  };

  const handleCreateInvoice = async () => {
    if (!selectedClient) return;
    const targetProc = clientProcesses[0];
    const amount = targetProc?.price || 0;
    try {
      const docRef = doc(collection(db, 'invoices'));
      const invoiceData: Invoice = {
        id: docRef.id,
        clientUid: selectedClient.uid,
        clientName: selectedClient.displayName || selectedClient.email,
        clientPhone,
        clientDocument: clientPassport,
        processId: targetProc?.id || 'manual',
        amount,
        items: [
          {
            description: targetProc?.serviceName || 'Serviço de Assessoria',
            quantity: 1,
            price: amount,
          },
        ],
        status: 'pending',
        type: 'fatura',
        dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        createdAt: new Date().toISOString(),
      };
      await setDoc(docRef, invoiceData);
      setActiveReceipt(invoiceData);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'invoices');
    }
  };

  const handleWhatsAppClient = () => {
    if (!selectedClient) return;
    const cleaned = clientPhone.replace(/[^\d]/g, '');
    const msg = `Olá ${selectedClient.displayName || ''}, entramos em contacto da agência Vistos Liberdade acerca do seu processo.`;
    const url = cleaned
      ? `https://wa.me/${cleaned.startsWith('244') ? cleaned : cleaned.length === 9 ? '244' + cleaned : cleaned}?text=${encodeURIComponent(msg)}`
      : `https://wa.me/?text=${encodeURIComponent(msg)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const handleDownloadClientDoc = async (item: ProcessDocument) => {
    let url = item.url;
    if (item.hasFileContent) {
      const snap = await getDoc(doc(db, 'document_files', item.id));
      if (snap.exists()) {
        url = snap.data().dataUrl;
      }
    }
    downloadFileFromUrlOrData(url, item.fileName || `${item.name}.pdf`);
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-teal rounded-xl flex items-center justify-center text-white shadow-lg shadow-teal/20">
            <Users2 className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-gray-900 tracking-tight font-display">CRM & Gestão de Clientes</h1>
            <p className="text-gray-500 text-sm">Fichas completas, documentação, recibos e contacto direto.</p>
          </div>
        </div>
        <Button
          onClick={() => setIsNewClientModalOpen(true)}
          className="bg-teal hover:bg-teal-dark gap-2 shadow-lg shadow-teal/20 h-11 px-6 font-bold text-white"
        >
          <Plus className="w-4 h-4" />
          Novo Cliente
        </Button>
      </div>

      <NewClientModal isOpen={isNewClientModalOpen} onClose={() => setIsNewClientModalOpen(false)} />

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        <div className="lg:col-span-1 space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              placeholder="Buscar cliente..."
              className="pl-10 bg-white border-gray-200 h-11 rounded-xl"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          <div className="space-y-2 max-h-[650px] overflow-y-auto pr-1">
            {loading ? (
              <div className="p-6 text-center text-sm text-gray-400">A carregar clientes...</div>
            ) : (
              filteredClients.map((client) => (
                <div
                  key={client.uid}
                  onClick={() => setSelectedClient(client)}
                  className={cn(
                    'p-4 rounded-xl border transition-all cursor-pointer flex items-center gap-3',
                    selectedClient?.uid === client.uid
                      ? 'bg-teal-light/30 border-teal shadow-sm'
                      : 'bg-white border-gray-200 hover:border-teal/50'
                  )}
                >
                  <div
                    className={cn(
                      'w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm shrink-0',
                      selectedClient?.uid === client.uid ? 'bg-teal text-white' : 'bg-gray-100 text-gray-600'
                    )}
                  >
                    {(client.displayName || client.email || '?').charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-gray-900 truncate">{client.displayName || 'Sem Nome'}</p>
                    <p className="text-xs text-gray-500 truncate">{client.email}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="lg:col-span-3">
          {selectedClient ? (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card className="md:col-span-2 shadow-sm border border-gray-200 rounded-2xl bg-white overflow-hidden">
                  <CardHeader className="p-6 border-b border-gray-100 flex flex-row items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="w-16 h-16 rounded-2xl bg-teal flex items-center justify-center text-white text-2xl font-black">
                        {(selectedClient.displayName || selectedClient.email || '?').charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <CardTitle className="text-2xl font-bold text-gray-900">
                          {selectedClient.displayName || 'Cliente'}
                        </CardTitle>
                        <p className="text-xs text-gray-500 mt-1">
                          Passaporte/BI: <strong className="text-gray-700">{clientPassport || 'Não informado'}</strong>
                        </p>
                      </div>
                    </div>
                    <Button variant="outline" size="sm" onClick={handleOpenEditClient} className="gap-1.5 border-gray-200">
                      <Edit2 className="w-3.5 h-3.5" />
                      Editar Ficha
                    </Button>
                  </CardHeader>
                  <CardContent className="p-6 space-y-6">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <ContactItem icon={<Mail />} label="E-mail" val={selectedClient.email} />
                      <ContactItem icon={<Phone />} label="Telefone" val={clientPhone || 'Não registado'} />
                      <ContactItem icon={<MapPin />} label="Endereço" val={clientAddress || 'Não registado'} />
                    </div>
                    <div className="flex flex-wrap gap-3 pt-2">
                      <Button
                        size="sm"
                        onClick={handleWhatsAppClient}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold gap-2 rounded-xl h-10 px-5"
                      >
                        <MessageSquare className="w-4 h-4" />
                        WhatsApp
                      </Button>
                      <a
                        href={`mailto:${selectedClient.email}`}
                        className="inline-flex items-center justify-center gap-2 rounded-xl h-10 px-5 border border-teal text-teal hover:bg-teal-light font-bold text-xs transition-colors"
                      >
                        <Mail className="w-4 h-4" />
                        Enviar E-mail
                      </a>
                    </div>
                  </CardContent>
                </Card>

                <Card className="shadow-sm border-none rounded-2xl bg-teal text-white overflow-hidden">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-lg font-bold">Faturação do Cliente</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-5">
                    <div>
                      <p className="text-[10px] font-bold opacity-75 uppercase tracking-widest">Saldo Pendente</p>
                      <p className="text-2xl font-black tracking-tight mt-1 tabular-nums">
                        {formatCurrency(pendingBalance)}
                      </p>
                    </div>
                    <Button
                      onClick={handleCreateInvoice}
                      className="w-full bg-white text-teal hover:bg-teal-light font-bold rounded-xl h-11 text-xs uppercase tracking-wider"
                    >
                      Gerar Recibo / Fatura
                    </Button>
                  </CardContent>
                </Card>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card className="md:col-span-2 shadow-sm border border-gray-200 rounded-2xl bg-white overflow-hidden">
                  <CardHeader className="border-b border-gray-100 p-6">
                    <CardTitle className="text-lg font-bold flex items-center gap-2">
                      <ClipboardList className="w-5 h-5 text-teal" />
                      Histórico de Processos ({clientProcesses.length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-0 divide-y divide-gray-100">
                    {clientProcesses.length > 0 ? (
                      clientProcesses.map((p) => (
                        <div key={p.id} className="p-5 flex items-center justify-between gap-4 hover:bg-gray-50/50">
                          <div className="flex items-center gap-4">
                            <div className="w-10 h-10 rounded-xl bg-teal-light flex items-center justify-center text-teal">
                              <Plane className="w-5 h-5" />
                            </div>
                            <div>
                              <p className="text-sm font-bold text-gray-900">{p.serviceName || p.serviceId}</p>
                              <p className="text-xs text-gray-500">
                                {PROCESS_STATUSES.find((s) => s.id === p.status)?.label || p.status} · {p.progress || 0}%
                              </p>
                            </div>
                          </div>
                          <span className="text-sm font-bold text-gray-900 tabular-nums">
                            {formatCurrency(p.price || 0)}
                          </span>
                        </div>
                      ))
                    ) : (
                      <div className="p-10 text-center text-sm text-gray-400">Nenhum processo registado.</div>
                    )}
                  </CardContent>
                </Card>

                <Card className="shadow-sm border border-gray-200 rounded-2xl bg-white overflow-hidden">
                  <CardHeader className="p-6 border-b border-gray-100">
                    <CardTitle className="text-lg font-bold flex items-center gap-2">
                      <FileText className="w-5 h-5 text-teal" />
                      Documentos ({clientDocuments.length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-4 space-y-2">
                    {clientDocuments.length > 0 ? (
                      clientDocuments.map((d) => (
                        <div key={d.id} className="flex items-center justify-between p-3 rounded-xl border border-gray-100">
                          <span className="text-xs font-bold text-gray-800 truncate flex-1 mr-2">{d.name}</span>
                          <div className="flex items-center gap-1 shrink-0">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => setViewerDoc(d)}
                              className="h-8 w-8 text-teal"
                              title="Visualizar"
                            >
                              <Eye className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleDownloadClientDoc(d)}
                              className="h-8 w-8 text-gray-600"
                              title="Baixar"
                            >
                              <Download className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                      ))
                    ) : (
                      <p className="text-xs text-gray-400 text-center py-6">Sem documentos anexados.</p>
                    )}
                  </CardContent>
                </Card>
              </div>

              <Card className="shadow-sm border border-gray-200 rounded-2xl bg-white overflow-hidden">
                <CardHeader className="p-6 border-b border-gray-100">
                  <CardTitle className="text-lg font-bold flex items-center gap-2">
                    <CreditCard className="w-5 h-5 text-teal" />
                    Faturas e Recibos ({clientInvoices.length})
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0 divide-y divide-gray-100">
                  {clientInvoices.length > 0 ? (
                    clientInvoices.map((inv) => (
                      <div key={inv.id} className="p-5 flex items-center justify-between hover:bg-gray-50/50">
                        <div>
                          <p className="text-sm font-bold text-gray-900 tabular-nums">{formatCurrency(inv.amount)}</p>
                          <p className="text-xs text-gray-500">
                            {(inv.type || 'fatura').toUpperCase()} · {new Date(inv.createdAt).toLocaleDateString('pt-AO')}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span
                            className={cn(
                              'text-[10px] font-bold uppercase px-2.5 py-1 rounded-md',
                              inv.status === 'paid' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                            )}
                          >
                            {inv.status === 'paid' ? 'Pago' : 'Pendente'}
                          </span>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setActiveReceipt(inv)}
                            className="gap-1.5 text-xs"
                          >
                            <Printer className="w-3.5 h-3.5 text-teal" />
                            Recibo / WhatsApp
                          </Button>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="p-8 text-center text-sm text-gray-400">Nenhuma fatura emitida.</div>
                  )}
                </CardContent>
              </Card>
            </div>
          ) : (
            <div className="h-[520px] flex flex-col items-center justify-center p-12 text-center bg-white rounded-2xl border border-gray-200">
              <div className="w-16 h-16 bg-teal-light rounded-2xl flex items-center justify-center mb-4">
                <Users2 className="w-8 h-8 text-teal" />
              </div>
              <h3 className="text-xl font-bold text-gray-900">Seleccione um Cliente</h3>
              <p className="text-sm text-gray-500 max-w-sm mt-2">
                Aceda à ficha do cliente para consultar processos, documentos, faturas e enviar mensagens pelo WhatsApp.
              </p>
            </div>
          )}
        </div>
      </div>

      {isEditClientOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <Card className="w-full max-w-md bg-white border border-gray-200 shadow-2xl">
            <CardHeader className="border-b border-gray-100">
              <CardTitle>Editar Dados do Cliente</CardTitle>
              <CardDescription>Atualize os contactos e número de passaporte/BI.</CardDescription>
            </CardHeader>
            <form onSubmit={handleSaveEditClient}>
              <CardContent className="p-6 space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-gray-600 uppercase">Nome Completo</label>
                  <Input
                    required
                    value={editForm.displayName}
                    onChange={(e) => setEditForm({ ...editForm, displayName: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-gray-600 uppercase">Telefone / WhatsApp</label>
                  <Input
                    value={editForm.phone}
                    onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-gray-600 uppercase">BI / Passaporte</label>
                  <Input
                    value={editForm.passportNumber}
                    onChange={(e) => setEditForm({ ...editForm, passportNumber: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-gray-600 uppercase">Endereço</label>
                  <Input
                    value={editForm.address}
                    onChange={(e) => setEditForm({ ...editForm, address: e.target.value })}
                  />
                </div>
              </CardContent>
              <div className="p-4 border-t border-gray-100 flex justify-end gap-2">
                <Button type="button" variant="ghost" onClick={() => setIsEditClientOpen(false)}>
                  Cancelar
                </Button>
                <Button type="submit" className="bg-teal hover:bg-teal-dark text-white">
                  Guardar
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}

      <DocumentViewerModal documentItem={viewerDoc} onClose={() => setViewerDoc(null)} />
      <ReceiptModal invoice={activeReceipt} onClose={() => setActiveReceipt(null)} />
    </div>
  );
}

function ContactItem({ icon, label, val }: { icon: React.ReactNode; label: string; val: string }) {
  return (
    <div className="flex items-center gap-3 p-3 rounded-xl bg-gray-50 border border-gray-100">
      <div className="w-9 h-9 rounded-lg bg-white flex items-center justify-center text-teal shrink-0">
        {React.cloneElement(icon as React.ReactElement<any>, { className: 'w-4 h-4' })}
      </div>
      <div className="min-w-0">
        <p className="text-[10px] font-bold text-gray-400 uppercase">{label}</p>
        <p className="text-xs font-bold text-gray-800 truncate">{val}</p>
      </div>
    </div>
  );
}
