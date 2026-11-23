/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import { collection, onSnapshot, addDoc, serverTimestamp, query, orderBy, setDoc, doc } from 'firebase/firestore';
import { db, auth, OperationType, handleFirestoreError } from '@/src/firebase';
import { TravelService, TravelProcess } from '@/src/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/src/components/ui/Card';
import { Button } from '@/src/components/ui/Button';
import { Badge } from '@/src/components/ui/Badge';
import { 
  PlaneTakeoff, 
  Globe, 
  GraduationCap, 
  Briefcase, 
  HeartPulse, 
  Car, 
  ArrowRight,
  ShieldCheck,
  CheckCircle2,
  Loader2,
  Plus,
  MessageSquare,
  Mail,
  MapPin,
  Info
} from 'lucide-react';
import { PRICING, AGENCY_INFO } from '@/src/constants';
import { formatCurrency, cn } from '@/src/lib/utils';
import { useAuth } from '@/src/hooks/useAuth';
import { useNavigate } from 'react-router-dom';

const DEFAULT_SERVICES: Partial<TravelService>[] = [
  {
    id: 'visa-student',
    name: 'Visto de Estudante',
    description: 'Assessoria completa para obtenção de visto de estudos em Portugal, Polónia e outros destinos.',
    price: PRICING.STUDENT_VISA,
    category: 'visa',
    features: ['Análise de documentos', 'Preenchimento de formulários', 'Agendamento consular', 'Seguro viagem']
  },
  {
    id: 'visa-work',
    name: 'Visto de Trabalho',
    description: 'Processo especializado para profissionais que buscam oportunidades no mercado europeu.',
    price: PRICING.WORK_VISA,
    category: 'visa',
    features: ['Validação de contrato', 'Apoio na legalização', 'Tradução de documentos', 'Acompanhamento']
  },
  {
    id: 'visa-schengen',
    name: 'Visto Schengen (Turismo)',
    description: 'Facilitamos sua viagem de lazer ou negócios para qualquer país do espaço Schengen.',
    price: PRICING.SCHENGEN,
    category: 'visa',
    features: ['Plano de viagem', 'Reserva de voo/hotel', 'Seguro obrigatório', 'Dicas de entrevista']
  },
  {
    id: 'visa-health',
    name: 'Visto de Saúde',
    description: 'Prioridade e agilidade para tratamentos médicos no exterior com todo apoio necessário.',
    price: PRICING.HEALTH,
    category: 'visa',
    features: ['Contacto com clínicas', 'Apoio logístico', 'Documentação médica', 'Urgência']
  },
  {
    id: 'transfer-airport',
    name: 'Transfer Aeroporto',
    description: 'Transporte seguro e confortável de ou para o aeroporto com motoristas profissionais.',
    price: 15000,
    category: 'transfer',
    features: ['Motorista bilíngue', 'Veículos modernos', 'Água e Wi-Fi', 'Pontualidade']
  }
];

