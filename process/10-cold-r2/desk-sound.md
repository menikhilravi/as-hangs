# Cold round 2 · desktop 1440×900 with sound (21 runs, 9 with audio, build v2) — condensed

First 10 s: nearly black at 1 s, "a cutaway diorama, the world above and the basement below"; golden hour by 3–4 s, "huge soft
chain shadows"; the sack falls, "a rope comes down out of the empty sky and lowers a little pointed stone tower onto the arch, right
above the sack. That was my 'oh' moment"; the quote at 7–10 s. Felt "calm, hushed, like a museum, slightly melancholy", curious.

Found: click = sack + tower (toggle: click a sack removes it); drag a sack along / off; yank → collapse → ropes, props, rebuild;
six clicks → "a small gothic cathedral crown — the prettiest frame I saw"; clicking the arch acts on the mirrored chain point; a
V-shaped chain → pointed gothic arch ("like discovering why gothic arches are pointed — the best aha").

Delighted: the intro drop ("understood before reading anything, felt clever"); the crown of spires (pride); collapse → pointed arch;
collapses satisfying and forgiving; "at rest the golden-hour light and the giant soft chain shadows are painterly"; physical sounds.

Concrete problems (weight these):
- **ONE change: keep the picture clean while things move — "only beautiful when nothing is happening".** Grain/pixel fizz during
  every interaction (chain dotted noise, jagged bulb, smeared mountains, specks on the wall) until 3–5 s of stillness.
- Idle is completely frozen; **the bulb is the most obviously pushable thing on screen and it is inert.**
- Early clickers (before ~6 s) never get the quote or the demonstration drop (fixed in src since).
- Lifting the chain a little made the arch "burst upward into a floating ring of separated blocks with two blurry orange smudges
  hanging in the air" (energy bug + high dust; fixed/tuned since).
- After a big collapse the camera pulled back and stayed back, showing the cellar's side walls.
- Pillars like glass: a 40 px nudge of the side chain topples a stone column.
- A removed sack's tower left its pointed cap alone on the crown for seconds; rubble left by the right pillar.
- Rebuild clacks evenly spaced and same pitch — "a metronome".
- The quote is small and low contrast. Who is on the ropes? Orange props read as scaffolding only slowly. No hover feedback.
- Loop is short: after ~8 interactions "I had seen it all"; rebuilds 15–30 s ("magic first, then waiting").

Would send: yes, to architecture/physics/design-toy friends — "Hooke's 1675 trick as a toy. Wait 10 seconds before clicking,
then yank the chain hard."
