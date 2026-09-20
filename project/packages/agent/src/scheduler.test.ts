import assert from 'node:assert/strict';
import test from 'node:test';
import { RequestScheduler, mapConcurrent } from './scheduler.js';
import { exactIds } from './parallel-contracts.js';

test('request capacity is shared and cancellation removes queued work', async () => {
  const gate = new RequestScheduler(2);
  let active = 0,
    peak = 0;
  await Promise.all(
    Array.from({ length: 8 }, () =>
      gate.run({}, undefined, async () => {
        active++;
        peak = Math.max(peak, active);
        await new Promise((resolve) => setTimeout(resolve, 5));
        active--;
        return 1;
      }),
    ),
  );
  assert.equal(peak, 2);
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    gate.run({}, controller.signal, async () => {
      throw new Error('should not dispatch');
    }),
    /abort/i,
  );
});

test('partition failure drains siblings before returning', async () => {
  let finished = false;
  await assert.rejects(
    mapConcurrent([0, 1, 2], 2, async (item) => {
      if (item === 0) throw new Error('failed partition');
      await new Promise((resolve) => setTimeout(resolve, 10));
      finished = true;
    }),
    /failed partition/,
  );
  assert.equal(finished, true);
});

test('batch contracts reject duplicates, omissions and invented IDs', () => {
  for (const ids of [['a', 'a'], ['a'], ['a', 'c']])
    assert.throws(() => exactIds(ids, ['a', 'b']));
  exactIds(['b', 'a'], ['a', 'b']);
});
