# Harsh expert pass r3 (21 runs, build v4, a fresh agent) — condensed

VERDICT: "Good. The idea is clever and the mirror is exact … but the stone looks like a toy, the construction is a puppet show, and
the key concept is never explained." Verified the mirror itself by overlaying the flipped cellar on the sky: exact.

Real: dithered golden sky; haze, long raking shadows and cracked-mud foreground; the sunset ("cream to pink alpenglow to a grey
silhouette … reads like a time-lapse photo"); **"the cellar is the best part"** (enlarged chain shadows whose blur grows with distance,
dust motes, dull iron highlights); the collapse ("real rigid-body physics … breaks at hinges, the crown falls as one piece, the legs
topple about their feet"); landing sounds synced and panned; sound "plausible and well synced"; the interaction "meaningful: Hooke's
hanging chain, Gaudí's weighted-string model, and the textbook masonry rule, made literal"; the eight-bag "cathedral".

Five things:
1. Stone doesn't sell monument masonry (same cream, same speckled inset panel, clean edges; no mortar depth) → per-stone variation,
   chipped edges, recessed shaded joints, stronger sun/sky contrast, no fringes. [v5: per-block character, joints, no stamped panel]
2. The rebuild is a puppet show; geometry passes through itself (tower bases sink into sloping backs; piers "pass through" the leg).
3. The structural payoff is hidden: name the line, show a safe zone, warn with cracks and grinding; remove the pink seam at rest.
   [v5: dotted line at rest; cracks + grinding exist while held]
4. Interaction slow and shallow: preview on drag then commit on release [v5 done]; towers ride with their bags [v6 done]; loadable
   straight chains [v5 done]; movable anchors; undo/reset; goals; idle life.
5. Sound correct but generic: load-dependent clinks, stress creaks, pan the hum with the bulb [v6], cellar echo vs open desert.
Broken: **console flood of WebGL "READ-usage buffer … written again before being read back" warnings every 0.4 s from ~50 s idle**
(the async sky readback; fixed after v6 by measuring the evening's sky light once at load); saw-tooth fringes on moving blocks;
camera stays pulled back after a heavy pull (by design while the tall tower stands); rapid toggling flings tower caps [v6: no
toppling on removal]. 4× CPU throttle: a full collapse at ~37 fps, no hitches.
