// ─────────────────────────────────────────────────────────────
//  Everything guests read lives in ../content.json — edit that,
//  not this file. This just loads it, fills in the optional
//  `labels` block and fails loudly if a required section is gone.
//  (README, "Put your details in", documents every field.)
// ─────────────────────────────────────────────────────────────
import raw from '../content.json';

const DEFAULT_LABELS = {
  jumpToRsvp: 'Jump to RSVP',
  scheduleKicker: 'Schedule',
  travelKicker: 'Getting here',
  gettingThere: 'Getting there',
  whereToStay: 'Where to stay',
  openInMaps: 'Open in maps',
  replyBy: 'Reply by {deadline}',
  form: {
    name: 'Your name',
    email: 'Email',
    guests: 'Guests',
    guestsLong: 'Guests (including you)',
    attending: 'Will you join us?',
    accepts: 'Joyfully accepts',
    declines: 'Regretfully declines',
    whichEvents: 'Which events?',
    notes: 'Anything we should know?',
    notesHint: 'Dietary needs, a song request…',
    submit: 'Send RSVP',
    subject: 'RSVP — {name}',
    needName: 'Please tell us your name.',
    sending: 'Sending…',
    sent: 'Thank you — we have your reply!',
    failed: 'Something went wrong. Please email us instead.',
    openingMail: 'Opening your email app…',
  },
};

for (const key of ['couple', 'date', 'venue', 'walk', 'story', 'events', 'travel', 'rsvp', 'footer']) {
  if (!raw[key]) throw new Error(`content.json is missing the "${key}" section`);
}

export const content = {
  ...raw,
  site: {
    title: `${raw.couple.partner1} & ${raw.couple.partner2} — Wedding`,
    description: '',
    ...(raw.site || {}),
  },
  labels: {
    ...DEFAULT_LABELS,
    ...(raw.labels || {}),
    form: { ...DEFAULT_LABELS.form, ...((raw.labels && raw.labels.form) || {}) },
  },
};

/** Replace `{key}` tokens in a content string, e.g. fill('{names} invite you', { names: 'A and B' }). */
export const fill = (s, vars) => String(s).replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m));
