import { normalizeMarkdownContent } from './note';

export interface MarkdownOutlineItem {
  id: string;
  title: string;
  level: number;
}

export interface KeyFrameTarget {
  title: string;
  seconds: number;
  label: string;
}

export function extractMarkdownOutline(content: unknown): MarkdownOutlineItem[] {
  return normalizeMarkdownContent(content)
    .split('\n')
    .map((line) => {
      const match = /^(#{1,3})\s+(.+)$/.exec(line.trim());
      if (!match) return null;
      const title = match[2].trim();
      return { id: createHeadingId(title), title, level: match[1].length };
    })
    .filter(Boolean) as MarkdownOutlineItem[];
}

export function extractKeyFrameTargets(content: unknown, limit = 6): KeyFrameTarget[] {
  const lines = normalizeMarkdownContent(content).split('\n');
  const imageTargets = extractImageFrameTargets(lines, limit);
  if (imageTargets.length) return imageTargets;

  const targets: KeyFrameTarget[] = [];
  let currentHeading = '关键片段';
  const seenSeconds = new Set<number>();

  for (const rawLine of lines) {
    const line = rawLine.trim();
    const heading = /^(#{1,3})\s+(.+)$/.exec(line);
    if (heading) {
      currentHeading = heading[2]
        .replace(/\*\*/g, '')
        .replace(/\[\d{1,2}:\d{2}(?::\d{2})?(?:\s*-\s*\d{1,2}:\d{2}(?::\d{2})?)?\]/g, '')
        .trim() || currentHeading;
    }

    const timestamp = line.match(/\[\d{1,2}:\d{2}(?::\d{2})?(?:\s*-\s*\d{1,2}:\d{2}(?::\d{2})?)?\]/);
    if (!timestamp) continue;

    const seconds = parseTimestampLabel(timestamp[0]);
    if (seconds == null || seenSeconds.has(seconds)) continue;
    seenSeconds.add(seconds);
    targets.push({
      title: `${currentHeading} ${timestamp[0]}`,
      seconds,
      label: timestamp[0],
    });
    if (targets.length >= limit) break;
  }

  return targets;
}

export function ensureKeyFrameMarkers(content: unknown, limit = 6): string {
  const markdown = normalizeMarkdownContent(content);
  if (!markdown.trim() || /\[<image>\s*@/i.test(markdown)) return markdown;

  const lines = markdown.split('\n');
  const output: string[] = [];
  const seenSeconds = new Set<number>();
  let inserted = 0;
  let inCodeBlock = false;

  for (const rawLine of lines) {
    output.push(rawLine);
    const line = rawLine.trim();

    if (/^```/.test(line)) {
      inCodeBlock = !inCodeBlock;
      continue;
    }
    if (inCodeBlock || inserted >= limit) continue;

    const heading = /^(#{1,3})\s+/.test(line);
    if (!heading) continue;

    const timestamp = line.match(/\[\d{1,2}:\d{2}(?::\d{2})?(?:\s*-\s*\d{1,2}:\d{2}(?::\d{2})?)?\]/);
    if (!timestamp) continue;

    const seconds = parseTimestampLabel(timestamp[0]);
    if (seconds == null || seenSeconds.has(seconds)) continue;
    seenSeconds.add(seconds);
    inserted += 1;
    output.push(`[<image>@${formatMarkerTime(seconds)}]`);
  }

  return output.join('\n');
}

function extractImageFrameTargets(lines: string[], limit: number): KeyFrameTarget[] {
  const targets: KeyFrameTarget[] = [];
  const seenSeconds = new Set<number>();
  let currentHeading = '关键片段';

  for (const rawLine of lines) {
    const line = rawLine.trim();
    const heading = /^(#{1,3})\s+(.+)$/.exec(line);
    if (heading) {
      currentHeading = heading[2]
        .replace(/\*\*/g, '')
        .replace(/\[\d{1,2}:\d{2}(?::\d{2})?(?:\s*-\s*\d{1,2}:\d{2}(?::\d{2})?)?\]/g, '')
        .trim() || currentHeading;
      continue;
    }

    const marker = /^\[<image>\s*@\s*(\d{1,2}:\d{2}(?::\d{2})?)\]$/i.exec(line);
    if (!marker) continue;
    const seconds = parseTimestampLabel(marker[1]);
    if (seconds == null || seenSeconds.has(seconds)) continue;
    seenSeconds.add(seconds);
    const label = `[${marker[1]}]`;
    targets.push({
      title: `${currentHeading} ${label}`,
      seconds,
      label,
    });
    if (targets.length >= limit) break;
  }

  return targets;
}

function formatMarkerTime(seconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const rest = safeSeconds % 60;
  if (hours > 0) {
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`;
  }
  return `${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`;
}

export function createHeadingId(title: string): string {
  return `heading-${title
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)}`;
}

export function parseTimestampLabel(label: string): number | null {
  const firstTimestamp = label.replace(/^\[|\]$/g, '').split(/\s*-\s*/)[0] || '';
  const parts = firstTimestamp.split(':').map((part) => Number(part));
  if (parts.length < 2 || parts.length > 3 || parts.some((part) => !Number.isInteger(part) || part < 0)) {
    return null;
  }
  const [first = 0, second = 0, third] = parts;
  const hours = third == null ? 0 : first;
  const minutes = third == null ? first : second;
  const seconds = third == null ? second : third;
  if (minutes >= 60 || seconds >= 60) return null;
  return hours * 3600 + minutes * 60 + seconds;
}
