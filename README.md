# Wedding website — a walk through Dakshineswar

Scroll-driven wedding site. As guests scroll they walk through the Dakshineswar Kali
Temple complex — from the Hooghly up the ghat, left along the Shiva temples and through the
Radhakanta hall, back to the wedding mandap, through the nat-mandir, up the stairs of the
navaratna temple and into its central arch, where the sanctum door stands open. Every piece
of wedding information is a card pinned to a place in the scene: the invitation at the ghat,
the story by the Shiva temples, how to get here and the day before inside the Radhakanta
(train, air, hotels, haldi & sangeet), the ceremony and what it means at the mandap, the
wedding day inside the nat-mandir (breakfast, baraat, ceremony, cocktails, reception), and
the RSVP form before Ma Kali in the sanctum.

The complex is the Blender model from `recon/` (built parametrically from reference
photographs of the real temple — cream stucco with rose bands, ribbed spires, the 9-foil
arcades, the red-plastered aat-chala Shiva temples, the mandap), baked and exported to
`public/models/dakshineswar.glb` (≈ 95 k faces, meshopt-compressed, WebP textures, ≈ 12 MB).
Daytime by default; a **Night** toggle floodlights the temple.

The temple is dressed for the wedding as the guest walks: bare at the river, then a toran gate
at the top of the ghat, a red carpet rolling out up the strip, torans over the doors and diya
bowls set out, marigold garlands drawing in along the Shiva fronts and the halls, the diyas and
string lights coming on in a wave from the mandap as the light turns golden, the mandap's
columns wrapped and strands hung from its canopy, the agni lit and petals falling for the
ceremony, and the nat-mandir and the navaratna fully dressed and glowing by the sanctum. The
schedule is `src/scene/stage.js`. Inside each hall the walk goes past tables laid out along the
back wall — the welcome tray and mangal ghot, the puja things, the bhog, the bride's shringar in
the Radhakanta (a U, back out of its other end door); the garland-maker's baskets, the musicians'
corner, the lamps, the tattva trays and the paan in the nat-mandir (an L, out between the columns
of its open north front onto the temple stair) — one per card, set out as the guest comes in
(`src/scene/tables.js`).

## Run it

```bash
npm install        # Node ≥ 20 (the site itself runs on 18, but `npm run model`'s gltf-transform step does not)
npm run dev        # http://localhost:5173
npm run build      # static output in dist/
npm run preview    # serve dist/ locally
```

## Put your details in

Everything guests read is in **`content.json`** at the repo root — names, date, venue, the
card texts, story, RSVP, the page title and link-preview description. Edit
it freely; the dev server reloads on save, and `npm run build` bakes it into `dist/` for
deploying. The placeholders in it are deliberately fictional. JSON has no comments, so the
fields are explained here:

