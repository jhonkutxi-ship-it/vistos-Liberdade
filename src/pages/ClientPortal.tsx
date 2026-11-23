/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  where,
} from 'firebase/firestore';
import { db, OperationType, handleFirestoreError } from '@/src/firebase';
import { useAuth } from '@/src/hooks/useAuth';
import { useCompanySettings } from '@/src/hooks/useCompanySettings';
import {
  AdvisoryRequest,
  AppNotification,
  ConsultantProfile,
  PaymentRecord,
  ProcessGroupMember,
  ServiceReview,
  TravelProcess,
  TravelService,
} from '@/src/types';
import {
  FAMILY_RELATIONSHIPS,
  PAYMENT_METHODS,
  TRENDING_PROMO_SERVICES,
  TrendingServiceCampaign,
} from '@/src/constants';
import { processUploadedFile, compressImageToDataUrl } from '@/src/utils/fileHelpers';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/src/components/ui/Card';
import { Button } from '@/src/components/ui/Button';
import { Input } from '@/src/components/ui/Input';
import { cn, formatCurrency } from '@/src/lib/utils';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowRight,
  Calendar,
  Camera,
  CheckCircle2,
  Edit2,
  Eye,
  Flame,
  Globe,
  Image as ImageIcon,
  Loader2,
  MapPin,
  MessageCircle,
  Phone,
  PlaneTakeoff,
  Plus,
  Save,
  SlidersHorizontal,
  Star,
  ThumbsUp,
  Trash2,
  Upload,
  UserCheck,
  Users,
  X,
} from 'lucide-react';

type RequestMode = 'assessoria' | 'consultoria';

