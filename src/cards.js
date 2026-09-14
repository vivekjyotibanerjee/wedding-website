import { content } from './content.js';
import { ANCHORS } from './scene/walk.js';
import { alponaCanvas, alponaCornerCanvas, vineSVG } from './ornament.js';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const names = (a, b) => `${esc(a)} <span class="amp">&amp;</span> ${esc(b)}`;

function smooth(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / Math.max(1e-6, b - a)));
  return t * t * (3 - 2 * t);
}

/**
 * Cards pinned to places in the complex. Where each one pins (`anchor`, a world-space point) and
 * when it shows (`range`: [fadeInStart, fadeInEnd, fadeOutStart, fadeOutEnd] in walk progress)
 * come from scene/walk.js, next to the camera path. `side` docks the card left/right on wide screens.
 */
function buildCards() {
  const c = content;
  const w = c.walk;
  const ev = c.events.list;
  return [
    {
      id: 'title', centered: true, range: [0, 0, 0.045, 0.1],
      html: `
        <p class="bengali-title">${esc(c.couple.bengaliTitle)}</p>
        <h1>${names(c.couple.partner1, c.couple.partner2)}</h1>
        <p class="lead">${esc(c.date.display)} · ${esc(c.venue.name)}</p>
        <p class="hint">${esc(w.intro)}</p>
        <a class="skip" href="#rsvp" data-jump="end">Jump to RSVP</a>`,
    },
    {
      id: 'gate', ...ANCHORS.gate, side: 'left',
      html: `
        <p class="kicker">${esc(w.gate.kicker)}</p>
        <h2>${names(c.couple.partner1, c.couple.partner2)}</h2>
        <p>${esc(w.gate.body.replace('{names}', `${c.couple.partner1} and ${c.couple.partner2}`))}</p>`,
    },
    {
      id: 'story', ...ANCHORS.story, side: 'right',
      html: `
        <p class="kicker">${esc(c.couple.hashtag)}</p>
        <h2>${esc(c.story.heading)}</h2>
        <ol class="timeline">
          ${c.story.timeline.map((t) => `<li><span class="when">${esc(t.when)}</span><b>${esc(t.title)}</b><span>${esc(t.text)}</span></li>`).join('')}
        </ol>`,
    },
    {
      id: 'events', ...ANCHORS.events, side: 'left',
      html: `
        <p class="kicker">Schedule</p>
        <h2>${esc(c.events.heading)}</h2>
        <p class="sub">${esc(c.events.intro)}</p>
        <ul class="events">
          ${ev.map((e) => `<li><b>${esc(e.name)}</b><span>${esc(e.date)} · ${esc(e.time)}</span><span class="place">${esc(e.place)}</span>${e.dress ? `<em>${esc(e.dress)}</em>` : ''}</li>`).join('')}
        </ul>`,
    },
    {
      id: 'ceremony', ...ANCHORS.ceremony, side: 'right',
      html: `
        <p class="kicker">${esc(w.ceremony.kicker)}</p>
        <h2>${esc(w.ceremony.title)}</h2>
        <p class="big">${esc(c.date.display)}<br>${esc(c.date.time)}</p>
        <p>${esc(w.ceremony.body)}</p>
        <p class="dress">${esc(w.ceremony.dress)}</p>`,
    },
    {
      id: 'travel', ...ANCHORS.travel, side: 'left',
      html: `
        <p class="kicker">Getting here</p>
        <h2>${esc(c.travel.heading)}</h2>
        <p class="big">${esc(c.venue.name)}<br><span class="muted">${esc(c.venue.address)}</span></p>
        <a class="btn ghost" href="${esc(c.venue.mapUrl)}" target="_blank" rel="noopener">Open in maps</a>
        <div class="two-col">
          <div>
            <p class="col-title">Getting there</p>
            ${c.travel.gettingThere.map((g) => `<p><b>${esc(g.title)}</b> ${esc(g.text)}</p>`).join('')}
          </div>
          <div>
            <p class="col-title">Where to stay</p>
            ${c.travel.hotels.map((h) => `<p><b>${h.url && h.url !== '#' ? `<a href="${esc(h.url)}" target="_blank" rel="noopener">${esc(h.name)}</a>` : esc(h.name)}</b> ${esc(h.text)}</p>`).join('')}
          </div>
        </div>`,
    },
    {
      id: 'rsvp', ...ANCHORS.rsvp, side: 'right', form: true,
      html: `
        <p class="kicker bengali">${esc(w.sanctum.kicker)}</p>
        <h2>${esc(w.sanctum.title)}</h2>
        <p class="sub">${esc(c.rsvp.intro)}</p>
        <form class="rsvp-form" id="rsvp-form" novalidate>
          <label>Your name <input name="name" type="text" autocomplete="name" required /></label>
          <div class="row">
            <label>Email <input name="email" type="email" autocomplete="email" /></label>
            <label>Guests <input name="guests" type="number" min="1" max="10" value="1" /></label>
          </div>
          <label>Will you join us?
            <select name="attending">
              <option value="Joyfully accepts">Joyfully accepts</option>
              <option value="Regretfully declines">Regretfully declines</option>
            </select>
          </label>
          <label>Anything we should know? <textarea name="notes" rows="2" placeholder="Dietary needs, a song request…"></textarea></label>
          <div class="actions">
            <button class="btn" type="submit">Send RSVP</button>
            <span class="status" id="rsvp-status"></span>
          </div>
        </form>`,
    },
  ];
}

