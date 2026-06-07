import { useMemo, useState, type ReactNode } from 'react';
import { formatUsage, normalizeMarkdownContent } from '@/src/lib/note';
import { createHeadingId, parseTimestampLabel, type MarkdownOutlineItem } from '@/src/lib/markdown';
import { extractTimestampLabels, getBlockPlainText, getSafeHref, parseRenderBlocks, type RenderBlock } from '@/src/lib/markdownRender';
import { formatTime } from '@/src/lib/subtitle';
import type { TokenUsage } from '@/src/lib/summarizer';
import type { KeyFrame } from '@/src/lib/keyFrames';
import { sendRuntimeMessage } from '@/src/lib/extensionApi';
export type { KeyFrame } from '@/src/lib/keyFrames';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  usage?: TokenUsage | null;
}

export function KeyFrameStrip({
  frames,
  frameStatus = 'idle',
  onRecapture,
  onDelete,
}: {
  frames: KeyFrame[];
  frameStatus?: 'idle' | 'capturing';
  onRecapture?: (index: number, seconds: number) => void;
  onDelete?: (index: number) => void;
}) {
  if (!frames.length) return null;
  const busy = frameStatus === 'capturing';
  const seekToFrame = async (seconds: number) => {
    const response = await sendRuntimeMessage({ type: 'SEEK_TO_TIME', seconds });
    if ('error' in response) {
      console.error('[b-note] frame seek failed', response.error);
    }
  };

  return (
    <section className="mt-3 rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-bold text-slate-900">关键画面</h3>
          <div className="text-[10px] text-slate-400">可微调时间点，导出时会一起带入</div>
        </div>
        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">{frames.length}/6</span>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {frames.map((frame, index) => (
          <figure key={`${frame.capturedAt}:${frame.seconds}`} className="w-44 shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-slate-50 shadow-sm">
            <img
              src={frame.dataUrl}
              alt={frame.title}
              className="aspect-video w-full bg-slate-900 object-cover"
            />
            <figcaption className="space-y-1.5 p-2">
              <div className="flex items-center justify-between gap-1.5">
                <div className="min-w-0">
                  <div className="truncate text-[11px] font-semibold text-slate-700">{frame.title}</div>
                  <div className="font-mono text-[10px] text-blue-500">{formatTime(frame.anchorSeconds ?? frame.seconds)}</div>
                </div>
                <button
                  type="button"
                  onClick={() => seekToFrame(frame.anchorSeconds ?? frame.seconds)}
                  className="shrink-0 rounded-md bg-white px-1.5 py-1 text-[10px] font-semibold text-slate-600 ring-1 ring-slate-200 transition hover:bg-slate-100"
                >
                  跳转
                </button>
              </div>
              <details className="group">
                <summary className="cursor-pointer list-none rounded-md bg-white px-1.5 py-1 text-center text-[10px] font-medium text-slate-500 ring-1 ring-slate-200 transition hover:bg-slate-100 [&::-webkit-details-marker]:hidden">
                  调整
                </summary>
                <div className="mt-1 grid grid-cols-4 gap-1">
                <button
                  type="button"
                  onClick={() => onRecapture?.(index, Math.max(0, frame.seconds - 1))}
                  disabled={busy || !onRecapture}
                  className="rounded-md bg-white px-1 py-1 text-[10px] font-medium text-slate-600 ring-1 ring-slate-200 transition hover:bg-slate-100 disabled:opacity-50"
                >
                  -1s
                </button>
                <button
                  type="button"
                  onClick={() => onRecapture?.(index, frame.seconds + 1)}
                  disabled={busy || !onRecapture}
                  className="rounded-md bg-white px-1 py-1 text-[10px] font-medium text-slate-600 ring-1 ring-slate-200 transition hover:bg-slate-100 disabled:opacity-50"
                >
                  +1s
                </button>
                <button
                  type="button"
                  onClick={() => onRecapture?.(index, frame.seconds)}
                  disabled={busy || !onRecapture}
                  className="rounded-md bg-emerald-50 px-1 py-1 text-[10px] font-semibold text-emerald-700 ring-1 ring-emerald-100 transition hover:bg-emerald-100 disabled:opacity-50"
                >
                  {busy ? '处理中' : '重抓'}
                </button>
                <button
                  type="button"
                  onClick={() => onDelete?.(index)}
                  disabled={busy || !onDelete}
                  className="rounded-md bg-red-50 px-1 py-1 text-[10px] font-semibold text-red-600 ring-1 ring-red-100 transition hover:bg-red-100 disabled:opacity-50"
                >
                  删除
                </button>
                </div>
              </details>
            </figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}

export function MarkdownRenderer({ content, frames = [] }: { content: unknown; frames?: KeyFrame[] }) {
  const markdown = useMemo(() => normalizeMarkdownContent(content), [content]);
  const framesBySecond = useMemo(() => createFrameAnchorMap(frames), [frames]);
  const blocks = useMemo(() => parseRenderBlocks(markdown), [markdown]);

  if (!markdown.trim()) {
    return (
      <article className="rounded-lg border border-blue-100 bg-white px-4 py-4 shadow-sm">
        <div className="flex items-center gap-2 text-xs font-medium text-blue-600">
          <span className="h-3 w-3 rounded-full border-2 border-blue-200 border-t-blue-600 animate-spin" />
          AI 正在生成笔记，内容会逐段显示...
        </div>
        <div className="mt-3 space-y-2">
          <div className="h-3 w-11/12 rounded bg-slate-100" />
          <div className="h-3 w-9/12 rounded bg-slate-100" />
          <div className="h-3 w-10/12 rounded bg-slate-100" />
        </div>
      </article>
    );
  }

  const seekToTimestamp = async (label: string) => {
    const seconds = parseTimestampLabel(label);
    if (seconds == null) return;
    const response = await sendRuntimeMessage({ type: 'SEEK_TO_TIME', seconds });
    if ('error' in response) {
      console.error('[b-note] timestamp seek failed', response.error);
    }
  };

  const renderInline = (rawText: unknown): ReactNode => {
    const text = String(rawText ?? '');
    const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`|!?\[[^\]]+\]\([^)]+\)|[\[(（]\d{1,2}:\d{2}(?::\d{2})?(?:\s*-\s*\d{1,2}:\d{2}(?::\d{2})?)?[\])）])/g);
    return parts.map((part, i) => {
      if (!part) return null;
      if (part.startsWith('**') && part.endsWith('**')) {
        return (
          <strong key={i} className="font-semibold text-slate-900">
            {part.slice(2, -2)}
          </strong>
        );
      }
      if (part.startsWith('`') && part.endsWith('`')) {
        return (
          <code key={i} className="rounded bg-slate-100 px-1 py-0.5 font-mono text-[11px] text-slate-800">
            {part.slice(1, -1)}
          </code>
        );
      }
      const link = /^(!?)\[([^\]]+)\]\(([^)]+)\)$/.exec(part);
      if (link) {
        const [, imageMark, label, href] = link;
        const safeHref = getSafeHref(href);
        if (imageMark) {
          return safeHref ? (
            <img key={i} src={safeHref} alt={label} className="my-2 max-h-56 w-full rounded-md border border-slate-200 object-contain" />
          ) : label;
        }
        return safeHref ? (
          <a key={i} href={safeHref} target="_blank" rel="noreferrer" className="font-medium text-blue-600 underline decoration-blue-200 underline-offset-2">
            {label}
          </a>
        ) : label;
      }
      if (/^[\[(（]\d{1,2}:\d{2}(?::\d{2})?(?:\s*-\s*\d{1,2}:\d{2}(?::\d{2})?)?[\])）]$/.test(part)) {
        return (
          <button
            key={i}
            type="button"
            onClick={() => seekToTimestamp(part)}
            className="mx-0.5 rounded-md bg-blue-50 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-blue-600 ring-1 ring-blue-100 transition hover:bg-blue-100"
            title="跳转到视频对应时间"
          >
            {part}
          </button>
        );
      }
      return part;
    });
  };

  const renderBlock = (block: RenderBlock, key: number) => {
    if (block.type === 'keyframe') {
      return null;
    }
    if (block.type === 'heading') {
      const Tag = block.level === 1 ? 'h2' : block.level === 2 ? 'h3' : 'h4';
      const className = block.level === 1
        ? 'mb-4 scroll-mt-20 text-xl font-extrabold leading-snug tracking-tight text-slate-950'
        : block.level === 2
          ? 'mt-6 scroll-mt-20 border-b border-slate-100 pb-2 text-base font-extrabold text-slate-900'
          : 'mt-4 scroll-mt-20 text-sm font-bold text-slate-800';
      return (
        <Tag key={key} id={createHeadingId(block.text)} className={className}>
          {renderInline(block.text)}
        </Tag>
      );
    }
    if (block.type === 'quote') {
      return (
        <blockquote key={key} className="my-3 rounded-r-md border-l-2 border-blue-300 bg-blue-50/60 py-2 pl-3 pr-2 text-[13px] leading-6 text-slate-600">
          {block.lines.map((line, index) => (
            <p key={`${line}:${index}`}>{renderInline(line)}</p>
          ))}
        </blockquote>
      );
    }
    if (block.type === 'list') {
      return (
        <ul key={key} className="space-y-1.5 pl-1">
          {block.items.map((item, index) => (
            <li key={`${item}:${index}`} className="flex gap-2 text-[13px] leading-6 text-slate-700">
              <span className="mt-[0.45em] h-1.5 w-1.5 shrink-0 rounded-full bg-blue-400" />
              <span>{renderInline(item)}</span>
            </li>
          ))}
        </ul>
      );
    }
    if (block.type === 'ordered') {
      return (
        <ol key={key} className="space-y-1.5 pl-1">
          {block.items.map((item) => (
            <li key={`${item.index}:${item.text}`} className="flex gap-2 text-[13px] leading-6 text-slate-700">
              <span className="min-w-4 shrink-0 font-mono text-[11px] font-semibold text-blue-500">{item.index}.</span>
              <span>{renderInline(item.text)}</span>
            </li>
          ))}
        </ol>
      );
    }
    if (block.type === 'code') {
      return (
        <pre key={key} className="max-h-72 overflow-auto rounded-lg bg-slate-950 p-3 text-[11px] leading-relaxed text-slate-100 shadow-sm">
          <code>{block.code}</code>
        </pre>
      );
    }
    if (block.type === 'table') {
      return (
        <div key={key} className="overflow-x-auto rounded-md border border-slate-200">
          <table className="min-w-full divide-y divide-slate-200 text-left text-xs">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                {block.headers.map((header, index) => (
                  <th key={`${header}:${index}`} className="px-2 py-1.5 font-semibold">
                    {renderInline(header)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white text-slate-700">
              {block.rows.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  {row.map((cell, cellIndex) => (
                    <td key={`${cell}:${cellIndex}`} className="px-2 py-1.5 align-top">
                      {renderInline(cell)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }
    if (block.type === 'image') {
      const safeHref = getSafeHref(block.src);
      if (!safeHref) return null;
      return (
        <figure key={key} className="rounded-md border border-slate-200 bg-slate-50 p-2">
          <img src={safeHref} alt={block.alt} className="max-h-64 w-full rounded object-contain" />
          {block.alt && <figcaption className="mt-1 text-center text-[10px] text-slate-500">{block.alt}</figcaption>}
        </figure>
      );
    }
    if (block.type === 'rule') {
      return <hr key={key} className="my-3 border-slate-200" />;
    }
    return (
      <p key={key} className="text-[13px] leading-6 text-slate-700">
        {renderInline(block.text)}
      </p>
    );
  };

  const renderedFrameSeconds = new Set<number>();

  return (
    <article className="space-y-3 rounded-lg border border-slate-200 bg-white px-4 py-5 shadow-sm">
      {blocks.map((block, i) => {
        const frame = block.type === 'keyframe'
          ? findFrameForSeconds(block.seconds, framesBySecond, renderedFrameSeconds)
          : findFrameForBlock(block, framesBySecond, renderedFrameSeconds);
        return (
          <div key={i} className="space-y-2">
            {renderBlock(block, i)}
            {frame ? <InlineKeyFrame frame={frame} /> : block.type === 'keyframe' ? <InlineKeyFramePlaceholder label={block.label} /> : null}
          </div>
        );
      })}
    </article>
  );
}

function InlineKeyFrame({ frame }: { frame: KeyFrame }) {
  return (
    <figure className="overflow-hidden rounded-lg border border-blue-100 bg-blue-50/40 shadow-sm">
      <img src={frame.dataUrl} alt={frame.title} className="aspect-video w-full bg-slate-900 object-cover" />
      <figcaption className="flex items-center justify-between gap-2 px-2 py-1.5 text-[10px] text-slate-500">
        <span className="truncate">{frame.title}</span>
        <span className="shrink-0 font-mono text-blue-600">{formatTime(frame.anchorSeconds ?? frame.seconds)}</span>
      </figcaption>
    </figure>
  );
}

function InlineKeyFramePlaceholder({ label }: { label: string }) {
  return (
    <div className="rounded-lg border border-dashed border-blue-200 bg-blue-50/40 px-3 py-3 text-[11px] font-semibold text-blue-600">
      正在抓取关键画面 {label}
    </div>
  );
}

function findFrameForBlock(
  block: RenderBlock,
  framesBySecond: Map<number, KeyFrame>,
  renderedFrameSeconds: Set<number>,
): KeyFrame | null {
  const text = getBlockPlainText(block);
  const timestamps = extractTimestampLabels(text);
  for (const timestamp of timestamps) {
    const seconds = parseTimestampLabel(timestamp);
    if (seconds == null) continue;
    const key = Math.round(seconds);
    if (renderedFrameSeconds.has(key)) continue;
    const frame = framesBySecond.get(key);
    if (!frame) continue;
    renderedFrameSeconds.add(key);
    return frame;
  }
  return null;
}

function findFrameForSeconds(
  seconds: number,
  framesBySecond: Map<number, KeyFrame>,
  renderedFrameSeconds: Set<number>,
): KeyFrame | null {
  const key = Math.round(seconds);
  if (renderedFrameSeconds.has(key)) return null;
  const frame = framesBySecond.get(key);
  if (!frame) return null;
  renderedFrameSeconds.add(key);
  return frame;
}

function createFrameAnchorMap(frames: KeyFrame[]): Map<number, KeyFrame> {
  const map = new Map<number, KeyFrame>();
  for (const frame of frames) {
    const titleAnchor = firstTimestampSeconds(frame.title);
    const anchor = Math.round(frame.anchorSeconds ?? titleAnchor ?? frame.seconds);
    if (!map.has(anchor)) map.set(anchor, frame);
  }
  return map;
}

function firstTimestampSeconds(text: string): number | null {
  const timestamp = extractTimestampLabels(text)[0];
  return timestamp ? parseTimestampLabel(timestamp) : null;
}

export function OutlineBar({ outline }: { outline: MarkdownOutlineItem[] }) {
  const scrollToHeading = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  };

  return (
    <div className="shrink-0 border-b border-slate-200 bg-white/95 px-3 py-1.5 backdrop-blur">
      <div className="flex gap-1.5 overflow-x-auto pb-0.5">
        {outline.slice(0, 12).map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => scrollToHeading(item.id)}
            className={`shrink-0 rounded-md px-2 py-1 text-[11px] font-semibold transition hover:bg-blue-50 hover:text-blue-700 ${
              item.level >= 3 ? 'bg-slate-50 text-slate-500' : 'bg-slate-100 text-slate-700 ring-1 ring-slate-200'
            }`}
          >
            {item.title}
          </button>
        ))}
      </div>
    </div>
  );
}

export function VideoChat({
  messages,
  status,
  onAsk,
}: {
  messages: ChatMessage[];
  status: 'idle' | 'asking';
  onAsk: (question: string) => void;
}) {
  const [question, setQuestion] = useState('');
  const suggestions = ['提炼可执行步骤', '列出关键时间点', '有哪些注意事项'];

  const submit = () => {
    const trimmed = question.trim();
    if (!trimmed || status === 'asking') return;
    setQuestion('');
    onAsk(trimmed);
  };

  return (
    <section className="mt-3 rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-sm font-bold text-slate-900">继续追问</h3>
        <span className="text-[11px] text-slate-400">基于字幕与当前笔记回答</span>
      </div>
      {messages.length > 0 && (
        <div className="mb-3 max-h-72 space-y-2 overflow-y-auto rounded-md bg-slate-50 p-2">
          {messages.map((message) => (
            <div
              key={message.id}
              className={`rounded-md px-2.5 py-2 text-xs leading-relaxed ${
                message.role === 'user'
                  ? 'ml-6 bg-blue-600 text-white'
                  : 'mr-6 border border-slate-200 bg-white text-slate-700'
              }`}
            >
              <MarkdownInlineText text={message.content} />
              {message.usage && <div className="mt-1 text-[10px] opacity-70">{formatUsage(message.usage)}</div>}
            </div>
          ))}
        </div>
      )}
      <div className="mb-2 flex flex-wrap gap-1.5">
        {suggestions.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => onAsk(item)}
            disabled={status === 'asking'}
            className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-medium text-slate-600 transition hover:bg-slate-200 disabled:opacity-50"
          >
            {item}
          </button>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') submit();
          }}
          placeholder="问这个视频里的任何问题..."
          className="min-w-0 flex-1 rounded-md border border-slate-200 px-3 py-2 text-xs outline-none focus:ring-1 focus:ring-blue-400"
        />
        <button
          type="button"
          onClick={submit}
          disabled={!question.trim() || status === 'asking'}
          className="shrink-0 rounded-md bg-blue-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-blue-700 disabled:opacity-50"
        >
          {status === 'asking' ? '回答中' : '发送'}
        </button>
      </div>
    </section>
  );
}

function MarkdownInlineText({ text }: { text: string }) {
  return (
    <>
      {text.split('\n').map((line, index) => (
        <span key={`${line}:${index}`} className="block">
          {line}
        </span>
      ))}
    </>
  );
}
