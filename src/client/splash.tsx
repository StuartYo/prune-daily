import './index.css';

import { StrictMode, useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { InitResponse } from '../shared/api';
import { play, replayTo, type Puzzle } from '../shared/sim';
import { Flame, Sprout } from './icons';
import { api } from './net';
import { requestExpandedMode } from './platform';
import { TreeView } from './Tree';

const LEVEL = ['', 'Gentle', 'Easy', 'Medium', 'Tricky', 'Hard'];

const Splash = () => {
  const [d, setD] = useState<InitResponse | null>(null);
  const [err, setErr] = useState(false);
  useEffect(() => {
    api.init().then(setD).catch(() => setErr(true));
  }, []);
  const p = d?.puzzle as Puzzle | undefined;
  const tree = useMemo(() => {
    if (!p) return null;
    const full = { ...p, parMoves: [] };
    return d?.played ? play(full, d.played.moves).tree : replayTo(full, [], []);
  }, [p, d]);

  return (
    <div className="splash">
      {d?.sample && <div className="sample-bar">Local preview</div>}
      <div className="splash-tree">{p && tree ? <TreeView puzzle={p} tree={tree} label="Today's sapling" /> : <Sprout size={32} className="pulse" />}</div>
      <div className="splash-body">
        <div className="brand">
          <Sprout size={18} />
          <span className="wordmark">Prune</span>
          {p && <span className="no">No. {p.no}</span>}
        </div>
        {err && <p className="muted">Could not load today’s tree. Open the post to retry.</p>}
        {p && d && (
          <>
            <h1 className="splash-title">
              Shape today’s {p.species.name} into <em>{p.target.style}</em>
            </h1>
            <p className="splash-meta tnum">
              4 seasons · {p.snips} snips · par {p.par} · {LEVEL[p.difficulty]}
            </p>
            <p className="splash-meta tnum">
              {d.players} {d.players === 1 ? 'gardener' : 'gardeners'} today
              {d.streak.count > 0 && (
                <>
                  {' '}
                  · <Flame size={13} /> your streak {d.streak.count}
                </>
              )}
            </p>
            <button className="btn primary big" onClick={(e) => requestExpandedMode(e.nativeEvent, 'game')}>
              <Sprout size={18} /> {d.played ? `See your tree (${d.played.score})` : 'Start pruning'}
            </button>
            {d.yesterday && (
              <p className="yday small">
                Yesterday’s most-watered: u/{d.yesterday.username} ({d.yesterday.score})
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Splash />
  </StrictMode>,
);
