# Critic 4 · Feasibility at a stunning quality level (condensed)

**KEEP (6/36):** THIN ICE · AS HANGS · OBSCURA · STILL WARM · FIRST LIGHT · ETCH.
Top 3: 1 THIN ICE · 2 AS HANGS · 3 OBSCURA. LINOTYPE killed: hundreds of mechanical parts in code look like a CAD animation.

- THIN ICE: the "pew" is floating-plate flexural dispersion computed directly (per-frequency solve, stone contact time, spreading, loss, then
  inverse FFT; cache per distance; AudioWorklet). Image: half-res raymarch of a slab with refraction into absorbing water, bubble stacks,
  crack sheets with silvery TIR, pebble bed fading to black, frame the camera *down* so no landscape is needed. Spike: sound only, 5 cm ice at
  20/50/100 m, A/B by ear against the viral recordings.
- AS HANGS: hardest risk is light on geometry that changes every frame (nothing bakes; path tracing restarts while dragging). Live: sun shadow
  with angular-size penumbra, sky occlusion from proxies, physical sky + haze; converge progressively when still. Joints computed exactly
  perpendicular to the thrust line. Modal clinks by link contact speed; vault reverb from ray-traced energy decay. Use a bare limestone or salt
  plain, not grass. The walk-in is a second project.
- OBSCURA: outside world rendered once per frame to a small HDR env with a blur pyramid; each wall point looks through each hole's centre,
  blurred by the hole's apparent size, brightness ∝ area/d². **Sun glints on water project in the actual shape of the user's hole**
  (physically exact, almost nobody knows). Dust shafts carry the image's colours; slow eye adaptation. No gulls.
- STILL WARM: feasible to look like real footage (shutter click, auto-ranging, glass as a thermal mirror showing your own reflection); its cost
  is house design and writing.
- Cross-cutting: no audio before the first tap (every "before touch: sound" is fiction); AudioWorklet from a Blob URL on file://; iOS tilt needs
  a permission tap; plan half-res raymarching on phones.
