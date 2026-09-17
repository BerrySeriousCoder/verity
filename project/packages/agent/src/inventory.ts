import type { EvidenceBlock } from '@verity/core';
import type { z } from 'zod';
import { inventorySchema } from './contracts.js';

export function batchBlocks(
  blocks: EvidenceBlock[],
  maxCharacters = 24000,
): EvidenceBlock[][] {
  const result: EvidenceBlock[][] = [];
  let batch: EvidenceBlock[] = [],
    length = 0;
  for (const block of blocks) {
    if (block.text.length > maxCharacters)
      throw new Error(
        'A source block exceeds the review context limit. Manual inspection required.',
      );
    if (
      batch.length &&
      (length + block.text.length > maxCharacters || batch.length >= 100)
    ) {
      result.push(batch);
      batch = [];
      length = 0;
    }
    batch.push(block);
    length += block.text.length;
  }
  if (batch.length) result.push(batch);
  return result;
}

export function validateInventory(
  value: z.infer<typeof inventorySchema>,
  blocks: EvidenceBlock[],
): void {
  const actual = new Set(blocks.map((block) => block.id));
  const used = new Set([
    ...value.obligations.flatMap((item) => item.evidenceIds),
    ...value.exclusions.map((item) => item.evidenceId),
  ]);
  if ([...used].some((id) => !actual.has(id)))
    throw new Error('Inventory cites evidence outside its source batch.');
  if ([...actual].some((id) => !used.has(id)))
    throw new Error(
      'Inventory omitted a source block; coverage is incomplete.',
    );
}
