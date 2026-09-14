# Wedding website — a walk through Dakshineswar

Scroll-driven wedding site. As guests scroll they walk through the Dakshineswar Kali
Temple complex — from the Hooghly up the ghat, between the twelve Shiva temples, across
the courtyard to the wedding mandap, past the nat-mandir, up the stairs of the navaratna
temple and into its arcaded verandah. Every piece of wedding information is a card pinned
to a place in the scene: the invitation at the ghat, the story by the Shiva temples, the
ceremony at the mandap, the schedule at the nat-mandir, travel at the temple stairs, and
the RSVP form under the temple's central arch.

The complex is the Blender model from `recon/` (built parametrically from reference
photographs of the real temple — cream stucco with rose bands, ribbed spires, the 9-foil
arcades, the red-plastered aat-chala Shiva temples, the mandap), baked and exported to
`public/models/dakshineswar.glb` (≈ 95 k faces, meshopt-compressed, WebP textures, ≈ 8.4 MB).
Daytime by default; a **Night** toggle floodlights the temple.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # static output in dist/
npm run preview    # serve dist/ locally
```

## Put your details in

Everything guests read is in **`content.json`** at the repo root — names, date, venue, the
card texts, story, events, travel, RSVP, the page title and link-preview description. Edit
it freely; the dev server reloads on save, and `npm run build` bakes it into `dist/` for
deploying. The placeholders in it are deliberately fictional. JSON has no comments, so the
fields are explained here:

| Field | What it is |
| --- | --- |
| `site.title`, `site.description` | Browser-tab title and the `<meta name="description">` link previews show. Both are also written into `index.html` at build time (`vite.config.js`), so crawlers see them. Omit `site` and the title becomes "*A* & *B* — Wedding". |
| `couple.partner1/2`, `hashtag` | The two names, rendered as "*A* & *B*"; the hashtag heads the story card. |
| `couple.bengaliTitle` | Short blessing above the names on the title screen (শুভ বিবাহ = "auspicious wedding"). |
| `date.display`, `date.time`, `date.iso` | The main ceremony, as guests should read it. `iso` (`YYYY-MM-DD`) is not rendered anywhere yet — kept for a future add-to-calendar link. |
| `venue.name/address/mapUrl` | `name` is on the title card; `name` and `address` on the travel card, where `mapUrl` is the "Open in maps" button. |
| `walk.intro` | The scroll hint under the names. |
| `walk.gate` | The invitation card at the ghat; `{names}` in `body` becomes "*A* and *B*". |
| `walk.ceremony` | The card at the mandap: `kicker`, `title`, `body`, `dress`. |
| `walk.sanctum` | Kicker (Bengali font) and title over the RSVP form in the temple. |
| `story` | `heading`, `intro` (fallback page only) and a `timeline` of `{ when, title, text }`. |
| `events` | `heading`, `intro` and `list` of `{ name, date, time, place, dress, note }`; `dress` and `note` may be empty. |
| `travel` | `heading`, `intro`, `gettingThere` (`{ title, text }`) and `hotels` (`{ name, text, url }`; leave `url` empty for no link). |
| `rsvp.email` | Where the RSVP goes when `formEndpoint` is empty: the form opens the guest's email app with a pre-filled message. |
| `rsvp.formEndpoint` | Set it to a form-service URL (Formspree, Basin, Getform…) and the form POSTs there instead. |
| `rsvp.heading/intro/deadline` | Text over the form; `deadline` feeds the "Reply by …" kicker on the fallback page. |
| `footer.line` | The sign-off under the plain-page footer. |
| `labels` | Every fixed bit of UI text — kickers ("Schedule", "Getting here"), buttons, the RSVP form's labels, options and status messages. Optional: anything missing falls back to the English defaults in `src/content.js`. `{deadline}` and `{name}` tokens are filled in. |

`src/content.js` loads the JSON and fills in the `labels` defaults; nothing else needs touching.

- **`music/`** — drop `.mp3` / `.m4a` / `.ogg` files here and the **Sound** button plays
  them in alphabetical order (see `music/README.md`). With no files it falls back to a
  synthesized temple ambience.

## Update the model

The scene is `public/models/dakshineswar.glb`, regenerated from the Blender script in
`recon/` — edit `recon/blender/build_dakshineswar.py`, then:

```bash
BLENDER=~/opt/blender-4.0.2-linux-x64/blender bash recon/blender/render.sh web
```

That rebuilds the model, bakes every Cycles material to per-mesh albedo + normal +
ambient-occlusion maps, exports a glTF, compresses it with `gltf-transform` (meshopt) into
`public/models/` and rewrites `src/scene/landmarks.json` (the positions the camera path, the
cards and the runtime props are pinned to — see `src/scene/walk.js` and `life.js`). It needs
the official Blender 4.0 build: the Ubuntu `blender` package bakes black. ~17 min on a
22-core laptop CPU; the result is ≈ 11.7 MB. Useful while iterating:

```bash
# positions only (no bake), e.g. after moving a lamp post
bash recon/blender/render.sh web --landmarks-only
# bake a few meshes into a test glb (the rest ships untextured), then open ?model=/models/preview.glb
BLENDER=… blender -b -P recon/blender/export_web.py -- --only '^(paving_web|nat)$' --out /tmp/t --bake-dir /tmp/t/bake
npx gltf-transform meshopt /tmp/t/dakshineswar.glb public/models/preview.glb --level medium   # git-ignored
```

Everything that moves or glows is not in the glb but layered over it at runtime
(`src/scene/life.js`): the diyas, string lights, the light in the doorways and the lamp
posts at night, fireflies, birds, the flag, wind in the mandap drapes, ripples on the river,
the alpona painted on the ground. Their positions come from `landmarks.json` too.

## Check it without a browser

```bash
npm run shoot -- http://localhost:5173/ shots 0 0,0.16,0.47,0.78,1   # day; 1 instead of 0 for night
VW=390 VH=844 npm run shoot -- http://localhost:5173/ shots 0 0.47     # phone portrait
```

`scripts/shoot.mjs` drives the site in a software-rendered headless Chromium (Playwright's
cached Chromium, or `CHROME=/path/to/chrome`) and screenshots the walk at those scroll
fractions. It is slow, so give the camera time (`WAIT=8000`) when the CPU is busy. Add `#debug`
to the URL to get `window.templeScene` in the console.

