/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import { doc, updateDoc, addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db, OperationType, handleFirestoreError } from '@/src/firebase';
import { Invoice } from '@/src/types';
import { useCompanySettings } from '@/src/hooks/useCompanySettings';
import { InvoiceTemplate } from '@/src/components/InvoiceTemplate';
import { Button } from '@/src/components/ui/Button';
import { Input } from '@/src/components/ui/Input';
import { generateInvoicePDF, buildWhatsAppReceiptText } from '@/src/utils/pdfGenerator';
import {
  X,
  Printer,
  Download,
  MessageCircle,
  CheckCircle2,
  Copy,
  Check,
  Loader2,
  Phone,
} from 'lucide-react';

interface ReceiptModalProps {
  invoice: Invoice | null;
  onClose: () => void;
  onUpdated?: (updated: Invoice) => void;
  clientReadOnly?: boolean;
}

export function ReceiptModal({ invoice, onClose, onUpdated, clientReadOnly = false }: ReceiptModalProps) {
  const { company } = useCompanySettings();
  const [localInvoice, setLocalInvoice] = useState<Invoice | null>(invoice);
  const [whatsappPhone, setWhatsappPhone] = useState(
    clientReadOnly ? company.phone.split('/')[0].trim() : invoice?.clientPhone || ''
  );
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setLocalInvoice(invoice);
    setWhatsappPhone(
      clientReadOnly ? company.phone.split('/')[0].trim() : invoice?.clientPhone || ''
    );
  }, [invoice, clientReadOnly, company.phone]);

  if (!localInvoice) return null;

  const handleMarkAsPaid = async () => {
    if (clientReadOnly || localInvoice.status === 'paid') return;
    setSaving(true);
    try {
      await updateDoc(doc(db, 'invoices', localInvoice.id), {
        status: 'paid',
        type: 'recibo',
      });

      if (localInvoice.processId && localInvoice.processId !== 'manual') {
        await updateDoc(doc(db, 'processes', localInvoice.processId), {
          paymentStatus: 'paid',
          paymentConfirmed: true,
          paymentConfirmedAt: new Date().toISOString(),
          updatedAt: serverTimestamp(),
        });
      }

      await addDoc(collection(db, 'financial_transactions'), {
        type: 'income',
        category: 'Recibo / Processo',
        amount: localInvoice.amount,
        date: new Date().toISOString().slice(0, 10),
        description: `RECIBO: ${localInvoice.clientName} (${localInvoice.items[0]?.description || 'Serviço'})`,
        relatedTo: localInvoice.processId,
        status: 'completed',
        paymentMethod: 'Caixa/Transferência',
        createdAt: new Date().toISOString(),
      });

      const updated: Invoice = { ...localInvoice, status: 'paid', type: 'recibo' };
      setLocalInvoice(updated);
      onUpdated?.(updated);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `invoices/${localInvoice.id}`);
    } finally {
      setSaving(false);
    }
  };

  const handleChangeDocType = async (nextType: 'recibo' | 'fatura' | 'fatura_proforma') => {
    if (clientReadOnly) return;
    setSaving(true);
    try {
      await updateDoc(doc(db, 'invoices', localInvoice.id), { type: nextType });
      const updated = { ...localInvoice, type: nextType };
      setLocalInvoice(updated);
      onUpdated?.(updated);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `invoices/${localInvoice.id}`);
    } finally {
      setSaving(false);
    }
  };

  const handlePrint = () => {
    setTimeout(() => {
      window.print();
    }, 150);
  };

  const handleDownloadPDF = () => {
    generateInvoicePDF(localInvoice, company);
  };

  const handleSendWhatsApp = () => {
    const baseText = buildWhatsAppReceiptText(localInvoice, company);
    const text = clientReadOnly
      ? `${baseText}\n\nOlá equipa ${company.name}, envio o comprovativo/referência referente a esta fatura/recibo.`
      : baseText;
    const cleaned = whatsappPhone.replace(/[^\d]/g, '');
    const url = cleaned
      ? `https://wa.me/${cleaned.startsWith('244') ? cleaned : cleaned.length === 9 ? '244' + cleaned : cleaned}?text=${encodeURIComponent(text)}`
      : `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const handleCopyText = async () => {
    const text = buildWhatsAppReceiptText(localInvoice, company);
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden border border-gray-200">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-white">
          <div>
            <h3 className="text-lg font-bold text-gray-900">
              {clientReadOnly ? 'Fatura, Recibo & Envio de Comprovativo' : 'Emissão e Partilha de Comprovativo'}
            </h3>
            <p className="text-xs text-gray-500">
              {clientReadOnly
                ? 'Consulte a sua fatura/recibo, guarde em PDF ou envie o comprovativo diretamente via WhatsApp.'
                : 'Imprima, guarde em PDF ou envie os detalhes diretamente para o WhatsApp do cliente.'}
            </p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} className="rounded-full">
            <X className="w-5 h-5" />
          </Button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto grid grid-cols-1 lg:grid-cols-12 bg-gray-50">
          {/* Left: Live Receipt Preview */}
          <div className="lg:col-span-7 p-6 overflow-y-auto flex justify-center">
            <InvoiceTemplate invoice={localInvoice} id="modal-printable-invoice" previewMode />
          </div>

          {/* Right: Actions Panel */}
          <div className="lg:col-span-5 p-6 bg-white border-l border-gray-100 space-y-6">
            {!clientReadOnly && (
              <div className="space-y-2">
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Tipo de Documento</label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'recibo', label: 'Recibo' },
                    { id: 'fatura', label: 'Factura' },
                    { id: 'fatura_proforma', label: 'Pró-forma' },
                  ].map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      disabled={saving}
                      onClick={() => handleChangeDocType(item.id as any)}
                      className={`py-2 px-3 rounded-lg text-xs font-bold border transition-all ${
                        (localInvoice.type || 'recibo') === item.id
                          ? 'bg-teal text-white border-teal'
                          : 'bg-gray-50 text-gray-600 border-gray-200 hover:border-teal'
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {!clientReadOnly && localInvoice.status !== 'paid' && (
              <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 space-y-3">
                <p className="text-xs font-semibold text-amber-800">
                  Este documento está marcado como pendente. Confirme o pagamento para registar no caixa.
                </p>
                <Button
                  onClick={handleMarkAsPaid}
                  disabled={saving}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white gap-2"
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                  Confirmar Pagamento e Emitir Recibo
                </Button>
              </div>
            )}

            <div className="space-y-3">
              <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Impressão e Ficheiro</label>
              <div className="grid grid-cols-2 gap-3">
                <Button
                  type="button"
                  onClick={handlePrint}
                  variant="outline"
                  className="h-11 gap-2 border-gray-200 font-bold"
                >
                  <Printer className="w-4 h-4 text-teal" />
                  Imprimir
                </Button>
                <Button
                  type="button"
                  onClick={handleDownloadPDF}
                  className="h-11 gap-2 bg-teal hover:bg-teal-dark text-white font-bold"
                >
                  <Download className="w-4 h-4" />
                  Guardar PDF
                </Button>
              </div>
            </div>

            <div className="pt-4 border-t border-gray-100 space-y-3">
              <label className="text-xs font-bold text-gray-500 uppercase tracking-wider flex items-center gap-1.5">
                <MessageCircle className="w-4 h-4 text-emerald-600" />
                {clientReadOnly ? 'Enviar para o WhatsApp da Agência' : 'Enviar via WhatsApp'}
              </label>
              <div className="relative">
                <Phone className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <Input
                  placeholder="923 000 000 ou +244..."
                  value={whatsappPhone}
                  onChange={(e) => setWhatsappPhone(e.target.value)}
                  className="pl-9 h-10 bg-gray-50 border-gray-200"
                />
              </div>
              <div className="grid grid-cols-1 gap-2">
                <Button
                  type="button"
                  onClick={handleSendWhatsApp}
                  className="h-11 bg-emerald-600 hover:bg-emerald-700 text-white font-bold gap-2"
                >
                  <MessageCircle className="w-4 h-4" />
                  {clientReadOnly ? 'Enviar Recibo / Pagamento no WhatsApp' : 'Enviar Recibo no WhatsApp'}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleCopyText}
                  className="h-10 gap-2 text-xs font-semibold border-gray-200"
                >
                  {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                  {copied ? 'Texto Copiado!' : 'Copiar Resumo do Recibo'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
