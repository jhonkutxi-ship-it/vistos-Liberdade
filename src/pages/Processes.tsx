/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  collection,
  onSnapshot,
  query,
  where,
  orderBy,
  updateDoc,
  doc,
  serverTimestamp,
  setDoc,
  getDoc,
  deleteDoc,
} from 'firebase/firestore';
import { db, OperationType, handleFirestoreError } from '@/src/firebase';
import { useAuth } from '@/src/hooks/useAuth';
import { useCompanySettings } from '@/src/hooks/useCompanySettings';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/src/components/ui/Card';
import { Badge } from '@/src/components/ui/Badge';
import { Button } from '@/src/components/ui/Button';
import { Input } from '@/src/components/ui/Input';
import {
  Search,
  FileText,
  User,
  Download,
  Upload,
  CheckCircle2,
  XCircle,
  Plus,
  Bell,
  Trash2,
  Check,
  Loader2,
  Plane,
  History,
  Files,
  CalendarDays,
  ClipboardList,
  Eye,
  AlertCircle,
  MessageCircle,
  Save,
  Star,
  ThumbsUp,
  Lock,
  Receipt,
  UserCheck,
  Users,
  CreditCard,
} from 'lucide-react';
import {
  PROCESS_STATUSES,
  DOCUMENT_CATEGORIES,
  PAYMENT_METHODS,
  FAMILY_RELATIONSHIPS,
} from '@/src/constants';
import { cn } from '@/src/lib/utils';
import {
  TravelProcess,
  ProcessReminder,
  ProcessDocument,
  DocumentCategory,
  Invoice,
  ClientProfile,
  ConsultantProfile,
  ServiceReview,
  ProcessGroupMember,
  PaymentRecord,
} from '@/src/types';
import { NewProcessModal } from '@/src/components/NewProcessModal';
import { DocumentViewerModal } from '@/src/components/DocumentViewerModal';
import { ReceiptModal } from '@/src/components/ReceiptModal';
import { processUploadedFile, downloadFileFromUrlOrData, formatFileSize } from '@/src/utils/fileHelpers';

