/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/src/firebase';
import { ProcessDocument } from '@/src/types';
import { DOCUMENT_CATEGORIES } from '@/src/constants';
import { useCompanySettings } from '@/src/hooks/useCompanySettings';
import { Button } from '@/src/components/ui/Button';
import { dataUrlToBlobUrl, downloadFileFromUrlOrData, formatFileSize } from '@/src/utils/fileHelpers';
import {
  X,
  Download,
  FileText,
  CheckCircle2,
  XCircle,
  ZoomIn,
  ZoomOut,
  RotateCw,
  Loader2,
  ExternalLink,
  ShieldAlert,
} from 'lucide-react';
import { cn } from '@/src/lib/utils';

interface DocumentViewerModalProps {
  documentItem: ProcessDocument | null;
  onClose: () => void;
  canValidate?: boolean;
  disableDownload?: boolean;
  watermarkText?: string;
  onUpdateStatus?: (docId: string, status: 'verified' | 'rejected') => Promise<void>;
}

export function DocumentViewerModal({
  documentItem,
  onClose,
  canValidate = false,
  disableDownload = false,
  watermarkText,
  onUpdateStatus,
}: DocumentViewerModalProps) {
  const { company } = useCompanySettings();
  const [loading, setLoading] = useState(false);
  const [rawUrl, setRawUrl] = useState<string | null>(null);
  const [blobPreviewUrl, setBlobPreviewUrl] = useState<string | null>(null);
  const [mimeType, setMimeType] = useState<string>('');
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!documentItem) return;
    let active = true;
    let createdBlobUrl: string | null = null;

    const loadFile = async () => {
      setLoading(true);
      setError(null);
      setZoom(1);
      setRotation(0);

      try {
        let resolvedUrl = documentItem.url;
        let resolvedMime = documentItem.mimeType || '';

        if (documentItem.hasFileContent) {
          const snap = await getDoc(doc(db, 'document_files', documentItem.id));
          if (snap.exists()) {
            const payload = snap.data();
            resolvedUrl = payload.dataUrl;
            resolvedMime = payload.mimeType || resolvedMime;
          }
        }

        if (!active) return;

        setRawUrl(resolvedUrl);
        setMimeType(resolvedMime);

        if (resolvedUrl && resolvedUrl.startsWith('data:')) {
          createdBlobUrl = dataUrlToBlobUrl(resolvedUrl);
          setBlobPreviewUrl(createdBlobUrl);
        } else {
          setBlobPreviewUrl(resolvedUrl);
        }
      } catch (err) {
        if (active) setError('Não foi possível carregar o ficheiro para visualização.');
      } finally {
        if (active) setLoading(false);
      }
    };

    loadFile();

    return () => {
      active = false;
      if (createdBlobUrl && createdBlobUrl.startsWith('blob:')) {
        URL.revokeObjectURL(createdBlobUrl);
      }
    };
  }, [documentItem]);

  if (!documentItem) return null;

  const isImage =
    mimeType.startsWith('image/') ||
    (rawUrl && rawUrl.startsWith('data:image/')) ||
    /\.(png|jpe?g|webp|gif)$/i.test(documentItem.fileName || '');

  const isPdf =
    mimeType === 'application/pdf' ||
    (rawUrl && rawUrl.startsWith('data:application/pdf')) ||
    /\.pdf$/i.test(documentItem.fileName || '');

  const catLabel = DOCUMENT_CATEGORIES.find((c) => c.id === documentItem.category)?.label || documentItem.category;
  const activeWatermark = disableDownload || Boolean(watermarkText);
  const resolvedWatermarkText =
    watermarkText || `${company.name.toUpperCase()} · DOCUMENTO TRATADO · CÓPIA DE CONSULTA`;

  const handleDownload = () => {
    if (disableDownload || !rawUrl) return;
    const ext = isPdf ? '.pdf' : isImage ? '.jpg' : '';
    const filename = documentItem.fileName || `${documentItem.name.replace(/\s+/g, '_')}${ext}`;
    downloadFileFromUrlOrData(rawUrl, filename);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onContextMenu={activeWatermark ? (e) => e.preventDefault() : undefined}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden border border-gray-200">
        {/* Top Toolbar */}
        <div className="px-6 py-4 border-b border-gray-100 flex flex-wrap items-center justify-between gap-4 bg-white">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-teal-light text-teal flex items-center justify-center shrink-0">
              <FileText className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h3 className="text-base font-bold text-gray-900 truncate">{documentItem.name}</h3>
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <span>{catLabel}</span>
                {documentItem.fileName && !disableDownload && (
                  <>
                    <span>·</span>
                    <span className="truncate max-w-[180px]">{documentItem.fileName}</span>
                  </>
                )}
                {documentItem.fileSize ? (
                  <>
                    <span>·</span>
                    <span className="tabular-nums">{formatFileSize(documentItem.fileSize)}</span>
                  </>
                ) : null}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {isImage && (
              <>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setZoom((z) => Math.max(0.5, z - 0.25))}
                  title="Diminuir Zoom"
                >
                  <ZoomOut className="w-4 h-4" />
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setZoom((z) => Math.min(3, z + 0.25))}
                  title="Aumentar Zoom"
                >
                  <ZoomIn className="w-4 h-4" />
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setRotation((r) => (r + 90) % 360)}
                  title="Rodar"
                >
                  <RotateCw className="w-4 h-4" />
                </Button>
              </>
            )}

            {canValidate && onUpdateStatus && (
              <>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => onUpdateStatus(documentItem.id, 'verified')}
                  className={cn(
                    'gap-1.5',
                    documentItem.status === 'verified'
                      ? 'bg-emerald-600 text-white'
                      : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                  )}
                >
                  <CheckCircle2 className="w-4 h-4" />
                  Validar
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => onUpdateStatus(documentItem.id, 'rejected')}
                  className={cn(
                    'gap-1.5',
                    documentItem.status === 'rejected'
                      ? 'bg-red-600 text-white'
                      : 'bg-red-50 text-red-700 hover:bg-red-100'
                  )}
                >
                  <XCircle className="w-4 h-4" />
                  Rejeitar
                </Button>
              </>
            )}

            {!disableDownload && (
              <Button
                type="button"
                size="sm"
                onClick={handleDownload}
                disabled={!rawUrl}
                className="bg-teal hover:bg-teal-dark text-white gap-1.5"
              >
                <Download className="w-4 h-4" />
                Baixar
              </Button>
            )}

            <Button type="button" variant="ghost" size="icon" onClick={onClose} className="rounded-full">
              <X className="w-5 h-5" />
            </Button>
          </div>
        </div>

        {activeWatermark && (
          <div className="px-6 py-2 bg-amber-50 border-b border-amber-200 flex items-center gap-2 text-xs font-semibold text-amber-800">
            <ShieldAlert className="w-4 h-4 shrink-0 text-amber-600" />
            <span>
              Visualização protegida com marca d&apos;água ({company.name}). Este documento emitido/tratado destina-se apenas a consulta e não permite transferência.
            </span>
          </div>
        )}

        {/* Viewer Area */}
        <div
          className={cn(
            'flex-1 bg-gray-100 overflow-auto flex items-center justify-center p-6 min-h-[420px] relative',
            activeWatermark && 'select-none'
          )}
        >
          {loading ? (
            <div className="flex flex-col items-center gap-3 text-gray-500">
              <Loader2 className="w-8 h-8 animate-spin text-teal" />
              <p className="text-sm font-medium">A carregar documento...</p>
            </div>
          ) : error ? (
            <div className="text-center space-y-3">
              <p className="text-sm font-semibold text-red-600">{error}</p>
            </div>
          ) : isImage && blobPreviewUrl ? (
            <div className="relative flex items-center justify-center overflow-hidden max-h-full rounded-lg shadow-lg bg-white">
              <img
                src={blobPreviewUrl}
                alt={documentItem.name}
                referrerPolicy="no-referrer"
                draggable={false}
                onContextMenu={activeWatermark ? (e) => e.preventDefault() : undefined}
                style={{
                  transform: `scale(${zoom}) rotate(${rotation}deg)`,
                  transition: 'transform 0.2s ease',
                }}
                className="max-h-[70vh] max-w-full object-contain pointer-events-none"
              />
              {activeWatermark && <WatermarkOverlay text={resolvedWatermarkText} />}
            </div>
          ) : isPdf && blobPreviewUrl ? (
            <div className="relative w-full h-[70vh] rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
              <iframe
                src={disableDownload ? `${blobPreviewUrl}#toolbar=0&navpanes=0` : blobPreviewUrl}
                title={documentItem.name}
                className="w-full h-full border-0"
              />
              {activeWatermark && <WatermarkOverlay text={resolvedWatermarkText} />}
            </div>
          ) : (
            <div className="relative bg-white rounded-2xl p-8 text-center max-w-md border border-gray-200 space-y-4 overflow-hidden">
              <div className="w-16 h-16 rounded-2xl bg-teal-light text-teal mx-auto flex items-center justify-center">
                <FileText className="w-8 h-8" />
              </div>
              <div>
                <h4 className="font-bold text-gray-900">{documentItem.name}</h4>
                <p className="text-xs text-gray-500 mt-1">
                  {disableDownload
                    ? 'Documento emitido/tratado pela agência. A pré-visualização direta está indisponível para este formato; solicite a cópia final ao seu consultor após conclusão.'
                    : documentItem.hasFileContent
                    ? 'Pré-visualização direta indisponível para este formato. Pode descarregar o ficheiro.'
                    : 'Este registo contém uma referência externa de documento.'}
                </p>
              </div>
              {!disableDownload && (
                <div className="flex items-center justify-center gap-3">
                  <Button onClick={handleDownload} className="bg-teal hover:bg-teal-dark text-white gap-2">
                    <Download className="w-4 h-4" />
                    Descarregar Ficheiro
                  </Button>
                  {rawUrl && !rawUrl.startsWith('data:') && (
                    <a
                      href={rawUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg border border-gray-200 hover:bg-gray-50"
                    >
                      <ExternalLink className="w-4 h-4" />
                      Abrir Link
                    </a>
                  )}
                </div>
              )}
              {activeWatermark && <WatermarkOverlay text={resolvedWatermarkText} />}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function WatermarkOverlay({ text }: { text: string }) {
  return (
    <div
      aria-hidden="true"
      onContextMenu={(e) => e.preventDefault()}
      className="absolute inset-0 z-20 pointer-events-none overflow-hidden flex flex-col justify-evenly items-center select-none"
    >
      {[0, 1, 2, 3, 4].map((row) => (
        <div
          key={row}
          className="w-[160%] -rotate-[24deg] flex justify-around items-center gap-10 whitespace-nowrap opacity-30"
        >
          {[0, 1, 2].map((col) => (
            <span
              key={col}
              className="text-xs sm:text-sm font-black tracking-[0.2em] uppercase text-teal-dark bg-white/40 px-3 py-1 rounded border border-teal/20"
            >
              {text}
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}
