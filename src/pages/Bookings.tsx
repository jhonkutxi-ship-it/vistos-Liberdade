/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect } from 'react';
import {
  collection,
  onSnapshot,
  query,
  where,
  orderBy,
  addDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  doc,
  serverTimestamp,
} from 'firebase/firestore';
import { db, OperationType, handleFirestoreError } from '@/src/firebase';
import { useAuth } from '@/src/hooks/useAuth';
import { useCompanySettings } from '@/src/hooks/useCompanySettings';
import { BookingServiceOption, TransferBooking } from '@/src/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/src/components/ui/Card';
import { Badge } from '@/src/components/ui/Badge';
import { Button } from '@/src/components/ui/Button';
import { Input } from '@/src/components/ui/Input';
import {
  Car,
  Calendar,
  Clock,
  MapPin,
  Users,
  CheckCircle2,
  ArrowRight,
  Info,
  ShieldCheck,
  ChevronRight,
  Search,
  Loader2,
  Edit2,
  Plus,
  Trash2,
  Plane,
  SlidersHorizontal,
  Save,
  X,
} from 'lucide-react';
import { TRANSFER_TIERS } from '@/src/constants';
import { formatCurrency, cn } from '@/src/lib/utils';

export function Bookings() {
  const { profile, user } = useAuth();
  const { company } = useCompanySettings();
  const isAdmin = profile?.role === 'admin';
  const isEmployee = profile?.role === 'employee';
  const isStaff = isAdmin || isEmployee;

  const [bookingServices, setBookingServices] = useState<BookingServiceOption[]>([]);
  const [servicesLoaded, setServicesLoaded] = useState(false);

  const [selectedTier, setSelectedTier] = useState('standard');
  const [step, setStep] = useState(1);
  const [bookingSearchTerm, setBookingSearchTerm] = useState('');
  const [bookings, setBookings] = useState<TransferBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Booking form state
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [pickup, setPickup] = useState('');
  const [dropoff, setDropoff] = useState('');

  // Staff Service Editor modal state
  const [serviceModalOpen, setServiceModalOpen] = useState(false);
  const [savingService, setSavingService] = useState(false);
  const [serviceToDelete, setServiceToDelete] = useState<BookingServiceOption | null>(null);
  const [serviceDraft, setServiceDraft] = useState<BookingServiceOption>({
    id: '',
    name: '',
    description: '',
    price: 0,
    category: 'transfer',
    active: true,
  });

  // Booking detail/manage modal state
  const [activeBooking, setActiveBooking] = useState<TransferBooking | null>(null);
  const [bookingStatusDraft, setBookingStatusDraft] = useState<TransferBooking['status']>('pending');
  const [bookingPriceDraft, setBookingPriceDraft] = useState<number>(0);
  const [bookingDateDraft, setBookingDateDraft] = useState('');
  const [bookingTimeDraft, setBookingTimeDraft] = useState('');
  const [savingBookingEdit, setSavingBookingEdit] = useState(false);

  useEffect(() => {
    if (!user) return;

    const unsubServices = onSnapshot(
      collection(db, 'booking_services'),
      (snapshot) => {
        const list = snapshot.docs.map((d) => ({ ...d.data(), id: d.id }) as BookingServiceOption);
        setBookingServices(list);
        setServicesLoaded(true);
      },
      () => setServicesLoaded(true)
    );

    const q = isStaff
      ? query(collection(db, 'bookings'), orderBy('date', 'desc'))
      : query(collection(db, 'bookings'), where('clientUid', '==', user.uid));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const bookingsData = snapshot.docs.map((d) => ({
          ...d.data(),
          id: d.id,
        })) as TransferBooking[];
        bookingsData.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
        setBookings(bookingsData);
        setLoading(false);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, 'bookings');
        setLoading(false);
      }
    );

    return () => {
      unsubServices();
      unsubscribe();
    };
  }, [user, isStaff]);

  const effectiveServices = useMemo<BookingServiceOption[]>(() => {
    const defaults: BookingServiceOption[] = TRANSFER_TIERS.map((t) => ({
      id: t.id,
      name: t.name,
      description: t.description,
      price: t.price,
      category: t.category || 'transfer',
      active: true,
    }));

    if (!servicesLoaded || bookingServices.length === 0) {
      return defaults;
    }

    const byId = new Map<string, BookingServiceOption>();
    defaults.forEach((d) => byId.set(d.id, d));
    bookingServices.forEach((s) => byId.set(s.id, s));

    const all = Array.from(byId.values());
    return isStaff ? all : all.filter((s) => s.active !== false);
  }, [bookingServices, servicesLoaded, isStaff]);

  useEffect(() => {
    if (effectiveServices.length > 0 && !effectiveServices.some((s) => s.id === selectedTier)) {
      setSelectedTier(effectiveServices[0].id);
    }
  }, [effectiveServices, selectedTier]);

  const selectedServiceObj = useMemo(
    () => effectiveServices.find((s) => s.id === selectedTier) || effectiveServices[0],
    [effectiveServices, selectedTier]
  );

  const handleOpenCreateService = () => {
    setServiceDraft({
      id: '',
      name: '',
      description: '',
      price: 25000,
      category: 'transfer',
      active: true,
    });
    setServiceModalOpen(true);
  };

  const handleOpenEditService = (srv: BookingServiceOption) => {
    setServiceDraft({ ...srv, active: srv.active !== false });
    setServiceModalOpen(true);
  };

  const handleSaveBookingService = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isStaff || !serviceDraft.name.trim()) return;
    setSavingService(true);
    try {
      const targetId =
        serviceDraft.id ||
        `srv-${serviceDraft.name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/(^-|-$)/g, '')
          .slice(0, 24)}-${Date.now().toString().slice(-4)}`;

      await setDoc(
        doc(db, 'booking_services', targetId),
        {
          id: targetId,
          name: serviceDraft.name.trim(),
          description: serviceDraft.description.trim(),
          price: Number(serviceDraft.price) || 0,
          category: serviceDraft.category,
          active: serviceDraft.active !== false,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
      setServiceModalOpen(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'booking_services');
    } finally {
      setSavingService(false);
    }
  };

  const handleConfirmDeleteService = async () => {
    if (!serviceToDelete || !isStaff) return;
    try {
      const isDefault = TRANSFER_TIERS.some((t) => t.id === serviceToDelete.id);
      if (isDefault) {
        await setDoc(
          doc(db, 'booking_services', serviceToDelete.id),
          { ...serviceToDelete, active: false, updatedAt: serverTimestamp() },
          { merge: true }
        );
      } else {
        await deleteDoc(doc(db, 'booking_services', serviceToDelete.id));
      }
      setServiceToDelete(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `booking_services/${serviceToDelete.id}`);
    }
  };

  const handleBooking = async () => {
    if (!user || !date || !time || !pickup || !dropoff) return;

    setSubmitting(true);
    try {
      const bookingId = `BK-${Math.floor(1000 + Math.random() * 9000)}`;
      const tierData = selectedServiceObj;

      const newBooking: Partial<TransferBooking> = {
        id: bookingId,
        clientUid: user.uid,
        clientName: profile?.displayName || user.email || 'Cliente',
        tier: tierData?.id || selectedTier,
        serviceName: tierData?.name || selectedTier,
        date,
        time,
        pickupLocation: pickup,
        dropoffLocation: dropoff,
        status: 'pending',
        price: tierData?.price || 0,
      };

      await addDoc(collection(db, 'bookings'), {
        ...newBooking,
        createdAt: serverTimestamp(),
      });

      setStep(3);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'bookings');
    } finally {
      setSubmitting(false);
    }
  };

  const handleOpenBookingDetails = (b: TransferBooking) => {
    setActiveBooking(b);
    setBookingStatusDraft(b.status);
    setBookingPriceDraft(b.price || 0);
    setBookingDateDraft(b.date);
    setBookingTimeDraft(b.time);
  };

  const handleSaveBookingDetails = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeBooking || !isStaff) return;
    setSavingBookingEdit(true);
    try {
      await updateDoc(doc(db, 'bookings', activeBooking.id), {
        status: bookingStatusDraft,
        price: Number(bookingPriceDraft) || 0,
        date: bookingDateDraft,
        time: bookingTimeDraft,
      });
      setActiveBooking(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `bookings/${activeBooking.id}`);
    } finally {
      setSavingBookingEdit(false);
    }
  };

  const handleWhatsAppSupport = () => {
    const raw = (company.phone || '+244929115055').split('/')[0].replace(/[^\d]/g, '');
    const phone = raw.startsWith('244') ? raw : raw.length === 9 ? '244' + raw : raw;
    const text = `Olá ${company.name}, gostaria de apoio personalizado para Reservas, Transfer ou Bilhete Aéreo.`;
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer');
  };

  const filteredBookings = useMemo(() => {
    return bookings.filter(
      (b) =>
        b.id.toLowerCase().includes(bookingSearchTerm.toLowerCase()) ||
        (b.serviceName || b.tier).toLowerCase().includes(bookingSearchTerm.toLowerCase()) ||
        (b.clientName || '').toLowerCase().includes(bookingSearchTerm.toLowerCase()) ||
        b.pickupLocation?.toLowerCase().includes(bookingSearchTerm.toLowerCase()) ||
        b.dropoffLocation?.toLowerCase().includes(bookingSearchTerm.toLowerCase())
    );
  }, [bookings, bookingSearchTerm]);

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 tracking-tight font-display">
            Reservas, Transfers & Bilhetes
          </h1>
          <p className="text-gray-500 mt-1">
            Agende transporte de/para o aeroporto, reservas VIP ou emissão de bilhetes aéreos.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {isStaff && (
            <Button
              type="button"
              onClick={handleOpenCreateService}
              className="bg-teal hover:bg-teal-dark text-white font-bold text-xs gap-2 h-10 px-4 rounded-xl shadow"
            >
              <Plus className="w-4 h-4" />
              Novo Serviço de Reserva / Bilhete
            </Button>
          )}
          <div className="flex items-center gap-2 bg-teal-light/60 px-4 py-2 rounded-lg border border-teal/20">
            <ShieldCheck className="w-5 h-5 text-teal" />
            <span className="text-sm font-semibold text-teal-dark">Acompanhamento & Seguro Incluídos</span>
          </div>
        </div>
      </div>

      {isStaff && (
        <div className="rounded-2xl border border-teal/25 bg-teal-light/40 px-5 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-teal text-white flex items-center justify-center shrink-0">
              <SlidersHorizontal className="w-4 h-4" />
            </div>
            <div>
              <p className="text-sm font-bold text-gray-900">Modo Operador: Editar Serviços de Reservas & Bilhetes</p>
              <p className="text-xs text-gray-600">
                Clique no ícone de edição em qualquer serviço abaixo para alterar o título, descrição, categoria ou tarifa.
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-8">
          <Card className="shadow-lg border-none overflow-hidden">
            <CardHeader className="bg-gradient-to-r from-[#06322e] via-[#0B7B6B] to-[#086759] text-white p-8">
              <div className="flex items-center gap-4 mb-4">
                <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center backdrop-blur-md">
                  <Car className="w-6 h-6 text-white" />
                </div>
                <div>
                  <CardTitle className="text-2xl">Novo Agendamento</CardTitle>
                  <CardDescription className="text-white/80">
                    Escolha o serviço de transfer ou bilhete que melhor se adapta às suas necessidades.
                  </CardDescription>
                </div>
              </div>
              <div className="flex items-center gap-2 mt-6">
                {[1, 2, 3].map((s) => (
                  <div key={s} className="flex items-center gap-2">
                    <div
                      className={cn(
                        'w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all duration-300',
                        step >= s ? 'bg-white text-teal border-white' : 'bg-transparent text-white/60 border-white/40'
                      )}
                    >
                      {s}
                    </div>
                    {s < 3 && <div className={cn('w-8 h-0.5 rounded-full', step > s ? 'bg-white' : 'bg-white/40')}></div>}
                  </div>
                ))}
              </div>
            </CardHeader>

            <CardContent className="p-8">
              {step === 1 && (
                <div className="space-y-6 animate-in slide-in-from-right-4 duration-300">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-lg font-semibold text-gray-900">Selecione o Serviço</h3>
                    {isStaff && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={handleOpenCreateService}
                        className="text-xs font-bold border-teal/30 text-teal hover:bg-teal-light gap-1.5"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        Adicionar Opção
                      </Button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {effectiveServices.map((tier) => {
                      const isInactive = tier.active === false;
                      return (
                        <div
                          key={tier.id}
                          onClick={() => !isInactive && setSelectedTier(tier.id)}
                          className={cn(
                            'flex flex-col justify-between p-5 rounded-xl border-2 text-left transition-all duration-200 group relative overflow-hidden cursor-pointer',
                            isInactive && 'opacity-50',
                            selectedTier === tier.id
                              ? 'border-teal bg-teal-light/25 shadow-md ring-4 ring-teal/10'
                              : 'border-gray-100 bg-white hover:border-gray-200 hover:shadow-sm'
                          )}
                        >
                          <div>
                            <div className="flex justify-between items-start mb-3 gap-2">
                              <div
                                className={cn(
                                  'p-2 rounded-lg transition-colors',
                                  selectedTier === tier.id
                                    ? 'bg-teal text-white'
                                    : 'bg-gray-100 text-gray-500 group-hover:bg-gray-200'
                                )}
                              >
                                {tier.category === 'flight' ? (
                                  <Plane className="w-5 h-5" />
                                ) : (
                                  <Car className="w-5 h-5" />
                                )}
                              </div>

                              <div className="flex items-center gap-2">
                                {isStaff && (
                                  <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                                    <button
                                      type="button"
                                      title="Editar Serviço"
                                      onClick={() => handleOpenEditService(tier)}
                                      className="p-1.5 rounded-lg bg-gray-100 hover:bg-teal-light text-gray-600 hover:text-teal transition-colors"
                                    >
                                      <Edit2 className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                      type="button"
                                      title="Desativar / Eliminar Serviço"
                                      onClick={() => setServiceToDelete(tier)}
                                      className="p-1.5 rounded-lg bg-gray-100 hover:bg-red-50 text-gray-500 hover:text-red-600 transition-colors"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                )}
                                <div className="text-right">
                                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                                    {tier.category === 'flight' ? 'Tarifa Base' : 'A partir de'}
                                  </p>
                                  <p className="text-lg font-bold text-gray-900 tabular-nums">
                                    {formatCurrency(tier.price)}
                                  </p>
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center gap-2">
                              <h4 className="font-bold text-gray-900">{tier.name}</h4>
                              {isInactive && (
                                <span className="text-[10px] font-bold uppercase text-red-600">Inativo</span>
                              )}
                            </div>
                            <p className="text-xs text-gray-500 mt-1">{tier.description}</p>
                          </div>

                          {selectedTier === tier.id && !isInactive && (
                            <div className="mt-3 flex items-center gap-1 text-[11px] font-bold text-teal">
                              <CheckCircle2 className="w-4 h-4" />
                              Selecionado
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  <div className="flex justify-end mt-8">
                    <Button
                      onClick={() => setStep(2)}
                      disabled={!selectedServiceObj || selectedServiceObj.active === false}
                      className="gap-2 px-8 bg-teal hover:bg-teal-dark text-white"
                    >
                      Próximo Passo
                      <ArrowRight className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              )}

              {step === 2 && (
                <div className="space-y-8 animate-in slide-in-from-right-4 duration-300">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="text-sm font-semibold text-gray-700">Data da Viagem / Voo</label>
                      <div className="relative">
                        <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <Input
                          type="date"
                          className="pl-10"
                          value={date}
                          onChange={(e) => setDate(e.target.value)}
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-semibold text-gray-700">Horário</label>
                      <div className="relative">
                        <Clock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <Input
                          type="time"
                          className="pl-10"
                          value={time}
                          onChange={(e) => setTime(e.target.value)}
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-semibold text-gray-700">
                        {selectedServiceObj?.category === 'flight' ? 'Origem (Aeroporto / Cidade)' : 'Local de Recolha'}
                      </label>
                      <div className="relative">
                        <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <Input
                          placeholder="Ex: Aeroporto 4 de Fevereiro / Luanda"
                          className="pl-10"
                          value={pickup}
                          onChange={(e) => setPickup(e.target.value)}
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-semibold text-gray-700">Destino</label>
                      <div className="relative">
                        <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <Input
                          placeholder="Ex: Lisboa / Hotel Epic Sana"
                          className="pl-10"
                          value={dropoff}
                          onChange={(e) => setDropoff(e.target.value)}
                        />
                      </div>
                    </div>
                  </div>
                  <div className="flex justify-between mt-8">
                    <Button variant="outline" onClick={() => setStep(1)}>
                      Voltar
                    </Button>
                    <Button
                      onClick={handleBooking}
                      disabled={submitting || !date || !time || !pickup || !dropoff}
                      className="gap-2 px-8 bg-teal hover:bg-teal-dark text-white"
                    >
                      {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Confirmar Agendamento'}
                    </Button>
                  </div>
                </div>
              )}

              {step === 3 && (
                <div className="space-y-8 animate-in zoom-in-95 duration-300 text-center py-8">
                  <div className="mx-auto w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mb-6">
                    <CheckCircle2 className="w-10 h-10 text-green-600" />
                  </div>
                  <div>
                    <h3 className="text-2xl font-bold text-gray-900">Pedido Enviado com Sucesso!</h3>
                    <p className="text-gray-500 mt-2 max-w-md mx-auto">
                      Seu agendamento para o serviço <strong>{selectedServiceObj?.name}</strong> foi recebido.
                      A nossa equipa entrará em contacto em breve para confirmar os detalhes.
                    </p>
                  </div>
                  <div className="bg-gray-50 p-6 rounded-xl max-w-sm mx-auto border border-gray-100 space-y-3">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Serviço:</span>
                      <span className="font-semibold text-gray-900">{selectedServiceObj?.name}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Valor Estimado:</span>
                      <span className="font-bold text-teal">
                        {formatCurrency(selectedServiceObj?.price || 0)}
                      </span>
                    </div>
                  </div>
                  <div className="flex justify-center gap-4">
                    <Button variant="outline" onClick={() => setStep(1)}>
                      Novo Agendamento
                    </Button>
                    <Button onClick={() => setStep(1)} className="bg-teal hover:bg-teal-dark text-white">
                      Ver Meus Pedidos
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card className="shadow-sm border-gray-100">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Info className="w-5 h-5 text-teal" />
                  Informações Importantes
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-3">
                  <div className="w-5 h-5 rounded-full bg-teal-light flex items-center justify-center flex-shrink-0 mt-0.5">
                    <span className="text-[10px] font-bold text-teal">1</span>
                  </div>
                  <p className="text-xs text-gray-600">Cancelamentos devem ser feitos com pelo menos 24h de antecedência.</p>
                </div>
                <div className="flex gap-3">
                  <div className="w-5 h-5 rounded-full bg-teal-light flex items-center justify-center flex-shrink-0 mt-0.5">
                    <span className="text-[10px] font-bold text-teal">2</span>
                  </div>
                  <p className="text-xs text-gray-600">O motorista aguardará por até 45 minutos após o pouso do voo.</p>
                </div>
                <div className="flex gap-3">
                  <div className="w-5 h-5 rounded-full bg-teal-light flex items-center justify-center flex-shrink-0 mt-0.5">
                    <span className="text-[10px] font-bold text-teal">3</span>
                  </div>
                  <p className="text-xs text-gray-600">Tarifas de bilhética incluem emissão segura e assistência de embarque.</p>
                </div>
              </CardContent>
            </Card>
            <Card className="shadow-sm border-gray-100 bg-teal text-white">
              <CardHeader>
                <CardTitle className="text-lg">Suporte VIP</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-white/85">
                  Tem um pedido especial ou precisa de um serviço personalizado para grupos grandes?
                </p>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={handleWhatsAppSupport}
                  className="w-full mt-6 text-teal font-bold bg-white hover:bg-teal-light"
                >
                  Falar no WhatsApp
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>

        <div className="space-y-8">
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-bold text-gray-900 flex items-center gap-2">
              <Clock className="w-5 h-5 text-teal" />
              Agendamentos ({filteredBookings.length})
            </h3>
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              placeholder="Buscar agendamento..."
              className="pl-10 h-10 text-sm"
              value={bookingSearchTerm}
              onChange={(e) => setBookingSearchTerm(e.target.value)}
            />
          </div>

          <div className="space-y-4">
            {loading ? (
              <div className="py-10 flex justify-center">
                <Loader2 className="w-6 h-6 animate-spin text-teal" />
              </div>
            ) : filteredBookings.length > 0 ? (
              filteredBookings.map((booking) => (
                <Card key={booking.id} className="shadow-sm border-gray-100 hover:border-teal/40 transition-colors group">
                  <CardContent className="p-5">
                    <div className="flex justify-between items-start mb-4 gap-2">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-10 h-10 rounded-lg bg-gray-50 flex items-center justify-center group-hover:bg-teal-light transition-colors shrink-0">
                          <Car className="w-5 h-5 text-gray-400 group-hover:text-teal" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-gray-900 truncate">
                            {booking.serviceName || booking.tier}
                          </p>
                          <p className="text-[10px] text-gray-500 uppercase tracking-wider truncate">
                            {booking.clientName ? `${booking.clientName} · ` : ''}
                            {booking.id}
                          </p>
                        </div>
                      </div>
                      <Badge
                        variant={
                          booking.status === 'confirmed' || booking.status === 'completed'
                            ? 'success'
                            : booking.status === 'cancelled'
                            ? 'danger'
                            : 'warning'
                        }
                      >
                        {booking.status === 'confirmed'
                          ? 'Confirmado'
                          : booking.status === 'completed'
                          ? 'Concluído'
                          : booking.status === 'cancelled'
                          ? 'Cancelado'
                          : 'Pendente'}
                      </Badge>
                    </div>
                    <div className="space-y-2.5">
                      <div className="flex items-center gap-3 text-xs text-gray-600">
                        <Calendar className="w-4 h-4 text-gray-400" />
                        {booking.date} às {booking.time}
                      </div>
                      <div className="flex items-center gap-3 text-xs text-gray-600">
                        <MapPin className="w-4 h-4 text-gray-400" />
                        <span className="truncate">
                          {booking.pickupLocation} → {booking.dropoffLocation}
                        </span>
                      </div>
                      {typeof booking.price === 'number' && (
                        <p className="text-xs font-bold text-teal tabular-nums">
                          Valor: {formatCurrency(booking.price)}
                        </p>
                      )}
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => handleOpenBookingDetails(booking)}
                      className="w-full mt-4 text-teal hover:bg-teal-light group-hover:bg-teal-light font-bold"
                    >
                      {isStaff ? 'Gerir / Editar Reserva' : 'Ver Detalhes'}
                      <ChevronRight className="w-4 h-4 ml-1" />
                    </Button>
                  </CardContent>
                </Card>
              ))
            ) : (
              <div className="text-center py-8 text-gray-500 text-sm">Nenhum agendamento encontrado.</div>
            )}
          </div>

          <Card className="bg-gray-900 text-white border-none shadow-xl">
            <CardContent className="p-6">
              <div className="flex items-center gap-3 mb-4">
                <Users className="w-6 h-6 text-teal-light" />
                <h4 className="font-bold">Avaliação dos Clientes</h4>
              </div>
              <div className="flex items-center gap-1 mb-2">
                {[1, 2, 3, 4, 5].map((i) => (
                  <svg key={i} className="w-4 h-4 text-yellow-400 fill-current" viewBox="0 0 20 20">
                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                  </svg>
                ))}
                <span className="text-xs font-bold ml-2">4.9/5</span>
              </div>
              <p className="text-xs text-gray-400 italic">
                "Serviço impecável, motorista pontual e carro extremamente limpo. Recomendo!"
              </p>
              <p className="text-[10px] text-teal-light mt-2 font-semibold">— Ricardo M.</p>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Modal: Criar / Editar Serviço de Reserva & Bilhete (Operadores) */}
      {serviceModalOpen && isStaff && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <Card className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden">
            <CardHeader className="border-b border-gray-100 flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-lg font-bold">
                  {serviceDraft.id ? 'Editar Serviço de Reserva' : 'Novo Serviço de Reserva / Bilhete'}
                </CardTitle>
                <CardDescription>
                  Defina nome, categoria e preço visíveis imediatamente para os clientes.
                </CardDescription>
              </div>
              <Button variant="ghost" size="icon" onClick={() => setServiceModalOpen(false)} className="rounded-full">
                <X className="w-5 h-5" />
              </Button>
            </CardHeader>
            <CardContent className="p-6">
              <form onSubmit={handleSaveBookingService} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-gray-600 uppercase">Nome do Serviço</label>
                  <Input
                    required
                    placeholder="Ex: Transfer VIP / Emissão de Bilhete"
                    value={serviceDraft.name}
                    onChange={(e) => setServiceDraft({ ...serviceDraft, name: e.target.value })}
                    className="h-11 bg-gray-50 border-gray-200"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-gray-600 uppercase">Categoria</label>
                    <select
                      value={serviceDraft.category}
                      onChange={(e) =>
                        setServiceDraft({ ...serviceDraft, category: e.target.value as any })
                      }
                      className="w-full h-11 rounded-xl border border-gray-200 bg-gray-50 px-3 text-sm font-semibold"
                    >
                      <option value="transfer">Transfer Aeroporto</option>
                      <option value="flight">Bilhete Aéreo</option>
                      <option value="vip">Executivo / VIP</option>
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-gray-600 uppercase">Preço Base (AOA)</label>
                    <Input
                      type="number"
                      min={0}
                      required
                      value={serviceDraft.price}
                      onChange={(e) =>
                        setServiceDraft({ ...serviceDraft, price: Number(e.target.value) })
                      }
                      className="h-11 bg-gray-50 border-gray-200 font-bold tabular-nums"
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-gray-600 uppercase">Descrição</label>
                  <textarea
                    rows={3}
                    required
                    placeholder="Lotação, bagagem, condições de espera..."
                    value={serviceDraft.description}
                    onChange={(e) => setServiceDraft({ ...serviceDraft, description: e.target.value })}
                    className="w-full rounded-xl bg-gray-50 border border-gray-200 p-3 text-sm focus:outline-none focus:ring-2 focus:ring-teal"
                  />
                </div>
                <label className="flex items-center gap-2 text-xs font-bold text-gray-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={serviceDraft.active !== false}
                    onChange={(e) => setServiceDraft({ ...serviceDraft, active: e.target.checked })}
                    className="w-4 h-4 accent-teal"
                  />
                  Serviço Ativo para Clientes
                </label>

                <div className="flex justify-end gap-3 pt-2">
                  <Button type="button" variant="ghost" onClick={() => setServiceModalOpen(false)}>
                    Cancelar
                  </Button>
                  <Button
                    type="submit"
                    disabled={savingService}
                    className="bg-teal hover:bg-teal-dark text-white font-bold gap-2"
                  >
                    {savingService ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    Guardar Serviço
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Modal: Detalhes / Gestão do Agendamento */}
      {activeBooking && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <Card className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden">
            <CardHeader className="border-b border-gray-100 flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-lg font-bold">
                  {activeBooking.serviceName || activeBooking.tier}
                </CardTitle>
                <CardDescription>
                  Reserva {activeBooking.id} · {activeBooking.clientName || 'Cliente'}
                </CardDescription>
              </div>
              <Button variant="ghost" size="icon" onClick={() => setActiveBooking(null)} className="rounded-full">
                <X className="w-5 h-5" />
              </Button>
            </CardHeader>
            <CardContent className="p-6 space-y-4">
              <div className="p-3 rounded-xl bg-gray-50 border border-gray-200 text-xs space-y-1">
                <p>
                  <strong>Percurso:</strong> {activeBooking.pickupLocation} → {activeBooking.dropoffLocation}
                </p>
                <p>
                  <strong>Estado Atual:</strong> {activeBooking.status.toUpperCase()}
                </p>
              </div>

              {isStaff ? (
                <form onSubmit={handleSaveBookingDetails} className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-gray-600 uppercase">Estado</label>
                      <select
                        value={bookingStatusDraft}
                        onChange={(e) => setBookingStatusDraft(e.target.value as any)}
                        className="w-full h-10 rounded-xl border border-gray-200 bg-gray-50 px-3 text-sm font-semibold"
                      >
                        <option value="pending">Pendente</option>
                        <option value="confirmed">Confirmado</option>
                        <option value="completed">Concluído</option>
                        <option value="cancelled">Cancelado</option>
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-gray-600 uppercase">Preço (AOA)</label>
                      <Input
                        type="number"
                        value={bookingPriceDraft}
                        onChange={(e) => setBookingPriceDraft(Number(e.target.value))}
                        className="h-10 bg-gray-50 font-bold tabular-nums"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-gray-600 uppercase">Data</label>
                      <Input
                        type="date"
                        value={bookingDateDraft}
                        onChange={(e) => setBookingDateDraft(e.target.value)}
                        className="h-10 bg-gray-50"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-gray-600 uppercase">Hora</label>
                      <Input
                        type="time"
                        value={bookingTimeDraft}
                        onChange={(e) => setBookingTimeDraft(e.target.value)}
                        className="h-10 bg-gray-50"
                      />
                    </div>
                  </div>
                  <div className="flex justify-end gap-3 pt-2">
                    <Button type="button" variant="ghost" onClick={() => setActiveBooking(null)}>
                      Fechar
                    </Button>
                    <Button
                      type="submit"
                      disabled={savingBookingEdit}
                      className="bg-teal hover:bg-teal-dark text-white font-bold gap-2"
                    >
                      {savingBookingEdit ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                      Guardar Alterações
                    </Button>
                  </div>
                </form>
              ) : (
                <div className="flex justify-end">
                  <Button type="button" onClick={() => setActiveBooking(null)}>
                    Fechar
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Modal: Confirmação para Eliminar/Desativar Serviço */}
      {serviceToDelete && isStaff && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <Card className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden">
            <CardHeader className="border-b border-gray-100">
              <CardTitle className="text-lg font-bold text-red-700 flex items-center gap-2">
                <Trash2 className="w-5 h-5" />
                Remover Serviço
              </CardTitle>
              <CardDescription>
                Tem a certeza que deseja remover/desativar <strong>{serviceToDelete.name}</strong>?
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
                Confirmar
              </Button>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
