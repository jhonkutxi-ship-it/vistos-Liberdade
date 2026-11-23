/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface ProcessedFile {
  dataUrl: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
}

const MAX_FIRESTORE_BINARY_BYTES = 720 * 1024; // ~720KB raw -> <980KB base64 inside 1MB Firestore limit

export function formatFileSize(bytes?: number): string {
  if (!bytes) return '0 KB';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export async function compressImageToDataUrl(
  file: File,
  maxWidth = 1400,
  quality = 0.82,
  preferPng = false
): Promise<ProcessedFile> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        let width = img.width;
        let height = img.height;
        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Falha ao inicializar processamento de imagem.'));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);

        const targetMime = preferPng || file.type === 'image/png' ? 'image/png' : 'image/jpeg';
        let dataUrl = canvas.toDataURL(targetMime, quality);

        // If PNG logo/image is still too big, fallback to jpeg compression
        if (dataUrl.length > MAX_FIRESTORE_BINARY_BYTES * 1.35) {
          dataUrl = canvas.toDataURL('image/jpeg', 0.72);
        }

        const approxBytes = Math.round((dataUrl.length * 3) / 4);
        resolve({
          dataUrl,
          fileName: file.name,
          mimeType: dataUrl.startsWith('data:image/png') ? 'image/png' : 'image/jpeg',
          fileSize: approxBytes,
        });
      };
      img.onerror = () => reject(new Error('Não foi possível ler a imagem selecionada.'));
      img.src = reader.result as string;
    };
    reader.onerror = () => reject(new Error('Erro ao carregar arquivo do dispositivo.'));
    reader.readAsDataURL(file);
  });
}

export async function processUploadedFile(file: File): Promise<ProcessedFile> {
  if (file.type.startsWith('image/')) {
    return compressImageToDataUrl(file, 1500, 0.82, false);
  }

  if (file.size > MAX_FIRESTORE_BINARY_BYTES) {
    throw new Error(
      `O ficheiro "${file.name}" (${formatFileSize(file.size)}) excede o limite de 720 KB para documentos PDF/Office. Comprima o PDF ou carregue uma imagem.`
    );
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      resolve({
        dataUrl: reader.result as string,
        fileName: file.name,
        mimeType: file.type || 'application/octet-stream',
        fileSize: file.size,
      });
    };
    reader.onerror = () => reject(new Error('Erro ao ler ficheiro.'));
    reader.readAsDataURL(file);
  });
}

export function dataUrlToBlob(dataUrl: string): Blob {
  const parts = dataUrl.split(',');
  const mimeMatch = parts[0].match(/:(.*?);/);
  const mime = mimeMatch ? mimeMatch[1] : 'application/octet-stream';
  const byteString = atob(parts[1] || '');
  const ab = new ArrayBuffer(byteString.length);
  const ia = new Uint8Array(ab);
  for (let i = 0; i < byteString.length; i++) {
    ia[i] = byteString.charCodeAt(i);
  }
  return new Blob([ab], { type: mime });
}

export function dataUrlToBlobUrl(dataUrl: string): string {
  if (!dataUrl.startsWith('data:')) return dataUrl;
  const blob = dataUrlToBlob(dataUrl);
  return URL.createObjectURL(blob);
}

export function downloadFileFromUrlOrData(urlOrData: string, fileName: string) {
  if (urlOrData.startsWith('data:')) {
    const blob = dataUrlToBlob(urlOrData);
    const blobUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(blobUrl), 5000);
    return;
  }

  const link = document.createElement('a');
  link.href = urlOrData;
  link.download = fileName;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
