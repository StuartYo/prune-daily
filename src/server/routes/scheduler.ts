import { Hono } from 'hono';
import { createDailyPost } from '../core/post';

// Runs at 00:00 UTC every day (see devvit.json). One post per day.
export const scheduler = new Hono();

scheduler.post('/daily-post', async (c) => {
  try {
    const post = await createDailyPost();
    return c.json({ status: 'success', postId: post.id }, 200);
  } catch (error) {
    console.error(`Daily post failed: ${error}`);
    return c.json({ status: 'error' }, 500);
  }
});
