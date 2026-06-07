import { createServer } from 'node:http';
import { mkdir, mkdtemp, readdir, readFile, rm, stat } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { spawn } from 'node:child_process';

const PORT = Number(process.env.PORT || process.env.TRANSCRIPTION_WORKER_PORT || 8787);
const BASE_URL = (process.env.TRANSCRIPTION_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, '');
const API_KEY = process.env.TRANSCRIPTION_API_KEY || process.env.OPENAI_API_KEY || '';
const DEFAULT_MODEL = process.env.TRANSCRIPTION_MODEL || 'whisper-1';
const CHUNK_SECONDS = Number(process.env.TRANSCRIPTION_CHUNK_SECONDS || 600);
const MAX_UPLOAD_BYTES = Number(process.env.TRANSCRIPTION_MAX_UPLOAD_MB || 24) * 1024 * 1024;
const COMPRESS_BITRATE = process.env.TRANSCRIPTION_BITRATE || '32k';
const FFMPEG_BIN = process.env.FFMPEG_BIN || 'ffmpeg';

const server = createServer(async (req, res) => {
  setCors(res);
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method !== 'POST' || !new URL(req.url || '/', 'http://localhost').pathname.match(/^\/(transcribe)?$/)) {
    sendJson(res, 404, { error: 'Not found' });
    return;
  }

  try {
    if (!API_KEY) throw new Error('请先设置 TRANSCRIPTION_API_KEY 或 OPENAI_API_KEY');
    const payload = await readJson(req);
    const result = await transcribePayload(payload);
    sendJson(res, 200, result);
  } catch (error) {
    sendJson(res, 500, { error: error instanceof Error ? error.message : String(error) });
  }
});

server.listen(PORT, () => {
  console.log(`[b-note transcription-worker] listening on http://127.0.0.1:${PORT}/transcribe`);
});

async function transcribePayload(payload) {
  const video = payload?.video || {};
  const candidates = Array.isArray(payload?.audioCandidates) ? payload.audioCandidates : [];
  const urls = candidates.flatMap((candidate) => Array.isArray(candidate.urls) ? candidate.urls : []);
  if (!urls.length) throw new Error('audioCandidates 为空');

  const workdir = await mkdtemp(join(tmpdir(), 'b-note-transcribe-'));
  try {
    const sourcePath = join(workdir, 'source.m4a');
    await downloadFirstAvailable(urls, sourcePath, payload?.referrer || 'https://www.bilibili.com/');
    const sourceInfo = await stat(sourcePath);
    const chunksDir = join(workdir, 'chunks');
    await mkdir(chunksDir, { recursive: true });

    let chunkPaths;
    if (sourceInfo.size <= MAX_UPLOAD_BYTES) {
      chunkPaths = [sourcePath];
    } else {
      chunkPaths = await splitAudio(sourcePath, chunksDir);
    }

    const model = payload?.model || DEFAULT_MODEL;
    const segments = [];
    let fallbackText = '';
    for (let index = 0; index < chunkPaths.length; index += 1) {
      const chunk = chunkPaths[index];
      const chunkInfo = await stat(chunk);
      if (chunkInfo.size > MAX_UPLOAD_BYTES) {
        throw new Error(`分片 ${index + 1} 仍有 ${formatBytes(chunkInfo.size)}，请降低 TRANSCRIPTION_CHUNK_SECONDS 或 TRANSCRIPTION_BITRATE`);
      }
      const result = await transcribeChunk(chunk, model);
      const offset = chunkPaths.length === 1 ? 0 : index * CHUNK_SECONDS;
      if (Array.isArray(result.segments) && result.segments.length) {
        for (const segment of result.segments) {
          const text = String(segment.text || '').trim();
          if (!text) continue;
          segments.push({
            from: Number(segment.start || 0) + offset,
            to: Number(segment.end || segment.start || 0) + offset,
            content: text,
          });
        }
      } else if (typeof result.text === 'string' && result.text.trim()) {
        fallbackText += `${result.text.trim()}\n`;
      }
    }

    if (!segments.length && fallbackText.trim()) {
      segments.push({ from: 0, to: Number(video.duration || 0), content: fallbackText.trim() });
    }
    if (!segments.length) throw new Error('Whisper 未返回有效字幕');

    return {
      text: segments.map((segment) => segment.content).join('\n'),
      segments,
      chunks: chunkPaths.length,
      sourceSize: sourceInfo.size,
    };
  } finally {
    await rm(workdir, { recursive: true, force: true });
  }
}

async function downloadFirstAvailable(urls, targetPath, referrer) {
  let lastError = null;
  for (const url of urls) {
    try {
      const response = await fetch(url, {
        headers: {
          Referer: referrer,
          'User-Agent': 'Mozilla/5.0 b-note-transcription-worker',
        },
      });
      if (!response.ok || !response.body) throw new Error(`下载音频失败 (${response.status})`);
      await pipeline(Readable.fromWeb(response.body), createWriteStream(targetPath));
      return;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error('没有可用音频地址');
}

async function splitAudio(sourcePath, chunksDir) {
  const outputPattern = join(chunksDir, 'chunk-%03d.m4a');
  await run(FFMPEG_BIN, [
    '-y',
    '-i', sourcePath,
    '-vn',
    '-ac', '1',
    '-ar', '16000',
    '-b:a', COMPRESS_BITRATE,
    '-f', 'segment',
    '-segment_time', String(CHUNK_SECONDS),
    '-reset_timestamps', '1',
    outputPattern,
  ]);
  const files = (await readdir(chunksDir))
    .filter((file) => file.endsWith('.m4a'))
    .sort()
    .map((file) => join(chunksDir, file));
  if (!files.length) throw new Error('ffmpeg 未生成音频分片');
  return files;
}

async function transcribeChunk(filePath, model) {
  const bytes = await readFile(filePath);
  const form = new FormData();
  form.set('file', new File([bytes], 'chunk.m4a', { type: 'audio/mp4' }));
  form.set('model', model);
  form.set('response_format', 'verbose_json');
  form.append('timestamp_granularities[]', 'segment');

  const response = await fetch(`${BASE_URL}/audio/transcriptions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${API_KEY}` },
    body: form,
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Whisper 转写失败 (${response.status}): ${compact(text)}`);
  }
  return response.json();
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} 退出码 ${code}: ${compact(stderr)}`));
    });
  });
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'));
      } catch (error) {
        reject(error);
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function compact(text) {
  return String(text || '').replace(/\s+/g, ' ').trim().slice(0, 500);
}

function formatBytes(bytes) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}
