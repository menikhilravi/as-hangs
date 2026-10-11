# 14 · The five success criteria, checked honestly (final)

Evidence: five cold rounds (r1–r5, 14 tester sessions on phone and desktop, muted and with sound), four harsh expert passes (r1–r4,
each a fresh agent), my own measurements and tests. Reports are condensed in process/08, 10, 12, 15, 17.

1. **Ten seconds, hands off, muted (phone): MET, in every round.** Each muted-phone tester said within 10 s that the chain and the
   stone are one shape mirrored, and named a feeling. r1: "the quote made it click"; r2: "calm and a bit reverent"; r3: "I got it before
   the quote appeared … calm, a quiet 'oh, that's clever'"; r4: "calm, a little reverent … 'oh, clever'"; r5: "calm, a museum hush, 'oh,
   it's a mirror'" (and of the untouched opening collapse at 15 s: "That surprised me, and it's a great opening").

2. **The verb is found and understood within three attempts, with a stone-world consequence described: MET since v2.** The first tap
   hangs a weight and a turret is lowered onto the mirrored spot; every tester from r3 on did this in their first or second action and
   described it. The heavy-load verb was harder (r4: "I found the collapse by accident"); from v5 a held press fills the sack and the
   untouched intro demonstrates it, and both r5 testers found and named it ("press and hold makes a weight heavier"; "feeling the weight
   swell under my finger while the arch cracked above … like pulling a loose thread").

3. **It reads as a photograph — a harsh expert says the stone reads as stone, and no tester calls anything a placeholder: NOT MET.**
   Experts r1–r3 rated it "good" ("good, not very good"); the stone was called "uniform", "a tabletop model", "plaster or foam toy
   blocks"; testers called the cables "puppet strings", the pink line "a debug overlay", the figure "low-poly". Nobody called the
   piece a placeholder, and the cellar and the sunset were repeatedly singled out as photographic ("the cellar is the best part";
   "reads like a time-lapse photo"). The last expert (r4, v6) said the same: the underground room is "the best part", "the dusk
   silhouette is the most photographic still", "the geometry is truthful", the failure "the way masonry really does", but "the stone
   looks like beige foam blocks … it does not read as stone" (flat colour, razor edges, no relief under the low sun; blocks bounce
   like toys and never break), and the sound is "synthesized placeholders". So the half of this criterion that matters most fails.

4. **Depth past the first minute, some of it emergent: MET.** Testers discovered: weights build turrets (all); overload/pull collapses
   and it is rebuilt (all); removing a weight takes its turret down (r2–r5); more chains make a bigger building — r1 hooked both side
   chains into "a cathedral", r5 phone: "a weight on the hook turning the column into an obelisk was a real aha. Hooking a chain to get
   a flying buttress felt like finding a secret". Emergent outcomes nobody scripted: the pointed Gothic arch from a heavy crown load
   (r2: "like discovering why gothic arches are pointed"; r4: "a builder's secret"), the trapezoid arch from two weights ("satisfying
   because it's true"), lopsided arches with an obelisk over a heavy sack. But depth runs out: several testers felt they had seen
   everything after about 3–5 minutes (no goal; the arch always comes back).

5. **Craft on both screens: MET, with one honest caveat.** 0 JavaScript errors in every tester, expert, soak (3 minutes of random
   input, repeated on the final build) and own run; the one warning flood an expert found (WebGL readback warnings during dusk) is
   fixed — a full dusk and sunrise now log nothing. On this M3 at 1440×900: 60 fps idle, dragging and rebuilding, 55 fps at the
   busiest moment (both worlds moving just after a heavy release) — measured with the machine otherwise idle. 390×844 with the CPU
   slowed 4×: 60 fps in every state. The final build (v9) was re-checked the same way: 0 errors; the phone at 4× slowdown held 60 fps
   through tap, fill, collapse and rebuild; the desktop averaged 58 fps through a pull (and 33 through a collapse while a macOS
   photo-analysis daemon was taking 1.6 cores, which is what a real laptop sometimes does). Touch: touch-action none,
   overscroll-behavior none, no selection or callout; the page never scrolled in any tester's swipes (iOS edge swipes can't be
   exercised in headless Chrome). Works from file:// (dist/index.html) and as the published Artifact (content verified by reading it
   back; the hosted page itself was not opened, because the in-app browser isn't signed in). Audio: all synthesised, peaks 0.4–0.76,
   no clipping, distinct clinks, knocks, crashes, rope creaks, grinding, wind and dusk crickets. Caveat: to hold the frame rate, a
   moving world is traced at reduced resolution and denoised, and testers still notice the image softening "the moment you touch
   anything".

**Verdict.** Four of five met, and the one that fails is the one about looking real. Every cold tester got the idea within ten seconds
and said they would send it to a friend; four independent harsh experts each rated it "good, not very good". It is a good piece with
a genuinely new interaction, not a great one: the stone reads as a well-lit model rather than as masonry, and the depth runs out after
a few minutes because the arch always comes back and there is nothing to aim at.
