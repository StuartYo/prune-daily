import { Hono } from 'hono';
import type { TriggerResponse } from '@devvit/web/shared';
import { createDailyPost } from '../core/post';

export const triggers = new Hono();

triggers.post('/on-app-install', async (c) => {
  try {
    const post = await createDailyPost();
    const message = !post ? 'Today’s post is being created' : post.created ? `Created ${post.id}` : `Already posted ${post.id}`;
    return c.json<TriggerResponse>({ status: 'success', message }, 200);
  } catch (error) {
    console.error(`Install post failed: ${error}`);
    return c.json<TriggerResponse>({ status: 'error', message: 'Failed to create post' }, 400);
  }
});
