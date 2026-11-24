// Reads a due date out of a task title as he types it: "call Ravi kal", "invoice 28 nov", "gym next friday".
// Pure and dependency-free (the self-check runs it under plain node: `node src/home/parseDue.check.mjs`).
// Days are YYYY-MM-DD in India time; the caller passes today's IST day. The title itself is never changed.
// When a title holds more than one date, the first one in reading order wins.

const DAY = 86_400_000;
const noon = (iso: string) => Date.parse(`${iso}T12:00:00Z`);
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const plus = (day: string, n: number) => iso(noon(day) + n * DAY);
const pad = (n: number) => String(n).padStart(2, '0');

const WEEKDAYS: [RegExp, number][] = [
  [/^(sun|sunday|ravivar|itwar)$/, 0], [/^(mon|monday|somvar)$/, 1], [/^(tue|tues|tuesday|mangalvar)$/, 2],
  [/^(wed|weds|wednesday|budhvar)$/, 3], [/^(thu|thur|thurs|thursday|guruvar|veervar)$/, 4], [/^(fri|friday|shukravar)$/, 5],
  [/^(sat|saturday|shanivar)$/, 6],
];
const WD = 'sun|sunday|ravivar|itwar|mon|monday|somvar|tue|tues|tuesday|mangalvar|wed|weds|wednesday|budhvar|thu|thur|thurs|thursday|guruvar|veervar|fri|friday|shukravar|sat|saturday|shanivar';
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const MON = 'jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?';
const NUM_WORDS: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, ek: 1, do: 2, teen: 3, char: 4, paanch: 5 };
const N = `(\\d{1,3}|${Object.keys(NUM_WORDS).join('|')})`;
const ORD = '(?:st|nd|rd|th)?';

const count = (s: string) => (/^\d+$/.test(s) ? Number(s) : NUM_WORDS[s] ?? NaN);
const monthOf = (s: string) => MONTHS.indexOf(s.slice(0, 3)) + 1;

/** A real calendar day or null (31 Feb is null). */
function make(y: number, m: number, d: number): string | null {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const s = `${y}-${pad(m)}-${pad(d)}`;
  return iso(noon(s)) === s ? s : null;
}
/** Day + month with no year: this year, or next year once it has passed. */
function nextDayMonth(today: string, m: number, d: number): string | null {
  const y = Number(today.slice(0, 4));
  const s = make(y, m, d);
  if (s && s >= today) return s;
  return make(y + 1, m, d) ?? s;
}
/** An ordinal day alone ("28th"): this month, or next month once it has passed. */
function nextDayOfMonth(today: string, d: number): string | null {
  let y = Number(today.slice(0, 4)), m = Number(today.slice(5, 7));
  for (let i = 0; i < 3; i++) {
    const s = make(y, m, d);
    if (s && s >= today) return s;
    m += 1; if (m > 12) { m = 1; y += 1; }
  }
  return null;
}
/** The next given weekday, today excluded. */
function nextWeekday(today: string, wd: number): string {
  const cur = new Date(noon(today)).getUTCDay();
  return plus(today, ((wd - cur + 7) % 7) || 7);
}
const weekdayOf = (s: string) => WEEKDAYS.find(([r]) => r.test(s))?.[1] ?? -1;

type Rule = { re: RegExp; get: (m: RegExpExecArray, today: string) => string | null };
const RULES: Rule[] = [
  // relative words; "day after tomorrow" before "tomorrow"
  { re: /\b(?:day after tomorrow|day after tmrw|parso|parson)\b/, get: (_, t) => plus(t, 2) },
  { re: /\b(?:tomorrow|tmrw|tmr|tomo|kal)\b/, get: (_, t) => plus(t, 1) },
  { re: /\b(?:today|tonight|aaj)\b/, get: (_, t) => t },
  // in 3 days, in two weeks, 3 days later, after 3 days, 3 din baad
  { re: new RegExp(`\\b(?:in|after)\\s+${N}\\s+(day|days|week|weeks)\\b`), get: (m, t) => span(t, m[1], m[2]) },
  { re: new RegExp(`\\b${N}\\s+(day|days|week|weeks|din|hafte)\\s+(?:later|baad|bad|me|mein)\\b`), get: (m, t) => span(t, m[1], m[2]) },
  // weekdays: "friday", "fri", "next friday", "this fri", "coming friday"
  { re: new RegExp(`\\b(?:(?:next|this|coming|agle|is)\\s+)?(${WD})\\b`), get: (m, t) => { const w = weekdayOf(m[1]); return w < 0 ? null : nextWeekday(t, w); } },
  // 28/11, 28-11, 28/11/2026, 28/11/26 (day first, as in India)
  { re: /\b(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2}|\d{4}))?\b/, get: (m, t) => {
    const d = Number(m[1]), mo = Number(m[2]);
    if (m[3]) { const y = Number(m[3]); return make(y < 100 ? 2000 + y : y, mo, d); }
    return nextDayMonth(t, mo, d);
  } },
  // 28 nov, 28th november, 28 of nov
  { re: new RegExp(`\\b(\\d{1,2})${ORD}\\s*(?:of\\s+)?(${MON})\\b`), get: (m, t) => nextDayMonth(t, monthOf(m[2]), Number(m[1])) },
  // nov 28, november 28th
  { re: new RegExp(`\\b(${MON})\\s+(\\d{1,2})${ORD}\\b`), get: (m, t) => nextDayMonth(t, monthOf(m[1]), Number(m[2])) },
  // 28th on its own (needs the ordinal, so "call 3 people" is not a date)
  { re: /\b(\d{1,2})(?:st|nd|rd|th)\b/, get: (m, t) => nextDayOfMonth(t, Number(m[1])) },
];

function span(today: string, n: string, unit: string): string | null {
  const k = count(n);
  if (!Number.isFinite(k) || k < 0 || k > 365) return null;
  return plus(today, /week|hafte/.test(unit) ? k * 7 : k);
}

/** The due day a title names, or null. `today` is YYYY-MM-DD (IST). */
export function parseDue(title: string, today: string): string | null {
  const s = ` ${title.toLowerCase().replace(/\s+/g, ' ')} `;
  let best: { at: number; day: string } | null = null;
  for (const r of RULES) {
    // every match of the rule, so an impossible one ("31/02") does not hide a real one later in the title
    const re = new RegExp(r.re.source, 'g');
    for (let m = re.exec(s); m; m = re.exec(s)) {
      if (best && m.index >= best.at) break;
      const day = r.get(m, today);
      if (day) { best = { at: m.index, day }; break; }
    }
  }
  return best?.day ?? null;
}

/** "Fri 28 Nov" for a YYYY-MM-DD day. */
export function shortDay(day: string): string {
  const dt = new Date(noon(day));
  return `${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][dt.getUTCDay()]} ${dt.getUTCDate()} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][dt.getUTCMonth()]}`;
}
