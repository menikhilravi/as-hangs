# Round 4 → fixes (phone muted + desktop with sound on v4; expert r3 pending at time of writing)

Both testers would send it (each with a hint). Strongest new evidence: the dusk ("genuinely poetic"), the Gothic discovery ("a
builder's secret"), the rebuild ("the world repairs itself"), the line understood without explanation by both.

What they asked for, and what was done (src, for v5):
- Phone: "make the payoff findable" → (1) **press and hold fills a sack with shot** (a still press for 0.55 s on bare chain hangs a
  sack and fills it; on a sack, fills that sack; a trickle of shot sounds while it pours; it stops when the stone gives way);
  (2) **the untouched intro continues**: at ~16 s, if nobody has touched it, shot pours into the first sack until the arch gives way
  and is rebuilt in the new shape — the whole verb shown once.
- Desktop: "make holding a real preview" → while a hand holds the chain the stone only strains (cracks open, line goes red); it is
  judged when the hand lets go; dragging back breaks nothing. (Filling is not a preview: it is weight.)
- "Weight size from pulling inconsistent" → the sack's weight now follows how far down the finger has pulled (in the sky: how far up).
- "The side hooks look like places to hang a weight" → they are: tap a loose end's hook to hang a sack; the column above gets a
  capital and a finial that grows with the weight. A sack carried off its chain hangs on whatever chain or hook it is let go over.
- "Image goes low-res whenever a finger is down" (phone) → on small screens the stone never drops resolution; the room keeps 0.8×.
- Debris lingering 10–20 s → cleanup runs during turret builds too, sooner (1.5 s) and faster (0.2 s per stone); centering is all
  lifted clear before a build counts as done (no pop).
- "Pink streak reads as a rendering seam" → at rest the line is drawn dotted (an annotation); solid under a hand.
- Stubby turrets at the springing → taps near a hook hang their sack five links in.
- Zoom smearing (found in testing): sky/plain history kept across a zoom → history dropped while the camera moves.
- The cellar window dims with the sunset (both halves share the evening). Credit line contrast up.
Also since v4: per-block stone character (clean / bedded / shelly / iron-stained), darker recessed joints, no stamped margins;
high cirrus lit by the low sun with an afterglow after sunset; sacks with creases and a tied cord; geometry fuzz test (found and
fixed inside-out voussoirs at sharp apexes); soak test (3 min random input: 0 errors, rubble cleared, heap 37 MB).

## v6 and v7 (published; round 5 runs on the v6 freeze at .snap/cold/r5/page)
v6: a weight moved → the masons carry its turret's own stones to the new place on ropes; a weight removed → the turret is taken down
stone by stone (no toppling); a weight filled heavier → its turret is raised; held stones fall if their structure collapses; drag
release judges the stone on the chain as it now hangs (a reverted drag can't break it); iOS audio unlock (touchend/click + a silent
buffer); the bulb hum panned toward the bulb.
v7: expert r3 found a flood of WebGL performance warnings during dusk (an async readback of the sky; Chrome warned on every cycle
however the readback was sequenced). Replaced by measuring the evening's sky light once at load (24 small skies, read synchronously
before the first frame) and interpolating by sun height — no readbacks at runtime, 0 warnings over a full dusk and sunrise. Chain
damping loosened slightly so a landed sack sets the chain swaying for 2–3 s.
After v7 (src): a strained-but-standing arch (2–3 open hinges after a weight is moved) no longer sits looking broken — left alone
its cracks only just show, and if it stays badly strained for 2.5 s it gives way and is rebuilt in the chain's new shape (found in a
round-5 phone run, "stuck"); turrets stand on a projecting level plinth (expert: "no level seat").

## v8 (published; after round 5's testers)
- Round 5 phone's ONE change ("never let the arch freeze half-broken") → a badly strained arch gives way within 2.5 s and is rebuilt.
- Round 5 desktop's ONE change ("make hold = heavier readable before the arch fails") → once failing, the arch opens fully at its
  hinges with grinding and dust for 0.85 s before it goes; sacks swell more visibly with weight (size ∝ m^0.38); a fill turns into a
  slide if the finger moves more than 14 px.
- Turrets stand on a projecting level plinth; side chains hook only outward (no arch through an arch); the resting line fades a few
  seconds after the hands do (two r5 testers read the always-on line as "a pink seam").
- (Tried and reverted: broader turrets for heavy loads — the fuzz test caught overlaps and broken "raise" prefixes.)

## v9 (published, final; after expert r4)
- Expert r4's one real break: holding to fill (or pulling slowly) left the chain looking frozen and the growing sack as a see-through
  double image while the arch fell. Cause: the cellar is only redrawn when a chain moves faster than a threshold, and a slow fill or a
  slow hand stays under it, so the old image was kept and blended. Now a chain held by a moving hand, a sack being filled, and an
  active pull all count as motion. Checked frame by frame on both screens: the sack swells and the chain sags with no ghost.
- Joints narrowed from 0.03 to 0.016 m (the expert saw sky-coloured hairlines through the crown joints); they now read as dark seams.
- Final checks on the built page: 0 errors on desktop and phone (tap → fill → crack → collapse → rope cleanup → rebuild, and a pull
  that is dragged back); 390×844 at 4× CPU slowdown held 60 fps through that whole sequence; 1440×900 averaged 58 fps through a pull
  run (33 through a collapse run while macOS's mediaanalysisd was taking 1.6 cores — measured, not hidden); geometry fuzz 0 bad
  blocks, physics tests unchanged.
