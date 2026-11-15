import { content, fill, TOKENS } from './content.js';
import { wireRsvp } from './rsvp.js';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const text = (s) => esc(fill(s, TOKENS));
const link = (url) => url && url !== '#';

/** One card of content.json as a plain article (the same fields cards.js renders in the walk). */
function article(c) {
  const body = c.body == null ? [] : [].concat(c.body);
  const h = content.hotel;
  return `
    <article class="event">
      ${c.kicker ? `<p class="kicker">${text(c.kicker)}</p>` : ''}
      <h3>${text(c.title)}</h3>
      ${c.when || c.place ? `<div class="meta">${c.when ? `<span><b>${text(c.when)}</b></span>` : ''}${c.place ? `<span>${text(c.place)}</span>` : ''}</div>` : ''}
      ${c.dress ? `<span class="dress">${text(c.dress)}</span>` : ''}
      ${c.hotel && h ? `<p><b>${esc(h.name)}</b><br>${esc(h.address)}${link(h.mapUrl) ? ` · <a href="${esc(h.mapUrl)}" target="_blank" rel="noopener">${esc(content.labels.openInMaps)}</a>` : ''}</p>` : ''}
      ${body.map((p) => `<p>${text(p)}</p>`).join('')}
      ${c.items ? `<ul class="items">${c.items.map((it) => `<li><b>${link(it.url) ? `<a href="${esc(it.url)}" target="_blank" rel="noopener">${text(it.name)}</a>` : text(it.name)}</b> ${text(it.text)}</li>`).join('')}</ul>` : ''}
      ${c.button && link(c.button.url) ? `<p><a href="${esc(c.button.url)}" target="_blank" rel="noopener">${text(c.button.label)}</a></p>` : ''}
    </article>`;
}

export function renderSections(main) {
  const c = content;
  const K = c.cards;
  const L = c.labels;
  const F = L.form;
  const group = (id, g) => `
    <section class="section" id="${id}">
      <div class="section-head">
        <h2>${esc(g.heading)}</h2>
      </div>
      <div class="events">
        ${g.cards.map((k) => article(K[k])).join('')}
      </div>
    </section>`;
  main.innerHTML = `
    <section class="section" id="story">
      <div class="section-head">
        <p class="kicker">${esc(c.couple.hashtag)}</p>
        <h2>${esc(c.story.heading)}</h2>
        <p>${esc(c.story.intro)}</p>
      </div>
      <ol class="timeline">
        ${c.story.timeline.map((t) => `
          <li>
            <p class="when">${esc(t.when)}</p>
            <h3>${esc(t.title)}</h3>
            <p>${esc(t.text)}</p>
          </li>`).join('')}
      </ol>
    </section>

    <section class="section" id="venue">
      <div class="venue-card">
        <div>
          <h3>${esc(c.venue.name)}</h3>
          <p>${esc(c.venue.address)}</p>
        </div>
        <a class="btn ghost" href="${esc(c.venue.mapUrl)}" target="_blank" rel="noopener">${esc(L.openInMaps)}</a>
      </div>
    </section>

    ${group('before', c.walk.before)}
    ${group('day', c.walk.day)}

    <section class="section" id="rsvp">
      <div class="section-head">
        <p class="kicker">${esc(fill(L.replyBy, { deadline: c.rsvp.deadline }))}</p>
        <h2>${esc(c.rsvp.heading)}</h2>
        <p>${esc(c.rsvp.intro)}</p>
      </div>
      <form class="rsvp-form" id="rsvp-form" name="rsvp" method="POST" action="/__forms.html" data-netlify="true" netlify-honeypot="bot-field">
          <input type="hidden" name="form-name" value="rsvp" />
          <p hidden><label>Leave this empty <input name="bot-field" autocomplete="off" tabindex="-1" /></label></p>
        <label>${esc(F.name)} <input name="name" type="text" autocomplete="name" required /></label>
        <div class="row">
          <label>${esc(F.email)} <input name="email" type="email" autocomplete="email" /></label>
          <label>${esc(F.guestsLong)} <input name="guests" type="number" min="1" max="10" value="1" /></label>
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
        ${c.rsvp.events && c.rsvp.events.length ? `
        <label>${esc(F.whichEvents)}
          <select name="events" multiple size="${Math.min(5, c.rsvp.events.length)}">
            ${c.rsvp.events.map((e) => `<option value="${esc(e)}" selected>${esc(e)}</option>`).join('')}
          </select>
        </label>` : ''}
        <label>${esc(F.notes)} <textarea name="notes" rows="3" placeholder="${esc(F.notesHint)}"></textarea></label>
        <div class="actions">
          <button class="btn" type="submit">${esc(F.submit)}</button>
          <span class="status" id="rsvp-status" role="status" aria-live="polite"></span>
        </div>
      </form>
    </section>
  `;

  const footer = document.createElement('footer');
  footer.className = 'site-footer';
  footer.innerHTML = `
    <div class="ornament">✦</div>
    <p class="names">${esc(c.couple.partner1)} <span class="amp">&amp;</span> ${esc(c.couple.partner2)}</p>
    <p class="tag">${esc(c.date.display)}</p>
    <p>${esc(c.footer.line)}</p>
  `;
  main.after(footer);

  wireRsvp(main.querySelector('#rsvp-form'), main.querySelector('#rsvp-status'));
}
