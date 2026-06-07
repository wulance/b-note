import {
  formatGeneratedAt,
  formatUsage,
  getModeLabel,
  normalizeMarkdownContent,
} from './note';
import { getTemplateLabel, type SummaryMode, type SummaryTemplate, type TokenUsage } from './summarizer';
import { estimateUsageCost, formatEstimatedCost, type PricingConfig } from './cost';
import type { KeyFrame } from './keyFrames';

export interface ShareHtmlInput {
  videoTitle: string;
  videoUrl?: string | null;
  content: unknown;
  mode: SummaryMode;
  template: SummaryTemplate;
  generatedAt: string | null;
  usage: TokenUsage | null;
  providerName: string | null;
  model: string | null;
  keyFrames: KeyFrame[];
  pricing: PricingConfig;
}

export function buildShareHtml(input: ShareHtmlInput): string {
  const generated = formatGeneratedAt(input.generatedAt);
  const cost = estimateUsageCost(input.usage, input.pricing);
  const costText = formatEstimatedCost(cost, input.pricing.currency);
  const model = [input.providerName, input.model].filter(Boolean).join(' / ') || '未知';
  const metaRows = [
    ['来源', input.videoUrl ? `<a href="${escapeAttribute(input.videoUrl)}">${escapeHtml(input.videoUrl)}</a>` : 'B站视频'],
    ['总结模式', escapeHtml(getModeLabel(input.mode))],
    ['笔记模板', escapeHtml(getTemplateLabel(input.template))],
    ['模型', escapeHtml(model)],
    ['生成时间', escapeHtml(generated)],
    ['Token', escapeHtml(formatUsage(input.usage))],
    ['费用估算', escapeHtml(costText)],
  ];

  return [
    '<!doctype html>',
    '<html lang="zh-CN">',
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${escapeHtml(input.videoTitle)} - b-note</title>`,
    '<style>',
    HTML_STYLE,
    '</style>',
    '</head>',
    '<body>',
    '<main class="page">',
    '<header class="hero">',
    '<div class="brand">b-note</div>',
    `<h1>${escapeHtml(input.videoTitle)}</h1>`,
    '<dl class="meta">',
    ...metaRows.map(([name, value]) => `<div><dt>${escapeHtml(name)}</dt><dd>${value}</dd></div>`),
    '</dl>',
    '</header>',
    renderKeyFrames(input.keyFrames),
    '<article class="note">',
    renderMarkdownToHtml(input.content),
    '</article>',
    '</main>',
    '</body>',
    '</html>',
  ].join('\n');
}

export function renderMarkdownToHtml(content: unknown): string {
  const lines = normalizeMarkdownContent(content).split('\n');
  const html: string[] = [];
  let index = 0;

  while (index < lines.length) {
    const trimmed = lines[index].trim();
    if (!trimmed) {
      index += 1;
      continue;
    }

    const heading = /^(#{1,4})\s+(.+)$/.exec(trimmed);
    if (heading) {
      const level = Math.min(4, heading[1].length + 1);
      html.push(`<h${level}>${renderInline(heading[2])}</h${level}>`);
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
      html.push(`<pre><code>${escapeHtml(code.join('\n'))}</code></pre>`);
      index += index < lines.length ? 1 : 0;
      continue;
    }

    if (isTableStart(lines, index)) {
      const tableLines: string[] = [];
      while (index < lines.length && /^\s*\|.+\|\s*$/.test(lines[index])) {
        tableLines.push(lines[index].trim());
        index += 1;
      }
      const [headerLine, , ...rowLines] = tableLines;
      html.push([
        '<div class="table-wrap"><table>',
        '<thead><tr>',
        ...splitTableRow(headerLine).map((cell) => `<th>${renderInline(cell)}</th>`),
        '</tr></thead>',
        '<tbody>',
        ...rowLines.map((row) => `<tr>${splitTableRow(row).map((cell) => `<td>${renderInline(cell)}</td>`).join('')}</tr>`),
        '</tbody>',
        '</table></div>',
      ].join(''));
      continue;
    }

    if (trimmed.startsWith('> ')) {
      const quote: string[] = [];
      while (index < lines.length && lines[index].trim().startsWith('> ')) {
        quote.push(lines[index].trim().slice(2));
        index += 1;
      }
      html.push(`<blockquote>${quote.map((line) => `<p>${renderInline(line)}</p>`).join('')}</blockquote>`);
      continue;
    }

    if (/^[-*]\s+/.test(trimmed)) {
      const items: string[] = [];
      while (index < lines.length && /^[-*]\s+/.test(lines[index].trim())) {
        items.push(lines[index].trim().replace(/^[-*]\s+/, ''));
        index += 1;
      }
      html.push(`<ul>${items.map((item) => `<li>${renderInline(item)}</li>`).join('')}</ul>`);
      continue;
    }

    if (/^\d+\.\s+/.test(trimmed)) {
      const items: string[] = [];
      while (index < lines.length && /^\d+\.\s+/.test(lines[index].trim())) {
        items.push(lines[index].trim().replace(/^\d+\.\s+/, ''));
        index += 1;
      }
      html.push(`<ol>${items.map((item) => `<li>${renderInline(item)}</li>`).join('')}</ol>`);
      continue;
    }

    const paragraph: string[] = [];
    while (index < lines.length && lines[index].trim()) {
      const next = lines[index].trim();
      if (/^(#{1,4})\s+/.test(next) || /^```/.test(next) || /^[-*]\s+/.test(next) || /^\d+\.\s+/.test(next) || next.startsWith('> ') || isTableStart(lines, index)) {
        break;
      }
      paragraph.push(next);
      index += 1;
    }
    html.push(`<p>${renderInline(paragraph.join(' '))}</p>`);
  }

  return html.join('\n');
}