export function ClientPortal() {
  const { user, profile, hasPermission } = useAuth();
  const { company } = useCompanySettings();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const canManagePublicServices = hasPermission('manage_services');

  const [services, setServices] = useState<TravelService[]>([]);
  const [consultants, setConsultants] = useState<ConsultantProfile[]>([]);
  const [myRequests, setMyRequests] = useState<AdvisoryRequest[]>([]);
  const [reviews, setReviews] = useState<ServiceReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [categoryFilter, setCategoryFilter] = useState<string>('all');

  // Plan/package editor state for users with manage_services permission
  const [serviceEditorOpen, setServiceEditorOpen] = useState(false);
  const [savingService, setSavingService] = useState(false);
  const [serviceToDelete, setServiceToDelete] = useState<TravelService | null>(null);
  const [editingServiceDraft, setEditingServiceDraft] = useState<{
    id?: string;
    name: string;
    subtitle: string;
    badgeText: string;
    price: number;
    category: NonNullable<TravelService['category']>;
    description: string;
    featuresInput: string;
    imageUrl?: string;
    isTrending?: boolean;
  }>({
    name: '',
    subtitle: '',
    badgeText: '',
    price: 0,
    category: 'visa',
    description: '',
    featuresInput: '',
  });

  // Lightbox for promotional posters
  const [posterPreview, setPosterPreview] = useState<TrendingServiceCampaign | null>(null);

  // Consultancy / Advisory Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [requestMode, setRequestMode] = useState<RequestMode>('assessoria');
  const [selectedServiceName, setSelectedServiceName] = useState('');
  const [selectedServiceId, setSelectedServiceId] = useState('');
  const [selectedPrice, setSelectedPrice] = useState<number>(0);
  const [selectedEmployeeUid, setSelectedEmployeeUid] = useState('');
  const [preferredDate, setPreferredDate] = useState('');
  const [preferredTime, setPreferredTime] = useState('10:00');
  const [paymentType, setPaymentType] = useState<'full' | 'installments'>('full');
  const [installmentMode, setInstallmentMode] = useState<'half_50_50' | 'custom'>('half_50_50');
  const [initialPaidAmount, setInitialPaidAmount] = useState<string>('');
  const [paymentMethod, setPaymentMethod] = useState<string>(PAYMENT_METHODS[0]);
  const [proofFile, setProofFile] = useState<File | null>(null);

  // Grupo Familiar no Mesmo Processo
  const [isGroupProcess, setIsGroupProcess] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [familyMembers, setFamilyMembers] = useState<ProcessGroupMember[]>([]);

  const [clientPhone, setClientPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submittedSuccess, setSubmittedSuccess] = useState<{
    type: RequestMode;
    serviceName: string;
    employeeName: string;
    processId?: string;
  } | null>(null);

  useEffect(() => {
    const unsubServices = onSnapshot(
      query(collection(db, 'services'), orderBy('name', 'asc')),
      (snap) => {
        setServices(snap.docs.map((d) => ({ ...d.data(), id: d.id })) as TravelService[]);
        setLoading(false);
      },
      () => setLoading(false)
    );

    const unsubConsultants = onSnapshot(
      collection(db, 'consultants'),
      (snap) => {
        const list = snap.docs
          .map((d) => ({ ...d.data(), uid: d.id }) as ConsultantProfile)
          .filter((c) => c.active !== false);
        setConsultants(list);
      },
      () => {}
    );

    const unsubReviews = onSnapshot(
      collection(db, 'service_reviews'),
      (snap) => {
        const list = snap.docs.map((d) => ({ ...d.data(), id: d.id }) as ServiceReview);
        list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        setReviews(list);
      },
      () => {}
    );

    let unsubRequests: (() => void) | undefined;
    if (user?.uid) {
      unsubRequests = onSnapshot(
        query(collection(db, 'advisory_requests'), where('clientUid', '==', user.uid)),
        (snap) => {
          const list = snap.docs.map((d) => ({ ...d.data(), id: d.id }) as AdvisoryRequest);
          list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
          setMyRequests(list);
        },
        () => {}
      );
    }

    return () => {
      unsubServices();
      unsubConsultants();
      unsubReviews();
      unsubRequests?.();
    };
  }, [user?.uid]);

  useEffect(() => {
    if (searchParams.get('new') === '1' && !loading) {
      openRequestModal('assessoria');
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, loading]);

  const availableConsultants = useMemo<ConsultantProfile[]>(() => {
    if (consultants.length > 0) return consultants;
    return [
      {
        uid: 'manpe123-default',
        displayName: 'Manpe 123 (Consultor Principal)',
        role: 'admin',
        specialty: 'Vistos Schengen, Estudo & Trabalho',
        active: true,
      },
    ];
  }, [consultants]);

  const consultantRatings = useMemo(() => {
    const map: Record<string, { avg: number; count: number }> = {};
    for (const r of reviews) {
      if (!r.employeeUid) continue;
      if (!map[r.employeeUid]) map[r.employeeUid] = { avg: 0, count: 0 };
      map[r.employeeUid].avg += r.rating || 0;
      map[r.employeeUid].count += 1;
    }
    for (const key of Object.keys(map)) {
      map[key].avg = Number((map[key].avg / map[key].count).toFixed(1));
    }
    return map;
  }, [reviews]);

  const activeMemberCount = useMemo(() => {
    if (!isGroupProcess) return 1;
    const filledCount = familyMembers.filter((m) => m.fullName.trim().length > 0).length;
    return 1 + filledCount;
  }, [isGroupProcess, familyMembers]);

  const computedTotalPrice = useMemo(() => {
    return (selectedPrice || 0) * activeMemberCount;
  }, [selectedPrice, activeMemberCount]);

  useEffect(() => {
    if (paymentType === 'installments' && installmentMode === 'half_50_50') {
      setInitialPaidAmount(String(Math.round(computedTotalPrice / 2)));
    }
  }, [paymentType, installmentMode, computedTotalPrice]);

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

  const openRequestModal = (
    mode: RequestMode,
    preset?: { id: string; name: string; price: number }
  ) => {
    setSubmittedSuccess(null);
    setRequestMode(mode);
    setIsGroupProcess(false);
    setGroupName('');
    setFamilyMembers([]);
    setPaymentType('full');
    setInstallmentMode('half_50_50');
    setPaymentMethod(PAYMENT_METHODS[0]);
    setProofFile(null);

    if (preset) {
      setSelectedServiceId(preset.id);
      setSelectedServiceName(preset.name);
      setSelectedPrice(preset.price);
      setInitialPaidAmount(String(Math.round(preset.price / 2)));
    } else if (services.length > 0) {
      setSelectedServiceId(services[0].id);
      setSelectedServiceName(services[0].name);
      setSelectedPrice(services[0].price);
      setInitialPaidAmount(String(Math.round(services[0].price / 2)));
    } else {
      const promo = TRENDING_PROMO_SERVICES[0];
      setSelectedServiceId(promo.id);
      setSelectedServiceName(promo.title);
      setSelectedPrice(promo.price);
      setInitialPaidAmount(String(Math.round(promo.price / 2)));
    }

    if (availableConsultants.length > 0 && !selectedEmployeeUid) {
      setSelectedEmployeeUid(availableConsultants[0].uid);
    }
    setModalOpen(true);
  };

  const handleSubmitRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSubmitting(true);

    const chosenEmp =
      availableConsultants.find((c) => c.uid === selectedEmployeeUid) || availableConsultants[0];
    const clientDisplayName = profile?.displayName || user.displayName || user.email || 'Cliente';
    const reqRef = doc(collection(db, 'advisory_requests'));
    let createdProcessId: string | undefined;

    try {
      if (requestMode === 'assessoria') {
        createdProcessId = `PRC-${Math.floor(1000 + Math.random() * 9000)}`;
        const validDependents = isGroupProcess
          ? familyMembers.filter((m) => m.fullName.trim().length > 0)
          : [];
        const allGroupMembers: ProcessGroupMember[] = isGroupProcess
          ? [
              {
                id: 'titular-0',
                fullName: clientDisplayName,
                relationship: 'titular',
              },
              ...validDependents,
            ]
          : [];
        const memberCount = isGroupProcess ? Math.max(1, allGroupMembers.length) : 1;
        const unitPrice = selectedPrice || 0;
        const totalPrice = unitPrice * memberCount;

        const parsedInitialPaid =
          paymentType === 'full'
            ? totalPrice
            : Math.max(0, Math.min(totalPrice, Number(initialPaidAmount) || 0));
        const remainingAmount = Math.max(0, totalPrice - parsedInitialPaid);
        const computedPaymentStatus: TravelProcess['paymentStatus'] =
          totalPrice > 0 && parsedInitialPaid >= totalPrice
            ? 'paid'
            : parsedInitialPaid > 0
            ? 'partially_paid'
            : 'pending';

        let uploadedProofDocId: string | undefined;
        if (proofFile) {
          const processed = await processUploadedFile(proofFile);
          const docRef = doc(collection(db, 'documents'));
          uploadedProofDocId = docRef.id;

          await setDoc(doc(db, 'document_files', docRef.id), {
            docId: docRef.id,
            processId: createdProcessId,
            clientUid: user.uid,
            uploadedBy: user.uid,
            dataUrl: processed.dataUrl,
            fileName: processed.fileName,
            mimeType: processed.mimeType,
            fileSize: processed.fileSize,
            createdAt: serverTimestamp(),
          });

          await setDoc(docRef, {
            id: docRef.id,
            processId: createdProcessId,
            clientUid: user.uid,
            name: `Comprovativo Pagamento - ${processed.fileName}`,
            fileName: processed.fileName,
            mimeType: processed.mimeType,
            fileSize: processed.fileSize,
            hasFileContent: true,
            isAgencyIssued: false,
            url: `firestore://document_files/${docRef.id}`,
            category: 'payment_proof',
            status: 'uploaded',
            uploadedBy: user.uid,
            createdAt: serverTimestamp(),
          });
        }

        const initialPaymentRecord: PaymentRecord[] =
          parsedInitialPaid > 0
            ? [
                {
                  id: `pay-${Date.now()}`,
                  amount: parsedInitialPaid,
                  method: paymentMethod,
                  date: new Date().toISOString(),
                  note:
                    (paymentType === 'full'
                      ? 'Pagamento completo informado pelo cliente'
                      : installmentMode === 'half_50_50'
                      ? '1ª Parcela (50%) informada pelo cliente'
                      : 'Entrada inicial informada pelo cliente') + ' (aguarda confirmação do operador)',
                  ...(uploadedProofDocId ? { proofDocId: uploadedProofDocId } : {}),
                  recordedBy: user.uid,
                },
              ]
            : [];

        const newProcess: Partial<TravelProcess> = {
          id: createdProcessId,
          clientUid: user.uid,
          clientName: clientDisplayName,
          serviceId: selectedServiceId || 'custom',
          serviceName: selectedServiceName || 'Assessoria Personalizada',
          assignedEmployeeUid: chosenEmp?.uid || '',
          assignedEmployeeName: chosenEmp?.displayName || 'Equipa Vistos Liberdade',
          unitPrice,
          memberCount,
          price: totalPrice,
          isGroupProcess: isGroupProcess && validDependents.length > 0,
          ...(isGroupProcess && validDependents.length > 0
            ? {
                groupName: groupName.trim() || `Grupo Familiar · ${clientDisplayName}`,
                groupMembers: allGroupMembers,
              }
            : {}),
          paidAmount: 0,
          remainingAmount: totalPrice,
          paymentMethod,
          ...(paymentType === 'installments' ? { installmentSchedule: installmentMode } : {}),
          paymentHistory: initialPaymentRecord,
          status: 'pending',
          progress: 15,
          paymentType,
          paymentStatus: 'pending',
          paymentConfirmed: false,
          notes: notes.trim(),
          reminders: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        await setDoc(doc(db, 'processes', createdProcessId), {
          ...newProcess,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }

      const advisoryPayload: AdvisoryRequest = {
        id: reqRef.id,
        clientUid: user.uid,
        clientName: clientDisplayName,
        clientPhone: clientPhone.trim(),
        clientEmail: profile?.email || user.email || '',
        type: requestMode,
        serviceId: selectedServiceId,
        serviceName: selectedServiceName,
        employeeUid: chosenEmp?.uid || '',
        employeeName: chosenEmp?.displayName || 'Equipa Vistos Liberdade',
        preferredDate: requestMode === 'consultoria' ? preferredDate : '',
        preferredTime: requestMode === 'consultoria' ? preferredTime : '',
        notes: notes.trim(),
        ...(createdProcessId ? { processId: createdProcessId } : {}),
        status: 'pending',
        createdAt: new Date().toISOString(),
      };

      await setDoc(reqRef, {
        ...advisoryPayload,
        createdAt: serverTimestamp(),
      });

      // Notificar diretamente o funcionário/operador escolhido
      if (chosenEmp?.uid) {
        const notifRef = doc(collection(db, 'notifications'));
        const groupInfo =
          isGroupProcess && familyMembers.some((m) => m.fullName.trim())
            ? ` (Grupo Familiar: ${activeMemberCount} pessoas)`
            : '';
        const notifPayload: AppNotification = {
          id: notifRef.id,
          recipientUid: chosenEmp.uid,
          recipientName: chosenEmp.displayName,
          senderUid: user.uid,
          senderName: clientDisplayName,
          type: requestMode === 'consultoria' ? 'consultancy_booking' : 'advisory_request',
          title:
            requestMode === 'consultoria'
              ? 'Nova Consultoria Agendada para Si'
              : 'Nova Solicitação de Assessoria para Si',
          message: `${clientDisplayName} selecionou-o(a) para acompanhar "${selectedServiceName}"${groupInfo}.`,
          requestId: reqRef.id,
          ...(createdProcessId ? { processId: createdProcessId } : {}),
          serviceName: selectedServiceName,
          read: false,
          createdAt: new Date().toISOString(),
        };
        await setDoc(notifRef, {
          ...notifPayload,
          createdAt: serverTimestamp(),
        });
      }

      setSubmittedSuccess({
        type: requestMode,
        serviceName: selectedServiceName,
        employeeName: chosenEmp?.displayName || 'Equipa Vistos Liberdade',
        processId: createdProcessId,
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'advisory_requests');
    } finally {
      setSubmitting(false);
    }
  };

  const handleOpenAgencyWhatsApp = (customText?: string) => {
    const raw = (company.phone || '+244929115055').split('/')[0].replace(/[^\d]/g, '');
    const phone = raw.startsWith('244') ? raw : raw.length === 9 ? '244' + raw : raw;
    const text =
      customText ||
      `Olá ${company.name}, sou ${profile?.displayName || 'cliente'} e gostaria de informações sobre pacotes e consultoria.`;
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer');
  };

  const trendingServices = useMemo<TrendingServiceCampaign[]>(() => {
    return TRENDING_PROMO_SERVICES.map((promo) => {
      const override = services.find((s) => s.id === promo.id);
      if (!override) return promo;
      return {
        ...promo,
        title: override.name || promo.title,
        subtitle: override.subtitle || promo.subtitle,
        badgeText: override.badgeText || promo.badgeText,
        description: override.description || promo.description,
        price: typeof override.price === 'number' ? override.price : promo.price,
        category: (override.category as TrendingServiceCampaign['category']) || promo.category,
        imageUrl: override.imageUrl || promo.imageUrl,
        requirements:
          override.features && override.features.length > 0 ? override.features : promo.requirements,
      };
    });
  }, [services]);

  const openCreatePlanModal = () => {
    setEditingServiceDraft({
      name: '',
      subtitle: '',
      badgeText: '',
      price: 0,
      category: 'visa',
      description: '',
      featuresInput: '',
    });
    setServiceEditorOpen(true);
  };

  const openEditPlanModal = (item: {
    id: string;
    name: string;
    subtitle?: string;
    badgeText?: string;
    price: number;
    category?: TravelService['category'];
    description?: string;
    features?: string[];
    imageUrl?: string;
    isTrending?: boolean;
  }) => {
    setEditingServiceDraft({
      id: item.id,
      name: item.name,
      subtitle: item.subtitle || '',
      badgeText: item.badgeText || '',
      price: item.price || 0,
      category: item.category || 'visa',
      description: item.description || '',
      featuresInput: item.features ? item.features.join(', ') : '',
      imageUrl: item.imageUrl,
      isTrending: item.isTrending,
    });
    setServiceEditorOpen(true);
  };

  const handleSaveServicePlan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManagePublicServices) return;
    setSavingService(true);
    try {
      const features = editingServiceDraft.featuresInput
        .split(',')
        .map((f) => f.trim())
        .filter(Boolean);

      const payload: Record<string, any> = {
        name: editingServiceDraft.name.trim(),
        subtitle: editingServiceDraft.subtitle.trim(),
        badgeText: editingServiceDraft.badgeText.trim(),
        price: Number(editingServiceDraft.price) || 0,
        category: editingServiceDraft.category,
        description: editingServiceDraft.description.trim(),
        features,
        ...(editingServiceDraft.imageUrl ? { imageUrl: editingServiceDraft.imageUrl } : {}),
        ...(editingServiceDraft.isTrending !== undefined ? { isTrending: editingServiceDraft.isTrending } : {}),
        updatedAt: serverTimestamp(),
      };

      if (editingServiceDraft.id) {
        await setDoc(
          doc(db, 'services', editingServiceDraft.id),
          { id: editingServiceDraft.id, ...payload },
          { merge: true }
        );
      } else {
        const createdRef = await addDoc(collection(db, 'services'), {
          ...payload,
          createdAt: serverTimestamp(),
        });
        await setDoc(createdRef, { id: createdRef.id }, { merge: true });
      }
      setServiceEditorOpen(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'services');
    } finally {
      setSavingService(false);
    }
  };

  const handlePosterDraftUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const processed = await compressImageToDataUrl(file, 1000, 0.8);
      setEditingServiceDraft((prev) => ({ ...prev, imageUrl: processed.dataUrl }));
    } catch (err) {
      console.error('Erro ao carregar foto do cartaz:', err);
    }
  };

  const handleQuickTrendingPosterUpload = async (
    promo: TrendingServiceCampaign,
    file: File
  ) => {
    if (!canManagePublicServices) return;
    try {
      const processed = await compressImageToDataUrl(file, 1000, 0.8);
      await setDoc(
        doc(db, 'services', promo.id),
        {
          id: promo.id,
          name: promo.title,
          subtitle: promo.subtitle,
          badgeText: promo.badgeText,
          price: promo.price,
          category: promo.category,
          description: promo.description,
          features: promo.requirements,
          imageUrl: processed.dataUrl,
          isTrending: true,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `services/${promo.id}`);
    }
  };

  const handleConfirmDeleteService = async () => {
    if (!serviceToDelete || !canManagePublicServices) return;
    try {
      await deleteDoc(doc(db, 'services', serviceToDelete.id));
      setServiceToDelete(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `services/${serviceToDelete.id}`);
    }
  };

  const filteredCatalog = useMemo(() => {
    if (categoryFilter === 'all') return services;
    return services.filter((s) => s.category === categoryFilter);
  }, [services, categoryFilter]);

  return (
    <div className="space-y-12 pb-16">
      {canManagePublicServices && (
        <div className="rounded-2xl border border-teal/25 bg-teal-light/40 px-5 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-teal text-white flex items-center justify-center shrink-0">
              <SlidersHorizontal className="w-4 h-4" />
            </div>
            <div>
              <p className="text-sm font-bold text-gray-900">Permissão Ativa: Editar Planos & Pacotes Públicos</p>
              <p className="text-xs text-gray-600">
                Pode editar preços, descrições, requisitos e criar novos planos diretamente nesta página.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <Button
              type="button"
              size="sm"
              onClick={openCreatePlanModal}
              className="bg-teal hover:bg-teal-dark text-white font-bold text-xs gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              Novo Plano / Pacote
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => navigate('/admin/services')}
              className="border-teal/30 bg-white text-teal hover:bg-teal-light text-xs font-bold gap-1.5"
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              Gestor Completo
            </Button>
          </div>
        </div>
      )}
      {/* 1. HERO SHOWCASE (Packages & Advisory Focus) */}
      <section className="relative rounded-3xl overflow-hidden bg-gradient-to-br from-[#06322e] via-[#0b534b] to-[#086759] text-white p-8 md:p-12 lg:p-14 shadow-xl">
        <div
          aria-hidden="true"
          className="absolute inset-0 opacity-[0.06] pointer-events-none bg-[radial-gradient(#fff_1px,transparent_1px)] [background-size:22px_22px]"
        />
        <div className="relative z-10 max-w-3xl space-y-6">
          <p className="text-xs font-bold uppercase tracking-widest text-teal-medium">
            {company.name} · {company.address}
          </p>
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight font-display leading-[1.1] text-balance">
            Pacotes de Vistos, Bolsas e Assessoria Consular à Sua Medida
          </h1>
          <p className="text-base text-white/85 max-w-2xl leading-relaxed">
            Olá, <span className="font-bold text-white">{profile?.displayName || profile?.email}</span>. Explore os nossos pacotes em alta, consulte os preços transparentes, escolha o seu consultor e acompanhe cada etapa do seu processo.
          </p>
          <div className="flex flex-wrap items-center gap-4 pt-2">
            <Button
              size="lg"
              onClick={() => openRequestModal('assessoria')}
              className="bg-white text-teal-dark hover:bg-teal-light font-extrabold px-6 h-12 rounded-xl gap-2 shadow-lg whitespace-nowrap"
            >
              Solicitar Assessoria
              <ArrowRight className="w-4 h-4" />
            </Button>
            <Button
              size="lg"
              variant="outline"
              onClick={() => openRequestModal('consultoria')}
              className="border-white/40 bg-white/10 text-white hover:bg-white/20 font-bold px-6 h-12 rounded-xl gap-2 whitespace-nowrap"
            >
              <Calendar className="w-4 h-4" />
              Agendar Consultoria
            </Button>
            <Button
              size="lg"
              variant="ghost"
              onClick={() => navigate('/processes')}
              className="text-white/90 hover:text-white hover:bg-white/10 font-semibold h-12 px-5 rounded-xl whitespace-nowrap"
            >
              Meus Processos
            </Button>
          </div>
        </div>
      </section>

      {/* 2. NOVOS SERVIÇOS EM ALTA (3 Cartazes Oficiais) */}
      <section className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-gray-200 pb-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-teal flex items-center gap-1.5">
              <Flame className="w-4 h-4" />
              Destaques & Campanhas em Alta
            </p>
            <h2 className="text-2xl sm:text-3xl font-black text-gray-900 tracking-tight font-display mt-1">
              Novos Serviços em Alta
            </h2>
          </div>
          <p className="text-sm text-gray-500 max-w-md">
            Programas de bolsas de estudo em Portugal e vistos de trabalho internacional com acompanhamento dedicado.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {trendingServices.map((promo) => (
            <Card
              key={promo.id}
              className="bg-white border border-gray-200 rounded-2xl overflow-hidden flex flex-col justify-between hover:shadow-lg transition-shadow"
            >
              <div>
                <div
                  onClick={() => setPosterPreview(promo)}
                  className="relative aspect-[3/4] bg-gray-100 overflow-hidden cursor-pointer group"
                >
                  <img
                    src={promo.imageUrl}
                    alt={promo.title}
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover object-top group-hover:scale-[1.02] transition-transform duration-300"
                  />
                  {canManagePublicServices && (
                    <label
                      onClick={(e) => e.stopPropagation()}
                      className="absolute top-3 right-3 z-10 inline-flex items-center gap-1.5 text-xs font-bold text-white bg-black/65 hover:bg-teal px-3 py-1.5 rounded-lg backdrop-blur-sm cursor-pointer shadow-md transition-colors"
                    >
                      <Camera className="w-3.5 h-3.5" />
                      Alterar Foto
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          e.target.value = '';
                          if (file) handleQuickTrendingPosterUpload(promo, file);
                        }}
                        className="hidden"
                      />
                    </label>
                  )}
                  <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/75 via-black/30 to-transparent flex items-end justify-between p-4">
                    <span className="text-xs font-bold text-white">{promo.badgeText}</span>
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-white bg-black/40 px-2.5 py-1 rounded-lg backdrop-blur-sm">
                      <Eye className="w-3.5 h-3.5" />
                      Ver Cartaz
                    </span>
                  </div>
                </div>

                <div className="p-6 space-y-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-xs font-semibold text-teal">{promo.subtitle}</p>
                      <h3 className="text-xl font-black text-gray-900 mt-1">{promo.title}</h3>
                    </div>
                    {canManagePublicServices && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          openEditPlanModal({
                            id: promo.id,
                            name: promo.title,
                            subtitle: promo.subtitle,
                            badgeText: promo.badgeText,
                            price: promo.price,
                            category: promo.category,
                            description: promo.description,
                            features: promo.requirements,
                            imageUrl: promo.imageUrl,
                            isTrending: true,
                          })
                        }
                        className="shrink-0 h-8 px-2.5 text-xs font-bold border-teal/30 text-teal hover:bg-teal-light gap-1"
                      >
                        <Edit2 className="w-3 h-3" />
                        Editar
                      </Button>
                    )}
                  </div>
                  <p className="text-sm text-gray-600 leading-relaxed">{promo.description}</p>

                  <div className="space-y-1.5 pt-2 border-t border-gray-100">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400">Requisitos Principais</p>
                    <ul className="grid grid-cols-2 gap-1.5">
                      {promo.requirements.map((req) => (
                        <li key={req} className="text-xs text-gray-700 flex items-center gap-1.5">
                          <CheckCircle2 className="w-3.5 h-3.5 text-teal shrink-0" />
                          <span className="truncate">{req}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>

              <div className="px-6 pb-6 pt-3 border-t border-gray-100 space-y-3 bg-gray-50/40">
                <div className="flex items-baseline justify-between">
                  <span className="text-xs font-bold uppercase text-gray-400">Investimento</span>
                  <span className="text-xl font-black text-teal tabular-nums">
                    {formatCurrency(promo.price)}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() =>
                      openRequestModal('consultoria', {
                        id: promo.id,
                        name: promo.title,
                        price: promo.price,
                      })
                    }
                    className="h-10 text-xs font-bold border-gray-200 hover:border-teal hover:text-teal"
                  >
                    Agendar Consultoria
                  </Button>
                  <Button
                    type="button"
                    onClick={() =>
                      openRequestModal('assessoria', {
                        id: promo.id,
                        name: promo.title,
                        price: promo.price,
                      })
                    }
                    className="h-10 text-xs font-bold bg-teal hover:bg-teal-dark text-white"
                  >
                    Solicitar Assessoria
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </section>

      {/* 3. CATÁLOGO DE PACOTES & PREÇOS */}
      <section className="space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl sm:text-3xl font-black text-gray-900 tracking-tight font-display">
              Pacotes, Vistos & Tabela de Preços
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              Selecione um pacote para abrir processo imediatamente com o consultor da sua preferência.
            </p>
          </div>

          <div className="flex items-center gap-1 p-1 bg-gray-100 rounded-xl border border-gray-200 overflow-x-auto">
            {[
              { id: 'all', label: 'Todos' },
              { id: 'visa', label: 'Vistos' },
              { id: 'package', label: 'Pacotes' },
              { id: 'flight', label: 'Passagens' },
              { id: 'transfer', label: 'Transfers' },
              { id: 'insurance', label: 'Seguros' },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setCategoryFilter(tab.id)}
                className={cn(
                  'px-3.5 py-1.5 text-xs font-bold rounded-lg transition-colors whitespace-nowrap shrink-0',
                  categoryFilter === tab.id ? 'bg-white text-teal shadow-sm' : 'text-gray-600 hover:text-gray-900'
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="py-12 flex justify-center">
            <Loader2 className="w-7 h-7 animate-spin text-teal" />
          </div>
        ) : filteredCatalog.length === 0 ? (
          <Card className="p-10 text-center border border-dashed border-gray-200 bg-white">
            <PlaneTakeoff className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <p className="text-sm font-semibold text-gray-700">
              Sem pacotes adicionais nesta categoria. Consulte os Serviços em Alta acima ou agende uma consultoria personalizada.
            </p>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredCatalog.map((service) => (
              <Card
                key={service.id}
                className="flex flex-col justify-between bg-white border border-gray-200 rounded-2xl overflow-hidden hover:border-teal/50 transition-all"
              >
                {service.imageUrl && (
                  <div className="h-44 bg-gray-100 overflow-hidden">
                    <img
                      src={service.imageUrl}
                      alt={service.name}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover object-top"
                    />
                  </div>
                )}
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between text-xs text-gray-500 mb-2">
                    <span className="font-bold uppercase tracking-wider text-teal">
                      {service.category === 'visa'
                        ? 'Visto & Assessoria'
                        : service.category === 'package'
                        ? 'Pacote Completo'
                        : service.category === 'transfer'
                        ? 'Transfer Aeroporto'
                        : service.category === 'flight'
                        ? 'Bilhética Aérea'
                        : service.category === 'insurance'
                        ? 'Seguro Viagem'
                        : 'Serviço'}
                    </span>
                    <Globe className="w-4 h-4 text-gray-400" />
                  </div>
                  <CardTitle className="text-lg font-bold text-gray-900">{service.name}</CardTitle>
                  {service.description && (
                    <CardDescription className="text-sm text-gray-600 mt-1 line-clamp-3">
                      {service.description}
                    </CardDescription>
                  )}
                </CardHeader>

                <CardContent className="flex-1 pt-0 space-y-3">
                  {service.features && service.features.length > 0 && (
                    <ul className="space-y-1.5 pt-2 border-t border-gray-100">
                      {service.features.map((feat, i) => (
                        <li key={i} className="flex items-center gap-2 text-xs text-gray-700">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                          <span>{feat}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>

                <CardFooter className="pt-4 border-t border-gray-100 flex items-center justify-between gap-2 bg-gray-50/40">
                  <div>
                    <p className="text-[11px] font-bold uppercase text-gray-400">Preço do Pacote</p>
                    <p className="text-xl font-black text-gray-900 tabular-nums">{formatCurrency(service.price)}</p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {canManagePublicServices && (
                      <>
                        <Button
                          type="button"
                          size="icon"
                          variant="outline"
                          title="Editar Plano / Pacote"
                          onClick={() => openEditPlanModal(service)}
                          className="h-9 w-9 border-gray-200 text-teal hover:bg-teal-light"
                        >
                          <Edit2 className="w-4 h-4" />
                        </Button>
                        <Button
                          type="button"
                          size="icon"
                          variant="outline"
                          title="Eliminar Pacote"
                          onClick={() => setServiceToDelete(service)}
                          className="h-9 w-9 border-gray-200 text-red-500 hover:bg-red-50"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </>
                    )}
                    <Button
                      type="button"
                      onClick={() =>
                        openRequestModal('assessoria', {
                          id: service.id,
                          name: service.name,
                          price: service.price,
                        })
                      }
                      className="bg-teal hover:bg-teal-dark text-white font-bold gap-1.5 whitespace-nowrap"
                    >
                      Solicitar
                      <ArrowRight className="w-4 h-4" />
                    </Button>
                  </div>
                </CardFooter>
              </Card>
            ))}
          </div>
        )}
      </section>

      {/* 4. CONSULTORIA PERSONALIZADA & EQUIPA + MINHAS SOLICITAÇÕES */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <Card className="lg:col-span-2 bg-white border border-gray-200 rounded-2xl overflow-hidden">
          <CardHeader className="border-b border-gray-100">
            <CardTitle className="text-xl font-bold flex items-center gap-2">
              <Users className="w-5 h-5 text-teal" />
              Escolha o Seu Consultor & Agende Atendimento
            </CardTitle>
            <CardDescription>
              Selecione diretamente o funcionário que deseja para acompanhar o seu pedido de visto ou consultoria.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-6 space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {availableConsultants.map((c) => {
                const stats = consultantRatings[c.uid];
                return (
                  <div
                    key={c.uid}
                    className="p-4 rounded-xl border border-gray-200 flex items-center justify-between gap-3 hover:border-teal/50 transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-11 h-11 rounded-xl bg-teal-light text-teal font-black flex items-center justify-center shrink-0">
                        {c.displayName[0]?.toUpperCase() || 'C'}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-gray-900 truncate">{c.displayName}</p>
                        <p className="text-xs text-gray-500 truncate">
                          {c.specialty || (c.role === 'admin' ? 'Direção / Consultor Sénior' : 'Consultor de Vistos')}
                        </p>
                        {stats ? (
                          <div className="flex items-center gap-1 text-xs font-bold text-amber-600 mt-0.5">
                            <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                            <span>{stats.avg}</span>
                            <span className="text-gray-400 font-normal">({stats.count} avaliações)</span>
                          </div>
                        ) : (
                          <p className="text-[11px] text-teal font-semibold mt-0.5">Disponível para atendimento</p>
                        )}
                      </div>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setSelectedEmployeeUid(c.uid);
                        openRequestModal('assessoria');
                      }}
                      className="shrink-0 text-xs font-bold border-teal/30 text-teal hover:bg-teal hover:text-white"
                    >
                      Escolher
                    </Button>
                  </div>
                );
              })}
            </div>

            {myRequests.length > 0 && (
              <div className="pt-4 border-t border-gray-100 space-y-3">
                <h4 className="text-sm font-bold text-gray-900">Minhas Consultorias & Solicitações ({myRequests.length})</h4>
                <div className="space-y-2">
                  {myRequests.slice(0, 4).map((req) => (
                    <div
                      key={req.id}
                      className="p-3 rounded-xl bg-gray-50 border border-gray-200 flex flex-wrap items-center justify-between gap-3"
                    >
                      <div>
                        <p className="text-sm font-bold text-gray-900">
                          {req.type === 'consultoria' ? 'Consultoria' : 'Assessoria'} · {req.serviceName || 'Geral'}
                        </p>
                        <p className="text-xs text-gray-500">
                          Consultor: <span className="font-semibold text-gray-700">{req.employeeName}</span>
                          {req.preferredDate ? ` · Data: ${req.preferredDate} ${req.preferredTime || ''}` : ''}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-teal uppercase">
                          {req.status === 'pending'
                            ? 'Pendente'
                            : req.status === 'confirmed'
                            ? 'Confirmado'
                            : req.status === 'completed'
                            ? 'Concluído'
                            : 'Cancelado'}
                        </span>
                        {req.processId && (
                          <Button size="sm" variant="outline" onClick={() => navigate('/processes')} className="h-8 text-xs">
                            Ver Processo
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Contact & Verified Client Reviews */}
        <div className="space-y-6">
          <Card className="border border-gray-200 bg-white rounded-2xl">
            <CardHeader>
              <CardTitle className="text-lg font-bold">Atendimento Directo</CardTitle>
              <CardDescription>{company.subtitle}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <div className="flex items-start gap-3">
                <MapPin className="w-4 h-4 text-teal mt-0.5 shrink-0" />
                <div>
                  <p className="font-bold text-gray-900">{company.address}</p>
                  {company.addressLine2 && <p className="text-xs text-gray-500">{company.addressLine2}</p>}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Phone className="w-4 h-4 text-teal shrink-0" />
                <span className="font-semibold text-gray-700">{company.phone}</span>
              </div>
              <Button
                type="button"
                onClick={() => handleOpenAgencyWhatsApp()}
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold gap-2 h-11"
              >
                <MessageCircle className="w-4 h-4" />
                Falar no WhatsApp da Agência
              </Button>
            </CardContent>
          </Card>

          <Card className="border border-gray-200 bg-white rounded-2xl">
            <CardHeader>
              <CardTitle className="text-lg font-bold flex items-center gap-2">
                <ThumbsUp className="w-4 h-4 text-teal" />
                Avaliações de Clientes ({reviews.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {reviews.length === 0 ? (
                <p className="text-xs text-gray-500">
                  As avaliações verificadas aparecerão aqui após a conclusão dos processos dos clientes.
                </p>
              ) : (
                reviews.slice(0, 3).map((rev) => (
                  <div key={rev.id} className="p-3 rounded-xl bg-gray-50 border border-gray-100 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-gray-900">{rev.clientName}</span>
                      <div className="flex items-center gap-0.5">
                        {Array.from({ length: 5 }).map((_, i) => (
                          <Star
                            key={i}
                            className={cn(
                              'w-3 h-3',
                              i < rev.rating ? 'fill-amber-400 text-amber-400' : 'text-gray-300'
                            )}
                          />
                        ))}
                      </div>
                    </div>
                    <p className="text-[11px] text-teal font-semibold">
                      Consultor: {rev.employeeName} {rev.recommend ? '· Recomenda o serviço' : ''}
                    </p>
                    {rev.comment && <p className="text-xs text-gray-600">{rev.comment}</p>}
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Poster Lightbox Modal */}
      {posterPreview && (
        <div
          onClick={() => setPosterPreview(null)}
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-2xl max-w-3xl w-full max-h-[92vh] overflow-hidden flex flex-col shadow-2xl"
          >
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-gray-900">{posterPreview.title}</h3>
                <p className="text-xs text-gray-500">{posterPreview.subtitle}</p>
              </div>
              <Button variant="ghost" size="icon" onClick={() => setPosterPreview(null)} className="rounded-full">
                <X className="w-5 h-5" />
              </Button>
            </div>
            <div className="flex-1 overflow-y-auto bg-gray-100 p-4 flex justify-center">
              <img
                src={posterPreview.imageUrl}
                alt={posterPreview.title}
                referrerPolicy="no-referrer"
                className="max-h-[68vh] w-auto object-contain rounded-xl shadow"
              />
            </div>
            <div className="p-4 border-t border-gray-100 flex flex-wrap items-center justify-between gap-3 bg-white">
              <div>
                <p className="text-xs text-gray-500">Valor do Pacote</p>
                <p className="text-lg font-black text-teal">{formatCurrency(posterPreview.price)}</p>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    const p = posterPreview;
                    setPosterPreview(null);
                    openRequestModal('consultoria', { id: p.id, name: p.title, price: p.price });
                  }}
                >
                  Agendar Consultoria
                </Button>
                <Button
                  onClick={() => {
                    const p = posterPreview;
                    setPosterPreview(null);
                    openRequestModal('assessoria', { id: p.id, name: p.title, price: p.price });
                  }}
                  className="bg-teal hover:bg-teal-dark text-white"
                >
                  Solicitar Assessoria
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Agendar Consultoria / Solicitar Assessoria com Escolha de Funcionário */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <Card className="w-full max-w-xl bg-white rounded-2xl shadow-2xl border border-gray-200 max-h-[92vh] flex flex-col overflow-hidden">
            <CardHeader className="border-b border-gray-100 flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-xl font-bold">
                  {requestMode === 'consultoria' ? 'Agendar Consultoria' : 'Solicitar Assessoria'}
                </CardTitle>
                <CardDescription>
                  Escolha o pacote, defina o funcionário para o acompanhar e envie o seu pedido.
                </CardDescription>
              </div>
              <Button variant="ghost" size="icon" onClick={() => setModalOpen(false)} className="rounded-full">
                <X className="w-5 h-5" />
              </Button>
            </CardHeader>

            <CardContent className="p-6 overflow-y-auto">
              {submittedSuccess ? (
                <div className="text-center space-y-5 py-4">
                  <div className="w-14 h-14 rounded-2xl bg-emerald-50 text-emerald-600 mx-auto flex items-center justify-center">
                    <CheckCircle2 className="w-8 h-8" />
                  </div>
                  <div className="space-y-1">
                    <h4 className="text-lg font-black text-gray-900">Pedido Registado com Sucesso</h4>
                    <p className="text-sm text-gray-600">
                      Serviço: <strong>{submittedSuccess.serviceName}</strong>
                    </p>
                    <p className="text-sm text-gray-600">
                      Consultor atribuído: <strong>{submittedSuccess.employeeName}</strong>
                    </p>
                    {submittedSuccess.processId && (
                      <p className="text-xs font-mono text-teal font-bold pt-1">
                        Processo criado: {submittedSuccess.processId}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col sm:flex-row gap-3 pt-2">
                    {submittedSuccess.processId && (
                      <Button
                        onClick={() => {
                          setModalOpen(false);
                          navigate('/processes');
                        }}
                        className="flex-1 bg-teal hover:bg-teal-dark text-white font-bold"
                      >
                        Acompanhar em Meus Processos
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      onClick={() =>
                        handleOpenAgencyWhatsApp(
                          `Olá ${company.name}, acabei de solicitar ${submittedSuccess.type} para "${submittedSuccess.serviceName}" com o consultor ${submittedSuccess.employeeName}.`
                        )
                      }
                      className="flex-1 border-emerald-200 text-emerald-700 hover:bg-emerald-50 font-bold gap-2"
                    >
                      <MessageCircle className="w-4 h-4" />
                      Confirmar via WhatsApp
                    </Button>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleSubmitRequest} className="space-y-4">
                  {/* Switch Consultoria vs Assessoria */}
                  <div className="grid grid-cols-2 p-1 bg-gray-100 rounded-xl border border-gray-200">
                    <button
                      type="button"
                      onClick={() => setRequestMode('assessoria')}
                      className={cn(
                        'py-2 px-3 rounded-lg text-xs font-bold transition-colors',
                        requestMode === 'assessoria' ? 'bg-white text-teal shadow-sm' : 'text-gray-600'
                      )}
                    >
                      Solicitar Assessoria (Abrir Processo)
                    </button>
                    <button
                      type="button"
                      onClick={() => setRequestMode('consultoria')}
                      className={cn(
                        'py-2 px-3 rounded-lg text-xs font-bold transition-colors',
                        requestMode === 'consultoria' ? 'bg-white text-teal shadow-sm' : 'text-gray-600'
                      )}
                    >
                      Agendar Consultoria
                    </button>
                  </div>

                  {/* Serviço / Pacote */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-gray-600 uppercase">Pacote / Serviço Desejado</label>
                    <select
                      value={selectedServiceId}
                      onChange={(e) => {
                        const val = e.target.value;
                        const promo = trendingServices.find((p) => p.id === val);
                        const svc = services.find((s) => s.id === val);
                        if (promo) {
                          setSelectedServiceId(promo.id);
                          setSelectedServiceName(promo.title);
                          setSelectedPrice(promo.price);
                        } else if (svc) {
                          setSelectedServiceId(svc.id);
                          setSelectedServiceName(svc.name);
                          setSelectedPrice(svc.price);
                        }
                      }}
                      className="w-full h-11 rounded-xl border border-gray-200 bg-gray-50 px-3 text-sm font-semibold text-gray-800"
                    >
                      <optgroup label="Novos Serviços em Alta">
                        {trendingServices.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.title} ({formatCurrency(p.price)})
                          </option>
                        ))}
                      </optgroup>
                      {services.length > 0 && (
                        <optgroup label="Catálogo da Agência">
                          {services.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.name} ({formatCurrency(s.price)})
                            </option>
                          ))}
                        </optgroup>
                      )}
                    </select>
                  </div>

                  {/* Escolher Funcionário */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-gray-600 uppercase flex items-center gap-1.5">
                      <UserCheck className="w-3.5 h-3.5 text-teal" />
                      Escolher Funcionário para Acompanhamento
                    </label>
                    <select
                      required
                      value={selectedEmployeeUid}
                      onChange={(e) => setSelectedEmployeeUid(e.target.value)}
                      className="w-full h-11 rounded-xl border border-gray-200 bg-gray-50 px-3 text-sm font-semibold text-gray-800"
                    >
                      {availableConsultants.map((c) => {
                        const st = consultantRatings[c.uid];
                        return (
                          <option key={c.uid} value={c.uid}>
                            {c.displayName} {st ? `(${st.avg} ★)` : ''}
                          </option>
                        );
                      })}
                    </select>
                  </div>

                  {requestMode === 'consultoria' ? (
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <label className="text-xs font-bold text-gray-600 uppercase">Data Preferida</label>
                        <Input
                          type="date"
                          required
                          value={preferredDate}
                          onChange={(e) => setPreferredDate(e.target.value)}
                          className="h-11 bg-gray-50 border-gray-200"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs font-bold text-gray-600 uppercase">Horário</label>
                        <Input
                          type="time"
                          required
                          value={preferredTime}
                          onChange={(e) => setPreferredTime(e.target.value)}
                          className="h-11 bg-gray-50 border-gray-200"
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {/* Grupo Familiar no Mesmo Processo */}
                      <div className="p-3.5 rounded-xl border border-gray-200 bg-gray-50/70 space-y-3">
                        <div className="flex items-center justify-between gap-2">
                          <div>
                            <p className="text-xs font-bold text-gray-800 uppercase">Tipo de Solicitação</p>
                            <p className="text-[11px] text-gray-500">
                              Agrupe familiares no mesmo serviço e processo único.
                            </p>
                          </div>
                          <div className="flex items-center gap-1 p-1 bg-white rounded-lg border border-gray-200 shrink-0">
                            <button
                              type="button"
                              onClick={() => setIsGroupProcess(false)}
                              className={cn(
                                'px-2.5 py-1 rounded text-[11px] font-bold transition-colors',
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
                                'px-2.5 py-1 rounded text-[11px] font-bold transition-colors',
                                isGroupProcess ? 'bg-teal text-white' : 'text-gray-600'
                              )}
                            >
                              Grupo Familiar
                            </button>
                          </div>
                        </div>

                        {isGroupProcess && (
                          <div className="space-y-3 pt-2 border-t border-gray-200">
                            <div className="space-y-1">
                              <label className="text-[11px] font-bold text-gray-600 uppercase">
                                Nome do Grupo / Família
                              </label>
                              <Input
                                placeholder={`Ex: Família ${profile?.displayName?.split(' ')[0] || 'Cliente'}`}
                                value={groupName}
                                onChange={(e) => setGroupName(e.target.value)}
                                className="h-9 bg-white text-xs"
                              />
                            </div>

                            <div className="space-y-2">
                              <div className="flex items-center justify-between">
                                <span className="text-[11px] font-bold text-gray-600 uppercase">
                                  Membros Adicionais ({familyMembers.length}) + Titular
                                </span>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  onClick={handleAddFamilyMember}
                                  className="h-7 px-2.5 text-[11px] font-bold border-teal/30 text-teal gap-1"
                                >
                                  <Plus className="w-3 h-3" />
                                  Adicionar Membro
                                </Button>
                              </div>

                              {familyMembers.map((member, idx) => (
                                <div
                                  key={member.id}
                                  className="p-2.5 rounded-lg bg-white border border-gray-200 space-y-2"
                                >
                                  <div className="flex items-center justify-between gap-2">
                                    <span className="text-[10px] font-bold text-teal uppercase">
                                      Familiar #{idx + 1}
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() => handleRemoveFamilyMember(member.id)}
                                      className="text-gray-400 hover:text-red-500 p-0.5"
                                      aria-label="Remover membro"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                    <Input
                                      placeholder="Nome completo do familiar"
                                      value={member.fullName}
                                      onChange={(e) =>
                                        handleUpdateFamilyMember(member.id, { fullName: e.target.value })
                                      }
                                      className="h-8 text-xs bg-gray-50"
                                    />
                                    <select
                                      value={member.relationship}
                                      onChange={(e) =>
                                        handleUpdateFamilyMember(member.id, {
                                          relationship: e.target.value as ProcessGroupMember['relationship'],
                                        })
                                      }
                                      className="h-8 rounded-md border border-gray-200 bg-gray-50 px-2 text-xs font-semibold"
                                    >
                                      {FAMILY_RELATIONSHIPS.filter((r) => r.id !== 'titular').map((rel) => (
                                        <option key={rel.id} value={rel.id}>
                                          {rel.label}
                                        </option>
                                      ))}
                                    </select>
                                    <Input
                                      placeholder="BI ou Passaporte (opcional)"
                                      value={member.documentNumber || ''}
                                      onChange={(e) =>
                                        handleUpdateFamilyMember(member.id, { documentNumber: e.target.value })
                                      }
                                      className="h-8 text-xs bg-gray-50"
                                    />
                                    <Input
                                      placeholder="Idade (opcional)"
                                      value={member.age || ''}
                                      onChange={(e) =>
                                        handleUpdateFamilyMember(member.id, { age: e.target.value })
                                      }
                                      className="h-8 text-xs bg-gray-50"
                                    />
                                  </div>
                                </div>
                              ))}
                            </div>

                            <div className="flex items-center justify-between pt-1 text-xs font-bold text-gray-800">
                              <span>
                                Total ({activeMemberCount} {activeMemberCount === 1 ? 'pessoa' : 'pessoas'}):
                              </span>
                              <span className="text-teal text-sm tabular-nums">
                                {formatCurrency(computedTotalPrice)}
                              </span>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Modalidade de Pagamento */}
                      <div className="space-y-2">
                        <label className="text-xs font-bold text-gray-600 uppercase">
                          Modalidade de Pagamento
                        </label>
                        <select
                          value={paymentType}
                          onChange={(e) => {
                            const nextType = e.target.value as 'full' | 'installments';
                            setPaymentType(nextType);
                            if (nextType === 'installments') {
                              setInstallmentMode('half_50_50');
                              setInitialPaidAmount(String(Math.round(computedTotalPrice / 2)));
                            }
                          }}
                          className="w-full h-11 rounded-xl border border-gray-200 bg-gray-50 px-3 text-sm font-semibold text-gray-800"
                        >
                          <option value="full">Pagamento Completo ({formatCurrency(computedTotalPrice)})</option>
                          <option value="installments">
                            Pagamento Parcelado ({formatCurrency(computedTotalPrice)})
                          </option>
                        </select>
                      </div>

                      {paymentType === 'installments' && (
                        <div className="p-3.5 rounded-xl border border-teal/20 bg-teal-light/20 space-y-3">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-bold text-teal-dark uppercase">
                              Plano de Parcelamento
                            </span>
                            <div className="flex gap-1 bg-white p-0.5 rounded-lg border border-gray-200">
                              <button
                                type="button"
                                onClick={() => {
                                  setInstallmentMode('half_50_50');
                                  setInitialPaidAmount(String(Math.round(computedTotalPrice / 2)));
                                }}
                                className={cn(
                                  'px-2.5 py-1 rounded text-[11px] font-bold',
                                  installmentMode === 'half_50_50' ? 'bg-teal text-white' : 'text-gray-600'
                                )}
                              >
                                50% / 50% (Metade)
                              </button>
                              <button
                                type="button"
                                onClick={() => setInstallmentMode('custom')}
                                className={cn(
                                  'px-2.5 py-1 rounded text-[11px] font-bold',
                                  installmentMode === 'custom' ? 'bg-teal text-white' : 'text-gray-600'
                                )}
                              >
                                Valor Inicial Personalizado
                              </button>
                            </div>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div className="space-y-1">
                              <label className="text-[11px] font-bold text-gray-600 uppercase">
                                Valor Pago Inicialmente (Kz)
                              </label>
                              <Input
                                type="number"
                                min={0}
                                max={computedTotalPrice}
                                value={initialPaidAmount}
                                onChange={(e) => {
                                  setInstallmentMode('custom');
                                  setInitialPaidAmount(e.target.value);
                                }}
                                className="h-9 bg-white text-xs font-bold tabular-nums"
                              />
                              <p className="text-[11px] text-gray-500 tabular-nums">
                                Restante após entrada:{' '}
                                <strong className="text-gray-800">
                                  {formatCurrency(Math.max(0, computedTotalPrice - (Number(initialPaidAmount) || 0)))}
                                </strong>
                              </p>
                            </div>

                            <div className="space-y-1">
                              <label className="text-[11px] font-bold text-gray-600 uppercase">
                                Forma de Pagamento
                              </label>
                              <select
                                value={paymentMethod}
                                onChange={(e) => setPaymentMethod(e.target.value)}
                                className="w-full h-9 rounded-md border border-gray-200 bg-white px-2.5 text-xs font-semibold"
                              >
                                {PAYMENT_METHODS.map((m) => (
                                  <option key={m} value={m}>
                                    {m}
                                  </option>
                                ))}
                              </select>
                            </div>
                          </div>

                          <div className="space-y-1">
                            <label className="text-[11px] font-bold text-gray-600 uppercase flex items-center gap-1.5">
                              <Upload className="w-3 h-3 text-teal" />
                              Comprovativo de Pagamento (Opcional)
                            </label>
                            <Input
                              type="file"
                              accept="image/*,.pdf"
                              onChange={(e) => setProofFile(e.target.files?.[0] || null)}
                              className="h-9 bg-white text-xs file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:text-xs file:font-bold file:bg-teal-light file:text-teal"
                            />
                            {proofFile && (
                              <p className="text-[11px] text-emerald-700 font-semibold">
                                Selecionado: {proofFile.name}
                              </p>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-gray-600 uppercase">Seu Telefone / WhatsApp</label>
                    <Input
                      required
                      placeholder="+244 923 000 000"
                      value={clientPhone}
                      onChange={(e) => setClientPhone(e.target.value)}
                      className="h-11 bg-gray-50 border-gray-200"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-gray-600 uppercase">Objetivo / Notas Adicionais</label>
                    <textarea
                      rows={3}
                      placeholder="Ex: Pretendo viajar em Outubro, dúvidas sobre documentação..."
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      className="w-full rounded-xl bg-gray-50 border border-gray-200 p-3 text-sm focus:outline-none focus:ring-2 focus:ring-teal"
                    />
                  </div>

                  <div className="pt-2 flex gap-3">
                    <Button type="button" variant="ghost" onClick={() => setModalOpen(false)} className="flex-1">
                      Cancelar
                    </Button>
                    <Button
                      type="submit"
                      disabled={submitting}
                      className="flex-1 bg-teal hover:bg-teal-dark text-white font-bold gap-2"
                    >
                      {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                      {requestMode === 'consultoria' ? 'Confirmar Agendamento' : 'Solicitar Assessoria'}
                    </Button>
                  </div>
                </form>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Modal: Editar / Criar Plano e Pacote (Utilizadores com Permissão em Serviços Públicos) */}
      {serviceEditorOpen && canManagePublicServices && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <Card className="w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-gray-200 max-h-[90vh] flex flex-col overflow-hidden">
            <CardHeader className="border-b border-gray-100 flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-lg font-bold">
                  {editingServiceDraft.id ? 'Editar Plano / Pacote' : 'Novo Plano / Pacote'}
                </CardTitle>
                <CardDescription>
                  As alterações refletem-se imediatamente no catálogo público e nos preços dos clientes.
                </CardDescription>
              </div>
              <Button variant="ghost" size="icon" onClick={() => setServiceEditorOpen(false)} className="rounded-full">
                <X className="w-5 h-5" />
              </Button>
            </CardHeader>
            <CardContent className="p-6 overflow-y-auto">
              <form onSubmit={handleSaveServicePlan} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-gray-600 uppercase">Categoria</label>
                    <select
                      value={editingServiceDraft.category}
                      onChange={(e) =>
                        setEditingServiceDraft((prev) => ({
                          ...prev,
                          category: e.target.value as NonNullable<TravelService['category']>,
                        }))
                      }
                      className="w-full h-11 rounded-xl border border-gray-200 bg-gray-50 px-3 text-sm font-semibold"
                    >
                      <option value="visa">Visto / Assessoria</option>
                      <option value="package">Pacote Completo</option>
                      <option value="flight">Bilhética Aérea</option>
                      <option value="transfer">Transfer Aeroporto</option>
                      <option value="insurance">Seguro Viagem</option>
                      <option value="hotel">Hotel / Alojamento</option>
                      <option value="other">Outro Serviço</option>
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-gray-600 uppercase">Preço / Tarifa (AOA)</label>
                    <Input
                      type="number"
                      min={0}
                      required
                      value={editingServiceDraft.price || ''}
                      onChange={(e) =>
                        setEditingServiceDraft((prev) => ({ ...prev, price: Number(e.target.value) }))
                      }
                      className="h-11 bg-gray-50 border-gray-200 font-bold tabular-nums"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-gray-600 uppercase">Nome do Plano / Pacote</label>
                  <Input
                    required
                    placeholder="Ex: Visto Schengen - Portugal"
                    value={editingServiceDraft.name}
                    onChange={(e) => setEditingServiceDraft((prev) => ({ ...prev, name: e.target.value }))}
                    className="h-11 bg-gray-50 border-gray-200"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-gray-600 uppercase">Subtítulo (Opcional)</label>
                    <Input
                      placeholder="Ex: Programa Juvenil"
                      value={editingServiceDraft.subtitle}
                      onChange={(e) => setEditingServiceDraft((prev) => ({ ...prev, subtitle: e.target.value }))}
                      className="h-11 bg-gray-50 border-gray-200"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-gray-600 uppercase">Etiqueta / Destaque</label>
                    <Input
                      placeholder="Ex: Mais Procurado"
                      value={editingServiceDraft.badgeText}
                      onChange={(e) => setEditingServiceDraft((prev) => ({ ...prev, badgeText: e.target.value }))}
                      className="h-11 bg-gray-50 border-gray-200"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-gray-600 uppercase">Descrição</label>
                  <textarea
                    rows={3}
                    placeholder="Explique o que inclui este plano..."
                    value={editingServiceDraft.description}
                    onChange={(e) => setEditingServiceDraft((prev) => ({ ...prev, description: e.target.value }))}
                    className="w-full rounded-xl bg-gray-50 border border-gray-200 p-3 text-sm focus:outline-none focus:ring-2 focus:ring-teal"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-gray-600 uppercase flex items-center gap-1.5">
                    <ImageIcon className="w-3.5 h-3.5 text-teal" />
                    Foto do Cartaz / Capa
                  </label>
                  <div className="p-3 rounded-xl border border-gray-200 bg-gray-50 flex items-center gap-4">
                    {editingServiceDraft.imageUrl ? (
                      <img
                        src={editingServiceDraft.imageUrl}
                        alt="Pré-visualização do cartaz"
                        className="w-16 h-20 rounded-lg object-cover border border-gray-200 shrink-0 bg-white"
                      />
                    ) : (
                      <div className="w-16 h-20 rounded-lg border border-dashed border-gray-300 bg-white flex items-center justify-center text-gray-400 shrink-0">
                        <ImageIcon className="w-5 h-5" />
                      </div>
                    )}
                    <div className="flex-1 space-y-2 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-teal text-white text-xs font-bold cursor-pointer hover:bg-teal-dark transition-colors">
                          <Upload className="w-3.5 h-3.5" />
                          Carregar Nova Foto
                          <input
                            type="file"
                            accept="image/*"
                            onChange={handlePosterDraftUpload}
                            className="hidden"
                          />
                        </label>
                        {editingServiceDraft.imageUrl && (
                          <button
                            type="button"
                            onClick={() => setEditingServiceDraft((prev) => ({ ...prev, imageUrl: '' }))}
                            className="text-xs font-semibold text-red-600 hover:underline"
                          >
                            Remover Foto
                          </button>
                        )}
                      </div>
                      <Input
                        placeholder="Ou cole o URL da imagem do cartaz..."
                        value={editingServiceDraft.imageUrl || ''}
                        onChange={(e) => setEditingServiceDraft((prev) => ({ ...prev, imageUrl: e.target.value }))}
                        className="h-9 bg-white border-gray-200 text-xs"
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-gray-600 uppercase">
                    Inclusões / Requisitos (separados por vírgula)
                  </label>
                  <Input
                    placeholder="Ex: Passaporte Válido, Cópia do BI, Seguro Viagem"
                    value={editingServiceDraft.featuresInput}
                    onChange={(e) => setEditingServiceDraft((prev) => ({ ...prev, featuresInput: e.target.value }))}
                    className="h-11 bg-gray-50 border-gray-200"
                  />
                </div>

                <div className="flex justify-end gap-3 pt-2">
                  <Button type="button" variant="ghost" onClick={() => setServiceEditorOpen(false)}>
                    Cancelar
                  </Button>
                  <Button
                    type="submit"
                    disabled={savingService}
                    className="bg-teal hover:bg-teal-dark text-white font-bold gap-2"
                  >
                    {savingService ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    Guardar Plano
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Modal: Confirmação para Eliminar Pacote */}
      {serviceToDelete && canManagePublicServices && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <Card className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden">
            <CardHeader className="border-b border-gray-100">
              <CardTitle className="text-lg font-bold text-red-700 flex items-center gap-2">
                <Trash2 className="w-5 h-5" />
                Eliminar Pacote
              </CardTitle>
              <CardDescription>
                Tem a certeza que deseja eliminar o pacote <strong>{serviceToDelete.name}</strong>? Esta ação não pode ser anulada.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-6 flex justify-end gap-3">
              <Button type="button" variant="ghost" onClick={() => setServiceToDelete(null)}>
                Cancelar
              </Button>
              <Button
                type="button"
                onClick={handleConfirmDeleteService}
                className="bg-red-600 hover:bg-red-700 text-white font-bold gap-2"
              >
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
