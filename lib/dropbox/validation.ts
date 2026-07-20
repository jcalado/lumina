import { z } from 'zod';
import { isImageFile, isVideoFile } from '@/lib/utils';

export type DeclaredFile = { filename: string; contentType: string; size: number };

export function resolveMediaKind(filename: string): 'IMAGE' | 'VIDEO' | null {
  if (isImageFile(filename)) return 'IMAGE';
  if (isVideoFile(filename)) return 'VIDEO';
  return null;
}

export function sanitizeFilename(name: string): string {
  return name.replace(/[<>:"/\\|?*]/g, '_').replace(/\s+/g, '_');
}

export function validateDeclaredFiles(
  files: DeclaredFile[],
  opts: { maxFiles: number; maxFileSizeBytes: number; allowVideos: boolean }
): { ok: true } | { ok: false; error: string } {
  if (!Array.isArray(files) || files.length === 0) return { ok: false, error: 'No files provided' };
  if (files.length > opts.maxFiles) return { ok: false, error: `Too many files (max ${opts.maxFiles})` };
  for (const f of files) {
    if (!f.filename || typeof f.size !== 'number') return { ok: false, error: 'Invalid file entry' };
    if (f.size <= 0 || f.size > opts.maxFileSizeBytes) return { ok: false, error: `File too large: ${f.filename}` };
    const kind = resolveMediaKind(f.filename);
    if (!kind) return { ok: false, error: `Unsupported file type: ${f.filename}` };
    if (kind === 'VIDEO' && !opts.allowVideos) return { ok: false, error: `Videos are not accepted: ${f.filename}` };
  }
  return { ok: true };
}

export const submissionMetaSchema = z.object({
  uploaderName: z.string().trim().max(200).optional(),
  uploaderEmail: z.string().trim().email().max(320).optional().or(z.literal('')),
  message: z.string().trim().max(2000).optional(),
});
