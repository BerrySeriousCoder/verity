import assert from 'node:assert/strict';
import test from 'node:test';
import { z } from 'zod';
import { toGeminiSchema } from './model.js';

test('toGeminiSchema keeps structure and removes unsupported Zod keywords', () => {
  const schema = toGeminiSchema(
    z.toJSONSchema(
      z.object({
        id: z.string().uuid(),
        name: z.string().min(2).max(20),
        values: z.array(z.number()).min(1).max(3),
      }),
    ),
  ) as Record<string, unknown>;

  const serialized = JSON.stringify(schema);
  assert.equal(serialized.includes('$schema'), false);
  assert.equal(serialized.includes('pattern'), false);
  assert.equal(serialized.includes('format'), false);
  assert.equal(serialized.includes('minLength'), false);
  assert.equal(serialized.includes('maxLength'), false);
  assert.deepEqual(schema.required, ['id', 'name', 'values']);
  assert.equal(serialized.includes('minItems'), false);
  assert.equal(serialized.includes('maxItems'), false);
});
