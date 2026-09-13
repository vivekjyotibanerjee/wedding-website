// ─────────────────────────────────────────────────────────────
//  EDIT THIS FILE — everything guests read lives here.
//  Names/dates below are obvious placeholders; replace them.
// ─────────────────────────────────────────────────────────────

export const content = {
  couple: {
    partner1: 'Ananya',
    partner2: 'Arjun',
    // Short Bengali blessing shown on the title screen (Shubho Bibaho = "auspicious wedding")
    bengaliTitle: 'শুভ বিবাহ',
    hashtag: '#AnanyaWedsArjun',
  },

  // Main ceremony
  date: {
    display: 'Saturday, 13 February 2027',
    iso: '2027-02-13',
    time: '6:30 PM onwards',
  },

  venue: {
    name: 'Rajbari Heritage Grounds',
    address: 'Placeholder Road, Kolkata 700001, West Bengal',
    mapUrl: 'https://maps.google.com/?q=Kolkata',
  },

  // Short lines shown on the cards pinned to places in the temple complex.
  walk: {
    intro: 'Scroll to walk in',
    gate: {
      kicker: 'You are invited',
      body: 'Together with their families, {names} request the honour of your presence as they are joined in marriage at Dakshineswar.',
    },
    ceremony: {
      kicker: 'The mandap',
      title: 'The wedding ceremony',
      body: 'Bor jatri arrives at 6. Shubho drishti — the first look — around 8, then the saat paak, the seven rounds around the fire.',
      dress: 'Traditional — saris, panjabis, lots of colour',
    },
    sanctum: {
      kicker: 'শুভ দৃষ্টি',
      title: 'Will you join us?',
    },
  },

  story: {
    heading: 'Our story',
    intro: 'A few of the moments that brought us here.',
    timeline: [
      { when: 'Autumn 2018', title: 'First hello', text: 'A shared umbrella outside College Street, and a cup of cha that went cold because nobody stopped talking.' },
      { when: 'Winter 2019', title: 'The long walk', text: 'From Prinsep Ghat to Millennium Park and back, twice, because neither wanted to say goodnight.' },
      { when: 'Spring 2022', title: 'Two cities, one calendar', text: 'Bangalore and Kolkata, weekend flights, and a shared spreadsheet of every trip.' },
      { when: 'Monsoon 2025', title: 'Yes', text: 'On the terrace, under a very wet sky, with a ring that had been hiding in a sock drawer for three months.' },
    ],
  },

  events: {
    heading: 'Events',
    intro: 'Three days of celebration in the courtyard and by the river. Come to all, or to whichever you can.',
    list: [
      { name: 'Aiburo Bhaat', date: 'Thu, 11 Feb 2027', time: '12:00 PM', place: 'Family home, Ballygunge', dress: 'Comfortable, colourful', note: 'A last unmarried feast — lots of food, lots of teasing.' },
      { name: 'Gaye Holud', date: 'Fri, 12 Feb 2027', time: '10:00 AM', place: 'Rajbari Heritage Grounds', dress: 'Yellows and whites', note: 'Turmeric, laughter and a fair amount of getting messy.' },
      { name: 'Sangeet', date: 'Fri, 12 Feb 2027', time: '7:00 PM', place: 'Rajbari Heritage Grounds — Lawn', dress: 'Festive', note: 'Dance floor opens at 8. No excuses.' },
      { name: 'Wedding Ceremony', date: 'Sat, 13 Feb 2027', time: '6:30 PM', place: 'Rajbari Heritage Grounds — Mandap', dress: 'Traditional', note: 'Bor jatri arrives at 6. Shubho drishti around 8.' },
      { name: 'Reception', date: 'Sun, 14 Feb 2027', time: '7:30 PM', place: 'Rajbari Heritage Grounds — Ballroom', dress: 'Cocktail / Indian formal', note: 'Dinner, speeches, and one more dance.' },
    ],
  },

  travel: {
    heading: 'Travel & stay',
    intro: 'Everything you need to get here and rest well.',
    gettingThere: [
      { title: 'By air', text: 'Fly into Netaji Subhas Chandra Bose International Airport (CCU). The venue is about 45 minutes by cab.' },
      { title: 'By train', text: 'Howrah and Sealdah are both around 30 minutes away. Pre-paid taxis are available at the station.' },
      { title: 'Getting around', text: 'Uber and Ola work well. Yellow taxis are charming but negotiate the fare first.' },
    ],
    hotels: [
      { name: 'The Placeholder Grand', text: 'Closest to the venue, 5 minutes. Mention the wedding for a group rate.', url: '#' },
      { name: 'Hotel Ganga View', text: 'Mid-range, by the river, 15 minutes away.', url: '#' },
      { name: 'Guest house at the venue', text: 'Limited rooms for family. Ask us if you need one.', url: '#' },
    ],
  },

  rsvp: {
    heading: 'RSVP',
    intro: 'Please let us know by 15 January 2027.',
    // Option A: leave formEndpoint empty → the form opens the guest's email app with a pre-filled message to `email`.
    // Option B: set formEndpoint to a form service URL (e.g. a Formspree/Basin/Getform endpoint) → the form POSTs there.
    email: 'hello@example.com',
    formEndpoint: '',
    deadline: '15 January 2027',
  },

  footer: {
    line: 'Made with love, terracotta and a little bit of JavaScript.',
  },
};
