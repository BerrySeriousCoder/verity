import type { EvidenceBlock } from '@verity/core';
import { z } from 'zod';
import { inventorySchema } from './contracts.js';

// Local integer references avoid emitting UUIDs and category strings for every
// observation twice. Both independent passes still inspect all original blocks.
export const compactInventorySchema = z.object({
  obligations: z
    .array(
      z.object({
        title: z.string().min(1).max(500),
        category: z.number().int().min(0),
        sources: z.array(z.number().int().min(0)).min(1),
        references: z.array(z.string().max(500)).max(30),
      }),
    )
    .max(150),
  exclusions: z
    .array(
      z.object({
        sources: z.array(z.number().int().min(0)).min(1),
        reason: z.string().min(1).max(500),
      }),
    )
    .max(200),
});

export function expandInventory(
  value: z.infer<typeof compactInventorySchema>,
  blocks: EvidenceBlock[],
  categories: string[],
): z.infer<typeof inventorySchema> {
  const source = (index: number) => {
    if (!blocks[index])
      throw new Error('Inventory cites an invalid local source index.');
    return blocks[index]!.id;
  };
  const expanded = {
    obligations: value.obligations.map((item) => {
      if (!categories[item.category])
        throw new Error('Inventory cites an invalid category index.');
      return {
        title: item.title,
        category: categories[item.category]!,
        evidenceIds: item.sources.map(source),
        references: item.references,
      };
    }),
    exclusions: value.exclusions.flatMap((item) =>
      item.sources.map((index) => ({
        evidenceId: source(index),
        reason: item.reason,
      })),
    ),
  };
  validateInventory(expanded, blocks);
  return expanded;
}

export function batchBlocks(
  blocks: EvidenceBlock[],
  maxCharacters = 24000,
  maxBlocks = 100,
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
      (length + block.text.length > maxCharacters || batch.length >= maxBlocks)
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
