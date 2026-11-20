// Deterministic tree growth used by both the browser and the server.
// Same puzzle + same snips => same tree, on every device. The server
// re-runs this to compute the official score, so the client can't fake it.

export const WORLD_W = 100;
export const WORLD_H = 120;
export const POT_TOP = 14;
const CELL = 2;
const GRID_W = WORLD_W / CELL;
const GRID_H = WORLD_H / CELL;
const DIR_COUNT = 64;
const UP = 16;
export const TUNE = { leafR: 6.5, leafSeasons: 3, spillW: 0.35, curl: 6, scale: 1 };

// Direction table rounded to 6 decimals so Math.cos/sin differences between
// JS engines (last-bit noise) can never change a result.
const round6 = (v: number) => Math.round(v * 1e6) / 1e6;
const DX: number[] = [];
const DY: number[] = [];
for (let i = 0; i < DIR_COUNT; i++) {
  const a = (i / DIR_COUNT) * Math.PI * 2;
  DX.push(round6(Math.cos(a)));
  DY.push(round6(Math.sin(a)));
}
const dx = (d: number) => DX[((d % DIR_COUNT) + DIR_COUNT) % DIR_COUNT] ?? 0;
const dy = (d: number) => DY[((d % DIR_COUNT) + DIR_COUNT) % DIR_COUNT] ?? 0;

export const hash = (...parts: number[]): number => {
  let h = 0x811c9dc5;
  for (const p of parts) {
    h ^= p | 0;
    h = Math.imul(h, 0x01000193);
    h ^= h >>> 15;
    h = Math.imul(h, 0x2c1b3c6d);
    h ^= h >>> 12;
  }
  return h >>> 0;
};

export const rng = (seed: number) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

export type Species = {
  name: string;
  angle: number; // fork half-angle, in direction steps (1 step = 5.625 deg)
  len: number; // first segment length
  decay: number; // length multiplier per depth
  budget: number; // new segments per season
  lift: number; // how much upward-facing buds are favoured
  wind: number; // -1, 0, 1: steady lean of new growth
  hue: number; // leaf hue in degrees
};

export type Ellipse = { cx: number; cy: number; rx: number; ry: number };
export type Target = { style: string; ellipses: Ellipse[] };

export type Puzzle = {
  day: string; // YYYY-MM-DD (UTC)
  no: number;
  seed: number;
  species: Species;
  target: Target;
  seasons: number;
  snips: number; // total snips for the day
  perSeason: number; // max snips before each growth
  par: number;
  parMoves: number[][];
  baseline: number; // score if you never cut
  difficulty: number; // 1..5
};

export type Seg = {
  id: number;
  parent: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  dir: number;
  depth: number;
  born: number;
  alive: boolean;
};

export type Tree = { segs: Seg[]; season: number; nextId: number };

const segLen = (sp: Species, depth: number) =>
  Math.max(2.6, round6(sp.len * Math.pow(sp.decay, depth)));

const cloneTree = (t: Tree): Tree => ({
  season: t.season,
  nextId: t.nextId,
  segs: t.segs.map((s) => ({ ...s })),
});

const addSeg = (t: Tree, sp: Species, parent: Seg, dir: number) => {
  const minDir = -6;
  const maxDir = UP * 2 + 6;
  // Gentle gravitropism: branches more than 45 deg off vertical curl upward.
  let bent = dir;
  if (bent < UP - TUNE.curl) bent += 1;
  else if (bent > UP + TUNE.curl) bent -= 1;
  const d = Math.min(maxDir, Math.max(minDir, bent));
  const depth = parent.depth + 1;
  const L = segLen(sp, depth);
  const x1 = round6(parent.x1 + dx(d) * L);
  const y1 = round6(parent.y1 + dy(d) * L);
  if (x1 < 3 || x1 > WORLD_W - 3 || y1 < POT_TOP + 2 || y1 > WORLD_H - 3) {
    return null;
  }
  const s: Seg = {
    id: t.nextId++,
    parent: parent.id,
    x0: parent.x1,
    y0: parent.y1,
    x1,
    y1,
    dir: d,
    depth,
    born: t.season,
    alive: true,
  };
  t.segs.push(s);
  return s;
};

export const aliveChildren = (t: Tree, id: number) =>
  t.segs.filter((s) => s.alive && s.parent === id);

