import { content } from './content.js';

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
    if (!form.reportValidity()) return;
    data.set('name', name);
    // Preserve every selected event as one readable submission field.
    if (data.has('events')) data.set('events', data.getAll('events').join(', '));
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
