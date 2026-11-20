import { redis } from '@devvit/web/server';
import type { Store } from '../../shared/logic';

export const redisStore: Store = {
  get: (k) => redis.get(k),
  set: async (k, v) => {
    await redis.set(k, v);
  },
  hGet: (k, f) => redis.hGet(k, f),
  hSet: async (k, f, v) => {
    await redis.hSet(k, { [f]: v });
  },
  hGetAll: async (k) => (await redis.hGetAll(k)) ?? {},
  zAdd: async (k, member, score) => {
    await redis.zAdd(k, { member, score });
  },
  zIncrBy: (k, member, by) => redis.zIncrBy(k, member, by),
  zScore: (k, member) => redis.zScore(k, member),
  zTop: async (k, count) => redis.zRange(k, 0, count - 1, { by: 'rank', reverse: true }),
  zCard: (k) => redis.zCard(k),
  zRankDesc: async (k, member) => {
    const r = await redis.zRank(k, member);
    if (r === undefined) return undefined;
    const n = await redis.zCard(k);
    return n - 1 - r;
  },
};
