/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { collection, addDoc, serverTimestamp, setDoc, doc } from 'firebase/firestore';
import { db, OperationType, handleFirestoreError } from '@/src/firebase';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/src/components/ui/Card';
import { Button } from '@/src/components/ui/Button';
import { Input } from '@/src/components/ui/Input';
import { Badge } from '@/src/components/ui/Badge';
import { X, User, Mail, Phone, MapPin, CreditCard, Loader2 } from 'lucide-react';

interface NewClientModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function NewClientModal({ isOpen, onClose }: NewClientModalProps) {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    displayName: '',
    email: '',
    phone: '',
    passportNumber: '',
    address: ''
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      // In a real app with Auth, we would use createUserWithEmailAndPassword
      // For this CRM manual entry, we just create a User profile document.
      // We'll generate a random UID or use email as ID prefix if needed.
      const tempUid = 'manual_' + Math.random().toString(36).substr(2, 9);
      
      const userData = {
        uid: tempUid,
        displayName: formData.displayName,
        email: formData.email,
        phone: formData.phone,
        passportNumber: formData.passportNumber,
        address: formData.address,
        role: 'client',
        createdAt: serverTimestamp(),
      };

      await setDoc(doc(db, 'users', tempUid), userData);

      // Also create a entry in a helper 'clients' collection for process linking if needed
      await setDoc(doc(db, 'clients', tempUid), userData);

      onClose();
      setFormData({ displayName: '', email: '', phone: '', passportNumber: '', address: '' });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'users');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <Card className="w-full max-w-lg shadow-2xl animate-in zoom-in-95 duration-200">
        <CardHeader className="flex flex-row items-center justify-between border-b border-gray-100 pb-4">
          <div>
            <CardTitle className="text-xl font-black">Novo Registro de Cliente</CardTitle>
            <CardDescription>Insira os dados básicos para iniciar o acompanhamento.</CardDescription>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} className="rounded-full">
            <X className="w-5 h-5" />
          </Button>
        </CardHeader>
        
        <form onSubmit={handleSubmit}>
          <CardContent className="p-6 space-y-4">
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                <User className="w-3 h-3" /> Nome Completo
              </label>
              <Input 
                required
                placeholder="Ex: João Silva" 
                className="h-12 rounded-xl bg-gray-50 border-none focus:ring-2 focus:ring-teal"
                value={formData.displayName}
                onChange={e => setFormData({...formData, displayName: e.target.value})}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                  <Mail className="w-3 h-3" /> Email
                </label>
                <Input 
                  required
                  type="email"
                  placeholder="cliente@email.com" 
                  className="h-12 rounded-xl bg-gray-50 border-none focus:ring-2 focus:ring-teal"
                  value={formData.email}
                  onChange={e => setFormData({...formData, email: e.target.value})}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                  <Phone className="w-3 h-3" /> Telefone
                </label>
                <Input 
                  placeholder="+244 ..." 
                  className="h-12 rounded-xl bg-gray-50 border-none focus:ring-2 focus:ring-teal"
                  value={formData.phone}
                  onChange={e => setFormData({...formData, phone: e.target.value})}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                <CreditCard className="w-3 h-3" /> Nº Passaporte / BI
              </label>
              <Input 
                placeholder="N000000" 
                className="h-12 rounded-xl bg-gray-50 border-none focus:ring-2 focus:ring-teal"
                value={formData.passportNumber}
                onChange={e => setFormData({...formData, passportNumber: e.target.value})}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                <MapPin className="w-3 h-3" /> Endereço
              </label>
              <Input 
                placeholder="Rua, Bairro, Cidade" 
                className="h-12 rounded-xl bg-gray-50 border-none focus:ring-2 focus:ring-teal"
                value={formData.address}
                onChange={e => setFormData({...formData, address: e.target.value})}
              />
            </div>
          </CardContent>

          <div className="flex items-center justify-end p-6 border-t border-gray-100 bg-gray-50/50 rounded-b-xl gap-3">
            <Button variant="ghost" type="button" onClick={onClose} disabled={loading}>
              Cancelar
            </Button>
            <Button 
              type="submit"
              className="bg-teal hover:bg-teal-dark text-white font-black px-8 rounded-xl h-12 shadow-lg shadow-teal/20"
              disabled={loading}
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : 'Registrar Cliente'}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