export function Services() {
  const { profile, user, hasPermission } = useAuth();
  const navigate = useNavigate();
  const canManageServices = profile?.role === 'admin' || hasPermission('manage_services');
  const [services, setServices] = useState<TravelService[]>([]);
  const [loading, setLoading] = useState(true);
  const [requestingId, setRequestingId] = useState<string | null>(null);

  useEffect(() => {
    const q = query(collection(db, 'services'), orderBy('name', 'asc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const servicesData = snapshot.docs.map(doc => ({
        ...doc.data(),
        id: doc.id
      })) as TravelService[];
      
      setServices(servicesData);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'services');
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const handleSeedServices = async () => {
    setLoading(true);
    try {
      for (const service of DEFAULT_SERVICES) {
        await addDoc(collection(db, 'services'), {
          ...service,
          createdAt: serverTimestamp()
        });
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'services');
    } finally {
      setLoading(false);
    }
  };

  const handleRequestService = async (service: TravelService) => {
    if (!user) {
      navigate('/login');
      return;
    }

    setRequestingId(service.id);
    try {
      const processId = `PRC-${Math.floor(1000 + Math.random() * 9000)}`;
      const newProcess: Partial<TravelProcess> = {
        id: processId,
        clientUid: user.uid,
        clientName: profile?.displayName || user.email || 'Cliente',
        serviceId: service.id,
        serviceName: service.name,
        price: service.price || 0,
        status: 'pending',
        progress: 10,
        paymentType: 'full',
        paymentStatus: 'pending',
        paymentConfirmed: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        reminders: []
      };

      await setDoc(doc(db, 'processes', processId), {
        ...newProcess,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      navigate('/processes');
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'processes');
    } finally {
      setRequestingId(null);
    }
  };

  const getIcon = (category?: string) => {
    switch (category) {
      case 'visa': return PlaneTakeoff;
      case 'transfer': return Car;
      case 'training': return GraduationCap;
      default: return Globe;
    }
  };

  if (loading && services.length === 0) {
    return (
      <div className="h-[60vh] flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-12 animate-in fade-in duration-500 pb-20">
      {/* Hero Section */}
      <div className="relative h-[400px] rounded-3xl overflow-hidden shadow-2xl">
        <img 
          src="https://images.unsplash.com/photo-1436491865332-7a61a109c0f3?auto=format&fit=crop&q=80&w=2070" 
          alt="Travel" 
          className="absolute inset-0 w-full h-full object-cover"
          referrerPolicy="no-referrer"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-blue-900/90 to-transparent flex items-center p-12">
          <div className="max-w-xl space-y-6">
            <Badge className="bg-blue-500 hover:bg-blue-600 text-white border-none px-4 py-1 text-sm">
              Especialistas em Vistos
            </Badge>
            <h1 className="text-5xl font-extrabold text-white tracking-tight leading-tight">
              Sua Liberdade Começa Aqui.
            </h1>
            <p className="text-xl text-blue-100 font-medium">
              Assessoria completa para vistos, viagens e legalização internacional com transparência e agilidade.
            </p>
            <div className="flex gap-4">
              <Button size="lg" className="bg-white text-blue-900 hover:bg-blue-50 font-bold px-8">
                Ver Pacotes
              </Button>
              <Button size="lg" variant="outline" className="border-white text-white hover:bg-white/10 px-8">
                Falar com Consultor
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold text-gray-900 tracking-tight">Nossos Serviços e Pacotes</h2>
          <p className="text-gray-500 mt-1">Escolha o plano ideal para o seu objetivo internacional.</p>
        </div>
        <div className="flex gap-3">
          {canManageServices && services.length === 0 && (
            <Button variant="outline" onClick={handleSeedServices} className="gap-2">
              <Plus className="w-4 h-4" />
              Popular Serviços
            </Button>
          )}
          {canManageServices && (
            <Button className="gap-2" onClick={() => navigate('/admin/services')}>
              <Plus className="w-4 h-4" />
              Gerir Serviços & Preços
            </Button>
          )}
        </div>
      </div>

      {services.length === 0 ? (
        <div className="text-center py-20 bg-white rounded-2xl border border-dashed border-gray-200">
          <PlaneTakeoff className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-900">Nenhum serviço disponível</h3>
          <p className="text-gray-500 mt-1">Estamos a preparar novas opções para si.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {services.map((service) => {
            const Icon = getIcon(service.category);
            const isRequesting = requestingId === service.id;

            return (
              <Card key={service.id} className="flex flex-col h-full hover:shadow-lg transition-all duration-300 border-gray-100 group">
                <CardHeader>
                  <div className="flex justify-between items-start mb-4">
                    <div className="w-12 h-12 bg-blue-50 rounded-xl flex items-center justify-center group-hover:bg-blue-600 transition-colors duration-300">
                      <Icon className="w-6 h-6 text-blue-600 group-hover:text-white transition-colors duration-300" />
                    </div>
                    <Badge variant="secondary" className="capitalize">
                      {service.category}
                    </Badge>
                  </div>
                  <CardTitle className="text-xl group-hover:text-blue-600 transition-colors">{service.name}</CardTitle>
                  <CardDescription className="line-clamp-2 mt-2">{service.description}</CardDescription>
                </CardHeader>
                <CardContent className="flex-1">
                  <div className="space-y-3">
                    <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">O que inclui:</p>
                    <ul className="space-y-2">
                      {service.features?.map((feature, i) => (
                        <li key={i} className="flex items-center gap-2 text-sm text-gray-600">
                          <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
                          {feature}
                        </li>
                      ))}
                    </ul>
                  </div>
                </CardContent>
                <CardFooter className="flex flex-col gap-4 pt-6 border-t border-gray-50">
                  <div className="flex justify-between items-end w-full">
                    <div>
                      <p className="text-xs text-gray-500 font-medium">Investimento</p>
                      <p className="text-xl font-bold text-gray-900">{formatCurrency(service.price)}</p>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" className="gap-1 text-xs">
                        <Info className="w-3 h-3" /> Saiba Mais
                      </Button>
                      <Button 
                        onClick={() => handleRequestService(service)} 
                        disabled={isRequesting}
                        className="gap-2 bg-blue-600 hover:bg-blue-700"
                      >
                        {isRequesting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Solicitar'}
                        {!isRequesting && <ArrowRight className="w-4 h-4" />}
                      </Button>
                    </div>
                  </div>
                </CardFooter>
              </Card>
            );
          })}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        <Card className="md:col-span-2 bg-blue-600 text-white border-none shadow-xl overflow-hidden relative">
          <div className="absolute top-0 right-0 p-8 opacity-10">
            <ShieldCheck className="w-64 h-64" />
          </div>
          <CardContent className="p-10 relative z-10">
            <div className="max-w-2xl">
              <h2 className="text-3xl font-bold mb-4">Consultoria Personalizada</h2>
              <p className="text-blue-100 text-lg mb-8">
                Não encontrou o que procurava? Nossa equipe de especialistas está pronta para criar um plano sob medida para suas necessidades específicas.
              </p>
              <div className="flex flex-wrap gap-4">
                <Button variant="secondary" size="lg" className="text-blue-700 font-bold">
                  Agendar Consultoria
                </Button>
                <Button variant="outline" size="lg" className="border-white text-white hover:bg-white/10">
                  Solicitar Assessoria
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm border-gray-100">
          <CardHeader>
            <CardTitle className="text-xl">Onde Estamos</CardTitle>
            <CardDescription>Visite nossa agência em Luanda.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex gap-4">
              <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center shrink-0">
                <MapPin className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="font-bold text-gray-900">Localização</p>
                <p className="text-sm text-gray-500">{AGENCY_INFO.location}</p>
              </div>
            </div>
            <div className="flex gap-4">
              <div className="w-10 h-10 rounded-full bg-green-50 flex items-center justify-center shrink-0">
                <MessageSquare className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <p className="font-bold text-gray-900">WhatsApp</p>
                <p className="text-sm text-gray-500">{AGENCY_INFO.whatsapp}</p>
              </div>
            </div>
            <div className="flex gap-4">
              <div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center shrink-0">
                <Mail className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <p className="font-bold text-gray-900">E-mail</p>
                <p className="text-sm text-gray-500">{AGENCY_INFO.email}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
