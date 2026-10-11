# 07 · As Hangs: the vision and the five success criteria

## The piece
A horizon splits the screen. Below it, in a lamp-lit workshop, an iron chain hangs between two hooks in the ceiling.
Above it, mirrored exactly, the same curve stands upside down as a stone arch on a pale plain in late sun. Robert Hooke,
1675: *as hangs the flexible line, so but inverted will stand the rigid arch.*

You touch the chain. Everything else follows from physics:
- **Pull down** and you load it; above, the stone feels the same load at the same point. A weight that stays (a sack of shot)
  becomes a tower that stays.
- **Push up**, or overload it, and the line of thrust leaves the masonry: joints crack open where it escapes, and with enough
  hinges the arch comes down, block by block.
- **When the chain comes to rest**, the stone world is rebuilt along it the way arches are really built: timber centering, stones
  laid from both feet, the keystone, then the centering struck away and the arch standing on its own.

Stone never morphs. It stands, cracks, falls, or is rebuilt. The chain always finds its equilibrium; the stone only stands where a
chain would hang.

## Rules I'm holding myself to
1. Senses before systems. The stone world must read as a photograph, and the workshop as a photograph, before mechanics.
2. Every frame of every session gets looked at, at 1440×900 and 390×844, full size and in crops.
3. No text on screen except, at most, Hooke's line. No buttons, no HUD.
4. Everything computed: no images, samples or fonts. One local HTML file.
5. Testers' praise is noise; their concrete complaints are signal.

## Five observable success criteria (checked honestly at the end)
1. **Ten seconds, hands off, muted.** A cold tester on a muted phone, given no instructions, says within 10 s that the chain and
   the stone are one shape mirrored (or equivalent), and names a feeling.
2. **The verb is found and understood.** Within three attempts a cold tester pulls the chain and correctly describes a consequence in
   the stone world (a tower rising, cracks, a collapse) without being told.
3. **It reads as a photograph.** A harsh expert pass comparing stills to the Shadertoy front page and to photographs of real stone in
   low sun says the stone reads as stone (not plaster, not CG), and no cold tester calls anything a placeholder.
4. **Depth past the first minute, some of it emergent.** Cold testers discover at least two of: a weight builds a tower; pushing up or
   overloading brings the stone down and it is rebuilt; removing a weight can make a structure fall; more chains make a bigger
   building. At least one tester reports an outcome I did not script.
5. **Craft on both screens.** 0 console errors; ≥ 55 fps at 1440×900 on the M3 while interacting; ≥ 30 fps at 390×844 with the CPU
   slowed 4×; no pull-to-refresh, text selection or edge-swipe hijacks on touch; works from file:// and as the Artifact; a recording
   shows distinct, unclipped clinks, knocks and collapses, all synthesised.

## Plan
1. Stone world still: analytic ray-traced voussoirs, plain, sky, haze, soft sun, bounce light, stone material. → screenshot test.
2. Workshop still: iron links, plaster, lamp, sacks, hooks, shadows on the wall. → screenshot test.
3. Sound: modal chain clinks, stone knocks, collapse rumble, wind and room tone. → spectrogram test.
4. Systems: chain physics + grabbing, sacks, thrust-line check, cracks, 2D rigid-body collapse, the construction sequence, towers.
5. The first ten seconds: the piece performs its verb once.
6. Halfway Artifact publish. Cold round 1.
7. Depth: more chains, a vault, the light moving. Cold round 2, expert pass.
8. Phone, performance, edge cases. Final round, criteria check, publish.
