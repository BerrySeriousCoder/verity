import { setTimeout as delay } from 'node:timers/promises';
import type { ReviewModel } from './model.js';

export function concurrencySetting(): number {
  const value = Number(process.env['GEMINI_MAX_CONCURRENCY'] ?? 4);
  if (!Number.isInteger(value) || value < 1 || value > 32)
    throw new Error(
      'GEMINI_MAX_CONCURRENCY must be an integer between 1 and 32.',
    );
  return value;
}

/** Drains active siblings before rejecting so no late writes follow run termination. */
export async function mapConcurrent<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  let failure: unknown;
  let failed = false;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (!failed && next < items.length) {
        const index = next++;
        try {
          results[index] = await fn(items[index]!, index);
        } catch (error) {
          failed = true;
          failure = error;
        }
      }
    }),
  );
  if (failed) throw failure;
  return results;
}

/** One shared request gate per worker process, across reviewer and auditor roles. */
export class RequestScheduler {
  private active = 0;
  private capacity: number;
  private cooldown = 0;
  private successes = 0;
  private dispatches: { at: number; tokens: number }[] = [];
  constructor(
    private readonly maximum = concurrencySetting(),
    private readonly rpm = Number(process.env['GEMINI_RPM'] ?? 0),
    private readonly tpm = Number(process.env['GEMINI_INPUT_TPM'] ?? 0),
  ) {
    this.capacity = maximum;
    if (
      maximum < 1 ||
      !Number.isInteger(maximum) ||
      rpm < 0 ||
      tpm < 0 ||
      !Number.isFinite(rpm + tpm)
    )
      throw new Error('Invalid Gemini scheduler configuration.');
  }
  async run<T>(
    input: unknown,
    signal: AbortSignal | undefined,
    task: () => Promise<T>,
  ): Promise<T> {
    // Conservative estimate; provider usage remains authoritative for accounting.
    const tokens = Math.ceil(JSON.stringify(input).length / 2);
    if (this.tpm && tokens > this.tpm)
      throw new Error(
        'Source packet exceeds configured GEMINI_INPUT_TPM. Split the packet or correct the project quota setting.',
      );
    for (;;) {
      signal?.throwIfAborted();
      const now = Date.now();
      this.dispatches = this.dispatches.filter(
        (entry) => now - entry.at < 60_000,
      );
      if (
        this.active < this.capacity &&
        now >= this.cooldown &&
        (!this.rpm || this.dispatches.length < this.rpm) &&
        (!this.tpm ||
          this.dispatches.reduce((sum, entry) => sum + entry.tokens, 0) +
            tokens <=
            this.tpm)
      ) {
        this.active++;
        this.dispatches.push({ at: now, tokens });
        break;
      }
      await delay(100, undefined, { signal });
    }
    try {
      const result = await task();
      if (++this.successes >= 20) {
        this.capacity = Math.min(this.maximum, this.capacity + 1);
        this.successes = 0;
      }
      return result;
    } catch (error) {
      const code =
        error && typeof error === 'object' && 'status' in error
          ? String(error.status)
          : '';
      if (
        [
          '429',
          'rate_limit_exceeded',
          'too_many_requests',
          'RESOURCE_EXHAUSTED',
        ].includes(code)
      ) {
        this.capacity = Math.max(1, Math.floor(this.capacity / 2));
        this.cooldown = Date.now() + 5000 + Math.random() * 5000;
        this.successes = 0;
      }
      throw error;
    } finally {
      this.active--;
    }
  }
  model(model: ReviewModel): ReviewModel {
    return {
      generate: (role, instruction, input, schema, signal, onProgress) =>
        this.run(input, signal, () =>
          model.generate(role, instruction, input, schema, signal, onProgress),
        ),
    };
  }
}