| Field | What it is |
| --- | --- |
| `site.title`, `site.description` | Browser-tab title and the `<meta name="description">` link previews show. Both are also written into `index.html` at build time (`vite.config.js`), so crawlers see them. Omit `site` and the title becomes "*A* & *B* — Wedding". |
| `couple.partner1/2`, `hashtag` | The two names, rendered as "*A* & *B*"; the hashtag heads the story card. |
| `couple.bengaliTitle` | Short blessing above the names on the title screen (শুভ বিবাহ = "auspicious wedding"). |
| `date.display`, `date.time`, `date.iso` | The main ceremony, as guests should read it. `iso` (`YYYY-MM-DD`) is not rendered anywhere yet — kept for a future add-to-calendar link. |
| `venue.name/address/mapUrl` | `name` is on the title card; `name` and `address` on any card with `"venue": true`, where `mapUrl` is the "Open in maps" button. |
| `hotel.name/address/mapUrl` | The same block for the hotel, on any card with `"hotel": true` (the hotels card). |
| `walk.intro` | The scroll hint under the names. |
| `walk.before`, `walk.day` | The two groups of cards the walk goes through — inside the Radhakanta hall and inside the nat-mandir: a `heading` (used by the fallback page) and the `cards` ids in order. |
| `cards` | One entry per card, keyed by id (see below). Every field is optional: `kicker`, `title`, `when` and `place` (set big), `body` (a string or a list of paragraphs), `items` (`{ name, text, url }`, a list — hotels; leave `url` empty for no link), `dress`, `button` (`{ label, url }`) `venue` (true to show the venue and its map button) and `hotel` (the same for the hotel). `{names}`, `{hashtag}`, `{date}`, `{time}` and `{venue}` are filled in. |
| `cards.gate` | The invitation at the ghat — its title is the couple's names. |
| `cards.story` | Kicker and title over the story timeline, by the Shiva temples. |
| `cards.train/air/hotels/haldi` | Inside the Radhakanta hall: how to get here and the day before. |
| `cards.ceremony` | At the mandap: the ceremony and what it means. |
| `cards.breakfast/baraat/vows/cocktails/reception` | Inside the nat-mandir: the wedding day, in order. |
| `cards.rsvp` | Kicker (Bengali font) and title over the RSVP form, before the sanctum door. |
| `story` | `heading`, `intro` (fallback page only) and a `timeline` of `{ when, title, text }`. |
| `rsvp.email` | Where the RSVP goes when `formEndpoint` is empty: the form opens the guest's email app with a pre-filled message. |
| `rsvp.formEndpoint` | Set it to a form-service URL (Formspree, Basin, Getform…) and the form POSTs there instead. |
| `rsvp.heading/intro/deadline/events` | Text over the form; `deadline` feeds the "Reply by …" kicker and `events` the "Which events?" choices on the fallback page. |
| `footer.line` | The sign-off under the plain-page footer. |
| `labels` | Every fixed bit of UI text — buttons, the RSVP form's labels, options (the shuttle question is `form.shuttle`, its answers `shuttleNo/Sangeet/Wedding/Both`) and status messages. Optional: anything missing falls back to the English defaults in `src/content.js`. `{deadline}` and `{name}` tokens are filled in. |

`src/content.js` loads the JSON and fills in the `labels` defaults; nothing else needs touching.
Where each card pins and when it shows is `ANCHORS` in `src/scene/walk.js`, keyed by the same ids;
the cards inside the halls pin over their tables (`TABLES` there).

- **`public/images/bhavatarini.png`** (or `.jpg` / `.webp`) — the picture of Ma Kali in the sanctum, seen through the
  open door at the end of the walk (a photo or painting, portrait, any size; it is shown at its
  own proportions on a lit plane over the dais). Without it the chamber is simply lit, the dais bare.

- **`public/models/couple.glb`** — the bride and groom who walk round the fire during the ceremony,
  made from the two rigged characters in `free_assets/` (`bash recon/blender/render.sh couple`:
  poses them, keys a walk, shrinks them to ~62k triangles and 2k maps). Without the file the mandap
  simply has no couple.

- **`music/`** — the soundtrack (`sajani-sajani.mp3`), played on a loop by the **Sound**
  button; more `.mp3` / `.m4a` / `.ogg` files here play in alphabetical order. The bells are the
  one synthesized sound, struck as the walk passes under them at the halls' doors.

## Update the model

The scene is **`recon/blender/scene.blend`** (committed, ~2 MB). It is edited in Blender — by
hand, or by Claude Code through the Blender MCP tool (below) — and exported from there:

```bash
npm run model     # = BLENDER=… bash recon/blender/render.sh web --blend recon/blender/scene.blend
```

