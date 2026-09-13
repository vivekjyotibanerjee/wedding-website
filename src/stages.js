import { content } from './content.js';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const names = (a, b) => `${esc(a)} <span class="amp">&amp;</span> ${esc(b)}`;

// Each stage: [fadeInStart, fadeInEnd, fadeOutStart, fadeOutEnd] in walk progress (0–1).
function buildStages() {
  const c = content;
  const w = c.walk;
  return [
    {
      id: 'title', range: [0, 0, 0.05, 0.12], cls: '',
      html: `
        <p class="bengali-title">${esc(c.couple.bengaliTitle)}</p>
        <h1>${names(c.couple.partner1, c.couple.partner2)}</h1>
        <p>${esc(c.date.display)}</p>
        <p class="hint">${esc(w.intro)}</p>
        <a class="skip" href="#details">Skip to details</a>`,
    },
    {
      id: 'gate', range: [0.17, 0.23, 0.30, 0.36], cls: 'stage-bottom',
      html: `
        <p class="kicker">${esc(w.gate.kicker)}</p>
        <h2>${w.gate.title === `${c.couple.partner1} & ${c.couple.partner2}` ? names(c.couple.partner1, c.couple.partner2) : esc(w.gate.title)}</h2>
        <p>${esc(w.gate.body)}</p>`,
    },
    {
      id: 'courtyard', range: [0.40, 0.46, 0.53, 0.58], cls: 'stage-top',
      html: `
        <p class="kicker">${esc(w.courtyard.kicker)}</p>
        <h2>${esc(w.courtyard.title)}</h2>
        <p>${esc(w.courtyard.body)}</p>`,
    },
    {
      id: 'shrine', range: [0.60, 0.66, 0.72, 0.78], cls: 'stage-bottom',
      html: `
        <p class="kicker">${esc(w.shrine.kicker)}</p>
        <h2>${esc(w.shrine.title)}</h2>
        <p>${esc(w.shrine.body)}</p>`,
    },
    {
      id: 'sanctum', range: [0.88, 0.94, 1.2, 1.3], cls: 'stage-bottom',
      html: `
        <p class="kicker bengali">${esc(w.sanctum.kicker)}</p>
        <h2>${esc(w.sanctum.title)}</h2>
        <p>${esc(w.sanctum.body)}</p>`,
    },
  ];
}

function smooth(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / Math.max(1e-6, b - a)));
  return t * t * (3 - 2 * t);
}

export function mountStages(container) {
  const stages = buildStages();
  const els = stages.map((s) => {
    const el = document.createElement('section');
    el.className = `stage ${s.cls}`;
    el.dataset.stage = s.id;
    el.innerHTML = `<div class="stage-inner">${s.html}</div>`;
    container.appendChild(el);
    return el;
  });

  let lastActive = -1;
  return {
    // `progress` is the smoothed walk progress (0–1); `over` is how far past the end of the
    // walk we've scrolled, in viewport heights — the details section slides up over that span.
    update(progress, over) {
      const exit = 1 - smooth(0, 0.3, over);
      stages.forEach((s, i) => {
        const [a, b, c, d] = s.range;
        let o = i === 0 && progress <= 0 ? 1 : smooth(a, b, progress) * (1 - smooth(c, d, progress));
        o *= exit;
        const el = els[i];
        el.style.opacity = o.toFixed(3);
        const shift = (1 - o) * 18;
        el.style.transform = `translateY(${shift.toFixed(2)}px)`;
        el.style.visibility = o < 0.01 ? 'hidden' : 'visible';
        if (o > 0.5 && lastActive !== i) { lastActive = i; el.setAttribute('aria-hidden', 'false'); }
        else if (o <= 0.5) el.setAttribute('aria-hidden', 'true');
      });
    },
  };
}
