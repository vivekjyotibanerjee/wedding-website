// ─────────────────────────────────────────────────────────────
//  Everything guests read lives in ../content.json — edit that,
//  not this file. This just loads it, fills in the optional
//  `labels` block and fails loudly if a required section is gone.
//  (README, "Put your details in", documents every field.)
// ─────────────────────────────────────────────────────────────
import raw from '../content.json';

const DEFAULT_LABELS = {
  jumpToRsvp: 'Jump to RSVP',
  continueWalking: 'Continue walking',
  nextSection: 'Jump to next section',
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
    shuttle: 'Round-trip shuttle (hotel ↔ venue)?',
    shuttleNo: 'No shuttle needed',
    shuttleSangeet: 'Sangeet only',
    shuttleWedding: 'Wedding only',
    shuttleBoth: 'Both days',
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

for (const key of ['couple', 'date', 'venue', 'walk', 'cards', 'story', 'rsvp', 'footer']) {
  if (!raw[key]) throw new Error(`content.json is missing the "${key}" section`);
}
for (const id of ['gate', 'story', 'rsvp', ...raw.walk.before.cards, ...raw.walk.day.cards]) {
  if (!raw.cards[id]) throw new Error(`content.json is missing the "${id}" card`);
}

for (const n of raw.nav || []) {
  if (!raw.cards[n.card]) throw new Error(`content.json: nav item "${n.label}" points at a missing card "${n.card}"`);
}

export const content = {
  ...raw,
  nav: raw.nav || [],
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

/** The tokens any card text may use: {names}, {hashtag}, {date}, {time}, {venue}. */
export const TOKENS = {
  names: `${raw.couple.partner1} and ${raw.couple.partner2}`,
  hashtag: raw.couple.hashtag,
  date: raw.date.display,
  time: raw.date.time,
  venue: raw.venue.name,
};
