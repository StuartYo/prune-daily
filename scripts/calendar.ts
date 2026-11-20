// Builds the next N daily puzzles and writes results/calendar.json.
// Every number quoted in the README comes from this file.
import { buildPuzzle, play, randomPlayer, hash, weekdayOf, targetDifficulty } from '../src/shared/sim.ts';
import { writeFileSync, mkdirSync } from 'node:fs';
const start = process.argv[2] ?? '2026-11-20';
const n = Number(process.argv[3] ?? 28);
const rows = [];
const t0 = Date.now();
for (let i = 0; i < n; i++) {
  const day = new Date(Date.parse(start + 'T00:00:00Z') + i * 86400000).toISOString().slice(0, 10);
  const a = Date.now();
  const p = buildPuzzle(day);
  const ms = Date.now() - a;
  const replay = play(p, p.parMoves).detail.score;
  rows.push({ day, no: p.no, weekday: weekdayOf(day), wantDifficulty: targetDifficulty(day), difficulty: p.difficulty, style: p.target.style, species: p.species.name, baseline: p.baseline, randomAvg: p.randomAvg, par: p.par, parReplay: replay, parSnips: p.parMoves.flat().length, buildMs: ms });
  console.log(JSON.stringify(rows[rows.length - 1]));
}
mkdirSync('results', { recursive: true });
const summary = {
  generatedAt: new Date().toISOString(), days: n,
  avgPar: Math.round(rows.reduce((s, r) => s + r.par, 0) / n),
  avgBaseline: Math.round(rows.reduce((s, r) => s + r.baseline, 0) / n),
  avgRandom: Math.round(rows.reduce((s, r) => s + r.randomAvg, 0) / n),
  difficultyHit: rows.filter((r) => r.difficulty === r.wantDifficulty).length,
  parReplayMatches: rows.filter((r) => r.par === r.parReplay).length,
  maxBuildMs: Math.max(...rows.map((r) => r.buildMs)), totalMs: Date.now() - t0,
};
writeFileSync('results/calendar.json', JSON.stringify({ summary, rows }, null, 2));
console.log(summary);
void hash; void randomPlayer;
