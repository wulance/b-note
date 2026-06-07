import { normalizeMarkdownContent } from './note';

export type TelegraphNode = string | {
  tag: string;
  attrs?: Record<string, string>;
  children?: TelegraphNode[];
};

export interface TelegraphPublishInput {
  title: string;
  authorName?: string;
  videoUrl?: string | null;
  content: unknown;
  images?: Array<{ title: string; dataUrl: string }>;
}

const MAX_PAGE_CONTENT_CHARS = 24000;

export async function publishToTelegraph(input: TelegraphPublishInput): Promise<string> {
  const token = await createTelegraphToken(input.authorName || 'b-note');
  const uploadedImages = await uploadTelegraphImages(input.images || []);
  const title = cleanTelegraphTitle(input.title);

  const contentNodes = [
    ...createImageNodes(uploadedImages),
    ...markdownToTelegraphNodes(input.content, input.videoUrl, { title }),
  ];
  const chunks = splitTelegraphNodes(contentNodes);
  if (chunks.length <= 1) {
    return createTelegraphPage(token, title, input.authorName || 'b-note', contentNodes);
  }

  const chunkDescriptions = chunks.map((chunk) => describeTelegraphChunk(chunk));
  const pageUrls: string[] = [];
  for (let index = 0; index < chunks.length; index += 1) {
    const pageTitle = `${title}（${index + 1}/${chunks.length}）`;
    const description = chunkDescriptions[index];
    const pageNodes = [
      {
        tag: 'p',
        children: [
          `第 ${index + 1} / ${chunks.length} 卷`,
          description.range ? ` · ${description.range}` : '',
          description.title ? ` · ${description.title}` : '',
          '。可从目录页打开其它分卷。',
        ],
      },
      ...chunks[index],
    ];
    pageUrls.push(await createTelegraphPage(token, pageTitle, input.authorName || 'b-note', pageNodes));
  }

  const indexNodes: TelegraphNode[] = [
    { tag: 'p', children: ['这篇笔记内容较长，已自动拆成多个分卷。建议按顺序阅读，也可以根据时间范围直接跳到对应分卷。'] },
    ...(input.videoUrl ? [{ tag: 'p', children: ['来源：', { tag: 'a', attrs: { href: input.videoUrl }, children: [input.videoUrl] }] } as TelegraphNode] : []),
    { tag: 'h3', children: ['阅读目录'] },
    {
      tag: 'ul',
      children: pageUrls.map((url, index) => ({
        tag: 'li',
        children: [
          {
            tag: 'a',
            attrs: { href: url },
            children: [
              [
                `第 ${index + 1} 卷`,
                chunkDescriptions[index]?.range,
                chunkDescriptions[index]?.title,
              ].filter(Boolean).join(' · '),
            ],
          },
        ],
      })),
    },
  ];
  return createTelegraphPage(token, `${title}（阅读目录）`, input.authorName || 'b-note', indexNodes);
}

async function createTelegraphPage(
  token: string,
  title: string,
  authorName: string,
  content: TelegraphNode[],
): Promise<string> {
  const params = new URLSearchParams();
  params.set('access_token', token);
  params.set('title', title.slice(0, 256) || 'b-note');
  params.set('author_name', authorName);
  params.set('content', JSON.stringify(content));
  params.set('return_content', 'false');

  const response = await fetch('https://api.telegra.ph/createPage', {
    method: 'POST',
    body: params,
  });
  const data = await response.json();
  if (!data.ok || !data.result?.url) {
    throw new Error(data.error || 'Telegraph 发布失败');
  }
  return data.result.url;
}

export function splitTelegraphNodes(nodes: TelegraphNode[], maxChars = MAX_PAGE_CONTENT_CHARS): TelegraphNode[][] {
  const chunks: TelegraphNode[][] = [];
  let current: TelegraphNode[] = [];
  let currentSize = 2;

  for (const node of nodes.flatMap((item) => splitLargeTelegraphNode(item, maxChars))) {
    const nodeSize = JSON.stringify(node).length + 1;
    if (current.length && currentSize + nodeSize > maxChars) {
      chunks.push(current);
      current = [];
      currentSize = 2;
    }
    current.push(node);
    currentSize += nodeSize;
  }
  if (current.length) chunks.push(current);
  return chunks.length ? chunks : [[]];
}

