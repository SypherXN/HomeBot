/** Non-zero numeric Discord snowflake string (JS safe integer range in UI). */
export function validActorId(raw: string): boolean {
  const t = raw.trim();
  return /^\d+$/.test(t) && t !== "0";
}
