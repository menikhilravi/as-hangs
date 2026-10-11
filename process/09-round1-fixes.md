# Round 1 → fixes (all three testers understood the mirror within ~10 s; all would send it, with instructions)

What every tester loved: the live mirror while dragging; the crash; the masons' time-lapse; making a Gothic/cathedral shape.
What every tester hit: taps do nothing; long dead time after a crash; turrets look stuck on / float; towers off-screen; sugar-cube
stones; grain; frozen idle; crash too loud; quiet wind inaudible on phones.

Fixes, in order:
A. The verb
  1. Tap bare chain = hang a weight (3). Tap a weight = take it off (its turret comes down at once).
  2. The stone answers the chain's *equilibrium* (computed instantly), not its swinging: turrets start within ~0.3 s, rebuilds
     within ~1.5 s of a crash. Fill the gap with sound (settling rubble, timber going up).
  3. Dragging strains, it doesn't break: a 4-hinge mechanism (a few joints crack open as wedges, segments stay rigid — not a bead
     necklace), creaks and dust. On release the weight is judged; a violent yank still brings it down at once.
  4. A sack grows under the finger as you pull, so the weight is visible before you let go.
  5. Drag a weight to slide it along the chain; drag it off the chain to remove it.
B. Building
  6. Turrets seated on the arch's back: a coursed seat cut to the extrados; no overlaps (a nearby tap adds to the existing weight).
  7. Stones hoisted on ropes (lifted from the rubble, carried, lowered); new stones lowered from above. No floating.
  8. Centering struck straight after the keystone and taken down; leftover rubble hoisted away after a rebuild.
  9. The camera steps back for tall towers.
C. Look: stone that reads as stone (sharper arrises, chips, darker and more varied); workshop hair-crack and top-band line removed,
   hooks visible; shadows not "ski tracks"; mesas shaded; verify no speckle at full res; heavy sack shape.
D. Sound: wind audible on phone speakers; crash under 0.9 peak; rubble and masons' sounds.
E. Idle life without breaking convergence. F. Performance ≥55 fps desktop active, ≥30 phone ×4 CPU.

## Status after the first fix pass (published as Artifact version 2; frozen for round 2 at .snap/cold/r2/page/)
Done: A1 taps (toggle), A2 equilibrium coupling (turrets start in ~0.3 s; crash→rebuild ~8 s total), A3 four-hinge mechanism with
V-cracks while held, collapse continues the mechanism and breaks up (restitution, spin), A4 a sack grows under the finger, A5 slide /
drag off. B6 coursed seats on the extrados, crowded turrets shortened, B7 rope hoisting (lift-carry-lower from rubble, lowered from the
sky when new; ropes drawn by the compositor), B8 centering lowered/struck/lifted on ropes, cleanup of leftover rubble, B9 camera fits
tall towers and hooked side chains. C: raking sun (8.5°, az 112), chipped crisp arrises, more block variety, shaded two-layer mesas,
no hair crack. D: wind audible (pink noise band, gusts, lulls), grind sound for strain, rope creaks. F: half-resolution while moving,
workshop link clusters, cheaper bounce materials, grouped stone tracer.
Added since (src only, after the freeze): dust motes in the lamplight, S-hooks on loose ends + ceiling hook preview + span clamp,
Hooke line for early tappers and after long idle, second-finger guard, 12-sack cap, reused stones reshape in flight.
