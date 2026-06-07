import type { ObsidianConfig } from './settings';
import type { KeyFrame } from './keyFrames';
import { sanitizeFileName } from './note';

export interface ObsidianSaveInput {
  config: ObsidianConfig;
  filePath: string;
  content: string;
  attachments?: ObsidianAttachment[];
}

export interface ObsidianAttachment {
  path: string;
  data: Uint8Array;
  contentType: string;
}

export async function saveToObsidianRest({ config, filePath, content, attachments = [] }: ObsidianSaveInput): Promise<void> {
  const baseUrl = normalizeRestUrl(config.restUrl);
  const apiKey = normalizeApiKey(config.restApiKey);
  if (!baseUrl) throw new Error('请先填写 Obsidian REST API 地址');
  if (!apiKey) throw new Error('请先填写 Obsidian REST API Key');

  const normalizedPath = normalizeVaultPath(filePath);
  if (!normalizedPath) throw new Error('Obsidian 文件路径为空');

  for (const attachment of attachments) {
    const attachmentPath = normalizeVaultPath(attachment.path);
    if (!attachmentPath) continue;
    const attachmentResponse = await fetch(`${baseUrl}/vault/${encodeVaultPath(attachmentPath)}`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': attachment.contentType,
      },
      body: new Blob([toArrayBuffer(attachment.data)], { type: attachment.contentType }),
    });

    if (!attachmentResponse.ok) {
      const message = await attachmentResponse.text().catch(() => '');
      throw new Error(explainObsidianRestError(attachmentResponse.status, message));
    }
  }

  const response = await fetch(`${baseUrl}/vault/${encodeVaultPath(normalizedPath)}`, {
    method: config.restOverwrite ? 'PUT' : 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'text/markdown; charset=utf-8',
    },
    body: content,
  });

  if (!response.ok) {
    const message = await response.text().catch(() => '');
    throw new Error(explainObsidianRestError(response.status, message));
  }
}

export function buildObsidianNotePath(folder: string, noteName: string): string {
  const cleanFolder = normalizeVaultPath(folder);
  const cleanName = normalizeVaultPath(noteName).replace(/\.md$/i, '');
  return `${cleanFolder ? `${cleanFolder}/` : ''}${cleanName}.md`;
}

export function buildObsidianRestNotePath(config: ObsidianConfig, noteName: string): string {
  const rootFolder = normalizeVaultPath([config.vault, config.folder].filter((value) => value.trim()).join('/'));
  return buildObsidianNotePath(rootFolder, noteName);
}

export function buildObsidianRestPayload(filePath: string, content: string, keyFrames: KeyFrame[]): {
  content: string;
  attachments: ObsidianAttachment[];
} {
  const normalizedPath = normalizeVaultPath(filePath);
  const noteDir = getDirName(normalizedPath);
  const noteBase = sanitizeFileName(getBaseName(normalizedPath).replace(/\.md$/i, ''));
  const assetFolderName = '_assets';
  const attachmentRoot = normalizeVaultPath([noteDir, assetFolderName, noteBase].filter(Boolean).join('/'));
  const attachments: ObsidianAttachment[] = [];
  let nextContent = cleanupObsidianBody(content, noteBase);

  keyFrames.forEach((frame, index) => {
    const parsed = parseDataUrl(frame.dataUrl);
    if (!parsed) return;

    const fileName = `frame-${String(index + 1).padStart(2, '0')}.${extensionFromMime(parsed.mime)}`;
    const attachmentPath = normalizeVaultPath(`${attachmentRoot}/${fileName}`);
    const relativePath = encodeMarkdownHref(`${assetFolderName}/${noteBase}/${fileName}`);
    const imageMarkdown = `![${escapeMarkdownAlt(frame.title)}](${relativePath})`;
    attachments.push({ path: attachmentPath, data: parsed.bytes, contentType: parsed.mime });

    nextContent = replaceAll(nextContent, frame.dataUrl, relativePath);
    nextContent = replaceImageMarker(nextContent, frame, imageMarkdown);
  });

  nextContent = polishObsidianContent(nextContent);
  return { content: nextContent, attachments };
}

