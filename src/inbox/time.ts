/** Single list-row format: short date + clock time (locale-aware). */
export function formatListTime(receivedAtMs: number): string {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(receivedAtMs));
}
