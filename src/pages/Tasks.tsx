/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  query,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { db, OperationType, handleFirestoreError } from '@/src/firebase';
import { useAuth } from '@/src/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/src/components/ui/Card';
import { Button } from '@/src/components/ui/Button';
import { Input } from '@/src/components/ui/Input';
import { Badge } from '@/src/components/ui/Badge';
import {
  ConsultantProfile,
  Invoice,
  StaffTask,
  TaskAttachmentFile,
  TaskAttachmentMeta,
  TaskChecklistItem,
  TaskRelatedType,
  TaskRepeatInterval,
  TransferBooking,
  TravelProcess,
  UserProfile,
} from '@/src/types';
import {
  downloadFileFromUrlOrData,
  formatFileSize,
  processUploadedFile,
} from '@/src/utils/fileHelpers';
import { cn } from '@/src/lib/utils';
import {
  AlertTriangle,
  BellRing,
  Calendar,
  Check,
  CheckCircle2,
  CheckSquare,
  Clock,
  Download,
  Edit2,
  Eye,
  FileText,
  Filter,
  Globe,
  ListChecks,
  Paperclip,
  Plus,
  Repeat,
  Search,
  Send,
  Tag,
  Timer,
  Trash2,
  User,
  Users,
  Wallet,
  X,
} from 'lucide-react';

type TaskFilterTab = 'all' | 'mine' | 'created_by_me' | 'overdue' | 'completed';

interface PendingAttachment {
  id: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  dataUrl?: string;
  uploadedBy?: string;
  createdAt: string;
  isNew?: boolean;
}

const STATUS_META: Record<
  StaffTask['status'],
  { label: string; badgeClass: string; dotClass: string }
> = {
  pending: {
    label: 'Não Iniciada',
    badgeClass: 'bg-gray-100 text-gray-700 border-gray-200',
    dotClass: 'bg-gray-400',
  },
  in_progress: {
    label: 'Em Curso',
    badgeClass: 'bg-teal-light text-teal border-teal/20',
    dotClass: 'bg-teal',
  },
  waiting: {
    label: 'Aguardando',
    badgeClass: 'bg-amber-50 text-amber-700 border-amber-200',
    dotClass: 'bg-amber-500',
  },
  completed: {
    label: 'Concluída',
    badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    dotClass: 'bg-emerald-500',
  },
};

const PRIORITY_META: Record<
  StaffTask['priority'],
  { label: string; badgeClass: string; weight: number }
> = {
  low: { label: 'Baixa', badgeClass: 'bg-slate-100 text-slate-600 border-slate-200', weight: 1 },
  medium: { label: 'Média', badgeClass: 'bg-sky-50 text-sky-700 border-sky-200', weight: 2 },
  high: { label: 'Alta', badgeClass: 'bg-orange-50 text-orange-700 border-orange-200', weight: 3 },
  urgent: { label: 'Urgente', badgeClass: 'bg-red-50 text-red-700 border-red-200', weight: 4 },
};

const REPEAT_OPTIONS: { value: TaskRepeatInterval; label: string }[] = [
  { value: '', label: 'Nada selecionado' },
  { value: '1_week', label: 'Semanal (7 dias)' },
  { value: '2_weeks', label: 'Quinzenal (2 semanas)' },
  { value: '1_month', label: 'Mensal (1 mês)' },
  { value: '2_months', label: 'Bimestral (2 meses)' },
  { value: '3_months', label: 'Trimestral (3 meses)' },
  { value: '6_months', label: 'Semestral (6 meses)' },
  { value: '1_year', label: 'Anual (1 ano)' },
];

const RELATED_TYPE_OPTIONS: { value: TaskRelatedType; label: string }[] = [
  { value: '', label: 'Nada selecionado' },
  { value: 'process', label: 'Processo de Visto' },
  { value: 'client', label: 'Cliente' },
  { value: 'invoice', label: 'Fatura / Recibo' },
  { value: 'booking', label: 'Reserva / Bilhete' },
];

function getDeadlineTimestamp(dueDate?: string, dueTime?: string): number {
  if (!dueDate) return Number.MAX_SAFE_INTEGER;
  const safeTime = dueTime && /^\d{2}:\d{2}$/.test(dueTime) ? dueTime : '18:00';
  const parsed = new Date(`${dueDate}T${safeTime}:00`).getTime();
  return Number.isNaN(parsed) ? Number.MAX_SAFE_INTEGER : parsed;
}

function formatDurationDelta(ms: number): string {
  const abs = Math.abs(ms);
  const totalMinutes = Math.max(1, Math.floor(abs / 60000));
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const mins = totalMinutes % 60;

  if (days > 0) {
    return hours > 0 ? `${days}d ${hours}h` : `${days} dia(s)`;
  }
  if (hours > 0) {
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  }
  return `${mins} min`;
}

