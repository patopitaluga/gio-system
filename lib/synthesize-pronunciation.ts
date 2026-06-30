import { createWriteStream, existsSync, mkdirSync } from 'fs';
import path from 'path';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import { styleText } from 'node:util';
import { projectRoot } from './workspace.ts';

/** Directory for generated pronunciation MP3 files. Served at `/pronunciations` in `server.ts`. */
export const PRONUNCIATIONS_DIR = path.join(projectRoot, 'pronunciations');

/** Return type for `synthesizePronunciationAudio`. */
export type SynthesizePronunciationResult = {
  text: string;
  audioPath: string;
  audioUrl: string;
};

/** Used in `synthesizePronunciationAudio`. */
function slugifyFilename(text: string): string {
  const slug = text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);

  return slug || 'pronunciation';
}

/** Used in `synthesizePronunciationAudio`. */
async function writeResponseBodyToFile(body: ReadableStream<Uint8Array>, filePath: string) {
  const nodeStream = Readable.fromWeb(body as import('stream/web').ReadableStream);
  await pipeline(nodeStream, createWriteStream(filePath));
}

/** Imported in `tools/vocabulary-tools/speak-pronunciation.ts`. */
export function logPronunciationSaved(text: string, audioUrl: string) {
  console.log(styleText('cyan', `🔊 Pronunciation audio: ${audioUrl} — ${text}`));
}

/**
 * Generates an MP3 via OpenAI TTS and saves it under `pronunciations/`.
 *
 * Imported in `tools/vocabulary-tools/speak-pronunciation.ts`.
 */
export async function synthesizePronunciationAudio(
  text: string,
  options?: { filenameSlug?: string },
): Promise<SynthesizePronunciationResult> {
  const trimmed = text.trim();
  if (!trimmed) throw new Error('Pronunciation text is required');

  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new Error('OPENAI_API_KEY is not set');

  mkdirSync(PRONUNCIATIONS_DIR, { recursive: true });

  const base = options?.filenameSlug?.trim() || slugifyFilename(trimmed);
  let fileName = `${base}.mp3`;
  let filePath = path.join(PRONUNCIATIONS_DIR, fileName);
  let suffix = 2;

  while (existsSync(filePath)) {
    fileName = `${base}-${suffix}.mp3`;
    filePath = path.join(PRONUNCIATIONS_DIR, fileName);
    suffix += 1;
  }

  const response = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'tts-1',
      input: trimmed,
      voice: 'nova',
      response_format: 'mp3',
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`OpenAI TTS failed (${response.status}): ${detail}`);
  }

  if (!response.body) throw new Error('OpenAI TTS returned an empty body');

  await writeResponseBodyToFile(response.body, filePath);

  const audioUrl = `/pronunciations/${fileName}`;

  return {
    text: trimmed,
    audioPath: filePath,
    audioUrl,
  };
}
