/** Whole days from `now` until the next Dec 25 (0 on Christmas Day). */
export function daysUntilChristmas(now = new Date()): number {
  const y = now.getFullYear();
  const today = new Date(y, now.getMonth(), now.getDate());
  let xmas = new Date(y, 11, 25);
  if (today > xmas) xmas = new Date(y + 1, 11, 25);
  return Math.round((xmas.getTime() - today.getTime()) / 86_400_000);
}

export const newId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
