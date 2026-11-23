/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, addDoc, serverTimestamp, deleteDoc, doc, updateDoc, setDoc } from 'firebase/firestore';
import { db, OperationType, handleFirestoreError } from '@/src/firebase';
import { useAuth } from '@/src/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/src/components/ui/Card';
import { Button } from '@/src/components/ui/Button';
import { Input } from '@/src/components/ui/Input';
import { Badge } from '@/src/components/ui/Badge';
import { Plane, Plus, Trash2, Edit2, Globe, Ticket, Car, Shield, Home, Sparkles, Flame, Lock, Upload, Image as ImageIcon } from 'lucide-react';
import { TravelService } from '@/src/types';
import { TRENDING_PROMO_SERVICES } from '@/src/constants';
import { compressImageToDataUrl } from '@/src/utils/fileHelpers';

const CATEGORIES = [
  { value: 'visa', label: 'Visto / Assessoria', icon: Plane, bg: 'bg-blue-50 text-blue-600 border-blue-100' },
  { value: 'flight', label: 'Passagem Aérea', icon: Ticket, bg: 'bg-emerald-50 text-emerald-600 border-emerald-100' },
  { value: 'transfer', label: 'Aeroporto / Translado', icon: Car, bg: 'bg-amber-50 text-amber-600 border-amber-100' },
  { value: 'insurance', label: 'Seguro Viagem', icon: Shield, bg: 'bg-violet-50 text-violet-600 border-violet-100' },
  { value: 'hotel', label: 'Alojamento / Hotel', icon: Home, bg: 'bg-indigo-50 text-indigo-600 border-indigo-100' },
  { value: 'package', label: 'Pacote Turístico', icon: Globe, bg: 'bg-sky-50 text-sky-600 border-sky-100' },
  { value: 'other', label: 'Outros Serviços', icon: Sparkles, bg: 'bg-gray-50 text-gray-600 border-gray-100' }
];

