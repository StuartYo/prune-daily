// Game rules on top of a tiny key-value interface. The Devvit server passes
// Reddit's Redis; the local preview passes an in-browser store. Same code.
import type {
  GroveResponse,
  InitResponse,
  MyPlay,
  Pick,
  PublicPuzzle,
  ShareResponse,
  Streak,
  SubmitResponse,
  WaterResponse,
} from './api.ts';
import { buildPuzzle, dayNumber, play, type Puzzle } from './sim.ts';

export type Store = {
  get(key: string): Promise<string | undefined>;
  set(key: string, value: string): Promise<void>;
  hGet(key: string, field: string): Promise<string | undefined>;
  hSet(key: string, field: string, value: string): Promise<void>;
  /** Sets the field only if it is not there yet. True if this call set it. */
  hSetNX(key: string, field: string, value: string): Promise<boolean>;
  hDel(key: string, field: string): Promise<void>;
  hGetAll(key: string): Promise<Record<string, string>>;
  zAdd(key: string, member: string, score: number): Promise<void>;
  zIncrBy(key: string, member: string, by: number): Promise<number>;
  zScore(key: string, member: string): Promise<number | undefined>;
  zTop(key: string, count: number): Promise<{ member: string; score: number }[]>;
  zCard(key: string): Promise<number>;
  zRankDesc(key: string, member: string): Promise<number | undefined>;
};

export const utcDay = (ms = Date.now()) => new Date(ms).toISOString().slice(0, 10);
export const shiftDay = (day: string, by: number) =>
  utcDay(Date.parse(day + 'T00:00:00Z') + by * 86400000);

type StoredPlay = { moves: number[][]; score: number; fill: number; spill: number; snips: number; at: number };

const K = {
  puzzle: (d: string) => `prune:puzzle:${d}`,
  plays: (d: string) => `prune:plays:${d}`,
  rank: (d: string) => `prune:rank:${d}`,
  water: (d: string) => `prune:water:${d}`,
  watered: (d: string, viewer: string) => `prune:watered:${d}:${viewer}`,
  streak: (u: string) => `prune:streak:${u}`,
  post: (id: string) => `prune:post:${id}`,
  dayPost: (d: string) => `prune:dayPost:${d}`,
};

// Rank key: score first, fewer snips breaks ties.
const rankValue = (score: number, snips: number) => score * 10 + (9 - Math.min(9, snips));

export const getPuzzle = async (s: Store, day: string): Promise<Puzzle> => {
  const cached = await s.get(K.puzzle(day));
  if (cached) return JSON.parse(cached) as Puzzle;
  const p = buildPuzzle(day);
  const { randomAvg: _r, ...puzzle } = p;
  void _r;
  await s.set(K.puzzle(day), JSON.stringify(puzzle));
  return puzzle;
};

export const publicPuzzle = (p: Puzzle): PublicPuzzle => {
  const { parMoves: _m, ...rest } = p;
  void _m;
  return rest;
};

export const dayForPost = async (s: Store, postId: string | undefined) => {
  if (postId) {
    const d = await s.get(K.post(postId));
    if (d) return d;
  }
  return utcDay();
};

export const rememberPost = (s: Store, postId: string, day: string) => s.set(K.post(postId), day);

// One post per day, whoever asks first (scheduler, install trigger, mod menu).
// claim → create post → recordDayPost; on failure releaseDayPost so a retry can.
export type DayPostClaim = { claimed: true } | { claimed: false; postId: string | undefined };
export const claimDayPost = async (s: Store, day: string): Promise<DayPostClaim> => {
  if (await s.hSetNX(K.dayPost(day), 'claim', String(Date.now()))) return { claimed: true };
  return { claimed: false, postId: await s.hGet(K.dayPost(day), 'post') };
};
export const recordDayPost = async (s: Store, day: string, postId: string) => {
  await s.hSet(K.dayPost(day), 'post', postId);
  await rememberPost(s, postId, day);
};
export const releaseDayPost = (s: Store, day: string) => s.hDel(K.dayPost(day), 'claim');