## Deploy

`npm run build` produces a plain static site in `dist/` (relative asset paths, so it works
from a sub-path). GitHub Pages, Netlify, Vercel, Cloudflare Pages — anything static.
Re-run the build after adding music.

## How it's put together

```
public/models/dakshineswar.glb   ← the complex, exported from recon/ (see above)
content.json         ← all guest-facing text (see "Put your details in")
vite.config.js       ← also bakes the title/description from content.json into index.html
src/
  content.js         ← loads content.json, fills in label defaults
  main.js            ← scroll → scene, cards, day/night, sound; loading veil; WebGL fallback
  cards.js           ← cards pinned to 3D anchors (projected each frame)
  audio.js           ← /music playlist + synthesized ambience fallback
  sections.js        ← plain-HTML details, shown only when WebGL is unavailable
  style.css
  scene/
    scene.js         ← renderer, sky shader (clouds) + image-based lighting from it, sun/moon,
                        day↔night lerp, night floodlights, bloom, camera along the path
    life.js          ← the runtime layer: diyas, string lights, lamps, fireflies, birds, flag,
                        drape wind, river ripples, alpona decals
    walk.js          ← the camera path and the card anchors, in the model's frame
    landmarks.json   ← key positions written by recon/blender/export_web.py
    model.js         ← glTF loader (meshopt), shadow flags, per-material tweaks
  ornament.js        ← generated alpona (canvas) and vine (SVG) shared by the scene and the cards
recon/               ← the model itself (Blender script, textures) and the 3DGS pipeline
scripts/shoot.mjs    ← headless screenshots of the walk (see below)
CLAUDE.md            ← working notes: commands, how the pieces fit, decisions, gotchas
```

Notes:

- Frame: metres, x east, y up, z south (Blender's +Y north becomes −z), origin at the
  navaratna's centre — the same frame as `recon/configs/layout.geojson`.
- Native scrolling only; the camera lerps toward the scroll position and the cards are
  projected from world anchors on the same frame, so they never drift.
- `Night` is remembered in `localStorage`; day is the default.
- The render loop pauses when the tab is hidden; `prefers-reduced-motion` disables the
  head-bob and easing.
- If WebGL is unavailable, or the model download stalls, the walk is skipped and the
  details render as a normal page.
