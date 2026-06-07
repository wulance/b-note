export interface TelegramConfig {
  botToken: string;
  chatId: string;
}

export interface TelegramPublishInput extends TelegramConfig {
  title: string;
  text: string;
  images?: Array<{ title: string; dataUrl: string }>;
}

const TELEGRAM_CHUNK_LIMIT = 3900;

export async function publishToTelegram(input: TelegramPublishInput): Promise<number> {
  const botToken = input.botToken.trim();
  const chatId = input.chatId.trim();
  if (!botToken || !chatId) {
    throw new Error('请先配置 Telegram Bot Token 和 Chat ID');
  }

  const chunks = splitTelegramText(`# ${input.title}\n\n${input.text}`, TELEGRAM_CHUNK_LIMIT);
  for (let index = 0; index < chunks.length; index += 1) {
    const text = chunks.length > 1 ? `${chunks[index]}\n\n(${index + 1}/${chunks.length})` : chunks[index];
    const response = await fetch(`https://api.telegram.org/bot${encodeURIComponent(botToken)}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        disable_web_page_preview: true,
      }),
    });
    const data = await response.json().catch(() => null);
    if (!response.ok || !data?.ok) {
      throw new Error(data?.description || `Telegram 发送失败 (${response.status})`);
    }
  }
  for (const image of input.images || []) {
    const blob = dataUrlToBlob(image.dataUrl);
    if (!blob) continue;
    const form = new FormData();
    form.set('chat_id', chatId);
    form.set('caption', image.title.slice(0, 1000));
    form.set('photo', new File([blob], `${sanitizeFileName(image.title)}.${extensionFromMime(blob.type)}`, { type: blob.type }));
    const response = await fetch(`https://api.telegram.org/bot${encodeURIComponent(botToken)}/sendPhoto`, {
      method: 'POST',
      body: form,
    });
    const data = await response.json().catch(() => null);
    if (!response.ok || !data?.ok) {
      throw new Error(data?.description || `Telegram 图片发送失败 (${response.status})`);
    }
  }
  return chunks.length;
}

export function splitTelegramText(text: string, limit = TELEGRAM_CHUNK_LIMIT): string[] {
  const normalized = text.trim();
  if (!normalized) return [''];
  const chunks: string[] = [];
  let current = '';
  for (const paragraph of normalized.split(/\n{2,}/)) {
    const next = current ? `${current}\n\n${paragraph}` : paragraph;
    if (next.length <= limit) {
      current = next;
      continue;
    }
    if (current) chunks.push(current);
    if (paragraph.length <= limit) {
      current = paragraph;
      continue;
    }
    for (let index = 0; index < paragraph.length; index += limit) {
      chunks.push(paragraph.slice(index, index + limit));
    }
    current = '';
  }
  if (current) chunks.push(current);
  return chunks;
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
