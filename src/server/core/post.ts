import { reddit } from '@devvit/web/server';
import { getPuzzle, rememberPost, utcDay } from '../../shared/logic';
import { redisStore } from './store';

const WEEKDAY = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export const createDailyPost = async (day = utcDay()) => {
  const p = await getPuzzle(redisStore, day);
  const wd = WEEKDAY[new Date(day + 'T00:00:00Z').getUTCDay()] ?? '';
  const post = await reddit.submitCustomPost({
    title: `Prune No. ${p.no} · ${p.target.style} ${p.species.name} (${wd})`,
    postData: { day, no: p.no },
    textFallback: {
      text: `Prune No. ${p.no}: today's tree is a ${p.species.name}, shape it ${p.target.style}. Open on new Reddit or the app to play.`,
    },
  });
  await rememberPost(redisStore, post.id, day);
  return post;
};
