# As Hangs

> *As hangs the flexible line, so but inverted will stand the rigid arch.* — Robert Hooke, 1675

A horizon splits the screen. Below, in a lamplit cellar, an iron chain hangs between two hooks. Above, the same curve stands upside
down as a stone arch on a salt flat at golden hour. Touch the chain and the stone answers:

- **tap** the chain (or the arch) to hang a sack of shot; masons lower a turret onto the stone at the mirrored point. Tap a sack to
  take it off (the masons take its turret down).
- **press and hold** to pour shot into a sack: it grows heavier, the line of thrust (the chain's mirror image, drawn faintly over the
  stone) warms from gold to red as it nears the edge of the masonry, and when it leaves the stone the arch cracks open at four hinges
  and falls. When the chain is still, the arch is rebuilt along it, on timber centering, keystone last.
- **pull** a link down to try a load: the stone strains under your hand but is only judged when you let go (drag back and nothing
  breaks). Drag a sack along the chain, or onto another chain or hook. Hang a sack on a loose chain's hook to crown its column;
  lift a loose end to the ceiling to hook it in (a new arch), or onto another chain (a flying buttress). Swing the bulb.
- **leave it alone** and it shows you the whole verb once; leave it longer and the sun goes down.

Everything is computed in the browser: a position-based chain, a rigid-body solver for falling masonry, Heyman's safe theorem for the
stone (eccentricity of the thrust line at every joint), two path-traced worlds (analytic ray tracing of stone prisms under a
precomputed physical sky; signed-distance chain links lit by a sphere light), and synthesised sound. No libraries, fonts or network.

**Run:** open `dist/index.html` (works from `file://`). **Build:** `node tools/build.mjs` inlines `src/` into `dist/index.html` and
`dist/as-hangs.html` (the Artifact fragment). **Test:** `node tools/snap.mjs dist/index.html --out .snap/x` (headless Chrome; see
`--help`), `node tools/tests/physics.mjs`, `node tools/tests/geometry.mjs`.

`process/` holds how it was made: the diagnosis, 36 concepts and the kill round (`01`–`06`), the vision and five success criteria
(`07`), every cold-tester and expert report (`08`, `10`, `12`, `15`, `17`) and what was changed in response (`09`, `11`, `13`, `16`), and the final
honest check of the criteria (`14`).
