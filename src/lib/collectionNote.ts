import type { TokenUsage } from './summarizer';
import { formatUsage } from './note';

export interface CollectionPartNote {
  page: number;
  title: string;
  content: string;
  subtitleCount: number;
  source: 'cc' | 'whisper';
  usage: TokenUsage | null;
  error?: string | null;
}

export function buildCollectionMarkdown({
  title,
  parts,
  synthesis,
}: {
  title: string;
  parts: CollectionPartNote[];
  synthesis?: string | null;
}): string {
  const completed = parts.filter((part) => !part.error);
  const failed = parts.filter((part) => part.error);
  return [
    `# ${title}（合集笔记）`,
    '',
    '## 合集目录',
    '',
    ...parts.map((part) => {
      const status = part.error ? `失败：${part.error}` : `${part.subtitleCount} 条字幕 / ${part.source === 'whisper' ? 'Whisper' : 'CC'} / ${formatUsage(part.usage)}`;
      return `- [P${part.page} ${part.title}](#p${part.page}-${slugify(part.title)})：${status}`;
    }),
    '',
    '## 生成概况',
    '',
    `- 完成分 P：${completed.length}/${parts.length}`,
    failed.length ? `- 失败分 P：${failed.map((part) => `P${part.page}`).join('、')}` : '- 失败分 P：无',
    '',
    renderTopicIndex(completed),
    synthesis?.trim()
      ? [
          '## 全集综合总结',
          '',
          synthesis.trim(),
          '',
        ].join('\n')
      : null,
    ...parts.flatMap((part) => [
      `## P${part.page} ${part.title}`,
      '',
      part.error
        ? `> 该分 P 生成失败：${part.error}`
        : [
            `- 字幕来源：${part.source === 'whisper' ? 'Whisper' : 'CC'}`,
            `- 字幕数量：${part.subtitleCount}`,
            `- Token 消耗：${formatUsage(part.usage)}`,
            '',
            part.content.trim(),
          ].join('\n'),
      '',
    ]),
  ].filter((line) => line != null).join('\n');
}

export function extractCollectionTopics(parts: CollectionPartNote[]): Array<{ topic: string; refs: Array<{ page: number; title: string }> }> {
  const topicRefs = new Map<string, Array<{ page: number; title: string }>>();
  for (const part of parts) {
    if (part.error || !part.content.trim()) continue;
    const headings = part.content
      .split('\n')
      .map((line) => /^(#{2,3})\s+(.+)$/.exec(line.trim())?.[2])
      .filter(Boolean)
      .map((heading) => normalizeTopic(String(heading)));
    for (const topic of headings) {
      if (!topic) continue;
      const refs = topicRefs.get(topic) || [];
      if (!refs.some((ref) => ref.page === part.page)) {
        refs.push({ page: part.page, title: part.title });
      }
      topicRefs.set(topic, refs);
    }
  }
  return [...topicRefs.entries()]
    .map(([topic, refs]) => ({ topic, refs }))
    .sort((left, right) => right.refs.length - left.refs.length || left.topic.localeCompare(right.topic, 'zh-Hans-CN'));
}

export function mergeTokenUsage(usages: Array<TokenUsage | null | undefined>): TokenUsage | null {
  const valid = usages.filter(Boolean) as TokenUsage[];
  if (!valid.length) return null;
  const promptTokens = sumUsage(valid, 'promptTokens');
  const completionTokens = sumUsage(valid, 'completionTokens');
  const totalTokens = sumUsage(valid, 'totalTokens') ?? addOptional(promptTokens, completionTokens);
  return { promptTokens, completionTokens, totalTokens };
}

function sumUsage(usages: TokenUsage[], key: keyof TokenUsage): number | undefined {
  let sum = 0;
  let hasValue = false;
  for (const usage of usages) {
    const value = usage[key];
    if (value != null) {
      sum += value;
      hasValue = true;
    }
  }
  return hasValue ? sum : undefined;
}

function addOptional(left?: number, right?: number): number | undefined {
  if (left == null && right == null) return undefined;
  return (left || 0) + (right || 0);
}

function renderTopicIndex(parts: CollectionPartNote[]): string | null {
  const topics = extractCollectionTopics(parts).slice(0, 24);
  if (!topics.length) return null;
  return [
    '## 按主题索引',
    '',
    ...topics.map(({ topic, refs }) => `- ${topic}：${refs.map((ref) => `P${ref.page} ${ref.title}`).join('、')}`),
    '',
  ].join('\n');
}

function normalizeTopic(value: string): string {
  return value
    .replace(/\*\*/g, '')
    .replace(/\[[^\]]+\]/g, '')
    .replace(/^P\d+\s*/i, '')
    .trim()
    .slice(0, 40);
}

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}