function cleanupObsidianBody(content: string, noteBase: string): string {
  const lines = content.replace(/\r\n/g, '\n').split('\n');
  const output: string[] = [];
  let index = 0;

  if (lines[0]?.trim() === '---') {
    output.push(lines[index++]);
    while (index < lines.length) {
      output.push(lines[index]);
      if (lines[index].trim() === '---') {
        index += 1;
        break;
      }
      index += 1;
    }
  }

  while (index < lines.length && lines[index].trim() === '') index += 1;
  if (/^#\s+/.test(lines[index] || '')) {
    index += 1;
    while (index < lines.length && lines[index].trim() === '') index += 1;
  }

  const metadataStart = index;
  while (index < lines.length && /^-\s+(来源|总结模式|笔记模板|模型|生成时间|Token\s*消耗|费用估算|视频链接|关键画面)：/.test(lines[index].trim())) {
    index += 1;
  }
  if (index > metadataStart) {
    while (index < lines.length && lines[index].trim() === '') index += 1;
  } else {
    index = metadataStart;
  }

  if (/^##\s+关键画面\s*$/.test(lines[index]?.trim() || '')) {
    index += 1;
    while (index < lines.length && !/^##\s+/.test(lines[index] || '')) index += 1;
    while (index < lines.length && lines[index].trim() === '') index += 1;
  }

  output.push(...lines.slice(index));
  return addObsidianToc(enhanceObsidianTags(output.join('\n'), noteBase)).trimEnd() + '\n';
}

function enhanceObsidianTags(content: string, noteBase: string): string {
  const match = /^---\n([\s\S]*?)\n---\n?/.exec(content);
  if (!match) return content;

  const generatedTags = generateObsidianTags(`${noteBase}\n${content}`);
  const frontmatter = match[1];
  const body = content.slice(match[0].length);
  const frontmatterLines = frontmatter.split('\n');
  const output: string[] = [];
  let index = 0;
  let replacedTags = false;

  while (index < frontmatterLines.length) {
    const line = frontmatterLines[index];
    if (/^tags:\s*$/.test(line.trim())) {
      replacedTags = true;
      output.push('tags:');
      for (const tag of generatedTags) output.push(`  - ${tag}`);
      index += 1;
      while (index < frontmatterLines.length && /^\s+-\s+/.test(frontmatterLines[index])) index += 1;
      continue;
    }
    output.push(line);
    index += 1;
  }

  if (!replacedTags) {
    output.push('tags:');
    for (const tag of generatedTags) output.push(`  - ${tag}`);
  }

  return ['---', ...output, '---', body].join('\n');
}

function generateObsidianTags(text: string): string[] {
  const rules: Array<[string, RegExp]> = [
    ['B站视频笔记', /B站|bilibili|视频笔记/i],
    ['AI', /\bAI\b|人工智能|Claude|OpenAI|DeepSeek|Gemini/i],
    ['ClaudeCode', /Claude\s*Code/i],
    ['Ghostty', /Ghostty/i],
    ['Starship', /Starship/i],
    ['Obsidian', /Obsidian/i],
    ['终端工具', /终端|terminal|shell|命令行|Ghostty|Starship/i],
    ['教程', /教程|步骤|安装|配置|操作流程|前置条件/i],
    ['发布会', /发布会|主题演讲|keynote|GTC/i],
    ['观点摘录', /观点|论点|行业影响|待验证/i],
  ];
  const tags = rules.filter(([, pattern]) => pattern.test(text)).map(([tag]) => tag);
  return [...new Set(tags)].slice(0, 6);
}

function addObsidianToc(content: string): string {
  const match = /^---\n[\s\S]*?\n---\n?/.exec(content);
  const frontmatter = match ? match[0].trimEnd() : '';
  const body = match ? content.slice(match[0].length) : content;
  const headings = extractTocHeadings(body);
  if (headings.length < 2) return content;

  const toc = [
    '## 目录',
    '',
    ...headings.map((heading) => `${heading.level > 2 ? '  ' : ''}- [[#${heading.title}|${heading.title}]]`),
    '',
  ].join('\n');
  return [frontmatter, toc, body.trimStart()].filter(Boolean).join('\n');
}

function extractTocHeadings(body: string): Array<{ level: number; title: string }> {
  const headings: Array<{ level: number; title: string }> = [];
  for (const line of body.split('\n')) {
    const match = /^(#{2,3})\s+(.+?)\s*$/.exec(line);
    if (!match) continue;
    const title = cleanHeadingTitle(match[2]);
    if (!title || title === '目录' || title === '关键画面') continue;
    headings.push({ level: match[1].length, title });
    if (headings.length >= 10) break;
  }
  return headings;
}

function cleanHeadingTitle(title: string): string {
  return title
    .replace(/\[[^\]]+\]\([^)]*\)/g, '')
    .replace(/[`*_~#]/g, '')
    .trim();
}

function polishObsidianContent(content: string): string {
  return content
    .replace(/^\[<image>\s*@\s*\d{1,2}:\d{2}(?::\d{2})?\]\s*$/gim, '')
    .replace(/^⚠️\s*重要限制\s*：/gm, '> 注意：')
    .replace(/^(\s*)(\d+)\s+\.\s+/gm, '$1$2. ')
    .replace(/^\s*[-*]\s*$/gm, '')
    .replace(/^\s*时间戳：\s*\n\s*(\[[^\]]+\])/gm, '**时间戳**：$1')
    .replace(/\n{4,}/g, '\n\n\n');
}

function normalizeRestUrl(url: string): string {
  return url.trim().replace(/\/+$/, '');
}

function normalizeApiKey(value: string): string {
  return value.trim().replace(/^Bearer\s+/i, '').trim();
}

function normalizeVaultPath(path: string): string {
  return path
    .trim()
    .replace(/^\/+|\/+$/g, '')
    .replace(/\\/g, '/')
    .replace(/\/{2,}/g, '/');
}

function encodeVaultPath(path: string): string {
  return path.split('/').map(encodeURIComponent).join('/');
}

function getDirName(path: string): string {
  const index = path.lastIndexOf('/');
  return index >= 0 ? path.slice(0, index) : '';
}

function getBaseName(path: string): string {
  const index = path.lastIndexOf('/');
  return index >= 0 ? path.slice(index + 1) : path;
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

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function extensionFromMime(mime: string): string {
  if (mime.includes('png')) return 'png';
  if (mime.includes('webp')) return 'webp';
  if (mime.includes('svg')) return 'svg';
  return 'jpg';
}

function encodeMarkdownHref(path: string): string {
  return encodeURI(path).replace(/[()]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
}

function escapeMarkdownAlt(value: string): string {
  return value.replace(/[\[\]\n\r]/g, ' ').replace(/\s+/g, ' ').trim() || '关键画面';
}

function replaceAll(value: string, search: string, replacement: string): string {
  return search ? value.split(search).join(replacement) : value;
}

function replaceImageMarker(content: string, frame: KeyFrame, imageMarkdown: string): string {
  const markers = [
    formatMarkerTime(frame.anchorSeconds ?? frame.seconds),
    formatMarkerTime(frame.seconds),
  ].filter((marker, index, list) => marker && list.indexOf(marker) === index);
  let nextContent = content;
  for (const marker of markers) {
    const pattern = new RegExp(`^\\[<image>\\s*@\\s*${escapeRegExp(marker)}\\]$`, 'gim');
    nextContent = nextContent.replace(pattern, imageMarkdown);
  }
  return nextContent;
}

function formatMarkerTime(seconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(seconds || 0));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const secs = safeSeconds % 60;
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  return `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function explainObsidianRestError(status: number, message: string): string {
  if (status === 401 || status === 403) return 'Obsidian REST API Key 无效或权限不足';
  if (status === 404) return 'Obsidian REST API 未找到目标路径，请检查文件夹或插件状态';
  if (status === 409) return '同名笔记已存在，请开启覆盖或修改标题';
  return `Obsidian REST API 写入失败 (${status})${message ? `: ${message}` : ''}`;
}
