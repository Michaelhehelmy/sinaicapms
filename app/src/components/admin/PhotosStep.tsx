import React, { useCallback, useRef, useState } from 'react';
import * as api from '@/lib/api';
import { useToast } from '@/components/ui/Toast';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useI18n } from '@/hooks/useI18n';
import { cn } from '@/lib/utils';

export interface WizardPhoto {
  url: string;
  type: 'upload' | 'url';
  /** Original file name for uploaded images (optional). */
  name?: string;
}

interface PhotosStepProps {
  photos: WizardPhoto[];
  onChange: (photos: WizardPhoto[]) => void;
}

const IMAGE_ACCEPT = 'image/jpeg,image/png,image/webp,image/gif';

function isValidImageUrl(value: string): boolean {
  return value.startsWith('http://') || value.startsWith('https://');
}

/**
 * Photo picker step for the listing wizard.
 *
 * Two required input paths:
 *  - Drag & drop (native HTML5 drag events) or file browse → sequential upload
 *    via `api.upload(file)` (POST /api/upload, R2) with per-file progress.
 *  - URL/paste fallback: type or paste an image URL → validated → added
 *    immediately (no upload round-trip).
 *
 * The component is controlled: the parent owns the `WizardPhoto[]` list so the
 * wizard can preview + submit the same state.
 */
