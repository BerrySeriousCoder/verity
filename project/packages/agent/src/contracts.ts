import { z } from 'zod';

export const obligationSchema = z.object({
  title: z.string().min(1).max(500),
  category: z.string().max(100),
  evidenceIds: z.array(z.string().uuid()).min(1).max(100),
  references: z.array(z.string().max(500)).max(30),
});
export type Obligation = z.infer<typeof obligationSchema> & {
  id: string;
  documentId: string;
  direction: 'policy_to_quotation' | 'quotation_to_policy';
};

export const inventorySchema = z.object({
  obligations: z.array(obligationSchema).max(150),
  exclusions: z
    .array(
      z.object({
        evidenceId: z.string().uuid(),
        reason: z.string().min(1).max(500),
      }),
    )
    .max(200),
});

export const scopeSchema = z.object({
  description: z.string().min(1).max(2000),
  categories: z.array(z.string().min(1).max(100)).min(1).max(30),
  needsClarification: z.boolean(),
});

export const decisionSchema = z.object({
  status: z.enum([
    'aligned',
    'different',
    'not_found',
    'needs_input',
    'unverified',
  ]),
  explanation: z.string().min(1).max(5000),
  evidenceIds: z.array(z.string().uuid()).min(1).max(100),
  question: z.string().max(1500).nullable(),
  requiresCalculation: z.boolean(),
});

// A deliberately small read-only tool surface. Scope and completion are harness decisions.
export const actionSchema = z.object({
  action: z.enum([
    'search',
    'read_evidence',
    'read_inventory',
    'inspect_document',
    'read_unit',
    'calculate',
    'finish',
  ]),
  query: z.string().max(300).nullable(),
  evidenceIds: z.array(z.string().uuid()).max(50),
  inventoryOffset: z.number().int().min(0).nullable(),
  documentId: z.string().uuid().nullable(),
  unitId: z.string().uuid().nullable(),
  calculation: z
    .object({
      operation: z.enum(['sum', 'subtract', 'multiply', 'divide']),
      operands: z
        .array(
          z.object({
            value: z
              .string()
              .regex(/^-?\d+(\.\d+)?$/)
              .max(40),
            evidenceId: z.string().uuid(),
          }),
        )
        .min(2)
        .max(30),
    })
    .nullable(),
  decision: decisionSchema.nullable(),
});

export const verificationSchema = z.object({
  supported: z.boolean(),
  reason: z.string().min(1).max(3000),
  question: z.string().max(1500).nullable(),
});
