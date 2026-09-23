import { createHash } from 'node:crypto';
/** Model-only projection. Source records and viewer anchors remain unchanged. */
export function projectEvidence(
  object: Record<string, unknown>,
): Record<string, unknown> {
  const anchor = object['anchor'] as Record<string, unknown>;
  if (!anchor || !['pdf', 'sheet'].includes(String(anchor['kind'])))
    return object;
  const {
    unitId: _unitId,
    extractionId: _extractionId,
    ordinal: _ordinal,
    anchor: _anchor,
    ...source
  } = object;
  if (anchor['kind'] === 'pdf')
    return {
      ...source,
      location: { kind: 'pdf', pageIndex: anchor['pageIndex'] },
    };
  // Cell text/formulas are already serialized into row text by our parser. Only
  // remove that duplicate representation when it matches exactly; preserve merges.
  const cells = anchor['cells'] as {
    column: number;
    text: string;
    formula?: string;
    mergedWith?: string;
  }[];
  if (!Array.isArray(cells)) return object;
  const column = (index: number) => {
    let value = index + 1,
      label = '';
    while (value > 0) {
      value--;
      label = String.fromCharCode(65 + (value % 26)) + label;
      value = Math.floor(value / 26);
    }
    return label;
  };
  const row = Number(anchor['row']);
  const serialized = cells
    .map(
      (cell) =>
        `${column(cell.column)}${row + 1}: ${cell.text}${cell.formula ? ` [formula: ${cell.formula}]` : ''}`,
    )
    .join(' | ');
  return {
    ...source,
    location: {
      kind: 'sheet',
      sheet: anchor['sheet'],
      row,
      ...(serialized === object['text']
        ? {
            merges: cells
              .filter((cell) => cell.mergedWith)
              .map(({ column, mergedWith }) => ({ column, mergedWith })),
          }
        : { cells }),
    },
  };
}

/** Request-local interning. Different IDs or different content never merge. */
export function compactEvidence(input: unknown): unknown {
  const evidenceByRef: Record<string, unknown> = {};
  const references = new Map<string, string>();
  let occurrences = 0;
  function visit(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(visit);
    if (!value || typeof value !== 'object') return value;
    const object = value as Record<string, unknown>;
    // Only resolved source objects, never decisions, raw claims, or user messages.
    if (
      typeof object['id'] === 'string' &&
      typeof object['documentId'] === 'string' &&
      typeof object['text'] === 'string' &&
      typeof object['unitId'] === 'string' &&
      object['anchor']
    ) {
      occurrences++;
      const serialized = JSON.stringify(object);
      let ref = references.get(serialized);
      if (!ref) {
        ref = `s_${createHash('sha256').update(serialized).digest('hex').slice(0, 24)}`;
        references.set(serialized, ref);
        evidenceByRef[ref] = projectEvidence(object);
      }
      return { evidenceRef: ref };
    }
    return Object.fromEntries(
      Object.entries(object).map(([key, child]) => [key, visit(child)]),
    );
  }
  const request = visit(input);
  if (!occurrences) return input;
  const compact = {
    evidenceReferenceInstructions:
      'Each evidenceRef refers to the model source record (original text and citation ID, with display-only geometry omitted) in evidenceByRef. Resolve these references wherever evidence appears. Keep evidence scoped to the check that references it; sharing storage does not authorize using another check’s evidence. Cite the original source id, never the evidenceRef key.',
    evidenceByRef: Object.fromEntries(
      Object.entries(evidenceByRef).sort((a, b) =>
        JSON.stringify(a[1]).localeCompare(JSON.stringify(b[1])),
      ),
    ),
    request,
  };
  return JSON.stringify(compact).length < JSON.stringify(input).length
    ? compact
    : input;
}