export function Processes() {
  const { profile, user, hasPermission } = useAuth();
  const { company } = useCompanySettings();
  const isStaff = profile?.role === 'admin' || profile?.role === 'employee';
  const canManageProcesses = isStaff && hasPermission('manage_processes');
  const canApproveProcesses = isStaff && hasPermission('approve_processes');
  const canManageDocs = hasPermission('manage_documents') || !isStaff;
  const canValidateDocs = isStaff && hasPermission('validate_documents');
  const canIssueReceipts = isStaff && hasPermission('issue_receipts');

  const [searchParams, setSearchParams] = useSearchParams();
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState('Todos');
  const [selectedProcessId, setSelectedProcessId] = useState<string | null>(null);
  const [reminderTitle, setReminderTitle] = useState('');
  const [reminderDate, setReminderDate] = useState('');
  const [processes, setProcesses] = useState<TravelProcess[]>([]);
  const [loading, setLoading] = useState(true);
  const [isNewProcessModalOpen, setIsNewProcessModalOpen] = useState(false);
  const [documents, setDocuments] = useState<ProcessDocument[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [consultants, setConsultants] = useState<ConsultantProfile[]>([]);
  const [existingReview, setExistingReview] = useState<ServiceReview | null>(null);
  const [uploadingCategory, setUploadingCategory] = useState<DocumentCategory | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [viewerDoc, setViewerDoc] = useState<ProcessDocument | null>(null);
  const [viewerProtected, setViewerProtected] = useState(false);
  const [activeReceipt, setActiveReceipt] = useState<Invoice | null>(null);
  const [clientProfile, setClientProfile] = useState<ClientProfile | null>(null);
  const [savingProcess, setSavingProcess] = useState(false);

  // Client evaluation form state
  const [reviewStars, setReviewStars] = useState(5);
  const [reviewRecommend, setReviewRecommend] = useState(true);
  const [reviewComment, setReviewComment] = useState('');
  const [reviewEmployeeUid, setReviewEmployeeUid] = useState('');
  const [submittingReview, setSubmittingReview] = useState(false);
  const [transferReference, setTransferReference] = useState('');

  // Process & Document delete + payment registration modals
  const [processToDelete, setProcessToDelete] = useState<TravelProcess | null>(null);
  const [deletingProcess, setDeletingProcess] = useState(false);
  const [docIdToDelete, setDocIdToDelete] = useState<string | null>(null);

  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [installmentAmountInput, setInstallmentAmountInput] = useState('');
  const [installmentMethodInput, setInstallmentMethodInput] = useState<string>(PAYMENT_METHODS[0]);
  const [installmentNoteInput, setInstallmentNoteInput] = useState('');
  const [installmentProofFile, setInstallmentProofFile] = useState<File | null>(null);
  const [savingPayment, setSavingPayment] = useState(false);

  // Add family member inline state (for staff)
  const [newMemberOpen, setNewMemberOpen] = useState(false);
  const [newMemberName, setNewMemberName] = useState('');
  const [newMemberRel, setNewMemberRel] = useState<ProcessGroupMember['relationship']>('conjuge');
  const [newMemberDoc, setNewMemberDoc] = useState('');

  // Editable process dates/status state
  const [editDatesOpen, setEditDatesOpen] = useState(false);
  const [datesDraft, setDatesDraft] = useState({
    documentPickup: '',
    appointment: '',
    embassySubmission: '',
    travel: '',
  });

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const pendingCategoryRef = useRef<DocumentCategory>('personal');

  useEffect(() => {
    if (searchParams.get('new') === '1' && isStaff) {
      setIsNewProcessModalOpen(true);
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, isStaff, setSearchParams]);

  useEffect(() => {
    if (!user) return;

    const q = isStaff
      ? query(collection(db, 'processes'), orderBy('createdAt', 'desc'))
      : query(collection(db, 'processes'), where('clientUid', '==', user.uid));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const processesData = snapshot.docs.map((d) => ({
          ...d.data(),
          id: d.id,
          createdAt: d.data().createdAt?.toDate?.()?.toISOString() || d.data().createdAt || new Date().toISOString(),
          updatedAt: d.data().updatedAt?.toDate?.()?.toISOString() || d.data().updatedAt || new Date().toISOString(),
        })) as TravelProcess[];

        processesData.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

        setProcesses(processesData);
        if (processesData.length > 0 && !selectedProcessId) {
          setSelectedProcessId(processesData[0].id);
        }
        setLoading(false);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, 'processes');
        setLoading(false);
      }
    );

    const unsubConsultants = onSnapshot(collection(db, 'consultants'), (snap) => {
      setConsultants(
        snap.docs
          .map((d) => ({ ...d.data(), uid: d.id }) as ConsultantProfile)
          .filter((c) => c.active !== false)
      );
    });

    return () => {
      unsubscribe();
      unsubConsultants();
    };
  }, [user, isStaff]);

  const selectedProcess = processes.find((p) => p.id === selectedProcessId) || null;
  const isProcessPaymentConfirmed = (proc: TravelProcess) => {
    if (typeof proc.paymentConfirmed === 'boolean') return proc.paymentConfirmed;
    return proc.paymentStatus === 'paid' || proc.paymentStatus === 'partially_paid';
  };
  const selectedPaymentConfirmed = selectedProcess ? isProcessPaymentConfirmed(selectedProcess) : false;

  useEffect(() => {
    if (!selectedProcess) return;
    setDatesDraft({
      documentPickup: selectedProcess.dates?.documentPickup || '',
      appointment: selectedProcess.dates?.appointment || '',
      embassySubmission: selectedProcess.dates?.embassySubmission || '',
      travel: selectedProcess.dates?.travel || '',
    });
  }, [selectedProcess?.id]);

  useEffect(() => {
    if (!selectedProcessId) return;

    const qDocs = query(collection(db, 'documents'), where('processId', '==', selectedProcessId));
    const unsubDocs = onSnapshot(qDocs, (snapshot) => {
      const list = snapshot.docs.map((d) => ({
        ...d.data(),
        id: d.id,
        createdAt: d.data().createdAt?.toDate?.()?.toISOString() || d.data().createdAt || new Date().toISOString(),
      })) as ProcessDocument[];
      list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setDocuments(list);
    });

    const qInv = query(collection(db, 'invoices'), where('processId', '==', selectedProcessId));
    const unsubInv = onSnapshot(qInv, (snapshot) => {
      setInvoices(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })) as Invoice[]);
    });

    const unsubReview = onSnapshot(doc(db, 'service_reviews', selectedProcessId), (snap) => {
      if (snap.exists()) {
        setExistingReview({ ...(snap.data() as ServiceReview), id: snap.id });
      } else {
        setExistingReview(null);
      }
    });

    let unsubClient: (() => void) | undefined;
    if (selectedProcess?.clientUid) {
      const qClient = query(collection(db, 'clients'), where('uid', '==', selectedProcess.clientUid));
      unsubClient = onSnapshot(qClient, (snapshot) => {
        if (!snapshot.empty) {
          setClientProfile(snapshot.docs[0].data() as ClientProfile);
        } else {
          setClientProfile(null);
        }
      });
    }

    return () => {
      unsubDocs();
      unsubInv();
      unsubReview();
      unsubClient?.();
    };
  }, [selectedProcessId, selectedProcess?.clientUid]);

  const filteredProcesses = useMemo(() => {
    const searchLower = searchTerm.toLowerCase().trim();

    return processes.filter((p) => {
      const matchesSearch =
        p.id.toLowerCase().includes(searchLower) ||
        (p.clientName || '').toLowerCase().includes(searchLower) ||
        (p.serviceName || '').toLowerCase().includes(searchLower);

      const matchesTab =
        activeTab === 'Todos' ||
        (activeTab === 'Pendentes' && p.status === 'pending') ||
        (activeTab === 'Em Revisão' && p.status === 'in-review') ||
        (activeTab === 'Aprovados' && p.status === 'approved') ||
        (activeTab === 'Rejeitados' && p.status === 'rejected');

      return matchesSearch && matchesTab;
    });
  }, [processes, searchTerm, activeTab]);

  const handleUpdateProcessStatus = async (status: TravelProcess['status'], progress?: number) => {
    if (!selectedProcess) return;
    setSavingProcess(true);
    const autoProgress =
      progress !== undefined
        ? progress
        : status === 'approved'
        ? 100
        : status === 'in-review'
        ? 60
        : status === 'rejected'
        ? 100
        : 20;

    try {
      await updateDoc(doc(db, 'processes', selectedProcess.id), {
        status,
        progress: autoProgress,
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `processes/${selectedProcess.id}`);
    } finally {
      setSavingProcess(false);
    }
  };

  const handleSaveDates = async () => {
    if (!selectedProcess) return;
    setSavingProcess(true);
    try {
      await updateDoc(doc(db, 'processes', selectedProcess.id), {
        dates: datesDraft,
        updatedAt: serverTimestamp(),
      });
      setEditDatesOpen(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `processes/${selectedProcess.id}`);
    } finally {
      setSavingProcess(false);
    }
  };

  const handleAddReminder = async () => {
    if (!selectedProcessId || !reminderTitle || !reminderDate || !selectedProcess) return;

    const newReminder: ProcessReminder = {
      id: Math.random().toString(36).substring(2, 11),
      title: reminderTitle,
      date: reminderDate,
      type: 'embassy',
      completed: false,
    };

    try {
      await updateDoc(doc(db, 'processes', selectedProcessId), {
        reminders: [...(selectedProcess.reminders || []), newReminder],
        updatedAt: serverTimestamp(),
      });
      setReminderTitle('');
      setReminderDate('');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `processes/${selectedProcessId}`);
    }
  };

  const toggleReminder = async (processId: string, reminderId: string) => {
    const process = processes.find((p) => p.id === processId);
    if (!process) return;

    try {
      const updatedReminders = process.reminders?.map((r) =>
        r.id === reminderId ? { ...r, completed: !r.completed } : r
      );
      await updateDoc(doc(db, 'processes', processId), {
        reminders: updatedReminders,
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `processes/${processId}`);
    }
  };

  const deleteReminder = async (processId: string, reminderId: string) => {
    const process = processes.find((p) => p.id === processId);
    if (!process) return;

    try {
      const updatedReminders = process.reminders?.filter((r) => r.id !== reminderId);
      await updateDoc(doc(db, 'processes', processId), {
        reminders: updatedReminders,
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `processes/${processId}`);
    }
  };

  const triggerFileUpload = (category: DocumentCategory) => {
    setUploadError(null);
    pendingCategoryRef.current = category;
    fileInputRef.current?.click();
  };

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !selectedProcess) return;

    const category = pendingCategoryRef.current;
    setUploadingCategory(category);
    setUploadError(null);

    try {
      const processed = await processUploadedFile(file);
      const docRef = doc(collection(db, 'documents'));
      const catLabel = DOCUMENT_CATEGORIES.find((c) => c.id === category)?.label || 'Documento';

      const isStaffIssuedDoc = isStaff && category === 'agency_issued';
      const docMeta = {
        id: docRef.id,
        processId: selectedProcess.id,
        clientUid: selectedProcess.clientUid,
        name: `${catLabel} - ${processed.fileName}`,
        fileName: processed.fileName,
        mimeType: processed.mimeType,
        fileSize: processed.fileSize,
        hasFileContent: true,
        isAgencyIssued: isStaffIssuedDoc,
        url: `firestore://document_files/${docRef.id}`,
        category,
        status: isStaffIssuedDoc ? 'verified' : 'uploaded',
        uploadedBy: user?.uid || profile?.uid || '',
        createdAt: serverTimestamp(),
      };

      await setDoc(doc(db, 'document_files', docRef.id), {
        docId: docRef.id,
        processId: selectedProcess.id,
        clientUid: selectedProcess.clientUid,
        uploadedBy: user?.uid || profile?.uid || '',
        dataUrl: processed.dataUrl,
        fileName: processed.fileName,
        mimeType: processed.mimeType,
        fileSize: processed.fileSize,
        createdAt: serverTimestamp(),
      });

      await setDoc(docRef, docMeta);
    } catch (err: any) {
      setUploadError(err?.message || 'Erro ao carregar documento.');
    } finally {
      setUploadingCategory(null);
    }
  };

  const handleDownloadDocument = async (item: ProcessDocument) => {
    try {
      let url = item.url;
      if (item.hasFileContent) {
        const snap = await getDoc(doc(db, 'document_files', item.id));
        if (snap.exists()) {
          url = snap.data().dataUrl;
        }
      }
      const fallbackName = item.fileName || `${item.name.replace(/\s+/g, '_')}.pdf`;
      downloadFileFromUrlOrData(url, fallbackName);
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, `document_files/${item.id}`);
    }
  };

  const handleUpdateDocumentStatus = async (docId: string, status: 'verified' | 'rejected') => {
    try {
      await updateDoc(doc(db, 'documents', docId), { status });
      if (viewerDoc?.id === docId) {
        setViewerDoc({ ...viewerDoc, status });
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `documents/${docId}`);
    }
  };

  const handleDeleteDocument = async () => {
    if (!docIdToDelete) return;
    try {
      await deleteDoc(doc(db, 'documents', docIdToDelete));
      await deleteDoc(doc(db, 'document_files', docIdToDelete)).catch(() => {});
      setDocIdToDelete(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `documents/${docIdToDelete}`);
    }
  };

  const handleConfirmOperatorPayment = async () => {
    if (!selectedProcess || !isStaff) return;
    setSavingProcess(true);
    try {
      const total = selectedProcess.price || 0;
      const alreadyPaid = selectedProcess.paidAmount ?? 0;
      const nextPaid = alreadyPaid > 0 ? alreadyPaid : total;
      const nextRemaining = Math.max(0, total - nextPaid);
      const nextStatus: TravelProcess['paymentStatus'] =
        total > 0 && nextPaid >= total ? 'paid' : nextPaid > 0 ? 'partially_paid' : 'paid';

      await updateDoc(doc(db, 'processes', selectedProcess.id), {
        paymentConfirmed: true,
        paymentConfirmedAt: new Date().toISOString(),
        paymentConfirmedBy: user?.uid || profile?.uid || '',
        paymentStatus: nextStatus,
        paidAmount: nextPaid,
        remainingAmount: nextRemaining,
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `processes/${selectedProcess.id}`);
    } finally {
      setSavingProcess(false);
    }
  };

  const handleOpenOrCreateReceipt = async () => {
    if (!selectedProcess) return;
    if (!isStaff && !isProcessPaymentConfirmed(selectedProcess)) return;

    if (invoices.length > 0) {
      setActiveReceipt(invoices[0]);
      return;
    }

    if (!isStaff) {
      // Client read-only preview from process details before staff formally issues invoice
      const previewInvoice: Invoice = {
        id: `RES-${selectedProcess.id.substring(0, 6)}`,
        processId: selectedProcess.id,
        clientUid: selectedProcess.clientUid,
        clientName: selectedProcess.clientName || profile?.displayName || 'Cliente',
        clientPhone: clientProfile?.phone || '',
        clientDocument: clientProfile?.passportNumber || '',
        amount: selectedProcess.price || 0,
        items: [
          {
            description: selectedProcess.serviceName || 'Serviço de Visto',
            quantity: 1,
            price: selectedProcess.price || 0,
          },
        ],
        dueDate: new Date().toISOString(),
        status: selectedProcess.paymentStatus === 'paid' ? 'paid' : 'pending',
        type: selectedProcess.paymentStatus === 'paid' ? 'recibo' : 'fatura',
        createdAt: selectedProcess.createdAt || new Date().toISOString(),
      };
      setActiveReceipt(previewInvoice);
      return;
    }

    setSavingProcess(true);
    try {
      const docRef = doc(collection(db, 'invoices'));
      const newInvoiceData: Invoice = {
        id: docRef.id,
        processId: selectedProcess.id,
        clientUid: selectedProcess.clientUid,
        clientName: selectedProcess.clientName || 'Cliente',
        clientPhone: clientProfile?.phone || '',
        clientDocument: clientProfile?.passportNumber || '',
        amount: selectedProcess.price || 0,
        items: [
          {
            description: selectedProcess.serviceName || 'Serviço de Visto',
            quantity: 1,
            price: selectedProcess.price || 0,
          },
        ],
        dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        status: selectedProcess.paymentStatus === 'paid' ? 'paid' : 'pending',
        type: selectedProcess.paymentStatus === 'paid' ? 'recibo' : 'fatura',
        createdAt: new Date().toISOString(),
      };

      await setDoc(docRef, newInvoiceData);
      setActiveReceipt(newInvoiceData);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'invoices');
    } finally {
      setSavingProcess(false);
    }
  };

  const handleSendPaymentProofWhatsApp = () => {
    if (!selectedProcess) return;
    const raw = (company.phone || '+244929115055').split('/')[0].replace(/[^\d]/g, '');
    const phone = raw.startsWith('244') ? raw : raw.length === 9 ? '244' + raw : raw;
    const msg = [
      `*COMPROVATIVO DE PAGAMENTO - ${company.name}*`,
      `Processo: ${selectedProcess.id}`,
      `Cliente: ${selectedProcess.clientName || profile?.displayName || 'Cliente'}`,
      `Serviço: ${selectedProcess.serviceName || 'Assessoria'}`,
      `Valor do Serviço: ${formatCurrency(selectedProcess.price || 0)}`,
      transferReference.trim() ? `Referência / Observação: ${transferReference.trim()}` : '',
      `Segue em anexo o comprovativo da transferência/pagamento efetuado.`,
    ]
      .filter(Boolean)
      .join('\n');
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, '_blank', 'noopener,noreferrer');
  };

  const handleSubmitReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProcess || !user) return;
    setSubmittingReview(true);

    const chosenEmpUid = selectedProcess.assignedEmployeeUid || reviewEmployeeUid || consultants[0]?.uid || 'equipa';
    const chosenEmpName =
      selectedProcess.assignedEmployeeName ||
      consultants.find((c) => c.uid === chosenEmpUid)?.displayName ||
      'Equipa Vistos Liberdade';

    const reviewPayload: ServiceReview = {
      id: selectedProcess.id,
      processId: selectedProcess.id,
      clientUid: user.uid,
      clientName: profile?.displayName || selectedProcess.clientName || 'Cliente',
      employeeUid: chosenEmpUid,
      employeeName: chosenEmpName,
      serviceId: selectedProcess.serviceId,
      serviceName: selectedProcess.serviceName,
      rating: reviewStars,
      recommend: reviewRecommend,
      comment: reviewComment.trim(),
      createdAt: new Date().toISOString(),
    };

    try {
      await setDoc(doc(db, 'service_reviews', selectedProcess.id), {
        ...reviewPayload,
        createdAt: serverTimestamp(),
      });
      await updateDoc(doc(db, 'processes', selectedProcess.id), {
        reviewed: true,
        rating: reviewStars,
        recommended: reviewRecommend,
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `service_reviews/${selectedProcess.id}`);
    } finally {
      setSubmittingReview(false);
    }
  };

  const handleConfirmDeleteProcess = async () => {
    if (!processToDelete) return;
    setDeletingProcess(true);
    try {
      const targetId = processToDelete.id;
      await deleteDoc(doc(db, 'processes', targetId));

      // Best-effort cleanup of linked documents in currently loaded view
      if (selectedProcessId === targetId) {
        await Promise.all(
          documents.map(async (d) => {
            await deleteDoc(doc(db, 'documents', d.id)).catch(() => {});
            await deleteDoc(doc(db, 'document_files', d.id)).catch(() => {});
          })
        );
        const remaining = processes.filter((p) => p.id !== targetId);
        setSelectedProcessId(remaining[0]?.id || null);
      }

      setProcessToDelete(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `processes/${processToDelete.id}`);
    } finally {
      setDeletingProcess(false);
    }
  };

  const openPaymentModal = () => {
    if (!selectedProcess) return;
    const total = selectedProcess.price || 0;
    const alreadyPaid =
      selectedProcess.paidAmount ??
      (selectedProcess.paymentStatus === 'paid'
        ? total
        : selectedProcess.paymentStatus === 'partially_paid'
        ? Math.round(total / 2)
        : 0);
    const remaining = Math.max(0, total - alreadyPaid);
    const suggested = remaining > 0 ? (alreadyPaid === 0 && selectedProcess.paymentType === 'installments' ? Math.round(total / 2) : remaining) : 0;

    setInstallmentAmountInput(String(suggested));
    setInstallmentMethodInput(selectedProcess.paymentMethod || PAYMENT_METHODS[0]);
    setInstallmentNoteInput('');
    setInstallmentProofFile(null);
    setPaymentModalOpen(true);
  };

  const handleSaveInstallmentPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProcess) return;
    setSavingPayment(true);
    try {
      const total = selectedProcess.price || 0;
      const alreadyPaid =
        selectedProcess.paidAmount ??
        (selectedProcess.paymentStatus === 'paid'
          ? total
          : selectedProcess.paymentStatus === 'partially_paid'
          ? Math.round(total / 2)
          : 0);
      const addAmount = Math.max(0, Number(installmentAmountInput) || 0);
      const nextPaid = Math.min(total > 0 ? total : alreadyPaid + addAmount, alreadyPaid + addAmount);
      const nextRemaining = Math.max(0, total - nextPaid);
      const nextStatus: TravelProcess['paymentStatus'] =
        total > 0 && nextPaid >= total ? 'paid' : nextPaid > 0 ? 'partially_paid' : 'pending';

      let uploadedProofId: string | undefined;
      if (installmentProofFile) {
        const processed = await processUploadedFile(installmentProofFile);
        const fileDocRef = doc(collection(db, 'documents'));
        uploadedProofId = fileDocRef.id;

        await setDoc(doc(db, 'document_files', fileDocRef.id), {
          docId: fileDocRef.id,
          processId: selectedProcess.id,
          clientUid: selectedProcess.clientUid,
          uploadedBy: user?.uid || profile?.uid || '',
          dataUrl: processed.dataUrl,
          fileName: processed.fileName,
          mimeType: processed.mimeType,
          fileSize: processed.fileSize,
          createdAt: serverTimestamp(),
        });

        await setDoc(fileDocRef, {
          id: fileDocRef.id,
          processId: selectedProcess.id,
          clientUid: selectedProcess.clientUid,
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

      const newRecord: PaymentRecord = {
        id: `pay-${Date.now()}`,
        amount: addAmount,
        method: installmentMethodInput,
        date: new Date().toISOString(),
        note: installmentNoteInput.trim() || 'Pagamento registado no processo',
        ...(uploadedProofId ? { proofDocId: uploadedProofId } : {}),
        recordedBy: user?.uid || profile?.uid || '',
      };

      const nextHistory = [...(selectedProcess.paymentHistory || []), newRecord];

      await updateDoc(doc(db, 'processes', selectedProcess.id), {
        paidAmount: nextPaid,
        remainingAmount: nextRemaining,
        paymentMethod: installmentMethodInput,
        paymentStatus: nextStatus,
        paymentConfirmed: true,
        paymentConfirmedAt: new Date().toISOString(),
        paymentConfirmedBy: user?.uid || profile?.uid || '',
        paymentHistory: nextHistory,
        updatedAt: serverTimestamp(),
      });

      if (addAmount > 0 && isStaff) {
        const transRef = doc(collection(db, 'financial_transactions'));
        await setDoc(transRef, {
          id: transRef.id,
          type: 'income',
          category: 'Vistos & Assessoria',
          amount: addAmount,
          date: new Date().toISOString().slice(0, 10),
          description: `Parcela (${selectedProcess.id}) · ${selectedProcess.serviceName} - ${selectedProcess.clientName}`,
          relatedTo: selectedProcess.id,
          status: 'completed',
          paymentMethod: installmentMethodInput,
          createdAt: serverTimestamp(),
        }).catch(() => {});
      }

      setPaymentModalOpen(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `processes/${selectedProcess.id}`);
    } finally {
      setSavingPayment(false);
    }
  };

  const handleAddMemberToProcess = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProcess || !newMemberName.trim()) return;
    setSavingProcess(true);
    try {
      const existingMembers: ProcessGroupMember[] =
        selectedProcess.groupMembers && selectedProcess.groupMembers.length > 0
          ? selectedProcess.groupMembers
          : [
              {
                id: 'titular-0',
                fullName: selectedProcess.clientName || 'Titular',
                relationship: 'titular',
              },
            ];
      const nextMembers: ProcessGroupMember[] = [
        ...existingMembers,
        {
          id: Math.random().toString(36).substring(2, 10),
          fullName: newMemberName.trim(),
          relationship: newMemberRel,
          documentNumber: newMemberDoc.trim(),
        },
      ];
      await updateDoc(doc(db, 'processes', selectedProcess.id), {
        isGroupProcess: true,
        groupName: selectedProcess.groupName || `Grupo Familiar · ${selectedProcess.clientName || 'Cliente'}`,
        groupMembers: nextMembers,
        memberCount: nextMembers.length,
        updatedAt: serverTimestamp(),
      });
      setNewMemberName('');
      setNewMemberDoc('');
      setNewMemberOpen(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `processes/${selectedProcess.id}`);
    } finally {
      setSavingProcess(false);
    }
  };

  const handleRemoveMemberFromProcess = async (memberId: string) => {
    if (!selectedProcess || !selectedProcess.groupMembers) return;
    const nextMembers = selectedProcess.groupMembers.filter((m) => m.id !== memberId);
    try {
      await updateDoc(doc(db, 'processes', selectedProcess.id), {
        groupMembers: nextMembers,
        memberCount: Math.max(1, nextMembers.length),
        isGroupProcess: nextMembers.length > 1,
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `processes/${selectedProcess.id}`);
    }
  };

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('pt-AO', { style: 'currency', currency: 'AOA' }).format(val);
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,.pdf,.doc,.docx"
        className="hidden"
        onChange={handleFileSelected}
      />

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 bg-teal rounded-2xl flex items-center justify-center text-white shadow-xl shadow-teal/20">
            <ClipboardList className="w-8 h-8" />
          </div>
          <div>
            <h1 className="text-3xl font-black text-gray-900 tracking-tight font-display">Processos de Vistos</h1>
            <p className="text-gray-500 font-medium">
              Gestão completa de processos, documentos reais, recibos e acompanhamento em tempo real.
            </p>
          </div>
        </div>
        {canManageProcesses && (
          <Button
            onClick={() => setIsNewProcessModalOpen(true)}
            className="bg-teal hover:bg-teal-dark text-white gap-2 shadow-xl shadow-teal/20 h-12 px-8 font-black rounded-2xl uppercase text-xs tracking-widest"
          >
            <Plus className="w-5 h-5" />
            Novo Processo
          </Button>
        )}
      </div>

      <NewProcessModal
        isOpen={isNewProcessModalOpen}
        onClose={() => setIsNewProcessModalOpen(false)}
        onSuccess={() => {}}
      />

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        {/* Left List */}
        <div className="lg:col-span-1 space-y-6">
          <Card className="shadow-sm border border-gray-200 rounded-2xl bg-white overflow-hidden">
            <CardHeader className="p-4 pb-2">
              <div className="relative group">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <Input
                  placeholder="Nome, ID ou Serviço..."
                  className="pl-10 bg-gray-50 border-gray-200 h-10 rounded-xl"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
            </CardHeader>
            <CardContent className="p-3 space-y-1">
              {['Todos', 'Pendentes', 'Em Revisão', 'Aprovados', 'Rejeitados'].map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setActiveTab(tab)}
                  className={cn(
                    'w-full flex items-center justify-between px-4 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider transition-all',
                    activeTab === tab ? 'bg-teal text-white shadow-sm' : 'text-gray-500 hover:bg-teal-light hover:text-teal'
                  )}
                >
                  <span>{tab}</span>
                </button>
              ))}
            </CardContent>
          </Card>

          <div className="space-y-3 max-h-[600px] overflow-y-auto pr-1">
            {loading ? (
              <div className="p-8 text-center text-gray-400 text-sm">A carregar processos...</div>
            ) : (
              filteredProcesses.map((process) => (
                <div
                  key={process.id}
                  onClick={() => setSelectedProcessId(process.id)}
                  className={cn(
                    'p-4 rounded-2xl border transition-all cursor-pointer group',
                    selectedProcessId === process.id
                      ? 'bg-teal-light/30 border-teal shadow-sm'
                      : 'bg-white border-gray-200 hover:border-teal/40'
                  )}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span
                      className={cn(
                        'text-[10px] font-black uppercase px-2.5 py-0.5 rounded-md',
                        process.status === 'approved'
                          ? 'bg-emerald-100 text-emerald-800'
                          : process.status === 'rejected'
                          ? 'bg-red-100 text-red-800'
                          : process.status === 'in-review'
                          ? 'bg-teal-light text-teal-dark'
                          : 'bg-amber-100 text-amber-800'
                      )}
                    >
                      {PROCESS_STATUSES.find((s) => s.id === process.status)?.label}
                    </span>
                    <span className="text-[10px] text-gray-400 font-mono">{process.id.substring(0, 8)}</span>
                  </div>
                  <h3 className="text-sm font-bold text-gray-900 group-hover:text-teal truncate">
                    {process.serviceName}
                  </h3>
                  <div className="flex items-center gap-2 mt-1.5">
                    <User className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                    <span className="text-xs font-medium text-gray-600 truncate">
                      {process.clientName}
                      {process.isGroupProcess ? ` · Grupo (${process.memberCount || process.groupMembers?.length || 2})` : ''}
                    </span>
                  </div>
                  <div className="mt-3 flex items-center gap-2">
                    <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full bg-teal transition-all duration-500" style={{ width: `${process.progress}%` }} />
                    </div>
                    <span className="text-[10px] font-bold text-gray-500 tabular-nums">{process.progress}%</span>
                  </div>
                </div>
              ))
            )}
            {!loading && filteredProcesses.length === 0 && (
              <div className="p-8 text-center text-gray-400 text-sm bg-white rounded-2xl border border-gray-200">
                Nenhum processo encontrado.
              </div>
            )}
          </div>
        </div>

        {/* Right Details */}
        <div className="lg:col-span-3 space-y-6">
          {selectedProcess ? (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card className="md:col-span-2 shadow-sm border border-gray-200 rounded-2xl bg-white overflow-hidden">
                  <CardHeader className="p-6 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                      <div className="w-14 h-14 bg-teal-light rounded-2xl flex items-center justify-center text-teal shrink-0">
                        <Plane className="w-7 h-7" />
                      </div>
                      <div>
                        <CardTitle className="text-2xl font-black text-gray-900">{selectedProcess.serviceName}</CardTitle>
                        <div className="flex flex-wrap items-center gap-2 mt-1 text-xs text-gray-500">
                          <span className="font-bold text-gray-700">{selectedProcess.clientName}</span>
                          <span>·</span>
                          <span>{selectedProcess.paymentType === 'full' ? 'Pagamento Completo' : 'Pagamento Parcelado'}</span>
                          <span>·</span>
                          <span>Iniciado em {new Date(selectedProcess.createdAt).toLocaleDateString('pt-AO')}</span>
                        </div>
                      </div>
                    </div>

                    {canManageProcesses && (
                      <div className="flex items-center gap-2 flex-wrap">
                        <select
                          aria-label="Estado do Processo"
                          value={selectedProcess.status}
                          disabled={savingProcess || (!canApproveProcesses && (selectedProcess.status === 'approved' || selectedProcess.status === 'rejected'))}
                          onChange={(e) => handleUpdateProcessStatus(e.target.value as TravelProcess['status'])}
                          className="h-9 rounded-lg border border-gray-200 bg-gray-50 px-3 text-xs font-bold text-gray-800"
                        >
                          <option value="pending">Pendente (20%)</option>
                          <option value="in-review">Em Revisão (60%)</option>
                          {canApproveProcesses && <option value="approved">Aprovado (100%)</option>}
                          {canApproveProcesses && <option value="rejected">Rejeitado</option>}
                        </select>
                        {canApproveProcesses && selectedProcess.status !== 'approved' && (
                          <Button
                            type="button"
                            size="sm"
                            disabled={savingProcess}
                            onClick={() => handleUpdateProcessStatus('approved', 100)}
                            className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold gap-1.5"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            Finalizar Processo
                          </Button>
                        )}
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => setProcessToDelete(selectedProcess)}
                          title="Eliminar Processo"
                          className="border-red-200 text-red-600 hover:bg-red-50 text-xs font-bold gap-1"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          Eliminar
                        </Button>
                      </div>
                    )}
                  </CardHeader>

                  <CardContent className="p-6 space-y-6">
                    {/* Margem de Progresso do Processo (Atualizada pelo Administrador) */}
                    <div className="p-4 rounded-2xl bg-gray-50 border border-gray-200 space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <span className="text-xs font-bold uppercase tracking-wider text-gray-500">
                            Margem de Progresso do Processo
                          </span>
                          {selectedProcess.assignedEmployeeName && (
                            <p className="text-xs text-teal font-semibold flex items-center gap-1 mt-0.5">
                              <UserCheck className="w-3.5 h-3.5" />
                              Consultor Responsável: {selectedProcess.assignedEmployeeName}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-3">
                          {canManageProcesses && (
                            <select
                              aria-label="Definir Margem de Progresso"
                              value={selectedProcess.progress || 0}
                              disabled={savingProcess}
                              onChange={(e) =>
                                handleUpdateProcessStatus(selectedProcess.status, Number(e.target.value))
                              }
                              className="h-8 rounded-lg border border-gray-200 bg-white px-2 text-xs font-bold text-gray-700"
                            >
                              {[10, 20, 35, 50, 60, 75, 90, 100].map((pct) => (
                                <option key={pct} value={pct}>
                                  {pct}%
                                </option>
                              ))}
                            </select>
                          )}
                          <span className="text-xl font-black text-teal tabular-nums">
                            {selectedProcess.progress || 0}%
                          </span>
                        </div>
                      </div>
                      <div className="h-2.5 w-full bg-gray-200 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-teal rounded-full transition-all duration-500"
                          style={{ width: `${selectedProcess.progress || 0}%` }}
                        />
                      </div>
                    </div>

                    {(isStaff || selectedPaymentConfirmed) && (
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <TimelineCard
                          icon={<Plus />}
                          label="Início"
                          date={new Date(selectedProcess.createdAt).toLocaleDateString('pt-AO')}
                          completed
                        />
                        <TimelineCard
                          icon={<CalendarDays />}
                          label="Agendamento"
                          date={selectedProcess.dates?.appointment || 'N/D'}
                          completed={!!selectedProcess.dates?.appointment}
                        />
                        <TimelineCard
                          icon={<History />}
                          label="Levantamento"
                          date={selectedProcess.dates?.documentPickup || 'N/D'}
                          completed={!!selectedProcess.dates?.documentPickup}
                        />
                        <TimelineCard
                          icon={<Plane />}
                          label="Viagem"
                          date={selectedProcess.dates?.travel || 'N/D'}
                          completed={!!selectedProcess.dates?.travel}
                          last
                        />
                      </div>
                    )}

                    {canManageProcesses && (
                      <div className="pt-4 border-t border-gray-100">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-gray-500 uppercase">Cronograma & Datas do Processo</span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => setEditDatesOpen(!editDatesOpen)}
                            className="text-xs font-bold text-teal"
                          >
                            {editDatesOpen ? 'Fechar Edição' : 'Editar Datas'}
                          </Button>
                        </div>

                        {editDatesOpen && (
                          <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3 bg-gray-50 p-4 rounded-xl border border-gray-200">
                            <div className="space-y-1">
                              <label className="text-[10px] font-bold text-gray-500 uppercase">Levantamento</label>
                              <Input
                                type="date"
                                value={datesDraft.documentPickup}
                                onChange={(e) => setDatesDraft({ ...datesDraft, documentPickup: e.target.value })}
                                className="h-9 bg-white text-xs"
                              />
                            </div>
                            <div className="space-y-1">
                              <label className="text-[10px] font-bold text-gray-500 uppercase">Agendamento</label>
                              <Input
                                type="date"
                                value={datesDraft.appointment}
                                onChange={(e) => setDatesDraft({ ...datesDraft, appointment: e.target.value })}
                                className="h-9 bg-white text-xs"
                              />
                            </div>
                            <div className="space-y-1">
                              <label className="text-[10px] font-bold text-gray-500 uppercase">Embaixada/MIREX</label>
                              <Input
                                type="date"
                                value={datesDraft.embassySubmission}
                                onChange={(e) => setDatesDraft({ ...datesDraft, embassySubmission: e.target.value })}
                                className="h-9 bg-white text-xs"
                              />
                            </div>
                            <div className="space-y-1">
                              <label className="text-[10px] font-bold text-gray-500 uppercase">Viagem</label>
                              <Input
                                type="date"
                                value={datesDraft.travel}
                                onChange={(e) => setDatesDraft({ ...datesDraft, travel: e.target.value })}
                                className="h-9 bg-white text-xs"
                              />
                            </div>
                            <div className="col-span-2 md:col-span-4 flex justify-end pt-1">
                              <Button
                                type="button"
                                size="sm"
                                disabled={savingProcess}
                                onClick={handleSaveDates}
                                className="bg-teal hover:bg-teal-dark text-white gap-1.5 text-xs font-bold"
                              >
                                <Save className="w-3.5 h-3.5" />
                                Guardar Datas
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                    {/* Grupo Familiar Agrupado neste Processo */}
                    {(isStaff || selectedPaymentConfirmed) && (selectedProcess.isGroupProcess || (selectedProcess.groupMembers && selectedProcess.groupMembers.length > 0) || canManageProcesses) && (
                      <div className="pt-4 border-t border-gray-100 space-y-3">
                        <div className="flex items-center justify-between gap-2">
                          <div>
                            <span className="text-xs font-bold text-gray-500 uppercase flex items-center gap-1.5">
                              <Users className="w-3.5 h-3.5 text-teal" />
                              {selectedProcess.groupName || 'Grupo Familiar no Mesmo Processo'} (
                              {selectedProcess.groupMembers?.length || 1}{' '}
                              {(selectedProcess.groupMembers?.length || 1) === 1 ? 'pessoa' : 'pessoas'})
                            </span>
                          </div>
                          {canManageProcesses && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => setNewMemberOpen((v) => !v)}
                              className="text-xs font-bold text-teal gap-1"
                            >
                              <Plus className="w-3.5 h-3.5" />
                              {newMemberOpen ? 'Fechar' : 'Adicionar Familiar'}
                            </Button>
                          )}
                        </div>

                        {newMemberOpen && canManageProcesses && (
                          <form
                            onSubmit={handleAddMemberToProcess}
                            className="p-3 rounded-xl bg-gray-50 border border-gray-200 grid grid-cols-1 sm:grid-cols-4 gap-2"
                          >
                            <Input
                              required
                              placeholder="Nome completo"
                              value={newMemberName}
                              onChange={(e) => setNewMemberName(e.target.value)}
                              className="h-9 bg-white text-xs sm:col-span-2"
                            />
                            <select
                              value={newMemberRel}
                              onChange={(e) => setNewMemberRel(e.target.value as ProcessGroupMember['relationship'])}
                              className="h-9 rounded-md border border-gray-200 bg-white px-2 text-xs font-semibold"
                            >
                              {FAMILY_RELATIONSHIPS.filter((r) => r.id !== 'titular').map((rel) => (
                                <option key={rel.id} value={rel.id}>
                                  {rel.label}
                                </option>
                              ))}
                            </select>
                            <div className="flex gap-1.5">
                              <Input
                                placeholder="BI/Passaporte"
                                value={newMemberDoc}
                                onChange={(e) => setNewMemberDoc(e.target.value)}
                                className="h-9 bg-white text-xs"
                              />
                              <Button type="submit" size="sm" disabled={savingProcess} className="bg-teal text-white h-9 px-3 text-xs">
                                <Check className="w-4 h-4" />
                              </Button>
                            </div>
                          </form>
                        )}

                        {selectedProcess.groupMembers && selectedProcess.groupMembers.length > 0 && (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                            {selectedProcess.groupMembers.map((member) => {
                              const relLabel =
                                FAMILY_RELATIONSHIPS.find((r) => r.id === member.relationship)?.label ||
                                member.relationship;
                              return (
                                <div
                                  key={member.id}
                                  className="p-3 rounded-xl bg-gray-50 border border-gray-200 flex items-center justify-between gap-2"
                                >
                                  <div className="min-w-0">
                                    <p className="text-xs font-bold text-gray-900 truncate">{member.fullName}</p>
                                    <p className="text-[11px] text-gray-500 truncate">
                                      {relLabel}
                                      {member.documentNumber ? ` · Doc: ${member.documentNumber}` : ''}
                                      {member.age ? ` · ${member.age} anos` : ''}
                                    </p>
                                  </div>
                                  {canManageProcesses && member.relationship !== 'titular' && (
                                    <button
                                      type="button"
                                      onClick={() => handleRemoveMemberFromProcess(member.id)}
                                      className="text-gray-400 hover:text-red-500 p-1 shrink-0"
                                      aria-label="Remover membro do grupo"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Financial Account Summary (Locked for client until payment confirmed by operator) */}
                {!isStaff && !selectedPaymentConfirmed ? (
                  <Card className="shadow-sm border-none rounded-2xl bg-teal text-white overflow-hidden relative">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-lg font-bold flex items-center gap-2">
                        <Lock className="w-4 h-4 text-teal-light" />
                        Pagamento & Comprovativo
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4 relative z-10">
                      <div className="p-3.5 rounded-xl bg-black/15 border border-white/15 space-y-1.5">
                        <p className="text-xs font-bold text-white">Aguardando Confirmação do Operador</p>
                        <p className="text-[11px] text-white/80 leading-relaxed">
                          O resumo financeiro e os recibos ficarão disponíveis assim que o pagamento for confirmado pelo operador. Pode carregar os seus documentos e enviar o comprovativo abaixo.
                        </p>
                      </div>

                      <div className="p-3.5 rounded-xl bg-black/15 border border-white/15 space-y-2.5">
                        <p className="text-[11px] font-bold uppercase tracking-wider text-teal-light">
                          Enviar Comprovativo de Pagamento
                        </p>
                        <Input
                          placeholder="Ref. transferência ou banco (opcional)..."
                          value={transferReference}
                          onChange={(e) => setTransferReference(e.target.value)}
                          className="h-9 bg-white/95 text-gray-900 placeholder:text-gray-400 border-none text-xs"
                        />
                        <div className="grid grid-cols-1 gap-2">
                          <Button
                            type="button"
                            onClick={() => triggerFileUpload('payment_proof')}
                            disabled={uploadingCategory !== null}
                            className="w-full bg-white/95 hover:bg-white text-teal font-bold h-9 text-xs gap-1.5"
                          >
                            <Upload className="w-3.5 h-3.5" />
                            Anexar Comprovativo (Img/PDF)
                          </Button>
                          <Button
                            type="button"
                            onClick={handleSendPaymentProofWhatsApp}
                            className="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-bold h-9 text-xs gap-1.5"
                          >
                            <MessageCircle className="w-3.5 h-3.5" />
                            Enviar Comprovativo via WhatsApp
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ) : (
                  <Card className="shadow-sm border-none rounded-2xl bg-teal text-white overflow-hidden relative">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-lg font-bold flex items-center justify-between gap-2">
                        <span>Resumo de Conta</span>
                        {isStaff && (
                          <span
                            className={cn(
                              'text-[10px] font-black uppercase px-2 py-0.5 rounded',
                              selectedPaymentConfirmed
                                ? 'bg-emerald-400/20 text-emerald-100 border border-emerald-300/30'
                                : 'bg-amber-400/20 text-amber-100 border border-amber-300/30'
                            )}
                          >
                            {selectedPaymentConfirmed ? 'Confirmado' : 'Por Confirmar'}
                          </span>
                        )}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4 relative z-10">
                      {(() => {
                        const totalPrice = selectedProcess.price || 0;
                        const paidVal =
                          selectedProcess.paidAmount ??
                          (selectedProcess.paymentStatus === 'paid'
                            ? totalPrice
                            : selectedProcess.paymentStatus === 'partially_paid'
                            ? Math.round(totalPrice / 2)
                            : 0);
                        const remainingVal = Math.max(0, totalPrice - paidVal);
                        const pct =
                          totalPrice > 0
                            ? Math.min(100, Math.round((paidVal / totalPrice) * 100))
                            : selectedProcess.paymentStatus === 'paid'
                            ? 100
                            : 0;

                        return (
                          <>
                            <div>
                              <p className="text-[10px] font-bold opacity-75 uppercase tracking-widest">Valor Total do Serviço</p>
                              <p className="text-2xl font-black tracking-tight mt-0.5 tabular-nums">
                                {formatCurrency(totalPrice)}
                              </p>
                              {selectedProcess.paymentMethod && (
                                <p className="text-[11px] text-teal-light mt-0.5">
                                  Forma: {selectedProcess.paymentMethod}
                                </p>
                              )}
                            </div>

                            <div className="grid grid-cols-2 gap-2 p-2.5 rounded-xl bg-black/15 border border-white/10 text-xs">
                              <div>
                                <span className="text-[10px] opacity-75 uppercase block">Pago</span>
                                <span className="font-black tabular-nums">{formatCurrency(paidVal)}</span>
                              </div>
                              <div>
                                <span className="text-[10px] opacity-75 uppercase block">Em Falta</span>
                                <span className="font-black tabular-nums">{formatCurrency(remainingVal)}</span>
                              </div>
                            </div>

                            <div className="flex items-center gap-3">
                              <div className="flex-1">
                                <p className="text-[10px] font-bold opacity-75 uppercase tracking-widest mb-1">
                                  Estado Financeiro ({pct}%)
                                </p>
                                <div className="h-1.5 w-full bg-white/20 rounded-full overflow-hidden">
                                  <div className="h-full bg-white transition-all" style={{ width: `${pct}%` }} />
                                </div>
                              </div>
                              <Badge className="bg-white text-teal font-black text-[10px] uppercase">
                                {selectedProcess.paymentStatus === 'paid'
                                  ? 'PAGO'
                                  : selectedProcess.paymentStatus === 'partially_paid'
                                  ? 'PARCIAL'
                                  : 'PENDENTE'}
                              </Badge>
                            </div>
                          </>
                        );
                      })()}

                      <div className="space-y-2 pt-1">
                        {isStaff && !selectedPaymentConfirmed && (canManageProcesses || canIssueReceipts) && (
                          <Button
                            type="button"
                            disabled={savingProcess}
                            onClick={handleConfirmOperatorPayment}
                            className="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-bold rounded-xl h-10 text-xs uppercase tracking-wider gap-2"
                          >
                            <CheckCircle2 className="w-4 h-4" />
                            Confirmar Pagamento
                          </Button>
                        )}

                        {(canManageProcesses || canIssueReceipts) && (
                          <Button
                            type="button"
                            onClick={openPaymentModal}
                            className="w-full bg-teal-dark hover:bg-black/30 border border-white/25 text-white font-bold rounded-xl h-10 text-xs uppercase tracking-wider gap-2"
                          >
                            <CreditCard className="w-4 h-4" />
                            Registar Parcela / Pagamento
                          </Button>
                        )}

                        {(canIssueReceipts || !isStaff) && (
                          <Button
                            onClick={handleOpenOrCreateReceipt}
                            disabled={savingProcess}
                            className="w-full bg-white text-teal hover:bg-teal-light font-bold rounded-xl h-11 text-xs uppercase tracking-wider gap-2"
                          >
                            {savingProcess ? <Loader2 className="w-4 h-4 animate-spin" /> : <Receipt className="w-4 h-4" />}
                            {isStaff
                              ? invoices.length > 0
                                ? 'Ver / Imprimir / WhatsApp Recibo'
                                : 'Emitir Recibo / Fatura'
                              : invoices.length > 0
                              ? 'Ver Fatura / Enviar Recibo WhatsApp'
                              : 'Ver Resumo / Enviar Recibo WhatsApp'}
                          </Button>
                        )}

                        {!isStaff && (
                          <div className="mt-3 p-3.5 rounded-xl bg-black/15 border border-white/15 space-y-2.5">
                            <p className="text-[11px] font-bold uppercase tracking-wider text-teal-light">
                              Comprovativo de Transferência / Pagamento
                            </p>
                            <Input
                              placeholder="Ref. transferência ou banco (opcional)..."
                              value={transferReference}
                              onChange={(e) => setTransferReference(e.target.value)}
                              className="h-9 bg-white/95 text-gray-900 placeholder:text-gray-400 border-none text-xs"
                            />
                            <div className="grid grid-cols-1 gap-2">
                              <Button
                                type="button"
                                onClick={() => triggerFileUpload('payment_proof')}
                                disabled={uploadingCategory !== null}
                                className="w-full bg-white/95 hover:bg-white text-teal font-bold h-9 text-xs gap-1.5"
                              >
                                <Upload className="w-3.5 h-3.5" />
                                Anexar Comprovativo (Img/PDF)
                              </Button>
                              <Button
                                type="button"
                                onClick={handleSendPaymentProofWhatsApp}
                                className="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-bold h-9 text-xs gap-1.5"
                              >
                                <MessageCircle className="w-3.5 h-3.5" />
                                Enviar Comprovativo via WhatsApp
                              </Button>
                            </div>
                          </div>
                        )}

                        {isStaff && invoices.length > 0 && (
                          <Button
                            type="button"
                            variant="ghost"
                            onClick={() => setActiveReceipt(invoices[0])}
                            className="w-full bg-white/10 hover:bg-white/20 text-white font-semibold rounded-xl h-9 text-xs gap-2"
                          >
                            <MessageCircle className="w-3.5 h-3.5" />
                            Enviar Recibo por WhatsApp
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>

              {/* Documents & Reminders */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <Card
                  className={cn(
                    'shadow-sm border border-gray-200 rounded-2xl bg-white overflow-hidden',
                    isStaff || selectedPaymentConfirmed ? 'lg:col-span-2' : 'lg:col-span-3'
                  )}
                >
                  <CardHeader className="p-6 border-b border-gray-100">
                    <CardTitle className="text-lg font-bold flex items-center gap-2">
                      <Files className="w-5 h-5 text-teal" />
                      Documentação do Processo ({documents.length})
                    </CardTitle>
                    <CardDescription className="text-xs text-gray-500">
                      {isStaff
                        ? 'Carregue documentos do processo ou ficheiros emitidos/tratados. Documentos emitidos pela agência são exibidos ao cliente com marca d\'água e sem opção de transferência.'
                        : 'Carregue os documentos solicitados pelo seu consultor. Documentos já tratados ou emitidos pela agência ficam disponíveis apenas para consulta protegida com marca d\'água.'}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="p-6 space-y-6">
                    {canManageDocs && (
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        {DOCUMENT_CATEGORIES.filter((cat) => isStaff || cat.id !== 'agency_issued').map((cat) => {
                          const isUploadingThis = uploadingCategory === cat.id;
                          return (
                            <button
                              key={cat.id}
                              type="button"
                              onClick={() => triggerFileUpload(cat.id)}
                              disabled={uploadingCategory !== null}
                              className="group flex flex-col items-center gap-2 p-3.5 rounded-xl border-2 border-dashed border-gray-200 hover:border-teal hover:bg-teal-light/20 transition-all text-center disabled:opacity-60"
                            >
                              <div className="w-9 h-9 rounded-lg bg-gray-50 flex items-center justify-center text-gray-500 group-hover:bg-white group-hover:text-teal">
                                {isUploadingThis ? (
                                  <Loader2 className="w-4 h-4 animate-spin text-teal" />
                                ) : (
                                  <Upload className="w-4 h-4" />
                                )}
                              </div>
                              <span className="text-[11px] font-bold text-gray-600 group-hover:text-teal leading-tight">
                                {cat.label}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    )}

                    {uploadError && (
                      <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-semibold flex items-center gap-2">
                        <AlertCircle className="w-4 h-4 shrink-0" />
                        <span>{uploadError}</span>
                      </div>
                    )}

                    <div className="space-y-3">
                      {documents.length > 0 ? (
                        documents.map((docItem) => {
                          const catLabel =
                            DOCUMENT_CATEGORIES.find((c) => c.id === docItem.category)?.label || docItem.category;
                          const isTreatedOrIssued =
                            Boolean(docItem.isAgencyIssued) ||
                            docItem.category === 'agency_issued' ||
                            docItem.status === 'verified' ||
                            (Boolean(docItem.uploadedBy) && docItem.uploadedBy !== selectedProcess.clientUid);
                          const lockDownloadForClient = !isStaff && isTreatedOrIssued;

                          return (
                            <div
                              key={docItem.id}
                              className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl border border-gray-200 bg-white hover:border-teal/40 transition-all"
                            >
                              <div className="flex items-center gap-3 min-w-0">
                                <div
                                  className={cn(
                                    'w-10 h-10 rounded-xl flex items-center justify-center shrink-0',
                                    docItem.status === 'verified'
                                      ? 'bg-emerald-50 text-emerald-600'
                                      : docItem.status === 'rejected'
                                      ? 'bg-red-50 text-red-600'
                                      : 'bg-teal-light text-teal'
                                  )}
                                >
                                  <FileText className="w-5 h-5" />
                                </div>
                                <div className="min-w-0">
                                  <p className="text-sm font-bold text-gray-900 truncate">{docItem.name}</p>
                                  <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500 mt-0.5">
                                    <span>{catLabel}</span>
                                    <span>·</span>
                                    <span>{new Date(docItem.createdAt).toLocaleDateString('pt-AO')}</span>
                                    {docItem.fileSize ? (
                                      <>
                                        <span>·</span>
                                        <span className="tabular-nums">{formatFileSize(docItem.fileSize)}</span>
                                      </>
                                    ) : null}
                                    {lockDownloadForClient && (
                                      <>
                                        <span>·</span>
                                        <span className="text-amber-700 font-semibold inline-flex items-center gap-1">
                                          <Lock className="w-3 h-3" />
                                          Marca d&apos;água ativa
                                        </span>
                                      </>
                                    )}
                                  </div>
                                </div>
                              </div>

                              <div className="flex items-center gap-2 shrink-0 flex-wrap">
                                <span
                                  className={cn(
                                    'text-[10px] font-black uppercase px-2.5 py-1 rounded-md',
                                    docItem.status === 'verified'
                                      ? 'bg-emerald-100 text-emerald-800'
                                      : docItem.status === 'rejected'
                                      ? 'bg-red-100 text-red-800'
                                      : 'bg-amber-100 text-amber-800'
                                  )}
                                >
                                  {docItem.status === 'verified'
                                    ? 'Tratado / Validado'
                                    : docItem.status === 'rejected'
                                    ? 'Rejeitado'
                                    : isTreatedOrIssued
                                    ? 'Emitido Agência'
                                    : 'Submetido'}
                                </span>

                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={() => {
                                    setViewerProtected(lockDownloadForClient);
                                    setViewerDoc(docItem);
                                  }}
                                  title={lockDownloadForClient ? 'Ver com Marca d\'Água' : 'Visualizar Documento'}
                                  className="h-8 px-2.5 text-xs font-semibold gap-1 border-gray-200"
                                >
                                  <Eye className="w-3.5 h-3.5 text-teal" />
                                  {lockDownloadForClient ? 'Ver (Protegido)' : 'Ver'}
                                </Button>

                                {!lockDownloadForClient && (
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handleDownloadDocument(docItem)}
                                    title="Baixar Documento"
                                    className="h-8 px-2.5 text-xs font-semibold gap-1 border-gray-200"
                                  >
                                    <Download className="w-3.5 h-3.5 text-teal" />
                                    Baixar
                                  </Button>
                                )}

                                {canValidateDocs && docItem.status !== 'verified' && (
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => handleUpdateDocumentStatus(docItem.id, 'verified')}
                                    title="Validar Documento"
                                    className="h-8 w-8 text-emerald-600 hover:bg-emerald-50"
                                  >
                                    <CheckCircle2 className="w-4 h-4" />
                                  </Button>
                                )}

                                {canValidateDocs && docItem.status !== 'rejected' && (
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => handleUpdateDocumentStatus(docItem.id, 'rejected')}
                                    title="Rejeitar Documento"
                                    className="h-8 w-8 text-red-500 hover:bg-red-50"
                                  >
                                    <XCircle className="w-4 h-4" />
                                  </Button>
                                )}

                                {(isStaff || (docItem.uploadedBy === user?.uid && !isTreatedOrIssued)) && (
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => setDocIdToDelete(docItem.id)}
                                    title="Eliminar Documento"
                                    className="h-8 w-8 text-gray-400 hover:text-red-600 hover:bg-red-50"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </Button>
                                )}
                              </div>
                            </div>
                          );
                        })
                      ) : (
                        <div className="text-center py-10 bg-gray-50 rounded-xl border border-dashed border-gray-200">
                          <Files className="w-10 h-10 text-gray-300 mx-auto mb-2" />
                          <p className="text-sm font-medium text-gray-500">
                            Nenhum documento carregado neste processo.
                          </p>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>

                {/* Reminders (Hidden for client until payment confirmed by operator) */}
                {(isStaff || selectedPaymentConfirmed) && (
                <Card className="shadow-sm border border-gray-200 rounded-2xl bg-white overflow-hidden">
                  <CardHeader className="p-6 border-b border-gray-100">
                    <CardTitle className="text-lg font-bold flex items-center gap-2">
                      <Bell className="w-5 h-5 text-teal" />
                      Gestão de Prazos
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-6 space-y-5">
                    {canManageProcesses && (
                      <div className="space-y-3">
                        <Input
                          placeholder="Acção ou prazo..."
                          className="bg-gray-50 border-gray-200 h-10 rounded-xl text-sm"
                          value={reminderTitle}
                          onChange={(e) => setReminderTitle(e.target.value)}
                        />
                        <div className="flex gap-2">
                          <Input
                            type="date"
                            className="bg-gray-50 border-gray-200 h-10 rounded-xl text-xs flex-1"
                            value={reminderDate}
                            onChange={(e) => setReminderDate(e.target.value)}
                          />
                          <Button onClick={handleAddReminder} className="h-10 bg-teal hover:bg-teal-dark text-white rounded-xl">
                            <Plus className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    )}

                    <div className="space-y-2 max-h-[350px] overflow-y-auto">
                      {selectedProcess.reminders && selectedProcess.reminders.length > 0 ? (
                        selectedProcess.reminders.map((rem) => (
                          <div
                            key={rem.id}
                            className="flex items-center justify-between p-3 rounded-xl border border-gray-100 bg-white"
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <button
                                type="button"
                                onClick={() => toggleReminder(selectedProcess.id, rem.id)}
                                className={cn(
                                  'w-5 h-5 rounded border-2 flex items-center justify-center shrink-0',
                                  rem.completed ? 'bg-teal border-teal text-white' : 'border-gray-300'
                                )}
                              >
                                {rem.completed && <Check className="w-3.5 h-3.5" />}
                              </button>
                              <div className="min-w-0">
                                <p
                                  className={cn(
                                    'text-xs font-bold truncate',
                                    rem.completed ? 'text-gray-400 line-through' : 'text-gray-900'
                                  )}
                                >
                                  {rem.title}
                                </p>
                                <p className="text-[10px] text-gray-400 font-semibold">
                                  {new Date(rem.date).toLocaleDateString('pt-AO')}
                                </p>
                              </div>
                            </div>
                            {canManageProcesses && (
                              <Button
                                type="button"
                                onClick={() => deleteReminder(selectedProcess.id, rem.id)}
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-gray-400 hover:text-red-500"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            )}
                          </div>
                        ))
                      ) : (
                        <p className="text-xs text-gray-400 text-center py-6">Sem lembretes registados.</p>
                      )}
                    </div>
                  </CardContent>
                </Card>
                )}
              </div>

              {/* Client Evaluation & Star Rating upon Process Completion */}
              {(isStaff || selectedPaymentConfirmed) && (selectedProcess.status === 'approved' || selectedProcess.progress >= 100) && (
                <Card className="border border-teal/20 bg-white rounded-2xl shadow-sm overflow-hidden">
                  <CardHeader className="border-b border-gray-100 bg-teal-light/20">
                    <CardTitle className="text-lg font-bold flex items-center gap-2 text-gray-900">
                      <Star className="w-5 h-5 text-amber-500 fill-amber-400" />
                      Avaliação do Atendimento & Recomendação do Serviço
                    </CardTitle>
                    <CardDescription>
                      {existingReview
                        ? 'Obrigado por partilhar a sua avaliação sobre o nosso atendimento.'
                        : 'O seu processo foi concluído! Avalie o atendimento do funcionário que o acompanhou e diga se recomenda o serviço.'}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="p-6">
                    {existingReview ? (
                      <div className="space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <p className="text-sm font-bold text-gray-900">
                              Consultor avaliado: <span className="text-teal">{existingReview.employeeName}</span>
                            </p>
                            <p className="text-xs text-gray-500">
                              {existingReview.recommend ? 'Recomenda os nossos serviços' : 'Feedback registado'}
                            </p>
                          </div>
                          <div className="flex items-center gap-1">
                            {Array.from({ length: 5 }).map((_, i) => (
                              <Star
                                key={i}
                                className={cn(
                                  'w-5 h-5',
                                  i < existingReview.rating ? 'fill-amber-400 text-amber-400' : 'text-gray-300'
                                )}
                              />
                            ))}
                          </div>
                        </div>
                        {existingReview.comment && (
                          <p className="text-sm text-gray-700 bg-gray-50 p-3 rounded-xl border border-gray-100">
                            &ldquo;{existingReview.comment}&rdquo;
                          </p>
                        )}
                      </div>
                    ) : !isStaff ? (
                      <form onSubmit={handleSubmitReview} className="space-y-4">
                        {!selectedProcess.assignedEmployeeName && consultants.length > 0 && (
                          <div className="space-y-1.5">
                            <label className="text-xs font-bold text-gray-600 uppercase">
                              Funcionário que o Acompanhou
                            </label>
                            <select
                              value={reviewEmployeeUid}
                              onChange={(e) => setReviewEmployeeUid(e.target.value)}
                              className="w-full h-10 rounded-xl border border-gray-200 bg-gray-50 px-3 text-sm font-semibold"
                            >
                              {consultants.map((c) => (
                                <option key={c.uid} value={c.uid}>
                                  {c.displayName}
                                </option>
                              ))}
                            </select>
                          </div>
                        )}

                        <div className="flex flex-wrap items-center justify-between gap-4">
                          <div className="space-y-1">
                            <label className="text-xs font-bold text-gray-600 uppercase block">
                              Classificação em Estrelas
                            </label>
                            <div className="flex items-center gap-1.5">
                              {[1, 2, 3, 4, 5].map((star) => (
                                <button
                                  key={star}
                                  type="button"
                                  onClick={() => setReviewStars(star)}
                                  className="p-1 hover:scale-110 transition-transform"
                                  aria-label={`${star} estrelas`}
                                >
                                  <Star
                                    className={cn(
                                      'w-7 h-7',
                                      star <= reviewStars ? 'fill-amber-400 text-amber-400' : 'text-gray-300'
                                    )}
                                  />
                                </button>
                              ))}
                              <span className="ml-2 text-sm font-bold text-gray-700">{reviewStars}/5</span>
                            </div>
                          </div>

                          <div className="space-y-1">
                            <label className="text-xs font-bold text-gray-600 uppercase block">
                              Recomenda o Serviço?
                            </label>
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={() => setReviewRecommend(true)}
                                className={cn(
                                  'px-4 py-2 rounded-xl text-xs font-bold border flex items-center gap-1.5 transition-colors',
                                  reviewRecommend
                                    ? 'bg-emerald-600 text-white border-emerald-600'
                                    : 'bg-gray-50 text-gray-600 border-gray-200'
                                )}
                              >
                                <ThumbsUp className="w-3.5 h-3.5" />
                                Sim, Recomendo
                              </button>
                              <button
                                type="button"
                                onClick={() => setReviewRecommend(false)}
                                className={cn(
                                  'px-4 py-2 rounded-xl text-xs font-bold border transition-colors',
                                  !reviewRecommend
                                    ? 'bg-gray-800 text-white border-gray-800'
                                    : 'bg-gray-50 text-gray-600 border-gray-200'
                                )}
                              >
                                Pode Melhorar
                              </button>
                            </div>
                          </div>
                        </div>

                        <div className="space-y-1.5">
                          <label className="text-xs font-bold text-gray-600 uppercase">Comentário (Opcional)</label>
                          <textarea
                            rows={2}
                            placeholder="Conte como foi o atendimento durante o tratamento do seu visto..."
                            value={reviewComment}
                            onChange={(e) => setReviewComment(e.target.value)}
                            className="w-full rounded-xl bg-gray-50 border border-gray-200 p-3 text-sm focus:outline-none focus:ring-2 focus:ring-teal"
                          />
                        </div>

                        <div className="flex justify-end">
                          <Button
                            type="submit"
                            disabled={submittingReview}
                            className="bg-teal hover:bg-teal-dark text-white font-bold gap-2"
                          >
                            {submittingReview ? <Loader2 className="w-4 h-4 animate-spin" /> : <Star className="w-4 h-4" />}
                            Enviar Avaliação
                          </Button>
                        </div>
                      </form>
                    ) : (
                      <p className="text-xs text-gray-500">O cliente ainda não submeteu a avaliação deste processo concluído.</p>
                    )}
                  </CardContent>
                </Card>
              )}
            </div>
          ) : (
            <div className="h-[520px] flex flex-col items-center justify-center p-12 text-center bg-white rounded-2xl border border-gray-200">
              <div className="w-16 h-16 bg-teal-light rounded-2xl flex items-center justify-center mb-4">
                <ClipboardList className="w-8 h-8 text-teal" />
              </div>
              <h3 className="text-xl font-bold text-gray-900">Controlo de Processos</h3>
              <p className="text-sm text-gray-500 max-w-sm mt-2">
                Seleccione um processo na lista à esquerda para gerir documentos, emitir recibos e atualizar o estado.
              </p>
            </div>
          )}
        </div>
      </div>

      <DocumentViewerModal
        documentItem={viewerDoc}
        onClose={() => {
          setViewerDoc(null);
          setViewerProtected(false);
        }}
        canValidate={canValidateDocs}
        disableDownload={viewerProtected}
        watermarkText={
          viewerProtected && selectedProcess
            ? `${company.name.toUpperCase()} · ${selectedProcess.id} · ${(selectedProcess.clientName || 'CLIENTE').toUpperCase()}`
            : undefined
        }
        onUpdateStatus={handleUpdateDocumentStatus}
      />

      <ReceiptModal
        invoice={activeReceipt}
        onClose={() => setActiveReceipt(null)}
        onUpdated={(updated) => setActiveReceipt(updated)}
        clientReadOnly={!isStaff}
      />

      {/* Modal de Confirmação para Eliminar Processo */}
      {processToDelete && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <Card className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden">
            <CardHeader className="border-b border-gray-100">
              <CardTitle className="text-lg font-bold text-red-700 flex items-center gap-2">
                <Trash2 className="w-5 h-5" />
                Eliminar Processo Permanentemente
              </CardTitle>
              <CardDescription>
                Tem a certeza que deseja eliminar o processo <strong>{processToDelete.id}</strong> (
                {processToDelete.clientName} · {processToDelete.serviceName})? Esta ação não pode ser anulada.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-6 flex justify-end gap-3">
              <Button
                type="button"
                variant="ghost"
                disabled={deletingProcess}
                onClick={() => setProcessToDelete(null)}
              >
                Cancelar
              </Button>
              <Button
                type="button"
                disabled={deletingProcess}
                onClick={handleConfirmDeleteProcess}
                className="bg-red-600 hover:bg-red-700 text-white font-bold gap-2"
              >
                {deletingProcess ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                Confirmar Eliminação
              </Button>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Modal para Registar Parcela / Pagamento */}
      {paymentModalOpen && selectedProcess && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <Card className="w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden">
            <CardHeader className="border-b border-gray-100 flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-lg font-bold">Registar Pagamento / Parcela</CardTitle>
                <CardDescription>
                  {selectedProcess.serviceName} · Total: {formatCurrency(selectedProcess.price || 0)}
                </CardDescription>
              </div>
              <Button variant="ghost" size="icon" onClick={() => setPaymentModalOpen(false)} className="rounded-full">
                <XCircle className="w-5 h-5" />
              </Button>
            </CardHeader>
            <CardContent className="p-6">
              <form onSubmit={handleSaveInstallmentPayment} className="space-y-4">
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setInstallmentAmountInput(String(Math.round((selectedProcess.price || 0) / 2)))}
                    className="text-xs font-bold border-teal/30 text-teal"
                  >
                    50% ({formatCurrency(Math.round((selectedProcess.price || 0) / 2))})
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      setInstallmentAmountInput(
                        String(Math.max(0, (selectedProcess.price || 0) - (selectedProcess.paidAmount || 0)))
                      )
                    }
                    className="text-xs font-bold border-gray-200"
                  >
                    Liquidar Restante (
                    {formatCurrency(Math.max(0, (selectedProcess.price || 0) - (selectedProcess.paidAmount || 0)))})
                  </Button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-gray-600 uppercase">Valor Pago Agora (Kz)</label>
                    <Input
                      type="number"
                      required
                      min={1}
                      value={installmentAmountInput}
                      onChange={(e) => setInstallmentAmountInput(e.target.value)}
                      className="h-10 bg-gray-50 text-sm font-bold tabular-nums"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-gray-600 uppercase">Forma de Pagamento</label>
                    <select
                      value={installmentMethodInput}
                      onChange={(e) => setInstallmentMethodInput(e.target.value)}
                      className="w-full h-10 rounded-md border border-gray-200 bg-gray-50 px-3 text-sm font-semibold"
                    >
                      {PAYMENT_METHODS.map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-gray-600 uppercase">Observação (Opcional)</label>
                  <Input
                    placeholder="Ex: 1ª prestação ou transferência BAI"
                    value={installmentNoteInput}
                    onChange={(e) => setInstallmentNoteInput(e.target.value)}
                    className="h-10 bg-gray-50 text-xs"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-gray-600 uppercase flex items-center gap-1.5">
                    <Upload className="w-3.5 h-3.5 text-teal" />
                    Comprovativo de Pagamento (Opcional)
                  </label>
                  <Input
                    type="file"
                    accept="image/*,.pdf"
                    onChange={(e) => setInstallmentProofFile(e.target.files?.[0] || null)}
                    className="h-10 bg-gray-50 text-xs file:mr-2 file:py-1 file:px-2.5 file:rounded file:border-0 file:text-xs file:font-bold file:bg-teal-light file:text-teal"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <Button type="button" variant="ghost" onClick={() => setPaymentModalOpen(false)}>
                    Cancelar
                  </Button>
                  <Button type="submit" disabled={savingPayment} className="bg-teal hover:bg-teal-dark text-white font-bold gap-2">
                    {savingPayment ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                    Guardar Pagamento
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Modal de Confirmação para Eliminar Documento */}
      {docIdToDelete && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <Card className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden">
            <CardHeader className="border-b border-gray-100">
              <CardTitle className="text-lg font-bold text-red-700 flex items-center gap-2">
                <Trash2 className="w-5 h-5" />
                Eliminar Documento
              </CardTitle>
              <CardDescription>
                Tem a certeza que deseja eliminar este documento permanentemente?
              </CardDescription>
            </CardHeader>
            <CardContent className="p-6 flex justify-end gap-3">
              <Button type="button" variant="ghost" onClick={() => setDocIdToDelete(null)}>
                Cancelar
              </Button>
              <Button type="button" onClick={handleDeleteDocument} className="bg-red-600 hover:bg-red-700 text-white font-bold gap-2">
                <Trash2 className="w-4 h-4" />
                Confirmar Eliminação
              </Button>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

function TimelineCard({
  icon,
  label,
  date,
  completed,
  last,
}: {
  icon: React.ReactNode;
  label: string;
  date: string;
  completed: boolean;
  last?: boolean;
}) {
  return (
    <div className="relative">
      {!last && <div className={cn('hidden md:block absolute top-5 left-1/2 right-0 h-0.5 z-0', completed ? 'bg-teal' : 'bg-gray-200')} />}
      <div className="relative z-10 flex flex-col items-center text-center">
        <div
          className={cn(
            'w-10 h-10 rounded-xl flex items-center justify-center mb-2',
            completed ? 'bg-teal text-white' : 'bg-gray-100 text-gray-400'
          )}
        >
          {React.cloneElement(icon as React.ReactElement<any>, { className: 'w-5 h-5' })}
        </div>
        <p className={cn('text-[10px] font-bold uppercase tracking-wider', completed ? 'text-teal' : 'text-gray-400')}>
          {label}
        </p>
        <p className="text-xs font-bold text-gray-900 tabular-nums">{date}</p>
      </div>
    </div>
  );
}