That opens the file, bakes every Cycles material to per-mesh albedo + normal + ambient-occlusion
maps, exports a glTF, compresses it with `gltf-transform` (meshopt) into `public/models/` and
rewrites `src/scene/landmarks.json` (the positions the camera path, the cards and the runtime
props are pinned to — see `src/scene/walk.js` and `life.js`). It needs a Blender Foundation build
(the `blender` snap, 5.2 — `render.sh` takes `blender` from the PATH or `BLENDER=…`): the Ubuntu
`blender` package bakes black. It also needs Node ≥ 20 with `npm install` done (`gltf-transform`'s
`sharp` dependency does not load on 18); `render.sh` checks that first and refuses before the bake
rather than failing after it. ~17 min on a 22-core laptop CPU; the result is ≈ 12 MB. Then `npm run shoot` to look, and
commit the glb, `landmarks.json` and `scene.blend` together. Useful while iterating:

```bash
# positions only (no bake), e.g. after moving a lamp post
bash recon/blender/render.sh web --blend recon/blender/scene.blend --landmarks-only
# bake a few meshes into a test glb (the rest ships untextured), then open ?model=/models/preview.glb
BLENDER=… blender -b -P recon/blender/export_web.py -- --blend recon/blender/scene.blend --only '^(paving_web|nat)$' --out /tmp/t --bake-dir /tmp/t/bake --landmarks /tmp/t/landmarks.json
npx gltf-transform meshopt /tmp/t/dakshineswar.glb public/models/preview.glb --level medium   # git-ignored
```
(`--only` matches mesh names, not object names — the Outliner shows both.)

`recon/blender/build_dakshineswar.py` is the script that generated `scene.blend` (Sep 2026). It
is no longer how the scene is edited: running it (`render.sh blend`, or `render.sh web` without
`--blend`) is a **reset** that rebuilds the complex from its constants and, for `web`, exports
that over whatever the `.blend` holds. Keep it for regenerating textures and for the landmarks
(below).

### Set up a machine

1. Blender 5.2 LTS — the Foundation's build (`snap install blender --classic`, or the tarball
   from blender.org). Use the same one both to export and to open `scene.blend` for editing: the
   file is saved by 5.2 and a newer major would rewrite it on save. The distro package is fine
   for looking, never for baking.
2. Textures and the sky: `scene.blend` references `recon/data/blender/textures/` (git-ignored,
   generated). Once per machine:
   ```bash
   bash recon/blender/render.sh blend                 # BLENDER=… if blender is not on the PATH
   ```
   generates the tiling maps and leaf atlases, fetches the CC0 sky HDRI, and leaves a disposable
   snapshot in `recon/data/blender/dakshineswar.blend` (not the scene — ignore it or delete it).
3. `uv` on the PATH **before launching Claude Code** — `curl -LsSf https://astral.sh/uv/install.sh | sh`
   installs to `~/.local/bin`; add it to `PATH` in `~/.bashrc`. The `blender` MCP server in
   `.mcp.json` runs `uvx blender-mcp==1.9.4` (a project server: Claude Code asks once to trust it).
4. The Blender side of the bridge: `uvx blender-mcp==1.9.4 install-addon` copies the matching
   add-on into Blender's add-ons folder (set `BLENDERMCP_ADDONS_DIR` if it cannot find one);
   enable "MCP for Blender" in Edit ▸ Preferences ▸ Add-ons. Do not install `addon.py` from
   anywhere else — the add-on and the server are versioned together (protocol 7).
5. `npm install`; `git-lfs` is not set up (the `.blend` is small; the glb is the ~12 MB file).
6. Not in git and only needed for the reference views: `recon/data/reference/` (the SketchUp
   export from `skp_911.zip`, 130 MB) — copy it over if you want `ref_views.py`/`pair.py`.

### Edit the scene with Claude Code

1. Start Blender (`blender recon/blender/scene.blend`), open the
   sidebar (N) ▸ **MCP for Blender** ▸ *Connect to MCP server* (it listens on `localhost:9876`).
