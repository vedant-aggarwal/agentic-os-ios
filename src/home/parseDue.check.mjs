// Self-check for parseDue: `node src/home/parseDue.check.mjs` (node 23.6+ strips the types) or `bun src/home/parseDue.check.mjs`.
// Today is fixed at Tue 24 Nov 2026 so the answers are stable.
import { parseDue, shortDay } from './parseDue.ts';

const T = '2026-11-24';
const cases = [
  ['Call Ravi today', '2026-11-24'], ['aaj gym', '2026-11-24'], ['tonight call papa', '2026-11-24'],
  ['pay rent tomorrow', '2026-11-25'], ['kal shop jaana', '2026-11-25'], ['tmrw call', '2026-11-25'],
  ['day after tomorrow dentist', '2026-11-26'], ['parso meeting', '2026-11-26'],
  ['gym friday', '2026-11-27'], ['gym fri', '2026-11-27'], ['next friday review', '2026-11-27'], ['this sat clean room', '2026-11-28'],
  ['standup tuesday', '2026-12-01'], ['tue standup', '2026-12-01'], ['mon plan', '2026-11-30'], ['Monday plan', '2026-11-30'], ['sunday walk', '2026-11-29'],
  ['in 3 days send deck', '2026-11-27'], ['in two weeks', '2026-12-08'], ['in a week', '2026-12-01'],
  ['5 days later follow up', '2026-11-29'], ['follow up after 10 days', '2026-12-04'], ['3 din baad', '2026-11-27'],
  ['invoice 28 nov', '2026-11-28'], ['invoice nov 28', '2026-11-28'], ['28th nov', '2026-11-28'], ['November 28th', '2026-11-28'],
  ['invoice 28/11', '2026-11-28'], ['fees 5/1', '2027-01-05'], ['28/11/2027 renew', '2027-11-28'], ['diwali 20 oct', '2027-10-20'],
  ['rent 1st', '2026-12-01'], ['bill 28th', '2026-11-28'],
  ['gym kal or friday', '2026-11-25'], ['31/02 then 28/11', '2026-11-28'],
  ['call 3 people', null], ['kalash puja', null], ['Mondays are slow', null], ['buy samosa', null], ['Read 20 pages', null], ['', null],
];
const yearEnd = [['tomorrow', '2026-12-31'], ['in 3 days', '2027-01-02'], ['2nd', '2027-01-02'], ['5 jan', '2027-01-05'], ['friday', '2027-01-01']];

let bad = 0;
const run = (today, list) => {
  for (const [title, want] of list) {
    const got = parseDue(title, today);
    const ok = got === want;
    if (!ok) bad++;
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${JSON.stringify(title).padEnd(30)} -> ${got ?? 'null'}${ok ? '' : `  (want ${want ?? 'null'})`}`);
  }
};
run(T, cases);
run('2026-12-30', yearEnd);
if (shortDay('2026-11-28') !== 'Sat 28 Nov') { bad++; console.log('FAIL shortDay', shortDay('2026-11-28')); }
console.log(bad ? `\n${bad} failed` : `\nall ${cases.length + yearEnd.length} passed`);
process.exit(bad ? 1 : 0);
