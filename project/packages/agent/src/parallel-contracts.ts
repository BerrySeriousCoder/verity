import { z } from 'zod';
import {
  decisionSchema,
  verificationSchema,
  actionSchema,
} from './contracts.js';
export const groupingSchema = z.object({
  groups: z.array(
    z.object({
      title: z.string().min(1).max(500),
      memberIds: z.array(z.string()).min(1),
    }),
  ),
});
export const comparisonsSchema = z.object({
  items: z.array(
    z.object({
      id: z.string(),
      decision: decisionSchema,
      requests: z.array(
        z.object({
          query: z.string().max(300),
          evidenceIds: z.array(z.string().uuid()),
        }),
      ),
      calculation: actionSchema.shape.calculation,
    }),
  ),
});
export const verificationsSchema = z.object({
  items: z.array(
    z.object({ id: z.string(), verification: verificationSchema }),
  ),
});
export class BatchMembershipError extends Error {
  constructor(actual: string[], expected: string[]) {
    const missing = expected.filter((id) => !actual.includes(id));
    const unexpected = actual.filter((id) => !expected.includes(id));
    const duplicates = actual.filter(
      (id, index) => actual.indexOf(id) !== index,
    );
    super(
      `Return each requested ID exactly once; do not invent, duplicate, or omit IDs. Missing: ${missing.join(', ') || 'none'}. Unexpected: ${unexpected.join(', ') || 'none'}. Duplicates: ${duplicates.join(', ') || 'none'}.`,
    );
    this.name = 'BatchMembershipError';
  }
}
export function exactIds(actual: string[], expected: string[]): void {
  if (
    actual.length !== expected.length ||
    new Set(actual).size !== actual.length ||
    actual.some((id) => !expected.includes(id))
  )
    throw new BatchMembershipError(actual, expected);
}
export function chunks<T>(items: readonly T[], size: number): T[][] {
  return Array.from({ length: Math.ceil(items.length / size) }, (_, index) =>
    items.slice(index * size, (index + 1) * size),
  );
}
