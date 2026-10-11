# Round 2 → fixes (3 testers + harsh expert; all three testers would send it; expert: "good, not very good")

Already done in src after the freeze: ghost line of thrust while touching (gold inside the stone, red outside) — asked for by two
testers and the expert; physics energy-injection bug (restitution after warm start) → explosions and endless grinding; stuck stones
freeze; knock rate limit; corbels on steep legs; tap priority for the chain over hanging sacks; chain heft (small pull, small
weight); closer back wall (sharp link shadows); Hooke line for early tappers and after idle; S-hooks; dust motes; wind gusts.

Round 3, in order:
A. Motion image: motion buffers at ~0.7×; edge-aware denoise of low-sample buffers; no ghost trails; keep converged layers.
B. Masonry truth: no rubber (no blended bending; only a true four-hinge mechanism with every crack opening); near-zero bounce; capped
   push-apart; rigid pieces.
C. Stone and sky: brightness-not-hue variation, joint shading; sky consistent with the sun (less isotropic Mie glow); apex hole;
   softer shadow tips.
D. Faster loop: full rebuild ~5 s; input during a rebuild fast-forwards it.
E. Wider workshop room (no side walls when the camera steps back). F. The bulb swings when touched. G. Intro on real time.
H. Sound: varied knocks, no metronome, bulb hum, chain scrape. J. Sturdier columns.
Then depth: hook a loose chain onto another chain (flying buttress), drag a hook to change a span; then dusk when idle.

## Status (src, after publishing v3 and freezing it for round 3 at .snap/cold/r3/page/)
v3 (published): A motion image — 0.7× motion buffers + edge-aware à-trous denoise + converging worlds take turns (60 fps in every
state on this Mac, 60 fps on phone emulation at 4× CPU); B no rubber (only a true four-hinge mechanism whose cracks all open),
stone barely bounces, capped push-apart, collapse breaks up; C one stone (brightness not hue), haze multiple scattering 0.9 → 0.3
(no golden wrap; a soft warm band), apex seats in strips (no hole), wider sun disc; D rebuild ~2× faster with humanised rhythm, a
touch hurries the masons; E room 6 m wide; F the bulb swings (tilting cord, swinging shadows); G intro on real time; H unpitched
stone knocks (16 variants), faint bulb hum; J columns sturdier; plus 2 workshop bounces.
After v3 (src only): flying buttresses — drag a loose chain's end onto another chain's link (it snaps with a clink) → the chains are
solved together, the column becomes a buttress cut to the host arch's back, the host is rebuilt for the new pull; yank the hook off
to undo. Dusk — 45 s untouched and the sun goes down into twilight (adaptive exposure, crickets, wind drops); a touch brings the
light back. Horizon sparkle (history resets at grazing angles) fixed by giving plain and sky one history class.
