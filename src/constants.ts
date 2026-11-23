/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { CompanySettings, DocumentCategory, PermissionKey, RolePermissionsConfig } from './types';

export const PRICING = {
  STUDENT_VISA: 2500000,
  TRAINING: 2500000,
  SCHENGEN: 800000,
  WORK_VISA: 3500000,
  HEALTH: 2500000,
};

export const TRANSFER_TIERS = [
  {
    id: 'standard',
    name: 'Transfer Standard',
    description: 'Sedan executivo económico para até 3 passageiros',
    price: 15000,
    category: 'transfer' as const,
  },
  {
    id: 'premium',
    name: 'Transfer Premium',
    description: 'Sedan executivo de luxo com Wi-Fi para até 3 passageiros',
    price: 35000,
    category: 'transfer' as const,
  },
  {
    id: 'luxury',
    name: 'SUV VIP Executivo',
    description: 'SUV de alto padrão para até 4 passageiros',
    price: 65000,
    category: 'vip' as const,
  },
  {
    id: 'group',
    name: 'Van de Grupo',
    description: 'Carrinha espaçosa para famílias até 8 passageiros',
    price: 85000,
    category: 'transfer' as const,
  },
  {
    id: 'ticket-emission',
    name: 'Emissão / Reserva de Bilhete Aéreo',
    description: 'Cotação, reserva de voo e bilhética nacional ou internacional',
    price: 45000,
    category: 'flight' as const,
  },
];

export const PROCESS_STATUSES = [
  { id: 'pending', label: 'Pendente', color: 'bg-yellow-50 text-yellow-600' },
  { id: 'in-review', label: 'Em Revisão', color: 'bg-teal-light text-teal' },
  { id: 'approved', label: 'Aprovado', color: 'bg-green-50 text-green-600' },
  { id: 'rejected', label: 'Rejeitado', color: 'bg-red-50 text-red-600' },
];

export const ROLES = {
  CLIENT: 'client',
  EMPLOYEE: 'employee',
  ADMIN: 'admin',
};

export const AGENCY_INFO = {
  name: 'Vistos Liberdade',
  location: 'Vila de Viana, junto ao Banco BIC',
  whatsapp: '+244 929 115 055',
  email: 'contato@vistosliberdade.com',
  instagram: '@vistosliberdade',
};

export const DEFAULT_COMPANY_SETTINGS: CompanySettings = {
  name: 'Vistos Liberdade',
  subtitle: 'Assessoria, Preparação e Solicitação de Vistos',
  nif: '003609187KN039',
  address: 'Viana, Casa da Juventude',
  addressLine2: 'Próximo ao Banco BIC · Luanda, Angola',
  phone: '+244 929 115 055 / +244 950 402 390',
  email: 'contato@vistosliberdade.com',
  instagram: '@vistosliberdade',
  logoUrl: '',
  receiptFooterNote:
    'Nota: Ao solicitar os nossos serviços, o cliente estará sujeito a cumprir com os critérios internos no tratamento do processo. Após o pagamento, se o cliente solicitar o cancelamento do processo antes do tempo estabelecido, será taxado 25% do valor pago.',
};

export const ALL_PERMISSIONS: { key: PermissionKey; label: string; description: string; group: string }[] = [
  { key: 'view_dashboard', label: 'Ver Painel Geral', description: 'Aceder ao dashboard principal', group: 'Geral' },
  { key: 'manage_processes', label: 'Gerir Processos', description: 'Criar, editar datas e acompanhar processos de vistos', group: 'Operacional' },
  { key: 'approve_processes', label: 'Aprovar / Finalizar Processos', description: 'Alterar estado final para Aprovado ou Rejeitado', group: 'Operacional' },
  { key: 'manage_documents', label: 'Carregar & Baixar Documentos', description: 'Anexar, visualizar e descarregar anexos dos processos', group: 'Documentos' },
  { key: 'validate_documents', label: 'Validar / Rejeitar Documentos', description: 'Aprovar ou recusar documentos submetidos', group: 'Documentos' },
  { key: 'manage_clients', label: 'Gerir Clientes (CRM)', description: 'Registar e editar fichas de clientes', group: 'Clientes' },
  { key: 'manage_finances', label: 'Finanças & Fluxo de Caixa', description: 'Ver e registar entradas, saídas e empréstimos', group: 'Financeiro' },
  { key: 'issue_receipts', label: 'Emitir Recibos & Faturas', description: 'Criar, imprimir, exportar PDF e enviar recibos via WhatsApp', group: 'Financeiro' },
  { key: 'manage_services', label: 'Serviços Públicos (Planos & Pacotes)', description: 'Criar e editar planos, pacotes, serviços em alta e tarifas públicas', group: 'Catálogo' },
  { key: 'view_reports', label: 'Gerar & Exportar Relatórios', description: 'Consultar analytics e exportar relatórios PDF/CSV', group: 'Análise' },
  { key: 'manage_employees', label: 'RH & Funcionários', description: 'Gerir perfis de RH, documentos, salários, recibos e acessos', group: 'Administração' },
  { key: 'manage_tasks', label: 'Gerir Tarefas & Prazos', description: 'Criar, atribuir e acompanhar tarefas e alertas de prazos', group: 'Operacional' },
  { key: 'manage_settings', label: 'Configurações & Permissões', description: 'Alterar dados da empresa, logo, NIF e gerir acessos', group: 'Administração' },
];

