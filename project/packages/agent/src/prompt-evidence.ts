/** Lossless request-local interning. Different IDs or different content never merge. */
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
        ref = `source_${references.size + 1}`;
        references.set(serialized, ref);
        evidenceByRef[ref] = value;
      }
      return { evidenceRef: ref };
    }
    return Object.fromEntries(
      Object.entries(object).map(([key, child]) => [key, visit(child)]),
    );
  }
  const request = visit(input);
  if (occurrences === references.size) return input;
  const compact = {
    evidenceReferenceInstructions:
      'Each evidenceRef refers to the complete original source object in evidenceByRef. Resolve these references wherever evidence appears. Keep evidence scoped to the check that references it; sharing storage does not authorize using another check’s evidence. Cite the original source id, never the evidenceRef key.',
    request,
    evidenceByRef,
  };
  return JSON.stringify(compact).length < JSON.stringify(input).length
    ? compact
    : input;
}
