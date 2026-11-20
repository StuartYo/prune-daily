import { buildPuzzle } from '../src/shared/sim.ts';
const p = buildPuzzle(process.argv[2] ?? '2026-11-23');
console.log(JSON.stringify({ day: p.day, style: p.target.style, species: p.species.name, par: p.par, moves: p.parMoves, baseline: p.baseline, difficulty: p.difficulty }));
