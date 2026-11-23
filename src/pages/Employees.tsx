/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import {
  collection,
  onSnapshot,
  query,
  where,
  doc,
  updateDoc,
  deleteDoc,
  setDoc,
  addDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { db, OperationType, handleFirestoreError } from '@/src/firebase';
import { useAuth } from '@/src/hooks/useAuth';
import { useCompanySettings } from '@/src/hooks/useCompanySettings';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/src/components/ui/Card';
import { Button } from '@/src/components/ui/Button';
import { Input } from '@/src/components/ui/Input';
import { Badge } from '@/src/components/ui/Badge';
import { ALL_PERMISSIONS, HR_DEPARTMENTS, PAYMENT_METHODS } from '@/src/constants';
import { EmployeeDocument, EmployeePayslip, PermissionKey, UserProfile } from '@/src/types';
import { generateRandomPassword } from '@/src/utils/cryptoHelpers';
import {
  compressImageToDataUrl,
  downloadFileFromUrlOrData,
  formatFileSize,
  processUploadedFile,
} from '@/src/utils/fileHelpers';
import { generatePayslipPDF } from '@/src/utils/pdfGenerator';
import {
  UserPlus,
  Mail,
  Trash2,
  Plus,
  KeyRound,
  Eye,
  EyeOff,
  RefreshCw,
  Copy,
  Check,
  AlertCircle,
  CheckCircle2,
  Shield,
  Lock,
  Phone,
  MapPin,
  CreditCard,
  FileText,
  Upload,
  Download,
  ArrowLeft,
  User,
  Briefcase,
  Edit2,
  Camera,
  Loader2,
  Search,
  Wallet,
  X,
} from 'lucide-react';
import { cn, formatCurrency } from '@/src/lib/utils';

type HRTab = 'profile' | 'documents' | 'payroll' | 'security';

const HR_DOC_CATEGORIES: { id: EmployeeDocument['category']; label: string }[] = [
  { id: 'bi', label: 'Bilhete de Identidade (BI)' },
  { id: 'passport', label: 'Passaporte' },
  { id: 'contract', label: 'Contrato de Trabalho' },
  { id: 'cv', label: 'Curriculum Vitae (CV)' },
  { id: 'certificate', label: 'Certificado / Habilitações' },
  { id: 'nif', label: 'Cartão de Contribuinte (NIF)' },
  { id: 'other', label: 'Outro Documento Pessoal' },
];

export function Employees() {
  const { profile, createEmployeeAccount } = useAuth();
  const { company, rolePermissions } = useCompanySettings();
  const [employees, setEmployees] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [searchTerm, setSearchTerm] = useState('');
  const [deptFilter, setDeptFilter] = useState('Todos');

  // Selected HR Profile View
  const [selectedUid, setSelectedUid] = useState<string | null>(null);
  const [activeHRTab, setActiveHRTab] = useState<HRTab>('profile');
  const [hrDocs, setHrDocs] = useState<EmployeeDocument[]>([]);
  const [payslips, setPayslips] = useState<EmployeePayslip[]>([]);

  // Modal Create / Edit Staff Member
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUid, setEditingUid] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showPass, setShowPass] = useState(true);
  const [copiedCreds, setCopiedCreds] = useState(false);
  const [createdSummary, setCreatedSummary] = useState<{
    displayName: string;
    email: string;
    initialPassword: string;
    mustChangePassword: boolean;
    authProviderCreated: boolean;
  } | null>(null);

  const [empForm, setEmpForm] = useState({
    staffCode: '',
    displayName: '',
    email: '',
    phone: '',
    address: '',
    idNumber: '',
    nifNumber: '',
    birthDate: '',
    gender: 'Masculino',
    nationality: 'Angolana',
    maritalStatus: 'Solteiro(a)',
    academicLevel: 'Licenciatura',
    jobTitle: 'Consultor de Vistos',
    departments: ['Atendimento & Vistos'] as string[],
    hireDate: new Date().toISOString().slice(0, 10),
    salary: 150000,
    allowances: 25000,
    hourlyRate: 0,
    iban: '',
    employmentStatus: 'Ativo' as NonNullable<UserProfile['employmentStatus']>,
    hrNotes: '',
    photoURL: '',
    role: 'employee' as 'employee' | 'admin',
    initialPassword: generateRandomPassword(8),
    mustChangePassword: true,
    permissions: rolePermissions.employee as PermissionKey[],
  });

  // Upload Personal HR Doc state
  const [docCategory, setDocCategory] = useState<EmployeeDocument['category']>('bi');
  const [docTitle, setDocTitle] = useState('');
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const [previewHrDoc, setPreviewHrDoc] = useState<EmployeeDocument | null>(null);

  // Payslip Issue Modal state
  const [payslipModalOpen, setPayslipModalOpen] = useState(false);
  const [issuingPayslip, setIssuingPayslip] = useState(false);
  const [payslipForm, setPayslipForm] = useState({
    referenceMonth: new Date().toISOString().slice(0, 7),
    baseSalary: 0,
    allowances: 0,
    bonus: 0,
    deductions: 0,
    paymentMethod: PAYMENT_METHODS[0] as string,
    status: 'paid' as 'paid' | 'pending',
    registerExpense: true,
    notes: '',
  });

  // Confirmation modal states (no window.confirm)
  const [empToDelete, setEmpToDelete] = useState<UserProfile | null>(null);
  const [docToDelete, setDocToDelete] = useState<EmployeeDocument | null>(null);
  const [payslipToDelete, setPayslipToDelete] = useState<EmployeePayslip | null>(null);

  useEffect(() => {
    const q = query(collection(db, 'users'), where('role', 'in', ['employee', 'admin']));
    const unsub = onSnapshot(
      q,
      (snapshot) => {
        const list = snapshot.docs.map((d) => ({ ...d.data(), uid: d.id }) as UserProfile);
        setEmployees(list);
        setLoading(false);
        list.forEach((emp) => {
          setDoc(
            doc(db, 'consultants', emp.uid),
            {
              uid: emp.uid,
              displayName: emp.displayName || emp.username || 'Consultor',
              role: emp.role,
              specialty: emp.jobTitle || (emp.role === 'admin' ? 'Direção & Consultoria' : 'Consultor de Vistos'),
              ...(emp.photoURL ? { photoURL: emp.photoURL } : {}),
              active: emp.active !== false,
            },
            { merge: true }
          ).catch(() => {});
        });
      },
      (err) => handleFirestoreError(err, OperationType.GET, 'users')
    );
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!selectedUid) {
      setHrDocs([]);
      setPayslips([]);
      return;
    }

    const qDocs = query(collection(db, 'hr_documents'), where('employeeUid', '==', selectedUid));
    const unsubDocs = onSnapshot(
      qDocs,
      (snap) => {
        const list = snap.docs.map((d) => ({ ...d.data(), id: d.id }) as EmployeeDocument);
        list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        setHrDocs(list);
      },
      () => {}
    );

    const qPay = query(collection(db, 'employee_payslips'), where('employeeUid', '==', selectedUid));
    const unsubPay = onSnapshot(
      qPay,
      (snap) => {
        const list = snap.docs.map((d) => ({ ...d.data(), id: d.id }) as EmployeePayslip);
        list.sort((a, b) => (b.referenceMonth || '').localeCompare(a.referenceMonth || ''));
        setPayslips(list);
      },
      () => {}
    );

    return () => {
      unsubDocs();
      unsubPay();
    };
  }, [selectedUid]);

  const selectedEmployee = useMemo(
    () => employees.find((e) => e.uid === selectedUid) || null,
    [employees, selectedUid]
  );

  const filteredEmployees = useMemo(() => {
    return employees.filter((emp) => {
      const q = searchTerm.toLowerCase();
      const matchesSearch =
        !q ||
        (emp.displayName || '').toLowerCase().includes(q) ||
        (emp.email || '').toLowerCase().includes(q) ||
        (emp.staffCode || '').toLowerCase().includes(q) ||
        (emp.jobTitle || '').toLowerCase().includes(q) ||
        (emp.idNumber || '').toLowerCase().includes(q);
      const matchesDept =
        deptFilter === 'Todos' || (emp.departments && emp.departments.includes(deptFilter));
      return matchesSearch && matchesDept;
    });
  }, [employees, searchTerm, deptFilter]);

  const handleOpenCreateModal = () => {
    setError(null);
    setEditingUid(null);
    setEmpForm({
      staffCode: `FUNC-${String(employees.length + 1).padStart(3, '0')}`,
      displayName: '',
      email: '',
      phone: '',
      address: '',
      idNumber: '',
      nifNumber: '',
      birthDate: '',
      gender: 'Masculino',
      nationality: 'Angolana',
      maritalStatus: 'Solteiro(a)',
      academicLevel: 'Licenciatura',
      jobTitle: 'Consultor de Vistos',
      departments: ['Atendimento & Vistos'],
      hireDate: new Date().toISOString().slice(0, 10),
      salary: 150000,
      allowances: 25000,
      hourlyRate: 0,
      iban: '',
      employmentStatus: 'Ativo',
      hrNotes: '',
      photoURL: '',
      role: 'employee',
      initialPassword: generateRandomPassword(8),
      mustChangePassword: true,
      permissions: rolePermissions.employee,
    });
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (emp: UserProfile) => {
    setError(null);
    setEditingUid(emp.uid);
    setEmpForm({
      staffCode: emp.staffCode || '',
      displayName: emp.displayName || '',
      email: emp.email || '',
      phone: emp.phone || '',
      address: emp.address || '',
      idNumber: emp.idNumber || '',
      nifNumber: emp.nifNumber || '',
      birthDate: emp.birthDate || '',
      gender: emp.gender || 'Masculino',
      nationality: emp.nationality || 'Angolana',
      maritalStatus: emp.maritalStatus || 'Solteiro(a)',
      academicLevel: emp.academicLevel || 'Licenciatura',
      jobTitle: emp.jobTitle || 'Consultor de Vistos',
      departments: emp.departments && emp.departments.length > 0 ? emp.departments : ['Atendimento & Vistos'],
      hireDate: emp.hireDate || '',
      salary: emp.salary || 0,
      allowances: emp.allowances || 0,
      hourlyRate: emp.hourlyRate || 0,
      iban: emp.iban || '',
      employmentStatus: emp.employmentStatus || 'Ativo',
      hrNotes: emp.hrNotes || '',
      photoURL: emp.photoURL || '',
      role: emp.role === 'admin' ? 'admin' : 'employee',
      initialPassword: '',
      mustChangePassword: Boolean(emp.mustChangePassword),
      permissions: emp.permissions || rolePermissions.employee,
    });
    setIsModalOpen(true);
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>, directUid?: string) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const processed = await compressImageToDataUrl(file, 480, 0.8);
      if (directUid) {
        await updateDoc(doc(db, 'users', directUid), {
          photoURL: processed.dataUrl,
          updatedAt: serverTimestamp(),
        });
      } else {
        setEmpForm((prev) => ({ ...prev, photoURL: processed.dataUrl }));
      }
    } catch (err) {
      console.error('Erro ao carregar foto:', err);
    }
  };

  const handleSubmitEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!editingUid && empForm.initialPassword.length < 6) {
      setError('A palavra-passe inicial deve ter pelo menos 6 caracteres.');
      return;
    }

    setSubmitting(true);
    try {
      const hrFields = {
        displayName: empForm.displayName.trim(),
        staffCode: empForm.staffCode.trim(),
        phone: empForm.phone.trim(),
        address: empForm.address.trim(),
        idNumber: empForm.idNumber.trim().toUpperCase(),
        nifNumber: empForm.nifNumber.trim().toUpperCase(),
        birthDate: empForm.birthDate,
        gender: empForm.gender,
        nationality: empForm.nationality.trim(),
        maritalStatus: empForm.maritalStatus,
        academicLevel: empForm.academicLevel,
        jobTitle: empForm.jobTitle.trim(),
        departments: empForm.departments,
        hireDate: empForm.hireDate,
        salary: Number(empForm.salary) || 0,
        allowances: Number(empForm.allowances) || 0,
        hourlyRate: Number(empForm.hourlyRate) || 0,
        iban: empForm.iban.trim(),
        employmentStatus: empForm.employmentStatus,
        hrNotes: empForm.hrNotes.trim(),
        photoURL: empForm.photoURL,
        updatedAt: new Date().toISOString(),
      };

      if (editingUid) {
        await updateDoc(doc(db, 'users', editingUid), {
          ...hrFields,
          role: empForm.role,
          updatedAt: serverTimestamp(),
        });
        setIsModalOpen(false);
      } else {
        const normalizedEmail = empForm.email.includes('@')
          ? empForm.email.trim().toLowerCase()
          : `${empForm.email.trim().toLowerCase().replace(/\s+/g, '')}@vistosliberdade.com`;

        const result = await createEmployeeAccount({
          displayName: empForm.displayName.trim(),
          email: normalizedEmail,
          username: normalizedEmail.split('@')[0],
          initialPassword: empForm.initialPassword,
          role: empForm.role,
          mustChangePassword: empForm.mustChangePassword,
          permissions: empForm.role === 'employee' ? empForm.permissions : undefined,
        });

        await setDoc(doc(db, 'users', result.uid), hrFields, { merge: true });

        setCreatedSummary({
          displayName: empForm.displayName.trim(),
          email: normalizedEmail,
          initialPassword: empForm.initialPassword,
          mustChangePassword: empForm.mustChangePassword,
          authProviderCreated: result.authProviderCreated,
        });
        setIsModalOpen(false);
        setSelectedUid(result.uid);
      }
    } catch (err: any) {
      setError(err?.message || 'Erro ao guardar ficha do funcionário.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleUploadHRDoc = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !selectedEmployee) return;

    setUploadingDoc(true);
    try {
      const processed = await processUploadedFile(file);
      const docRef = doc(collection(db, 'hr_documents'));
      const catLabel = HR_DOC_CATEGORIES.find((c) => c.id === docCategory)?.label || 'Documento';
      const payload: EmployeeDocument = {
        id: docRef.id,
        employeeUid: selectedEmployee.uid,
        title: docTitle.trim() || `${catLabel} - ${processed.fileName}`,
        category: docCategory,
        fileName: processed.fileName,
        mimeType: processed.mimeType,
        fileSize: processed.fileSize,
        dataUrl: processed.dataUrl,
        uploadedBy: profile?.uid || '',
        createdAt: new Date().toISOString(),
      };
      await setDoc(docRef, payload);
      setDocTitle('');
    } catch (err: any) {
      setError(err?.message || 'Erro ao carregar documento pessoal.');
    } finally {
      setUploadingDoc(false);
    }
  };

  const handleOpenPayslipModal = () => {
    if (!selectedEmployee) return;
    setPayslipForm({
      referenceMonth: new Date().toISOString().slice(0, 7),
      baseSalary: selectedEmployee.salary || 0,
      allowances: selectedEmployee.allowances || 0,
      bonus: 0,
      deductions: 0,
      paymentMethod: PAYMENT_METHODS[0],
      status: 'paid',
      registerExpense: true,
      notes: '',
    });
    setPayslipModalOpen(true);
  };

  const handleIssuePayslip = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEmployee) return;
    setIssuingPayslip(true);
    try {
      const netSalary = Math.max(
        0,
        (Number(payslipForm.baseSalary) || 0) +
          (Number(payslipForm.allowances) || 0) +
          (Number(payslipForm.bonus) || 0) -
          (Number(payslipForm.deductions) || 0)
      );
      const payRef = doc(collection(db, 'employee_payslips'));
      const payslipData: EmployeePayslip = {
        id: payRef.id,
        employeeUid: selectedEmployee.uid,
        employeeName: selectedEmployee.displayName || selectedEmployee.email,
        staffCode: selectedEmployee.staffCode || '',
        jobTitle: selectedEmployee.jobTitle || 'Colaborador',
        idNumber: selectedEmployee.idNumber || '',
        iban: selectedEmployee.iban || '',
        referenceMonth: payslipForm.referenceMonth,
        baseSalary: Number(payslipForm.baseSalary) || 0,
        allowances: Number(payslipForm.allowances) || 0,
        bonus: Number(payslipForm.bonus) || 0,
        deductions: Number(payslipForm.deductions) || 0,
        netSalary,
        paymentMethod: payslipForm.paymentMethod,
        status: payslipForm.status,
        paidAt: payslipForm.status === 'paid' ? new Date().toISOString() : undefined,
        notes: payslipForm.notes.trim(),
        issuedBy: profile?.uid || '',
        createdAt: new Date().toISOString(),
      };

      await setDoc(payRef, payslipData);

      if (payslipForm.registerExpense && payslipForm.status === 'paid' && netSalary > 0) {
        await addDoc(collection(db, 'financial_transactions'), {
          type: 'expense',
          expenseScope: 'payroll',
          category: 'Salários & Subsídios',
          amount: netSalary,
          date: new Date().toISOString().slice(0, 10),
          description: `Salário ${payslipForm.referenceMonth} · ${payslipData.employeeName}`,
          relatedTo: selectedEmployee.uid,
          status: 'completed',
          paymentMethod: payslipForm.paymentMethod,
          createdAt: new Date().toISOString(),
        });
      }

      setPayslipModalOpen(false);
      generatePayslipPDF(payslipData, company);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'employee_payslips');
    } finally {
      setIssuingPayslip(false);
    }
  };

  const handleUpdateRole = async (uid: string, newRole: 'employee' | 'admin') => {
    try {
      await updateDoc(doc(db, 'users', uid), { role: newRole, updatedAt: serverTimestamp() });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${uid}`);
    }
  };

  const handleToggleEmployeePermission = async (emp: UserProfile, perm: PermissionKey) => {
    const current = Array.isArray(emp.permissions) ? emp.permissions : rolePermissions.employee;
    const next = current.includes(perm) ? current.filter((p) => p !== perm) : [...current, perm];
    try {
      await updateDoc(doc(db, 'users', emp.uid), {
        permissions: next,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${emp.uid}`);
    }
  };

  const handleRequirePasswordReset = async (emp: UserProfile) => {
    try {
      await updateDoc(doc(db, 'users', emp.uid), {
        mustChangePassword: true,
        updatedAt: serverTimestamp(),
      });
      if (emp.email) {
        await updateDoc(doc(db, 'staff_invites', emp.email.toLowerCase()), {
          mustChangePassword: true,
        }).catch(() => {});
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${emp.uid}`);
    }
  };

  const handleConfirmDeleteEmployee = async () => {
    if (!empToDelete || empToDelete.uid === profile?.uid) return;
    try {
      await deleteDoc(doc(db, 'users', empToDelete.uid));
      await deleteDoc(doc(db, 'consultants', empToDelete.uid)).catch(() => {});
      if (selectedUid === empToDelete.uid) setSelectedUid(null);
      setEmpToDelete(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `users/${empToDelete.uid}`);
    }
  };

  const copyCreatedCredentials = async () => {
    if (!createdSummary) return;
    const msg = [
      `Acesso ao Sistema - ${company.name}`,
      `Colaborador: ${createdSummary.displayName}`,
      `Utilizador/E-mail: ${createdSummary.email}`,
      `Palavra-passe Provisória: ${createdSummary.initialPassword}`,
      createdSummary.mustChangePassword
        ? 'Nota: O sistema irá solicitar que defina uma nova palavra-passe no primeiro login.'
        : '',
    ]
      .filter(Boolean)
      .join('\n');
    await navigator.clipboard.writeText(msg);
    setCopiedCreds(true);
    setTimeout(() => setCopiedCreds(false), 2500);
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 tracking-tight font-display">
            Recursos Humanos & Funcionários
          </h1>
          <p className="text-gray-500 text-sm">
            Gerencie perfis completos de RH, documentos pessoais, salários, recibos de pagamento e acessos da equipa.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {selectedEmployee && (
            <Button
              type="button"
              variant="outline"
              onClick={() => setSelectedUid(null)}
              className="gap-2 border-gray-200"
            >
              <ArrowLeft className="w-4 h-4" />
              Voltar à Equipa
            </Button>
          )}
          <Button onClick={handleOpenCreateModal} className="bg-teal hover:bg-teal-dark text-white gap-2 shadow-lg shadow-teal/15">
            <UserPlus className="w-4 h-4" />
            Adicionar Membro do Staff
          </Button>
        </div>
      </div>

      {createdSummary && (
        <Card className="border border-emerald-200 bg-emerald-50/70 rounded-2xl">
          <CardContent className="p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-emerald-800 font-bold text-sm">
                <CheckCircle2 className="w-5 h-5" />
                <span>Funcionário criado com sucesso: {createdSummary.displayName}</span>
              </div>
              <p className="text-xs text-emerald-700 font-mono">
                E-mail/Utilizador: <strong>{createdSummary.email}</strong> · Passe inicial:{' '}
                <strong>{createdSummary.initialPassword}</strong>
              </p>
              {createdSummary.mustChangePassword && (
                <p className="text-xs text-emerald-700">
                  Alteração obrigatória da palavra-passe ativada para o primeiro login.
                </p>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={copyCreatedCredentials}
                className="bg-white border-emerald-300 text-emerald-800 gap-1.5"
              >
                {copiedCreds ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                {copiedCreds ? 'Copiado!' : 'Copiar Credenciais'}
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => setCreatedSummary(null)}>
                Fechar
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* DETAIL HR PROFILE VIEW (Inspired by Captura 102) */}
      {selectedEmployee ? (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Left Navigation & Profile Card */}
          <div className="lg:col-span-1 space-y-6">
            <Card className="border border-gray-200 bg-white overflow-hidden">
              <div className="p-5 border-b border-gray-100 text-center bg-gray-50/60">
                <p className="text-xs font-black uppercase tracking-widest text-gray-500 mb-1">
                  {selectedEmployee.staffCode || 'COLABORADOR'}
                </p>
                <h2 className="text-lg font-black text-gray-900 uppercase">
                  {selectedEmployee.displayName || 'Sem Nome'}
                </h2>
              </div>
              <div className="divide-y divide-gray-100">
                {[
                  { id: 'profile', label: 'Perfil da Equipa', icon: User },
                  { id: 'documents', label: `Documentos Pessoais (${hrDocs.length})`, icon: FileText },
                  { id: 'payroll', label: `Salário & Recibos (${payslips.length})`, icon: Wallet },
                  { id: 'security', label: 'Acessos & Permissões', icon: Shield },
                ].map((tab) => {
                  const Icon = tab.icon;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setActiveHRTab(tab.id as HRTab)}
                      className={cn(
                        'w-full flex items-center gap-3 px-5 py-3.5 text-sm font-semibold transition-colors text-left',
                        activeHRTab === tab.id
                          ? 'bg-teal-light/60 text-teal border-l-4 border-teal'
                          : 'text-gray-600 hover:bg-gray-50'
                      )}
                    >
                      <Icon className="w-4 h-4 shrink-0" />
                      <span className="truncate">{tab.label}</span>
                    </button>
                  );
                })}
              </div>
            </Card>

            {/* Quick Avatar & Contact Box */}
            <Card className="border border-gray-200 bg-white">
              <CardContent className="p-6 text-center space-y-4">
                <div className="relative mx-auto w-28 h-28">
                  {selectedEmployee.photoURL ? (
                    <img
                      src={selectedEmployee.photoURL}
                      alt={selectedEmployee.displayName}
                      className="w-28 h-28 rounded-full object-cover border-4 border-teal-light shadow"
                    />
                  ) : (
                    <div className="w-28 h-28 rounded-full bg-gray-100 border-4 border-teal-light flex items-center justify-center text-gray-400 text-3xl font-black">
                      {(selectedEmployee.displayName || selectedEmployee.email || '?')[0].toUpperCase()}
                    </div>
                  )}
                  <label
                    title="Alterar Foto"
                    className="absolute bottom-0 right-0 w-9 h-9 rounded-full bg-teal text-white flex items-center justify-center shadow-md cursor-pointer hover:bg-teal-dark transition-colors"
                  >
                    <Camera className="w-4 h-4" />
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => handlePhotoUpload(e, selectedEmployee.uid)}
                      className="hidden"
                    />
                  </label>
                </div>

                <div>
                  <h3 className="text-base font-bold text-gray-900">{selectedEmployee.displayName}</h3>
                  <p className="text-xs font-semibold text-teal">{selectedEmployee.jobTitle || 'Consultor'}</p>
                  <div className="mt-2">
                    <Badge variant={selectedEmployee.employmentStatus === 'Suspenso' ? 'danger' : 'success'}>
                      {selectedEmployee.employmentStatus || 'Ativo'}
                    </Badge>
                  </div>
                </div>

                <div className="pt-4 border-t border-gray-100 space-y-2.5 text-left text-xs text-gray-600">
                  <div className="flex items-center gap-2">
                    <Mail className="w-4 h-4 text-gray-400 shrink-0" />
                    <span className="truncate">{selectedEmployee.email}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Phone className="w-4 h-4 text-gray-400 shrink-0" />
                    <span>{selectedEmployee.phone || 'Sem telemóvel'}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-gray-400 shrink-0" />
                    <span className="line-clamp-2">{selectedEmployee.address || 'Morada não preenchida'}</span>
                  </div>
                </div>

                {selectedEmployee.departments && selectedEmployee.departments.length > 0 && (
                  <div className="pt-4 border-t border-gray-100 text-left space-y-2">
                    <p className="text-[10px] font-bold uppercase text-gray-400 tracking-wider">Departamentos</p>
                    <div className="flex flex-wrap gap-1.5">
                      {selectedEmployee.departments.map((d) => (
                        <span
                          key={d}
                          className="px-2 py-0.5 rounded-md bg-gray-100 text-gray-700 text-[11px] font-semibold"
                        >
                          {d}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Right Panel: Selected HR Tab */}
          <div className="lg:col-span-3 space-y-6">
            {activeHRTab === 'profile' && (
              <Card className="border border-gray-200 bg-white">
                <CardHeader className="border-b border-gray-100 flex flex-row items-center justify-between">
                  <div>
                    <CardTitle className="text-xl font-bold">Informação Geral & Ficha de RH</CardTitle>
                    <CardDescription>Dados pessoais, identificação, contacto, contrato e remuneração.</CardDescription>
                  </div>
                  <Button
                    type="button"
                    onClick={() => handleOpenEditModal(selectedEmployee)}
                    className="bg-teal hover:bg-teal-dark text-white gap-1.5 text-xs font-bold"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                    Editar Ficha
                  </Button>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="divide-y divide-gray-100">
                    {[
                      ['Código da Equipa', selectedEmployee.staffCode || '---'],
                      ['Nome Completo', selectedEmployee.displayName || '---'],
                      ['Nº Identificação (BI / Passaporte)', selectedEmployee.idNumber || '---'],
                      ['NIF Pessoal', selectedEmployee.nifNumber || '---'],
                      ['E-mail Corporativo', selectedEmployee.email || '---'],
                      ['Telemóvel / WhatsApp', selectedEmployee.phone || '---'],
                      ['Morada Completa', selectedEmployee.address || '---'],
                      ['Cargo / Função', selectedEmployee.jobTitle || '---'],
                      ['Data de Admissão', selectedEmployee.hireDate || '---'],
                      ['Data de Nascimento', selectedEmployee.birthDate || '---'],
                      ['Género / Estado Civil', `${selectedEmployee.gender || '---'} · ${selectedEmployee.maritalStatus || '---'}`],
                      ['Nacionalidade / Nível Académico', `${selectedEmployee.nationality || '---'} · ${selectedEmployee.academicLevel || '---'}`],
                      ['Salário Base Mensal', formatCurrency(selectedEmployee.salary || 0)],
                      ['Subsídios Mensais', formatCurrency(selectedEmployee.allowances || 0)],
                      ['IBAN / Conta Bancária', selectedEmployee.iban || '---'],
                      ['Observações RH', selectedEmployee.hrNotes || 'Sem notas adicionais.'],
                    ].map(([label, val], idx) => (
                      <div
                        key={idx}
                        className={cn(
                          'grid grid-cols-1 sm:grid-cols-3 px-6 py-3.5 text-sm',
                          idx % 2 === 0 ? 'bg-gray-50/40' : 'bg-white'
                        )}
                      >
                        <span className="font-semibold text-gray-500">{label}</span>
                        <span className="sm:col-span-2 font-bold text-gray-900">{val}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {activeHRTab === 'documents' && (
              <Card className="border border-gray-200 bg-white">
                <CardHeader className="border-b border-gray-100">
                  <CardTitle className="text-xl font-bold">Documentos Pessoais do Funcionário</CardTitle>
                  <CardDescription>
                    Anexe BI, Passaporte, Contrato de Trabalho, CV, NIF e certificados (Imagem ou PDF até 720KB).
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-6 space-y-6">
                  <div className="p-4 rounded-2xl bg-gray-50 border border-gray-200 grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
                    <div className="space-y-1">
                      <label className="text-[11px] font-bold text-gray-600 uppercase">Tipo de Documento</label>
                      <select
                        value={docCategory}
                        onChange={(e) => setDocCategory(e.target.value as any)}
                        className="w-full h-10 rounded-lg border border-gray-200 bg-white px-3 text-xs font-bold"
                      >
                        {HR_DOC_CATEGORIES.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[11px] font-bold text-gray-600 uppercase">Título (Opcional)</label>
                      <Input
                        placeholder="Ex: Cópia BI Frente e Verso"
                        value={docTitle}
                        onChange={(e) => setDocTitle(e.target.value)}
                        className="h-10 bg-white text-xs"
                      />
                    </div>
                    <div>
                      <label
                        className={cn(
                          'w-full h-10 rounded-lg bg-teal hover:bg-teal-dark text-white text-xs font-bold flex items-center justify-center gap-2 cursor-pointer transition-colors',
                          uploadingDoc && 'opacity-60 pointer-events-none'
                        )}
                      >
                        {uploadingDoc ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                        {uploadingDoc ? 'A carregar...' : 'Carregar Documento'}
                        <input
                          type="file"
                          accept="image/*,.pdf,.doc,.docx"
                          onChange={handleUploadHRDoc}
                          className="hidden"
                        />
                      </label>
                    </div>
                  </div>

                  {error && (
                    <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-semibold flex items-center gap-2">
                      <AlertCircle className="w-4 h-4" />
                      <span>{error}</span>
                    </div>
                  )}

                  {hrDocs.length === 0 ? (
                    <div className="py-12 text-center border border-dashed border-gray-200 rounded-2xl text-sm text-gray-400">
                      Nenhum documento pessoal anexado a este funcionário ainda.
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {hrDocs.map((d) => (
                        <div
                          key={d.id}
                          className="p-4 rounded-xl border border-gray-200 flex items-center justify-between gap-3 hover:border-teal/40 transition-colors"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-10 h-10 rounded-lg bg-teal-light text-teal flex items-center justify-center shrink-0">
                              <FileText className="w-5 h-5" />
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-bold text-gray-900 truncate">{d.title}</p>
                              <p className="text-[11px] text-gray-500 truncate">
                                {HR_DOC_CATEGORIES.find((c) => c.id === d.category)?.label} · {formatFileSize(d.fileSize)}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              title="Visualizar"
                              onClick={() => setPreviewHrDoc(d)}
                              className="h-8 w-8 text-gray-500 hover:text-teal"
                            >
                              <Eye className="w-4 h-4" />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              title="Baixar"
                              onClick={() => downloadFileFromUrlOrData(d.dataUrl, d.fileName)}
                              className="h-8 w-8 text-gray-500 hover:text-teal"
                            >
                              <Download className="w-4 h-4" />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              title="Eliminar"
                              onClick={() => setDocToDelete(d)}
                              className="h-8 w-8 text-red-400 hover:text-red-600"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {activeHRTab === 'payroll' && (
              <Card className="border border-gray-200 bg-white">
                <CardHeader className="border-b border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <CardTitle className="text-xl font-bold">Salário & Recibos de Pagamento (Payslips)</CardTitle>
                    <CardDescription>
                      Consulte o salário contratado e emita recibos mensais de vencimento em PDF.
                    </CardDescription>
                  </div>
                  <Button
                    type="button"
                    onClick={handleOpenPayslipModal}
                    className="bg-teal hover:bg-teal-dark text-white font-bold text-xs gap-2"
                  >
                    <Plus className="w-4 h-4" />
                    Gerar Recibo de Salário
                  </Button>
                </CardHeader>
                <CardContent className="p-6 space-y-6">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="p-4 rounded-xl bg-teal-light/40 border border-teal/20">
                      <p className="text-[11px] font-bold uppercase text-teal">Salário Base</p>
                      <p className="text-xl font-black text-gray-900 tabular-nums mt-1">
                        {formatCurrency(selectedEmployee.salary || 0)}
                      </p>
                    </div>
                    <div className="p-4 rounded-xl bg-gray-50 border border-gray-200">
                      <p className="text-[11px] font-bold uppercase text-gray-500">Subsídios</p>
                      <p className="text-xl font-black text-gray-900 tabular-nums mt-1">
                        {formatCurrency(selectedEmployee.allowances || 0)}
                      </p>
                    </div>
                    <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200">
                      <p className="text-[11px] font-bold uppercase text-emerald-700">Remuneração Bruta</p>
                      <p className="text-xl font-black text-emerald-900 tabular-nums mt-1">
                        {formatCurrency((selectedEmployee.salary || 0) + (selectedEmployee.allowances || 0))}
                      </p>
                    </div>
                  </div>

                  <div className="overflow-x-auto border border-gray-200 rounded-xl">
                    <table className="w-full text-left">
                      <thead>
                        <tr className="bg-gray-50 text-xs font-bold text-gray-500 uppercase border-b border-gray-200">
                          <th className="px-4 py-3">Mês Ref.</th>
                          <th className="px-4 py-3">Base + Subsídios</th>
                          <th className="px-4 py-3">Bónus / Desc.</th>
                          <th className="px-4 py-3">Líquido Pago</th>
                          <th className="px-4 py-3">Estado</th>
                          <th className="px-4 py-3 text-right">Acções</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 text-sm">
                        {payslips.length === 0 ? (
                          <tr>
                            <td colSpan={6} className="px-4 py-8 text-center text-gray-400">
                              Nenhum recibo de salário emitido para este colaborador.
                            </td>
                          </tr>
                        ) : (
                          payslips.map((p) => (
                            <tr key={p.id} className="hover:bg-gray-50/70">
                              <td className="px-4 py-3 font-bold text-gray-900">{p.referenceMonth}</td>
                              <td className="px-4 py-3 tabular-nums text-gray-600">
                                {formatCurrency(p.baseSalary + p.allowances)}
                              </td>
                              <td className="px-4 py-3 text-xs tabular-nums">
                                <span className="text-emerald-700">+{formatCurrency(p.bonus)}</span> /{' '}
                                <span className="text-red-600">-{formatCurrency(p.deductions)}</span>
                              </td>
                              <td className="px-4 py-3 font-black text-teal tabular-nums">
                                {formatCurrency(p.netSalary)}
                              </td>
                              <td className="px-4 py-3">
                                <Badge variant={p.status === 'paid' ? 'success' : 'warning'}>
                                  {p.status === 'paid' ? 'Pago' : 'Pendente'}
                                </Badge>
                              </td>
                              <td className="px-4 py-3 text-right space-x-1 whitespace-nowrap">
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  onClick={() => generatePayslipPDF(p, company)}
                                  className="h-8 text-xs font-bold gap-1 border-teal/30 text-teal hover:bg-teal-light"
                                >
                                  <Download className="w-3.5 h-3.5" />
                                  PDF
                                </Button>
                                <Button
                                  type="button"
                                  size="icon"
                                  variant="ghost"
                                  onClick={() => setPayslipToDelete(p)}
                                  className="h-8 w-8 text-red-400 hover:text-red-600"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </Button>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            )}

            {activeHRTab === 'security' && (
              <Card className="border border-gray-200 bg-white">
                <CardHeader className="border-b border-gray-100">
                  <CardTitle className="text-xl font-bold">Acessos, Segurança & Permissões</CardTitle>
                  <CardDescription>
                    Controle o cargo de acesso, troca obrigatória de palavra-passe e permissões por módulo.
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-6 space-y-6">
                  <div className="flex flex-wrap items-center justify-between gap-3 p-4 rounded-xl bg-gray-50 border border-gray-200">
                    <div>
                      <p className="text-sm font-bold text-gray-900">
                        Nível de Acesso: {selectedEmployee.role === 'admin' ? 'Administrador' : 'Funcionário'}
                      </p>
                      <p className="text-xs text-gray-500">
                        {selectedEmployee.mustChangePassword
                          ? 'Troca de palavra-passe pendente no próximo login.'
                          : 'Palavra-passe pessoal já definida.'}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={selectedEmployee.uid === profile?.uid}
                        onClick={() =>
                          handleUpdateRole(
                            selectedEmployee.uid,
                            selectedEmployee.role === 'admin' ? 'employee' : 'admin'
                          )
                        }
                      >
                        {selectedEmployee.role === 'admin' ? 'Tornar Funcionário' : 'Promover a Admin'}
                      </Button>
                      {!selectedEmployee.mustChangePassword && selectedEmployee.uid !== profile?.uid && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => handleRequirePasswordReset(selectedEmployee)}
                          className="text-amber-700 border-amber-200 hover:bg-amber-50 gap-1.5"
                        >
                          <Lock className="w-3.5 h-3.5" />
                          Pedir Nova Passe
                        </Button>
                      )}
                      {selectedEmployee.uid !== profile?.uid && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setEmpToDelete(selectedEmployee)}
                          className="text-red-600 border-red-200 hover:bg-red-50 gap-1.5"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          Remover Funcionário
                        </Button>
                      )}
                    </div>
                  </div>

                  {selectedEmployee.role === 'employee' && (
                    <div className="space-y-3">
                      <p className="text-xs font-bold uppercase text-gray-500 tracking-wider">
                        Permissões Granulares deste Funcionário
                      </p>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {ALL_PERMISSIONS.map((perm) => {
                          const effectivePerms = Array.isArray(selectedEmployee.permissions)
                            ? selectedEmployee.permissions
                            : rolePermissions.employee;
                          const checked = effectivePerms.includes(perm.key);
                          return (
                            <label
                              key={perm.key}
                              className={cn(
                                'flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors',
                                checked ? 'border-teal/40 bg-teal-light/25' : 'border-gray-200 bg-white hover:bg-gray-50'
                              )}
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => handleToggleEmployeePermission(selectedEmployee, perm.key)}
                                className="mt-0.5 w-4 h-4 accent-teal"
                              />
                              <div>
                                <p className="text-xs font-bold text-gray-900">{perm.label}</p>
                                <p className="text-[11px] text-gray-500">{perm.description}</p>
                              </div>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      ) : (
        /* TEAM DIRECTORY LIST */
        <>
          <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <Input
                placeholder="Pesquisar por nome, código, BI, cargo ou email..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 h-10 bg-white border-gray-200"
              />
            </div>
            <select
              value={deptFilter}
              onChange={(e) => setDeptFilter(e.target.value)}
              className="h-10 rounded-xl border border-gray-200 bg-white px-3 text-xs font-bold text-gray-700"
            >
              <option value="Todos">Todos os Departamentos</option>
              {HR_DEPARTMENTS.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>

          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-56 rounded-2xl bg-gray-100 animate-pulse" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredEmployees.map((emp) => (
                <Card
                  key={emp.uid}
                  className="shadow-sm border border-gray-200 hover:shadow-md hover:border-teal/40 transition-all overflow-hidden bg-white flex flex-col justify-between"
                >
                  <div>
                    <div className={cn('h-1.5 w-full', emp.role === 'admin' ? 'bg-teal' : 'bg-teal-medium')} />
                    <CardContent className="p-6">
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex items-center gap-3">
                          {emp.photoURL ? (
                            <img
                              src={emp.photoURL}
                              alt={emp.displayName}
                              className="w-12 h-12 rounded-xl object-cover border border-gray-200"
                            />
                          ) : (
                            <div className="w-12 h-12 rounded-xl bg-teal-light flex items-center justify-center text-teal font-bold text-lg">
                              {(emp.displayName || emp.email || '?')[0].toUpperCase()}
                            </div>
                          )}
                          <div>
                            <p className="text-[10px] font-black uppercase text-gray-400">
                              {emp.staffCode || 'STAFF'}
                            </p>
                            <h3 className="text-base font-bold text-gray-900 line-clamp-1">
                              {emp.displayName || 'Utilizador s/ Nome'}
                            </h3>
                            <p className="text-xs font-semibold text-teal">{emp.jobTitle || 'Consultor'}</p>
                          </div>
                        </div>
                        <Badge variant={emp.role === 'admin' ? 'default' : 'secondary'}>
                          {emp.role === 'admin' ? 'Admin' : 'Equipa'}
                        </Badge>
                      </div>

                      <div className="space-y-1.5 text-xs text-gray-500">
                        <div className="flex items-center gap-2">
                          <Mail className="w-3.5 h-3.5 shrink-0" />
                          <span className="truncate">{emp.email}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Phone className="w-3.5 h-3.5 shrink-0" />
                          <span>{emp.phone || 'Sem telemóvel'}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <CreditCard className="w-3.5 h-3.5 shrink-0" />
                          <span>
                            Salário Base: <strong className="text-gray-800">{formatCurrency(emp.salary || 0)}</strong>
                          </span>
                        </div>
                      </div>
                    </CardContent>
                  </div>

                  <div className="px-6 py-3.5 bg-gray-50/70 border-t border-gray-100 flex items-center justify-between gap-2">
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => {
                        setActiveHRTab('profile');
                        setSelectedUid(emp.uid);
                      }}
                      className="bg-teal hover:bg-teal-dark text-white font-bold text-xs gap-1.5"
                    >
                      <Briefcase className="w-3.5 h-3.5" />
                      Abrir Ficha RH
                    </Button>
                    <div className="flex items-center gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        title="Editar Ficha"
                        onClick={() => handleOpenEditModal(emp)}
                        className="h-8 w-8 text-gray-500 hover:text-teal"
                      >
                        <Edit2 className="w-4 h-4" />
                      </Button>
                      {emp.uid !== profile?.uid && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          title="Remover"
                          onClick={() => setEmpToDelete(emp)}
                          className="h-8 w-8 text-red-400 hover:text-red-600"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                </Card>
              ))}

              <button
                type="button"
                onClick={handleOpenCreateModal}
                className="border-2 border-dashed border-gray-200 rounded-2xl p-6 flex flex-col items-center justify-center text-center gap-3 hover:bg-gray-50 hover:border-teal-medium transition-all group min-h-[220px]"
              >
                <div className="w-12 h-12 rounded-full bg-gray-50 flex items-center justify-center text-gray-400 group-hover:bg-teal-light group-hover:text-teal transition-all">
                  <Plus className="w-6 h-6" />
                </div>
                <div>
                  <p className="font-bold text-gray-900">Novo Membro do Staff</p>
                  <p className="text-xs text-gray-400">Criar ficha RH + passe inicial.</p>
                </div>
              </button>
            </div>
          )}
        </>
      )}

      {/* MODAL: ADICIONAR / EDITAR MEMBRO DO STAFF (Inspired by Captura 103) */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <Card className="w-full max-w-3xl shadow-2xl border border-gray-200 bg-white max-h-[92vh] flex flex-col overflow-hidden">
            <CardHeader className="border-b border-gray-100 flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-xl font-bold">
                  {editingUid ? 'Editar Perfil RH do Funcionário' : 'Adicionar Novo Membro do Staff'}
                </CardTitle>
                <CardDescription>
                  Preencha os dados de identificação, morada, salário e departamentos do colaborador.
                </CardDescription>
              </div>
              <Button variant="ghost" size="icon" onClick={() => setIsModalOpen(false)} className="rounded-full">
                <X className="w-5 h-5" />
              </Button>
            </CardHeader>

            <CardContent className="p-6 overflow-y-auto">
              <form onSubmit={handleSubmitEmployee} className="space-y-5">
                {/* Photo + Staff Code Row */}
                <div className="flex flex-col sm:flex-row items-center gap-5 p-4 rounded-2xl bg-gray-50 border border-gray-200">
                  <div className="relative shrink-0">
                    {empForm.photoURL ? (
                      <img
                        src={empForm.photoURL}
                        alt="Foto do funcionário"
                        className="w-20 h-20 rounded-full object-cover border-2 border-teal"
                      />
                    ) : (
                      <div className="w-20 h-20 rounded-full bg-white border-2 border-dashed border-gray-300 flex items-center justify-center text-gray-400">
                        <User className="w-8 h-8" />
                      </div>
                    )}
                    <label className="mt-2 inline-flex items-center gap-1 text-[11px] font-bold text-teal hover:underline cursor-pointer">
                      <Camera className="w-3.5 h-3.5" />
                      Carregar Foto
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => handlePhotoUpload(e)}
                        className="hidden"
                      />
                    </label>
                  </div>

                  <div className="flex-1 w-full grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="space-y-1">
                      <label className="text-[11px] font-bold text-gray-600 uppercase">Código da Equipa</label>
                      <Input
                        placeholder="FUNC-001"
                        value={empForm.staffCode}
                        onChange={(e) => setEmpForm({ ...empForm, staffCode: e.target.value })}
                        className="h-10 bg-white font-mono"
                      />
                    </div>
                    <div className="space-y-1 sm:col-span-2">
                      <label className="text-[11px] font-bold text-gray-600 uppercase">Nome Completo *</label>
                      <Input
                        required
                        placeholder="Ex: Márcio Cangundo"
                        value={empForm.displayName}
                        onChange={(e) => setEmpForm({ ...empForm, displayName: e.target.value })}
                        className="h-10 bg-white"
                      />
                    </div>
                  </div>
                </div>

                {/* Personal & Identification */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-gray-600 uppercase">E-mail / Utilizador *</label>
                    <Input
                      required
                      disabled={Boolean(editingUid)}
                      placeholder="nome@vistosliberdade.com"
                      value={empForm.email}
                      onChange={(e) => setEmpForm({ ...empForm, email: e.target.value })}
                      className="h-10 bg-gray-50"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-gray-600 uppercase">Telemóvel / WhatsApp</label>
                    <Input
                      placeholder="+244 9XX XXX XXX"
                      value={empForm.phone}
                      onChange={(e) => setEmpForm({ ...empForm, phone: e.target.value })}
                      className="h-10 bg-gray-50"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-gray-600 uppercase">Nº Identificação (BI/Pass.)</label>
                    <Input
                      placeholder="004512389LA042"
                      value={empForm.idNumber}
                      onChange={(e) => setEmpForm({ ...empForm, idNumber: e.target.value })}
                      className="h-10 bg-gray-50 uppercase"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="space-y-1 sm:col-span-2">
                    <label className="text-[11px] font-bold text-gray-600 uppercase">Morada Completa</label>
                    <Input
                      placeholder="Rua, Bairro, Município, Luanda"
                      value={empForm.address}
                      onChange={(e) => setEmpForm({ ...empForm, address: e.target.value })}
                      className="h-10 bg-gray-50"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-gray-600 uppercase">NIF</label>
                    <Input
                      placeholder="NIF pessoal"
                      value={empForm.nifNumber}
                      onChange={(e) => setEmpForm({ ...empForm, nifNumber: e.target.value })}
                      className="h-10 bg-gray-50 uppercase"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-gray-600 uppercase">Género</label>
                    <select
                      value={empForm.gender}
                      onChange={(e) => setEmpForm({ ...empForm, gender: e.target.value })}
                      className="w-full h-10 rounded-lg border border-gray-200 bg-gray-50 px-3 text-xs font-semibold"
                    >
                      <option value="Masculino">Masculino</option>
                      <option value="Feminino">Feminino</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-gray-600 uppercase">Nascimento</label>
                    <Input
                      type="date"
                      value={empForm.birthDate}
                      onChange={(e) => setEmpForm({ ...empForm, birthDate: e.target.value })}
                      className="h-10 bg-gray-50 text-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-gray-600 uppercase">Nível Académico</label>
                    <select
                      value={empForm.academicLevel}
                      onChange={(e) => setEmpForm({ ...empForm, academicLevel: e.target.value })}
                      className="w-full h-10 rounded-lg border border-gray-200 bg-gray-50 px-3 text-xs font-semibold"
                    >
                      <option value="Ensino Médio">Ensino Médio</option>
                      <option value="Frequência Universitária">Frequência Universitária</option>
                      <option value="Licenciatura">Licenciatura</option>
                      <option value="Mestrado">Mestrado</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-gray-600 uppercase">Estado RH</label>
                    <select
                      value={empForm.employmentStatus}
                      onChange={(e) => setEmpForm({ ...empForm, employmentStatus: e.target.value as any })}
                      className="w-full h-10 rounded-lg border border-gray-200 bg-gray-50 px-3 text-xs font-semibold"
                    >
                      <option value="Ativo">Ativo</option>
                      <option value="Em Formação">Em Formação</option>
                      <option value="Licença">Licença</option>
                      <option value="Suspenso">Suspenso</option>
                    </select>
                  </div>
                </div>

                {/* Role & Salary */}
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-gray-600 uppercase">Cargo / Função</label>
                    <Input
                      placeholder="Ex: Consultor de Vistos"
                      value={empForm.jobTitle}
                      onChange={(e) => setEmpForm({ ...empForm, jobTitle: e.target.value })}
                      className="h-10 bg-gray-50"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-gray-600 uppercase">Salário Base (AOA)</label>
                    <Input
                      type="number"
                      min={0}
                      value={empForm.salary}
                      onChange={(e) => setEmpForm({ ...empForm, salary: Number(e.target.value) })}
                      className="h-10 bg-gray-50 font-bold tabular-nums"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-gray-600 uppercase">Subsídios (AOA)</label>
                    <Input
                      type="number"
                      min={0}
                      value={empForm.allowances}
                      onChange={(e) => setEmpForm({ ...empForm, allowances: Number(e.target.value) })}
                      className="h-10 bg-gray-50 font-bold tabular-nums"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-gray-600 uppercase">Data Admissão</label>
                    <Input
                      type="date"
                      value={empForm.hireDate}
                      onChange={(e) => setEmpForm({ ...empForm, hireDate: e.target.value })}
                      className="h-10 bg-gray-50 text-xs"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-gray-600 uppercase">IBAN / Conta Bancária</label>
                    <Input
                      placeholder="AO06 ..."
                      value={empForm.iban}
                      onChange={(e) => setEmpForm({ ...empForm, iban: e.target.value })}
                      className="h-10 bg-gray-50 font-mono text-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-gray-600 uppercase">Perfil de Acesso Sistema</label>
                    <select
                      value={empForm.role}
                      onChange={(e) => setEmpForm({ ...empForm, role: e.target.value as 'employee' | 'admin' })}
                      className="w-full h-10 rounded-lg border border-gray-200 bg-gray-50 px-3 text-sm font-bold"
                    >
                      <option value="employee">Funcionário</option>
                      <option value="admin">Administrador</option>
                    </select>
                  </div>
                </div>

                {/* Departments checkboxes */}
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-gray-600 uppercase">Departamentos Associados</label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 p-3 rounded-xl bg-gray-50 border border-gray-200">
                    {HR_DEPARTMENTS.map((dept) => (
                      <label key={dept} className="flex items-center gap-2 text-xs font-medium text-gray-700 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={empForm.departments.includes(dept)}
                          onChange={() =>
                            setEmpForm((prev) => ({
                              ...prev,
                              departments: prev.departments.includes(dept)
                                ? prev.departments.filter((d) => d !== dept)
                                : [...prev.departments, dept],
                            }))
                          }
                          className="w-3.5 h-3.5 accent-teal"
                        />
                        <span>{dept}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {!editingUid && (
                  <>
                    <div className="space-y-1.5 pt-2 border-t border-gray-100">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-bold text-gray-600 uppercase">
                          Palavra-passe Inicial (Provisória)
                        </label>
                        <button
                          type="button"
                          onClick={() => setEmpForm({ ...empForm, initialPassword: generateRandomPassword(8) })}
                          className="text-xs font-bold text-teal hover:underline flex items-center gap-1"
                        >
                          <RefreshCw className="w-3 h-3" />
                          Gerar Aleatória
                        </button>
                      </div>
                      <div className="relative">
                        <KeyRound className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                        <Input
                          type={showPass ? 'text' : 'password'}
                          required
                          minLength={6}
                          value={empForm.initialPassword}
                          onChange={(e) => setEmpForm({ ...empForm, initialPassword: e.target.value })}
                          className="bg-gray-50 border-gray-200 h-10 pl-9 pr-10 font-mono"
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

                    <label className="flex items-start gap-3 p-3 rounded-xl bg-teal-light/40 border border-teal/20 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={empForm.mustChangePassword}
                        onChange={(e) => setEmpForm({ ...empForm, mustChangePassword: e.target.checked })}
                        className="mt-0.5 w-4 h-4 accent-teal"
                      />
                      <div>
                        <p className="text-xs font-bold text-gray-900">Exigir alteração de passe após o primeiro login</p>
                        <p className="text-[11px] text-gray-600">
                          Ao entrar pela primeira vez, o funcionário terá de criar uma nova palavra-passe pessoal.
                        </p>
                      </div>
                    </label>
                  </>
                )}

                {error && (
                  <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-semibold flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{error}</span>
                  </div>
                )}

                <div className="pt-4 flex gap-3 border-t border-gray-100">
                  <Button type="button" variant="ghost" onClick={() => setIsModalOpen(false)} className="flex-1">
                    Cancelar
                  </Button>
                  <Button
                    type="submit"
                    disabled={submitting}
                    className="flex-1 bg-teal hover:bg-teal-dark text-white font-bold shadow-lg shadow-teal/20"
                  >
                    {submitting ? 'A guardar...' : editingUid ? 'Guardar Ficha RH' : 'Criar Funcionário'}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}

      {/* MODAL: GERAR RECIBO DE PAGAMENTO DE SALÁRIO (PAYSLIP) */}
      {payslipModalOpen && selectedEmployee && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <Card className="w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden">
            <CardHeader className="border-b border-gray-100 flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-lg font-bold">Emitir Recibo de Salário (Payslip)</CardTitle>
                <CardDescription>Colaborador: {selectedEmployee.displayName}</CardDescription>
              </div>
              <Button variant="ghost" size="icon" onClick={() => setPayslipModalOpen(false)} className="rounded-full">
                <X className="w-5 h-5" />
              </Button>
            </CardHeader>
            <CardContent className="p-6">
              <form onSubmit={handleIssuePayslip} className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-gray-600 uppercase">Mês de Referência</label>
                    <Input
                      type="month"
                      required
                      value={payslipForm.referenceMonth}
                      onChange={(e) => setPayslipForm({ ...payslipForm, referenceMonth: e.target.value })}
                      className="h-10 bg-gray-50 font-bold"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-gray-600 uppercase">Estado</label>
                    <select
                      value={payslipForm.status}
                      onChange={(e) => setPayslipForm({ ...payslipForm, status: e.target.value as any })}
                      className="w-full h-10 rounded-lg border border-gray-200 bg-gray-50 px-3 text-sm font-bold"
                    >
                      <option value="paid">Pago</option>
                      <option value="pending">Pendente</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-gray-600 uppercase">Salário Base (Kz)</label>
                    <Input
                      type="number"
                      min={0}
                      value={payslipForm.baseSalary}
                      onChange={(e) => setPayslipForm({ ...payslipForm, baseSalary: Number(e.target.value) })}
                      className="h-10 bg-gray-50 font-bold tabular-nums"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-gray-600 uppercase">Subsídios (Kz)</label>
                    <Input
                      type="number"
                      min={0}
                      value={payslipForm.allowances}
                      onChange={(e) => setPayslipForm({ ...payslipForm, allowances: Number(e.target.value) })}
                      className="h-10 bg-gray-50 font-bold tabular-nums"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-gray-600 uppercase">Bónus / Prémios (Kz)</label>
                    <Input
                      type="number"
                      min={0}
                      value={payslipForm.bonus}
                      onChange={(e) => setPayslipForm({ ...payslipForm, bonus: Number(e.target.value) })}
                      className="h-10 bg-gray-50 font-bold tabular-nums"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-gray-600 uppercase">Descontos / Adiant. (Kz)</label>
                    <Input
                      type="number"
                      min={0}
                      value={payslipForm.deductions}
                      onChange={(e) => setPayslipForm({ ...payslipForm, deductions: Number(e.target.value) })}
                      className="h-10 bg-gray-50 font-bold tabular-nums"
                    />
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-teal-light/40 border border-teal/20 flex items-center justify-between">
                  <span className="text-xs font-bold uppercase text-teal">Líquido a Pagar</span>
                  <span className="text-xl font-black text-teal tabular-nums">
                    {formatCurrency(
                      Math.max(
                        0,
                        (Number(payslipForm.baseSalary) || 0) +
                          (Number(payslipForm.allowances) || 0) +
                          (Number(payslipForm.bonus) || 0) -
                          (Number(payslipForm.deductions) || 0)
                      )
                    )}
                  </span>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-600 uppercase">Forma de Pagamento</label>
                  <select
                    value={payslipForm.paymentMethod}
                    onChange={(e) => setPayslipForm({ ...payslipForm, paymentMethod: e.target.value })}
                    className="w-full h-10 rounded-lg border border-gray-200 bg-gray-50 px-3 text-sm font-semibold"
                  >
                    {PAYMENT_METHODS.map((pm) => (
                      <option key={pm} value={pm}>
                        {pm}
                      </option>
                    ))}
                  </select>
                </div>

                <label className="flex items-center gap-2 text-xs font-semibold text-gray-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={payslipForm.registerExpense}
                    onChange={(e) => setPayslipForm({ ...payslipForm, registerExpense: e.target.checked })}
                    className="w-4 h-4 accent-teal"
                  />
                  Registar automaticamente como Despesa de Folha Salarial no Financeiro
                </label>

                <div className="flex justify-end gap-3 pt-2">
                  <Button type="button" variant="ghost" onClick={() => setPayslipModalOpen(false)}>
                    Cancelar
                  </Button>
                  <Button
                    type="submit"
                    disabled={issuingPayslip}
                    className="bg-teal hover:bg-teal-dark text-white font-bold gap-2"
                  >
                    {issuingPayslip ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                    Emitir & Baixar PDF
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}

      {/* PREVIEW PERSONAL DOCUMENT MODAL */}
      {previewHrDoc && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <Card className="w-full max-w-3xl bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden max-h-[90vh] flex flex-col">
            <CardHeader className="border-b border-gray-100 flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base font-bold">{previewHrDoc.title}</CardTitle>
                <CardDescription>{previewHrDoc.fileName}</CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  onClick={() => downloadFileFromUrlOrData(previewHrDoc.dataUrl, previewHrDoc.fileName)}
                  className="bg-teal text-white gap-1.5 text-xs"
                >
                  <Download className="w-3.5 h-3.5" />
                  Baixar
                </Button>
                <Button variant="ghost" size="icon" onClick={() => setPreviewHrDoc(null)} className="rounded-full">
                  <X className="w-5 h-5" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-4 flex-1 overflow-auto bg-gray-100 flex items-center justify-center min-h-[380px]">
              {previewHrDoc.mimeType.startsWith('image/') ? (
                <img
                  src={previewHrDoc.dataUrl}
                  alt={previewHrDoc.title}
                  className="max-w-full max-h-[70vh] object-contain rounded-lg shadow"
                />
              ) : previewHrDoc.mimeType.includes('pdf') ? (
                <iframe
                  src={previewHrDoc.dataUrl}
                  title={previewHrDoc.title}
                  className="w-full h-[70vh] rounded-lg border border-gray-200 bg-white"
                />
              ) : (
                <div className="text-center space-y-3 p-8">
                  <FileText className="w-12 h-12 text-teal mx-auto" />
                  <p className="text-sm font-semibold text-gray-700">
                    Pré-visualização indisponível para este formato. Clique em Baixar para abrir no dispositivo.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* CONFIRMATION MODALS (NO window.confirm) */}
      {empToDelete && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <Card className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-gray-200">
            <CardHeader className="border-b border-gray-100">
              <CardTitle className="text-lg font-bold text-red-700">Remover Funcionário</CardTitle>
              <CardDescription>
                Tem a certeza que deseja remover <strong>{empToDelete.displayName || empToDelete.email}</strong> da equipa?
              </CardDescription>
            </CardHeader>
            <CardContent className="p-6 flex justify-end gap-3">
              <Button variant="ghost" onClick={() => setEmpToDelete(null)}>
                Cancelar
              </Button>
              <Button onClick={handleConfirmDeleteEmployee} className="bg-red-600 hover:bg-red-700 text-white font-bold">
                Confirmar Remoção
              </Button>
            </CardContent>
          </Card>
        </div>
      )}

      {docToDelete && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <Card className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-gray-200">
            <CardHeader className="border-b border-gray-100">
              <CardTitle className="text-lg font-bold text-red-700">Eliminar Documento Pessoal</CardTitle>
              <CardDescription>
                Deseja eliminar <strong>{docToDelete.title}</strong>?
              </CardDescription>
            </CardHeader>
            <CardContent className="p-6 flex justify-end gap-3">
              <Button variant="ghost" onClick={() => setDocToDelete(null)}>
                Cancelar
              </Button>
              <Button
                onClick={async () => {
                  await deleteDoc(doc(db, 'hr_documents', docToDelete.id));
                  setDocToDelete(null);
                }}
                className="bg-red-600 hover:bg-red-700 text-white font-bold"
              >
                Eliminar
              </Button>
            </CardContent>
          </Card>
        </div>
      )}

      {payslipToDelete && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <Card className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-gray-200">
            <CardHeader className="border-b border-gray-100">
              <CardTitle className="text-lg font-bold text-red-700">Eliminar Recibo de Salário</CardTitle>
              <CardDescription>
                Deseja eliminar o recibo de <strong>{payslipToDelete.referenceMonth}</strong>?
              </CardDescription>
            </CardHeader>
            <CardContent className="p-6 flex justify-end gap-3">
              <Button variant="ghost" onClick={() => setPayslipToDelete(null)}>
                Cancelar
              </Button>
              <Button
                onClick={async () => {
                  await deleteDoc(doc(db, 'employee_payslips', payslipToDelete.id));
                  setPayslipToDelete(null);
                }}
                className="bg-red-600 hover:bg-red-700 text-white font-bold"
              >
                Eliminar
              </Button>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