const readStreak = async (s: Store, u: string, today: string): Promise<Streak> => {
  const raw = await s.get(K.streak(u));
  const st: Streak = raw ? (JSON.parse(raw) as Streak) : { count: 0, best: 0, last: '' };
  // A streak you can still extend today is alive; older than yesterday is gone.
  // (last can be later than `today` when someone opens an old post.)
  if (st.last && st.last < shiftDay(today, -1)) return { ...st, count: 0 };
  return st;
};

const myPlay = async (s: Store, day: string, u: string): Promise<MyPlay | null> => {
  const raw = await s.hGet(K.plays(day), u);
  if (!raw) return null;
  const p = JSON.parse(raw) as StoredPlay;
  const [rank, total] = await Promise.all([s.zRankDesc(K.rank(day), u), s.zCard(K.rank(day))]);
  return { moves: p.moves, score: p.score, fill: p.fill, spill: p.spill, snips: p.snips, rank: (rank ?? 0) + 1, total };
};

export const yesterdayPick = async (s: Store, day: string): Promise<Pick | null> => {
  const y = shiftDay(day, -1);
  const top = (await s.zTop(K.water(y), 1))[0];
  if (top && top.score > 0) {
    const raw = await s.hGet(K.plays(y), top.member);
    const score = raw ? (JSON.parse(raw) as StoredPlay).score : 0;
    return { username: top.member, score, water: top.score, day: y };
  }
  const best = (await s.zTop(K.rank(y), 1))[0];
  if (!best) return null;
  return { username: best.member, score: Math.floor(best.score / 10), water: 0, day: y };
};

export const init = async (s: Store, day: string, username: string, sample = false): Promise<InitResponse> => {
  const puzzle = await getPuzzle(s, day);
  const [played, streak, players, yesterday] = await Promise.all([
    myPlay(s, day, username),
    readStreak(s, username, day),
    s.zCard(K.rank(day)),
    yesterdayPick(s, day),
  ]);
  return { type: 'init', username, puzzle: publicPuzzle(puzzle), played, streak, players, yesterday, sample };
};

export const histogram = async (s: Store, day: string) => {
  const all = await s.hGetAll(K.plays(day));
  const h = new Array<number>(10).fill(0);
  for (const v of Object.values(all)) {
    const sc = (JSON.parse(v) as StoredPlay).score;
    const i = Math.min(9, Math.floor(sc / 10));
    h[i] = (h[i] ?? 0) + 1;
  }
  return h;
};

export const flairText = (st: Streak) =>
  st.count >= 2 ? `Pruner · ${st.count}-day streak` : 'Pruner';

export const submit = async (
  s: Store,
  day: string,
  username: string,
  moves: number[][],
): Promise<SubmitResponse | { error: string }> => {
  const puzzle = await getPuzzle(s, day);
  const existing = await myPlay(s, day, username);
  if (existing) {
    return { type: 'submit', played: existing, streak: await readStreak(s, username, day), flair: null, histogram: await histogram(s, day) };
  }
  // The server replays the snips itself; the client never sends a score.
  const r = play(puzzle, moves);
  if (!r.ok) return { error: r.error ?? 'invalid moves' };
  const stored: StoredPlay = {
    moves,
    score: r.detail.score,
    fill: r.detail.fill,
    spill: r.detail.spill,
    snips: r.snipsUsed,
    at: Date.now(),
  };
  // hSetNX: if two requests from the same player race, only one is stored.
  const first = await s.hSetNX(K.plays(day), username, JSON.stringify(stored));
  if (!first) {
    const won = await myPlay(s, day, username);
    if (!won) return { error: 'could not save' };
    return { type: 'submit', played: won, streak: await readStreak(s, username, day), flair: null, histogram: await histogram(s, day) };
  }
  await s.zAdd(K.rank(day), username, rankValue(stored.score, stored.snips));

  const raw = await s.get(K.streak(username));
  const prev: Streak = raw ? (JSON.parse(raw) as Streak) : { count: 0, best: 0, last: '' };
  let streak: Streak;
  let flair: string | null;
  if (prev.last && day <= prev.last) {
    // An old post (or today again): playing it never changes the streak.
    streak = prev;
    flair = null;
  } else {
    const count = prev.last === shiftDay(day, -1) ? prev.count + 1 : 1;
    streak = { count, best: Math.max(prev.best, count), last: day };
    await s.set(K.streak(username), JSON.stringify(streak));
    flair = flairText(streak);
  }

  const played = await myPlay(s, day, username);
  if (!played) return { error: 'could not save' };
  return { type: 'submit', played, streak, flair, histogram: await histogram(s, day) };
};

