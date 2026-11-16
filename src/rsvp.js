import { content } from './content.js';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/**
 * One yes/no question per event (`content.json` `rsvp.events`: `field` is the name the answer is
 * saved under — it must also be in public/__forms.html for Netlify — `label` and `when` are shown).
 * Both RSVP layouts (the card and the fallback page) use it.
 */
export function eventsFieldsHTML() {
  const F = content.labels.form;
  return `<fieldset class="rsvp-events">
      <legend>${esc(F.attending)}</legend>
      ${content.rsvp.events.map((e) => `<div class="rsvp-event" role="radiogroup" aria-label="${esc(e.label)}">
        <span class="rsvp-event-name">${esc(e.label)}${e.when ? `<small>${esc(e.when)}</small>` : ''}</span>
        <span class="rsvp-choice">
          <label><input type="radio" name="${esc(e.field)}" value="${esc(F.willAttend)}" required /><span>${esc(F.willAttend)}</span></label>
          <label><input type="radio" name="${esc(e.field)}" value="${esc(F.cantAttend)}" /><span>${esc(F.cantAttend)}</span></label>
        </span>
      </div>`).join('')}
    </fieldset>`;
}

/** Save both RSVP layouts through the same Netlify Forms backend. */
export function wireRsvp(form, status) {
  const F = content.labels.form;
  // The acknowledgement that takes the form's place once a reply is saved (both layouts).
  const thanks = document.createElement('div');
  thanks.className = 'rsvp-thanks';
  thanks.hidden = true;
  thanks.setAttribute('role', 'status');
  thanks.tabIndex = -1;
  thanks.innerHTML = `<span class="rsvp-thanks-mark" aria-hidden="true">✦</span><h3></h3><p></p><button class="rsvp-again" type="button"></button>`;
  thanks.querySelector('h3').textContent = F.thanksTitle;
  thanks.querySelector('p').textContent = F.thanks;
  thanks.querySelector('button').textContent = F.another;
  form.after(thanks);
  thanks.querySelector('button').addEventListener('click', () => {
    thanks.hidden = true;
    form.hidden = false;
    status.textContent = '';
    form.elements.namedItem('name').focus();
  });
  const button = form.querySelector('button[type="submit"]');
  let pending = false;
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (pending) return;
    const data = new FormData(form);
    const name = String(data.get('name') || '').trim();
    if (!name) {
      status.textContent = F.needName;
      form.elements.namedItem('name').focus();
      return;
    }
    const unanswered = content.rsvp.events.find((e) => !data.get(e.field));
    if (unanswered) {
      status.textContent = F.pickEach;
      form.querySelector(`input[name="${unanswered.field}"]`).focus();
      return;
    }
    if (!form.reportValidity()) return;
    data.set('name', name);
    // Two summary fields for the submissions list: the events they're coming to, and accepts/declines overall.
    const coming = content.rsvp.events.filter((e) => data.get(e.field) === F.willAttend).map((e) => e.label);
    data.set('events', coming.join(', ') || '—');
    data.set('attending', coming.length ? F.accepts : F.declines);
    pending = true;
    button.disabled = true;
    form.setAttribute('aria-busy', 'true');
    status.textContent = F.sending;
    try {
      const response = await fetch('/__forms.html', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(data).toString(),
      });
      if (!response.ok) throw new Error(`RSVP submission failed: ${response.status}`);
      form.reset();
      status.textContent = '';
      form.hidden = true;
      thanks.hidden = false;
      thanks.focus({ preventScroll: true });
      thanks.scrollIntoView({ block: 'nearest' });
    } catch {
      status.textContent = F.failed;
    } finally {
      pending = false;
      button.disabled = false;
      form.removeAttribute('aria-busy');
    }
  });
}