/** Alpona corner motifs for the card frames and a faint rosette behind the title, as CSS vars. */
function installOrnament() {
  const corner = alponaCornerCanvas(160).toDataURL('image/png');
  const rosette = alponaCanvas(768, { ink: 'rgba(255, 240, 210, 1)', seed: 5 }).toDataURL('image/png');
  const root = document.documentElement.style;
  root.setProperty('--alpona-corner', `url(${corner})`);
  root.setProperty('--alpona-rosette', `url(${rosette})`);
}

export function mountCards(container, sceneApi) {
  installOrnament();
  const cards = buildCards();
  const els = cards.map((c, i) => {
    const el = document.createElement('section');
    el.className = `card ${c.centered ? 'card-centered' : 'card-pinned'} card-${c.id}`;
    // pinned cards: the pin, then a box that carries the greenery draped over the top edge and the
    // scrolling text panel; only the box moves, so the vine can overflow it
    el.innerHTML = c.centered
      ? `<div class="card-inner">${c.html}</div>`
      : `<span class="pin" aria-hidden="true"></span><div class="card-box"><div class="card-vine card-vine-${c.side}" aria-hidden="true">${vineSVG(420, 110, 11 + i * 7)}</div><div class="card-inner">${c.html}</div><i class="card-corner tl"></i><i class="card-corner tr"></i><i class="card-corner br"></i><i class="card-corner bl"></i></div>`;
    el.style.opacity = '0';
    el.style.visibility = 'hidden';
    container.appendChild(el);
    return el;
  });
  const boxes = els.map((el) => el.querySelector('.card-box'));
  const inners = els.map((el) => el.querySelector('.card-inner'));
  const pins = els.map((el) => el.querySelector('.pin'));

  const jump = container.querySelector('[data-jump="end"]');
  if (jump) jump.addEventListener('click', (e) => {
    e.preventDefault();
    const walk = document.getElementById('walk');
    window.scrollTo({ top: Math.max(0, walk.offsetHeight - window.innerHeight) }); // the camera eases there on its own
  });
  const form = container.querySelector('#rsvp-form');
  if (form) wireRsvp(form, container.querySelector('#rsvp-status'));

  let lastActive = -1;
  return {
    update(progress, over) {
      const exit = 1 - smooth(0, 0.3, over);
      const W = window.innerWidth, H = window.innerHeight;
      const docked = W < 720;
      cards.forEach((c, i) => {
        const [a, b, cc, d] = c.range;
        let o = i === 0 && progress <= 0 ? 1 : smooth(a, b, progress) * (1 - smooth(cc, d, progress));
        o *= exit;
        const el = els[i];
        if (o < 0.01) {
          el.style.opacity = '0';
          el.style.visibility = 'hidden';
          if (lastActive === i) lastActive = -1;
          return;
        }
        el.style.visibility = 'visible';
        el.style.opacity = o.toFixed(3);
        if (o > 0.5 && lastActive !== i) lastActive = i;

        if (c.centered) return;
        const p = sceneApi.project({ x: c.anchor[0], y: c.anchor[1], z: c.anchor[2] });
        if (!p) { el.style.opacity = '0'; el.style.visibility = 'hidden'; return; }
        const px = p.x * W, py = p.y * H;
        pins[i].style.transform = `translate(${px.toFixed(1)}px, ${py.toFixed(1)}px)`;
        const inner = inners[i];
        const cw = inner.offsetWidth, ch = inner.offsetHeight;
        let x, y;
        if (docked) {
          x = (W - cw) / 2;
          y = H - ch - 20;
        } else {
          // dock to the screen edge on the card's side so the subject stays visible; the pin marks the spot
          x = c.side === 'left' ? 24 : W - cw - 24;
          y = py - ch * 0.35;
          y = Math.min(Math.max(116, y), H - ch - 24);   // below the HUD buttons, vine included
        }
        boxes[i].style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
      });
    },
  };
}

function wireRsvp(form, status) {
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const data = new FormData(form);
    const name = (data.get('name') || '').toString().trim();
    if (!name) { status.textContent = 'Please tell us your name.'; form.name.focus(); return; }
    const lines = [
      `Name: ${name}`,
      `Email: ${data.get('email') || '-'}`,
      `Guests: ${data.get('guests') || 1}`,
      `Attending: ${data.get('attending')}`,
      `Notes: ${data.get('notes') || '-'}`,
    ];
    const endpoint = content.rsvp.formEndpoint;
    if (endpoint) {
      status.textContent = 'Sending…';
      try {
        const res = await fetch(endpoint, { method: 'POST', headers: { Accept: 'application/json' }, body: data });
        if (!res.ok) throw new Error(String(res.status));
        status.textContent = 'Thank you — we have your reply!';
        form.reset();
      } catch (e) {
        status.textContent = 'Something went wrong. Please email us instead.';
      }
      return;
    }
    const subject = encodeURIComponent(`RSVP — ${name}`);
    const body = encodeURIComponent(lines.join('\n'));
    window.location.href = `mailto:${content.rsvp.email}?subject=${subject}&body=${body}`;
    status.textContent = 'Opening your email app…';
  });
}