export const grove = async (s: Store, day: string, viewer: string, limit = 24): Promise<GroveResponse> => {
  const top = await s.zTop(K.rank(day), limit);
  const all = await s.hGetAll(K.plays(day));
  const mine = await s.hGetAll(K.watered(day, viewer));
  const trees = [];
  for (const t of top) {
    const raw = all[t.member];
    if (!raw) continue;
    const p = JSON.parse(raw) as StoredPlay;
    const water = (await s.zScore(K.water(day), t.member)) ?? 0;
    trees.push({
      username: t.member,
      moves: p.moves,
      score: p.score,
      snips: p.snips,
      water,
      wateredByMe: mine[t.member] === '1',
      me: t.member === viewer,
    });
  }
  return { type: 'grove', trees, players: await s.zCard(K.rank(day)), histogram: await histogram(s, day) };
};

export const water = async (s: Store, day: string, viewer: string, owner: string): Promise<WaterResponse | { error: string }> => {
  if (viewer === owner) return { error: 'You cannot water your own tree.' };
  if (!(await s.hGet(K.plays(day), viewer))) return { error: 'Finish today’s tree first, then you can water others.' };
  if (!(await s.hGet(K.plays(day), owner))) return { error: 'That tree is gone.' };
  const already = (await s.hGet(K.watered(day, viewer), owner)) === '1';
  if (already) {
    return { type: 'water', owner, water: (await s.zScore(K.water(day), owner)) ?? 0, wateredByMe: true };
  }
  await s.hSet(K.watered(day, viewer), owner, '1');
  const w = await s.zIncrBy(K.water(day), owner, 1);
  return { type: 'water', owner, water: w, wateredByMe: true };
};

// Comment text is built on the server from the stored play, so nobody can
// post a fake score. It shows the result without giving away the snips.
export const shareText = async (s: Store, day: string, username: string): Promise<ShareResponse> => {
  const p = await myPlay(s, day, username);
  const puzzle = await getPuzzle(s, day);
  if (!p) return { type: 'share', ok: false, text: '', message: 'Finish today’s tree first.' };
  const st = await readStreak(s, username, day);
  const diff = p.score - puzzle.par;
  const vsPar = diff === 0 ? 'right on par' : diff > 0 ? `${diff} over par` : `${-diff} under par`;
  const bar = (v: number) => '█'.repeat(Math.round(v / 10)) + '░'.repeat(10 - Math.round(v / 10));
  const text = [
    `**Prune No. ${dayNumber(day)}** · ${puzzle.target.style} ${puzzle.species.name}`,
    '',
    `Crown match **${p.score}** (${vsPar}, par ${puzzle.par}) · ${p.snips} snip${p.snips === 1 ? '' : 's'}`,
    '',
    `\`fill  ${bar(p.fill)} ${p.fill}%\`  `,
    `\`spill ${bar(Math.min(100, p.spill))} ${p.spill}%\``,
    '',
    `#${p.rank} of ${p.total} today${st.count >= 2 ? ` · ${st.count}-day streak` : ''}`,
  ].join('\n');
  return { type: 'share', ok: true, text, message: '' };
};