export default function PhotosStep({ photos, onChange }: PhotosStepProps) {
  const { t } = useI18n();
  const { showToast } = useToast();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [urlInput, setUrlInput] = useState('');
  const [dragActive, setDragActive] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadingName, setUploadingName] = useState<string | null>(null);
  const [pendingUploads, setPendingUploads] = useState<string[]>([]);

  /** Upload a list of image files sequentially, appending successes to the list. */
  const handleFiles = useCallback(
    async (files: FileList | File[]) => {
      if (uploading) return;
      const imageFiles = Array.from(files).filter((f) => f.type.startsWith('image/'));
      if (imageFiles.length === 0) {
        showToast(t('admin.photosUploadFailed'), 'warning');
        return;
      }
      if (imageFiles.length < Array.from(files).length) {
        showToast(t('admin.photosUploadFailed'), 'warning');
      }

      const names = imageFiles.map((f) => f.name);
      setPendingUploads(names);
      setUploading(true);
      const next: WizardPhoto[] = [];
      for (const file of imageFiles) {
        setUploadingName(file.name);
        try {
          const res = await api.upload(file);
          next.push({ url: res.url, type: 'upload', name: file.name });
        } catch (err) {
          showToast(`${t('admin.photosUploadFailed')}: ${err instanceof Error ? err.message : String(err)}`, 'error');
        }
      }
      setUploading(false);
      setUploadingName(null);
      setPendingUploads([]);
      if (next.length > 0) {
        onChange([...photos, ...next]);
      }
    },
    [uploading, photos, onChange, showToast, t],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setDragActive(false);
      if (uploading) return;
      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        void handleFiles(e.dataTransfer.files);
      }
    },
    [uploading, handleFiles],
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files.length > 0) {
        void handleFiles(e.target.files);
      }
      // Reset the input so selecting the same file again re-triggers onChange.
      e.target.value = '';
    },
    [handleFiles],
  );

  const addUrl = useCallback(
    (raw: string) => {
      const url = raw.trim();
      if (!isValidImageUrl(url)) {
        showToast(t('admin.photosUrlInvalid'), 'warning');
        return;
      }
      if (photos.some((p) => p.url === url)) {
        showToast(t('admin.photosUrlInvalid'), 'warning');
        return;
      }
      onChange([...photos, { url, type: 'url' }]);
      setUrlInput('');
    },
    [photos, onChange, showToast, t],
  );

  const handleUrlKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        addUrl(urlInput);
      }
    },
    [urlInput, addUrl],
  );

  const handleUrlPaste = useCallback(
    (e: React.ClipboardEvent<HTMLInputElement>) => {
      const text = e.clipboardData.getData('text').trim();
      if (isValidImageUrl(text)) {
        e.preventDefault();
        addUrl(text);
      }
    },
    [addUrl],
  );

  const removePhoto = useCallback(
    (index: number) => {
      onChange(photos.filter((_, i) => i !== index));
    },
    [photos, onChange],
  );

  const activateBrowse = useCallback(() => {
    if (uploading) return;
    fileInputRef.current?.click();
  }, [uploading]);

  const handleDropZoneKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        activateBrowse();
      }
    },
    [activateBrowse],
  );

  return (
    <div data-testid="photos-step">
      {/* Drag & drop zone + file browse fallback */}
      <div
        role="button"
        tabIndex={0}
        aria-label={dragActive ? t('admin.photosDropZoneActive') : t('admin.photosDropZoneLabel')}
        aria-disabled={uploading || undefined}
        onClick={activateBrowse}
        onKeyDown={handleDropZoneKeyDown}
        onDragOver={(e) => {
          e.preventDefault();
          setDragActive(true);
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={handleDrop}
        className={cn(
          'flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-8 text-center transition-colors duration-200',
          dragActive
            ? 'border-brand-500 bg-brand-50'
            : 'border-gray-300 bg-gray-50 hover:border-gray-400',
          uploading && 'opacity-60 pointer-events-none',
        )}
      >
        <svg
          className="h-8 w-8 text-gray-400"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
          />
        </svg>
        <p className="text-sm font-medium text-gray-700">
          {dragActive ? t('admin.photosDropZoneActive') : t('admin.photosDropZoneLabel')}
        </p>
        <p className="text-xs text-gray-500 max-w-sm">{t('admin.photosDropHint')}</p>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={activateBrowse}
          leftIcon={
            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
            </svg>
          }
        >
          {t('admin.photosBrowse')}
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept={IMAGE_ACCEPT}
          multiple
          className="hidden"
          data-testid="photos-file-input"
          onChange={handleFileInput}
        />
      </div>

      {/* In-flight uploads */}
      {pendingUploads.length > 0 && (
        <ul className="mt-3 space-y-2" data-testid="photos-pending">
          {pendingUploads.map((name) => (
            <li key={name} className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-600">
              <svg className="h-4 w-4 animate-spin text-brand-600" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              <span className="truncate">{name}</span>
              {uploadingName === name && <span className="ml-auto text-xs text-brand-600">{t('admin.photosUploading')}</span>}
            </li>
          ))}
        </ul>
      )}

      {/* Photo list */}
      {photos.length > 0 && (
        <ul className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-3" data-testid="photos-list">
          {photos.map((photo, index) => (
            <li key={`${photo.type}-${photo.url}-${index}`} className="group relative overflow-hidden rounded-lg border border-gray-200 bg-white">
              <img
                src={photo.url}
                alt={photo.name ?? `${t('admin.photosDropZoneLabel')} ${index + 1}`}
                className="h-24 w-full object-cover"
              />
              <span className="absolute left-1.5 top-1.5 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white">
                {photo.type === 'upload' ? t('admin.photosUploadedBadge') : t('admin.photosUrlBadge')}
              </span>
              <button
                type="button"
                aria-label={t('admin.photosRemove')}
                onClick={() => removePhoto(index)}
                className="absolute right-1.5 top-1.5 rounded bg-black/60 p-1 text-white transition-colors hover:bg-black/80"
              >
                <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* URL / paste fallback */}
      <div className="mt-4">
        <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="photos-url-input">
          {t('admin.photosUrlLabel')}
        </label>
        <div className="flex gap-2">
          <div className="flex-1">
            <Input
              id="photos-url-input"
              aria-label={t('admin.photosUrlLabel')}
              type="url"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              onKeyDown={handleUrlKeyDown}
              onPaste={handleUrlPaste}
              placeholder={t('admin.photosUrlPlaceholder')}
            />
          </div>
          <Button type="button" variant="primary" size="md" onClick={() => addUrl(urlInput)}>
            {t('admin.photosUrlAdd')}
          </Button>
        </div>
        <p className="mt-1 text-xs text-gray-500">{t('admin.photosUrlPasteHint')}</p>
      </div>
    </div>
  );
}
