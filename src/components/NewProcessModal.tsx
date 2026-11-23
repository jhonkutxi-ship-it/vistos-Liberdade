/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useMemo } from 'react';
import {
  collection,
  serverTimestamp,
  getDocs,
  query,
  where,
  setDoc,
  doc,
} from 'firebase/firestore';
import { db, OperationType, handleFirestoreError } from '@/src/firebase';
import { useAuth } from '@/src/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/src/components/ui/Card';
import { Button } from '@/src/components/ui/Button';
import { Input } from '@/src/components/ui/Input';
import { Badge } from '@/src/components/ui/Badge';
import {
  X,
  User,
  FileText,
  CreditCard,
  Calendar,
  Clock,
  Upload,
  Check,
  ChevronRight,
  ChevronLeft,
  Loader2,
  Users,
  Plus,
  Trash2,
  UserCheck,
} from 'lucide-react';
import { cn, formatCurrency } from '@/src/lib/utils';
import {
  TravelService,
  UserProfile,
  TravelProcess,
  ProcessGroupMember,
  ConsultantProfile,
  PaymentRecord,
} from '@/src/types';
import { FAMILY_RELATIONSHIPS, PAYMENT_METHODS, TRENDING_PROMO_SERVICES } from '@/src/constants';
import { processUploadedFile } from '@/src/utils/fileHelpers';

interface NewProcessModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function NewProcessModal({ isOpen, onClose, onSuccess }: NewProcessModalProps) {
  const { user, profile } = useAuth();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [services, setServices] = useState<TravelService[]>([]);
  const [clients, setClients] = useState<UserProfile[]>([]);
  const [consultants, setConsultants] = useState<ConsultantProfile[]>([]);

  // Form State
  const [formData, setFormData] = useState({
    clientUid: '',
    clientName: '',
    serviceId: '',
    serviceName: '',
    unitPrice: 0,
    assignedEmployeeUid: '',
    assignedEmployeeName: '',
    paymentType: 'full' as 'full' | 'installments',
    dates: {
      documentPickup: '',
      appointment: '',
      travel: '',
      embassySubmission: '',
    },
  });

  // Grupo Familiar State
  const [isGroupProcess, setIsGroupProcess] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [familyMembers, setFamilyMembers] = useState<ProcessGroupMember[]>([]);
  const [customTotalPriceOverride, setCustomTotalPriceOverride] = useState<string>('');

  // Pagamento Parcelado / Forma / Comprovativo State
  const [installmentMode, setInstallmentMode] = useState<'half_50_50' | 'custom'>('half_50_50');
  const [initialPaidAmount, setInitialPaidAmount] = useState<string>('0');
  const [paymentMethod, setPaymentMethod] = useState<string>(PAYMENT_METHODS[0]);
  const [proofFile, setProofFile] = useState<File | null>(null);

  useEffect(() => {
    if (isOpen) {
      setStep(1);
      setIsGroupProcess(false);
      setGroupName('');
      setFamilyMembers([]);
      setCustomTotalPriceOverride('');
      setInstallmentMode('half_50_50');
      setInitialPaidAmount('0');
      setPaymentMethod(PAYMENT_METHODS[0]);
      setProofFile(null);
      fetchData();
    }
  }, [isOpen]);

