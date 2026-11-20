import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPuzzle, play, replayTo, snip, sapling, allocation, tips } from '../src/shared/sim.ts';
import * as logic from '../src/shared/logic.ts';
import type { Store } from '../src/shared/logic.ts';

const day = '2026-11-26';
const p = buildPuzzle(day);

test('same snips give the same tree and score every time', () => {
  const a = play(p, p.parMoves);
  const b = play(JSON.parse(JSON.stringify(p)), p.parMoves);
  assert.deepEqual(a.tree, b.tree);
  assert.equal(a.detail.score, p.par);
});

test('par beats doing nothing', () => {
  assert.ok(p.par > p.baseline, `par ${p.par} baseline ${p.baseline}`);
});

test('UI replay matches the official replay', () => {
  const full = play(p, p.parMoves).tree;
  const ui = replayTo(p, p.parMoves, []);
  assert.deepEqual(ui, full);
});

test('snipping moves growth to the other buds', () => {
  const t = sapling(p);
  const before = allocation(t, p.species);
  const victim = tips(t).find((s) => (before.get(s.id) ?? 0) > 0);
  assert.ok(victim);
  const parent = t.segs.find((s) => s.id === victim.parent);
  assert.ok(parent);
  const after = allocation(snip(t, victim.id), p.species);
  const sum = (m: Map<number, number>) => [...m.values()].reduce((x, y) => x + y, 0);
  assert.equal(sum(after), sum(before), 'season budget is constant');
});

test('illegal plays are rejected', () => {
  assert.equal(play(p, [[0]]).ok, false, 'trunk cannot be cut');
  assert.equal(play(p, [[1, 2, 3]]).ok, false, 'max 2 per season');
  assert.equal(play(p, [[9999]]).ok, false, 'unknown branch');
  assert.equal(play(p, [[], [], [], [], []]).ok, false, 'max 4 seasons');
});

const memStore = (): Store => {
  const kv = new Map<string, string>();
  const h = new Map<string, Map<string, string>>();
  const z = new Map<string, Map<string, number>>();
  const zs = (k: string) => [...(z.get(k) ?? new Map()).entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  return {
    get: async (k) => kv.get(k),
    set: async (k, v) => void kv.set(k, v),
    hGet: async (k, f) => h.get(k)?.get(f),
    hSet: async (k, f, v) => void (h.get(k) ?? h.set(k, new Map()).get(k)!).set(f, v),
    hGetAll: async (k) => Object.fromEntries(h.get(k) ?? []),
    zAdd: async (k, m, s) => void (z.get(k) ?? z.set(k, new Map()).get(k)!).set(m, s),
    zIncrBy: async (k, m, by) => {
      const zz = z.get(k) ?? z.set(k, new Map()).get(k)!;
      zz.set(m, (zz.get(m) ?? 0) + by);
      return zz.get(m)!;
    },
    zScore: async (k, m) => z.get(k)?.get(m),
    zTop: async (k, n) => zs(k).slice(0, n).map(([member, score]) => ({ member, score })),
    zCard: async (k) => z.get(k)?.size ?? 0,
    zRankDesc: async (k, m) => {
      const i = zs(k).findIndex(([x]) => x === m);
      return i < 0 ? undefined : i;
    },
  };
};

test('server scores the play itself, one play per day, streak counts up', async () => {
  const s = memStore();
  const y = logic.shiftDay(day, -1);
  await logic.submit(s, y, 'alice', []);
  const r = await logic.submit(s, day, 'alice', p.parMoves);
  assert.ok(!('error' in r));
  if ('error' in r) return;
  assert.equal(r.played.score, p.par);
  assert.equal(r.streak.count, 2);
  const again = await logic.submit(s, day, 'alice', []);
  assert.ok(!('error' in again) && again.played.score === p.par, 'second submit does not overwrite');
});

test('cannot water your own tree or before playing', async () => {
  const s = memStore();
  await logic.submit(s, day, 'alice', p.parMoves);
  assert.ok('error' in (await logic.water(s, day, 'alice', 'alice')));
  assert.ok('error' in (await logic.water(s, day, 'bob', 'alice')));
  await logic.submit(s, day, 'bob', []);
  const w = await logic.water(s, day, 'bob', 'alice');
  assert.ok(!('error' in w) && w.water === 1);
  const w2 = await logic.water(s, day, 'bob', 'alice');
  assert.ok(!('error' in w2) && w2.water === 1, 'one drop per person');
});
