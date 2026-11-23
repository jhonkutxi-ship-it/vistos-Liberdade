/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { jsPDF } from 'jspdf';
import { CompanySettings, EmployeePayslip, FinancialTransaction, Invoice, TravelProcess } from '@/src/types';
import { PROCESS_STATUSES } from '@/src/constants';

const formatCurrencyText = (val: number) => {
  return new Intl.NumberFormat('pt-AO', { style: 'currency', currency: 'AOA' }).format(val || 0);
};

export function generateInvoicePDF(invoice: Invoice, company: CompanySettings) {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a5',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  let y = 12;

  // Company Logo if available
  if (company.logoUrl && company.logoUrl.startsWith('data:image/')) {
    try {
      const format = company.logoUrl.includes('image/png') ? 'PNG' : 'JPEG';
      doc.addImage(company.logoUrl, format, 12, y, 22, 22);
    } catch (err) {
      console.warn('Could not embed logo in PDF:', err);
    }
  } else {
    // Draw clean geometric emblem
    doc.setFillColor(11, 123, 107);
    doc.roundedRect(12, y, 18, 18, 3, 3, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text(company.name.slice(0, 2).toUpperCase(), 21, y + 11, { align: 'center' });
  }

  // Company Header Info (Right aligned)
  doc.setTextColor(17, 24, 39);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text(company.name.toUpperCase(), pageWidth - 12, y + 5, { align: 'right' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(90, 95, 105);
  doc.text(company.subtitle || '', pageWidth - 12, y + 9.5, { align: 'right' });
  doc.text(`NIF: ${company.nif}`, pageWidth - 12, y + 13.5, { align: 'right' });
  doc.text(`${company.address}${company.addressLine2 ? ' · ' + company.addressLine2 : ''}`, pageWidth - 12, y + 17.5, { align: 'right' });
  doc.text(`Tel: ${company.phone}`, pageWidth - 12, y + 21.5, { align: 'right' });

  y += 28;
  doc.setDrawColor(225, 229, 234);
  doc.line(12, y, pageWidth - 12, y);
  y += 6;

  // Document Type & Date
  const docLabel =
    invoice.type === 'fatura'
      ? 'FACTURA Nº'
      : invoice.type === 'fatura_proforma'
      ? 'FACTURA PRÓ-FORMA Nº'
      : 'RECIBO Nº';

  doc.setFillColor(55, 65, 81);
  doc.rect(12, y, 36, 7, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.text(docLabel, 14, y + 4.7);

  doc.setDrawColor(229, 231, 235);
  doc.rect(48, y, 42, 7, 'S');
  doc.setTextColor(17, 24, 39);
  doc.setFontSize(8.5);
  doc.text(invoice.id.toUpperCase().substring(0, 10), 50, y + 4.7);

  doc.setFillColor(55, 65, 81);
  doc.rect(94, y, 16, 7, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(7.5);
  doc.text('DATA', 96, y + 4.7);

  doc.rect(110, y, pageWidth - 122, 7, 'S');
  doc.setTextColor(17, 24, 39);
  doc.setFontSize(8);
  doc.text(new Date(invoice.createdAt).toLocaleDateString('pt-AO'), 112, y + 4.7);

  y += 9;

  // Client Rows
  const drawInfoRow = (label: string, value: string) => {
    doc.setFillColor(55, 65, 81);
    doc.rect(12, y, 36, 6.8, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.text(label, 14, y + 4.5);

    doc.setDrawColor(229, 231, 235);
    doc.rect(48, y, pageWidth - 60, 6.8, 'S');
    doc.setTextColor(31, 41, 55);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.text(value || '---', 50, y + 4.5);
    y += 7.8;
  };

  drawInfoRow('NOME / CLIENTE', (invoice.clientName || 'Cliente').toUpperCase());
  drawInfoRow('BI / PASSAPORTE', (invoice.clientDocument || '---').toUpperCase());
  drawInfoRow('TELEFONE', invoice.clientPhone || '---');

  y += 4;

  // Table Header
  doc.setFillColor(55, 65, 81);
  doc.rect(12, y, pageWidth - 24, 7.5, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.text('DESCRIÇÕES', 14, y + 5);
  doc.text('QTD', 84, y + 5, { align: 'center' });
  doc.text('PREÇO', 107, y + 5, { align: 'right' });
  doc.text('SUBTOTAL', pageWidth - 14, y + 5, { align: 'right' });
  y += 7.5;

  // Table Items
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(55, 65, 81);
  doc.setFontSize(8);
  invoice.items.forEach((item) => {
    doc.setDrawColor(229, 231, 235);
    doc.rect(12, y, pageWidth - 24, 9, 'S');
    const descLines = doc.splitTextToSize(item.description, 62);
    doc.text(descLines[0] || item.description, 14, y + 5.5);
    doc.text(String(item.quantity), 84, y + 5.5, { align: 'center' });
    doc.text(formatCurrencyText(item.price), 107, y + 5.5, { align: 'right' });
    doc.setFont('helvetica', 'bold');
    doc.text(formatCurrencyText(item.price * item.quantity), pageWidth - 14, y + 5.5, { align: 'right' });
    doc.setFont('helvetica', 'normal');
    y += 9;
  });

  // Pad at least 2 empty rows
  const emptyRows = Math.max(0, 3 - invoice.items.length);
  for (let i = 0; i < emptyRows; i++) {
    doc.setDrawColor(243, 244, 246);
    doc.rect(12, y, pageWidth - 24, 8, 'S');
    y += 8;
  }

  y += 6;

  // Total Box
  const totalBoxWidth = 76;
  const totalStartX = pageWidth - 12 - totalBoxWidth;
  doc.setFillColor(11, 123, 107);
  doc.rect(totalStartX, y, 32, 9, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text(invoice.status === 'paid' ? 'TOTAL PAGO' : 'TOTAL A PAGAR', totalStartX + 16, y + 5.8, { align: 'center' });

  doc.setFillColor(249, 250, 251);
  doc.setDrawColor(11, 123, 107);
  doc.rect(totalStartX + 32, y, totalBoxWidth - 32, 9, 'FD');
  doc.setTextColor(17, 24, 39);
  doc.setFontSize(9.5);
  doc.text(formatCurrencyText(invoice.amount), pageWidth - 14, y + 5.8, { align: 'right' });

  y += 22;

  // Signatures
  doc.setFillColor(55, 65, 81);
  doc.rect(16, y, 48, 6, 'F');
  doc.rect(pageWidth - 64, y, 48, 6, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(7.5);
  doc.text('O CLIENTE', 40, y + 4.2, { align: 'center' });
  doc.text('O RESPONSÁVEL', pageWidth - 40, y + 4.2, { align: 'center' });

  doc.setDrawColor(156, 163, 175);
  doc.line(16, y + 16, 64, y + 16);
  doc.line(pageWidth - 64, y + 16, pageWidth - 16, y + 16);

  // Footer note
  const footerY = 186;
  doc.setDrawColor(229, 231, 235);
  doc.line(12, footerY - 3, pageWidth - 12, footerY - 3);
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(6.8);
  doc.setTextColor(107, 114, 128);
  const noteLines = doc.splitTextToSize(company.receiptFooterNote || '', pageWidth - 28);
  doc.text(noteLines, pageWidth / 2, footerY + 1, { align: 'center' });

  const safeClient = (invoice.clientName || 'cliente').replace(/[^a-zA-Z0-9]/g, '_');
  const fileName = `${invoice.type || 'recibo'}_${safeClient}_${invoice.id.substring(0, 6)}.pdf`;
  doc.save(fileName);
}

export function buildWhatsAppReceiptText(invoice: Invoice, company: CompanySettings): string {
  const docTitle =
    invoice.type === 'fatura'
      ? 'Factura Comercial'
      : invoice.type === 'fatura_proforma'
      ? 'Factura Pró-forma'
      : 'Recibo de Pagamento';
  const statusLabel = invoice.status === 'paid' ? 'PAGO' : 'PENDENTE';
  const itemsText = invoice.items
    .map((item) => `• ${item.description} (${item.quantity}x) — ${formatCurrencyText(item.price * item.quantity)}`)
    .join('\n');

  return [
    `*${company.name.toUpperCase()}*`,
    `NIF: ${company.nif} | ${company.address}`,
    `━━━━━━━━━━━━━━━━━━━━`,
    `*${docTitle} Nº:* ${invoice.id.toUpperCase().substring(0, 8)}`,
    `*Data:* ${new Date(invoice.createdAt).toLocaleDateString('pt-AO')}`,
    `*Cliente:* ${invoice.clientName}`,
    invoice.clientDocument ? `*BI/Passaporte:* ${invoice.clientDocument}` : '',
    `━━━━━━━━━━━━━━━━━━━━`,
    `*Serviços:*`,
    itemsText,
    `━━━━━━━━━━━━━━━━━━━━`,
    `*Total:* ${formatCurrencyText(invoice.amount)}`,
    `*Estado:* ${statusLabel}`,
    ``,
    `Obrigado pela preferência!`,
    `Tel: ${company.phone}`,
  ]
    .filter(Boolean)
    .join('\n');
}

export interface ReportExportPayload {
  periodLabel: string;
  totalRevenue: number;
  totalExpenses: number;
  netBalance: number;
  pendingRevenue: number;
  totalClients: number;
  processes: TravelProcess[];
  transactions: FinancialTransaction[];
}

export function generateReportPDF(payload: ReportExportPayload, company: CompanySettings) {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  let y = 14;

  // Header
  doc.setFillColor(11, 123, 107);
  doc.rect(0, 0, pageWidth, 28, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text(company.name.toUpperCase(), 14, 12);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(`Relatório Executivo · ${payload.periodLabel}`, 14, 18);
  doc.setFontSize(8);
  doc.text(`NIF: ${company.nif} | Gerado em ${new Date().toLocaleDateString('pt-AO')}`, pageWidth - 14, 15, {
    align: 'right',
  });

  y = 36;

  // KPI Grid
  const kpis = [
    { label: 'RECEITA PAGA', value: formatCurrencyText(payload.totalRevenue) },
    { label: 'DESPESAS', value: formatCurrencyText(payload.totalExpenses) },
    { label: 'SALDO LÍQUIDO', value: formatCurrencyText(payload.netBalance) },
    { label: 'PROCESSOS', value: `${payload.processes.length} registos` },
  ];

  const cardW = (pageWidth - 28 - 9) / 4;
  kpis.forEach((k, idx) => {
    const x = 14 + idx * (cardW + 3);
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(x, y, cardW, 18, 2, 2, 'FD');
    doc.setTextColor(100, 116, 139);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.text(k.label, x + 3, y + 6);
    doc.setTextColor(15, 23, 42);
    doc.setFontSize(9.5);
    doc.text(k.value, x + 3, y + 13.5);
  });

  y += 26;

  // Section 1: Processes Summary
  doc.setTextColor(11, 123, 107);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('Resumo de Processos de Vistos', 14, y);
  y += 5;

  doc.setFillColor(241, 245, 249);
  doc.rect(14, y, pageWidth - 28, 7, 'F');
  doc.setTextColor(51, 65, 85);
  doc.setFontSize(7.5);
  doc.text('CLIENTE', 16, y + 4.8);
  doc.text('SERVIÇO', 68, y + 4.8);
  doc.text('ESTADO', 132, y + 4.8);
  doc.text('VALOR', pageWidth - 16, y + 4.8, { align: 'right' });
  y += 7;

  doc.setFont('helvetica', 'normal');
  payload.processes.slice(0, 25).forEach((p) => {
    if (y > 270) {
      doc.addPage();
      y = 16;
    }
    const statusLabel = PROCESS_STATUSES.find((s) => s.id === p.status)?.label || p.status;
    doc.setDrawColor(241, 245, 249);
    doc.line(14, y + 6.5, pageWidth - 14, y + 6.5);
    doc.setTextColor(30, 41, 59);
    doc.text((p.clientName || 'Cliente').substring(0, 26), 16, y + 4.5);
    doc.text((p.serviceName || 'Serviço').substring(0, 32), 68, y + 4.5);
    doc.text(statusLabel, 132, y + 4.5);
    doc.text(formatCurrencyText(p.price || 0), pageWidth - 16, y + 4.5, { align: 'right' });
    y += 7;
  });

  if (payload.processes.length === 0) {
    doc.setTextColor(148, 163, 184);
    doc.text('Sem processos registados neste período.', 16, y + 6);
    y += 10;
  }

  y += 8;
  if (y > 250) {
    doc.addPage();
    y = 16;
  }

  // Section 2: Financial Transactions
  doc.setTextColor(11, 123, 107);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('Movimentos Financeiros Recentes', 14, y);
  y += 5;

  doc.setFillColor(241, 245, 249);
  doc.rect(14, y, pageWidth - 28, 7, 'F');
  doc.setTextColor(51, 65, 85);
  doc.setFontSize(7.5);
  doc.text('DATA', 16, y + 4.8);
  doc.text('TIPO', 40, y + 4.8);
  doc.text('DESCRIÇÃO', 62, y + 4.8);
  doc.text('VALOR', pageWidth - 16, y + 4.8, { align: 'right' });
  y += 7;

  doc.setFont('helvetica', 'normal');
  payload.transactions.slice(0, 25).forEach((t) => {
    if (y > 275) {
      doc.addPage();
      y = 16;
    }
    doc.setDrawColor(241, 245, 249);
    doc.line(14, y + 6.5, pageWidth - 14, y + 6.5);
    doc.setTextColor(30, 41, 59);
    doc.text(t.date || '', 16, y + 4.5);
    doc.text(t.type === 'income' ? 'Entrada' : 'Saída', 40, y + 4.5);
    doc.text((t.description || '').substring(0, 46), 62, y + 4.5);
    doc.text(
      `${t.type === 'income' ? '+' : '-'} ${formatCurrencyText(t.amount)}`,
      pageWidth - 16,
      y + 4.5,
      { align: 'right' }
    );
    y += 7;
  });

  doc.save(`Relatorio_${company.name.replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.pdf`);
}

export function generatePayslipPDF(payslip: EmployeePayslip, company: CompanySettings) {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  let y = 16;

  // Header band
  doc.setFillColor(11, 123, 107);
  doc.rect(0, 0, pageWidth, 32, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text(company.name.toUpperCase(), 14, 13);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text('RECIBO DE VENCIMENTO / PAGAMENTO DE SALÁRIO', 14, 20);
  doc.text(`NIF: ${company.nif} · ${company.address}`, 14, 26);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text(`Ref: ${payslip.referenceMonth}`, pageWidth - 14, 15, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(`Emitido: ${new Date(payslip.createdAt).toLocaleDateString('pt-AO')}`, pageWidth - 14, 22, { align: 'right' });

  y = 44;

  // Employee Info Box
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(14, y, pageWidth - 28, 30, 2, 2, 'FD');

  doc.setTextColor(100, 116, 139);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.text('COLABORADOR', 18, y + 7);
  doc.text('CARGO / FUNÇÃO', 108, y + 7);
  doc.text('CÓD. EQUIPA', 18, y + 19);
  doc.text('BI / IDENTIFICAÇÃO', 68, y + 19);
  doc.text('IBAN / CONTA', 120, y + 19);

  doc.setTextColor(15, 23, 42);
  doc.setFontSize(9.5);
  doc.text(payslip.employeeName || '---', 18, y + 12.5);
  doc.text(payslip.jobTitle || 'Colaborador', 108, y + 12.5);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.text(payslip.staffCode || '---', 18, y + 24.5);
  doc.text(payslip.idNumber || '---', 68, y + 24.5);
  doc.text(payslip.iban || '---', 120, y + 24.5);

  y += 40;

  // Breakdown Table
  doc.setFillColor(11, 123, 107);
  doc.rect(14, y, pageWidth - 28, 8, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.text('DESCRIÇÃO DA REMUNERAÇÃO', 18, y + 5.3);
  doc.text('TIPO', 122, y + 5.3);
  doc.text('VALOR (AOA)', pageWidth - 18, y + 5.3, { align: 'right' });
  y += 8;

  const rows = [
    { label: 'Salário Base Mensal', kind: 'Abono', val: payslip.baseSalary || 0, sign: '+' },
    { label: 'Subsídios (Transporte / Alimentação / Outros)', kind: 'Abono', val: payslip.allowances || 0, sign: '+' },
    { label: 'Prémios / Bónus / Horas Extras', kind: 'Abono', val: payslip.bonus || 0, sign: '+' },
    { label: 'Descontos / Adiantamentos / Retenções', kind: 'Dedução', val: payslip.deductions || 0, sign: '-' },
  ];

  rows.forEach((r) => {
    doc.setDrawColor(226, 232, 240);
    doc.rect(14, y, pageWidth - 28, 9.5, 'S');
    doc.setTextColor(30, 41, 59);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text(r.label, 18, y + 6);
    doc.setTextColor(100, 116, 139);
    doc.text(r.kind, 122, y + 6);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(r.sign === '-' && r.val > 0 ? 220 : 15, r.sign === '-' && r.val > 0 ? 38 : 23, r.sign === '-' && r.val > 0 ? 38 : 42);
    doc.text(`${r.sign} ${formatCurrencyText(r.val)}`, pageWidth - 18, y + 6, { align: 'right' });
    y += 9.5;
  });

  y += 8;

  // Net Salary Box
  doc.setFillColor(240, 253, 250);
  doc.setDrawColor(11, 123, 107);
  doc.roundedRect(pageWidth - 96, y, 82, 16, 2, 2, 'FD');
  doc.setTextColor(11, 123, 107);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text('LÍQUIDO A RECEBER', pageWidth - 92, y + 6);
  doc.setFontSize(12);
  doc.setTextColor(15, 23, 42);
  doc.text(formatCurrencyText(payslip.netSalary), pageWidth - 18, y + 12.5, { align: 'right' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(71, 85, 105);
  doc.text(`Forma de Pagamento: ${payslip.paymentMethod || 'Transferência Bancária'}`, 14, y + 6);
  doc.text(`Estado: ${payslip.status === 'paid' ? 'PAGO' : 'PENDENTE'}`, 14, y + 12);

  if (payslip.notes) {
    y += 24;
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text(`Observações: ${payslip.notes}`, 14, y);
  }

  y += 34;
  doc.setDrawColor(148, 163, 184);
  doc.line(20, y, 86, y);
  doc.line(pageWidth - 86, y, pageWidth - 20, y);
  doc.setFontSize(8);
  doc.setTextColor(71, 85, 105);
  doc.text('Assinatura da Entidade Empregadora', 53, y + 5, { align: 'center' });
  doc.text('Assinatura do Colaborador', pageWidth - 53, y + 5, { align: 'center' });

  doc.save(`Recibo_Salario_${(payslip.employeeName || 'funcionario').replace(/\s+/g, '_')}_${payslip.referenceMonth}.pdf`);
}