function splitLargeTelegraphNode(node: TelegraphNode, maxChars: number): TelegraphNode[] {
  if (typeof node === 'string') return splitTextNode(node, maxChars);
  const size = JSON.stringify(node).length;
  if (size <= maxChars) return [node];
  if ((node.tag === 'p' || node.tag === 'blockquote' || node.tag === 'pre') && node.children?.length) {
    const text = flattenText(node.children);
    return splitTextNode(text, Math.max(1000, maxChars - 500)).map((part) => ({
      ...node,
      children: [part],
    }));
  }
  if ((node.tag === 'ul' || node.tag === 'ol') && node.children?.length) {
    return node.children.flatMap((child) => splitLargeTelegraphNode(child, maxChars));
  }
  return [node];
}

function splitTextNode(text: string, maxChars: number): string[] {
  if (text.length <= maxChars) return [text];
  const parts: string[] = [];
  let rest = text;
  while (rest.length > maxChars) {
    const cut = Math.max(
      rest.lastIndexOf('\n', maxChars),
      rest.lastIndexOf('。', maxChars),
      rest.lastIndexOf('. ', maxChars),
    );
    const end = cut > maxChars * 0.35 ? cut + 1 : maxChars;
    parts.push(rest.slice(0, end).trim());
    rest = rest.slice(end).trim();
  }
  if (rest) parts.push(rest);
  return parts;
}

function flattenText(nodes: TelegraphNode[]): string {
  return nodes.map((node) => {
    if (typeof node === 'string') return node;
    return node.children ? flattenText(node.children) : '';
  }).join('');
}

function describeTelegraphChunk(nodes: TelegraphNode[]): { title: string; range: string } {
  const title = findFirstHeadingText(nodes);
  const range = findTimestampRange(flattenText(nodes));
  return { title, range };
}

function findFirstHeadingText(nodes: TelegraphNode[]): string {
  for (const node of nodes) {
    if (typeof node === 'string') continue;
    if ((node.tag === 'h3' || node.tag === 'h4') && node.children?.length) {
      const heading = flattenText(node.children).trim();
      if (heading && heading !== '关键画面') return heading.slice(0, 60);
    }
  }
  return '';
}

function findTimestampRange(text: string): string {
  const matches = Array.from(text.matchAll(/\[(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\s*[-–]\s*(\d{1,2}):(\d{2})(?::(\d{2}))?)?\]/g));
  let first: number | null = null;
  let last: number | null = null;
  for (const match of matches) {
    const start = timestampPartsToSeconds(match[1], match[2], match[3]);
    const end = match[4] ? timestampPartsToSeconds(match[4], match[5], match[6]) : start;
    const min = Math.min(start, end);
    const max = Math.max(start, end);
    if (first == null || min < first) first = min;
    if (last == null || max > last) last = max;
  }
  if (first == null || last == null) return '';
  return first === last ? formatTimestamp(first) : `${formatTimestamp(first)} - ${formatTimestamp(last)}`;
}

function timestampPartsToSeconds(first: string, second: string, third?: string): number {
  const a = Number(first);
  const b = Number(second);
  const c = third == null ? null : Number(third);
  if (c == null) return a * 60 + b;
  return a * 3600 + b * 60 + c;
}

function formatTimestamp(seconds: number): string {
  const hour = Math.floor(seconds / 3600);
  const minute = Math.floor((seconds % 3600) / 60);
  const second = seconds % 60;
  const paddedMinute = String(minute).padStart(2, '0');
  const paddedSecond = String(second).padStart(2, '0');
  if (hour > 0) return `${hour}:${paddedMinute}:${paddedSecond}`;
  return `${minute}:${paddedSecond}`;
}

