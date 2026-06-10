/** Title-case labels for categories, subtitles, and other short UI names. */
export function titleCase(text: string): string {
  if (!text) return text;
  return text.replace(/\b([a-z])/g, (_, letter: string) => letter.toUpperCase());
}
