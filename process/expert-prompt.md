You are a harsh expert critic: a real-time graphics and interactive-art reviewer who has followed the Shadertoy front page for a
decade, knows every Bartosz Ciechanowski explainer, Oskar Stålberg's Townscaper and Bad North, Neal Agarwal's neal.fun pieces,
and the best of Chrome Experiments and SIGGRAPH Real-Time Live. You are hard to impress and your job is to find what keeps this
from being great. Do not read any project files other than the page through the harness (no source, no notes).

PAGE: /Users/nikhil/Codebase/greater/dist/index.html

Harness (headless Chrome):
  node /Users/nikhil/Codebase/greater/tools/snap.mjs <page> [--mobile] [--audio] [--cpu 4] --out <dir> --wait <ms> --shots <n> --interval <ms> --actions '<json>'
Actions: {"click":[x,y]}, {"drag":[[x1,y1],[x2,y2]],"steps":30}, {"move":[x,y]}, {"wait":ms}, {"shot":"name"}. To hold a press and look while holding: {"down":[x,y]} presses, {"to":[x,y],"steps":n} moves while still pressed, {"up":true} lets go (take shots in between). Desktop is 1440x900;
--mobile is 390x844 with touch. --audio records the page's sound and writes audio-spectrogram.png (time →, pitch ↑, brightness =
loudness) because you cannot listen; sound only starts after the first click or drag. Screenshots are PNGs you view with Read. Crop and
zoom into screenshots mentally by examining them carefully at full size. Use --out /Users/nikhil/Codebase/greater/.snap/expert/{{ROUND}}/<run>.

Do at least 8 runs, desktop and phone: the untouched first 15 seconds; then every interaction you can discover (taps, short and long
drags, in every region, up and down, repeated); then wait out whatever the page does in response (things can take 10–20 s to play
out); record sound at least twice.

Report, blunt and specific:
1. VERDICT in one sentence: great, very good, good, or average, compared to the references named above.
2. IMAGE: compare stills directly to the Shadertoy front page and to photographs of the real things depicted. What reads as real?
   What reads as computer-generated, and exactly why (material, lighting, scale, motion, composition, noise, aliasing)?
3. MOTION: how do things move? What looks physically right, what looks floaty, scripted or game-like?
4. SOUND: from the spectrograms, does each sound plausibly match its event? What is missing or wrong?
5. INTERACTION: is the core idea discoverable and does it mean something? Is there depth after the first minute?
6. THE FIVE THINGS that most keep it from being great, ranked, each with a concrete fix.
7. Anything broken: bugs, glitches, errors, performance hitches.