export async function uploadTelegraphImages(images: Array<{ title: string; dataUrl: string }>): Promise<Array<{ title: string; url: string }>> {
  const uploaded: Array<{ title: string; url: string }> = [];
  for (const image of images.slice(0, 8)) {
    const blob = dataUrlToBlob(image.dataUrl);
    if (!blob) continue;
    const form = new FormData();
    form.set('file', new File([blob], `${sanitizeFileName(image.title)}.${extensionFromMime(blob.type)}`, { type: blob.type }));
    const response = await fetch('https://telegra.ph/upload', {
      method: 'POST',
      body: form,
    });
    const data = await response.json().catch(() => null);
    const src = Array.isArray(data) ? data[0]?.src : null;
    if (response.ok && src) {
      uploaded.push({
        title: image.title,
        url: src.startsWith('http') ? src : `https://telegra.ph${src}`,
      });
    }
  }
  return uploaded;
}

export function markdownToTelegraphNodes(
  content: unknown,
  videoUrl?: string | null,
  options: { title?: string } = {},
): TelegraphNode[] {
  const lines = prepareTelegraphMarkdown(normalizeMarkdownContent(content)).split('\n');
  const nodes: TelegraphNode[] = [];
  if (videoUrl) {
    nodes.push({
      tag: 'p',
      children: ['来源：', { tag: 'a', attrs: { href: videoUrl }, children: [videoUrl] }],
    });
  }
  nodes.push(...createReadingGuideNodes(lines, options.title));

  let index = 0;
  while (index < lines.length) {
    const trimmed = lines[index].trim();
    if (!trimmed || trimmed === '---') {
      index += 1;
      continue;
    }

    const heading = /^(#{1,4})\s+(.+)$/.exec(trimmed);
    if (heading) {
      nodes.push({
        tag: heading[1].length <= 2 ? 'h3' : 'h4',
        children: renderInline(heading[2]),
      });
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
      nodes.push({ tag: 'pre', children: [code.join('\n')] });
      index += index < lines.length ? 1 : 0;
      continue;
    }

    if (trimmed.startsWith('> ')) {
      const quote: string[] = [];
      while (index < lines.length && lines[index].trim().startsWith('> ')) {
        quote.push(lines[index].trim().slice(2));
        index += 1;
      }
      nodes.push({ tag: 'blockquote', children: quote.flatMap((line, lineIndex) => lineIndex ? ['\n', ...renderInline(line)] : renderInline(line)) });
      continue;
    }

    if (/^[-*]\s+/.test(trimmed) || /^\d+\.\s+/.test(trimmed)) {
      const items: TelegraphNode[] = [];
      const ordered = /^\d+\.\s+/.test(trimmed);
      while (index < lines.length) {
        const next = lines[index].trim();
        const match = ordered ? /^\d+\.\s+(.+)$/.exec(next) : /^[-*]\s+(.+)$/.exec(next);
        if (!match) break;
        items.push({ tag: 'li', children: renderInline(match[1]) });
        index += 1;
      }
      nodes.push({ tag: ordered ? 'ol' : 'ul', children: items });
      continue;
    }

    const paragraph: string[] = [];
    while (index < lines.length && lines[index].trim()) {
      const next = lines[index].trim();
      if (/^(#{1,4})\s+/.test(next) || /^```/.test(next) || /^[-*]\s+/.test(next) || /^\d+\.\s+/.test(next) || next.startsWith('> ')) {
        break;
      }
      paragraph.push(next);
      index += 1;
    }
    nodes.push({ tag: 'p', children: renderInline(paragraph.join(' ')) });
  }

  return nodes;
}

function createReadingGuideNodes(lines: string[], title?: string): TelegraphNode[] {
  const headings = lines
    .map((line) => /^(#{2,4})\s+(.+)$/.exec(line.trim()))
    .filter((match): match is RegExpExecArray => Boolean(match))
    .map((match) => match[2].replace(/\[<image>@[^\]]+\]/g, '').trim())
    .filter((heading) => heading && heading !== title && heading !== '关键画面')
    .slice(0, 8);

  if (headings.length < 4) return [];
  return [
    { tag: 'h3', children: ['阅读提示'] },
    {
      tag: 'ul',
      children: headings.map((heading) => ({
        tag: 'li',
        children: [heading],
      })),
    },
  ];
}

function createImageNodes(images: Array<{ title: string; url: string }>): TelegraphNode[] {
  if (!images.length) return [];
  return [
    { tag: 'h3', children: ['关键画面'] },
    ...images.flatMap((image) => [
      { tag: 'figure', children: [
        { tag: 'img', attrs: { src: image.url } },
        { tag: 'figcaption', children: [image.title] },
      ] },
    ] as TelegraphNode[]),
  ];
}

async function createTelegraphToken(authorName: string): Promise<string> {
  const params = new URLSearchParams();
  params.set('short_name', 'b-note');
  params.set('author_name', authorName);
  const response = await fetch('https://api.telegra.ph/createAccount', {
    method: 'POST',
    body: params,
  });
  const data = await response.json();
  if (!data.ok || !data.result?.access_token) {
    throw new Error(data.error || 'Telegraph 账号创建失败');
  }
  return data.result.access_token;
}

function renderInline(text: string): TelegraphNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g);
  return parts.map((part) => {
    if (!part) return '';
    if (part.startsWith('**') && part.endsWith('**')) {
      return { tag: 'strong', children: [part.slice(2, -2)] };
    }
    if (part.startsWith('`') && part.endsWith('`')) {
      return { tag: 'code', children: [part.slice(1, -1)] };
    }
    const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(part);
    if (link && /^https?:\/\//i.test(link[2])) {
      return { tag: 'a', attrs: { href: link[2] }, children: [link[1]] };
    }
    if (link) return link[1];
    return part.replace(/^!\[([^\]]*)\]\([^)]+\)$/, '$1');
  }).filter((part) => part !== '');
}

