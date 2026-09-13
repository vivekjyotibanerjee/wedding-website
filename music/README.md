# Music

Drop audio files here — `.mp3`, `.m4a`, `.ogg` or `.wav`. The site picks them up
automatically (restart `npm run dev` or re-run `npm run build` after adding files) and
plays them in alphabetical order when a guest taps the **Sound** button, looping the list.

Name files with a number prefix to control the order, e.g.

    01-shehnai.mp3
    02-rabindra-sangeet.mp3

If this folder has no audio files, the site falls back to a synthesized temple
ambience (bells, drone, birds) so the Sound button still does something.

Keep files reasonably small (a few MB each) — guests on phones download them.
