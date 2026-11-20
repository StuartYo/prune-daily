import './index.css';

import { StrictMode, useCallback, useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';
import { createRoot } from 'react-dom/client';
import type { GroveTree, InitResponse, MyPlay, Streak } from '../shared/api';
import { allocation, play, replayTo, scoreTree, snip, type Puzzle, type Tree } from '../shared/sim';
import { ArrowLeft, Copy, Droplet, Flame, MessageSquare, Scissors, Sprout, Trees, Undo } from './icons';
import { api, LOCAL } from './net';
import { canRunAsUser, showToast } from './platform';
import { TreeView } from './Tree';

const SEASONS = ['Spring', 'Summer', 'Autumn', 'Winter'];
const WEEKDAY = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const LEVEL = ['', 'Gentle', 'Easy', 'Medium', 'Tricky', 'Hard'];
const GROW_MS = 1500;

type View = 'play' | 'result' | 'grove';

// First-play demo: about 8 seconds, plays once, can be replayed or skipped.
// Step 0 points at a branch, 1 marks it, 2 shows it snipped with the buds that
// gained growth, 3 tells you to grow.
const DEMO_STEPS = [
  { ms: 1700, text: 'Tap a branch to snip it.' },
  { ms: 1100, text: 'Tap a branch to snip it.' },
  { ms: 3000, text: 'Its growth goes to the buds you keep. Those numbers go up.' },
  { ms: 2600, text: 'Then press Grow. Bigger numbers grow more. Fill the hatched shape.' },
];
const DEMO_KEY = 'prune-demo-seen';
const demoSeen = () => {
  try {
    return localStorage.getItem(DEMO_KEY) === '1';
  } catch {
    return false;
  }
};
const markDemoSeen = () => {
  try {
    localStorage.setItem(DEMO_KEY, '1');
  } catch {
    /* ignore */
  }
};

// A small snip (a bare tip if possible) that makes the most other bud
// numbers go up, so the demo shows the rule without wrecking the tree.
const demoBranch = (t: Tree, sp: Puzzle['species']) => {
  const before = allocation(t, sp);
  const alive = t.segs.filter((s) => s.alive);
  const size = (id: number): number => 1 + alive.filter((c) => c.parent === id).reduce((n, c) => n + size(c.id), 0);
  let best: { id: number; score: number } | null = null;
  for (const s of alive) {
    if (s.id === 0 || s.depth < 1) continue;
    const after = allocation(snip(t, s.id), sp);
    let gain = 0;
    for (const [id, k] of after) if (k > (before.get(id) ?? 0)) gain++;
    if (gain === 0) continue;
    const score = gain * 10 - size(s.id) * 6;
    if (!best || score > best.score) best = { id: s.id, score };
  }
  return best ? best.id : null;
};
type Progress = { grown: number[][]; pending: number[] };

const progressKey = (day: string) => `prune-progress:${day}`;
const loadProgress = (day: string): Progress => {
  try {
    const raw = localStorage.getItem(progressKey(day));
    if (raw) return JSON.parse(raw) as Progress;
  } catch {
    /* storage can be blocked inside some webviews */
  }
  return { grown: [], pending: [] };
};
const saveProgress = (day: string, p: Progress) => {
  try {
    localStorage.setItem(progressKey(day), JSON.stringify(p));
  } catch {
    /* ignore */
  }
};

const Header = ({ puzzle, streak }: { puzzle: Puzzle | InitResponse['puzzle']; streak: Streak }) => {
  const wd = WEEKDAY[new Date(puzzle.day + 'T00:00:00Z').getUTCDay()] ?? '';
  return (
    <header className="hdr">
      <div className="brand">
        <Sprout size={20} />
        <span className="wordmark">Prune</span>
        <span className="no">No. {puzzle.no}</span>
      </div>
      <div className="hdr-meta">
        <span className="chip" title={`Difficulty ${puzzle.difficulty} of 5`}>
          {wd} · {LEVEL[puzzle.difficulty]}
          <span className="dots" aria-hidden>
            {[1, 2, 3, 4, 5].map((i) => (
              <i key={i} className={i <= puzzle.difficulty ? 'on' : ''} />
            ))}
          </span>
        </span>
        {streak.count > 0 && (
          <span className="chip streak" title="Days in a row">
            <Flame size={14} /> {streak.count}
          </span>
        )}
      </div>
    </header>
  );
};

const Meter = ({ label, value, tone }: { label: string; value: number; tone: 'fill' | 'spill' }) => (
  <div className="meter">
    <span className="meter-label">{label}</span>
    <span className="meter-track">
      <span className={`meter-bar ${tone}`} style={{ width: `${Math.min(100, value)}%` }} />
    </span>
    <span className="meter-val tnum">{value}%</span>
  </div>
);

const Histogram = ({ h, mine, par }: { h: number[]; mine: number; par: number }) => {
  const max = Math.max(1, ...h);
  return (
    <div className="histo" aria-label="How everyone scored today">
      {h.map((n, i) => (
        <div key={i} className="histo-col">
          <span
            className={`histo-bar ${Math.min(9, Math.floor(mine / 10)) === i ? 'me' : ''}`}
            style={{ height: `${(n / max) * 100}%` }}
          />
        </div>
      ))}
      <span className="histo-par" style={{ left: `${par}%` }}>
        par
      </span>
      <div className="histo-axis tnum">
        <span>0</span>
        <span>50</span>
        <span>100</span>
      </div>
    </div>
  );
};

const App = () => {
  const [data, setData] = useState<InitResponse | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [view, setView] = useState<View>('play');
  const [prog, setProg] = useState<Progress>({ grown: [], pending: [] });
  const [hover, setHover] = useState<number | null>(null);
  const [growing, setGrowing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ played: MyPlay; histogram: number[]; flair: string | null } | null>(null);
  const [streak, setStreak] = useState<Streak>({ count: 0, best: 0, last: '' });
  const [groveTrees, setGroveTrees] = useState<GroveTree[] | null>(null);
  const [shareMsg, setShareMsg] = useState<string | null>(null);
  const [shareText, setShareText] = useState<string | null>(null);
  const timer = useRef<number | null>(null);
  const [demo, setDemo] = useState<number | null>(null); // demo step, null = off

  const load = useCallback(async () => {
    try {
      const d = await api.init();
      setErr(null);
      setData(d);
      setStreak(d.streak);
      if (d.played) {
        setProg({ grown: d.played.moves, pending: [] });
        setResult({ played: d.played, histogram: [], flair: null });
        setView('result');
        api.grove().then((g) => setResult((r) => (r ? { ...r, histogram: g.histogram } : r))).catch(() => undefined);
      } else {
        const p = loadProgress(d.puzzle.day);
        setProg(p);
        if (!demoSeen() && p.grown.length === 0 && p.pending.length === 0) setDemo(0);
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not load today’s tree.');
    }
  }, []);

  useEffect(() => {
    const first = window.setTimeout(() => void load(), 0);
    return () => {
      window.clearTimeout(first);
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [load]);

  const puzzle = data?.puzzle as Puzzle | undefined;
  const tree = useMemo(
    () => (puzzle ? replayTo({ ...puzzle, parMoves: [] }, prog.grown, prog.pending) : null),
    [puzzle, prog],
  );
  const demoOn = demo != null;
  const demoId = useMemo(() => (demoOn && tree && puzzle ? demoBranch(tree, puzzle.species) : null), [demoOn, tree, puzzle]);
  const shownTree = useMemo(() => (tree && demo === 2 && demoId != null ? snip(tree, demoId) : tree), [tree, demo, demoId]);
  const alloc = useMemo(() => (shownTree && puzzle ? allocation(shownTree, puzzle.species) : undefined), [shownTree, puzzle]);
  const budsUp = useMemo(() => {
    if (demo !== 2 || !tree || !puzzle || !alloc) return undefined;
    const before = allocation(tree, puzzle.species);
    const up = new Map<number, number>();
    for (const [id, k] of alloc) if (k > (before.get(id) ?? 0)) up.set(id, k - (before.get(id) ?? 0));
    return up;
  }, [demo, tree, puzzle, alloc]);

  useEffect(() => {
    if (demo == null) return;
    if (demoId == null || demo >= DEMO_STEPS.length) {
      markDemoSeen();
      const t = window.setTimeout(() => setDemo(null), 0);
      return () => window.clearTimeout(t);
    }
    const t = window.setTimeout(() => setDemo(demo + 1), DEMO_STEPS[demo]?.ms ?? 1000);
    return () => window.clearTimeout(t);
  }, [demo, demoId]);
  const stopDemo = () => {
    markDemoSeen();
    setDemo(null);
  };
  const live = useMemo(() => (tree && puzzle ? scoreTree(tree, puzzle.target) : null), [tree, puzzle]);

  if (err) {
    return (
      <div className="center-msg">
        <p>{err}</p>
        <button className="btn primary" onClick={() => void load()}>
          Try again
        </button>
      </div>
    );
  }
  if (!data || !puzzle || !tree) {
    return (
      <div className="center-msg">
        <Sprout size={28} className="pulse" />
        <p>Potting today’s tree…</p>
      </div>
    );
  }

  const season = prog.grown.length;
  const used = prog.grown.flat().length + prog.pending.length;
  const left = puzzle.snips - used;
  const seasonLeft = puzzle.perSeason - prog.pending.length;
  const canSnip = view === 'play' && !growing && left > 0 && seasonLeft > 0 && season < puzzle.seasons;

  const update = (p: Progress) => {
    setProg(p);
    saveProgress(puzzle.day, p);
  };

  const onSnip = (id: number) => {
    if (demo != null) {
      stopDemo();
      return;
    }
    if (!canSnip) {
      if (view === 'play' && !growing) {
        showToast(left <= 0 ? 'No snips left today. Let it grow.' : `Only ${puzzle.perSeason} snips per season. Grow first.`);
      }
      return;
    }
    setHover(null);
    update({ ...prog, pending: [...prog.pending, id] });
  };

  const undo = () => update({ ...prog, pending: prog.pending.slice(0, -1) });

  const finish = async (moves: number[][]) => {
    setBusy(true);
    try {
      const r = await api.submit(moves);
      setResult({ played: r.played, histogram: r.histogram, flair: r.flair });
      setStreak(r.streak);
      setView('result');
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Could not save your tree.');
    } finally {
      setBusy(false);
    }
  };

  const growSeason = () => {
    if (growing || busy) return;
    const next: Progress = { grown: [...prog.grown, prog.pending], pending: [] };
    update(next);
    setGrowing(true);
    timer.current = window.setTimeout(() => {
      setGrowing(false);
      if (next.grown.length >= puzzle.seasons) void finish(next.grown);
    }, GROW_MS);
  };

  const openGrove = async () => {
    setView('grove');
    try {
      const g = await api.grove();
      setGroveTrees(g.trees);
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Could not load the grove.');
    }
  };

  const doWater = async (owner: string) => {
    try {
      const r = await api.water(owner);
      setGroveTrees((ts) => ts?.map((t) => (t.username === owner ? { ...t, water: r.water, wateredByMe: true } : t)) ?? ts);
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Could not water that tree.');
    }
  };

  const doShare = async (e: ReactMouseEvent) => {
    setShareMsg(null);
    try {
      if (!LOCAL && !(await canRunAsUser(e.nativeEvent))) {
        setShareMsg('Reddit needs your OK to comment for you. Tap again after allowing it.');
        return;
      }
      const r = await api.share();
      setShareText(r.text);
      setShareMsg(r.message || (r.ok ? 'Posted.' : 'Could not post.'));
    } catch (er) {
      setShareMsg(er instanceof Error ? er.message : 'Could not post.');
    }
  };

  const copyResult = async () => {
    const r = shareText ?? (await api.share().then((x) => x.text).catch(() => ''));
    try {
      await navigator.clipboard.writeText(r.replace(/\*\*/g, '').replace(/`/g, ''));
      showToast('Result copied');
    } catch {
      setShareText(r);
      showToast('Copy blocked here. Select the text below instead.');
    }
  };

  // ---------- views ----------
  const hint = (() => {
    if (growing) return `${SEASONS[season - 1] ?? 'The season'} is growing…`;
    if (season === 0 && used === 0)
      return 'Tap a branch to snip it off. Watch the numbers on the other buds go up: that is where the growth goes instead.';
    if (prog.pending.length > 0 && seasonLeft > 0 && left > 0)
      return 'Snip one more, or grow. Each season grows the same amount, so the buds you keep get all of it.';
    if (prog.pending.length > 0 && seasonLeft === 0 && left > 0)
      return `That is ${puzzle.perSeason} snips for ${SEASONS[season] ?? 'this season'}. Grow to see where the growth goes.`;
    if (left === 0) return 'Out of snips. Grow the remaining seasons and see where it lands.';
    if (season === puzzle.seasons - 1) return 'Last season. Leaves from the final three seasons count toward the shape.';
    return 'Aim the growth into the hatched shape. Leaves outside it cost points.';
  })();

  const done = view !== 'play';
  const played = result?.played;
  const finalTree = played ? play({ ...puzzle, parMoves: [] }, played.moves).tree : tree;

  if (view === 'grove') {
    return (
      <div className="app grove-app">
        {data.sample && <div className="sample-bar">Local preview: everyone except “you” is a sample player</div>}
        <div className="grove-head">
          <button className="btn ghost" onClick={() => setView('result')}>
            <ArrowLeft size={16} /> Your tree
          </button>
          <h1 className="grove-title">
            <Trees size={20} /> Today’s grove
          </h1>
          <span className="muted tnum">{groveTrees?.length ?? '…'} trees, same sapling</span>
        </div>
        <p className="grove-sub">
          Everyone started from this exact {puzzle.species.name}. Water the ones you like; tomorrow’s post shows
          the most-watered tree.
        </p>
        {!groveTrees ? (
          <p className="muted pad">Gathering trees…</p>
        ) : groveTrees.length === 0 ? (
          <p className="muted pad">No one else has finished yet. Check back later today.</p>
        ) : (
          <ol className="grove">
            {groveTrees.map((t, i) => {
              const r = play({ ...puzzle, parMoves: [] }, t.moves);
              return (
                <li key={t.username} className={`plot ${t.me ? 'mine' : ''}`}>
                  <span className="plot-rank tnum">{i + 1}</span>
                  <div className="plot-tree">
                    <TreeView puzzle={puzzle} tree={r.tree} compact label={`Tree by ${t.username}`} />
                  </div>
                  <div className="plot-info">
                    <span className="plot-name">{t.me ? 'You' : `u/${t.username}`}</span>
                    <span className="plot-score tnum">
                      {t.score} <small>· {t.snips} snips</small>
                    </span>
                  </div>
                  <button
                    className={`water ${t.wateredByMe ? 'on' : ''}`}
                    disabled={t.me || t.wateredByMe}
                    onClick={() => void doWater(t.username)}
                    aria-label={t.me ? 'Your tree' : `Water u/${t.username}'s tree`}
                  >
                    <Droplet size={15} filled={t.wateredByMe} /> <span className="tnum">{t.water}</span>
                  </button>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    );
  }

  return (
    <div className="app">
      {data.sample && <div className="sample-bar">Local preview: other players are samples</div>}
      <section className="stage">
        <div className="stage-tree">
          <TreeView
            puzzle={puzzle}
            tree={done ? finalTree : (shownTree ?? tree)}
            alloc={done ? undefined : alloc}
            hover={demo === 1 ? demoId : canSnip && demo == null ? hover : null}
            budsUp={budsUp}
            pointAt={demo === 0 || demo === 1 ? demoId : null}
            fit
            onHover={setHover}
            onSnip={done ? undefined : onSnip}
            growing={growing}
            label={`Today's ${puzzle.species.name}, target shape ${puzzle.target.style}`}
          />
        </div>
        {demo != null && demo < DEMO_STEPS.length && (
          <div className="demo-cap" role="status">
            <span className="demo-step tnum">{Math.min(3, demo === 0 ? 1 : demo)}/3</span>
            <span>{DEMO_STEPS[demo]?.text}</span>
            <button className="demo-skip" onClick={stopDemo}>
              Skip
            </button>
          </div>
        )}
        <div className="legend" aria-hidden>
          <span>
            <i className="lg-target" /> today’s shape
          </span>
          {!done && (
            <span>
              <i className="lg-bud" /> bud: number = new branches next season
            </span>
          )}
        </div>
      </section>

      <aside className="panel">
        <Header puzzle={puzzle} streak={streak} />
        <div className="brief">
          <span className="brief-k">Shape it</span>
          <span className="brief-v">{puzzle.target.style}</span>
          <span className="brief-k">Tree</span>
          <span className="brief-v">{puzzle.species.name}</span>
          <span className="brief-k">Par</span>
          <span className="brief-v tnum">{puzzle.par}</span>
        </div>

        {!done ? (
          <>
            <ol className="seasons" aria-label="Seasons">
              {SEASONS.map((s, i) => (
                <li key={s} className={i < season ? 'past' : i === season ? 'now' : ''}>
                  {s}
                </li>
              ))}
            </ol>
            <div className="snips" aria-label={`${left} of ${puzzle.snips} snips left`}>
              <span className="snip-icons">
                {Array.from({ length: puzzle.snips }, (_, i) => (
                  <Scissors key={i} size={16} className={i < left ? 'on' : 'off'} />
                ))}
              </span>
              <span className="tnum">
                {left} of {puzzle.snips} snips left
              </span>
            </div>
            <p className="hint" aria-live="polite">
              {hint}
              {season === 0 && used === 0 && demo == null && (
                <>
                  {' '}
                  <button className="link" onClick={() => setDemo(0)}>
                    Show me
                  </button>
                </>
              )}
            </p>
            <div className="actions">
              <button className="btn secondary" onClick={undo} disabled={prog.pending.length === 0 || growing}>
                <Undo size={16} /> Undo snip
              </button>
              <button className="btn primary" onClick={growSeason} disabled={growing || busy}>
                <Sprout size={18} />
                {busy ? 'Saving…' : `Grow ${SEASONS[season] ?? ''}`}
              </button>
            </div>
            {live && (
              <div className="live">
                <div className="live-head">
                  <span>If it stopped now</span>
                  <span className="live-score tnum">{live.score}</span>
                </div>
                <Meter label="Shape filled" value={live.fill} tone="fill" />
                <Meter label="Leaves outside" value={live.spill} tone="spill" />
              </div>
            )}
          </>
        ) : (
          played && (
            <div className="result">
              <div className="score-row">
                <span className="score tnum">{played.score}</span>
                <div className="score-side">
                  <span className="score-label">crown match</span>
                  <span className="vs-par tnum">
                    {played.score === puzzle.par
                      ? 'Right on par'
                      : played.score > puzzle.par
                        ? `${played.score - puzzle.par} over par`
                        : `${puzzle.par - played.score} under par`}
                  </span>
                </div>
              </div>
              <Meter label="Shape filled" value={played.fill} tone="fill" />
              <Meter label="Leaves outside" value={played.spill} tone="spill" />
              <p className="rank tnum">
                #{played.rank} of {played.total} today · {played.snips} snips
                {streak.count > 0 && (
                  <span className="nowrap">
                    {' '}
                    · <Flame size={13} /> {streak.count}-day streak
                  </span>
                )}
              </p>
              {result.histogram.length > 0 && !shareText && <Histogram h={result.histogram} mine={played.score} par={puzzle.par} />}
              {result.flair && <p className="muted small">Your flair here now reads “{result.flair}”.</p>}
              <div className="actions col">
                <button className="btn primary" onClick={(e) => void doShare(e)}>
                  <MessageSquare size={17} /> Post my result in the comments
                </button>
                <div className="row">
                  <button className="btn secondary" onClick={() => void openGrove()}>
                    <Trees size={16} /> See today’s grove
                  </button>
                  <button className="btn secondary" onClick={() => void copyResult()}>
                    <Copy size={16} /> Copy
                  </button>
                </div>
              </div>
              {shareMsg && <p className="muted small">{shareMsg}</p>}
              {shareText && <pre className="share-preview">{shareText.replace(/\*\*/g, '').replace(/`/g, '')}</pre>}
              <p className="muted small">New tree at 00:00 UTC.</p>
            </div>
          )
        )}
        {data.yesterday && !done && (
          <p className="yday small">
            Yesterday’s most-watered tree: u/{data.yesterday.username} ({data.yesterday.score})
          </p>
        )}
      </aside>
    </div>
  );
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
