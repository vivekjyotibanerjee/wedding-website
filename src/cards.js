import { content, fill, TOKENS } from './content.js';
import { wireRsvp } from './rsvp.js';
import { ANCHORS } from './scene/walk.js';
import { alponaCanvas, alponaCornerCanvas, vineSVG } from './ornament.js';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const names = (a, b) => `${esc(a)} <span class="amp">&amp;</span> ${esc(b)}`;
const text = (s) => esc(fill(s, TOKENS));
const link = (url) => url && url !== '#';

/** Where a jump to a card lands: the middle of its fully-shown stretch (walk.js ANCHORS `range`). */
export const cardStop = (id) => { const r = ANCHORS[id].range; return (r[1] + Math.min(r[2], 1)) / 2; };

function smooth(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / Math.max(1e-6, b - a)));
  return t * t * (3 - 2 * t);
}

/**
 * The body of one card from its content.json entry (README, "Put your details in"): kicker, title,
 * `when` and `place` big, `body` as one or more paragraphs, the venue and hotel blocks with their map buttons,
 * `items` as a list, `dress`, and a `button`. Every field is optional. `{names}`, `{hashtag}`,
 * `{date}`, `{time}` and `{venue}` are filled in.
 */
export function cardHTML(c, { h = 'h2', titleHTML = null } = {}) {
  const v = content.venue;
  const hotel = content.hotel;
  const L = content.labels;
  const body = c.body == null ? [] : [].concat(c.body);
  return [
    c.kicker && `<p class="kicker${/[\u0980-\u09ff]/.test(c.kicker) ? ' bengali' : ''}">${text(c.kicker)}</p>`,
    (titleHTML || c.title) && `<${h}>${titleHTML || text(c.title)}</${h}>`,
    (c.when || c.place) && `<p class="big">${c.when ? text(c.when) : ''}${c.when && c.place ? '<br>' : ''}${c.place ? `<span class="muted">${text(c.place)}</span>` : ''}</p>`,
    c.venue && `<p class="big">${esc(v.name)}<br><span class="muted">${esc(v.address)}</span></p><a class="btn ghost" href="${esc(v.mapUrl)}" target="_blank" rel="noopener">${esc(L.openInMaps)}</a>`,
    c.hotel && hotel && `<p class="big">${esc(hotel.name)}<br><span class="muted">${esc(hotel.address)}</span></p>${link(hotel.mapUrl) ? `<a class="btn ghost" href="${esc(hotel.mapUrl)}" target="_blank" rel="noopener">${esc(L.openInMaps)}</a>` : ''}`,
    ...body.map((p) => `<p>${text(p)}</p>`),
    c.items && `<ul class="items">${c.items.map((it) => `<li><b>${link(it.url) ? `<a href="${esc(it.url)}" target="_blank" rel="noopener">${text(it.name)}</a>` : text(it.name)}</b> ${text(it.text)}</li>`).join('')}</ul>`,
    c.dress && `<p class="dress">${text(c.dress)}</p>`,
    c.button && link(c.button.url) && `<a class="btn ghost" href="${esc(c.button.url)}" target="_blank" rel="noopener">${text(c.button.label)}</a>`,
  ].filter(Boolean).join('\n');
}

/**
 * Cards pinned to places in the complex. Where each one pins (`anchor`, a world-space point), when
 * it shows (`range`: [fadeInStart, fadeInEnd, fadeOutStart, fadeOutEnd] in walk progress) and which
 * screen edge it docks to on wide screens (`side`) come from scene/walk.js, next to the camera
 * path; the text comes from content.json's `cards`, keyed the same way.
 */