export function ManagerServices() {
  const { hasPermission } = useAuth();
  const canManageServices = hasPermission('manage_services');
  const [services, setServices] = useState<TravelService[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [serviceToDelete, setServiceToDelete] = useState<TravelService | null>(null);
  const [newService, setNewService] = useState({
    name: '',
    subtitle: '',
    badgeText: '',
    description: '',
    price: 0,
    category: 'visa',
    featuresInput: '',
    imageUrl: ''
  });

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'services'), (snapshot) => {
      setServices(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as TravelService[]);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const handleAddService = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManageServices) return;
    try {
      const features = newService.featuresInput
        ? newService.featuresInput.split(',').map(f => f.trim()).filter(Boolean)
        : [];

      const serviceData = {
        name: newService.name.trim(),
        subtitle: newService.subtitle.trim(),
        badgeText: newService.badgeText.trim(),
        description: newService.description.trim(),
        price: Number(newService.price),
        category: newService.category,
        imageUrl: newService.imageUrl.trim(),
        features
      };

      if (editingId) {
        await updateDoc(doc(db, 'services', editingId), serviceData);
      } else {
        await addDoc(collection(db, 'services'), {
          ...serviceData,
          createdAt: serverTimestamp()
        });
      }
      setIsModalOpen(false);
      setEditingId(null);
      setNewService({ name: '', subtitle: '', badgeText: '', description: '', price: 0, category: 'visa', featuresInput: '', imageUrl: '' });
    } catch (error) {
      handleFirestoreError(error, editingId ? OperationType.UPDATE : OperationType.CREATE, 'services');
    }
  };

  const handleEdit = (service: TravelService) => {
    setEditingId(service.id);
    setNewService({
      name: service.name,
      subtitle: service.subtitle || '',
      badgeText: service.badgeText || '',
      description: service.description || '',
      price: service.price,
      category: service.category || 'visa',
      featuresInput: service.features ? service.features.join(', ') : '',
      imageUrl: service.imageUrl || ''
    });
    setIsModalOpen(true);
  };

  const handlePosterFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const processed = await compressImageToDataUrl(file, 1000, 0.8);
      setNewService((prev) => ({ ...prev, imageUrl: processed.dataUrl }));
    } catch (err) {
      console.error('Erro ao carregar imagem do cartaz:', err);
    }
  };

  const handleDeleteService = async () => {
    if (!serviceToDelete || !canManageServices) return;
    try {
      await deleteDoc(doc(db, 'services', serviceToDelete.id));
      setServiceToDelete(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `services/${serviceToDelete.id}`);
    }
  };

  const getCategoryDetails = (cat?: string) => {
    return CATEGORIES.find(c => c.value === cat) || CATEGORIES[6];
  };

  const handleSyncTrendingServices = async () => {
    try {
      for (const promo of TRENDING_PROMO_SERVICES) {
        await setDoc(
          doc(db, 'services', promo.id),
          {
            id: promo.id,
            name: promo.title,
            description: promo.description,
            price: promo.price,
            category: promo.category,
            features: [...promo.highlights, ...promo.requirements],
            imageUrl: promo.imageUrl,
            isTrending: true,
            badgeText: promo.badgeText,
            createdAt: serverTimestamp(),
          },
          { merge: true }
        );
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'services');
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-12">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 bg-teal rounded-2xl flex items-center justify-center text-white shadow-xl shadow-teal/20">
            <Plane className="w-8 h-8" />
          </div>
          <div>
            <h1 className="text-3xl font-black text-gray-900 tracking-tight font-display italic">Pacotes & Serviços</h1>
            <p className="text-gray-500 font-medium">Configure os tipos de vistos e tarifas de prestação de serviços da sua agência.</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-3">
          {canManageServices ? (
            <>
              <Button
                type="button"
                variant="outline"
                onClick={handleSyncTrendingServices}
                className="gap-2 border-teal text-teal hover:bg-teal-light h-12 px-5 font-bold rounded-2xl text-xs uppercase tracking-wider"
              >
                <Flame className="w-4 h-4" />
                Sincronizar Serviços em Alta
              </Button>
              <Button onClick={() => { setEditingId(null); setNewService({ name: '', subtitle: '', badgeText: '', description: '', price: 0, category: 'visa', featuresInput: '', imageUrl: '' }); setIsModalOpen(true); }} className="bg-teal hover:bg-teal-dark text-white gap-2 shadow-xl shadow-teal/20 h-12 px-8 font-black rounded-2xl transform transition-all hover:scale-105 active:scale-95 uppercase text-xs tracking-widest">
                <Plus className="w-5 h-5" />
                Novo Serviço / Pacote
              </Button>
            </>
          ) : (
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs font-semibold">
              <Lock className="w-4 h-4" />
              Modo Consulta (sem permissão de edição)
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        {services.map((service) => {
          const catInfo = getCategoryDetails(service.category);
          const IconComponent = catInfo.icon;
          return (
            <Card key={service.id} className="shadow-2xl shadow-black/[0.02] border-none rounded-[2rem] bg-white group hover:scale-[1.02] transition-all overflow-hidden relative flex flex-col justify-between">
              <div className="h-40 bg-gray-50 flex items-center justify-center relative overflow-hidden">
                 {service.imageUrl ? (
                   <img
                     src={service.imageUrl}
                     alt={service.name}
                     referrerPolicy="no-referrer"
                     className="w-full h-full object-cover object-top"
                   />
                 ) : (
                   <div className={`p-4 rounded-full ${catInfo.bg} bg-opacity-20`}>
                      <IconComponent className="w-10 h-10" />
                   </div>
                 )}
                 <div className="absolute bottom-3 right-3">
                    <Badge className="bg-teal text-white border-none font-black text-[10px] uppercase px-3 py-1 shadow-sm">
                       {catInfo.label}
                    </Badge>
                 </div>
              </div>
              <CardContent className="p-8 flex-1 flex flex-col justify-between">
                <div>
                  <h3 className="text-xl font-black text-gray-900 mb-2 truncate uppercase tracking-tighter italic">{service.name}</h3>
                  <p className="text-sm text-gray-400 font-medium line-clamp-3 h-14 mb-4 leading-normal">{service.description}</p>
                  
                  {service.features && service.features.length > 0 && (
                    <div className="mb-6">
                      <p className="text-[9px] font-black text-gray-400 uppercase tracking-wider mb-2">Módulos inclusos / Detalhes:</p>
                      <div className="flex flex-wrap gap-1.5">
                        {service.features.map((feat, idx) => (
                          <span key={idx} className="inline-flex items-center rounded-md border border-gray-150 bg-gray-50/50 px-1.5 py-0.5 text-[10px] text-gray-500 font-medium">
                            {feat}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                
                <div className="flex flex-col gap-4 mt-auto">
                   <div className="flex items-center justify-between p-4 bg-gray-50 rounded-2xl border border-gray-100">
                      <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Taxa Total</span>
                      <span className="text-xl font-black text-teal tracking-tighter">
                         {new Intl.NumberFormat('pt-AO', { style: 'currency', currency: 'AOA' }).format(service.price)}
                      </span>
                   </div>
                   
                   {canManageServices && (
                    <div className="flex items-center gap-2">
                       <Button 
                         variant="ghost" 
                         size="icon" 
                         onClick={() => handleEdit(service)}
                         className="rounded-xl border border-gray-100 h-10 w-10 text-gray-400 hover:text-teal hover:bg-teal-light"
                       >
                          <Edit2 className="w-4 h-4" />
                       </Button>
                       <Button 
                         variant="ghost" 
                         size="icon" 
                         onClick={() => setServiceToDelete(service)}
                         className="rounded-xl border border-gray-100 h-10 w-10 text-red-400 hover:text-red-600 hover:bg-red-50"
                       >
                          <Trash2 className="w-4 h-4" />
                       </Button>
                    </div>
                   )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <Card className="w-full max-w-lg shadow-2xl animate-in zoom-in-95 duration-200">
            <CardHeader className="border-b border-gray-100 pb-4">
              <CardTitle className="text-xl font-black">{editingId ? 'Editar Serviço / Pacote' : 'Efetuar Configuração de Pacote'}</CardTitle>
              <CardDescription>Defina o nome, categoria, valor do pacote e as inclusões correspondentes.</CardDescription>
            </CardHeader>
            <form onSubmit={handleAddService}>
              <CardContent className="p-6 space-y-4">
                 <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                       <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Tipo / Categoria de Serviço</label>
                       <select
                         value={newService.category}
                         aria-label="Categoria de Serviço"
                         onChange={e => setNewService({...newService, category: e.target.value})}
                         className="w-full h-12 bg-gray-50 border-none px-3 font-semibold text-gray-700 text-sm focus:ring-teal rounded-xl"
                       >
                         {CATEGORIES.map(cat => (
                           <option key={cat.value} value={cat.value}>{cat.label}</option>
                         ))}
                       </select>
                    </div>
                    <div className="space-y-1.5">
                       <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Valor do Serviço / Taxa (AOA)</label>
                       <Input 
                         required
                         type="number"
                         placeholder="0"
                         value={newService.price || ''}
                         onChange={e => setNewService({...newService, price: Number(e.target.value)})}
                         className="h-12 rounded-xl bg-gray-50 border-none focus:ring-teal font-bold"
                       />
                    </div>
                 </div>

                 <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Nome do Serviço / Pacote</label>
                    <Input 
                      required
                      placeholder="Ex: Consultoria Visto Schengen - Portugal"
                      value={newService.name}
                      onChange={e => setNewService({...newService, name: e.target.value})}
                      className="h-12 rounded-xl bg-gray-50 border-none focus:ring-teal"
                    />
                 </div>
                 
                 <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Descrição detalhada</label>
                    <Input 
                      placeholder="Breve resumo explicativo para o cliente"
                      value={newService.description}
                      onChange={e => setNewService({...newService, description: e.target.value})}
                      className="h-12 rounded-xl bg-gray-50 border-none focus:ring-teal"
                    />
                 </div>

                 <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                   <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Subtítulo (Opcional)</label>
                      <Input 
                        placeholder="Ex: Programa Juvenil (14 aos 19 anos)"
                        value={newService.subtitle}
                        onChange={e => setNewService({...newService, subtitle: e.target.value})}
                        className="h-12 rounded-xl bg-gray-50 border-none focus:ring-teal"
                      />
                   </div>
                   <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Etiqueta / Destaque (Opcional)</label>
                      <Input 
                        placeholder="Ex: Mais Procurado"
                        value={newService.badgeText}
                        onChange={e => setNewService({...newService, badgeText: e.target.value})}
                        className="h-12 rounded-xl bg-gray-50 border-none focus:ring-teal"
                      />
                   </div>
                 </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-1.5">
                      <ImageIcon className="w-3.5 h-3.5 text-teal" />
                      Foto / Cartaz do Serviço
                    </label>
                    <div className="flex items-center gap-3">
                      {newService.imageUrl && (
                        <img
                          src={newService.imageUrl}
                          alt="Pré-visualização do cartaz"
                          className="w-14 h-16 rounded-lg object-cover border border-gray-200 shrink-0"
                        />
                      )}
                      <div className="flex-1 space-y-2">
                        <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-teal-light text-teal text-xs font-bold cursor-pointer hover:bg-teal/20">
                          <Upload className="w-3.5 h-3.5" />
                          Carregar Nova Foto
                          <input
                            type="file"
                            accept="image/*"
                            onChange={handlePosterFileUpload}
                            className="hidden"
                          />
                        </label>
                        <Input
                          placeholder="Ou cole o URL da imagem..."
                          value={newService.imageUrl}
                          onChange={(e) => setNewService({ ...newService, imageUrl: e.target.value })}
                          className="h-9 rounded-lg bg-gray-50 border-gray-200 text-xs"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Módulos Inclusos (Separados por vírgula)</label>
                    <Input 
                      placeholder="Ex: Análise de Documentos, Seguros Consulares, Agendamento"
                      value={newService.featuresInput}
                      onChange={e => setNewService({...newService, featuresInput: e.target.value})}
                      className="h-12 rounded-xl bg-gray-50 border-none focus:ring-teal text-sm"
                    />
                    <p className="text-[10px] text-gray-400 italic">Estes itens aparecerão como inclusos no pacote do cliente.</p>
                 </div>
              </CardContent>
              <div className="flex items-center justify-end p-6 border-t border-gray-100 bg-gray-50/50 rounded-b-xl gap-3">
                 <Button type="button" variant="ghost" onClick={() => setIsModalOpen(false)}>Cancelar</Button>
                 <Button type="submit" className="bg-teal hover:bg-teal-dark text-white font-black px-8 rounded-xl h-12 shadow-lg shadow-teal/20 uppercase text-xs tracking-widest">
                    {editingId ? 'Atualizar Serviço' : 'Salvar Serviço'}
                 </Button>
              </div>
            </form>
          </Card>
        </div>
      )}

      {serviceToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <Card className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden">
            <CardHeader className="border-b border-gray-100">
              <CardTitle className="text-lg font-bold text-red-700 flex items-center gap-2">
                <Trash2 className="w-5 h-5" />
                Eliminar Pacote / Serviço
              </CardTitle>
              <CardDescription>
                Tem a certeza que deseja eliminar <strong>{serviceToDelete.name}</strong>? Esta ação não pode ser anulada.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-6 flex justify-end gap-3">
              <Button type="button" variant="ghost" onClick={() => setServiceToDelete(null)}>
                Cancelar
              </Button>
              <Button type="button" onClick={handleDeleteService} className="bg-red-600 hover:bg-red-700 text-white font-bold gap-2">
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
