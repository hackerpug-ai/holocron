/**
 * Passage extraction via the shared chunkDocument — no second chunker.
 */
import { chunkDocument, type PassageChunk } from '../inference/chunk.ts';

export type ExtractedPassage = {
  text: string;
  ordinal: number;
  startOffset: number;
  endOffset: number;
  situatingHeader: string;
  tokenCount: number;
};

export function extractPassages(
  sourceText: string,
  opts?: { title?: string; maxTokens?: number; overlap?: number }
): ExtractedPassage[] {
  const chunks: PassageChunk[] = chunkDocument(sourceText, {
    title: opts?.title,
    maxTokens: opts?.maxTokens,
    overlap: opts?.overlap,
  });
  return chunks.map((c) => ({
    text: c.text,
    ordinal: c.ordinal,
    startOffset: c.startOffset,
    endOffset: c.endOffset,
    situatingHeader: c.situatingHeader,
    tokenCount: c.tokenCount,
  }));
}