function buildCards() {
  const c = content;
  const K = c.cards;
  const L = c.labels;
  const F = L.form;
  const special = {
    gate: { titleHTML: names(c.couple.partner1, c.couple.partner2) },
    story: {
      extra: `<ol class="timeline">
          ${c.story.timeline.map((t) => `<li><span class="when">${esc(t.when)}</span><b>${esc(t.title)}</b><span>${esc(t.text)}</span></li>`).join('')}
        </ol>`,
    },
    rsvp: {
      form: true,
      extra: `
        <p class="sub">${esc(c.rsvp.intro)}</p>
        <form class="rsvp-form" id="rsvp-form" name="rsvp" method="POST" action="/__forms.html" data-netlify="true" netlify-honeypot="bot-field">
          <input type="hidden" name="form-name" value="rsvp" />
          <p hidden><label>Leave this empty <input name="bot-field" autocomplete="off" tabindex="-1" /></label></p>
          <label>${esc(F.name)} <input name="name" type="text" autocomplete="name" required /></label>
          <div class="row">
            <label>${esc(F.email)} <input name="email" type="email" autocomplete="email" /></label>
            <label>${esc(F.guests)} <input name="guests" type="number" min="1" max="10" value="1" /></label>
          </div>
          <label>${esc(F.attending)}
            <select name="attending">
              <option value="${esc(F.accepts)}">${esc(F.accepts)}</option>
              <option value="${esc(F.declines)}">${esc(F.declines)}</option>
            </select>
          </label>
          <label>${esc(F.shuttle)}
            <select name="shuttle">
              <option value="${esc(F.shuttleNo)}">${esc(F.shuttleNo)}</option>
              <option value="${esc(F.shuttleSangeet)}">${esc(F.shuttleSangeet)}</option>
              <option value="${esc(F.shuttleWedding)}">${esc(F.shuttleWedding)}</option>
              <option value="${esc(F.shuttleBoth)}">${esc(F.shuttleBoth)}</option>
            </select>
          </label>
          <label>${esc(F.notes)} <textarea name="notes" rows="2" placeholder="${esc(F.notesHint)}"></textarea></label>
          <div class="actions">
            <button class="btn" type="submit">${esc(F.submit)}</button>
            <span class="status" id="rsvp-status" role="status" aria-live="polite"></span>
          </div>
        </form>`,
    },
  };
  return [
    {
      id: 'title', centered: true, range: [0, 0, 0.03, 0.08],
      html: `
        <p class="bengali-title">${esc(c.couple.bengaliTitle)}</p>
        <h1>${names(c.couple.partner1, c.couple.partner2)}</h1>
        <p class="lead">${esc(c.date.display)} · ${esc(c.venue.name)}</p>
        <p class="hint">${esc(c.walk.intro)}</p>
        <a class="skip" href="#rsvp" data-jump="end">${esc(L.jumpToRsvp)}</a>`,
    },
    ...Object.entries(ANCHORS).map(([id, where]) => {
      const sp = special[id] || {};
      return { id, ...where, form: sp.form, html: cardHTML(K[id], { titleHTML: sp.titleHTML }) + (sp.extra || '') };
    }),
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

/** The two buttons under every card: walk on by itself, or jump to the next card (main.js wires them). */
function actionsHTML(next) {
  const L = content.labels;
  return `<div class="card-actions">
      <button class="btn ghost" type="button" data-act="continue">${esc(L.continueWalking)}</button>
      ${next ? `<button class="btn" type="button" data-act="next" data-card="${esc(next)}">${esc(L.nextSection)}</button>` : ''}
    </div>`;
}

export function mountCards(container, sceneApi) {
  installOrnament();
  const cards = buildCards();
  // walk order: each card's next is the one that comes up after it on the walk
  const order = Object.keys(ANCHORS).sort((a, b) => ANCHORS[a].range[0] - ANCHORS[b].range[0]);
  const nextOf = (id) => (id === 'title' ? order[0] : order[order.indexOf(id) + 1]);
  const els = cards.map((c, i) => {
    const el = document.createElement('section');
    el.className = `card ${c.centered ? 'card-centered' : 'card-pinned'} card-${c.id}`;
    // pinned cards: the pin, then a box that carries the greenery draped over the top edge and the
    // scrolling text panel; only the box moves, so the vine can overflow it
    el.innerHTML = c.centered
      ? `<div class="card-inner">${c.html}${actionsHTML(nextOf(c.id))}</div>`
      : `<span class="pin" aria-hidden="true"></span><div class="card-box"><div class="card-vine card-vine-${c.side}" aria-hidden="true">${vineSVG(420, 110, 11 + i * 7)}</div><div class="card-panel"><div class="card-inner">${c.html}</div><i class="card-corner tl"></i><i class="card-corner tr"></i><i class="card-corner br"></i><i class="card-corner bl"></i></div>${actionsHTML(nextOf(c.id))}</div>`;
    el.style.opacity = '0';
    el.style.visibility = 'hidden';
    container.appendChild(el);
    return el;
  });
  const boxes = els.map((el) => el.querySelector('.card-box'));
  const inners = els.map((el) => el.querySelector('.card-inner'));
  const pins = els.map((el) => el.querySelector('.pin'));
  const acts = els.map((el) => (el.querySelector('.card-box') ? el.querySelector('.card-actions') : null));

  const jump = container.querySelector('[data-jump="end"]');
  if (jump) jump.addEventListener('click', (e) => {
    e.preventDefault();
    const walk = document.getElementById('walk');
    window.scrollTo({ top: Math.max(0, walk.offsetHeight - window.innerHeight) }); // the camera eases there on its own
  });
  const form = container.querySelector('#rsvp-form');
  if (form) wireRsvp(form, container.querySelector('#rsvp-status'));

  const navEl = document.getElementById('nav');
  let lastActive = -1;
  return {
    update(progress, over) {
      const exit = 1 - smooth(0, 0.3, over);
      const W = window.innerWidth, H = window.innerHeight;
      const docked = W < 720;
      const navH = navEl && !navEl.hidden ? navEl.offsetHeight : 0;   // the nav bar across the bottom
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
        const cw = inner.offsetWidth, ch = inner.offsetHeight + (acts[i] ? acts[i].offsetHeight + 12 : 0);   // the buttons hang under the card
        let x, y;
        if (docked) {
          x = (W - cw) / 2;
          y = H - ch - navH - 12;
        } else {
          // dock to the screen edge on the card's side so the subject stays visible; the pin marks the spot
          x = c.side === 'left' ? 24 : W - cw - 24;
          y = py - ch * 0.35;
          y = Math.min(Math.max(116, y), H - ch - navH - 16);   // below the HUD buttons, vine included
        }
        boxes[i].style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
      });
    },
  };
}
