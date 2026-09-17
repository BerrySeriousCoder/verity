import { Decimal } from 'decimal.js';
import type { ResolvedEvidence } from '@verity/core';

export function calculate(
  operation: 'sum' | 'subtract' | 'multiply' | 'divide',
  operands: { value: string; evidenceId: string }[],
  sources: ResolvedEvidence[],
) {
  if (operands.length < 2 || operands.length > 30)
    throw new Error('Calculation requires 2–30 operands.');
  const values = operands.map((operand) => {
    const source = sources.find((item) => item.id === operand.evidenceId);
    if (!source) throw new Error('Operand source is unavailable.');
    const text =
      source.anchor.kind === 'sheet'
        ? source.anchor.cells.map((cell) => cell.text).join(' ')
        : source.text;
    // Never accept a row label, part-number fragment, or ambiguous comma decimal
    // as a numeric operand. Only English decimal/thousands notation is supported.
    const tokens = [
      ...text.matchAll(
        /(?<![\w.,-])-?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?(?![\w,]|\.\d)/g,
      ),
    ].map((match) => match[0].replaceAll(',', ''));
    const value = new Decimal(operand.value);
    if (
      !value.isFinite() ||
      !tokens.some((token) => new Decimal(token).equals(value))
    )
      throw new Error('Operand does not occur in cited evidence.');
    return value;
  });
  const first = values[0]!;
  const result = values
    .slice(1)
    .reduce(
      (total, value) =>
        operation === 'sum'
          ? total.plus(value)
          : operation === 'subtract'
            ? total.minus(value)
            : operation === 'multiply'
              ? total.times(value)
              : total.dividedBy(value),
      first,
    );
  if (!result.isFinite()) throw new Error('Calculation has no finite result.');
  return {
    operation,
    operands,
    result: result.toString(),
    note: 'Arithmetic verified; source meaning, units, and applicability still require verification.',
  };
}
