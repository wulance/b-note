import { createHeadingId, parseTimestampLabel, TIMESTAMP_PATTERN } from './markdown';

export type RenderBlock =
  | { type: 'heading'; level: 1 | 2 | 3; text: string }
  | { type: 'keyframe'; label: string; seconds: number }
  | { type: 'quote'; lines: string[] }
  | { type: 'list'; items: string[] }
  | { type: 'ordered'; items: Array<{ index: string; text: string }> }
  | { type: 'code'; code: string }
  | { type: 'table'; headers: string[]; rows: string[][] }
  | { type: 'image'; alt: string; src: string }
  | { type: 'rule' }
  | { type: 'paragraph'; text: string };

export function parseRenderBlocks(markdown: string): RenderBlock[] {
  const lines = markdown.split('\n');
  const blocks: RenderBlock[] = [];
  let index = 0;

  while (index < lines.length) {
    const trimmed = lines[index].trim();
    if (!trimmed) {
      index += 1;
      continue;
    }

    const keyframe = /^\[<image>\s*@\s*(\d{1,2}:\d{2}(?::\d{2})?)\]$/i.exec(trimmed);
    if (keyframe?.[1]) {
      const seconds = parseTimestampLabel(keyframe[1]);
      if (seconds != null) {
        blocks.push({ type: 'keyframe', label: keyframe[1], seconds });
        index += 1;
        continue;
      }
    }

    const heading = /^(#{1,3})\s+(.+)$/.exec(trimmed);
    if (heading) {
      blocks.push({ type: 'heading', level: heading[1].length as 1 | 2 | 3, text: heading[2].trim() });
      index += 1;
      continue;
    }

    if (/^```/.test(trimmed)) {
      const code: string[] = [];
      index += 1;
      while (index < lines.length && !/^```/.test(lines[index].trim())) {
        code.push(lines[index]);
        index += 1;
      }
      blocks.push({ type: 'code', code: code.join('\n') });
      index += index < lines.length ? 1 : 0;
      continue;
    }

    const image = /^!\[([^\]]*)\]\(([^)]+)\)$/.exec(trimmed);
    if (image) {
      blocks.push({ type: 'image', alt: image[1], src: image[2] });
      index += 1;
      continue;
    }

    if (/^---+$/.test(trimmed)) {
      blocks.push({ type: 'rule' });
      index += 1;
      continue;
    }

    if (isTableStart(lines, index)) {
      const tableLines: string[] = [];
      while (index < lines.length && /^\s*\|.+\|\s*$/.test(lines[index])) {
        tableLines.push(lines[index].trim());
        index += 1;
      }
      const [headerLine, , ...rowLines] = tableLines;
      blocks.push({
        type: 'table',
        headers: splitTableRow(headerLine),
        rows: rowLines.map(splitTableRow),
      });
      continue;
    }

    if (trimmed.startsWith('> ')) {
      const quote: string[] = [];
      while (index < lines.length && lines[index].trim().startsWith('> ')) {
        quote.push(lines[index].trim().slice(2));
        index += 1;
      }
      blocks.push({ type: 'quote', lines: quote });
      continue;
    }

    if (/^[-*]\s+/.test(trimmed)) {
      const items: string[] = [];
      while (index < lines.length && /^[-*]\s+/.test(lines[index].trim())) {
        items.push(lines[index].trim().replace(/^[-*]\s+/, ''));
        index += 1;
      }
      blocks.push({ type: 'list', items });
      continue;
    }

    if (/^\d+\.\s+/.test(trimmed)) {
      const items: Array<{ index: string; text: string }> = [];
      while (index < lines.length) {
        const match = /^(\d+)\.\s+(.+)$/.exec(lines[index].trim());
        if (!match) break;
        items.push({ index: match[1], text: match[2] });
        index += 1;
      }
      blocks.push({ type: 'ordered', items });
      continue;
    }

    const paragraph: string[] = [];
    while (index < lines.length && lines[index].trim()) {
      const next = lines[index].trim();
      if (
        /^(#{1,3})\s+/.test(next) ||
        /^\[<image>\s*@\s*\d{1,2}:\d{2}(?::\d{2})?\]$/i.test(next) ||
        /^```/.test(next) ||
        /^[-*]\s+/.test(next) ||
        /^\d+\.\s+/.test(next) ||
        next.startsWith('> ') ||
        isTableStart(lines, index)
      ) {
        break;
      }
      paragraph.push(next);
      index += 1;
    }
    blocks.push({ type: 'paragraph', text: paragraph.join(' ') });
  }

  return blocks;
}

export function getBlockPlainText(block: RenderBlock): string {
  switch (block.type) {
    case 'heading':
      return block.text;
    case 'keyframe':
      return `[${block.label}]`;
    case 'quote':
      return block.lines.join('\n');
    case 'list':
      return block.items.join('\n');
    case 'ordered':
      return block.items.map((item) => item.text).join('\n');
    case 'paragraph':
      return block.text;
    case 'image':
      return block.alt;
    default:
      return '';
  }
}

export function extractTimestampLabels(text: string): string[] {
  return String(text || '').match(TIMESTAMP_PATTERN) || [];
}

export function getSafeHref(href: string): string | null {
  const trimmed = href.trim();
  if (/^(https?:|data:image\/|images\/|\.\/|\/)/i.test(trimmed)) return trimmed;
  return null;
}

export function headingIdForBlock(block: RenderBlock): string | null {
  return block.type === 'heading' ? createHeadingId(block.text) : null;
}

function isTableStart(lines: string[], index: number): boolean {
  return /^\s*\|.+\|\s*$/.test(lines[index] || '') && /^\s*\|?[\s:-]+\|[\s|:-]*$/.test(lines[index + 1] || '');
}

function splitTableRow(line: string): string[] {
  return line.replace(/^\||\|$/g, '').split('|').map((cell) => cell.trim());
}
