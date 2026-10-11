# Cold round 2 · phone with sound (19 runs, 12 with audio, build v2) — condensed

First 10 s: near black, then a dusk salt flat; the cellar's "two big blurry dark streaks" read as smoke or ink until recognised as
shadows; the sack drops at ~2.5 s, "a stack of stones comes down on a rope from the sky and lands as a little tower directly above the
sack"; the caption at ~5.5 s. Felt "calm, slightly reverent, like a museum at dusk", then wanted to pull the chain.

Found: tap = sack + tower; drag a sack = it moves, the old tower topples, a new one is lowered; tapping the arch acts on the mirrored
chain point; tapping a tower removes it and its sack; pulls make heavy sacks → collapse → ropes, centering, keystone, props removed,
tower back; dragging the crown up makes a pointed Gothic arch with a spire ("the inverted chain matches the arch exactly").

Delighted: the intro link ("oh, they're linked"); tapping the arch puts a weight on the chain; **"I just designed a cathedral"**;
rebuild craft ("respect for the detail"); towers toppling when a sack moves ("small slapstick"); the sound fits (wind bed, clinks,
thuds, crash with grinding, clacks, no music).

Concrete problems (weight these):
- **BUG: rubble wedged between an arch foot and its pillar twitches forever and the audio stays a loud constant rumble/crunch
  (15–30× ambient) — 3 of 6 tower falls.** (Root cause found: restitution read velocities after other contacts' warm starts →
  energy injection; fixed. Also needs per-stone freezing and a sound rate limit.)
- **Their ONE change: while dragging, show the flipped chain in the sky as a faint ghost of the arch I'm about to get.** (Built.)
- Heavy pixelation during almost any action (shared machine, but still).
- Collapses look like explosions (blocks flung above the arch). Ghosting: blocks and props fade semi-transparently during
  rebuild/cleanup; ropes hang from an empty sky.
- Tap vs drag mismatch: taps never change the curve; a tiny drag (16 px held 1.5 s) made a huge sack and a spire twice the arch's
  height; "I couldn't work out what controls how heavy it gets".
- Shadows: smudgy diagonal streaks; a heavy sack's shadow is a black ball in mid-cellar ("I thought it was a hole").
- Bunched sacks look like grapes. Side chains don't hook onto the main chain (expected buttress); they only topple their pillars.
- Long press does nothing; no reset/undo; idle is static; every heavy change costs a 20–25 s rebuild.

Would send: yes — "Pull the chain down in the middle, then wait 20 seconds. You just designed a Gothic arch."
