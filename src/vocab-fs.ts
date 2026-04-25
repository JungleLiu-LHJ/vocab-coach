/**
 * Vocabulary engine for the real plugin runtime.
 * Loads the bundled IELTS JSON directly — no context.storage dependency.
 * The selectNextWord logic is shared with src/vocab.ts (used by tests).
 */
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import type { VocabWord } from './types.js';

// Re-export selectNextWord so tests can import from either location
export { selectNextWord } from './vocab.js';

let cachedVocab: VocabWord[] | null = null;

export async function ensureLoaded(): Promise<VocabWord[]> {
  if (cachedVocab) return cachedVocab;

  // Load the bundled JSON using require (works in jiti ESM context)
  const require = createRequire(import.meta.url);
  const vocabPath = join(
    dirname(fileURLToPath(import.meta.url)),
    '..',
    'data',
    'ielts-vocab.json',
  );
  cachedVocab = require(vocabPath) as VocabWord[];
  return cachedVocab;
}

export function getVocab(): VocabWord[] | Promise<VocabWord[]> {
  return cachedVocab ?? ensureLoaded();
}
