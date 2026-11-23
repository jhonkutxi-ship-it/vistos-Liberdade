/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type UserRole = 'client' | 'employee' | 'admin';

export type PermissionKey =
  | 'view_dashboard'
  | 'manage_processes'
  | 'approve_processes'
  | 'manage_documents'
  | 'validate_documents'
  | 'manage_clients'
  | 'manage_finances'
  | 'issue_receipts'
  | 'manage_services'
  | 'view_reports'
  | 'manage_employees'
  | 'manage_tasks'
  | 'manage_settings';

export interface UserProfile {
  uid: string;
  email: string;
  username?: string;
  displayName?: string;
  role: UserRole;
  photoURL?: string;
  active?: boolean;
  mustChangePassword?: boolean;
  permissions?: PermissionKey[];
  passwordSalt?: string;
  passwordHash?: string;
  // HR Profile fields
  staffCode?: string;
  jobTitle?: string;
  departments?: string[];
  phone?: string;
  address?: string;
  idNumber?: string;
  nifNumber?: string;
  birthDate?: string;
  gender?: string;
  nationality?: string;
  maritalStatus?: string;
  academicLevel?: string;
  hireDate?: string;
  salary?: number;
  allowances?: number;
  hourlyRate?: number;
  iban?: string;
  employmentStatus?: 'Ativo' | 'Em Formação' | 'Licença' | 'Suspenso';
  hrNotes?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface EmployeeDocument {
  id: string;
  employeeUid: string;
  title: string;
  category: 'bi' | 'passport' | 'contract' | 'cv' | 'certificate' | 'nif' | 'other';
  fileName: string;
  mimeType: string;
  fileSize: number;
  dataUrl: string;
  uploadedBy?: string;
  createdAt: string;
}

export interface EmployeePayslip {
  id: string;
  employeeUid: string;
  employeeName: string;
  staffCode?: string;
  jobTitle?: string;
  idNumber?: string;
  iban?: string;
  referenceMonth: string; // YYYY-MM
  baseSalary: number;
  allowances: number;
  bonus: number;
  deductions: number;
  netSalary: number;
  paymentMethod: string;
  status: 'paid' | 'pending';
  paidAt?: string;
  notes?: string;
  issuedBy?: string;
  createdAt: string;
}

export interface CompanySettings {
  name: string;
  subtitle: string;
  nif: string;
  address: string;
  addressLine2?: string;
  phone: string;
  email: string;
  instagram?: string;
  logoUrl?: string;
  receiptFooterNote: string;
  updatedAt?: string;
}

export interface RolePermissionsConfig {
  employee: PermissionKey[];
  client: PermissionKey[];
  updatedAt?: string;
}

export interface ClientProfile {
  uid: string;
  displayName?: string;
  email?: string;
  passportNumber?: string;
  nationality?: string;
  address?: string;
  phone?: string;
  dateOfBirth?: string;
}

export interface TravelService {
  id: string;
  name: string;
  subtitle?: string;
  price: number;
  description?: string;
  category?: 'visa' | 'flight' | 'transfer' | 'insurance' | 'hotel' | 'package' | 'other';
  features?: string[];
  imageUrl?: string;
  isTrending?: boolean;
  badgeText?: string;
}

export interface ProcessReminder {
  id: string;
  title: string;
  date: string;
  type: 'embassy' | 'boarding' | 'payment' | 'other';
  description?: string;
  completed?: boolean;
}

export interface ProcessGroupMember {
  id: string;
  fullName: string;
  relationship: 'titular' | 'conjuge' | 'filho' | 'pai_mae' | 'irmao' | 'outro';
  age?: string;
  documentNumber?: string;
  notes?: string;
}

export interface PaymentRecord {
  id: string;
  amount: number;
  method: string;
  date: string;
  note?: string;
  proofDocId?: string;
  recordedBy?: string;
}

export interface AppNotification {
  id: string;
  recipientUid: string;
  recipientName?: string;
  senderUid?: string;
  senderName?: string;
  type:
    | 'advisory_request'
    | 'consultancy_booking'
    | 'process_assigned'
    | 'payment_uploaded'
    | 'task_assigned'
    | 'task_overdue'
    | 'system';
  title: string;
  message: string;
  requestId?: string;
  processId?: string;
  taskId?: string;
  serviceName?: string;
  read: boolean;
  createdAt: string;
}

export interface TaskChecklistItem {
  id: string;
  text: string;
  done: boolean;
}

export interface TaskAttachmentMeta {
  id: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  uploadedBy?: string;
  createdAt: string;
}

export interface TaskAttachmentFile extends TaskAttachmentMeta {
  taskId: string;
  dataUrl: string;
}

export type TaskRepeatInterval =
  | ''
  | '1_week'
  | '2_weeks'
  | '1_month'
  | '2_months'
  | '3_months'
  | '6_months'
  | '1_year';

export type TaskRelatedType = '' | 'process' | 'client' | 'invoice' | 'booking';

export interface StaffTask {
  id: string;
  title: string;
  description?: string;
  status: 'pending' | 'in_progress' | 'waiting' | 'completed';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  isPublic?: boolean;
  billable?: boolean;
  hourlyRate?: number;
  startDate: string; // YYYY-MM-DD
  dueDate: string; // YYYY-MM-DD
  dueTime?: string; // HH:mm
  repeatEvery?: TaskRepeatInterval;
  relatedType?: TaskRelatedType;
  relatedEntityId?: string;
  relatedEntityLabel?: string;
  assignedToUid: string;
  assignedToName: string;
  assigneeUids?: string[];
  assigneeNames?: string[];
  followerUids?: string[];
  followerNames?: string[];
  tags?: string[];
  attachments?: TaskAttachmentMeta[];
  createdByUid: string;
  createdByName: string;
  relatedProcessId?: string;
  relatedProcessLabel?: string;
  checklist?: TaskChecklistItem[];
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface TravelProcess {
  id: string;
  clientUid: string;
  clientName?: string;
  serviceId: string;
  serviceName?: string;
  assignedEmployeeUid?: string;
  assignedEmployeeName?: string;
  status: 'pending' | 'in-review' | 'approved' | 'rejected';
  progress: number;
  paymentType: 'full' | 'installments';
  price?: number;
  unitPrice?: number;
  memberCount?: number;
  isGroupProcess?: boolean;
  groupName?: string;
  groupMembers?: ProcessGroupMember[];
  paidAmount?: number;
  remainingAmount?: number;
  paymentMethod?: string;
  installmentSchedule?: 'half_50_50' | 'custom';
  paymentHistory?: PaymentRecord[];
  paymentStatus: 'pending' | 'partially_paid' | 'paid';
  paymentConfirmed?: boolean;
  paymentConfirmedAt?: string;
  paymentConfirmedBy?: string;
  notes?: string;
  reviewed?: boolean;
  rating?: number;
  recommended?: boolean;
  reminders?: ProcessReminder[];
  dates?: {
    documentPickup?: string;
    appointment?: string;
    travel?: string;
    embassySubmission?: string;
  };
  createdAt: string;
  updatedAt: string;
}

export type DocumentCategory =
  | 'personal'
  | 'travel_print'
  | 'flight_reservation'
  | 'hotel_reservation'
  | 'bank_statement'
  | 'declaration'
  | 'payment_proof'
  | 'agency_issued'
  | 'other';

export interface ProcessDocument {
  id: string;
  processId: string;
  clientUid?: string;
  name: string;
  fileName?: string;
  mimeType?: string;
  fileSize?: number;
  hasFileContent?: boolean;
  isAgencyIssued?: boolean;
  url: string;
  category: DocumentCategory;
  status: 'uploaded' | 'verified' | 'rejected';
  uploadedBy?: string;
  createdAt: string;
}

export interface ConsultantProfile {
  uid: string;
  displayName: string;
  role: UserRole;
  specialty?: string;
  photoURL?: string;
  active?: boolean;
}

export interface AdvisoryRequest {
  id: string;
  clientUid: string;
  clientName: string;
  clientPhone?: string;
  clientEmail?: string;
  type: 'consultoria' | 'assessoria';
  serviceId?: string;
  serviceName?: string;
  employeeUid: string;
  employeeName: string;
  preferredDate?: string;
  preferredTime?: string;
  notes?: string;
  processId?: string;
  status: 'pending' | 'confirmed' | 'completed' | 'cancelled';
  createdAt: string;
}

export interface ServiceReview {
  id: string;
  processId: string;
  clientUid: string;
  clientName: string;
  employeeUid: string;
  employeeName: string;
  serviceId?: string;
  serviceName?: string;
  rating: number;
  recommend: boolean;
  comment?: string;
  createdAt: string;
}

export interface DocumentFilePayload {
  docId: string;
  processId: string;
  clientUid?: string;
  uploadedBy?: string;
  dataUrl: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  createdAt: string;
}

export interface InternalMessage {
  id: string;
  senderUid: string;
  receiverUid: string;
  content: string;
  timestamp: string;
  read?: boolean;
}

export interface FinancialTransaction {
  id: string;
  type: 'income' | 'expense';
  expenseScope?: 'daily' | 'operational' | 'payroll' | 'other';
  category: string;
  amount: number;
  date: string;
  description: string;
  relatedTo?: string;
  status: 'completed' | 'pending' | 'cancelled';
  paymentMethod: string;
  createdAt: string;
}

export interface EmployeeAdvance {
  id: string;
  employeeUid: string;
  employeeName: string;
  amount: number;
  date: string;
  reason: string;
  type: 'loan' | 'advance';
  status: 'pending' | 'approved' | 'rejected' | 'paid';
  repaymentStatus: 'pending' | 'partially_paid' | 'fully_repaid';
  createdAt: string;
}

export interface Invoice {
  id: string;
  processId: string;
  clientUid: string;
  clientName: string;
  clientPhone?: string;
  clientDocument?: string;
  amount: number;
  items: {
    description: string;
    quantity: number;
    price: number;
  }[];
  dueDate: string;
  status: 'draft' | 'pending' | 'paid' | 'overdue' | 'cancelled';
  type?: 'recibo' | 'fatura' | 'fatura_proforma';
  createdAt: string;
}

export interface BookingServiceOption {
  id: string;
  name: string;
  description: string;
  price: number;
  category: 'transfer' | 'flight' | 'vip';
  active?: boolean;
}

export interface TransferBooking {
  id: string;
  clientUid: string;
  clientName?: string;
  tier: string;
  serviceName?: string;
  date: string;
  time: string;
  pickupLocation?: string;
  dropoffLocation?: string;
  status: 'pending' | 'confirmed' | 'completed' | 'cancelled';
  price?: number;
}
