# Wedding website — a walk through a terracotta temple

Scroll-driven wedding site. As guests scroll, they walk along a brick path, through a
toran gate, across a courtyard and under the nat-mandir, up the steps of a Bishnupur-style
pancha-ratna shrine, and into the lamp-lit sanctum — with the invitation revealed stage by
stage. After the walk, the page continues with the usual sections: our story, events,
travel & stay, and RSVP.

Everything is procedural (Three.js geometry, canvas-drawn terracotta textures, Web Audio
ambience) — there are no image or audio assets to host.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # static output in dist/
npm run preview    # serve dist/ locally
```

## Put your details in

Edit **`src/content.js`** — everything guests read lives there:

- `couple`, `date`, `venue` — names, date, venue (used on the title screen, footer and tab title)
- `walk` — the short lines shown at each stage of the temple walk
- `story`, `events`, `travel` — the sections after the walk
- `rsvp` — leave `formEndpoint` empty and the form opens the guest's email app with a
  pre-filled message to `email`; or set `formEndpoint` to a form-service URL
  (Formspree, Basin, Getform…) and the form POSTs there instead.

The placeholder names and dates are deliberately fictional. The tab title is set from
`content.js` at runtime; the `<meta name="description">` in `index.html` is the one other
place to personalise (it is what link previews and search results show).

## Deploy

`npm run build` produces a plain static site in `dist/` (relative asset paths, so it works
from a sub-path). Drop it on GitHub Pages, Netlify, Vercel, Cloudflare Pages — anything
that serves static files.

## How it's put together

```
src/
  content.js        ← all guest-facing text
  main.js           ← wires scroll → scene, overlays, audio; WebGL fallback
  stages.js         ← the fixed text cards shown during the walk
  sections.js       ← story / events / travel / RSVP markup
  audio.js          ← synthesized ambience (drone, wind, birds, bells, conch)
  style.css
  scene/
    scene.js        ← renderer, sky, lights, camera path, render loop
    temple.js       ← gate, nat-mandir, shrine, sanctum, lamps, garlands
    nature.js       ← palms, banana plants, pond, fireflies
    geo.js          ← chala roofs, ratna spires, cusped arches, world-UV boxes
    materials.js    ← canvas-generated brick / terracotta-panel / earth textures
```

Notes:

- Native scrolling only; the camera lerps toward the scroll position each frame and the
  text overlays are driven from the same smoothed value.
- The render loop pauses once you scroll past the walk and when the tab is hidden.
- `prefers-reduced-motion` disables the head-bob and the easing.
- If WebGL is unavailable the walk is skipped and the details render normally.
- Sound is off until the guest taps the **Sound** toggle (browsers require a gesture).
