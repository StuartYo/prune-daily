import type { Seg } from '../shared/sim';

// Finger-sized tap targets. A tap snaps to the nearest branch within
// TAP_RADIUS_PX (a 48px circle around every point of a branch) and never
// less than the drawn hit line used before (2.1 world units).
export const TAP_RADIUS_PX = 24;
export const MIN_TAP_WORLD = 2.1;

const segDist = (s: Seg, x: number, y: number) => {
  const dx = s.x1 - s.x0;
  const dy = s.y1 - s.y0;
  const l2 = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((x - s.x0) * dx + (y - s.y0) * dy) / l2));
  return Math.hypot(s.x0 + t * dx - x, s.y0 + t * dy - y);
};

/** Branch a tap at world point (x, y) selects, or null. Exported for tests. */
export const pickBranch = (segs: Seg[], x: number, y: number, radius: number): number | null => {
  let best: Seg | null = null;
  let bestD = Infinity;
  for (const s of segs) {
    if (!s.alive || s.id === 0) continue;
    const d = segDist(s, x, y);
    // nearest wins; on a near tie prefer the deeper (thinner) twig
    if (d <= radius && (d < bestD - 0.05 || (Math.abs(d - bestD) <= 0.05 && best && s.depth > best.depth))) {
      best = s;
      bestD = d;
    }
  }
  return best ? best.id : null;
};
