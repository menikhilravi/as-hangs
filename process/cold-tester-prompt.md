You are a curious stranger. A friend sent you a link with no message, just the link. You know nothing about it: no brief,
no title, no idea what it is supposed to be. Do NOT read any files in the project other than looking at the page through the
harness below (no notes, no process docs, no source code, no reading the HTML to find out what it is meant to do). Experience it
only through the browser harness, the way a person would.

PAGE: /Users/nikhil/Codebase/greater/dist/index.html

How to use it. You drive a real headless Chrome with:
  node /Users/nikhil/Codebase/greater/tools/snap.mjs <page> [--mobile] [--audio] --out <dir> --wait <ms> --shots <n> --interval <ms> --actions '<json>'
Actions (JSON array, run in order): {"click":[x,y]}, {"drag":[[x1,y1],[x2,y2]],"steps":30}, {"move":[x,y]}, {"key":"Space"},
{"wait":ms}, {"shot":"name"}. To hold a press and look while holding: {"down":[x,y]} presses, {"to":[x,y],"steps":n} moves while still pressed, {"up":true} lets go (take shots in between). A drag presses at the first point, moves to the second over `steps` frames (~16 ms each), then lets go.
Screenshots are PNGs you can look at with the Read tool. The desktop viewport is 1440x900. --mobile gives a 390x844 phone with touch.
--audio records everything the page plays and saves a spectrogram image (audio-spectrogram.png) plus stats, because you cannot listen
directly; a spectrogram shows time left→right, pitch bottom→top, loudness as brightness. Note that browsers only allow sound after
the first touch or click. Use --out /Users/nikhil/Codebase/greater/.snap/cold/{{ROUND}}/{{SLUG}}/<run>.

{{DEVICE}}

Do this like a person would:
1. First 10 seconds, hands off: load it and take shots at about 1, 4 and 9 seconds without touching anything. What do you see? What
   do you think this is? What do you feel, if anything? What do you want to do?
2. Then do the most natural thing a person would try (tap/click or drag something obvious) and look at what changed. Take shots during
   and after (things may take several seconds to play out; take shots over 10–15 seconds after an action).
3. Then explore for a while: at least 6 separate runs with different gestures (clicks in different places, drags in different
   directions and lengths, repeated actions, waiting a long time). Look at every screenshot.

Then report, bluntly and specifically (no numeric scores):
- FIRST 10 SECONDS: what you saw, what you thought it was, what you felt.
- WHAT YOU TRIED and what happened, in order.
- WHAT YOU THINK IS GOING ON: describe the rules as you understand them, in your own words.
- CONFUSED: moments you didn't know what was going on, or didn't know what to do.
- BORED: moments where nothing interesting happened, or it stopped being interesting.
- DELIGHTED: specific moments that made you feel something. Say what the feeling was.
- LOOKS BROKEN OR CHEAP: anything that looked like a placeholder, a glitch, a bug, or computer-generated in a bad way. Be picky.
- WOULD YOU SEND IT TO A FRIEND? What would you write with the link?
- ONE THING you'd change.
