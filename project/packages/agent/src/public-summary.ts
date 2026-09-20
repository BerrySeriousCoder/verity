/** Decode only the deliberately public first JSON field, never model thoughts
 * or the internal structured result. Works across escaped/chunked strings. */
export function publicSummaryPrefix(json: string): string {
  const match = /^\s*\{\s*"publicSummary"\s*:\s*"/.exec(json);
  if (!match) return '';
  let output = '';
  for (let index = match[0].length; index < json.length; index++) {
    const char = json[index]!;
    if (char === '"') break;
    if (char !== '\\') {
      output += char;
      continue;
    }
    const escape = json[++index];
    if (!escape) break;
    if (escape === 'u') {
      const hex = json.slice(index + 1, index + 5);
      if (!/^[\da-f]{4}$/i.test(hex)) break;
      output += String.fromCharCode(parseInt(hex, 16));
      index += 4;
    } else {
      const decoded: Record<string, string> = {
        '"': '"',
        '\\': '\\',
        '/': '/',
        n: '\n',
        r: '\r',
        t: '\t',
        b: '\b',
        f: '\f',
      };
      if (!(escape in decoded)) break;
      output += decoded[escape];
    }
  }
  return output.slice(0, 600);
}