export const tips = (t: Tree): Seg[] => {
  const hasChild = new Set<number>();
  for (const s of t.segs) if (s.alive && s.parent >= 0) hasChild.add(s.parent);
  return t.segs.filter((s) => s.alive && !hasChild.has(s.id));
};

const tipWeight = (sp: Species, s: Seg) => 1 + sp.lift * Math.max(0, dy(s.dir));

// How many new segments each bud will get next season. Exposed so the UI can
// draw bud size: snip one branch and the remaining buds visibly swell.
export const allocation = (t: Tree, sp: Species): Map<number, number> => {
  const ts = tips(t);
  const out = new Map<number, number>();
  if (ts.length === 0) return out;
  const w = ts.map((s) => tipWeight(sp, s));
  const sum = w.reduce((a, b) => a + b, 0);
  const raw = w.map((x) => (x / sum) * sp.budget);
  const fl = raw.map((x) => Math.floor(x));
  let left = sp.budget - fl.reduce((a, b) => a + b, 0);
  const order = raw
    .map((x, i) => ({ i, f: x - Math.floor(x), id: ts[i]?.id ?? 0 }))
    .sort((a, b) => b.f - a.f || a.id - b.id);
  for (const o of order) {
    if (left <= 0) break;
    fl[o.i] = (fl[o.i] ?? 0) + 1;
    left--;
  }
  ts.forEach((s, i) => out.set(s.id, fl[i] ?? 0));
  return out;
};

const growFrom = (t: Tree, sp: Species, seed: number, from: Seg, k: number) => {
  if (k <= 0) return;
  const h = hash(seed, from.id, 7);
  const jitter = (h % 3) - 1;
  const lean = from.depth % 2 === 0 ? sp.wind : 0;
  if (k === 1) {
    addSeg(t, sp, from, from.dir + jitter + lean);
    return;
  }
  const spread = sp.angle + ((h >>> 4) % 2);
  const a = addSeg(t, sp, from, from.dir + spread + lean);
  const b = addSeg(t, sp, from, from.dir - spread + lean);
  const rest = k - 2;
  const big = Math.ceil(rest / 2);
  const small = rest - big;
  const leftFirst = ((h >>> 8) & 1) === 1;
  if (a) growFrom(t, sp, seed, a, leftFirst ? big : small);
  if (b) growFrom(t, sp, seed, b, leftFirst ? small : big);
};

export const grow = (t0: Tree, sp: Species, seed: number): Tree => {
  const t = cloneTree(t0);
  t.season += 1;
  const alloc = allocation(t0, sp);
  const ts = tips(t0).sort((a, b) => a.id - b.id);
  for (const tip of ts) {
    const node = t.segs.find((s) => s.id === tip.id);
    if (node) growFrom(t, sp, seed, node, alloc.get(tip.id) ?? 0);
  }
  return t;
};

export const snip = (t0: Tree, id: number): Tree => {
  const t = cloneTree(t0);
  const kill = new Set<number>([id]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const s of t.segs) {
      if (s.alive && !kill.has(s.id) && kill.has(s.parent)) {
        kill.add(s.id);
        changed = true;
      }
    }
  }
  for (const s of t.segs) if (kill.has(s.id)) s.alive = false;
  return t;
};

export const subtreeIds = (t: Tree, id: number): number[] => {
  const out = [id];
  for (let i = 0; i < out.length; i++) {
    const cur = out[i];
    for (const s of t.segs) if (s.alive && s.parent === cur) out.push(s.id);
  }
  return out;
};

export const sapling = (p: Pick<Puzzle, 'species' | 'seed'>): Tree => {
  const sp = p.species;
  const trunk: Seg = {
    id: 0,
    parent: -1,
    x0: 50,
    y0: POT_TOP,
    x1: 50,
    y1: POT_TOP + round6(sp.len * 1.5),
    dir: UP,
    depth: 0,
    born: 0,
    alive: true,
  };
  let t: Tree = { segs: [trunk], season: 0, nextId: 1 };
  t = grow(t, { ...sp, budget: 3 }, p.seed);
  t = grow(t, { ...sp, budget: Math.round(sp.budget * 0.7) }, p.seed);
  t.season = 0;
  for (const s of t.segs) s.born = 0;
  return t;
};

export const leaves = (t: Tree) =>
  t.segs.filter((s) => s.alive && s.id !== 0 && s.born >= t.season - (TUNE.leafSeasons - 1));