function prepareTelegraphMarkdown(markdown: string): string {
  return stripNoteHeader(stripYamlFrontmatter(markdown)).trimStart();
}

function stripYamlFrontmatter(markdown: string): string {
  return markdown.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '').trimStart();
}

function stripNoteHeader(markdown: string): string {
  const lines = markdown.split('\n');
  const firstContentIndex = lines.findIndex((line) => line.trim());
  if (firstContentIndex < 0 || !/^#\s+/.test(lines[firstContentIndex].trim())) return markdown;

  let index = firstContentIndex + 1;
  while (index < lines.length && !lines[index].trim()) index += 1;
  const metadataKeys = /-\s*(来源|总结模式|笔记模板|模型|生成时间|Token\s*消耗|费用估算|视频链接|关键画面)：/;
  let metadataCount = 0;
  while (index < lines.length && metadataKeys.test(lines[index].trim())) {
    metadataCount += 1;
    index += 1;
  }
  if (!metadataCount) return markdown;
  while (index < lines.length && !lines[index].trim()) index += 1;
  return [
    ...lines.slice(0, firstContentIndex),
    ...lines.slice(index),
  ].join('\n').trimStart();
}

function cleanTelegraphTitle(title: string): string {
  let trimmed = title.trim().replace(/[（(](?:目录|阅读目录)[）)]$/u, '');
  trimmed = trimmed.replace(/\s+-\s+P(\d+)\s+(.+)$/u, (match, page: string, partTitle: string, offset: number, full: string) => {
    const base = full.slice(0, offset).trim();
    return partTitle.trim() === base ? '' : ` - P${page} ${partTitle.trim()}`;
  }).trim();
  return trimmed || 'b-note';
}

function dataUrlToBlob(dataUrl: string): Blob | null {
  const match = /^data:([^;,]+);base64,(.+)$/i.exec(dataUrl.trim());
  if (!match) return null;
  try {
    const bytes = Uint8Array.from(atob(match[2]), (char) => char.charCodeAt(0));
    return new Blob([bytes], { type: match[1].toLowerCase() });
  } catch {
    return null;
  }
}

function extensionFromMime(mime: string): string {
  if (mime.includes('png')) return 'png';
  if (mime.includes('webp')) return 'webp';
  return 'jpg';
}

function sanitizeFileName(name: string): string {
  return name.trim().replace(/[\\/:*?"<>|]/g, '-').replace(/\s+/g, ' ').slice(0, 60) || 'frame';
}
