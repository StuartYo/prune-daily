import type { Puzzle } from './sim.ts';

// What the client is allowed to see: everything except the solver's plan.
export type PublicPuzzle = Omit<Puzzle, 'parMoves'>;

export type MyPlay = {
  moves: number[][];
  score: number;
  fill: number;
  spill: number;
  snips: number;
  rank: number;
  total: number;
};

export type Streak = { count: number; best: number; last: string };

export type Pick = { username: string; score: number; water: number; day: string };

export type InitResponse = {
  type: 'init';
  username: string;
  puzzle: PublicPuzzle;
  played: MyPlay | null;
  streak: Streak;
  players: number;
  yesterday: Pick | null;
  sample: boolean; // true only in the local preview build
};

export type SubmitRequest = { moves: number[][] };
export type SubmitResponse = {
  type: 'submit';
  played: MyPlay;
  streak: Streak;
  flair: string | null;
  histogram: number[]; // 10 buckets of 10 points
};

export type GroveTree = {
  username: string;
  moves: number[][];
  score: number;
  snips: number;
  water: number;
  wateredByMe: boolean;
  me: boolean;
};
export type GroveResponse = { type: 'grove'; trees: GroveTree[]; players: number; histogram: number[] };

export type WaterRequest = { owner: string };
export type WaterResponse = { type: 'water'; owner: string; water: number; wateredByMe: boolean };

export type ShareResponse = { type: 'share'; ok: boolean; text: string; message: string };

export type ErrorResponse = { status: 'error'; message: string };
