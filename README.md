# Wedding website — a walk through Dakshineswar

Scroll-driven wedding site. As guests scroll they walk through the Dakshineswar Kali
Temple complex — in through the lion gate, past the twelve Shiva temples along the
Hooghly, under the nat-mandir, past the wedding mandap, up the stairs of the navaratna
temple and into the sanctum. Every piece of wedding information is a card pinned to a
place in the scene: the invitation at the gate, the story by the Shiva temples, the
schedule in the nat-mandir, the ceremony at the mandap, travel at the temple stairs, and
the RSVP form in the sanctum.

The complex is modelled in code from reference photographs of the real temple (Wikimedia
Commons) — cream stucco with rose bands, ribbed spires on octagonal drums, bow-shaped
cornices, the arcaded ground floor, the salmon-domed aat-chala Shiva temples. No image or
3D-model assets are needed. Daytime by default; a **Night** toggle floodlights the temple.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # static output in dist/
npm run preview    # serve dist/ locally
```

## Put your details in

- **`src/content.js`** — names, date, venue, the card texts, story, events, travel, RSVP.
  The placeholders are deliberately fictional.
- **`index.html`** — the `<meta name="description">` (what link previews show).
- **`music/`** — drop `.mp3` / `.m4a` / `.ogg` files here and the **Sound** button plays
  them in alphabetical order (see `music/README.md`). With no files it falls back to a
  synthesized temple ambience.
- RSVP: leave `rsvp.formEndpoint` empty and the form opens the guest's email app
  pre-filled; set it to a form-service URL (Formspree, Basin, Getform…) to POST instead.

## Deploy

`npm run build` produces a plain static site in `dist/` (relative asset paths, so it works
from a sub-path). GitHub Pages, Netlify, Vercel, Cloudflare Pages — anything static.
Re-run the build after adding music.

## How it's put together

```
src/
  content.js         ← all guest-facing text
  main.js            ← scroll → scene, cards, day/night, sound; WebGL fallback
  cards.js           ← cards pinned to 3D anchors (projected each frame)
  audio.js           ← /music playlist + synthesized ambience fallback
  sections.js        ← plain-HTML details, shown only when WebGL is unavailable
  style.css
  scene/
    scene.js         ← renderer, sky shader, sun/moon, day↔night lerp, camera path
    dakshineswar.js  ← gate, boundary buildings, Shiva temples, ghat, nat-mandir,
                        mandap, navaratna temple, sanctum, lights
    nature.js        ← palms, broadleaf trees, banana plants, fireflies
    geo.js           ← round/cusped arches, bow parapets, ribbed spires, bulging roofs
    materials.js     ← canvas-generated stucco / stripe / dentil / flagstone textures
```

Notes:

- Native scrolling only; the camera lerps toward the scroll position and the cards are
  projected from world anchors on the same frame, so they never drift.
- `Night` is remembered in `localStorage`; day is the default.
- The render loop pauses when the tab is hidden; `prefers-reduced-motion` disables the
  head-bob and easing.
- If WebGL is unavailable the walk is skipped and the details render as a normal page.