const inEllipse = (e: Ellipse, x: number, y: number) => {
  const u = (x - e.cx) / e.rx;
  const v = (y - e.cy) / e.ry;
  return u * u + v * v <= 1;
};

const targetMaskCache = new Map<string, Uint8Array>();
export const targetMask = (target: Target) => {
  const key = JSON.stringify(target.ellipses);
  const hit = targetMaskCache.get(key);
  if (hit) return hit;
  const m = new Uint8Array(GRID_W * GRID_H);
  for (let gy = 0; gy < GRID_H; gy++) {
    for (let gx = 0; gx < GRID_W; gx++) {
      const x = gx * CELL + CELL / 2;
      const y = gy * CELL + CELL / 2;
      if (target.ellipses.some((e) => inEllipse(e, x, y))) m[gy * GRID_W + gx] = 1;
    }
  }
  targetMaskCache.set(key, m);
  return m;
};

export type ScoreDetail = {
  score: number;
  fill: number; // % of target covered
  spill: number; // leaf area outside, as % of target area
};

export const scoreTree = (t: Tree, target: Target): ScoreDetail => {
  const tm = targetMask(target);
  const lm = new Uint8Array(GRID_W * GRID_H);
  const r = TUNE.leafR;
  for (const s of leaves(t)) {
    const gx0 = Math.max(0, Math.floor((s.x1 - r) / CELL));
    const gx1 = Math.min(GRID_W - 1, Math.floor((s.x1 + r) / CELL));
    const gy0 = Math.max(0, Math.floor((s.y1 - r) / CELL));
    const gy1 = Math.min(GRID_H - 1, Math.floor((s.y1 + r) / CELL));
    for (let gy = gy0; gy <= gy1; gy++) {
      for (let gx = gx0; gx <= gx1; gx++) {
        const cx = gx * CELL + CELL / 2 - s.x1;
        const cy = gy * CELL + CELL / 2 - s.y1;
        if (cx * cx + cy * cy <= r * r) lm[gy * GRID_W + gx] = 1;
      }
    }
  }
  let tc = 0;
  let inside = 0;
  let outside = 0;
  for (let i = 0; i < tm.length; i++) {
    if (tm[i]) tc++;
    if (lm[i] && tm[i]) inside++;
    else if (lm[i]) outside++;
  }
  const fill = tc ? inside / tc : 0;
  const spill = tc ? outside / tc : 0;
  const score = Math.max(0, Math.min(100, Math.round(100 * (fill - TUNE.spillW * spill))));
  return { score, fill: Math.round(fill * 100), spill: Math.round(spill * 100) };
};

export type PlayResult = {
  ok: boolean;
  error?: string;
  tree: Tree;
  detail: ScoreDetail;
  snipsUsed: number;
};

// Replays a full day: moves[i] = segment ids snipped before growth i.
export const play = (p: Puzzle, moves: number[][]): PlayResult => {
  let t = sapling(p);
  let used = 0;
  if (moves.length > p.seasons) {
    return { ok: false, error: 'too many seasons', tree: t, detail: scoreTree(t, p.target), snipsUsed: 0 };
  }
  for (let i = 0; i < p.seasons; i++) {
    const cuts = moves[i] ?? [];
    if (cuts.length > p.perSeason) {
      return { ok: false, error: 'too many snips in one season', tree: t, detail: scoreTree(t, p.target), snipsUsed: used };
    }
    for (const id of cuts) {
      const s = t.segs.find((x) => x.id === id);
      if (!s || !s.alive || s.id === 0) {
        return { ok: false, error: `branch ${id} cannot be cut`, tree: t, detail: scoreTree(t, p.target), snipsUsed: used };
      }
      t = snip(t, id);
      used++;
    }
    if (used > p.snips) {
      return { ok: false, error: 'out of snips', tree: t, detail: scoreTree(t, p.target), snipsUsed: used };
    }
    t = grow(t, p.species, p.seed);
  }
  return { ok: true, tree: t, detail: scoreTree(t, p.target), snipsUsed: used };
};

// Partial replay for the UI: tree after `moves` (seasons already grown) plus
// pending snips for the current season.
export const replayTo = (p: Puzzle, grown: number[][], pending: number[]): Tree => {
  let t = sapling(p);
  for (const cuts of grown) {
    for (const id of cuts) t = snip(t, id);
    t = grow(t, p.species, p.seed);
  }
  for (const id of pending) t = snip(t, id);
  return t;
};