export function Tasks() {
  const { profile, isAdmin, isEmployee } = useAuth();
  const isStaff =
    isAdmin || isEmployee || profile?.role === 'admin' || profile?.role === 'employee';
  const [tasks, setTasks] = useState<StaffTask[]>([]);
  const [staffMembers, setStaffMembers] = useState<{ uid: string; displayName: string; role: string }[]>([]);
  const [processes, setProcesses] = useState<TravelProcess[]>([]);
  const [clients, setClients] = useState<UserProfile[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [bookings, setBookings] = useState<TransferBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [nowMs, setNowMs] = useState(() => Date.now());

  // Filters
  const [activeTab, setActiveTab] = useState<TaskFilterTab>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');
  const [assigneeFilter, setAssigneeFilter] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');

  // Feedback banner
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Create / Edit Modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<StaffTask | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploadingFiles, setUploadingFiles] = useState(false);
  const [newChecklistInput, setNewChecklistInput] = useState('');
  const [tagInput, setTagInput] = useState('');
  const [pendingAttachments, setPendingAttachments] = useState<PendingAttachment[]>([]);
  const [removedAttachmentIds, setRemovedAttachmentIds] = useState<string[]>([]);

  // Detail Modal & Attachment Preview
  const [selectedTask, setSelectedTask] = useState<StaffTask | null>(null);
  const [loadingAttachmentId, setLoadingAttachmentId] = useState<string | null>(null);
  const [previewAttachment, setPreviewAttachment] = useState<TaskAttachmentFile | null>(null);

  // Delete Confirmation Modal
  const [taskToDelete, setTaskToDelete] = useState<StaffTask | null>(null);

  const todayStr = useMemo(() => new Date().toISOString().split('T')[0], []);

  const [formState, setFormState] = useState<{
    title: string;
    description: string;
    status: StaffTask['status'];
    priority: StaffTask['priority'];
    isPublic: boolean;
    billable: boolean;
    hourlyRate: number;
    startDate: string;
    dueDate: string;
    dueTime: string;
    repeatEvery: TaskRepeatInterval;
    relatedType: TaskRelatedType;
    relatedEntityId: string;
    assigneeUids: string[];
    followerUids: string[];
    tags: string[];
    checklist: TaskChecklistItem[];
  }>({
    title: '',
    description: '',
    status: 'pending',
    priority: 'medium',
    isPublic: false,
    billable: true,
    hourlyRate: 0,
    startDate: new Date().toISOString().split('T')[0],
    dueDate: new Date().toISOString().split('T')[0],
    dueTime: '18:00',
    repeatEvery: '',
    relatedType: '',
    relatedEntityId: '',
    assigneeUids: [],
    followerUids: [],
    tags: [],
    checklist: [],
  });

  // Live clock ticker every 30s so deadline alerts update automatically
  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), 30000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!isStaff) {
      setLoading(false);
      return;
    }

    const unsubTasks = onSnapshot(
      collection(db, 'tasks'),
      (snap) => {
        const list = snap.docs.map((d) => ({ ...d.data(), id: d.id })) as StaffTask[];
        setTasks(list);
        setLoading(false);
      },
      (err) => {
        console.error('Erro ao carregar tarefas:', err);
        setLoading(false);
      }
    );

    const staffMap = new Map<string, { uid: string; displayName: string; role: string }>();
    const syncStaffList = () => {
      const merged = Array.from(staffMap.values()).sort((a, b) =>
        a.displayName.localeCompare(b.displayName)
      );
      setStaffMembers(merged);
    };

    const unsubUsers = onSnapshot(
      query(collection(db, 'users'), where('role', 'in', ['employee', 'admin'])),
      (snap) => {
        snap.docs.forEach((d) => {
          const u = d.data() as UserProfile;
          if (u.active === false) return;
          staffMap.set(d.id, {
            uid: d.id,
            displayName: u.displayName || u.email || 'Operador',
            role: u.role,
          });
        });
        syncStaffList();
      },
      () => {}
    );

    const unsubConsultants = onSnapshot(
      collection(db, 'consultants'),
      (snap) => {
        snap.docs.forEach((d) => {
          const c = d.data() as ConsultantProfile;
          if (c.active === false) return;
          if (!staffMap.has(d.id)) {
            staffMap.set(d.id, {
              uid: d.id,
              displayName: c.displayName || 'Consultor',
              role: c.role || 'employee',
            });
          }
        });
        syncStaffList();
      },
      () => {}
    );

    const unsubClients = onSnapshot(
      query(collection(db, 'users'), where('role', '==', 'client')),
      (snap) => {
        setClients(snap.docs.map((d) => ({ ...d.data(), uid: d.id })) as UserProfile[]);
      },
      () => {}
    );

    const unsubProcesses = onSnapshot(
      collection(db, 'processes'),
      (snap) => {
        setProcesses(snap.docs.map((d) => ({ ...d.data(), id: d.id })) as TravelProcess[]);
      },
      () => {}
    );

    const unsubInvoices = onSnapshot(
      collection(db, 'invoices'),
      (snap) => {
        setInvoices(snap.docs.map((d) => ({ ...d.data(), id: d.id })) as Invoice[]);
      },
      () => {}
    );

    const unsubBookings = onSnapshot(
      collection(db, 'bookings'),
      (snap) => {
        setBookings(snap.docs.map((d) => ({ ...d.data(), id: d.id })) as TransferBooking[]);
      },
      () => {}
    );

    return () => {
      unsubTasks();
      unsubUsers();
      unsubConsultants();
      unsubClients();
      unsubProcesses();
      unsubInvoices();
      unsubBookings();
    };
  }, [isStaff]);

  // Keep current profile selectable even if still syncing
  const availableAssignees = useMemo(() => {
    const map = new Map<string, { uid: string; displayName: string; role: string }>();
    staffMembers.forEach((s) => map.set(s.uid, s));
    if (profile?.uid && !map.has(profile.uid)) {
      map.set(profile.uid, {
        uid: profile.uid,
        displayName: profile.displayName || profile.email || 'Eu',
        role: profile.role || 'employee',
      });
    }
    return Array.from(map.values());
  }, [staffMembers, profile]);

  // Options for the "Relacionado ao" second dropdown
  const relatedEntityOptions = useMemo(() => {
    if (formState.relatedType === 'process') {
      return processes.map((p) => ({
        id: p.id,
        label: `${p.id} — ${p.clientName || 'Cliente'} (${p.serviceName || 'Serviço'})`,
      }));
    }
    if (formState.relatedType === 'client') {
      return clients.map((c) => ({
        id: c.uid,
        label: `${c.displayName || c.email} (${c.phone || c.email})`,
      }));
    }
    if (formState.relatedType === 'invoice') {
      return invoices.map((inv) => ({
        id: inv.id,
        label: `${inv.id} — ${inv.clientName} (${inv.amount.toLocaleString('pt-AO')} Kz)`,
      }));
    }
    if (formState.relatedType === 'booking') {
      return bookings.map((b) => ({
        id: b.id,
        label: `${b.id} — ${b.serviceName || b.tier} (${b.date})`,
      }));
    }
    return [];
  }, [formState.relatedType, processes, clients, invoices, bookings]);

  // Sync open detail view with live snapshots
  useEffect(() => {
    if (!selectedTask) return;
    const latest = tasks.find((t) => t.id === selectedTask.id);
    if (latest) {
      setSelectedTask(latest);
    }
  }, [tasks, selectedTask?.id]);

  const enrichTask = (task: StaffTask) => {
    const deadlineMs = getDeadlineTimestamp(task.dueDate, task.dueTime);
    const diffMs = deadlineMs - nowMs;
    const isCompleted = task.status === 'completed';
    const isOverdue = !isCompleted && deadlineMs < nowMs;
    const isDueSoon = !isCompleted && !isOverdue && diffMs <= 4 * 3600 * 1000;
    const isDueToday = !isCompleted && task.dueDate === todayStr;
    return {
      ...task,
      deadlineMs,
      diffMs,
      isOverdue,
      isDueSoon,
      isDueToday,
    };
  };

  const enrichedTasks = useMemo(() => {
    return tasks
      .map(enrichTask)
      .sort((a, b) => {
        if (a.isOverdue !== b.isOverdue) return a.isOverdue ? -1 : 1;
        if (a.status === 'completed' && b.status !== 'completed') return 1;
        if (a.status !== 'completed' && b.status === 'completed') return -1;
        return a.deadlineMs - b.deadlineMs;
      });
  }, [tasks, nowMs, todayStr]);

  const isUserAssignedToTask = (task: StaffTask, uid?: string) => {
    if (!uid) return false;
    return (
      task.assignedToUid === uid ||
      (Array.isArray(task.assigneeUids) && task.assigneeUids.includes(uid))
    );
  };

  const stats = useMemo(() => {
    const pending = enrichedTasks.filter((t) => t.status === 'pending').length;
    const inProgress = enrichedTasks.filter((t) => t.status === 'in_progress').length;
    const waiting = enrichedTasks.filter((t) => t.status === 'waiting').length;
    const overdue = enrichedTasks.filter((t) => t.isOverdue).length;
    const dueSoon = enrichedTasks.filter((t) => t.isDueSoon).length;
    const completed = enrichedTasks.filter((t) => t.status === 'completed').length;
    const myOverdue = enrichedTasks.filter(
      (t) => t.isOverdue && isUserAssignedToTask(t, profile?.uid)
    ).length;
    return { pending, inProgress, waiting, overdue, dueSoon, completed, myOverdue };
  }, [enrichedTasks, profile?.uid]);

  const overdueTasks = useMemo(
    () => enrichedTasks.filter((t) => t.isOverdue),
    [enrichedTasks]
  );

  const filteredTasks = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return enrichedTasks.filter((t) => {
      if (activeTab === 'mine' && !isUserAssignedToTask(t, profile?.uid)) return false;
      if (activeTab === 'created_by_me' && t.createdByUid !== profile?.uid) return false;
      if (activeTab === 'overdue' && !t.isOverdue) return false;
      if (activeTab === 'completed' && t.status !== 'completed') return false;

      if (statusFilter !== 'all' && t.status !== statusFilter) return false;
      if (priorityFilter !== 'all' && t.priority !== priorityFilter) return false;
      if (assigneeFilter !== 'all' && !isUserAssignedToTask(t, assigneeFilter)) return false;

      if (q) {
        const hay = `${t.title} ${t.description || ''} ${t.assignedToName} ${(t.assigneeNames || []).join(' ')} ${
          t.createdByName
        } ${t.relatedEntityLabel || t.relatedProcessLabel || ''} ${(t.tags || []).join(' ')}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [
    enrichedTasks,
    activeTab,
    statusFilter,
    priorityFilter,
    assigneeFilter,
    searchTerm,
    profile?.uid,
  ]);

  const notifyOperator = async (
    recipientUid: string,
    recipientName: string,
    type: 'task_assigned' | 'task_overdue',
    title: string,
    message: string,
    taskId: string
  ) => {
    if (!recipientUid) return;
    const notifId = `notif-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    try {
      await setDoc(doc(db, 'notifications', notifId), {
        id: notifId,
        recipientUid,
        recipientName,
        senderUid: profile?.uid || '',
        senderName: profile?.displayName || profile?.email || 'Sistema',
        type,
        title,
        message,
        taskId,
        read: false,
        createdAt: new Date().toISOString(),
      });
    } catch (err) {
      console.error('Erro ao enviar notificação da tarefa:', err);
    }
  };

  const openCreateModal = () => {
    setEditingTask(null);
    setNewChecklistInput('');
    setTagInput('');
    setPendingAttachments([]);
    setRemovedAttachmentIds([]);
    const defaultUid = profile?.uid || availableAssignees[0]?.uid || '';
    setFormState({
      title: '',
      description: '',
      status: 'pending',
      priority: 'medium',
      isPublic: false,
      billable: true,
      hourlyRate: 0,
      startDate: todayStr,
      dueDate: todayStr,
      dueTime: '18:00',
      repeatEvery: '',
      relatedType: '',
      relatedEntityId: '',
      assigneeUids: defaultUid ? [defaultUid] : [],
      followerUids: [],
      tags: [],
      checklist: [],
    });
    setIsModalOpen(true);
  };

  const openEditModal = (task: StaffTask) => {
    setEditingTask(task);
    setNewChecklistInput('');
    setTagInput('');
    setPendingAttachments(
      (task.attachments || []).map((a) => ({
        ...a,
        isNew: false,
      }))
    );
    setRemovedAttachmentIds([]);

    const assignees =
      task.assigneeUids && task.assigneeUids.length > 0
        ? task.assigneeUids
        : task.assignedToUid
        ? [task.assignedToUid]
        : [];

    const inferredRelatedType: TaskRelatedType =
      task.relatedType || (task.relatedProcessId ? 'process' : '');
    const inferredRelatedId = task.relatedEntityId || task.relatedProcessId || '';

    setFormState({
      title: task.title,
      description: task.description || '',
      status: task.status,
      priority: task.priority,
      isPublic: Boolean(task.isPublic),
      billable: task.billable !== undefined ? task.billable : true,
      hourlyRate: Number(task.hourlyRate || 0),
      startDate: task.startDate || todayStr,
      dueDate: task.dueDate || todayStr,
      dueTime: task.dueTime || '18:00',
      repeatEvery: task.repeatEvery || '',
      relatedType: inferredRelatedType,
      relatedEntityId: inferredRelatedId,
      assigneeUids: assignees,
      followerUids: task.followerUids ? [...task.followerUids] : [],
      tags: task.tags ? [...task.tags] : [],
      checklist: task.checklist ? [...task.checklist] : [],
    });
    setIsModalOpen(true);
  };

  const handleAttachFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploadingFiles(true);
    try {
      const processedList: PendingAttachment[] = [];
      for (let i = 0; i < files.length; i++) {
        const processed = await processUploadedFile(files[i]);
        processedList.push({
          id: `att-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          fileName: processed.fileName,
          mimeType: processed.mimeType,
          fileSize: processed.fileSize,
          dataUrl: processed.dataUrl,
          uploadedBy: profile?.displayName || profile?.email || 'Operador',
          createdAt: new Date().toISOString(),
          isNew: true,
        });
      }
      setPendingAttachments((prev) => [...prev, ...processedList]);
    } catch (err: any) {
      setFeedback({
        type: 'error',
        text: err?.message || 'Erro ao anexar um dos ficheiros selecionados.',
      });
    } finally {
      setUploadingFiles(false);
      e.target.value = '';
    }
  };

  const handleRemovePendingAttachment = (att: PendingAttachment) => {
    setPendingAttachments((prev) => prev.filter((item) => item.id !== att.id));
    if (!att.isNew) {
      setRemovedAttachmentIds((prev) => [...prev, att.id]);
    }
  };

  const handleAddTag = (raw?: string) => {
    const clean = (raw ?? tagInput).trim().replace(/^#/, '').replace(/,+$/, '');
    if (!clean) return;
    if (formState.tags.length >= 20) return;
    if (!formState.tags.some((t) => t.toLowerCase() === clean.toLowerCase())) {
      setFormState((prev) => ({ ...prev, tags: [...prev.tags, clean] }));
    }
    setTagInput('');
  };

  const handleRemoveTag = (tag: string) => {
    setFormState((prev) => ({
      ...prev,
      tags: prev.tags.filter((t) => t !== tag),
    }));
  };

  const handleAddAssignee = (uid: string) => {
    if (!uid || formState.assigneeUids.includes(uid) || formState.assigneeUids.length >= 20) return;
    setFormState((prev) => ({ ...prev, assigneeUids: [...prev.assigneeUids, uid] }));
  };

  const handleRemoveAssignee = (uid: string) => {
    setFormState((prev) => ({
      ...prev,
      assigneeUids: prev.assigneeUids.filter((id) => id !== uid),
    }));
  };

  const handleAddFollower = (uid: string) => {
    if (!uid || formState.followerUids.includes(uid) || formState.followerUids.length >= 20) return;
    setFormState((prev) => ({ ...prev, followerUids: [...prev.followerUids, uid] }));
  };

  const handleRemoveFollower = (uid: string) => {
    setFormState((prev) => ({
      ...prev,
      followerUids: prev.followerUids.filter((id) => id !== uid),
    }));
  };

  const handleAddChecklistItem = () => {
    const text = newChecklistInput.trim();
    if (!text) return;
    setFormState((prev) => ({
      ...prev,
      checklist: [
        ...prev.checklist,
        { id: `chk-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`, text, done: false },
      ],
    }));
    setNewChecklistInput('');
  };

  const handleRemoveChecklistItem = (id: string) => {
    setFormState((prev) => ({
      ...prev,
      checklist: prev.checklist.filter((c) => c.id !== id),
    }));
  };

  const handleSaveTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formState.title.trim() || !formState.startDate || !formState.dueDate || formState.assigneeUids.length === 0) {
      setFeedback({
        type: 'error',
        text: 'Preencha os campos obrigatórios: Assunto, Data de Início, Data de Vencimento e pelo menos um Destinatário.',
      });
      return;
    }

    setSaving(true);
    setFeedback(null);

    const primaryUid = formState.assigneeUids[0];
    const resolveName = (uid: string) =>
      availableAssignees.find((a) => a.uid === uid)?.displayName || 'Operador';

    const assigneeNames = formState.assigneeUids.map(resolveName);
    const followerNames = formState.followerUids.map(resolveName);
    const assignedToName = assigneeNames[0] || profile?.displayName || 'Operador';

    const selectedRelatedOption = relatedEntityOptions.find(
      (opt) => opt.id === formState.relatedEntityId
    );
    const relatedEntityLabel = selectedRelatedOption?.label || '';

    const nowIso = new Date().toISOString();
    const taskId = editingTask ? editingTask.id : `TSK-${Date.now().toString(36).toUpperCase()}`;

    try {
      // Save new attachments in dedicated /task_attachments collection
      for (const att of pendingAttachments) {
        if (att.isNew && att.dataUrl) {
          const attDoc: TaskAttachmentFile = {
            id: att.id,
            taskId,
            fileName: att.fileName,
            mimeType: att.mimeType,
            fileSize: att.fileSize,
            dataUrl: att.dataUrl,
            uploadedBy: att.uploadedBy || profile?.displayName || 'Operador',
            createdAt: att.createdAt,
          };
          await setDoc(doc(db, 'task_attachments', att.id), attDoc);
        }
      }

      // Remove deleted attachments
      for (const remId of removedAttachmentIds) {
        await deleteDoc(doc(db, 'task_attachments', remId)).catch(() => {});
      }

      const attachmentsMeta: TaskAttachmentMeta[] = pendingAttachments.map((a) => ({
        id: a.id,
        fileName: a.fileName,
        mimeType: a.mimeType,
        fileSize: a.fileSize,
        uploadedBy: a.uploadedBy || profile?.displayName || 'Operador',
        createdAt: a.createdAt,
      }));

      const payload: StaffTask = {
        id: taskId,
        title: formState.title.trim(),
        description: formState.description.trim(),
        status: formState.status,
        priority: formState.priority,
        isPublic: formState.isPublic,
        billable: formState.billable,
        hourlyRate: Math.max(0, Number(formState.hourlyRate) || 0),
        startDate: formState.startDate,
        dueDate: formState.dueDate,
        dueTime: formState.dueTime || '18:00',
        repeatEvery: formState.repeatEvery,
        relatedType: formState.relatedType,
        relatedEntityId: formState.relatedEntityId || '',
        relatedEntityLabel,
        assignedToUid: primaryUid,
        assignedToName,
        assigneeUids: formState.assigneeUids,
        assigneeNames,
        followerUids: formState.followerUids,
        followerNames,
        tags: formState.tags,
        attachments: attachmentsMeta,
        createdByUid: editingTask?.createdByUid || profile?.uid || '',
        createdByName:
          editingTask?.createdByName || profile?.displayName || profile?.email || 'Operador',
        relatedProcessId: formState.relatedType === 'process' ? formState.relatedEntityId : '',
        relatedProcessLabel: formState.relatedType === 'process' ? relatedEntityLabel : '',
        checklist: formState.checklist,
        completedAt:
          formState.status === 'completed'
            ? editingTask?.completedAt || nowIso
            : '',
        createdAt: editingTask?.createdAt || nowIso,
        updatedAt: nowIso,
      };

      await setDoc(doc(db, 'tasks', taskId), payload, { merge: true });

      const prevAssignees = new Set(
        editingTask
          ? editingTask.assigneeUids && editingTask.assigneeUids.length > 0
            ? editingTask.assigneeUids
            : [editingTask.assignedToUid]
          : []
      );

      for (const uid of formState.assigneeUids) {
        if (!editingTask || !prevAssignees.has(uid)) {
          await notifyOperator(
            uid,
            resolveName(uid),
            'task_assigned',
            `Nova Tarefa Atribuída: ${payload.title}`,
            `Vencimento em ${payload.dueDate} às ${payload.dueTime || '18:00'}. Atribuída por ${
              payload.createdByName
            }.`,
            taskId
          );
        }
      }

      setFeedback({
        type: 'success',
        text: editingTask
          ? 'Tarefa atualizada com sucesso.'
          : 'Nova tarefa registada no sistema com prazo definido.',
      });
      setIsModalOpen(false);
    } catch (err) {
      console.error('Erro ao guardar tarefa:', err);
      setFeedback({ type: 'error', text: 'Não foi possível guardar a tarefa.' });
      handleFirestoreError(err, OperationType.WRITE, `tasks/${taskId}`);
    } finally {
      setSaving(false);
    }
  };

  const handleOpenAttachment = async (att: TaskAttachmentMeta, action: 'view' | 'download') => {
    setLoadingAttachmentId(att.id);
    try {
      const snap = await getDoc(doc(db, 'task_attachments', att.id));
      if (!snap.exists()) {
        setFeedback({ type: 'error', text: 'Ficheiro não encontrado ou já foi removido.' });
        return;
      }
      const fileData = snap.data() as TaskAttachmentFile;
      if (action === 'download') {
        downloadFileFromUrlOrData(fileData.dataUrl, fileData.fileName);
      } else {
        setPreviewAttachment(fileData);
      }
    } catch (err) {
      console.error('Erro ao abrir anexo da tarefa:', err);
      setFeedback({ type: 'error', text: 'Erro ao carregar anexo da tarefa.' });
    } finally {
      setLoadingAttachmentId(null);
    }
  };

  const handleStatusChange = async (task: StaffTask, nextStatus: StaffTask['status']) => {
    const nowIso = new Date().toISOString();
    try {
      await updateDoc(doc(db, 'tasks', task.id), {
        status: nextStatus,
        completedAt: nextStatus === 'completed' ? nowIso : '',
        updatedAt: nowIso,
      });
    } catch (err) {
      console.error('Erro ao atualizar estado da tarefa:', err);
      handleFirestoreError(err, OperationType.UPDATE, `tasks/${task.id}`);
    }
  };

  const handleToggleChecklistItemLive = async (task: StaffTask, itemId: string) => {
    const updatedChecklist = (task.checklist || []).map((item) =>
      item.id === itemId ? { ...item, done: !item.done } : item
    );
    try {
      await updateDoc(doc(db, 'tasks', task.id), {
        checklist: updatedChecklist,
        updatedAt: new Date().toISOString(),
      });
    } catch (err) {
      console.error('Erro ao atualizar checklist:', err);
    }
  };

  const handleSendOverdueAlert = async (task: StaffTask) => {
    const recipients =
      task.assigneeUids && task.assigneeUids.length > 0
        ? task.assigneeUids
        : [task.assignedToUid];
    for (const uid of recipients) {
      const name =
        availableAssignees.find((a) => a.uid === uid)?.displayName || task.assignedToName;
      await notifyOperator(
        uid,
        name,
        'task_overdue',
        `ALERTA DE PRAZO EXPIRADO: ${task.title}`,
        `A tarefa "${task.title}" ultrapassou o prazo de conclusão (${task.dueDate} às ${
          task.dueTime || '18:00'
        }) e continua por concluir.`,
        task.id
      );
    }
    setFeedback({
      type: 'success',
      text: `Alerta de prazo expirado enviado para ${
        task.assigneeNames?.join(', ') || task.assignedToName
      }.`,
    });
  };

  const handleDeleteTask = async () => {
    if (!taskToDelete) return;
    try {
      for (const att of taskToDelete.attachments || []) {
        await deleteDoc(doc(db, 'task_attachments', att.id)).catch(() => {});
      }
      await deleteDoc(doc(db, 'tasks', taskToDelete.id));
      if (selectedTask?.id === taskToDelete.id) {
        setSelectedTask(null);
      }
      setFeedback({ type: 'success', text: 'Tarefa eliminada.' });
      setTaskToDelete(null);
    } catch (err) {
      console.error('Erro ao eliminar tarefa:', err);
      handleFirestoreError(err, OperationType.DELETE, `tasks/${taskToDelete.id}`);
    }
  };

  if (!isStaff) {
    return (
      <div className="p-8 text-center">
        <p className="text-sm text-gray-500">Área reservada a operadores e administradores.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 font-display flex items-center gap-2.5">
            <CheckSquare className="w-6 h-6 text-teal" />
            Tarefas & Gestão de Prazos
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Registe tarefas a realizar, atribua destinatários e seguidores, anexe ficheiros e receba alertas de prazo.
          </p>
        </div>

        <Button
          onClick={openCreateModal}
          className="bg-teal hover:bg-teal-dark text-white font-bold gap-2 shadow-sm shadow-teal/20 shrink-0"
        >
          <Plus className="w-4 h-4" />
          Nova Tarefa
        </Button>
      </div>

      {/* Feedback Message */}
      {feedback && (
        <div
          className={cn(
            'p-3.5 rounded-xl border flex items-center justify-between gap-3 text-sm font-medium',
            feedback.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-red-50 border-red-200 text-red-700'
          )}
        >
          <span className="flex items-center gap-2">
            {feedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 shrink-0" />
            )}
            {feedback.text}
          </span>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="p-1 rounded-lg hover:bg-black/5"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Urgent Overdue Alert Banner */}
      {overdueTasks.length > 0 && (
        <div className="rounded-2xl border-2 border-red-200 bg-red-50/90 p-4 shadow-sm">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-red-600 text-white flex items-center justify-center shrink-0 animate-pulse">
                <BellRing className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-extrabold text-red-900">
                  Alerta de Prazo: {overdueTasks.length} Tarefa(s) Não Finalizada(s) Dentro do Tempo Previsto
                </h3>
                <p className="text-xs text-red-700 mt-0.5">
                  {stats.myOverdue > 0
                    ? `Tem ${stats.myOverdue} tarefa(s) atribuída(s) a si com o prazo expirado. Regularize ou conclua imediatamente.`
                    : `Existem ${overdueTasks.length} tarefa(s) da equipa com a data de vencimento ultrapassada.`}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <Button
                size="sm"
                onClick={() => {
                  setActiveTab('overdue');
                  setStatusFilter('all');
                }}
                className="bg-red-600 hover:bg-red-700 text-white font-bold text-xs gap-1.5"
              >
                <AlertTriangle className="w-3.5 h-3.5" />
                Ver Em Atraso ({overdueTasks.length})
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Perfex CRM style 5-card KPI Overview */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <button
          type="button"
          onClick={() => {
            setActiveTab('all');
            setStatusFilter('pending');
          }}
          className="text-left p-4 rounded-xl bg-white border border-gray-200 hover:border-gray-300 shadow-sm transition-all"
        >
          <p className="text-2xl font-black text-gray-900 tabular-nums">{stats.pending}</p>
          <p className="text-xs font-bold text-gray-500 mt-1 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-gray-400" />
            Não Iniciadas
          </p>
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveTab('all');
            setStatusFilter('in_progress');
          }}
          className="text-left p-4 rounded-xl bg-white border border-gray-200 hover:border-teal/40 shadow-sm transition-all"
        >
          <p className="text-2xl font-black text-teal tabular-nums">{stats.inProgress}</p>
          <p className="text-xs font-bold text-teal mt-1 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-teal" />
            Em Progresso
          </p>
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveTab('all');
            setStatusFilter('waiting');
          }}
          className="text-left p-4 rounded-xl bg-white border border-gray-200 hover:border-amber-300 shadow-sm transition-all"
        >
          <p className="text-2xl font-black text-amber-600 tabular-nums">{stats.waiting}</p>
          <p className="text-xs font-bold text-amber-700 mt-1 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-amber-500" />
            Aguardando
          </p>
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveTab('overdue');
            setStatusFilter('all');
          }}
          className={cn(
            'text-left p-4 rounded-xl border shadow-sm transition-all',
            stats.overdue > 0
              ? 'bg-red-50 border-red-300 hover:border-red-400'
              : 'bg-white border-gray-200 hover:border-gray-300'
          )}
        >
          <p
            className={cn(
              'text-2xl font-black tabular-nums',
              stats.overdue > 0 ? 'text-red-700' : 'text-gray-900'
            )}
          >
            {stats.overdue}
          </p>
          <p
            className={cn(
              'text-xs font-bold mt-1 flex items-center gap-1.5',
              stats.overdue > 0 ? 'text-red-700' : 'text-gray-500'
            )}
          >
            <span className="w-2 h-2 rounded-full bg-red-600" />
            Em Atraso (Alerta)
          </p>
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveTab('completed');
            setStatusFilter('all');
          }}
          className="text-left p-4 rounded-xl bg-white border border-gray-200 hover:border-emerald-300 shadow-sm transition-all col-span-2 sm:col-span-1"
        >
          <p className="text-2xl font-black text-emerald-600 tabular-nums">{stats.completed}</p>
          <p className="text-xs font-bold text-emerald-700 mt-1 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            Terminadas
          </p>
        </button>
      </div>

      {/* Filters & Tabs Card */}
      <Card className="border-none shadow-sm">
        <CardContent className="p-4 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-1.5">
              {(
                [
                  { id: 'all', label: `Todas (${enrichedTasks.length})` },
                  {
                    id: 'mine',
                    label: `Minhas Tarefas (${
                      enrichedTasks.filter((t) => isUserAssignedToTask(t, profile?.uid)).length
                    })`,
                  },
                  {
                    id: 'created_by_me',
                    label: `Criadas por Mim (${
                      enrichedTasks.filter((t) => t.createdByUid === profile?.uid).length
                    })`,
                  },
                  { id: 'overdue', label: `Em Atraso (${stats.overdue})` },
                  { id: 'completed', label: `Terminadas (${stats.completed})` },
                ] as { id: TaskFilterTab; label: string }[]
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => {
                    setActiveTab(tab.id);
                    if (tab.id !== 'all') setStatusFilter('all');
                  }}
                  className={cn(
                    'px-3 py-1.5 rounded-lg text-xs font-bold transition-all',
                    activeTab === tab.id
                      ? tab.id === 'overdue' && stats.overdue > 0
                        ? 'bg-red-600 text-white shadow-sm'
                        : 'bg-teal text-white shadow-sm'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  )}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {statusFilter !== 'all' && (
              <button
                type="button"
                onClick={() => setStatusFilter('all')}
                className="text-xs font-bold text-teal hover:underline"
              >
                Limpar filtro de estado ({STATUS_META[statusFilter as StaffTask['status']]?.label})
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-1">
            <div className="relative lg:col-span-2">
              <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <Input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Pesquisar assunto, tag, destinatário ou processo..."
                className="pl-9 h-9 text-xs"
              />
            </div>

            <div className="flex items-center gap-2">
              <Filter className="w-3.5 h-3.5 text-gray-400 shrink-0" />
              <select
                value={priorityFilter}
                onChange={(e) => setPriorityFilter(e.target.value)}
                className="w-full h-9 rounded-md border border-gray-300 bg-white px-2.5 text-xs font-medium text-gray-700"
              >
                <option value="all">Todas as Prioridades</option>
                <option value="urgent">Urgente</option>
                <option value="high">Alta</option>
                <option value="medium">Média</option>
                <option value="low">Baixa</option>
              </select>
            </div>

            <div>
              <select
                value={assigneeFilter}
                onChange={(e) => setAssigneeFilter(e.target.value)}
                className="w-full h-9 rounded-md border border-gray-300 bg-white px-2.5 text-xs font-medium text-gray-700"
              >
                <option value="all">Todos os Destinatários</option>
                {availableAssignees.map((op) => (
                  <option key={op.uid} value={op.uid}>
                    {op.displayName}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tasks Table */}
      <Card className="border-none shadow-sm overflow-hidden">
        <CardHeader className="pb-3 border-b border-gray-100">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base font-bold text-gray-900">Resumo das Tarefas</CardTitle>
              <CardDescription className="text-xs">
                Clique no assunto para abrir anexos, seguidores, tags e checklist de execução.
              </CardDescription>
            </div>
            <span className="text-xs font-bold text-gray-500">{filteredTasks.length} registo(s)</span>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {loading ? (
            <div className="p-10 text-center text-sm text-gray-500">A carregar tarefas...</div>
          ) : filteredTasks.length === 0 ? (
            <div className="p-12 text-center space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-gray-100 text-gray-400 flex items-center justify-center mx-auto">
                <CheckSquare className="w-6 h-6" />
              </div>
              <div>
                <p className="text-sm font-bold text-gray-800">Nenhuma tarefa encontrada</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  Crie uma nova tarefa com prazo definido para organizar as atividades da equipa.
                </p>
              </div>
              <Button size="sm" onClick={openCreateModal} className="bg-teal hover:bg-teal-dark text-white font-bold">
                <Plus className="w-4 h-4 mr-1.5" />
                Adicionar Nova Tarefa
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-gray-50/80 border-b border-gray-100 text-[11px] font-bold uppercase tracking-wider text-gray-500">
                    <th className="py-3 px-4">Assunto & Tags</th>
                    <th className="py-3 px-4">Estado</th>
                    <th className="py-3 px-4">Data de Início</th>
                    <th className="py-3 px-4">Data de Vencimento</th>
                    <th className="py-3 px-4">Atribuído a</th>
                    <th className="py-3 px-4">Prioridade</th>
                    <th className="py-3 px-4 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 text-sm">
                  {filteredTasks.map((task) => {
                    const totalChk = task.checklist?.length || 0;
                    const doneChk = task.checklist?.filter((c) => c.done).length || 0;
                    const attachCount = task.attachments?.length || 0;
                    const statusInfo = STATUS_META[task.status];
                    const prioInfo = PRIORITY_META[task.priority];
                    const assigneesDisplay =
                      task.assigneeNames && task.assigneeNames.length > 0
                        ? task.assigneeNames
                        : [task.assignedToName];

                    return (
                      <tr
                        key={task.id}
                        className={cn(
                          'transition-colors hover:bg-gray-50/70',
                          task.isOverdue && 'bg-red-50/40 hover:bg-red-50/60'
                        )}
                      >
                        <td className="py-3.5 px-4 max-w-md">
                          <div className="flex items-start gap-2.5">
                            <button
                              type="button"
                              onClick={() =>
                                handleStatusChange(
                                  task,
                                  task.status === 'completed' ? 'in_progress' : 'completed'
                                )
                              }
                              title={
                                task.status === 'completed'
                                  ? 'Reabrir tarefa'
                                  : 'Marcar como concluída'
                              }
                              className={cn(
                                'mt-0.5 w-5 h-5 rounded-md border flex items-center justify-center shrink-0 transition-colors',
                                task.status === 'completed'
                                  ? 'bg-emerald-600 border-emerald-600 text-white'
                                  : 'border-gray-300 bg-white hover:border-teal text-transparent hover:text-teal/40'
                              )}
                            >
                              <Check className="w-3.5 h-3.5" />
                            </button>

                            <div className="min-w-0">
                              <button
                                type="button"
                                onClick={() => setSelectedTask(task)}
                                className={cn(
                                  'text-left font-bold text-gray-900 hover:text-teal transition-colors block',
                                  task.status === 'completed' && 'line-through text-gray-400'
                                )}
                              >
                                {task.title}
                              </button>
                              {task.description && (
                                <p className="text-xs text-gray-500 line-clamp-1 mt-0.5">
                                  {task.description}
                                </p>
                              )}
                              <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                                {(task.relatedEntityLabel || task.relatedProcessLabel) && (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-gray-100 text-gray-700 text-[10px] font-semibold">
                                    <FileText className="w-3 h-3 text-teal" />
                                    {task.relatedEntityLabel || task.relatedProcessLabel}
                                  </span>
                                )}
                                {task.billable && Number(task.hourlyRate) > 0 && (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 text-[10px] font-bold">
                                    <Wallet className="w-3 h-3" />
                                    {Number(task.hourlyRate).toLocaleString('pt-AO')} Kz/h
                                  </span>
                                )}
                                {task.isPublic && (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-sky-50 text-sky-700 text-[10px] font-bold">
                                    <Globe className="w-3 h-3" />
                                    Público
                                  </span>
                                )}
                                {attachCount > 0 && (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-gray-100 text-gray-700 text-[10px] font-bold">
                                    <Paperclip className="w-3 h-3" />
                                    {attachCount}
                                  </span>
                                )}
                                {totalChk > 0 && (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-teal-light/60 text-teal text-[10px] font-bold">
                                    <ListChecks className="w-3 h-3" />
                                    {doneChk}/{totalChk}
                                  </span>
                                )}
                                {task.repeatEvery && (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-purple-50 text-purple-700 text-[10px] font-bold">
                                    <Repeat className="w-3 h-3" />
                                    Recorrente
                                  </span>
                                )}
                                {(task.tags || []).map((t) => (
                                  <span
                                    key={t}
                                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-100 text-slate-700 text-[10px] font-semibold"
                                  >
                                    <Tag className="w-2.5 h-2.5 text-gray-400" />
                                    {t}
                                  </span>
                                ))}
                              </div>
                            </div>
                          </div>
                        </td>

                        <td className="py-3.5 px-4 whitespace-nowrap">
                          <select
                            value={task.status}
                            onChange={(e) =>
                              handleStatusChange(task, e.target.value as StaffTask['status'])
                            }
                            className={cn(
                              'text-xs font-bold rounded-full px-2.5 py-1 border cursor-pointer focus:outline-none',
                              statusInfo.badgeClass
                            )}
                          >
                            <option value="pending">Não Iniciada</option>
                            <option value="in_progress">Em Curso</option>
                            <option value="waiting">Aguardando</option>
                            <option value="completed">Concluída</option>
                          </select>
                        </td>

                        <td className="py-3.5 px-4 whitespace-nowrap text-xs font-medium text-gray-600">
                          {task.startDate || '—'}
                        </td>

                        <td className="py-3.5 px-4 whitespace-nowrap">
                          <div className="space-y-1">
                            <p className="text-xs font-bold text-gray-800 flex items-center gap-1.5">
                              <Calendar className="w-3.5 h-3.5 text-gray-400" />
                              {task.dueDate} · {task.dueTime || '18:00'}
                            </p>
                            {task.status === 'completed' ? (
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
                                <CheckCircle2 className="w-3 h-3" />
                                Terminada
                              </span>
                            ) : task.isOverdue ? (
                              <span className="inline-flex items-center gap-1 text-[10px] font-black text-white bg-red-600 px-2 py-0.5 rounded-full animate-pulse">
                                <AlertTriangle className="w-3 h-3" />
                                ATRASADA há {formatDurationDelta(task.diffMs)}
                              </span>
                            ) : task.isDueSoon ? (
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-800 bg-amber-100 px-2 py-0.5 rounded-full">
                                <Timer className="w-3 h-3" />
                                Vence em {formatDurationDelta(task.diffMs)}
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-gray-500">
                                <Clock className="w-3 h-3" />
                                Restam {formatDurationDelta(task.diffMs)}
                              </span>
                            )}
                          </div>
                        </td>

                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-full bg-teal-light text-teal font-bold text-xs flex items-center justify-center shrink-0">
                              {assigneesDisplay[0]?.charAt(0)?.toUpperCase() || 'O'}
                            </div>
                            <div className="min-w-0">
                              <p className="text-xs font-bold text-gray-900 truncate max-w-[160px]">
                                {assigneesDisplay.join(', ')}
                              </p>
                              {(task.followerNames?.length || 0) > 0 && (
                                <p className="text-[10px] text-gray-400 truncate max-w-[160px]">
                                  Seguidores: {task.followerNames?.join(', ')}
                                </p>
                              )}
                            </div>
                          </div>
                        </td>

                        <td className="py-3.5 px-4 whitespace-nowrap">
                          <Badge className={cn('border text-[11px] font-bold', prioInfo.badgeClass)}>
                            {prioInfo.label}
                          </Badge>
                        </td>

                        <td className="py-3.5 px-4 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-1">
                            {task.isOverdue && (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleSendOverdueAlert(task)}
                                title="Enviar alerta de atraso ao responsável"
                                className="h-8 w-8 p-0 text-red-600 hover:bg-red-50"
                              >
                                <Send className="w-4 h-4" />
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => openEditModal(task)}
                              title="Editar tarefa"
                              className="h-8 w-8 p-0 text-gray-500 hover:text-teal hover:bg-teal-light/50"
                            >
                              <Edit2 className="w-4 h-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setTaskToDelete(task)}
                              title="Eliminar tarefa"
                              className="h-8 w-8 p-0 text-gray-400 hover:text-red-600 hover:bg-red-50"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Modal Adicionar / Editar Tarefa (Modelo Completo) */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-2xl border border-gray-100 w-full max-w-2xl max-h-[92vh] overflow-y-auto">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between sticky top-0 bg-white z-10">
              <div>
                <h2 className="text-lg font-bold text-gray-900">
                  {editingTask ? 'Editar Tarefa' : 'Adicionar Nova Tarefa'}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="p-2 rounded-lg text-gray-400 hover:bg-gray-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveTask} className="p-6 space-y-4">
              {/* Top Checkboxes (Público / Faturável) & Anexar Ficheiros */}
              <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-gray-100">
                <div className="flex items-center gap-5">
                  <label className="inline-flex items-center gap-2 text-xs font-bold text-gray-700 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={formState.isPublic}
                      onChange={(e) => setFormState({ ...formState, isPublic: e.target.checked })}
                      className="w-4 h-4 rounded border-gray-300 text-teal focus:ring-teal"
                    />
                    Público
                  </label>

                  <label className="inline-flex items-center gap-2 text-xs font-bold text-gray-700 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={formState.billable}
                      onChange={(e) => setFormState({ ...formState, billable: e.target.checked })}
                      className="w-4 h-4 rounded border-gray-300 text-teal focus:ring-teal"
                    />
                    Faturável
                  </label>
                </div>

                <label className="inline-flex items-center gap-1.5 text-xs font-bold text-teal hover:text-teal-dark cursor-pointer">
                  <Paperclip className="w-4 h-4" />
                  {uploadingFiles ? 'A carregar ficheiros...' : 'Anexar ficheiros'}
                  <input
                    type="file"
                    multiple
                    disabled={uploadingFiles}
                    onChange={handleAttachFiles}
                    className="hidden"
                  />
                </label>
              </div>

              {/* Lista de ficheiros anexados */}
              {pendingAttachments.length > 0 && (
                <div className="flex flex-wrap gap-2 bg-gray-50 p-2.5 rounded-xl border border-gray-200">
                  {pendingAttachments.map((att) => (
                    <span
                      key={att.id}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white border border-gray-200 text-xs font-medium text-gray-700 shadow-2xs"
                    >
                      <Paperclip className="w-3 h-3 text-teal" />
                      <span className="max-w-[180px] truncate">{att.fileName}</span>
                      <span className="text-[10px] text-gray-400">({formatFileSize(att.fileSize)})</span>
                      <button
                        type="button"
                        onClick={() => handleRemovePendingAttachment(att)}
                        className="text-gray-400 hover:text-red-600 ml-0.5"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </span>
                  ))}
                </div>
              )}

              {/* Assunto */}
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">
                  <span className="text-red-500 mr-1">*</span>Assunto
                </label>
                <Input
                  required
                  value={formState.title}
                  onChange={(e) => setFormState({ ...formState, title: e.target.value })}
                  placeholder="Ex: Pagamento do RUP / Confirmar agendamento consular"
                />
              </div>

              {/* Valor por Hora */}
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">
                  Valor por Hora (Kz)
                </label>
                <Input
                  type="number"
                  min={0}
                  step="any"
                  value={formState.hourlyRate}
                  onChange={(e) =>
                    setFormState({ ...formState, hourlyRate: Number(e.target.value) || 0 })
                  }
                  placeholder="0"
                />
              </div>

              {/* Data de Início / Data de Vencimento / Hora Limite */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">
                    <span className="text-red-500 mr-1">*</span>Data de Início
                  </label>
                  <Input
                    type="date"
                    required
                    value={formState.startDate}
                    onChange={(e) => setFormState({ ...formState, startDate: e.target.value })}
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">
                    <span className="text-red-500 mr-1">*</span>Data de Vencimento
                  </label>
                  <Input
                    type="date"
                    required
                    value={formState.dueDate}
                    onChange={(e) => setFormState({ ...formState, dueDate: e.target.value })}
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">
                    Hora Limite
                  </label>
                  <Input
                    type="time"
                    value={formState.dueTime}
                    onChange={(e) => setFormState({ ...formState, dueTime: e.target.value })}
                  />
                </div>
              </div>

              {/* Prioridade & Repetir todos */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Prioridade</label>
                  <select
                    value={formState.priority}
                    onChange={(e) =>
                      setFormState({
                        ...formState,
                        priority: e.target.value as StaffTask['priority'],
                      })
                    }
                    className="w-full h-10 rounded-md border border-gray-300 bg-white px-3 text-sm"
                  >
                    <option value="low">Baixa</option>
                    <option value="medium">Média</option>
                    <option value="high">Alta</option>
                    <option value="urgent">Urgente</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Repetir todos</label>
                  <select
                    value={formState.repeatEvery}
                    onChange={(e) =>
                      setFormState({
                        ...formState,
                        repeatEvery: e.target.value as TaskRepeatInterval,
                      })
                    }
                    className="w-full h-10 rounded-md border border-gray-300 bg-white px-3 text-sm"
                  >
                    {REPEAT_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Relacionado ao + Estado */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Relacionado ao</label>
                  <select
                    value={formState.relatedType}
                    onChange={(e) =>
                      setFormState({
                        ...formState,
                        relatedType: e.target.value as TaskRelatedType,
                        relatedEntityId: '',
                      })
                    }
                    className="w-full h-10 rounded-md border border-gray-300 bg-white px-3 text-sm"
                  >
                    {RELATED_TYPE_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>

                {formState.relatedType ? (
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">
                      Selecionar{' '}
                      {RELATED_TYPE_OPTIONS.find((r) => r.value === formState.relatedType)?.label}
                    </label>
                    <select
                      value={formState.relatedEntityId}
                      onChange={(e) =>
                        setFormState({ ...formState, relatedEntityId: e.target.value })
                      }
                      className="w-full h-10 rounded-md border border-gray-300 bg-white px-3 text-sm"
                    >
                      <option value="">Selecionar registo...</option>
                      {relatedEntityOptions.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.label}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">Estado</label>
                    <select
                      value={formState.status}
                      onChange={(e) =>
                        setFormState({ ...formState, status: e.target.value as StaffTask['status'] })
                      }
                      className="w-full h-10 rounded-md border border-gray-300 bg-white px-3 text-sm"
                    >
                      <option value="pending">Não Iniciada</option>
                      <option value="in_progress">Em Curso</option>
                      <option value="waiting">Aguardando</option>
                      <option value="completed">Concluída</option>
                    </select>
                  </div>
                )}
              </div>

              {formState.relatedType && (
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Estado</label>
                  <select
                    value={formState.status}
                    onChange={(e) =>
                      setFormState({ ...formState, status: e.target.value as StaffTask['status'] })
                    }
                    className="w-full h-10 rounded-md border border-gray-300 bg-white px-3 text-sm"
                  >
                    <option value="pending">Não Iniciada</option>
                    <option value="in_progress">Em Curso</option>
                    <option value="waiting">Aguardando</option>
                    <option value="completed">Concluída</option>
                  </select>
                </div>
              )}

              {/* Destinatários & Seguidores */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-gray-700">
                    <span className="text-red-500 mr-1">*</span>Destinatários
                  </label>
                  <select
                    value=""
                    onChange={(e) => handleAddAssignee(e.target.value)}
                    className="w-full h-10 rounded-md border border-gray-300 bg-white px-3 text-sm"
                  >
                    <option value="">Adicionar destinatário...</option>
                    {availableAssignees
                      .filter((op) => !formState.assigneeUids.includes(op.uid))
                      .map((op) => (
                        <option key={op.uid} value={op.uid}>
                          {op.displayName} ({op.role === 'admin' ? 'Admin' : 'Operador'})
                        </option>
                      ))}
                  </select>
                  <div className="flex flex-wrap gap-1.5 min-h-[28px]">
                    {formState.assigneeUids.map((uid) => {
                      const name =
                        availableAssignees.find((a) => a.uid === uid)?.displayName || 'Operador';
                      return (
                        <span
                          key={uid}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-teal-light text-teal text-xs font-bold"
                        >
                          {name}
                          <button
                            type="button"
                            onClick={() => handleRemoveAssignee(uid)}
                            className="hover:text-red-600"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </span>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-gray-700">Seguidores</label>
                  <select
                    value=""
                    onChange={(e) => handleAddFollower(e.target.value)}
                    className="w-full h-10 rounded-md border border-gray-300 bg-white px-3 text-sm"
                  >
                    <option value="">Nada selecionado</option>
                    {availableAssignees
                      .filter((op) => !formState.followerUids.includes(op.uid))
                      .map((op) => (
                        <option key={op.uid} value={op.uid}>
                          {op.displayName} ({op.role === 'admin' ? 'Admin' : 'Operador'})
                        </option>
                      ))}
                  </select>
                  <div className="flex flex-wrap gap-1.5 min-h-[28px]">
                    {formState.followerUids.map((uid) => {
                      const name =
                        availableAssignees.find((a) => a.uid === uid)?.displayName || 'Operador';
                      return (
                        <span
                          key={uid}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-gray-100 text-gray-700 text-xs font-bold"
                        >
                          {name}
                          <button
                            type="button"
                            onClick={() => handleRemoveFollower(uid)}
                            className="hover:text-red-600"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </span>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Tags */}
              <div className="space-y-1.5">
                <label className="flex items-center gap-1.5 text-xs font-bold text-gray-700">
                  <Tag className="w-3.5 h-3.5 text-gray-500" />
                  Tags
                </label>
                <div className="flex gap-2">
                  <Input
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ',') {
                        e.preventDefault();
                        handleAddTag();
                      }
                    }}
                    placeholder="Escreva uma tag (ex: RUP, Consulado, Visto) e prima Enter..."
                    className="h-9 text-xs"
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => handleAddTag()}
                    className="shrink-0 h-9"
                  >
                    <Plus className="w-4 h-4 mr-1" />
                    Tag
                  </Button>
                </div>
                {formState.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {formState.tags.map((tag) => (
                      <span
                        key={tag}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 text-xs font-semibold border border-slate-200"
                      >
                        #{tag}
                        <button
                          type="button"
                          onClick={() => handleRemoveTag(tag)}
                          className="text-gray-400 hover:text-red-600"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Descrição da Tarefa */}
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">
                  Descrição da Tarefa
                </label>
                <textarea
                  rows={4}
                  value={formState.description}
                  onChange={(e) => setFormState({ ...formState, description: e.target.value })}
                  placeholder="Adicionar descrição"
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal"
                />
              </div>

              {/* Checklist builder */}
              <div className="pt-2 border-t border-gray-100 space-y-2">
                <label className="block text-xs font-bold text-gray-700">
                  Checklist de Etapas (Opcional)
                </label>
                <div className="flex gap-2">
                  <Input
                    value={newChecklistInput}
                    onChange={(e) => setNewChecklistInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddChecklistItem();
                      }
                    }}
                    placeholder="Adicionar passo da tarefa..."
                    className="h-9 text-xs"
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={handleAddChecklistItem}
                    className="shrink-0 h-9"
                  >
                    <Plus className="w-4 h-4 mr-1" />
                    Adicionar
                  </Button>
                </div>

                {formState.checklist.length > 0 && (
                  <div className="space-y-1.5 max-h-36 overflow-y-auto pt-1">
                    {formState.checklist.map((item) => (
                      <div
                        key={item.id}
                        className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-gray-50 border border-gray-200 text-xs"
                      >
                        <span className="font-medium text-gray-800">{item.text}</span>
                        <button
                          type="button"
                          onClick={() => handleRemoveChecklistItem(item.id)}
                          className="text-gray-400 hover:text-red-600"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="pt-4 border-t border-gray-100 flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setIsModalOpen(false)}>
                  Fechar
                </Button>
                <Button
                  type="submit"
                  disabled={saving || uploadingFiles}
                  className="bg-teal hover:bg-teal-dark text-white font-bold"
                >
                  {saving ? 'A guardar...' : 'Guardar'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Detalhes, Anexos & Checklist da Tarefa */}
      {selectedTask && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-2xl border border-gray-100 w-full max-w-xl max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b border-gray-100 flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge className={cn('border text-[11px] font-bold', STATUS_META[selectedTask.status].badgeClass)}>
                    {STATUS_META[selectedTask.status].label}
                  </Badge>
                  <Badge className={cn('border text-[11px] font-bold', PRIORITY_META[selectedTask.priority].badgeClass)}>
                    Prioridade: {PRIORITY_META[selectedTask.priority].label}
                  </Badge>
                  {selectedTask.isPublic && (
                    <Badge className="bg-sky-50 text-sky-700 border border-sky-200 text-[11px]">
                      Público
                    </Badge>
                  )}
                  {selectedTask.billable && (
                    <Badge className="bg-emerald-50 text-emerald-700 border border-emerald-200 text-[11px]">
                      Faturável {selectedTask.hourlyRate ? `· ${selectedTask.hourlyRate.toLocaleString('pt-AO')} Kz/h` : ''}
                    </Badge>
                  )}
                </div>
                <h2 className="text-lg font-bold text-gray-900 mt-2">{selectedTask.title}</h2>
              </div>
              <button
                type="button"
                onClick={() => setSelectedTask(null)}
                className="p-2 rounded-lg text-gray-400 hover:bg-gray-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-5">
              {selectedTask.description && (
                <div className="p-3.5 rounded-xl bg-gray-50 border border-gray-100 text-sm text-gray-700 whitespace-pre-line">
                  {selectedTask.description}
                </div>
              )}

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="p-3 rounded-xl border border-gray-100 bg-white">
                  <p className="text-gray-400 font-bold uppercase text-[10px]">Destinatários</p>
                  <p className="font-bold text-gray-900 mt-1 flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5 text-teal shrink-0" />
                    {(selectedTask.assigneeNames && selectedTask.assigneeNames.length > 0
                      ? selectedTask.assigneeNames
                      : [selectedTask.assignedToName]
                    ).join(', ')}
                  </p>
                </div>
                <div className="p-3 rounded-xl border border-gray-100 bg-white">
                  <p className="text-gray-400 font-bold uppercase text-[10px]">Início & Vencimento</p>
                  <p className="font-bold text-gray-900 mt-1 flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-teal shrink-0" />
                    {selectedTask.startDate || '—'} → {selectedTask.dueDate} ({selectedTask.dueTime || '18:00'})
                  </p>
                </div>
              </div>

              {(selectedTask.followerNames?.length || 0) > 0 && (
                <div className="p-3 rounded-xl border border-gray-100 bg-gray-50/70 text-xs flex items-center gap-2">
                  <Users className="w-4 h-4 text-gray-500 shrink-0" />
                  <span className="font-bold text-gray-700">Seguidores:</span>
                  <span className="text-gray-600">{selectedTask.followerNames?.join(', ')}</span>
                </div>
              )}

              {(selectedTask.relatedEntityLabel || selectedTask.relatedProcessLabel) && (
                <div className="p-3 rounded-xl border border-teal/20 bg-teal-light/30 flex items-center gap-2 text-xs font-bold text-teal">
                  <FileText className="w-4 h-4 shrink-0" />
                  Relacionado ao: {selectedTask.relatedEntityLabel || selectedTask.relatedProcessLabel}
                </div>
              )}

              {selectedTask.repeatEvery && (
                <div className="p-3 rounded-xl border border-purple-100 bg-purple-50/60 flex items-center gap-2 text-xs font-bold text-purple-800">
                  <Repeat className="w-4 h-4 shrink-0" />
                  Recorrência:{' '}
                  {REPEAT_OPTIONS.find((r) => r.value === selectedTask.repeatEvery)?.label}
                </div>
              )}

              {(selectedTask.tags?.length || 0) > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {selectedTask.tags?.map((tag) => (
                    <span
                      key={tag}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 text-xs font-semibold"
                    >
                      <Tag className="w-3 h-3 text-gray-400" />
                      {tag}
                    </span>
                  ))}
                </div>
              )}

              {/* Ficheiros Anexados */}
              {(selectedTask.attachments?.length || 0) > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-bold text-gray-700 uppercase tracking-wider">
                    Ficheiros Anexados ({selectedTask.attachments?.length})
                  </p>
                  <div className="space-y-1.5">
                    {selectedTask.attachments?.map((att) => (
                      <div
                        key={att.id}
                        className="flex items-center justify-between gap-2 p-2.5 rounded-xl border border-gray-200 bg-gray-50/60 text-xs"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <Paperclip className="w-4 h-4 text-teal shrink-0" />
                          <div className="min-w-0">
                            <p className="font-bold text-gray-900 truncate">{att.fileName}</p>
                            <p className="text-[10px] text-gray-500">{formatFileSize(att.fileSize)}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            disabled={loadingAttachmentId === att.id}
                            onClick={() => handleOpenAttachment(att, 'view')}
                            className="h-7 px-2 text-xs text-teal"
                          >
                            <Eye className="w-3.5 h-3.5 mr-1" />
                            Ver
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            disabled={loadingAttachmentId === att.id}
                            onClick={() => handleOpenAttachment(att, 'download')}
                            className="h-7 px-2 text-xs text-gray-600"
                          >
                            <Download className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <p className="text-xs font-bold text-gray-700 uppercase tracking-wider">
                  Checklist de Execução
                </p>
                {!selectedTask.checklist || selectedTask.checklist.length === 0 ? (
                  <p className="text-xs text-gray-400 italic">Sem etapas adicionadas.</p>
                ) : (
                  <div className="space-y-1.5">
                    {selectedTask.checklist.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => handleToggleChecklistItemLive(selectedTask, item.id)}
                        className={cn(
                          'w-full flex items-center gap-3 p-2.5 rounded-xl border text-left text-xs transition-colors',
                          item.done
                            ? 'bg-emerald-50/70 border-emerald-200 text-emerald-800 line-through'
                            : 'bg-white border-gray-200 text-gray-800 hover:border-teal'
                        )}
                      >
                        <span
                          className={cn(
                            'w-4 h-4 rounded flex items-center justify-center border shrink-0',
                            item.done
                              ? 'bg-emerald-600 border-emerald-600 text-white'
                              : 'border-gray-300 bg-white'
                          )}
                        >
                          {item.done && <Check className="w-3 h-3" />}
                        </span>
                        <span className="font-medium">{item.text}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="pt-4 border-t border-gray-100 flex flex-wrap justify-between gap-2">
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const target = selectedTask;
                      setSelectedTask(null);
                      openEditModal(target);
                    }}
                  >
                    <Edit2 className="w-3.5 h-3.5 mr-1.5" />
                    Editar
                  </Button>
                  {selectedTask.status !== 'completed' && (
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => handleStatusChange(selectedTask, 'completed')}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />
                      Concluir Tarefa
                    </Button>
                  )}
                </div>
                <Button type="button" variant="outline" size="sm" onClick={() => setSelectedTask(null)}>
                  Fechar
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Pré-visualizar Anexo */}
      {previewAttachment && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-[60]">
          <div className="bg-white rounded-2xl shadow-2xl border border-gray-100 w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">
            <div className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between gap-3">
              <p className="text-sm font-bold text-gray-900 truncate">{previewAttachment.fileName}</p>
              <div className="flex items-center gap-2 shrink-0">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    downloadFileFromUrlOrData(previewAttachment.dataUrl, previewAttachment.fileName)
                  }
                  className="text-xs h-8 gap-1.5"
                >
                  <Download className="w-3.5 h-3.5" />
                  Descarregar
                </Button>
                <button
                  type="button"
                  onClick={() => setPreviewAttachment(null)}
                  className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            <div className="flex-1 bg-gray-100 overflow-auto p-4 flex items-center justify-center min-h-[380px]">
              {previewAttachment.mimeType.startsWith('image/') ? (
                <img
                  src={previewAttachment.dataUrl}
                  alt={previewAttachment.fileName}
                  className="max-w-full max-h-[70vh] rounded-lg shadow"
                />
              ) : previewAttachment.mimeType === 'application/pdf' ? (
                <iframe
                  src={previewAttachment.dataUrl}
                  title={previewAttachment.fileName}
                  className="w-full h-[70vh] rounded-lg bg-white"
                />
              ) : (
                <div className="text-center space-y-3 p-8 bg-white rounded-xl border border-gray-200">
                  <FileText className="w-10 h-10 text-teal mx-auto" />
                  <p className="text-sm font-bold text-gray-800">{previewAttachment.fileName}</p>
                  <Button
                    size="sm"
                    onClick={() =>
                      downloadFileFromUrlOrData(previewAttachment.dataUrl, previewAttachment.fileName)
                    }
                    className="bg-teal text-white"
                  >
                    Descarregar Ficheiro
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal Confirmar Eliminação */}
      {taskToDelete && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-2xl border border-gray-100 w-full max-w-md p-6 space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-red-100 text-red-600 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-gray-900">Eliminar Tarefa</h3>
                <p className="text-xs text-gray-500 mt-1">
                  Tem a certeza que deseja eliminar a tarefa <strong>{taskToDelete.title}</strong>? Esta ação não pode ser anulada.
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={() => setTaskToDelete(null)}>
                Cancelar
              </Button>
              <Button
                size="sm"
                onClick={handleDeleteTask}
                className="bg-red-600 hover:bg-red-700 text-white font-bold"
              >
                Confirmar Eliminação
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
