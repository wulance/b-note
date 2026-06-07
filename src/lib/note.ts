import type { SummaryMode, SummaryTemplate, TokenUsage } from './summarizer';
import { getTemplateLabel } from './summarizer';
import {
  estimateUsageCost,
  formatEstimatedCost,
  type PricingConfig,
} from './cost';
import type { FrontmatterFieldKey, FrontmatterFieldMap } from './frontmatter';

export function getModeLabel(mode: SummaryMode): string {
  return { quick: '速览', standard: '标准', detailed: '详细' }[mode];
}

export function formatUsage(usage: TokenUsage | null | undefined): string {
  if (!usage) return 'token 用量未知';
  const total = usage.totalTokens ?? addOptional(usage.promptTokens, usage.completionTokens);
  const parts = [
    total != null ? `总计 ${total}` : null,
    usage.promptTokens != null ? `输入 ${usage.promptTokens}` : null,
    usage.completionTokens != null ? `输出 ${usage.completionTokens}` : null,
  ].filter(Boolean);
  return parts.length ? `${parts.join(' / ')} tokens` : 'token 用量未知';
}

export function formatGeneratedAt(generatedAt: string | null | undefined): string {
  const date = generatedAt ? new Date(generatedAt) : new Date();
  if (Number.isNaN(date.getTime())) return new Date().toLocaleString();
  return date.toLocaleString();
}

export function buildNoteMarkdown({
  videoTitle,
  videoUrl,
  content,
  mode,
  template,
  generatedAt,
  usage,
  providerName,
  model,
  keyFrames,
  pricing,
  tags,
  extraFrontmatter,
  fieldMap,
}: {
  videoTitle: string;
  videoUrl?: string | null;
  content: unknown;
  mode: SummaryMode;
  template?: SummaryTemplate | null;
  generatedAt: string | null;
  usage: TokenUsage | null;
  providerName: string | null;
  model: string | null;
  keyFrames?: Array<{ title: string; dataUrl: string; capturedAt: string }>;
  pricing?: PricingConfig | null;
  tags?: string[];
  extraFrontmatter?: Record<string, string>;
  fieldMap?: FrontmatterFieldMap;
}): string {
  const markdown = normalizeMarkdownContent(content).trim();
  const generated = formatGeneratedAt(generatedAt);
  const usageText = formatUsage(usage);
  const estimatedCost = pricing ? estimateUsageCost(usage, pricing) : null;
  const estimatedCostText = pricing ? formatEstimatedCost(estimatedCost, pricing.currency) : null;
  const frontmatterLines = buildFrontmatterLines({
    videoTitle,
    videoUrl,
    mode,
    template,
    generated,
    usage,
    providerName,
    model,
    keyFrameCount: keyFrames?.length || 0,
    estimatedCost,
    pricing,
    tags,
    extraFrontmatter,
    fieldMap,
  });
  return [
    '---',
    ...frontmatterLines,
    '---',
    '',
    `# ${videoTitle}`,
    '',
    `- 来源：B站`,
    `- 总结模式：${getModeLabel(mode)}`,
    template ? `- 笔记模板：${getTemplateLabel(template)}` : null,
    `- 模型：${[providerName, model].filter(Boolean).join(' / ') || '未知'}`,
    `- 生成时间：${generated}`,
    `- Token 消耗：${usageText}`,
    estimatedCostText ? `- 费用估算：${estimatedCostText}` : null,
    videoUrl ? `- 视频链接：${videoUrl}` : null,
    keyFrames?.length ? `- 关键画面：${keyFrames.length} 张` : null,
    '',
    ...(keyFrames?.length
      ? [
          '## 关键画面',
          '',
          ...keyFrames.flatMap((frame, index) => [
            `![关键画面 ${index + 1} - ${frame.title}](${frame.dataUrl})`,
            '',
            `> ${frame.title} · ${formatGeneratedAt(frame.capturedAt)}`,
            '',
          ]),
        ]
      : []),
    markdown,
    '',
  ]
    .filter((line) => line != null)
    .join('\n');
}

