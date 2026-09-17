/** Keep complete recent tool results, never silently truncate a source excerpt. */
export function recentContext(
  history: unknown[],
  maxCharacters = 32000,
): unknown[] {
  const result: unknown[] = [];
  let size = 0;
  for (const entry of [...history].reverse()) {
    const length = JSON.stringify(entry).length;
    if (size + length > maxCharacters) break;
    result.unshift(entry);
    size += length;
  }
  return result;
}

export function boundedItems<T>(
  items: T[],
  maxCharacters = 24000,
): { items: T[]; remaining: number } {
  const selected: T[] = [];
  let size = 0;
  for (const item of items) {
    const length = JSON.stringify(item).length;
    if (size + length > maxCharacters) break;
    selected.push(item);
    size += length;
  }
  return { items: selected, remaining: items.length - selected.length };
}
