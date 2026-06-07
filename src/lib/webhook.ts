import type { TokenUsage } from './summarizer';

export interface WebhookConfig {
  url: string;
  secret: string;
}

export interface WebhookPayload {
  title: string;
  videoUrl?: string | null;
  fileName?: string;
  markdown: string;
  generatedAt: string | null;
  providerName: string | null;
  model: string | null;
  mode?: string;
  template?: string;
  tags?: string[];
  frontmatter?: Record<string, string>;
  summaryChunks?: number | null;
  usage: TokenUsage | null;
  keyFrameCount: number;
  keyFrames?: Array<{
    title: string;
    capturedAt: string;
  }>;
}

export async function publishToWebhook(config: WebhookConfig, payload: WebhookPayload): Promise<void> {
  const url = config.url.trim();
  if (!url) throw new Error('请先配置 Webhook URL');
  if (!/^https?:\/\//i.test(url)) throw new Error('Webhook URL 必须以 http:// 或 https:// 开头');

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (config.secret.trim()) {
    headers['X-B-Note-Secret'] = config.secret.trim();
  }

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      source: 'b-note',
      ...payload,
    }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Webhook 发布失败 (${response.status})${text ? `: ${text.slice(0, 300)}` : ''}`);
  }
}
