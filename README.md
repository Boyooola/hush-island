# Hush Island

A free social exploration game that runs in a browser tab. You wash ashore as an animal on a small island with a camp fire. Whoever else is there is there with you. Together you build a boat, and the boat sails to Lantern Rock: a larger island with a dark lighthouse, somebody living in every part of it, and a story told in pieces.

Play it at [hush-island.dev](https://www.hush-island.dev/).

There is no account and no download. Built with three.js and no game engine.

## The two islands

**The first island.** A fire, a dock, a hill and a keeper. Fetch sticks, fish off the dock, collect what washes up, and carry driftwood to the boat. Once she is built she goes round the island, or across.

**Lantern Rock.** Reached only by the boat. Woods, a hidden valley, a hollow hill, a high meadow, tide flats, a far beach and a rock with a chapel on it. A hedgehog, a mole, a ram, a raccoon, a gull, a donkey, a tortoise, a badger and a heron live there, and each sends you on to the next. The lighthouse, a bridge, a windmill and a well are mended by everyone together.

## Run it

```
npm install
npm run build      # writes the site to dist/
npx wrangler dev   # the site and the live room, at localhost:8787
```

`npm run serve` serves `dist/` without the room: one visitor, nothing shared.

On a developer's machine the address `/far` opens Lantern Rock directly. On the live site that address goes to the first island, because the far island has no address of its own.

## Deploy

The site and its room are one Cloudflare Worker (`wrangler.jsonc`). A push to `main` builds and deploys it.

- Build command: `npm run build`
- Deploy command: `npx wrangler deploy`

The Worker wants one secret, `ADMIN_KEY`, for the keeper's pages at `/room/record` and `/room/reports`.

## Where things are kept

**The island's room** (`worker/index.js`) is a Durable Object with its own SQLite database. It relays what each visitor does to the others and keeps a queue, since only so many animals fit ashore at once. It also keeps everything shared: the boat's planks, the wall, bottles, the lighthouse and the other works, first footprints, the guest book, and a count of what visitors do that carries no names.

**A visitor's own progress** is kept by the room under a number made from a key their browser holds. The key is shown in Help, and entering it on another device brings the progress across.

Shared records lived in a Supabase project until November 2026. `supabase/` and a little code in `src/backend.js` and the Worker remain only to carry old records and old guest accounts across.

## Layout

- `src/main.js` the game loop, controls, actions, quests and the boat's voyages
- `src/terrain.js` the shape of both islands and everything that has a place on them
- `src/world.js` land, sea, sky and what stands on them
- `src/wide.js`, `src/folk.js` who lives on Lantern Rock, their errands, hidden places and shared works
- `src/play.js` fishing, cooking, swapping, planting, digging, birds and games
- `src/puzzles.js` the seven puzzles and the stones with lines cut in them
- `src/alive.js` small birds, rain, what the tide leaves, ropes, the tunnel
- `src/quests.js`, `src/items.js`, `src/stamps.js` the words and lists: quests, things, sights
- `src/avatar.js`, `src/quad.js` the animals and how they move
- `src/life.js`, `src/critters.js`, `src/shy.js` fish, gulls, crabs, hares, seals
- `src/build.js`, `src/voyage.js` the boat and where she sails
- `src/props.js` the models, loaded from one file
- `src/audio.js` every sound, made in the browser
- `src/clock.js` island time (one day is 48 real minutes)
- `src/net.js`, `src/store.js`, `src/backend.js` other visitors and saved things
- `worker/index.js` the room, its database and the keeper's pages
- `assets/site/props.glb` every model that is not an animal, exported from Blender
- `assets/q/` animal models, trimmed with `tools/pack_animals.mjs`
- `tests/` browser checks written during development (they expect Playwright and Chrome at fixed paths)

## Credits

Animal models: Quaternius, Ultimate Animated Animal Pack (CC0).
Everything else on the islands was modelled for the game in Blender.
Music made with Suno.