2. In Claude Code, `/mcp` should show `blender` connected; ask for a change. Claude works on the
   open file through the tool (`get_scene_info`, `execute_blender_code` running `bpy` in the live
   session, `get_viewport_screenshot` to look) — the rules it follows are in `CLAUDE.md`
   ("Editing the scene through the Blender MCP tool").
3. Save (Ctrl+S — the file on disk is what the export reads; Claude can also save it), then
   `npm run model` and `npm run shoot` to see it on the site.

What an edit in the scene can and cannot change:

- **Fine anywhere**: moving, reshaping, deleting or adding objects, relief, materials (a new
  material set up in the Material panel is fine; the export bakes whatever Cycles renders).
  Deleting an object or hiding it from render (the camera icon) both drop it from the glb. A
  new object needs no UVs — the export gives it some. Closed solids, no booleans, parts touch
  and never bite into each other (`CLAUDE.md`).
- **Lamp posts and bells move with the edit** (`lamp_*`, `bell_*`: their light and swing are
  read back from the file), so those are safe to move.
- **Not yet in the scene: anything the walk stands on.** `landmarks.json` is computed from the
  constants at the top of `build_dakshineswar.py`, not from the file — stairs, plinths, doors,
  arches, columns, the sanctum, the halls' sizes and positions. Move a staircase in Blender and
  the camera still climbs where the old one was and the carpet lies in the air. Until
  `export_web.landmarks()` reads those from the scene (the follow-up that finishes this move),
  such a change is made twice: in the file, and to the constants, keeping the two in step.

Old snapshots and the script era: `render.sh diff FILE` still prints what a `.blend` differs
from the script by, by object name (`--keep-added` saves added objects to `recon/blender/assets/`),
which is how hand edits used to be ported back into the script. With the file as the scene that
is only for the record. The export's warning that the file "was snapshotted from a different
build_dakshineswar.py" means the *script* changed since the file was stamped (a constant moved
to keep the landmarks in step, say), not that the file was edited: re-stamp the file from Blender
(`import build_dakshineswar as B; B.stamp_scene()`, save) once the two agree, and the warning
means something again.

Everything that moves, glows or is hung for the wedding is not in the glb but layered over it
at runtime: `src/scene/life.js` (the diyas, string lights, the light in the doorways and inside
the halls and the lamp posts at night, fireflies, birds, the flag, the bells, wind in the mandap
drapes and the trees, ripples on the river, the alpona painted on the ground, and the shrine —
the picture, its halo and lamp — in the sanctum), `src/scene/decor.js` (garlands, torans, the
gate, the mandap's wraps and strands, the carpets) and `src/scene/fx.js` (petals, the agni with
its sparks and smoke, incense). Their positions come from `landmarks.json` too, and when each
appears is `src/scene/stage.js`.

## Check it without a browser

```bash
npm run shoot -- http://localhost:5173/ shots 0 0,0.12,0.34,0.56,0.72,1   # day; 1 instead of 0 for night
VW=390 VH=844 npm run shoot -- http://localhost:5173/ shots 0 0.34         # phone portrait
```

`scripts/shoot.mjs` drives the site in a software-rendered headless Chromium (Playwright's
cached Chromium, or `CHROME=/path/to/chrome`) and screenshots the walk at those scroll
fractions; `SNAP=1` jumps the walk there instead of easing (everything that appears with the
walk lands at once) and `LOOK=x,y,z/tx,ty,tz` pins the camera anywhere in the scene for the
shot. `npm run profile -- http://localhost:5173/` walks every PATH node the same way and
prints what a frame costs there (draw calls, triangles, compiled shader programs — the last
must not change mid-walk). It is slow, so give the camera time (`WAIT=8000`) when the CPU is busy. Add `#debug`
to the URL to get `window.templeScene` in the console and a panel with the stage, its
transitions, draw calls and a button per stage that scrolls the walk there.

## Deploy

`npm run build` produces a plain static site in `dist/` (relative asset paths, so it works
from a sub-path). GitHub Pages, Netlify, Vercel, Cloudflare Pages — anything static.
Re-run the build after adding music.

