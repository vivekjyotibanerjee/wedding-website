import { content, fill } from './content.js';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function renderSections(main) {
  const c = content;
  const L = c.labels;
  const F = L.form;
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

    <section class="section" id="events">
      <div class="section-head">
        <p class="kicker">${esc(L.scheduleKicker)}</p>
        <h2>${esc(c.events.heading)}</h2>
        <p>${esc(c.events.intro)}</p>
      </div>
      <div class="events">
        ${c.events.list.map((e) => `
          <article class="event">
            <h3>${esc(e.name)}</h3>
            <div class="meta">
              <span><b>${esc(e.date)}</b> · ${esc(e.time)}</span>
              <span>${esc(e.place)}</span>
            </div>
            ${e.dress ? `<span class="dress">${esc(e.dress)}</span>` : ''}
            ${e.note ? `<p>${esc(e.note)}</p>` : ''}
          </article>`).join('')}
      </div>
    </section>

    <section class="section" id="travel">
      <div class="section-head">
        <p class="kicker">${esc(L.travelKicker)}</p>
        <h2>${esc(c.travel.heading)}</h2>
        <p>${esc(c.travel.intro)}</p>
      </div>
      <div class="venue-card">
        <div>
          <h3>${esc(c.venue.name)}</h3>
          <p>${esc(c.venue.address)}</p>
        </div>
        <a class="btn ghost" href="${esc(c.venue.mapUrl)}" target="_blank" rel="noopener">${esc(L.openInMaps)}</a>
      </div>
      <div class="travel-grid">
        <div>
          <p class="col-title">${esc(L.gettingThere)}</p>
          ${c.travel.gettingThere.map((g) => `<div class="item"><h3>${esc(g.title)}</h3><p>${esc(g.text)}</p></div>`).join('')}
        </div>
        <div>
          <p class="col-title">${esc(L.whereToStay)}</p>
          ${c.travel.hotels.map((h) => `<div class="item"><h3>${h.url && h.url !== '#' ? `<a href="${esc(h.url)}" target="_blank" rel="noopener">${esc(h.name)}</a>` : esc(h.name)}</h3><p>${esc(h.text)}</p></div>`).join('')}
        </div>
      </div>
    </section>

    <section class="section" id="rsvp">
      <div class="section-head">
        <p class="kicker">${esc(fill(L.replyBy, { deadline: c.rsvp.deadline }))}</p>
        <h2>${esc(c.rsvp.heading)}</h2>
        <p>${esc(c.rsvp.intro)}</p>
      </div>
      <form class="rsvp-form" id="rsvp-form" novalidate>
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
        <label>${esc(F.whichEvents)}
          <select name="events" multiple size="${Math.min(5, c.events.list.length)}">
            ${c.events.list.map((e) => `<option value="${esc(e.name)}" selected>${esc(e.name)}</option>`).join('')}
          </select>
        </label>
        <label>${esc(F.notes)} <textarea name="notes" rows="3" placeholder="${esc(F.notesHint)}"></textarea></label>
        <div class="actions">
          <button class="btn" type="submit">${esc(F.submit)}</button>
          <span class="status" id="rsvp-status"></span>
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

function wireRsvp(form, status) {
  const F = content.labels.form;
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const data = new FormData(form);
    const name = (data.get('name') || '').toString().trim();
    if (!name) { status.textContent = F.needName; form.name.focus(); return; }
    const events = data.getAll('events').join(', ');
    const lines = [
      `Name: ${name}`,
      `Email: ${data.get('email') || '-'}`,
      `Guests: ${data.get('guests') || 1}`,
      `Attending: ${data.get('attending')}`,
      `Events: ${events || '-'}`,
      `Notes: ${data.get('notes') || '-'}`,
    ];
    const endpoint = content.rsvp.formEndpoint;
    if (endpoint) {
      status.textContent = F.sending;
      try {
        const res = await fetch(endpoint, { method: 'POST', headers: { Accept: 'application/json' }, body: data });
        if (!res.ok) throw new Error(String(res.status));
        status.textContent = F.sent;
        form.reset();
      } catch (e) {
        status.textContent = F.failed;
      }
      return;
    }
    const subject = encodeURIComponent(fill(F.subject, { name }));
    const body = encodeURIComponent(lines.join('\n'));
    window.location.href = `mailto:${content.rsvp.email}?subject=${subject}&body=${body}`;
    status.textContent = F.openingMail;
  });
}
