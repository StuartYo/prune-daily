import { Hono } from 'hono';
import { context, reddit } from '@devvit/web/server';
import type { ErrorResponse, SubmitRequest, WaterRequest } from '../../shared/api';
import { dayForPost, grove, init, shareText, submit, water } from '../../shared/logic';
import { redisStore as s } from '../core/store';

export const api = new Hono();

const who = async () => (await reddit.getCurrentUsername()) ?? null;
const fail = (message: string) => ({ status: 'error', message }) satisfies ErrorResponse;

const isMoves = (v: unknown): v is number[][] =>
  Array.isArray(v) &&
  v.length <= 4 &&
  v.every((x) => Array.isArray(x) && x.length <= 2 && x.every((n) => Number.isInteger(n) && n >= 0 && n < 5000));

api.get('/init', async (c) => {
  try {
    const day = await dayForPost(s, context.postId);
    const u = (await who()) ?? 'guest';
    return c.json(await init(s, day, u));
  } catch (e) {
    console.error('init failed', e);
    return c.json(fail('Could not load today’s tree. Pull to refresh and try again.'), 500);
  }
});

api.post('/submit', async (c) => {
  const u = await who();
  if (!u) return c.json(fail('Log in to Reddit to save your tree.'), 401);
  const body = await c.req.json<SubmitRequest>().catch(() => null);
  if (!body || !isMoves(body.moves)) return c.json(fail('That set of snips did not look right.'), 400);
  const day = await dayForPost(s, context.postId);
  const r = await submit(s, day, u, body.moves);
  if ('error' in r) return c.json(fail(r.error), 400);
  if (r.flair && context.subredditName) {
    try {
      await reddit.setUserFlair({ subredditName: context.subredditName, username: u, text: r.flair, backgroundColor: '#4F7A3A', textColor: 'light' });
    } catch (e) {
      console.warn('flair not set', e);
      r.flair = null;
    }
  }
  return c.json(r);
});

api.get('/grove', async (c) => {
  const day = await dayForPost(s, context.postId);
  const u = (await who()) ?? 'guest';
  return c.json(await grove(s, day, u));
});

api.post('/water', async (c) => {
  const u = await who();
  if (!u) return c.json(fail('Log in to water trees.'), 401);
  const body = await c.req.json<WaterRequest>().catch(() => null);
  if (!body || typeof body.owner !== 'string') return c.json(fail('Which tree?'), 400);
  const day = await dayForPost(s, context.postId);
  const r = await water(s, day, u, body.owner);
  if ('error' in r) return c.json(fail(r.error), 400);
  return c.json(r);
});

api.post('/share', async (c) => {
  const u = await who();
  const postId = context.postId;
  if (!u || !postId) return c.json(fail('Log in to comment.'), 401);
  const day = await dayForPost(s, postId);
  const r = await shareText(s, day, u);
  if (!r.ok) return c.json(r);
  try {
    await reddit.submitComment({ id: postId, text: r.text, runAs: 'USER' });
    return c.json({ ...r, message: 'Posted to the comments.' });
  } catch (e) {
    console.error('comment failed', e);
    return c.json({ ...r, ok: false, message: 'Reddit did not accept the comment. Your result is copied below instead.' });
  }
});