## How it's put together

```
public/models/dakshineswar.glb   ← the complex, exported from recon/ (see above)
public/models/couple.glb         ← the bride and groom, from free_assets/ via recon/blender/couple.py
public/images/bhavatarini.png    ← Ma Kali, shown in the sanctum (see above)
content.json         ← all guest-facing text (see "Put your details in")
vite.config.js       ← also bakes the title/description from content.json into index.html
src/
  content.js         ← loads content.json, fills in label defaults
  main.js            ← scroll → scene, cards, day/night, sound; loading veil; WebGL fallback
  cards.js           ← cards pinned to 3D anchors (projected each frame), one template for every card
  audio.js           ← /music soundtrack + the synthesized bell (rung from the scene)
  debug.js           ← the #debug panel: stage, transitions, draw calls, jump-to-stage buttons
  sections.js        ← plain-HTML details, shown only when WebGL is unavailable
  style.css
  scene/
    scene.js         ← renderer, sky shader (clouds) + image-based lighting from it, sun/moon,
                        day↔night lerp, night floodlights, bloom, camera along the path
    stage.js         ← the wedding's timeline along the walk: when each thing appears, lights or falls
    life.js          ← the runtime layer: diyas, string lights, lamps, fireflies, birds, flag, bells,
                        drape and tree wind, river ripples, alpona decals, the shrine picture and lamp
    decor.js         ← the wedding decoration: garlands, torans, the gate, column wraps, carpets
    tables.js        ← the tables along the halls' back walls and everything on them
    fx.js            ← petals, the agni (flames, sparks, smoke, light), incense
    couple.js        ← the bride and groom (couple.glb) walking round the agni during the ceremony
    util.js          ← shared: the swag curve, walk order, the scroll-reveal shader hook
    walk.js          ← the camera path (named nodes), the tables and the card anchors, in the model's frame
    landmarks.json   ← key positions written by recon/blender/export_web.py
    model.js         ← glTF loader (meshopt), shadow flags, per-material tweaks
  ornament.js        ← generated alpona (canvas) and vine (SVG) shared by the scene and the cards
recon/blender/scene.blend ← the scene itself, edited in Blender (by hand or via the MCP tool); exported by recon/blender/export_web.py
recon/               ← the model's tooling (export, textures, the script that generated the scene; named for a dropped photo-reconstruction plan)
scripts/shoot.mjs    ← headless screenshots of the walk (see above)
scripts/profile.mjs  ← draw calls / triangles / shader programs at every node of the walk
CLAUDE.md            ← working notes: commands, how the pieces fit, decisions, gotchas
```

Notes:

- Frame: metres, x east, y up, z south (Blender's +Y north becomes −z), origin at the
  navaratna's centre — the same frame as `recon/configs/layout.geojson`.
- Native scrolling only; the camera lerps toward the scroll position and the cards are
  projected from world anchors on the same frame, so they never drift.
- `Night` is remembered in `localStorage`; day is the default.
- The render loop pauses when the tab is hidden; `prefers-reduced-motion` disables the
  head-bob and easing, the petals, the smoke and the bells' swing (the decoration still
  follows the scroll).
- The decoration follows the scroll with a little hysteresis: a small scroll back does not
  undo it; a long one does.
- The red carpets are the walk itself: each is a stretch of the camera's path laid on the
  walking surface (`walk.js`: courtyard, flights tread by tread, plinth ledges), rounded at the
  turns and folded down every riser, so the guest is always on the carpet. The camera's height
  comes from the same surface.
- A device tier (`quality`) sets the effects budget; the heavy things — the shadow map, the
  sky's environment maps — are rendered once or on demand rather than every frame, and the
  instanced decoration is in spatial chunks so what is behind the guest is not drawn.
- If WebGL is unavailable, or the model download stalls, the walk is skipped and the
  details render as a normal page.
