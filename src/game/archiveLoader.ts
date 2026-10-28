import { unzipSync, zipSync } from 'fflate';
import { renderImageToCanvas, renderPresetToCanvas, PRESET_ARTWORKS } from './presetArt';

export interface QueuedImageItem {
  id: string;
  title: string;
  fileName: string;
  width: number;
  height: number;
  aspectRatio: number;
  canvas: HTMLCanvasElement;
  previewDataUrl: string;
  completed: boolean;
}

const IMAGE_EXTENSIONS = new Set([
  '.jpg',
  '.jpeg',
  '.png',
  '.webp',
  '.gif',
  '.bmp',
  '.svg',
]);

function getMimeTypeFromExtension(fileName: string): string | null {
  const lower = fileName.toLowerCase();
  const dotIdx = lower.lastIndexOf('.');
  if (dotIdx < 0) return null;
  const ext = lower.slice(dotIdx);
  if (!IMAGE_EXTENSIONS.has(ext)) return null;
  switch (ext) {
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.png':
      return 'image/png';
    case '.webp':
      return 'image/webp';
    case '.gif':
      return 'image/gif';
    case '.bmp':
      return 'image/bmp';
    case '.svg':
      return 'image/svg+xml';
    default:
      return 'image/png';
  }
}

export function isSupportedImagePath(path: string): boolean {
  const normalized = path.replace(/\\/g, '/');
  if (normalized.endsWith('/')) return false;
  if (normalized.includes('__MACOSX/')) return false;
  const baseName = normalized.split('/').pop() || '';
  if (!baseName || baseName.startsWith('.')) return false;
  return getMimeTypeFromExtension(baseName) !== null;
}

export function cleanImageTitle(fileName: string): string {
  const normalized = fileName.replace(/\\/g, '/');
  const base = normalized.split('/').pop() || fileName;
  const withoutExt = base.replace(/\.[^/.]+$/, '').replace(/[_-]+/g, ' ').trim();
  return (withoutExt || 'Картинка').slice(0, 36);
}

function loadImageElementFromBlob(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Не удалось декодировать изображение'));
    };
    img.src = url;
  });
}

async function decodeImageBlobToQueueItem(
  blob: Blob,
  fileName: string,
  index: number
): Promise<QueuedImageItem> {
  const img = await loadImageElementFromBlob(blob);
  const origW = Math.max(1, img.naturalWidth || img.width || 640);
  const origH = Math.max(1, img.naturalHeight || img.height || 480);
  const canvas = renderImageToCanvas(img);
  const previewDataUrl = canvas.toDataURL('image/jpeg', 0.88);

  return {
    id: `queue-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 6)}`,
    title: cleanImageTitle(fileName),
    fileName,
    width: origW,
    height: origH,
    aspectRatio: origW / origH,
    canvas,
    previewDataUrl,
    completed: false,
  };
}

/**
 * Extracts all valid images from a .zip Uint8Array buffer and decodes them into QueuedImageItem[].
 */
export async function extractImagesFromZipBuffer(
  zipBytes: Uint8Array
): Promise<QueuedImageItem[]> {
  const unzipped = unzipSync(zipBytes);
  const entryNames = Object.keys(unzipped)
    .filter(isSupportedImagePath)
    .sort((a, b) =>
      a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
    );

  const items: QueuedImageItem[] = [];
  for (let i = 0; i < entryNames.length; i++) {
    const entryName = entryNames[i];
    const data = unzipped[entryName];
    if (!data || data.byteLength === 0) continue;
    const mime = getMimeTypeFromExtension(entryName) || 'image/png';
    const blob = new Blob([data], { type: mime });
    try {
      const item = await decodeImageBlobToQueueItem(blob, entryName, i);
      items.push(item);
    } catch {
      // Skip corrupted non-image file inside archive
    }
  }

  return items;
}

/**
 * Accepts a FileList or File[] from an <input type="file"> element.
 * Supports .zip archives, multiple selected images, or a single image.
 */
export async function loadFilesOrArchiveToQueue(
  files: FileList | File[]
): Promise<{
  items: QueuedImageItem[];
  sourceLabel: string;
  isArchive: boolean;
}> {
  const fileArray = Array.from(files);
  if (fileArray.length === 0) {
    return { items: [], sourceLabel: '', isArchive: false };
  }

  const allItems: QueuedImageItem[] = [];
  let hasZip = false;
  let archiveName = '';

  const sortedFiles = [...fileArray].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, {
      numeric: true,
      sensitivity: 'base',
    })
  );

  for (let i = 0; i < sortedFiles.length; i++) {
    const file = sortedFiles[i];
    const lowerName = file.name.toLowerCase();
    const isZip =
      lowerName.endsWith('.zip') ||
      file.type === 'application/zip' ||
      file.type === 'application/x-zip-compressed';

    if (isZip) {
      hasZip = true;
      archiveName = file.name.replace(/\.zip$/i, '');
      const arrayBuffer = await file.arrayBuffer();
      const zipItems = await extractImagesFromZipBuffer(
        new Uint8Array(arrayBuffer)
      );
      allItems.push(...zipItems);
    } else if (
      file.type.startsWith('image/') ||
      isSupportedImagePath(file.name)
    ) {
      try {
        const item = await decodeImageBlobToQueueItem(file, file.name, i);
        allItems.push(item);
      } catch {
        // Ignore unreadable file
      }
    }
  }

  const isArchive = hasZip || allItems.length > 1;
  const sourceLabel = hasZip
    ? `Архив «${archiveName || 'Картинки'}» (${allItems.length} шт.)`
    : allItems.length > 1
    ? `Набор картинок (${allItems.length} шт.)`
    : allItems[0]?.title || 'Картинка';

  return {
    items: allItems,
    sourceLabel,
    isArchive,
  };
}

function dataUrlToUint8Array(dataUrl: string): Uint8Array {
  const base64 = dataUrl.split(',')[1] || '';
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Generates an in-memory .zip archive containing 4 storybook pictures at diverse resolutions
 * (e.g. 480x360, 600x800, 720x720, 960x540) so users can test or download a real ZIP pack.
 */
export function createSampleStoriesZipBytes(): Uint8Array {
  const specs = [
    {
      preset: PRESET_ARTWORKS[0],
      fileName: '01_Лесная_Поляна_480x360.jpg',
      w: 480,
      h: 360,
    },
    {
      preset: PRESET_ARTWORKS[1],
      fileName: '02_Космо_Динозаврик_600x800.jpg',
      w: 600,
      h: 800,
    },
    {
      preset: PRESET_ARTWORKS[2],
      fileName: '03_Морские_Друзья_720x720.jpg',
      w: 720,
      h: 720,
    },
    {
      preset: PRESET_ARTWORKS[3],
      fileName: '04_Чудо_Паровозик_960x540.jpg',
      w: 960,
      h: 540,
    },
  ];

  const filesMap: Record<string, Uint8Array> = {};
  for (const spec of specs) {
    const canvas = renderPresetToCanvas(spec.preset.id, spec.w, spec.h);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
    filesMap[spec.fileName] = dataUrlToUint8Array(dataUrl);
  }

  return zipSync(filesMap, { level: 6 });
}
