# Round 3 → fixes (3 testers + fresh expert on v3; all testers would send it; expert: "good, not very good" again)

Converging asks: (1) the line of thrust visible all the time, warming toward red near the edge — two testers' ONE change and the
expert's #1 → done in src; (2) motion image quality — every report; (3) thorn/cactus pinnacles on the legs — two testers + expert;
(4) jelly pillar / ribbon collapses; (5) ghost blocks (stale motion picture on newly covered pixels) → fixed; (6) idle → dusk (src).

Done in src since v3: persistent line; flying buttresses; dusk with async sky readback; scale figure; crust rims; centre-ray history
(clean static edges in motion); spark rejection (clamped stone bounce + denoiser outliers); fresh-only blend; decisive column topple.
To do for v4: stone never downscaled; loads on steep legs carried by buttress piers from the ground (Gothic), pinnacles only on level
seats; correspondence-aware reshaping in flight (no wafers); a calmer camera (steps back, comes in only slowly, much later); bulb
glow; sacks with burlap and a visible tie; then publish v4 and run round 4.

## Published as v4 (Artifact version 4), frozen for round 4 at .snap/cold/r4/page/
In v4: persistent thrust line (gold → red near the edge) on every arch; flying buttresses (hook a loose end onto another chain);
dusk after 45 s idle (async sky readback, adaptive exposure, crickets); scale figure; crust rims; centre-ray history; spark
rejection; fresh-only blend; columns topple decisively; steep-leg loads on buttress piers (room-checked against neighbours, seats on
the phone), merged/raised turrets (cap reused); apex seats in two strips; stone sharp except under a hand, room at 0.58× in motion;
motes computed on the CPU; calmer camera; frosted bulb with glow; real-time sim clock (dt up to 1/20 s, physics substeps ≤ 1/120 s);
ropes limit 64. Measured on this Mac: 60 fps idle/drag/rebuild, ~54 fps in the busiest moment just after a heavy release; phone
emulation at 4× CPU throttle: 60 fps in every state. 0 console errors.
