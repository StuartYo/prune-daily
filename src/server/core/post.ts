import { reddit } from '@devvit/web/server';
import { claimDayPost, getPuzzle, recordDayPost, releaseDayPost, utcDay } from '../../shared/logic';
import { redisStore } from './store';

const WEEKDAY = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export type DailyPost = { id: string; created: boolean };

// Three callers (scheduler, install trigger, mod menu) can ask for the same
// day. prune:dayPost:<day> makes sure only the first one creates a post; the
// others get the existing post id (or undefined while it is being created).
export const createDailyPost = async (day = utcDay()): Promise<DailyPost | null> => {
  const claim = await claimDayPost(redisStore, day);
  if (!claim.claimed) return claim.postId ? { id: claim.postId, created: false } : null;
  try {
    const p = await getPuzzle(redisStore, day);
    const wd = WEEKDAY[new Date(day + 'T00:00:00Z').getUTCDay()] ?? '';
    const post = await reddit.submitCustomPost({
      title: `Prune No. ${p.no} · ${p.target.style} ${p.species.name} (${wd})`,
      postData: { day, no: p.no },
      textFallback: {
        text: `Prune No. ${p.no}: today's tree is a ${p.species.name}, shape it ${p.target.style}. Open on new Reddit or the app to play.`,
      },
    });
    await recordDayPost(redisStore, day, post.id);
    return { id: post.id, created: true };
  } catch (e) {
    await releaseDayPost(redisStore, day);
    throw e;
  }
};
