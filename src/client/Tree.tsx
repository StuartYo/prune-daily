import { useMemo, useRef, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from 'react';
import {
  TUNE,
  WORLD_H,
  WORLD_W,
  hash,
  leaves,
  subtreeIds,
  type Puzzle,
  type Seg,
  type Target,
  type Tree,
} from '../shared/sim';
import { MIN_TAP_WORLD, TAP_RADIUS_PX, pickBranch } from './tap';

const Y = (y: number) => WORLD_H - y;

type Props = {
  puzzle: Pick<Puzzle, 'species' | 'target' | 'seed'>;
  tree: Tree;
  alloc?: Map<number, number> | undefined;
  hover?: number | null | undefined;
  onHover?: ((id: number | null) => void) | undefined;
  onSnip?: ((id: number) => void) | undefined;
  growing?: boolean | undefined; // animate segments born this season
  showTarget?: boolean | undefined;
  compact?: boolean | undefined; // grove thumbnails: no buds, lighter detail
  label?: string | undefined;
  /** First-play demo: buds that gained growth (id -> +n) and the branch the pointer is on. */
  budsUp?: Map<number, number> | undefined;
  pointAt?: number | null | undefined;
  /** Crop the view to the pot and today's shape (the play screen) instead of the whole world. */
  fit?: boolean | undefined;
};

export const TargetShape = ({ target, id }: { target: Target; id: string }) => (
  <g aria-hidden>
    {/* Stroke first, then fill on top: only the outer edge of the union stays visible. */}
    {target.ellipses.map((e, i) => (
      <ellipse
        key={`s${i}`}
        cx={e.cx}
        cy={Y(e.cy)}
        rx={e.rx}
        ry={e.ry}
        fill="none"
        stroke="var(--target-edge)"
        strokeWidth={1.1}
        strokeDasharray="1.6 1.4"
      />
    ))}
    {target.ellipses.map((e, i) => (
      <ellipse key={`f${i}`} cx={e.cx} cy={Y(e.cy)} rx={e.rx} ry={e.ry} fill={`url(#${id})`} />
    ))}
  </g>
);

const Pot = () => (
  <g aria-hidden>
    <rect x={22} y={Y(3)} width={56} height={2.2} rx={0.6} fill="var(--wood)" />
    <path d={`M30 ${Y(14)} L70 ${Y(14)} L66 ${Y(4)} L34 ${Y(4)} Z`} fill="var(--clay)" />
    <rect x={28.5} y={Y(15.4)} width={43} height={2.4} rx={0.8} fill="var(--clay-dark)" />
    <ellipse cx={50} cy={Y(14.4)} rx={19} ry={0.9} fill="var(--soil)" />
  </g>
);

export const TreeView = ({
  puzzle,
  tree,
  alloc,
  hover,
  onHover,
  onSnip,
  growing,
  showTarget = true,
  compact,
  label,
  budsUp,
  pointAt,
  fit,
}: Props) => {
  const alive = useMemo(() => tree.segs.filter((s) => s.alive), [tree]);
  const byId = useMemo(() => new Map(alive.map((s) => [s.id, s])), [alive]);

  // Branch thickness grows with everything it carries, like real wood.
  const weight = useMemo(() => {
    const w = new Map<number, number>();
    const kids = new Map<number, Seg[]>();
    for (const s of alive) {
      if (s.parent >= 0) {
        const a = kids.get(s.parent) ?? [];
        a.push(s);
        kids.set(s.parent, a);
      }
    }
    const visit = (s: Seg): number => {
      let n = 1;
      for (const k of kids.get(s.id) ?? []) n += visit(k);
      w.set(s.id, n);
      return n;
    };
    const root = byId.get(0);
    if (root) visit(root);
    return w;
  }, [alive, byId]);

  const doomed = useMemo(
    () => new Set(hover != null && byId.has(hover) ? subtreeIds(tree, hover) : []),
    [hover, tree, byId],
  );
  const leafSegs = useMemo(() => leaves(tree), [tree]);
  const minNewDepth = useMemo(() => {
    let m = 99;
    for (const s of alive) if (s.born === tree.season && tree.season > 0) m = Math.min(m, s.depth);
    return m;
  }, [alive, tree.season]);

  const hue = puzzle.species.hue;
  const gid = `tg-${puzzle.seed}-${compact ? 'c' : 'f'}`;
  const isNew = (s: Seg) => growing && s.born === tree.season && tree.season > 0;
  const delay = (s: Seg) => `${Math.max(0, s.depth - minNewDepth) * 140}ms`;

  // Pointer position -> world units, then snap to the nearest branch.
  const pick = (e: ReactPointerEvent<SVGElement> | ReactMouseEvent<SVGElement>) => {
    const svg = (e.currentTarget as SVGElement).ownerSVGElement ?? (e.currentTarget as SVGSVGElement);
    const m = svg.getScreenCTM();
    if (!m) return null;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const w = pt.matrixTransform(m.inverse());
    const radius = Math.max(MIN_TAP_WORLD, TAP_RADIUS_PX / m.a);
    return pickBranch(alive, w.x, WORLD_H - w.y, radius);
  };
  const pointer = pointAt != null ? byId.get(pointAt) : undefined;

  // Touch: press shows which branch you are on (it turns clay), slide to
  // adjust, lift to snip. Mouse: hover previews, click snips.
  const pressed = useRef<number | null | undefined>(undefined);
  const onDown = (e: ReactPointerEvent<SVGGElement>) => {
    if (e.pointerType === 'mouse') return;
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    pressed.current = pick(e);
    onHover?.(pressed.current);
  };
  const onMove = (e: ReactPointerEvent<SVGGElement>) => {
    if (e.pointerType === 'mouse') onHover?.(pick(e));
    else if (pressed.current !== undefined) {
      pressed.current = pick(e);
      onHover?.(pressed.current);
    }
  };
  const onUp = (e: ReactPointerEvent<SVGGElement>) => {
    if (e.pointerType === 'mouse' || pressed.current === undefined) return;
    const id = pressed.current;
    pressed.current = undefined;
    onHover?.(null);
    if (id != null) onSnip?.(id);
  };
  const onClickMouse = (e: ReactMouseEvent<SVGGElement>) => {
    // touch taps are handled on pointerup; this is mouse, pen-as-mouse and
    // synthetic clicks
    if ((e.nativeEvent as PointerEvent).pointerType && (e.nativeEvent as PointerEvent).pointerType !== 'mouse') return;
    const id = pick(e);
    if (id != null) onSnip?.(id);
  };

  // View box: whole world, or cropped to pot + target shape with a margin.
  const vb = useMemo(() => {
    if (!fit) return { x: 0, y: 0, w: WORLD_W, h: WORLD_H };
    let x0 = 22;
    let x1 = 78;
    let top = 20;
    for (const e of puzzle.target.ellipses) {
      x0 = Math.min(x0, e.cx - e.rx);
      x1 = Math.max(x1, e.cx + e.rx);
      top = Math.max(top, e.cy + e.ry);
    }
    x0 = Math.max(0, x0 - 5);
    x1 = Math.min(WORLD_W, x1 + 5);
    top = Math.min(WORLD_H, top + 5);
    return { x: x0, y: Y(top), w: x1 - x0, h: top };
  }, [fit, puzzle.target]);

  return (
    <svg
      viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
      style={fit ? { aspectRatio: `${vb.w} / ${vb.h}` } : undefined}
      className={`tree-svg${fit ? ' fit' : ''}${onSnip ? ' playable' : ''}`}
      role="img"
      aria-label={label ?? 'Bonsai tree'}
      onPointerLeave={() => onHover?.(null)}
    >
      <defs>
        <pattern id={gid} width="2.4" height="2.4" patternUnits="userSpaceOnUse" patternTransform="rotate(35)">
          <rect width="2.4" height="2.4" fill="var(--target-fill)" />
          <line x1="0" y1="0" x2="0" y2="2.4" stroke="var(--target-hatch)" strokeWidth="0.5" />
        </pattern>
      </defs>
      {showTarget && <TargetShape target={puzzle.target} id={gid} />}
      <Pot />

      {/* wood */}
      <g strokeLinecap="round">
        {alive.map((s) => {
          const w = Math.min(4.2, 0.55 + 0.42 * Math.sqrt(weight.get(s.id) ?? 1));
          const len = Math.hypot(s.x1 - s.x0, s.y1 - s.y0);
          const cut = doomed.has(s.id);
          return (
            <line
              key={s.id}
              x1={s.x0}
              y1={Y(s.y0)}
              x2={s.x1}
              y2={Y(s.y1)}
              stroke={cut ? 'var(--clay)' : 'var(--bark)'}
              strokeWidth={w}
              strokeDasharray={isNew(s) ? `${len} ${len}` : undefined}
              strokeDashoffset={isNew(s) ? len : undefined}
              className={isNew(s) ? 'grow-in' : undefined}
              style={isNew(s) ? { animationDelay: delay(s) } : undefined}
              opacity={cut ? 0.85 : 1}
            />
          );
        })}
      </g>

      {/* foliage: clusters drawn at the scoring radius so what you see is what is scored */}
      <g>
        {leafSegs.map((s) => {
          const h = hash(puzzle.seed, s.id, 11);
          const cut = doomed.has(s.id);
          const R = TUNE.leafR;
          const parts = compact ? 2 : 4;
          return (
            <g
              key={`l${s.id}`}
              className={isNew(s) ? 'leaf-in' : undefined}
              style={{
                transformOrigin: `${s.x1}px ${Y(s.y1)}px`,
                ...(isNew(s) ? { animationDelay: `calc(${delay(s)} + 220ms)` } : {}),
              }}
              opacity={cut ? 0.25 : 1}
            >
              {/* a bonsai foliage pad: flattened, dark underside, lit top */}
              <ellipse cx={s.x1} cy={Y(s.y1) + R * 0.12} rx={R * 0.98} ry={R * 0.8} fill={`hsl(${hue} 34% 26% / 0.55)`} />
              {Array.from({ length: parts }, (_, i) => {
                const a = (((h >>> (i * 4)) % 16) / 16) * Math.PI * 2;
                const d = R * 0.34;
                const l = 33 + ((h >>> (i * 3)) % 10);
                const rr = R * (0.5 + ((h >>> (i * 5)) % 5) / 34);
                return (
                  <ellipse
                    key={i}
                    cx={s.x1 + Math.cos(a) * d}
                    cy={Y(s.y1) + Math.sin(a) * d * 0.7 - R * 0.06}
                    rx={rr}
                    ry={rr * 0.78}
                    fill={`hsl(${hue + ((h >>> i) % 12) - 6} ${36 + (i % 2) * 6}% ${l}%)`}
                  />
                );
              })}
              <ellipse cx={s.x1 - R * 0.15} cy={Y(s.y1) - R * 0.38} rx={R * 0.42} ry={R * 0.2} fill={`hsl(${hue} 45% 62% / 0.55)`} />
            </g>
          );
        })}
      </g>

      {/* buds: size = how much growth this tip gets next season */}
      {alloc && !compact && (
        <g>
          {alive
            .filter((s) => alloc.has(s.id))
            .map((s) => {
              const k = alloc.get(s.id) ?? 0;
              return (
                <g key={`b${s.id}`} transform={`translate(${s.x1} ${Y(s.y1)})`}>
                  <circle
                    r={1}
                    className="bud"
                    style={{ transform: `scale(${k === 0 ? 0.6 : 1.05 + 0.3 * k})` }}
                    fill={k === 0 ? 'var(--paper)' : 'var(--bud)'}
                    stroke="var(--bark)"
                    strokeWidth={0.35}
                  />
                  {budsUp?.has(s.id) && <circle r={2.6} className="bud-up-ring" />}
                  {k > 0 && (
                    <text className="bud-num" y={0.55} textAnchor="middle" fontSize={1.55}>
                      {k}
                    </text>
                  )}
                  {budsUp?.has(s.id) && (
                    <g className="bud-up" transform="translate(2.4 -3.6)">
                      <rect x={-0.2} y={-2} width={4.4} height={2.9} rx={0.8} />
                      <text x={2} y={0.2} textAnchor="middle" fontSize={2}>
                        +{budsUp.get(s.id)}
                      </text>
                    </g>
                  )}
                </g>
              );
            })}
        </g>
      )}

      {/* demo pointer (first play only) */}
      {pointer && (
        <g className="demo-pointer" transform={`translate(${(pointer.x0 + pointer.x1) / 2} ${Y((pointer.y0 + pointer.y1) / 2)})`}>
          <circle r={3.4} />
          <circle r={0.9} className="dot" />
        </g>
      )}

      {/* hit area: one layer for the whole tree. A tap snaps to the nearest
          branch within TAP_RADIUS_PX, so thin twigs are as easy to hit as
          thick ones. The thin lines only carry data-id and a tooltip. */}
      {onSnip && (
        <g
          className="hit-layer"
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={() => {
            pressed.current = undefined;
            onHover?.(null);
          }}
          onClick={onClickMouse}
        >
          <rect x={0} y={0} width={WORLD_W} height={WORLD_H} fill="transparent" />
          {[...alive]
            .filter((s) => s.id !== 0)
            .sort((a, b) => a.depth - b.depth)
            .map((s) => (
              <line
                key={`h${s.id}`}
                x1={s.x0}
                y1={Y(s.y0)}
                x2={s.x1}
                y2={Y(s.y1)}
                stroke="transparent"
                strokeWidth={4.2}
                strokeLinecap="round"
                className="hit"
                data-id={s.id}
              >
                <title>Snip this branch</title>
              </line>
            ))}
        </g>
      )}
    </svg>
  );
};