export const DEFAULT_ROLE_PERMISSIONS: RolePermissionsConfig = {
  employee: [
    'view_dashboard',
    'manage_processes',
    'approve_processes',
    'manage_documents',
    'validate_documents',
    'manage_clients',
    'issue_receipts',
    'manage_services',
    'manage_tasks',
    'view_reports',
  ],
  client: ['view_dashboard', 'manage_documents'],
};

export const HR_DEPARTMENTS = [
  'Administrativo',
  'Atendimento & Vistos',
  'Operações & Consular',
  'Financeiro & Faturação',
  'Recursos Humanos',
  'Comercial & Marketing',
] as const;

export const EXPENSE_CATEGORIES = [
  'Alimentação / Refeições',
  'Transporte / Combustível',
  'Taxas Consulares',
  'Material de Escritório',
  'Renda / Instalações',
  'Energia / Água / Internet',
  'Salários & Subsídios',
  'Comissões / Parceiros',
  'Outras Despesas',
] as const;

export const DOCUMENT_CATEGORIES: { id: DocumentCategory; label: string }[] = [
  { id: 'personal', label: 'Documentos Pessoais' },
  { id: 'travel_print', label: 'Print de Viagem' },
  { id: 'flight_reservation', label: 'Reserva de Voo' },
  { id: 'hotel_reservation', label: 'Reserva de Hotel' },
  { id: 'bank_statement', label: 'Extratos Bancários' },
  { id: 'declaration', label: 'Declarações' },
  { id: 'payment_proof', label: 'Comprovativo Pagamento' },
  { id: 'agency_issued', label: 'Emitido pela Agência' },
  { id: 'other', label: 'Outros Documentos' },
];

export interface TrendingServiceCampaign {
  id: string;
  title: string;
  subtitle: string;
  category: 'visa' | 'package' | 'other';
  badgeText: string;
  price: number;
  imageUrl: string;
  description: string;
  highlights: string[];
  requirements: string[];
}

export const TRENDING_PROMO_SERVICES: TrendingServiceCampaign[] = [
  {
    id: 'trending-bolsa-portugal-jovem',
    title: 'Bolsa de Estudo Ensino Médio · Portugal',
    subtitle: 'Programa Juvenil (14 aos 19 anos)',
    category: 'package',
    badgeText: 'Em Alta · Vagas Limitadas',
    price: 2500000,
    imageUrl: '/assets/aistudio/Bolsa_de_estudo_em_Portugal__1__ee9a99de.jpg',
    description:
      'Bolsa de estudo completa para o ensino médio em Portugal incluindo estadia, alimentação, formação, deslocação e material didático.',
    highlights: ['Estadia & Alojamento', 'Alimentação Completa', 'Formação e Deslocação', 'Material Didático'],
    requirements: ['Passaporte Válido', 'Cópia do BI', 'Duas Fotos Tipo Passe', 'Certificado Reconhecido'],
  },
  {
    id: 'trending-bolsa-portugal-completa',
    title: 'Bolsas de Estudo em Portugal · Ensino Médio',
    subtitle: 'Estuda, Vive e Conquista o Teu Futuro',
    category: 'visa',
    badgeText: 'Mais Procurado',
    price: 2500000,
    imageUrl: '/assets/aistudio/Bolsas_de_Estudo_em_Portugal_3e133031.jpg',
    description:
      'Assessoria integral para candidatura a bolsas em escolas reconhecidas em Portugal com alojamento garantido, segurança e preparação universitária.',
    highlights: [
      'Ensino de Qualidade Reconhecido',
      'Segurança e Estabilidade',
      'Alojamento Garantido',
      'Experiência Internacional',
    ],
    requirements: ['Passaporte', 'Cópia do BI', 'Duas Fotos Tipo Passe', 'Certificado Reconhecido'],
  },
  {
    id: 'trending-visto-trabalho',
    title: 'Visto de Trabalho Internacional',
    subtitle: 'Processo Ágil, Seguro e Confiável',
    category: 'visa',
    badgeText: 'Alta Procura · Europa',
    price: 3500000,
    imageUrl: '/assets/aistudio/Cartaz_de_Visto_de_Trabalho_Azul_07908a42.jpg',
    description:
      'Trabalhe legalmente no exterior com acompanhamento jurídico e consular completo para acesso às melhores vagas e mobilidade profissional.',
    highlights: [
      'Trabalho Legalizado e Seguro',
      'Melhores Oportunidades Salariais',
      'Desenvolvimento Profissional',
      'Acompanhamento até Embarque',
    ],
    requirements: ['Passaporte Válido', 'Cópia do BI', 'Duas Fotografias', 'Registo Criminal'],
  },
];

export const PAYMENT_METHODS = [
  'Transferência Bancária',
  'Multicaixa Express / TPA',
  'Dinheiro (Balcão)',
  'Depósito Bancário',
  'Outro',
] as const;

export const FAMILY_RELATIONSHIPS = [
  { id: 'titular', label: 'Titular (Adulto)' },
  { id: 'conjuge', label: 'Cônjuge' },
  { id: 'filho', label: 'Filho(a) / Dependente' },
  { id: 'pai_mae', label: 'Pai / Mãe' },
  { id: 'irmao', label: 'Irmão / Irmã' },
  { id: 'outro', label: 'Outro Familiar' },
] as const;