// ---------- daily puzzle generation ----------

const STYLES = ['Broom', 'Windswept', 'Twin', 'Tiers', 'Slant', 'Lantern'] as const;
const SPECIES_NAMES = ['Juniper', 'Maple', 'Elm', 'Pine', 'Olive', 'Beech', 'Larch', 'Hornbeam'];

const makeTarget = (style: string, r: () => number): Target => {
  const j = (n: number) => (r() - 0.5) * 2 * n;
  const side = r() < 0.5 ? -1 : 1;
  const E = (cx: number, cy: number, rx: number, ry: number): Ellipse => ({
    cx: round6(cx),
    cy: round6(cy - 4),
    rx: round6(rx * TUNE.scale),
    ry: round6(ry * TUNE.scale),
  });
  switch (style) {
    case 'Windswept':
      return {
        style,
        ellipses: [E(50 + side * (14 + j(3)), 58 + j(4), 25 + j(3), 12 + j(2)), E(50 + side * 2, 46 + j(3), 12, 9)],
      };
    case 'Twin':
      return {
        style,
        ellipses: [E(34 + j(3), 58 + j(5), 14 + j(2), 13 + j(2)), E(66 + j(3), 64 + j(5), 14 + j(2), 13 + j(2))],
      };
    case 'Tiers':
      return {
        style,
        ellipses: [E(50 + j(4), 48 + j(3), 30 + j(3), 9), E(50 + j(4), 74 + j(3), 20 + j(3), 9)],
      };
    case 'Slant':
      return {
        style,
        ellipses: [E(50 - side * 16, 44 + j(3), 12, 10), E(50, 60 + j(3), 14, 11), E(50 + side * 17, 76 + j(3), 12, 10)],
      };
    case 'Lantern':
      return { style, ellipses: [E(50 + j(3), 66 + j(4), 15 + j(2), 26 + j(3))] };
    default:
      return { style: 'Broom', ellipses: [E(50 + j(4), 60 + j(4), 27 + j(3), 20 + j(3)), E(50, 80 + j(2), 13, 8)] };
  }
};

export const dayNumber = (day: string, epoch = '2026-11-20') =>
  Math.round((Date.parse(day + 'T00:00:00Z') - Date.parse(epoch + 'T00:00:00Z')) / 86400000) + 1;

export const weekdayOf = (day: string) => new Date(day + 'T00:00:00Z').getUTCDay();

// Monday easiest (1) ... Sunday hardest (5).
export const targetDifficulty = (day: string) => [5, 1, 2, 2, 3, 4, 5][weekdayOf(day)] ?? 3;

export const draftPuzzle = (day: string, attempt: number): Puzzle => {
  const no = dayNumber(day);
  const seed = hash(no, attempt, 0x5eed);
  const r = rng(seed);
  const species: Species = {
    name: SPECIES_NAMES[Math.floor(r() * SPECIES_NAMES.length)] ?? 'Juniper',
    angle: 4 + Math.floor(r() * 4),
    len: round6(8 + r() * 2.5),
    decay: round6(0.86 + r() * 0.06),
    budget: 11 + Math.floor(r() * 5),
    lift: round6(0.4 + r() * 1.4),
    wind: Math.floor(r() * 3) - 1,
    hue: Math.round(78 + r() * 50),
  };
  const style = STYLES[(no + attempt) % STYLES.length] ?? 'Broom';
  const target = makeTarget(style, r);
  return {
    day,
    no,
    seed,
    species,
    target,
    seasons: 4,
    snips: 6,
    perSeason: 2,
    par: 0,
    parMoves: [],
    baseline: 0,
    difficulty: 3,
  };
};

const candidates = (t: Tree) => t.segs.filter((s) => s.alive && s.id !== 0).map((s) => s.id);

const rollout = (p: Puzzle, t: Tree, fromSeason: number) => {
  let x = t;
  for (let i = fromSeason; i < p.seasons; i++) x = grow(x, p.species, p.seed);
  return scoreTree(x, p.target).score;
};

type Beam = { tree: Tree; moves: number[][]; used: number; score: number };

