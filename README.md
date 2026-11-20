# Prune

A daily bonsai puzzle that runs inside a Reddit post.

Every day the subreddit gets one sapling. Everyone gets the same one. You have four seasons and six snips. Cut a branch and the growth it would have taken goes to the buds you kept. Your job is to steer that growth into the day's crown shape (Windswept, Twin, Broom, Lantern, Slant or Tiers). After winter the tree is scored: how much of the shape your foliage fills, minus what spills outside it.

Built with Devvit Web for the Reddit Game of the Day Hackathon (2026).

## How a round goes

1. Open today's post. The sapling stands in its pot with the target shape hatched behind it.
2. Tap a branch to snip it. Each bud shows a number: how many new branches it will push out next season. Snip one side and you can watch the numbers on the other side go up.
3. Press **Grow Spring**. The tree grows, you get up to two more snips, and so on through Summer, Autumn and Winter.
4. You get a crown-match score, the day's par, your rank, and a histogram of how everyone did.
5. Post your result as a comment (written by the server, no spoilers), then walk through **today's grove**: every player's tree, regrown from their snips, side by side. Water the ones you like.

One round takes two to four minutes.

## What makes it a daily game

- **One puzzle per day for everyone.** A scheduled job creates a new post at 00:00 UTC. The puzzle comes from the date, so every player and every device sees the same tree.
- **The week has a difficulty curve.** Monday is gentle, Saturday and Sunday are hard. Each day the generator drafts up to 12 trees, runs a solver on each, and keeps the one whose difficulty fits the weekday. Difficulty is measured as the gap between par and a player who snips at random.
- **Par is real.** Par is the best plan the solver found, so it is always reachable. Good players beat it.
- **Streaks.** Play on consecutive days and your user flair in the subreddit shows it ("Pruner · 4-day streak").
- **Yesterday carries over.** Today's post names yesterday's most-watered tree.

Numbers from `results/calendar.json` (28 generated days, 2026-11-20 to 2026-12-17, `npm run calendar`):

| Weekday | Average par | Random snipper averages | Gap |
|---|---|---|---|
| Mon | 75 | 39 | 36 |
| Tue | 78 | 40 | 38 |
| Wed | 82 | 43 | 39 |
| Thu | 78 | 35 | 43 |
| Fri | 78 | 31 | 47 |
| Sat | 78 | 18 | 61 |
| Sun | 77 | 17 | 59 |

Par replays to the same score on all 28 days. The slowest day took 473 ms to generate, and it only happens once per day (the result is cached in Redis).

## Reddit parts

| Feature | Where |
|---|---|
| Daily post at 00:00 UTC | `devvit.json` scheduler → `src/server/routes/scheduler.ts` |
| Mods can post today's tree by hand | subreddit menu "Post today's Prune" |
| Post result as a comment under your name | `POST /api/share`, `reddit.submitComment({ runAs: 'USER' })` |
| Streak in user flair | `reddit.setUserFlair` after each finished round |
| Grove of everyone's trees, watering, yesterday's pick | Redis sorted sets, `src/shared/logic.ts` |
| Feed preview with today's sapling | `splash.html` (inline entry) |

## Fair play

The client never sends a score. It sends the list of snips (for example `[[12,13],[5,9],[16,25],[]]`), and the server replays the whole tree with the same code the browser uses (`src/shared/sim.ts`) to compute the result. One submission per player per day. Direction math uses a rounded lookup table, so the tree can't come out differently on two JavaScript engines.

Because a play is just a few numbers, the grove can show every player's full tree without storing any images.

## Running it

```bash
npm install
npm run local         # local preview in a normal browser, sample players, no Reddit account
npm run test:unit     # rules, replay, anti-cheat, streak and watering tests
npm run calendar      # regenerate results/calendar.json
npm run login         # Reddit login for Devvit
npm run dev           # playtest on your test subreddit
npm run deploy        # upload a new version
```

The local preview (`vite.local.config.ts`) runs the real game rules against an in-browser store. Everyone in its grove except "you" is a sample player, and the page says so in a bar at the top. None of that code ships to Reddit.

## Layout

```
src/shared/sim.ts     tree growth, scoring, daily generator, solver
src/shared/logic.ts   rounds, ranks, streaks, grove, watering (works on any key-value store)
src/server/           Devvit Web server: API routes, scheduler, menu, install trigger
src/client/           React UI: game.html (expanded), splash.html (feed)
scripts/              tests, calendar, screenshot helper
```

## Credits

Fonts: Young Serif (SIL OFL 1.1) and IBM Plex Sans (SIL OFL 1.1). Icons: Lucide (ISC). Built on Reddit's Devvit React template (BSD-3-Clause, see `THIRD_PARTY_LICENSE_devvit-template.md`).

## License

MIT
