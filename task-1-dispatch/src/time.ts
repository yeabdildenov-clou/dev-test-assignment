// Казахстан живёт в одном часовом поясе, Алматы — UTC+5
const ALMATY_OFFSET_MS = 5 * 60 * 60 * 1000;

// Календарная дата по Алматы ('YYYY-MM-DD') для ISO-времени в UTC
export function almatyDate(iso: string): string {
  const t = Date.parse(iso);
  return new Date(t + ALMATY_OFFSET_MS).toISOString().slice(0, 10);
}

export function isValidDate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));
}
