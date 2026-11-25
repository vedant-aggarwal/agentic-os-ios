import * as Linking from 'expo-linking';
import { useMemo } from 'react';
import { addDays, myDay, undoable } from '@/aspects/kit';
import { useCollection, type Doc } from '@/lib/mod';

// The brain games: Chess, Sudoku and Maths. Any one of them keeps the day's brain-game habit (Today's Mind tick and
// the streak); the other two are extras he can still tick, and they show as done when he does. A game played is the
// mind session game-<day>-<id> (kind "game"), the same record Today's tiles and the capture panel write, so a tick in
// one place shows in all three. Days are his days (they roll at 04:00).

export type GameId = 'chess' | 'sudoku' | 'matiks';
export const GAMES: readonly { id: GameId; name: string; app: string; url: string; web: string }[] = [
  { id: 'chess', name: 'Chess', app: 'Duolingo', url: 'duolingo://', web: 'https://www.duolingo.com' },
  { id: 'sudoku', name: 'Sudoku', app: 'New game', url: 'https://sudoku.com', web: 'https://sudoku.com' },
  { id: 'matiks', name: 'Maths', app: 'Matiks', url: 'matiks://', web: 'https://www.matiks.in' },
];
const GAME_RE = /^game-(\d{4}-\d{2}-\d{2})-(chess|sudoku|matiks)$/;
export const gameSessionId = (day: string, id: GameId) => `game-${day}-${id}`;

/** Open the game's app, or its site when the app isn't on the phone. */
export function openGame(id: GameId) {
  const g = GAMES.find((x) => x.id === id);
  if (g) Linking.openURL(g.url).catch(() => Linking.openURL(g.web).catch(() => {}));
}

/**
 * Days in a row with at least one game. Today counts once a game is played; until the day ends, a run that reaches
 * yesterday still stands, so the morning never shows a broken streak.
 */
export function streakOf(days: Set<string>, today: string) {
  let d = days.has(today) ? today : addDays(today, -1);
  let run = 0;
  while (days.has(d)) { run += 1; d = addDays(d, -1); }
  return { run, today: days.has(today) };
}

type Session = Doc & { kind?: string; date?: string; title?: string | null; source?: string };

/** Today's games, the habit, the run of days, and the tick (with Undo when it takes one off). */
export function useGames() {
  const sessions = useCollection<Session>('mind', 'sessions');
  const day = myDay();
  const { played, days } = useMemo(() => {
    const p = new Set<GameId>();
    const ds = new Set<string>();
    for (const x of sessions.items ?? []) {
      const m = GAME_RE.exec(x.id);
      if (!m) continue;
      ds.add(m[1]);
      if (m[1] === day) p.add(m[2] as GameId);
    }
    return { played: p, days: ds };
  }, [sessions.items, day]);

  const toggle = async (id: GameId) => {
    const g = GAMES.find((x) => x.id === id)!;
    const sid = gameSessionId(day, id);
    const fresh = { id: sid, kind: 'game', date: day, title: g.name, source: 'mind' };
    if (!played.has(id)) { await sessions.put(fresh); return; }
    const was = (sessions.items ?? []).find((x) => x.id === sid);
    await sessions.remove(sid);
    undoable(`${g.name} taken off`, async () => { await sessions.put((was ?? fresh) as Session); });
  };

  return {
    day, played, days, kept: played.size > 0, streak: streakOf(days, day), toggle,
    loading: sessions.items == null, error: sessions.items == null ? sessions.error : null, refresh: sessions.refresh,
  };
}
