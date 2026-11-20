// Local preview backend: runs the real game rules (shared/logic.ts) against an
// in-browser store and fills the grove with clearly labelled sample players.
// Never shipped to Reddit (only loaded when the build mode is "local").
import type { Store } from '../../shared/logic';
import * as logic from '../../shared/logic';
import { getPuzzle, shiftDay, utcDay } from '../../shared/logic';
import { hash, play, randomPlayer, rng, solve, snip, sapling, grow, tips } from '../../shared/sim';
import type { Puzzle } from '../../shared/sim';

const params = new URLSearchParams(window.location.search);
const DAY = params.get('day') ?? utcDay();
const ME = 'you';
const KEY = `prune-local:${DAY}`;

type Data = {
  kv: Record<string, string>;
  h: Record<string, Record<string, string>>;
  z: Record<string, Record<string, number>>;
};
const load = (): Data => {
  if (params.has('reset')) localStorage.removeItem(KEY);
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as Data;
  } catch {
    /* ignore */
  }
  return { kv: {}, h: {}, z: {} };
};
const d = load();
const save = () => {
  try {
    localStorage.setItem(KEY, JSON.stringify(d));
  } catch {
    /* ignore */
  }
};
const sorted = (k: string) => Object.entries(d.z[k] ?? {}).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));

const store: Store = {
  get: async (k) => d.kv[k],
  set: async (k, v) => {
    d.kv[k] = v;
    save();
  },
  hGet: async (k, f) => d.h[k]?.[f],
  hSet: async (k, f, v) => {
    (d.h[k] ??= {})[f] = v;
    save();
  },
  hSetNX: async (k, f, v) => {
    const h = (d.h[k] ??= {});
    if (f in h) return false;
    h[f] = v;
    save();
    return true;
  },
  hDel: async (k, f) => {
    if (d.h[k]) delete d.h[k][f];
    save();
  },
  hGetAll: async (k) => ({ ...(d.h[k] ?? {}) }),
  zAdd: async (k, m, s) => {
    (d.z[k] ??= {})[m] = s;
    save();
  },
  zIncrBy: async (k, m, by) => {
    const z = (d.z[k] ??= {});
    z[m] = (z[m] ?? 0) + by;
    save();
    return z[m] ?? 0;
  },
  zScore: async (k, m) => d.z[k]?.[m],
  zTop: async (k, n) => sorted(k).slice(0, n).map(([member, score]) => ({ member, score })),
  zCard: async (k) => Object.keys(d.z[k] ?? {}).length,
  zRankDesc: async (k, m) => {
    const i = sorted(k).findIndex(([x]) => x === m);
    return i < 0 ? undefined : i;
  },
};

const NAMES = [
  'sample_mossy_tim', 'sample_kettle_fern', 'sample_wren_daily', 'sample_juniper_jo', 'sample_quietleaf',
  'sample_potting_bench', 'sample_ok_branch', 'sample_lantern_lu', 'sample_figtree88', 'sample_slowgrow',
  'sample_cedar_and_tea', 'sample_hedgehog_ha', 'sample_tidy_twig', 'sample_bark_and_bloom',
];

// Sample players: a few strong plans (the solver with a narrower search) and
// many casual ones (random snips), so the grove looks like a real day.
const seedDay = async (day: string, players: number, withMe: boolean) => {
  const p: Puzzle = await getPuzzle(store, day);
  const r = rng(hash(p.seed, 99));
  for (let i = 0; i < players; i++) {
    const name = NAMES[i % NAMES.length] ?? 'sample';
    const moves = i === 0 ? solve(p, 3).moves : i < 7 ? bestOf(p, hash(p.seed, i), 6 + i * 4) : i < 10 ? smartish(p, hash(p.seed, i)) : randomPlayer(p, hash(p.seed, i, 3));
    await logic.submit(store, day, name, moves);
  }
  const ranked = await store.zTop(`prune:rank:${day}`, players);
  for (const t of ranked) {
    const w = Math.floor(r() * 6);
    for (let k = 0; k < w; k++) await store.zIncrBy(`prune:water:${day}`, t.member, 1);
  }
  if (withMe) await logic.submit(store, day, ME, smartish(p, 7));
};

// A player who tries a few plans in their head and keeps the best one.
const bestOf = (p: Puzzle, seed: number, n: number): number[][] => {
  let best: number[][] = [];
  let bestScore = -1;
  for (let k = 0; k < n; k++) {
    const mv = randomPlayer(p, hash(seed, k));
    const sc = play(p, mv).detail.score;
    if (sc > bestScore) {
      bestScore = sc;
      best = mv;
    }
  }
  return best;
};

// A casual-but-thoughtful player: snips the tip that sticks out the most.
const smartish = (p: Puzzle, seed: number): number[][] => {
  const r = rng(seed);
  let t = sapling(p);
  const moves: number[][] = [];
  let used = 0;
  for (let s = 0; s < p.seasons; s++) {
    const cuts: number[] = [];
    if (used < p.snips && r() < 0.8) {
      const ts = tips(t).filter((x) => x.id !== 0);
      const far = ts.sort((a, b) => Math.abs(b.x1 - 50) - Math.abs(a.x1 - 50))[Math.floor(r() * 2)];
      if (far) {
        t = snip(t, far.id);
        cuts.push(far.id);
        used++;
      }
    }
    moves.push(cuts);
    t = grow(t, p.species, p.seed);
  }
  return play(p, moves).ok ? moves : [];
};

let ready: Promise<void> | null = null;
const prepare = () =>
  (ready ??= (async () => {
    if (d.kv['seeded']) return;
    // Three earlier days so "yesterday's pick" and your streak have history.
    for (let i = 3; i >= 1; i--) await seedDay(shiftDay(DAY, -i), 8, true);
    await seedDay(DAY, 14, false);
    d.kv['seeded'] = '1';
    save();
  })());

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const mockApi = {
  init: async () => {
    await prepare();
    return { ...(await logic.init(store, DAY, ME, !params.has('clean'))) };
  },
  submit: async (moves: number[][]) => {
    await prepare();
    await wait(350);
    const r = await logic.submit(store, DAY, ME, moves);
    if ('error' in r) throw new Error(r.error);
    return r;
  },
  grove: async () => {
    await prepare();
    return logic.grove(store, DAY, ME);
  },
  water: async (owner: string) => {
    const r = await logic.water(store, DAY, ME, owner);
    if ('error' in r) throw new Error(r.error);
    return r;
  },
  share: async () => {
    const r = await logic.shareText(store, DAY, ME);
    return { ...r, message: r.ok ? 'Local preview: on Reddit this posts as a comment under your name.' : r.message };
  },
};
