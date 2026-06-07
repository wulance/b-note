import { buildNoteMarkdown, sanitizeFileName } from './note';
import type { SummaryMode, SummaryTemplate, TokenUsage } from './summarizer';
import type { PricingConfig } from './cost';
import type { KeyFrame } from './keyFrames';
import type { ZipEntry } from './zip';
import type { FrontmatterFieldMap } from './frontmatter';

export interface NotePackageInput {
  videoTitle: string;
  videoUrl?: string | null;
  content: string;
  mode: SummaryMode;
  template: SummaryTemplate;
  generatedAt: string | null;
  usage: TokenUsage | null;
  providerName: string | null;
  model: string | null;
  keyFrames: KeyFrame[];
  pricing: PricingConfig;
  tags?: string[];
  extraFrontmatter?: Record<string, string>;
  fieldMap?: FrontmatterFieldMap;
}

export function buildNotePackageFiles(input: NotePackageInput): ZipEntry[] {
  const baseName = sanitizeFileName(input.videoTitle);
  const imageEntries = input.keyFrames
    .map((frame, index) => createImageEntry(frame, index))
    .filter(Boolean) as Array<{ frame: KeyFrame; path: string; bytes: Uint8Array }>;

  const markdown = buildNoteMarkdown({
    ...input,
    keyFrames: imageEntries.map(({ frame, path }) => ({
      ...frame,
      dataUrl: path,
    })),
  });

  return [
    { path: `${baseName}.md`, data: markdown },
    ...imageEntries.map(({ path, bytes }) => ({ path, data: bytes })),
  ];
}

function createImageEntry(frame: KeyFrame, index: number) {
  const parsed = parseDataUrl(frame.dataUrl);
  if (!parsed) return null;
  return {
    frame,
    path: `images/frame-${String(index + 1).padStart(2, '0')}.${extensionFromMime(parsed.mime)}`,
    bytes: parsed.bytes,
  };
}

function parseDataUrl(dataUrl: string): { mime: string; bytes: Uint8Array } | null {
  const match = /^data:([^;,]+);base64,(.+)$/i.exec(dataUrl.trim());
  if (!match) return null;
  try {
    return {
      mime: match[1].toLowerCase(),
      bytes: decodeBase64(match[2]),
    };
  } catch {
    return null;
  }
}

function decodeBase64(value: string): Uint8Array {
  if (typeof atob === 'function') {
    const binary = atob(value);
    return Uint8Array.from(binary, (char) => char.charCodeAt(0));
  }
  return Uint8Array.from(Buffer.from(value, 'base64'));
}

function extensionFromMime(mime: string): string {
  if (mime.includes('png')) return 'png';
  if (mime.includes('webp')) return 'webp';
  if (mime.includes('svg')) return 'svg';
  return 'jpg';
}
