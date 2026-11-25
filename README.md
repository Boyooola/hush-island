# Hush Island

A small island you visit as an animal. Sit by the fire, fetch sticks, watch the sky, and help the keeper build a boat. Other visitors are there with you.

Built with three.js. No game engine, no server of its own.

## Run it

```
npm install
npm run build      # writes the site to dist/
npm run serve      # or serve dist/ with anything
```

## Deploy on Cloudflare

As a Pages project:

- Build command: `npm run build`
- Build output directory: `dist`

As a Worker (the repo's `wrangler.jsonc` points it at `dist`):

- Build command: `npm run build`
- Deploy command: `npx wrangler deploy`

## Visitors and storage

`src/backend.js` picks where shared things live.

**Live visitors** (positions, chat, gestures), first that works:

1. **The island's own room on Cloudflare** (`worker/index.js`, a Durable Object reached at `/room`). It relays what each visitor does to the others, and it keeps a queue: only so many animals fit ashore at once (`CAP` in `wrangler.jsonc`, 40 by default), and anyone arriving after that waits on the title screen and steps ashore when someone leaves. `/room/status` is a small page showing how many are ashore and waiting (the numbers alone are at `/room/status.json`).
2. **Supabase Realtime**, if the room cannot be reached. Fine for a handful of visitors; the free plan's message allowance runs out quickly with more.
3. **This browser only**: tabs of the same browser see each other.

**Saved things** (marks, bottles, the boat): Supabase tables when `src/config.js` has a project URL and publishable key (run `supabase/schema.sql` once), otherwise this device.

## Layout

- `src/main.js` the game loop, controls and actions
- `src/world.js` the island, sea and sky
- `src/avatar.js`, `src/quad.js` the animals and how they move
- `src/life.js` fish, gulls, butterflies, rain, falling stars
- `src/critters.js` crabs, the owl, Clover the cow
- `src/build.js` the keeper's boat
- `src/clock.js` island time (one day is 48 real minutes)
- `src/net.js`, `src/store.js`, `src/backend.js` other visitors and saved things
- `worker/index.js` the live room and its queue, run by Cloudflare
- `assets/q/` animal models, trimmed with `tools/pack_animals.mjs`
- `tests/` browser checks written during development (they expect Playwright and Chrome at fixed paths)

## Credits

Animal models: Quaternius, Ultimate Animated Animal Pack (CC0).