function buildFrontmatterLines({
  videoTitle,
  videoUrl,
  mode,
  template,
  generated,
  usage,
  providerName,
  model,
  keyFrameCount,
  estimatedCost,
  pricing,
  tags,
  extraFrontmatter,
  fieldMap,
}: {
  videoTitle: string;
  videoUrl?: string | null;
  mode: SummaryMode;
  template?: SummaryTemplate | null;
  generated: string;
  usage: TokenUsage | null;
  providerName: string | null;
  model: string | null;
  keyFrameCount: number;
  estimatedCost: number | null;
  pricing?: PricingConfig | null;
  tags?: string[];
  extraFrontmatter?: Record<string, string>;
  fieldMap?: FrontmatterFieldMap;
}): string[] {
  const lines: string[] = [];
  const usedKeys = new Set<string>();
  const addScalar = (sourceKey: FrontmatterFieldKey, value: string | number | null | undefined) => {
    if (value == null || value === '') return;
    const key = resolveFrontmatterKey(sourceKey, fieldMap);
    if (!key) return;
    usedKeys.add(key);
    lines.push(`${key}: ${typeof value === 'number' ? value : escapeYamlString(value)}`);
  };
  const addRaw = (sourceKey: FrontmatterFieldKey, value: string | number | null | undefined) => {
    if (value == null || value === '') return;
    const key = resolveFrontmatterKey(sourceKey, fieldMap);
    if (!key) return;
    usedKeys.add(key);
    lines.push(`${key}: ${value}`);
  };
  const addTagList = () => {
    const key = resolveFrontmatterKey('tags', fieldMap);
    if (!key) return;
    usedKeys.add(key);
    lines.push(`${key}:`);
    lines.push(...normalizeNoteTags(tags).map((tag) => `  - ${tag}`));
  };

  addRaw('source', 'bilibili');
  addScalar('title', videoTitle);
  addScalar('url', videoUrl);
  addRaw('summary_mode', getModeLabel(mode));
  addScalar('template', template ? getTemplateLabel(template) : null);
  addScalar('provider', providerName);
  addScalar('model', providerName || model ? [providerName, model].filter(Boolean).join(' / ') : null);
  addScalar('generated_at', generated);
  addRaw('tokens', usage?.totalTokens);
  addRaw('prompt_tokens', usage?.promptTokens);
  addRaw('completion_tokens', usage?.completionTokens);
  addRaw('estimated_cost', estimatedCost != null ? estimatedCost.toFixed(6) : null);
  addRaw('estimated_cost_currency', estimatedCost != null && pricing ? pricing.currency : null);
  addRaw('keyframes', keyFrameCount || null);

  for (const [key, value] of Object.entries(extraFrontmatter || {})) {
    if (!usedKeys.has(key)) {
      usedKeys.add(key);
      lines.push(`${key}: ${escapeYamlString(value)}`);
    }
  }
  addTagList();
  return lines;
}

function resolveFrontmatterKey(sourceKey: FrontmatterFieldKey, fieldMap: FrontmatterFieldMap | undefined): string | null {
  if (!fieldMap || !(sourceKey in fieldMap)) return sourceKey;
  return fieldMap[sourceKey] || null;
}

function normalizeNoteTags(tags: string[] | undefined): string[] {
  const normalized = [...new Set(['B站视频笔记', ...(tags || [])].map((tag) => tag.trim()).filter(Boolean))];
  return normalized.length ? normalized : ['B站视频笔记'];
}

export function sanitizeFileName(name: string): string {
  return (
    name
      .trim()
      .replace(/[\\/:*?"<>|]/g, '-')
      .replace(/\s+/g, ' ')
      .slice(0, 80) || 'B站视频笔记'
  );
}

export function normalizeMarkdownContent(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === 'string') return part;
        if (part && typeof part === 'object' && 'text' in part) {
          return String((part as { text?: unknown }).text || '');
        }
        return '';
      })
      .filter(Boolean)
      .join('\n');
  }
  if (content == null) return '';
  return String(content);
}

function addOptional(left?: number, right?: number): number | undefined {
  if (left == null && right == null) return undefined;
  return (left || 0) + (right || 0);
}

function escapeYamlString(value: string): string {
  return JSON.stringify(value);
}
