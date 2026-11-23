/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Invoice } from '@/src/types';
import { useCompanySettings } from '@/src/hooks/useCompanySettings';
import { ShieldCheck } from 'lucide-react';

interface InvoiceTemplateProps {
  invoice: Invoice;
  id: string;
  previewMode?: boolean;
}

export function InvoiceTemplate({ invoice, id, previewMode = false }: InvoiceTemplateProps) {
  const { company } = useCompanySettings();

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('pt-AO', { style: 'currency', currency: 'AOA' }).format(val || 0);
  };

  return (
    <div
      id={id}
      className={
        previewMode
          ? 'bg-white text-gray-800 font-sans p-6 w-full max-w-[148.5mm] mx-auto border border-gray-200 rounded-xl shadow-sm select-none relative'
          : 'hidden print:block bg-white text-gray-800 font-sans p-4 w-[148.5mm] min-h-[200mm] mx-auto border-none print:p-6 select-none relative'
      }
    >
      {/* Header with Dynamic Logo and Company Info */}
      <div className="flex justify-between items-start mb-6 gap-4">
        <div className="flex flex-col items-center min-w-[110px]">
          {company.logoUrl ? (
            <img
              src={company.logoUrl}
              alt={company.name}
              referrerPolicy="no-referrer"
              className="w-20 h-20 object-contain mb-2 rounded-lg"
            />
          ) : (
            <div className="w-16 h-16 rounded-2xl bg-teal text-white flex items-center justify-center mb-2 shadow-sm">
              <ShieldCheck className="w-9 h-9" />
            </div>
          )}
          <div className="text-center">
            <h2 className="text-[11px] font-black text-gray-800 tracking-tight leading-none mb-1 uppercase">
              {company.name}
            </h2>
            <p className="text-[6.5px] font-bold text-gray-500 uppercase tracking-wider max-w-[130px] leading-tight">
              {company.subtitle}
            </p>
          </div>
        </div>

        <div className="text-right flex-1 pt-2">
          <h1 className="text-xl font-black text-gray-900 tracking-tight leading-none mb-2 uppercase">
            {company.name}
          </h1>
          <div className="space-y-[2px]">
            <p className="text-[8.5px] font-bold text-gray-600 uppercase tracking-tight">NIF: {company.nif}</p>
            <p className="text-[8.5px] font-bold text-gray-600 tracking-tight">{company.address}</p>
            {company.addressLine2 && (
              <p className="text-[8.5px] font-bold text-gray-600 tracking-tight">{company.addressLine2}</p>
            )}
            <p className="text-[8.5px] font-bold text-gray-600 tracking-tight">Tel: {company.phone}</p>
            {company.email && (
              <p className="text-[8px] font-semibold text-gray-500 tracking-tight">{company.email}</p>
            )}
          </div>
        </div>
      </div>

      {/* Main Info Box */}
      <div className="space-y-[2px] mb-6">
        <div className="flex gap-[2px]">
          <div className="flex items-center flex-1 h-8 bg-white border border-gray-200 overflow-hidden">
            <div className="bg-gray-700 text-white text-[8.5px] font-black uppercase tracking-widest px-3 h-full flex items-center w-32 shrink-0">
              {invoice.type === 'fatura'
                ? 'Factura Nº'
                : invoice.type === 'fatura_proforma'
                ? 'Pró-forma Nº'
                : 'Recibo Nº'}
            </div>
            <div className="px-3 text-[10.5px] font-black tabular-nums">{invoice.id.toUpperCase().substring(0, 8)}</div>
          </div>
          <div className="flex items-center w-44 h-8 bg-white border border-gray-200 overflow-hidden">
            <div className="bg-gray-700 text-white text-[8.5px] font-black uppercase tracking-widest px-3 h-full flex items-center w-16 shrink-0">
              Data
            </div>
            <div className="px-3 text-[10.5px] font-black tabular-nums">
              {new Date(invoice.createdAt).toLocaleDateString('pt-AO')}
            </div>
          </div>
        </div>

        <div className="flex items-center h-8 bg-white border border-gray-200 overflow-hidden">
          <div className="bg-gray-700 text-white text-[8.5px] font-black uppercase tracking-widest px-3 h-full flex items-center w-36 shrink-0">
            Nome / Cliente
          </div>
          <div className="px-3 text-[10.5px] font-black uppercase text-gray-800 truncate">{invoice.clientName}</div>
        </div>

        <div className="flex items-center h-8 bg-white border border-gray-200 overflow-hidden">
          <div className="bg-gray-700 text-white text-[8.5px] font-black uppercase tracking-widest px-3 h-full flex items-center w-36 shrink-0">
            BI / Passaporte
          </div>
          <div className="px-3 text-[10.5px] font-black uppercase text-gray-700">
            {invoice.clientDocument || '---'}
          </div>
        </div>

        <div className="flex items-center h-8 bg-white border border-gray-200 overflow-hidden">
          <div className="bg-gray-700 text-white text-[8.5px] font-black uppercase tracking-widest px-3 h-full flex items-center w-36 shrink-0">
            Telefone
          </div>
          <div className="px-3 text-[10.5px] font-black text-gray-700">{invoice.clientPhone || '---'}</div>
        </div>
      </div>

      {/* Table Headers */}
      <div className="flex bg-gray-700 text-white text-[8.5px] font-black uppercase tracking-widest border border-gray-700">
        <div className="flex-1 px-3 py-2.5 border-r border-white/20">DESCRIÇÕES</div>
        <div className="w-14 px-2 py-2.5 border-r border-white/20 text-center">QTD</div>
        <div className="w-24 px-3 py-2.5 border-r border-white/20 text-right">PREÇO</div>
        <div className="w-28 px-3 py-2.5 text-right">SUBTOTAL</div>
      </div>

      {/* Table Content */}
      <div className="border-x border-b border-gray-200 min-h-[120px] flex flex-col">
        {invoice.items.map((item, idx) => (
          <div key={idx} className="flex border-b border-gray-100 text-[10px] font-bold text-gray-700">
            <div className="flex-1 px-3 py-3 border-r border-gray-100">{item.description}</div>
            <div className="w-14 px-2 py-3 border-r border-gray-100 text-center tabular-nums">{item.quantity}</div>
            <div className="w-24 px-3 py-3 border-r border-gray-100 text-right tabular-nums">
              {formatCurrency(item.price)}
            </div>
            <div className="w-28 px-3 py-3 text-right font-black text-gray-900 tabular-nums">
              {formatCurrency(item.price * item.quantity)}
            </div>
          </div>
        ))}
        {[...Array(Math.max(0, 3 - invoice.items.length))].map((_, i) => (
          <div key={i} className="flex-1 min-h-[32px] border-b border-gray-50 flex">
            <div className="flex-1 border-r border-gray-50" />
            <div className="w-14 border-r border-gray-50" />
            <div className="w-24 border-r border-gray-50" />
            <div className="w-28" />
          </div>
        ))}
      </div>

      {/* Total section */}
      <div className="flex items-center justify-between mt-4 mb-10 gap-4">
        <div className="text-[10px] font-black uppercase tracking-wider px-3 py-1.5 rounded border border-gray-200 bg-gray-50">
          Estado:{' '}
          <span className={invoice.status === 'paid' ? 'text-emerald-700' : 'text-amber-700'}>
            {invoice.status === 'paid' ? 'PAGO' : 'PENDENTE'}
          </span>
        </div>
        <div className="flex items-center h-10 border border-teal overflow-hidden">
          <div className="bg-teal text-white text-[9.5px] font-black uppercase tracking-widest px-5 h-full flex items-center">
            {invoice.status === 'paid' ? 'TOTAL PAGO' : 'TOTAL'}
          </div>
          <div className="px-6 h-full flex items-center text-sm font-black text-gray-900 bg-gray-50 min-w-[150px] justify-end tabular-nums">
            {formatCurrency(invoice.amount)}
          </div>
        </div>
      </div>

      {/* Signatures */}
      <div className="grid grid-cols-2 gap-12 mb-8 px-2">
        <div className="text-center">
          <div className="bg-gray-700 text-white text-[8.5px] font-black uppercase tracking-widest py-1.5 rounded-sm mb-8">
            O Cliente
          </div>
          <div className="border-b border-gray-300 w-full" />
        </div>
        <div className="text-center">
          <div className="bg-gray-700 text-white text-[8.5px] font-black uppercase tracking-widest py-1.5 rounded-sm mb-8">
            O Responsável
          </div>
          <div className="border-b border-gray-300 w-full" />
        </div>
      </div>

      {/* Footer Note */}
      <div className="border-t border-gray-100 pt-3">
        <p className="text-[7.5px] text-gray-500 italic leading-relaxed text-center px-4">
          {company.receiptFooterNote}
        </p>
      </div>

      <style>{`
        @media print {
          body {
            margin: 0;
            padding: 0;
            background: white !important;
          }
          body * {
            visibility: hidden;
          }
          #${id}, #${id} * {
            visibility: visible;
          }
          #${id} {
            display: block !important;
            position: fixed;
            left: 0;
            top: 0;
            width: 148.5mm;
            min-height: 205mm;
            padding: 8mm;
            margin: 0;
            border: none !important;
            box-shadow: none !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            background: white !important;
            z-index: 9999;
          }
          @page {
            size: A5 portrait;
            margin: 0;
          }
        }
      `}</style>
    </div>
  );
}