function renderKeyFrames(frames: KeyFrame[]): string {
  if (!frames.length) return '';
  return [
    '<section class="frames">',
    '<h2>关键画面</h2>',
    '<div class="frame-grid">',
    ...frames.map((frame) => (
      `<figure><img src="${escapeAttribute(frame.dataUrl)}" alt="${escapeAttribute(frame.title)}"><figcaption>${escapeHtml(frame.title)}</figcaption></figure>`
    )),
    '</div>',
    '</section>',
  ].join('\n');
}

function renderInline(text: string): string {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`|!?\[[^\]]+\]\([^)]+\)|\[\d{1,2}:\d{2}(?::\d{2})?(?:\s*-\s*\d{1,2}:\d{2}(?::\d{2})?)?\])/g);
  return parts.map((part) => {
    if (!part) return '';
    if (part.startsWith('**') && part.endsWith('**')) return `<strong>${escapeHtml(part.slice(2, -2))}</strong>`;
    if (part.startsWith('`') && part.endsWith('`')) return `<code>${escapeHtml(part.slice(1, -1))}</code>`;
    const link = /^(!?)\[([^\]]+)\]\(([^)]+)\)$/.exec(part);
    if (link) {
      const [, imageMark, label, href] = link;
      const safeHref = getSafeHref(href);
      if (!safeHref) return escapeHtml(label);
      if (imageMark) {
        return `<img src="${escapeAttribute(safeHref)}" alt="${escapeAttribute(label)}">`;
      }
      return `<a href="${escapeAttribute(safeHref)}">${escapeHtml(label)}</a>`;
    }
    if (/^\[\d{1,2}:\d{2}/.test(part)) return `<span class="timestamp">${escapeHtml(part)}</span>`;
    return escapeHtml(part);
  }).join('');
}

function isTableStart(lines: string[], index: number): boolean {
  return /^\s*\|.+\|\s*$/.test(lines[index] || '') && /^\s*\|?[\s:-]+\|[\s|:-]*$/.test(lines[index + 1] || '');
}

function splitTableRow(line: string): string[] {
  return line.replace(/^\||\|$/g, '').split('|').map((cell) => cell.trim());
}

function getSafeHref(href: string): string | null {
  const trimmed = href.trim();
  if (/^(https?:|data:image\/|images\/|\.\/|\/)/i.test(trimmed)) return trimmed;
  return null;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeAttribute(value: string): string {
  return escapeHtml(value).replace(/`/g, '&#96;');
}

const HTML_STYLE = `
:root {
  color-scheme: light;
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  background: #f8fafc;
  color: #0f172a;
}
body { margin: 0; }
.page { max-width: 860px; margin: 0 auto; padding: 32px 18px 64px; }
.hero, .note, .frames { border: 1px solid #e2e8f0; border-radius: 12px; background: #fff; box-shadow: 0 12px 30px rgba(15, 23, 42, 0.06); }
.hero { padding: 28px; margin-bottom: 18px; }
.brand { display: inline-flex; padding: 4px 10px; border-radius: 999px; background: #dbeafe; color: #1d4ed8; font-size: 12px; font-weight: 700; }
h1 { margin: 14px 0 18px; font-size: clamp(28px, 5vw, 44px); line-height: 1.12; }
.meta { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 10px; margin: 0; }
.meta div { padding: 10px 12px; border-radius: 10px; background: #f8fafc; }
.meta dt { margin-bottom: 4px; color: #64748b; font-size: 12px; }
.meta dd { margin: 0; font-size: 13px; line-height: 1.55; word-break: break-word; }
.frames { padding: 22px; margin-bottom: 18px; }
.frame-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 14px; }
figure { margin: 0; }
figure img { width: 100%; border-radius: 10px; border: 1px solid #e2e8f0; }
figcaption { margin-top: 6px; color: #64748b; font-size: 12px; }
.note { padding: 28px; font-size: 15px; line-height: 1.85; }
.note h2 { margin: 26px 0 10px; padding-bottom: 8px; border-bottom: 1px solid #e2e8f0; font-size: 24px; }
.note h3 { margin: 22px 0 8px; font-size: 19px; }
.note h4 { margin: 18px 0 6px; font-size: 16px; }
.note p { margin: 10px 0; }
.note ul, .note ol { padding-left: 22px; }
.note li { margin: 5px 0; }
blockquote { margin: 14px 0; padding: 10px 14px; border-left: 3px solid #60a5fa; border-radius: 0 10px 10px 0; background: #eff6ff; color: #334155; }
pre { overflow: auto; padding: 14px; border-radius: 10px; background: #0f172a; color: #e2e8f0; font-size: 13px; }
code { border-radius: 5px; background: #e2e8f0; padding: 2px 5px; font-size: 0.9em; }
pre code { background: transparent; padding: 0; }
a { color: #2563eb; }
.timestamp { border-radius: 6px; background: #dbeafe; padding: 2px 6px; color: #1d4ed8; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.88em; }
.table-wrap { overflow-x: auto; margin: 14px 0; border: 1px solid #e2e8f0; border-radius: 10px; }
table { width: 100%; border-collapse: collapse; font-size: 14px; }
th, td { padding: 9px 11px; border-bottom: 1px solid #e2e8f0; text-align: left; vertical-align: top; }
th { background: #f8fafc; color: #475569; }
@media (max-width: 640px) {
  .page { padding: 14px 10px 36px; }
  .hero, .note, .frames { border-radius: 10px; padding: 18px; }
}
`;
