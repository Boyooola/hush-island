# Hush Island

A small island you visit as an animal. Sit by the fire, fetch sticks, watch the sky, and help the keeper build a boat. Other visitors are there with you.

Built with three.js. No game engine, no server of its own.

## Run it

```
npm install
npm run build      # writes the site to dist/
npm run serve      # or serve dist/ with anything
```

## Deploy on Cloudflare Pages

- Build command: `npm run build`
- Build output directory: `dist`

## Visitors and storage

`src/backend.js` picks where shared things live:

1. **Supabase**, when `src/config.js` has a project URL and publishable key. Live visitors use Realtime broadcast; marks, bottles and the boat use three tables. Run `supabase/schema.sql` once in the project's SQL editor.
2. **This browser only**, when the config is empty. Tabs of the same browser see each other, and everything is kept on the device. Good for trying it out; nobody on another device will appear.

The database rules were checked against the live project. Live visitors over Realtime have not yet been tried from two devices.

## Layout

- `src/main.js` the game loop, controls and actions
- `src/world.js` the island, sea and sky
- `src/avatar.js`, `src/quad.js` the animals and how they move
- `src/life.js` fish, gulls, butterflies, rain, falling stars
- `src/critters.js` crabs, the owl, Clover the cow
- `src/build.js` the keeper's boat
- `src/clock.js` island time (one day is 48 real minutes)
- `src/net.js`, `src/store.js`, `src/backend.js` other visitors and saved things
- `assets/q/` animal models, trimmed with `tools/pack_animals.mjs`
- `tests/` browser checks written during development (they expect Playwright and Chrome at fixed paths)

## Credits

Animal models: Quaternius, Ultimate Animated Animal Pack (CC0).
