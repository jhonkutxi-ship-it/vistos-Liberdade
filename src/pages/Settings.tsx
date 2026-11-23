/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db, OperationType, handleFirestoreError } from '@/src/firebase';
import { useAuth } from '@/src/hooks/useAuth';
import { useCompanySettings } from '@/src/hooks/useCompanySettings';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/src/components/ui/Card';
import { Button } from '@/src/components/ui/Button';
import { Input } from '@/src/components/ui/Input';
import { ALL_PERMISSIONS } from '@/src/constants';
import { PermissionKey, UserProfile, UserRole } from '@/src/types';
import { compressImageToDataUrl } from '@/src/utils/fileHelpers';
import {
  Building2,
  Shield,
  KeyRound,
  Upload,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Save,
  UserCheck,
  UserX,
  Lock,
  Eye,
  EyeOff,
  Loader2,
  ShieldCheck,
} from 'lucide-react';
import { cn } from '@/src/lib/utils';

type SettingsTab = 'company' | 'permissions' | 'account';

export function Settings() {
  const { profile, isAdmin, hasPermission, changeOwnPassword } = useAuth();
  const { company, rolePermissions, updateCompanySettings, updateRolePermissions } = useCompanySettings();

  const canManageSettings = isAdmin || hasPermission('manage_settings');

  const [activeTab, setActiveTab] = useState<SettingsTab>(canManageSettings ? 'company' : 'account');
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Company form state
  const [companyForm, setCompanyForm] = useState(company);
  useEffect(() => {
    setCompanyForm(company);
  }, [company]);

  // Role permissions state
  const [empPerms, setEmpPerms] = useState<PermissionKey[]>(rolePermissions.employee);
  const [clientPerms, setClientPerms] = useState<PermissionKey[]>(rolePermissions.client);
  useEffect(() => {
    setEmpPerms(rolePermissions.employee);
    setClientPerms(rolePermissions.client);
  }, [rolePermissions]);

  // All system users for individual access management
  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
  const [editingUserPerms, setEditingUserPerms] = useState<UserProfile | null>(null);
  const [customPermsDraft, setCustomPermsDraft] = useState<PermissionKey[]>([]);

  // My Account state
  const [displayName, setDisplayName] = useState(profile?.displayName || '');
  const [newPass, setNewPass] = useState('');
  const [confirmPass, setConfirmPass] = useState('');
  const [showPass, setShowPass] = useState(false);

  useEffect(() => {
    setDisplayName(profile?.displayName || '');
  }, [profile]);

  useEffect(() => {
    if (!canManageSettings) return;
    const unsub = onSnapshot(
      collection(db, 'users'),
      (snap) => {
        setAllUsers(snap.docs.map((d) => ({ ...d.data(), uid: d.id }) as UserProfile));
      },
      (err) => console.warn('Users list listener note:', err)
    );
    return () => unsub();
  }, [canManageSettings]);

  const showToast = (type: 'success' | 'error', text: string) => {
    setFeedback({ type, text });
    setTimeout(() => setFeedback(null), 4000);
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const processed = await compressImageToDataUrl(file, 500, 0.9, true);
      setCompanyForm((prev) => ({ ...prev, logoUrl: processed.dataUrl }));
    } catch (err: any) {
      showToast('error', err?.message || 'Erro ao processar imagem do logotipo.');
    }
  };

  const handleSaveCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await updateCompanySettings(companyForm);
      showToast('success', 'Informações da empresa atualizadas com sucesso.');
    } catch (err: any) {
      showToast('error', err?.message || 'Erro ao guardar informações da empresa.');
    } finally {
      setSaving(false);
    }
  };

  const toggleRolePerm = (role: 'employee' | 'client', key: PermissionKey) => {
    if (role === 'employee') {
      setEmpPerms((prev) => (prev.includes(key) ? prev.filter((p) => p !== key) : [...prev, key]));
    } else {
      setClientPerms((prev) => (prev.includes(key) ? prev.filter((p) => p !== key) : [...prev, key]));
    }
  };

  const handleSaveRolePermissions = async () => {
    setSaving(true);
    try {
      await updateRolePermissions({ employee: empPerms, client: clientPerms });
      showToast('success', 'Permissões padrão dos perfis atualizadas.');
    } catch (err: any) {
      showToast('error', err?.message || 'Erro ao atualizar permissões.');
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateUserRole = async (uid: string, role: UserRole) => {
    try {
      await updateDoc(doc(db, 'users', uid), {
        role,
        updatedAt: serverTimestamp(),
      });
      await updateDoc(doc(db, 'consultants', uid), {
        role,
        active: role === 'admin' || role === 'employee',
      }).catch(() => {});
      showToast('success', 'Cargo atualizado.');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${uid}`);
    }
  };

  const handleToggleUserActive = async (targetUser: UserProfile) => {
    const nextActive = targetUser.active === false;
    try {
      await updateDoc(doc(db, 'users', targetUser.uid), {
        active: nextActive,
        updatedAt: serverTimestamp(),
      });
      await updateDoc(doc(db, 'consultants', targetUser.uid), {
        active: nextActive,
      }).catch(() => {});
      if (targetUser.email) {
        await updateDoc(doc(db, 'staff_invites', targetUser.email.toLowerCase()), {
          active: nextActive,
        }).catch(() => {});
      }
      showToast('success', nextActive ? 'Acesso reativado.' : 'Acesso suspenso.');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${targetUser.uid}`);
    }
  };

  const openCustomPermsModal = (u: UserProfile) => {
    setEditingUserPerms(u);
    if (Array.isArray(u.permissions)) {
      setCustomPermsDraft(u.permissions);
    } else {
      setCustomPermsDraft(u.role === 'employee' ? empPerms : clientPerms);
    }
  };

  const handleSaveUserCustomPerms = async () => {
    if (!editingUserPerms) return;
    setSaving(true);
    try {
      await updateDoc(doc(db, 'users', editingUserPerms.uid), {
        permissions: customPermsDraft,
        updatedAt: serverTimestamp(),
      });
      setEditingUserPerms(null);
      showToast('success', 'Permissões individuais salvas.');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${editingUserPerms.uid}`);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    setSaving(true);
    try {
      if (displayName.trim() && displayName !== profile.displayName) {
        await updateDoc(doc(db, 'users', profile.uid), {
          displayName: displayName.trim(),
          updatedAt: serverTimestamp(),
        });
      }

      if (newPass) {
        if (newPass.length < 6) {
          showToast('error', 'A nova palavra-passe deve ter no mínimo 6 caracteres.');
          setSaving(false);
          return;
        }
        if (newPass !== confirmPass) {
          showToast('error', 'As palavras-passe não coincidem.');
          setSaving(false);
          return;
        }
        await changeOwnPassword(newPass);
        setNewPass('');
        setConfirmPass('');
      }

      showToast('success', 'Dados da conta atualizados com sucesso.');
    } catch (err: any) {
      showToast('error', err?.message || 'Erro ao atualizar dados da conta.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-8 pb-12">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-teal rounded-xl flex items-center justify-center text-white shadow-lg shadow-teal/20">
            <Building2 className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-gray-900 tracking-tight font-display">Definições do Sistema</h1>
            <p className="text-gray-500 text-sm">
              Personalize a identidade da empresa, gerencie acessos, permissões e segurança.
            </p>
          </div>
        </div>

        {/* Segmented Tab Bar */}
        <div className="flex items-center gap-1 p-1 bg-gray-100 rounded-xl border border-gray-200">
          {canManageSettings && (
            <>
              <button
                type="button"
                onClick={() => setActiveTab('company')}
                className={cn(
                  'px-4 py-2 text-xs font-bold rounded-lg transition-all whitespace-nowrap flex items-center gap-2',
                  activeTab === 'company' ? 'bg-white text-teal shadow-sm' : 'text-gray-600 hover:text-gray-900'
                )}
              >
                <Building2 className="w-4 h-4" />
                Empresa & Logo
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('permissions')}
                className={cn(
                  'px-4 py-2 text-xs font-bold rounded-lg transition-all whitespace-nowrap flex items-center gap-2',
                  activeTab === 'permissions' ? 'bg-white text-teal shadow-sm' : 'text-gray-600 hover:text-gray-900'
                )}
              >
                <Shield className="w-4 h-4" />
                Acessos & Permissões
              </button>
            </>
          )}
          <button
            type="button"
            onClick={() => setActiveTab('account')}
            className={cn(
              'px-4 py-2 text-xs font-bold rounded-lg transition-all whitespace-nowrap flex items-center gap-2',
              activeTab === 'account' ? 'bg-white text-teal shadow-sm' : 'text-gray-600 hover:text-gray-900'
            )}
          >
            <KeyRound className="w-4 h-4" />
            Minha Conta
          </button>
        </div>
      </div>

      {feedback && (
        <div
          className={cn(
            'p-4 rounded-xl border flex items-center gap-3 text-sm font-semibold',
            feedback.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-red-50 border-red-200 text-red-800'
          )}
        >
          {feedback.type === 'success' ? <CheckCircle2 className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
          <span>{feedback.text}</span>
        </div>
      )}

      {/* TAB 1: COMPANY BRANDING & INFO */}
      {activeTab === 'company' && canManageSettings && (
        <form onSubmit={handleSaveCompany} className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <Card className="border border-gray-200 shadow-sm bg-white rounded-2xl">
            <CardHeader className="border-b border-gray-100">
              <CardTitle className="text-lg">Logotipo da Agência</CardTitle>
              <CardDescription>Utilizado na barra lateral, recibos impressos e relatórios PDF.</CardDescription>
            </CardHeader>
            <CardContent className="p-6 space-y-6 flex flex-col items-center">
              <div className="w-40 h-40 rounded-2xl border-2 border-dashed border-gray-200 bg-gray-50 flex items-center justify-center overflow-hidden p-3">
                {companyForm.logoUrl ? (
                  <img
                    src={companyForm.logoUrl}
                    alt="Logo da Empresa"
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-contain"
                  />
                ) : (
                  <div className="text-center space-y-2 text-gray-400">
                    <ShieldCheck className="w-12 h-12 mx-auto text-teal" />
                    <p className="text-xs font-medium">Logo Padrão Ativo</p>
                  </div>
                )}
              </div>

              <div className="w-full space-y-2">
                <label className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-teal text-white rounded-xl text-xs font-bold cursor-pointer hover:bg-teal-dark transition-colors">
                  <Upload className="w-4 h-4" />
                  Carregar Novo Logotipo
                  <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={handleLogoUpload} />
                </label>

                {companyForm.logoUrl && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setCompanyForm((prev) => ({ ...prev, logoUrl: '' }))}
                    className="w-full text-red-600 border-red-200 hover:bg-red-50 gap-2 text-xs font-bold"
                  >
                    <Trash2 className="w-4 h-4" />
                    Remover Logotipo Personalizado
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="lg:col-span-2 border border-gray-200 shadow-sm bg-white rounded-2xl">
            <CardHeader className="border-b border-gray-100">
              <CardTitle className="text-lg">Dados Institucionais e Fiscais</CardTitle>
              <CardDescription>Estas informações aparecem automaticamente em todas as faturas e recibos.</CardDescription>
            </CardHeader>
            <CardContent className="p-6 space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-gray-600 uppercase">Nome da Empresa</label>
                  <Input
                    required
                    value={companyForm.name}
                    onChange={(e) => setCompanyForm({ ...companyForm, name: e.target.value })}
                    className="h-11 bg-gray-50 border-gray-200"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-gray-600 uppercase">NIF</label>
                  <Input
                    required
                    value={companyForm.nif}
                    onChange={(e) => setCompanyForm({ ...companyForm, nif: e.target.value })}
                    className="h-11 bg-gray-50 border-gray-200 font-mono"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-gray-600 uppercase">Subtítulo / Descrição Curta</label>
                <Input
                  value={companyForm.subtitle}
                  onChange={(e) => setCompanyForm({ ...companyForm, subtitle: e.target.value })}
                  className="h-11 bg-gray-50 border-gray-200"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-gray-600 uppercase">Endereço Principal</label>
                  <Input
                    required
                    value={companyForm.address}
                    onChange={(e) => setCompanyForm({ ...companyForm, address: e.target.value })}
                    className="h-11 bg-gray-50 border-gray-200"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-gray-600 uppercase">Referência / Cidade</label>
                  <Input
                    value={companyForm.addressLine2 || ''}
                    onChange={(e) => setCompanyForm({ ...companyForm, addressLine2: e.target.value })}
                    className="h-11 bg-gray-50 border-gray-200"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-gray-600 uppercase">Telefones / WhatsApp</label>
                  <Input
                    required
                    value={companyForm.phone}
                    onChange={(e) => setCompanyForm({ ...companyForm, phone: e.target.value })}
                    className="h-11 bg-gray-50 border-gray-200"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-gray-600 uppercase">E-mail de Contacto</label>
                  <Input
                    type="email"
                    value={companyForm.email}
                    onChange={(e) => setCompanyForm({ ...companyForm, email: e.target.value })}
                    className="h-11 bg-gray-50 border-gray-200"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-gray-600 uppercase">Nota de Rodapé dos Recibos</label>
                <textarea
                  rows={3}
                  value={companyForm.receiptFooterNote}
                  onChange={(e) => setCompanyForm({ ...companyForm, receiptFooterNote: e.target.value })}
                  className="w-full rounded-xl bg-gray-50 border border-gray-200 p-3 text-sm focus:outline-none focus:ring-2 focus:ring-teal"
                />
              </div>

              <div className="flex justify-end pt-2">
                <Button type="submit" disabled={saving} className="bg-teal hover:bg-teal-dark text-white px-6 h-11 font-bold gap-2">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  Guardar Dados da Empresa
                </Button>
              </div>
            </CardContent>
          </Card>
        </form>
      )}

      {/* TAB 2: ACCESS & PERMISSIONS */}
      {activeTab === 'permissions' && canManageSettings && (
        <div className="space-y-8">
          <Card className="border border-gray-200 shadow-sm bg-white rounded-2xl">
            <CardHeader className="border-b border-gray-100 flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-lg">Matriz de Permissões por Cargo</CardTitle>
                <CardDescription>
                  Defina o que funcionários e clientes podem aceder por padrão. Administradores possuem acesso total.
                </CardDescription>
              </div>
              <Button onClick={handleSaveRolePermissions} disabled={saving} className="bg-teal hover:bg-teal-dark text-white gap-2">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Salvar Matriz
              </Button>
            </CardHeader>
            <CardContent className="p-0 overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-gray-50 text-xs font-bold text-gray-500 uppercase border-b border-gray-100">
                    <th className="px-6 py-4">Funcionalidade / Módulo</th>
                    <th className="px-6 py-4 text-center">Administrador</th>
                    <th className="px-6 py-4 text-center">Funcionário</th>
                    <th className="px-6 py-4 text-center">Cliente</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {ALL_PERMISSIONS.map((perm) => (
                    <tr key={perm.key} className="hover:bg-gray-50/70">
                      <td className="px-6 py-4">
                        <p className="text-sm font-bold text-gray-900">{perm.label}</p>
                        <p className="text-xs text-gray-500">{perm.description}</p>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className="text-xs font-bold text-teal">Total</span>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <input
                          type="checkbox"
                          checked={empPerms.includes(perm.key)}
                          onChange={() => toggleRolePerm('employee', perm.key)}
                          className="w-4 h-4 accent-teal cursor-pointer"
                        />
                      </td>
                      <td className="px-6 py-4 text-center">
                        <input
                          type="checkbox"
                          checked={clientPerms.includes(perm.key)}
                          onChange={() => toggleRolePerm('client', perm.key)}
                          className="w-4 h-4 accent-teal cursor-pointer"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>

          <Card className="border border-gray-200 shadow-sm bg-white rounded-2xl">
            <CardHeader className="border-b border-gray-100">
              <CardTitle className="text-lg">Controlo Individual de Utilizadores</CardTitle>
              <CardDescription>
                Altere cargos, suspenda acessos ou personalize permissões específicas por utilizador.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0 overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-gray-50 text-xs font-bold text-gray-500 uppercase border-b border-gray-100">
                    <th className="px-6 py-4">Utilizador</th>
                    <th className="px-6 py-4">Cargo</th>
                    <th className="px-6 py-4">Estado</th>
                    <th className="px-6 py-4 text-right">Acções</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {allUsers.map((u) => {
                    const isSelf = u.uid === profile?.uid;
                    const isActive = u.active !== false;
                    return (
                      <tr key={u.uid} className="hover:bg-gray-50/70">
                        <td className="px-6 py-4">
                          <p className="text-sm font-bold text-gray-900">{u.displayName || 'Sem Nome'}</p>
                          <p className="text-xs text-gray-500">{u.email}</p>
                        </td>
                        <td className="px-6 py-4">
                          <select
                            value={u.role}
                            disabled={isSelf}
                            onChange={(e) => handleUpdateUserRole(u.uid, e.target.value as UserRole)}
                            className="h-9 rounded-lg border border-gray-200 bg-white px-3 text-xs font-bold text-gray-700 disabled:opacity-60"
                          >
                            <option value="admin">Administrador</option>
                            <option value="employee">Funcionário</option>
                            <option value="client">Cliente</option>
                          </select>
                        </td>
                        <td className="px-6 py-4">
                          <span
                            className={cn(
                              'text-xs font-bold',
                              isActive ? 'text-emerald-700' : 'text-red-600'
                            )}
                          >
                            {isActive ? 'Ativo' : 'Suspenso'}
                            {u.mustChangePassword ? ' · Troca de passe pendente' : ''}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right space-x-2 whitespace-nowrap">
                          {u.role !== 'admin' && (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => openCustomPermsModal(u)}
                              className="text-xs font-semibold"
                            >
                              Permissões
                            </Button>
                          )}
                          {!isSelf && (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => handleToggleUserActive(u)}
                              className={cn(
                                'text-xs font-semibold gap-1',
                                isActive ? 'text-red-600 border-red-200 hover:bg-red-50' : 'text-emerald-700 border-emerald-200 hover:bg-emerald-50'
                              )}
                            >
                              {isActive ? <UserX className="w-3.5 h-3.5" /> : <UserCheck className="w-3.5 h-3.5" />}
                              {isActive ? 'Suspender' : 'Ativar'}
                            </Button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </div>
      )}

      {/* TAB 3: MY ACCOUNT & PASSWORD */}
      {activeTab === 'account' && (
        <Card className="max-w-2xl border border-gray-200 shadow-sm bg-white rounded-2xl">
          <CardHeader className="border-b border-gray-100">
            <CardTitle className="text-lg">Minha Conta & Segurança</CardTitle>
            <CardDescription>Atualize o seu nome de exibição e defina uma nova palavra-passe de acesso.</CardDescription>
          </CardHeader>
          <CardContent className="p-6">
            <form onSubmit={handleSaveAccount} className="space-y-5">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-gray-600 uppercase">E-mail de Acesso</label>
                <Input disabled value={profile?.email || ''} className="h-11 bg-gray-100 border-gray-200 text-gray-500" />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-gray-600 uppercase">Nome Completo</label>
                <Input
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="h-11 bg-gray-50 border-gray-200"
                />
              </div>

              <div className="pt-4 border-t border-gray-100 space-y-4">
                <h4 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                  <Lock className="w-4 h-4 text-teal" />
                  Alterar Palavra-passe (opcional)
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-gray-600 uppercase">Nova Palavra-passe</label>
                    <div className="relative">
                      <Input
                        type={showPass ? 'text' : 'password'}
                        placeholder="Mínimo 6 caracteres"
                        value={newPass}
                        onChange={(e) => setNewPass(e.target.value)}
                        className="h-11 bg-gray-50 border-gray-200 pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPass(!showPass)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"
                      >
                        {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-gray-600 uppercase">Confirmar Palavra-passe</label>
                    <Input
                      type={showPass ? 'text' : 'password'}
                      placeholder="Repita a palavra-passe"
                      value={confirmPass}
                      onChange={(e) => setConfirmPass(e.target.value)}
                      className="h-11 bg-gray-50 border-gray-200"
                    />
                  </div>
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <Button type="submit" disabled={saving} className="bg-teal hover:bg-teal-dark text-white px-6 h-11 font-bold gap-2">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  Guardar Alterações
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Individual User Permissions Modal */}
      {editingUserPerms && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <Card className="w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-gray-200 max-h-[85vh] flex flex-col">
            <CardHeader className="border-b border-gray-100">
              <CardTitle className="text-lg">Permissões de {editingUserPerms.displayName || editingUserPerms.email}</CardTitle>
              <CardDescription>Selecione as permissões específicas atribuídas a este utilizador.</CardDescription>
            </CardHeader>
            <CardContent className="p-6 overflow-y-auto space-y-3">
              {ALL_PERMISSIONS.map((perm) => {
                const checked = customPermsDraft.includes(perm.key);
                return (
                  <label
                    key={perm.key}
                    className="flex items-start gap-3 p-3 rounded-xl border border-gray-100 hover:bg-gray-50 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() =>
                        setCustomPermsDraft((prev) =>
                          prev.includes(perm.key) ? prev.filter((k) => k !== perm.key) : [...prev, perm.key]
                        )
                      }
                      className="mt-1 w-4 h-4 accent-teal"
                    />
                    <div>
                      <p className="text-sm font-bold text-gray-900">{perm.label}</p>
                      <p className="text-xs text-gray-500">{perm.description}</p>
                    </div>
                  </label>
                );
              })}
            </CardContent>
            <div className="p-4 border-t border-gray-100 flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setEditingUserPerms(null)}>
                Cancelar
              </Button>
              <Button
                type="button"
                onClick={handleSaveUserCustomPerms}
                disabled={saving}
                className="bg-teal hover:bg-teal-dark text-white"
              >
                Guardar Permissões
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
