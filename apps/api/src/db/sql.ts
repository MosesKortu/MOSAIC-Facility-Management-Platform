/** `ILIKE` pattern matching `text` anywhere, with LIKE wildcards in the user's text escaped. */
export function containsPattern(text: string): string {
  return `%${text.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}