  const fetchData = async () => {
    try {
      const [servicesSnap, clientsSnap, consultantsSnap] = await Promise.all([
        getDocs(collection(db, 'services')),
        getDocs(query(collection(db, 'users'), where('role', '==', 'client'))),
        getDocs(collection(db, 'consultants')),
      ]);

      const fetchedServices = servicesSnap.docs.map((d) => ({ id: d.id, ...d.data() })) as TravelService[];
      const mergedServices = [...fetchedServices];
      for (const promo of TRENDING_PROMO_SERVICES) {
        if (!mergedServices.some((s) => s.id === promo.id || s.name === promo.title)) {
          mergedServices.push({
            id: promo.id,
            name: promo.title,
            price: promo.price,
            description: promo.description,
            category: promo.category,
          });
        }
      }
      setServices(mergedServices);
      setClients(clientsSnap.docs.map((d) => ({ uid: d.id, ...d.data() })) as UserProfile[]);
      setConsultants(
        consultantsSnap.docs
          .map((d) => ({ ...d.data(), uid: d.id }) as ConsultantProfile)
          .filter((c) => c.active !== false)
      );
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, 'data');
    }
  };

  const activeMemberCount = useMemo(() => {
    if (!isGroupProcess) return 1;
    return 1 + familyMembers.filter((m) => m.fullName.trim().length > 0).length;
  }, [isGroupProcess, familyMembers]);

  const computedTotalPrice = useMemo(() => {
    if (customTotalPriceOverride.trim() !== '') {
      return Math.max(0, Number(customTotalPriceOverride) || 0);
    }
    return (formData.unitPrice || 0) * activeMemberCount;
  }, [formData.unitPrice, activeMemberCount, customTotalPriceOverride]);

  useEffect(() => {
    if (formData.paymentType === 'installments' && installmentMode === 'half_50_50') {
      setInitialPaidAmount(String(Math.round(computedTotalPrice / 2)));
    }
  }, [formData.paymentType, installmentMode, computedTotalPrice]);

  const handleAddFamilyMember = () => {
    setFamilyMembers((prev) => [
      ...prev,
      {
        id: Math.random().toString(36).substring(2, 10),
        fullName: '',
        relationship: 'conjuge',
        age: '',
        documentNumber: '',
      },
    ]);
  };

  const handleUpdateFamilyMember = (id: string, patch: Partial<ProcessGroupMember>) => {
    setFamilyMembers((prev) => prev.map((m) => (m.id === id ? { ...m, ...patch } : m)));
  };

  const handleRemoveFamilyMember = (id: string) => {
    setFamilyMembers((prev) => prev.filter((m) => m.id !== id));
  };

  const handleCreateProcess = async () => {
    setLoading(true);
    try {
      const docRef = doc(collection(db, 'processes'));
      const processId = docRef.id;

      const validDependents = isGroupProcess
        ? familyMembers.filter((m) => m.fullName.trim().length > 0)
        : [];
      const allGroupMembers: ProcessGroupMember[] = isGroupProcess
        ? [
            {
              id: 'titular-0',
              fullName: formData.clientName || 'Titular',
              relationship: 'titular',
            },
            ...validDependents,
          ]
        : [];

      const totalPrice = computedTotalPrice;
      const paidAmount =
        formData.paymentType === 'full'
          ? totalPrice
          : Math.max(0, Math.min(totalPrice, Number(initialPaidAmount) || 0));
      const remainingAmount = Math.max(0, totalPrice - paidAmount);
      const paymentStatus: TravelProcess['paymentStatus'] =
        totalPrice > 0 && paidAmount >= totalPrice
          ? 'paid'
          : paidAmount > 0
          ? 'partially_paid'
          : 'pending';

      let uploadedProofDocId: string | undefined;
      if (proofFile) {
        const processed = await processUploadedFile(proofFile);
        const fileDocRef = doc(collection(db, 'documents'));
        uploadedProofDocId = fileDocRef.id;

        await setDoc(doc(db, 'document_files', fileDocRef.id), {
          docId: fileDocRef.id,
          processId,
          clientUid: formData.clientUid,
          uploadedBy: user?.uid || profile?.uid || '',
          dataUrl: processed.dataUrl,
          fileName: processed.fileName,
          mimeType: processed.mimeType,
          fileSize: processed.fileSize,
          createdAt: serverTimestamp(),
        });

        await setDoc(fileDocRef, {
          id: fileDocRef.id,
          processId,
          clientUid: formData.clientUid,
          name: `Comprovativo Pagamento - ${processed.fileName}`,
          fileName: processed.fileName,
          mimeType: processed.mimeType,
          fileSize: processed.fileSize,
          hasFileContent: true,
          isAgencyIssued: false,
          url: `firestore://document_files/${fileDocRef.id}`,
          category: 'payment_proof',
          status: 'verified',
          uploadedBy: user?.uid || profile?.uid || '',
          createdAt: serverTimestamp(),
        });
      }

      const paymentHistory: PaymentRecord[] =
        paidAmount > 0
          ? [
              {
                id: `pay-${Date.now()}`,
                amount: paidAmount,
                method: paymentMethod,
                date: new Date().toISOString(),
                note:
                  formData.paymentType === 'full'
                    ? 'Pagamento completo na abertura'
                    : installmentMode === 'half_50_50'
                    ? '1ª Parcela (50% / Metade)'
                    : 'Valor inicial personalizado',
                ...(uploadedProofDocId ? { proofDocId: uploadedProofDocId } : {}),
                recordedBy: user?.uid || profile?.uid || '',
              },
            ]
          : [];

      const chosenEmpUid = formData.assignedEmployeeUid || profile?.uid || '';
      const chosenEmpName =
        formData.assignedEmployeeName || profile?.displayName || profile?.email || 'Equipa Vistos Liberdade';

      const newProcess: Partial<TravelProcess> = {
        id: processId,
        clientUid: formData.clientUid,
        clientName: formData.clientName,
        serviceId: formData.serviceId,
        serviceName: formData.serviceName,
        assignedEmployeeUid: chosenEmpUid,
        assignedEmployeeName: chosenEmpName,
        unitPrice: formData.unitPrice || 0,
        memberCount: isGroupProcess ? Math.max(1, allGroupMembers.length) : 1,
        price: totalPrice,
        isGroupProcess: isGroupProcess && validDependents.length > 0,
        ...(isGroupProcess && validDependents.length > 0
          ? {
              groupName: groupName.trim() || `Grupo Familiar · ${formData.clientName}`,
              groupMembers: allGroupMembers,
            }
          : {}),
        paidAmount,
        remainingAmount,
        paymentMethod,
        ...(formData.paymentType === 'installments' ? { installmentSchedule: installmentMode } : {}),
        paymentHistory,
        status: 'pending',
        progress: 10,
        paymentType: formData.paymentType,
        paymentStatus,
        paymentConfirmed: paidAmount > 0 || paymentStatus === 'paid' || paymentStatus === 'partially_paid',
        ...(paidAmount > 0 || paymentStatus === 'paid' || paymentStatus === 'partially_paid'
          ? {
              paymentConfirmedAt: new Date().toISOString(),
              paymentConfirmedBy: user?.uid || profile?.uid || '',
            }
          : {}),
        dates: formData.dates,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await setDoc(docRef, {
        ...newProcess,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      if (paidAmount > 0) {
        const transRef = doc(collection(db, 'financial_transactions'));
        await setDoc(transRef, {
          id: transRef.id,
          type: 'income',
          category: 'Vistos & Assessoria',
          amount: paidAmount,
          date: new Date().toISOString().slice(0, 10),
          description: `${formData.paymentType === 'installments' ? 'Entrada Parcelada' : 'Pagamento'} · ${formData.serviceName} (${formData.clientName})`,
          relatedTo: processId,
          status: 'completed',
          paymentMethod,
          createdAt: serverTimestamp(),
        }).catch(() => {});
      }

      if (chosenEmpUid && chosenEmpUid !== user?.uid) {
        const notifRef = doc(collection(db, 'notifications'));
        await setDoc(notifRef, {
          id: notifRef.id,
          recipientUid: chosenEmpUid,
          recipientName: chosenEmpName,
          senderUid: user?.uid || '',
          senderName: profile?.displayName || 'Equipa',
          type: 'process_assigned',
          title: 'Processo Atribuído a Si',
          message: `O processo "${formData.serviceName}" para ${formData.clientName} foi atribuído ao seu acompanhamento.`,
          processId,
          serviceName: formData.serviceName,
          read: false,
          createdAt: serverTimestamp(),
        }).catch(() => {});
      }

      onSuccess();
      onClose();
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'processes');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <Card className="w-full max-w-2xl shadow-2xl animate-in zoom-in-95 duration-200 max-h-[92vh] flex flex-col overflow-hidden bg-white">
        <CardHeader className="flex flex-row items-center justify-between border-b border-gray-100 pb-4 shrink-0">
          <div>
            <CardTitle className="text-xl">Novo Processo</CardTitle>
            <CardDescription>Crie processos individuais ou em grupo familiar com controlo de parcelas.</CardDescription>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} className="rounded-full">
            <X className="w-5 h-5" />
          </Button>
        </CardHeader>

        <div className="flex px-6 py-4 bg-gray-50/50 border-b border-gray-100 shrink-0">
          {[1, 2, 3].map((s) => (
            <div key={s} className="flex items-center flex-1 last:flex-none">
              <div
                className={cn(
                  'w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-all',
                  step === s
                    ? 'bg-teal text-white ring-4 ring-teal/10'
                    : step > s
                    ? 'bg-green-500 text-white'
                    : 'bg-gray-200 text-gray-500'
                )}
              >
                {step > s ? <Check className="w-4 h-4" /> : s}
              </div>
              {s < 3 && (
                <div className={cn('h-1 flex-1 mx-2 rounded-full', step > s ? 'bg-green-500' : 'bg-gray-200')} />
              )}
            </div>
          ))}
        </div>

        <CardContent className="p-6 overflow-y-auto flex-1">
          {step === 1 && (
            <div className="space-y-6 animate-in slide-in-from-right-4 duration-300">
              <div className="space-y-4">
                <h3 className="font-semibold flex items-center gap-2">
                  <User className="w-4 h-4 text-teal" />
                  Dados do Cliente Titular
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-gray-700">Selecionar Cliente</label>
                    <select
                      className="w-full h-10 rounded-md border border-gray-200 bg-white px-3 py-2 text-sm focus:ring-2 focus:ring-teal outline-none"
                      value={formData.clientUid}
                      onChange={(e) => {
                        const client = clients.find((c) => c.uid === e.target.value);
                        setFormData({
                          ...formData,
                          clientUid: e.target.value,
                          clientName: client?.displayName || client?.email || '',
                        });
                      }}
                    >
                      <option value="">Selecione um cliente...</option>
                      {clients.map((c) => (
                        <option key={c.uid} value={c.uid}>
                          {c.displayName || c.email} ({c.email})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-gray-700 flex items-center gap-1.5">
                      <UserCheck className="w-3.5 h-3.5 text-teal" />
                      Operador / Consultor Responsável
                    </label>
                    <select
                      className="w-full h-10 rounded-md border border-gray-200 bg-white px-3 py-2 text-sm focus:ring-2 focus:ring-teal outline-none"
                      value={formData.assignedEmployeeUid}
                      onChange={(e) => {
                        const emp = consultants.find((c) => c.uid === e.target.value);
                        setFormData({
                          ...formData,
                          assignedEmployeeUid: e.target.value,
                          assignedEmployeeName: emp?.displayName || '',
                        });
                      }}
                    >
                      <option value="">Utilizador atual ({profile?.displayName || 'Equipa'})</option>
                      {consultants.map((c) => (
                        <option key={c.uid} value={c.uid}>
                          {c.displayName}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <h3 className="font-semibold flex items-center gap-2">
                  <FileText className="w-4 h-4 text-teal" />
                  Serviço e Visto
                </h3>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-gray-700">Tipo de Visto / Serviço</label>
                  <select
                    className="w-full h-10 rounded-md border border-gray-200 bg-white px-3 py-2 text-sm focus:ring-2 focus:ring-teal outline-none"
                    value={formData.serviceId}
                    onChange={(e) => {
                      const service = services.find((s) => s.id === e.target.value);
                      setFormData({
                        ...formData,
                        serviceId: e.target.value,
                        serviceName: service?.name || '',
                        unitPrice: service?.price || 0,
                      });
                    }}
                  >
                    <option value="">Selecione um serviço...</option>
                    {services.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} - {formatCurrency(s.price)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Grupo Familiar no Mesmo Processo */}
              <div className="p-4 rounded-xl border border-gray-200 bg-gray-50/70 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-bold text-gray-900 flex items-center gap-1.5">
                      <Users className="w-4 h-4 text-teal" />
                      Grupo Familiar / Múltiplos Passageiros
                    </p>
                    <p className="text-xs text-gray-500">
                      Agrupe familiares que solicitam o mesmo serviço num único processo.
                    </p>
                  </div>
                  <div className="flex items-center gap-1 p-1 bg-white rounded-lg border border-gray-200">
                    <button
                      type="button"
                      onClick={() => setIsGroupProcess(false)}
                      className={cn(
                        'px-3 py-1 rounded text-xs font-bold',
                        !isGroupProcess ? 'bg-teal text-white' : 'text-gray-600'
                      )}
                    >
                      Individual
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setIsGroupProcess(true);
                        if (familyMembers.length === 0) handleAddFamilyMember();
                      }}
                      className={cn(
                        'px-3 py-1 rounded text-xs font-bold',
                        isGroupProcess ? 'bg-teal text-white' : 'text-gray-600'
                      )}
                    >
                      Grupo Familiar
                    </button>
                  </div>
                </div>

                {isGroupProcess && (
                  <div className="space-y-3 pt-3 border-t border-gray-200">
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-gray-600 uppercase">Nome do Grupo / Família</label>
                      <Input
                        placeholder="Ex: Família Mendes"
                        value={groupName}
                        onChange={(e) => setGroupName(e.target.value)}
                        className="h-9 bg-white text-xs"
                      />
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-gray-600">
                        Familiares Adicionais ({familyMembers.length}) + Titular ({activeMemberCount} pessoas)
                      </span>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={handleAddFamilyMember}
                        className="h-7 px-2.5 text-xs font-bold border-teal/30 text-teal gap-1"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        Adicionar Familiar
                      </Button>
                    </div>

                    <div className="space-y-2">
                      {familyMembers.map((m, idx) => (
                        <div key={m.id} className="p-2.5 rounded-lg bg-white border border-gray-200 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-[11px] font-bold text-teal uppercase">Membro #{idx + 1}</span>
                            <button
                              type="button"
                              onClick={() => handleRemoveFamilyMember(m.id)}
                              className="text-gray-400 hover:text-red-500"
                              aria-label="Remover familiar"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                            <Input
                              placeholder="Nome completo"
                              value={m.fullName}
                              onChange={(e) => handleUpdateFamilyMember(m.id, { fullName: e.target.value })}
                              className="h-8 text-xs"
                            />
                            <select
                              value={m.relationship}
                              onChange={(e) =>
                                handleUpdateFamilyMember(m.id, {
                                  relationship: e.target.value as ProcessGroupMember['relationship'],
                                })
                              }
                              className="h-8 rounded-md border border-gray-200 px-2 text-xs font-semibold"
                            >
                              {FAMILY_RELATIONSHIPS.filter((r) => r.id !== 'titular').map((rel) => (
                                <option key={rel.id} value={rel.id}>
                                  {rel.label}
                                </option>
                              ))}
                            </select>
                            <Input
                              placeholder="BI / Passaporte"
                              value={m.documentNumber || ''}
                              onChange={(e) => handleUpdateFamilyMember(m.id, { documentNumber: e.target.value })}
                              className="h-8 text-xs"
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-6 animate-in slide-in-from-right-4 duration-300">
              <div className="space-y-4">
                <h3 className="font-semibold flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-teal" />
                  Datas Importantes
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-gray-700">Levantamento de Documentos</label>
                    <Input
                      type="date"
                      value={formData.dates.documentPickup}
                      onChange={(e) =>
                        setFormData({ ...formData, dates: { ...formData.dates, documentPickup: e.target.value } })
                      }
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-gray-700">Agendamento (Entrevista)</label>
                    <Input
                      type="date"
                      value={formData.dates.appointment}
                      onChange={(e) =>
                        setFormData({ ...formData, dates: { ...formData.dates, appointment: e.target.value } })
                      }
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-gray-700">Data de Viagem</label>
                    <Input
                      type="date"
                      value={formData.dates.travel}
                      onChange={(e) =>
                        setFormData({ ...formData, dates: { ...formData.dates, travel: e.target.value } })
                      }
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-gray-700">Entrada na Embaixada/MIREX</label>
                    <Input
                      type="date"
                      value={formData.dates.embassySubmission}
                      onChange={(e) =>
                        setFormData({ ...formData, dates: { ...formData.dates, embassySubmission: e.target.value } })
                      }
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-6 animate-in slide-in-from-right-4 duration-300">
              <div className="p-4 rounded-xl bg-gray-50 border border-gray-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-bold uppercase text-gray-500">
                    Resumo Financeiro ({activeMemberCount} {activeMemberCount === 1 ? 'pessoa' : 'pessoas'})
                  </p>
                  <p className="text-2xl font-black text-teal tabular-nums">{formatCurrency(computedTotalPrice)}</p>
                </div>
                <div className="space-y-1 sm:w-52">
                  <label className="text-[11px] font-bold text-gray-500 uppercase">Ajustar Total Manual (Kz)</label>
                  <Input
                    type="number"
                    placeholder={String((formData.unitPrice || 0) * activeMemberCount)}
                    value={customTotalPriceOverride}
                    onChange={(e) => setCustomTotalPriceOverride(e.target.value)}
                    className="h-9 bg-white text-xs font-bold tabular-nums"
                  />
                </div>
              </div>

              <div className="space-y-4">
                <h3 className="font-semibold flex items-center gap-2">
                  <CreditCard className="w-4 h-4 text-teal" />
                  Modalidade de Pagamento
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, paymentType: 'full' })}
                    className={cn(
                      'p-4 rounded-xl border-2 text-left transition-all',
                      formData.paymentType === 'full' ? 'border-teal bg-teal-light/20' : 'border-gray-100 hover:border-gray-200'
                    )}
                  >
                    <div className="flex justify-between items-center mb-2">
                      <div className="w-10 h-10 rounded-full bg-teal-light flex items-center justify-center">
                        <Check className="w-5 h-5 text-teal" />
                      </div>
                      {formData.paymentType === 'full' && <Badge className="bg-teal">Selecionado</Badge>}
                    </div>
                    <p className="font-bold text-gray-900">Pagamento Completo</p>
                    <p className="text-xs text-gray-500 mt-1">
                      Valor total ({formatCurrency(computedTotalPrice)}) liquidado na abertura.
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setFormData({ ...formData, paymentType: 'installments' });
                      setInstallmentMode('half_50_50');
                      setInitialPaidAmount(String(Math.round(computedTotalPrice / 2)));
                    }}
                    className={cn(
                      'p-4 rounded-xl border-2 text-left transition-all',
                      formData.paymentType === 'installments'
                        ? 'border-teal bg-teal-light/20'
                        : 'border-gray-100 hover:border-gray-200'
                    )}
                  >
                    <div className="flex justify-between items-center mb-2">
                      <div className="w-10 h-10 rounded-full bg-orange-100 flex items-center justify-center">
                        <Clock className="w-5 h-5 text-orange-600" />
                      </div>
                      {formData.paymentType === 'installments' && <Badge className="bg-teal">Selecionado</Badge>}
                    </div>
                    <p className="font-bold text-gray-900">Pagamento Parcelado</p>
                    <p className="text-xs text-gray-500 mt-1">
                      Divide ao meio ({formatCurrency(Math.round(computedTotalPrice / 2))}) ou defina valor inicial.
                    </p>
                  </button>
                </div>
              </div>

              {formData.paymentType === 'installments' && (
                <div className="p-4 rounded-xl border border-teal/25 bg-teal-light/15 space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-bold text-teal-dark uppercase">
                      Divisão de Parcelas
                    </span>
                    <div className="flex gap-1 p-0.5 bg-white rounded-lg border border-gray-200">
                      <button
                        type="button"
                        onClick={() => {
                          setInstallmentMode('half_50_50');
                          setInitialPaidAmount(String(Math.round(computedTotalPrice / 2)));
                        }}
                        className={cn(
                          'px-3 py-1 rounded text-xs font-bold',
                          installmentMode === 'half_50_50' ? 'bg-teal text-white' : 'text-gray-600'
                        )}
                      >
                        Dividir ao Meio (50%)
                      </button>
                      <button
                        type="button"
                        onClick={() => setInstallmentMode('custom')}
                        className={cn(
                          'px-3 py-1 rounded text-xs font-bold',
                          installmentMode === 'custom' ? 'bg-teal text-white' : 'text-gray-600'
                        )}
                      >
                        Outro Valor Inicial
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-gray-700 uppercase">Valor Pago Inicialmente (Kz)</label>
                      <Input
                        type="number"
                        min={0}
                        max={computedTotalPrice}
                        value={initialPaidAmount}
                        onChange={(e) => {
                          setInstallmentMode('custom');
                          setInitialPaidAmount(e.target.value);
                        }}
                        className="h-10 bg-white text-sm font-bold tabular-nums"
                      />
                      <p className="text-xs text-gray-600 tabular-nums">
                        Saldo Restante:{' '}
                        <strong className="text-gray-900">
                          {formatCurrency(Math.max(0, computedTotalPrice - (Number(initialPaidAmount) || 0)))}
                        </strong>
                      </p>
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs font-bold text-gray-700 uppercase">Forma de Pagamento</label>
                      <select
                        value={paymentMethod}
                        onChange={(e) => setPaymentMethod(e.target.value)}
                        className="w-full h-10 rounded-md border border-gray-200 bg-white px-3 text-sm font-semibold"
                      >
                        {PAYMENT_METHODS.map((m) => (
                          <option key={m} value={m}>
                            {m}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {formData.paymentType === 'full' && (
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-gray-600 uppercase">Forma de Pagamento</label>
                    <select
                      value={paymentMethod}
                      onChange={(e) => setPaymentMethod(e.target.value)}
                      className="w-full h-10 rounded-md border border-gray-200 bg-white px-3 text-sm font-semibold"
                    >
                      {PAYMENT_METHODS.map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div className={cn('space-y-1.5', formData.paymentType === 'installments' ? 'sm:col-span-2' : '')}>
                  <label className="text-xs font-bold text-gray-600 uppercase flex items-center gap-1.5">
                    <Upload className="w-3.5 h-3.5 text-teal" />
                    Comprovativo de Pagamento (Opcional)
                  </label>
                  <Input
                    type="file"
                    accept="image/*,.pdf"
                    onChange={(e) => setProofFile(e.target.files?.[0] || null)}
                    className="h-10 bg-gray-50 text-xs file:mr-2 file:py-1 file:px-2.5 file:rounded file:border-0 file:text-xs file:font-bold file:bg-teal-light file:text-teal"
                  />
                  {proofFile && (
                    <p className="text-xs text-emerald-700 font-semibold">Ficheiro pronto: {proofFile.name}</p>
                  )}
                </div>
              </div>
            </div>
          )}
        </CardContent>

        <div className="flex items-center justify-between p-6 border-t border-gray-100 bg-gray-50/50 rounded-b-xl shrink-0">
          <Button variant="ghost" onClick={() => (step > 1 ? setStep(step - 1) : onClose())} disabled={loading}>
            {step === 1 ? (
              'Cancelar'
            ) : (
              <>
                <ChevronLeft className="w-4 h-4 mr-2" /> Voltar
              </>
            )}
          </Button>

          <div className="flex gap-2">
            {step < 3 ? (
              <Button
                onClick={() => setStep(step + 1)}
                className="bg-teal hover:bg-teal-dark text-white"
                disabled={step === 1 && (!formData.clientUid || !formData.serviceId)}
              >
                Próximo <ChevronRight className="w-4 h-4 ml-2" />
              </Button>
            ) : (
              <Button onClick={handleCreateProcess} className="bg-teal hover:bg-teal-dark text-white" disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Criando...
                  </>
                ) : (
                  'Criar Processo'
                )}
              </Button>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}
