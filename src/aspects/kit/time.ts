// Days are India time everywhere, the same as the server: a "day" is a YYYY-MM-DD string in IST.
const IST = 5.5 * 3600_000;
const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MO = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** The IST day of an instant (default: now). */
export function dayOf(at: Date | string | number = Date.now()) {
  return new Date(new Date(at).getTime() + IST).toISOString().slice(0, 10);
}
export const today = () => dayOf();

/** His day ends at 4 AM, not midnight: he is often up late, and what he does at 1 AM belongs to the evening before. */
export const DAY_ROLLS_AT = 4;
/**
 * The day a tick, log, entry or routine belongs to: the IST day, but before 04:00 it is still yesterday. Use it for
 * "which day does this count for" (routines, logs, journal, streaks). Use `dayOf` to say when something happened.
 */
export function myDay(at: Date | string | number = Date.now()) {
  return dayOf(new Date(at).getTime() - DAY_ROLLS_AT * 3600_000);
}

/** A day `n` days after `day` (negative for before). */
export function addDays(day: string, n: number) {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/** Whole days from `a` to `b` (positive when b is later). */
export function daysBetween(a: string, b: string) {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

/** 0 Sunday .. 6 Saturday. */
export function weekday(day: string) {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** The Monday of the week `day` is in. Weeks start on Monday, as in agentos. */
export function weekStart(day: string = today()) {
  return addDays(day, -((weekday(day) + 6) % 7));
}

/** The last `n` days ending at `end`, oldest first. */
export function lastDays(n: number, end: string = today()) {
  return Array.from({ length: n }, (_, i) => addDays(end, i - n + 1));
}

/** "Today", "Yesterday", "Tomorrow", else "Mon 17 Nov" (with the year when it isn't this one). */
export function dayLabel(day: string) {
  const diff = daysBetween(today(), day);
  if (diff === 0) return 'Today';
  if (diff === -1) return 'Yesterday';
  if (diff === 1) return 'Tomorrow';
  const [y, m, d] = day.split('-').map(Number);
  const base = `${WD[weekday(day)]} ${d} ${MO[m - 1]}`;
  return y === Number(today().slice(0, 4)) ? base : `${base} ${y}`;
}

/** "17 Nov". */
export function shortDay(day: string) {
  const [, m, d] = day.split('-').map(Number);
  return `${d} ${MO[m - 1]}`;
}

/** One letter per weekday, for week strips: M T W T F S S. */
export const weekLetter = (day: string) => 'SMTWTFS'[weekday(day)];

/** The IST clock time of an instant: "14:05". */
export function clock(at: Date | string | number) {
  return new Date(new Date(at).getTime() + IST).toISOString().slice(11, 16);
}

/** "just now", "12 min ago", "3 h ago", "Yesterday", "5 days ago", then the date. */
export function ago(at: Date | string | number) {
  const ms = Date.now() - new Date(at).getTime();
  const min = Math.floor(ms / 60_000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const h = Math.floor(min / 60);
  const days = daysBetween(dayOf(at), today());
  if (days === 0) return `${h} h ago`;
  if (days === 1) return 'Yesterday';
  if (days < 30) return `${days} days ago`;
  return shortDay(dayOf(at));
}

/** Seconds as a timer: "0:45", "12:03", "1:02:09". */
export function timer(seconds: number) {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

/** A number without a trailing ".0": 72, 72.5. */
export function num(v: number, digits = 1) {
  const f = v.toFixed(digits);
  return digits > 0 ? f.replace(/\.?0+$/, '') : f;
}

/** Rupees in the Indian grouping: ₹1,20,000. */
export function rupees(v: number) {
  const n = Math.round(Math.abs(v)).toString();
  const head = n.length > 3 ? `${n.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',')},${n.slice(-3)}` : n;
  return `${v < 0 ? '-' : ''}₹${head}`;
}