// Beam search: good enough to set a fair "par" that real players can reach
// and sometimes beat.
export const solve = (p: Puzzle, width = 5): { par: number; moves: number[][] } => {
  let beam: Beam[] = [{ tree: sapling(p), moves: [], used: 0, score: 0 }];
  let best = { par: 0, moves: [] as number[][] };
  for (let season = 0; season < p.seasons; season++) {
    const next: Beam[] = [];
    for (const b of beam) {
      const cand = candidates(b.tree);
      const singles: { id: number; score: number; t: Tree }[] = [];
      const push = (cuts: number[], t: Tree) => {
        const grown = grow(t, p.species, p.seed);
        const score = rollout(p, grown, season + 1);
        next.push({ tree: grown, moves: [...b.moves, cuts], used: b.used + cuts.length, score });
        return score;
      };
      push([], b.tree);
      if (b.used < p.snips) {
        for (const id of cand) {
          const t = snip(b.tree, id);
          singles.push({ id, score: push([id], t), t });
        }
        if (b.used + 2 <= p.snips && p.perSeason >= 2) {
          const top = singles.sort((a, c) => c.score - a.score).slice(0, 7);
          for (let i = 0; i < top.length; i++) {
            for (let k = i + 1; k < top.length; k++) {
              const A = top[i];
              const B = top[k];
              if (!A || !B) continue;
              if (!A.t.segs.find((s) => s.id === B.id)?.alive) continue;
              push([A.id, B.id], snip(A.t, B.id));
            }
          }
        }
      }
    }
    next.sort((a, c) => c.score - a.score || a.used - c.used);
    const seen = new Set<string>();
    beam = [];
    for (const n of next) {
      const key = n.tree.segs.filter((s) => s.alive).length + ':' + n.score;
      if (seen.has(key)) continue;
      seen.add(key);
      beam.push(n);
      if (beam.length >= width) break;
    }
  }
  for (const b of beam) {
    const s = scoreTree(b.tree, p.target).score;
    if (s > best.par) best = { par: s, moves: b.moves };
  }
  return best;
};

export const randomPlayer = (p: Puzzle, seed: number): number[][] => {
  const r = rng(seed);
  let t = sapling(p);
  let used = 0;
  const moves: number[][] = [];
  for (let i = 0; i < p.seasons; i++) {
    const cuts: number[] = [];
    const n = Math.min(p.perSeason, p.snips - used, Math.floor(r() * 3));
    for (let k = 0; k < n; k++) {
      const c = candidates(t);
      const id = c[Math.floor(r() * c.length)];
      if (id === undefined) break;
      t = snip(t, id);
      cuts.push(id);
      used++;
    }
    moves.push(cuts);
    t = grow(t, p.species, p.seed);
  }
  return moves;
};

export const measure = (p: Puzzle) => {
  const baseline = play(p, []).detail.score;
  const { par, moves } = solve(p);
  let sum = 0;
  const N = 24;
  for (let i = 0; i < N; i++) sum += play(p, randomPlayer(p, hash(p.seed, i))).detail.score;
  const randomAvg = Math.round(sum / N);
  // Gap between a careless player and the best plan we found.
  const gap = par - randomAvg;
  const difficulty = gap < 34 ? 1 : gap < 40 ? 2 : gap < 46 ? 3 : gap < 52 ? 4 : 5;
  return { baseline, par, moves, randomAvg, difficulty };
};

// Picks the draft whose measured difficulty matches the weekday.
export const buildPuzzle = (day: string, maxAttempts = 12): Puzzle & { randomAvg: number } => {
  const want = targetDifficulty(day);
  let pick: (Puzzle & { randomAvg: number }) | null = null;
  let pickDist = 99;
  for (let a = 0; a < maxAttempts; a++) {
    const p = draftPuzzle(day, a);
    const m = measure(p);
    if (m.par < 72 || m.baseline > m.par - 15) continue;
    const dist = Math.abs(m.difficulty - want);
    if (dist < pickDist) {
      pickDist = dist;
      pick = { ...p, par: m.par, parMoves: m.moves, baseline: m.baseline, difficulty: m.difficulty, randomAvg: m.randomAvg };
      if (dist === 0) break;
    }
  }
  if (!pick) {
    const p = draftPuzzle(day, 0);
    const m = measure(p);
    pick = { ...p, par: m.par, parMoves: m.moves, baseline: m.baseline, difficulty: m.difficulty, randomAvg: m.randomAvg };
  }
  return pick;
};
