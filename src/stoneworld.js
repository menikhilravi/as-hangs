// stoneworld.js — the world above the line: a stone structure on a pale plain in low sun.
// Geometry is a list of convex prisms ("blocks"): a quadrilateral in the arch plane (x,y) extruded between z0 and z1.
// It is ray-traced analytically (plane slabs), with soft sun shadows, one bounce of sky and ground light, and accumulation.
'use strict';
const Stone = (() => {
  const MAXB = 384, GS = 8, MAXG = MAXB / GS;   // blocks, gathered into groups of up to GS neighbours with one bounding box each
  const S = {
    sun: [0, 0, 0], sunIrr: [0, 0, 0], sunCos: Math.cos(0.0047 * 1.9),
    blocks: [], data: new Float32Array(MAXB * 12 + MAXG * 8), dirty: true,
  };

  // ---------- sky precompute ----------
  const SKY_W = 512, SKY_H = 256, SH_W = 64, SH_H = 32;
  const skyFS = `
uniform vec3 uSun; uniform float uSunI;
void main(){
  // equirect with extra resolution near the horizon: v = .5 + .5*sign(e)*sqrt(|e|/(PI/2))
  float phi = (uv.x - .5) * TAU;
  float s = uv.y * 2. - 1.; float e = sign(s) * s * s * (PI / 2.);
  vec3 d = vec3(cos(e) * cos(phi), sin(e), cos(e) * sin(phi));
  vec3 tr; vec3 L = atmo(d, uSun, 2., uSunI, 1e9, tr);
  // below the horizon: haze toward the ground limited to ~30 km so the lower sky stays luminous
  if (d.y < 0.){ vec3 tr2; L = atmo(d, uSun, 2., uSunI, 30000., tr2); }
  o = vec4(L, 1.);
}`;
  // sun transmittance at ground (JS port of the optical-depth integral)
  function sunTransmittance(sunDir) {
    const RE = 6360e3, RA = 6420e3, HR = 7994, HM = 1200, BR = [5.8e-6, 13.5e-6, 33.1e-6], BM = 21e-6;
    const ro = [0, RE + 2, 0];
    const b = ro[1] * sunDir[1], c = ro[1] * ro[1] - RA * RA, t = -b + Math.sqrt(b * b - c);
    const N = 64, BO = [0.650e-6, 1.881e-6, 0.085e-6]; let odR = 0, odM = 0, odO = 0;
    for (let i = 0; i < N; i++) {
      const s = t * (i + 0.5) / N; const p = [sunDir[0] * s, ro[1] + sunDir[1] * s, sunDir[2] * s];
      const h = Math.hypot(p[0], p[1], p[2]) - RE; if (h < 0) return [0, 0, 0];
      odR += Math.exp(-h / HR) * t / N; odM += Math.exp(-h / HM) * t / N; odO += Math.max(0, 1 - Math.abs(h - 25000) / 15000) * t / N;
    }
    return BR.map((br, i) => Math.exp(-(br * odR + BM * 1.1 * odM + BO[i] * odO)));
  }

  // ---------- trace shader ----------
  const traceFS = `
uniform sampler2D uBlocks; uniform int uNG;
uniform sampler2D uSky; uniform sampler2D uPrev;
uniform vec3 uSun; uniform vec3 uSunIrr; uniform float uSunCos; uniform vec3 uCloudSun;
uniform vec3 uCam; uniform float uTanH; uniform float uAspect; uniform float uShift; uniform vec2 uRes;
uniform int uFrame; uniform float uCap; uniform float uHaze; uniform sampler2D uPrevSig; uniform vec3 uSH[9]; uniform float uMoved;
// irradiance from the sky for a surface facing n (order-2 spherical harmonics, Ramamoorthi & Hanrahan)
vec3 skyIrr(vec3 n){
  float x = n.x, y = n.y, z = n.z;
  vec3 e = 3.14159 * .282095 * uSH[0]
    + 2.094395 * .488603 * (uSH[1] * y + uSH[2] * z + uSH[3] * x)
    + .785398 * (1.092548 * (uSH[4] * x * y + uSH[5] * y * z + uSH[7] * x * z) + .315392 * uSH[6] * (3. * z * z - 1.) + .546274 * uSH[8] * (x * x - y * y));
  return max(e, vec3(0));
}
layout(location = 1) out vec4 oSig;

vec3 skyL(vec3 d){
  float phi = atan(d.z, d.x); float e = asin(clamp(d.y, -1., 1.));
  float v = .5 + .5 * sign(e) * sqrt(abs(e) / (PI / 2.));
  return texture(uSky, vec2(phi / TAU + .5, v)).rgb;
}
// ---- blocks
vec4 B0(int i){ return texelFetch(uBlocks, ivec2(3 * i, 0), 0); }
vec4 B1(int i){ return texelFetch(uBlocks, ivec2(3 * i + 1, 0), 0); }
vec4 B2(int i){ return texelFetch(uBlocks, ivec2(3 * i + 2, 0), 0); }
// B2.z packs the material (0 stone, 1 timber) with a stable id for the block (×4), so accumulation can tell blocks apart
float matOf(int i){ return mod(B2(i).z, 4.); }
float uidOf(int i){ return floor(B2(i).z / 4.); }
vec4 G0(int g){ return texelFetch(uBlocks, ivec2(${MAXB * 3} + 2 * g, 0), 0); }
vec4 G1(int g){ return texelFetch(uBlocks, ivec2(${MAXB * 3} + 2 * g + 1, 0), 0); }
float boxEntry(vec3 ro, vec3 inv, vec3 bmin, vec3 bmax){
  vec3 a = (bmin - ro) * inv, b = (bmax - ro) * inv, lo = min(a, b), hi = max(a, b);
  float tn = max(max(lo.x, lo.y), lo.z), tf = min(min(hi.x, hi.y), hi.z);
  return (tf >= max(tn, 0.)) ? max(tn, 0.) : 1e9;
}
vec3 safeInv(vec3 d){ return 1. / vec3(abs(d.x) < 1e-9 ? 1e-9 : d.x, abs(d.y) < 1e-9 ? 1e-9 : d.y, abs(d.z) < 1e-9 ? 1e-9 : d.z); }
// ray vs convex prism. returns entry t (or 1e9) and the entry normal
float hitBlock(int i, vec3 ro, vec3 rd, float tBest, out vec3 nIn){
  vec4 a = B0(i), b = B1(i), c = B2(i);
  float t0 = 1e-4, t1 = tBest; nIn = vec3(0);
  float ta = (c.x - ro.z) / rd.z, tb = (c.y - ro.z) / rd.z;
  if (abs(rd.z) < 1e-9){ if (ro.z < c.x || ro.z > c.y) return 1e9; }
  else { float tn = min(ta, tb), tf = max(ta, tb); if (tn > t0){ t0 = tn; nIn = vec3(0, 0, rd.z > 0. ? -1. : 1.); } t1 = min(t1, tf); }
  vec2 P[4] = vec2[4](a.xy, a.zw, b.xy, b.zw);
  for (int k = 0; k < 4; k++){
    vec2 e = P[(k + 1) & 3] - P[k]; vec2 n = normalize(vec2(e.y, -e.x));
    float dn = dot(n, rd.xy), dist = dot(n, ro.xy - P[k]);
    if (abs(dn) < 1e-9){ if (dist > 0.) return 1e9; continue; }
    float t = -dist / dn;
    if (dn < 0.){ if (t > t0){ t0 = t; nIn = vec3(n, 0.); } } else t1 = min(t1, t);
    if (t0 > t1) return 1e9;
  }
  if (nIn == vec3(0)) return 1e9; // origin inside
  return t0;
}
float trace(vec3 ro, vec3 rd, float tmax, out vec3 n, out int id){
  float t = tmax; id = -1; n = vec3(0, 1, 0);
  if (rd.y < 0.){ float tg = -ro.y / rd.y; if (tg > 1e-4 && tg < t){ t = tg; id = -2; n = vec3(0, 1, 0); } }
  vec3 inv = safeInv(rd);
  for (int g = 0; g < ${MAXG}; g++){
    if (g >= uNG) break;
    vec4 a = G0(g), b = G1(g);
    if (boxEntry(ro, inv, a.xyz, b.xyz) >= t) continue;
    int i0 = int(a.w + .5), nb = int(b.w + .5);
    for (int k = 0; k < ${GS}; k++){
      if (k >= nb) break;
      vec3 nn; float tb = hitBlock(i0 + k, ro, rd, t, nn);
      if (tb < t){ t = tb; id = i0 + k; n = nn; }
    }
  }
  return id == -1 ? -1. : t;
}
bool shadow(vec3 ro, vec3 rd){
  if (rd.y < 0.) return true; // sun below a surface plane can't happen except numerically
  vec3 inv = safeInv(rd);
  for (int g = 0; g < ${MAXG}; g++){
    if (g >= uNG) break;
    vec4 a = G0(g), b = G1(g);
    if (boxEntry(ro, inv, a.xyz, b.xyz) >= 1e5) continue;
    int i0 = int(a.w + .5), nb = int(b.w + .5);
    for (int k = 0; k < ${GS}; k++){ if (k >= nb) break; vec3 nn; if (hitBlock(i0 + k, ro, rd, 1e5, nn) < 1e5) return true; }
  }
  return false;
}

// ---- materials
struct M { vec3 alb; vec3 n; };
// block-local frame: x along the block's first edge, y across, z through
vec3 blockLocal(int i, vec3 p, out vec2 uax){
  vec4 a = B0(i), b = B1(i);
  vec2 c = (a.xy + a.zw + b.xy + b.zw) * .25; uax = normalize(a.zw - a.xy);
  vec2 q = p.xy - c; return vec3(dot(q, uax), dot(q, vec2(-uax.y, uax.x)), p.z);
}
// distance from a point on block i's surface to the nearest *other* face, and that face's normal
float edgeInfo(int i, vec3 p, vec3 nFace, out vec3 nOther){
  vec4 a = B0(i), b = B1(i), c = B2(i);
  vec2 P[4] = vec2[4](a.xy, a.zw, b.xy, b.zw);
  float best = 1e9; nOther = nFace;
  for (int k = 0; k < 4; k++){
    vec2 e = P[(k + 1) & 3] - P[k]; vec2 n = normalize(vec2(e.y, -e.x));
    if (dot(vec3(n, 0.), nFace) > .99) continue;
    float d = -dot(n, p.xy - P[k]);
    if (d < best){ best = d; nOther = vec3(n, 0.); }
  }
  if (nFace.z > -.99){ float d = p.z - c.x; if (d < best){ best = d; nOther = vec3(0, 0, -1); } }
  if (nFace.z < .99){ float d = c.y - p.z; if (d < best){ best = d; nOther = vec3(0, 0, 1); } }
  return best;
}
M stone(int i, vec3 p, vec3 ng){
  vec4 c = B2(i); float seed = c.w;
  vec2 uax; vec3 q = blockLocal(i, p, uax);
  // limestone from one quarry, each block with its own character: most clean and fine, some bedded (laminations along the block),
  // some coarse and shelly, a few iron-stained. Blocks differ in tone far more than in hue.
  float hv = h11(seed), hv2 = h11(seed + 7.1), hv3 = h11(seed + 3.3), kind = h11(seed + 5.7);
  vec3 base = vec3(.56, .51, .44) * (.68 + .44 * hv * hv + .12 * hv2);
  base = mix(base, base * vec3(1.05, 1., .93), hv2 * .6);
  vec3 sp = q + vec3(seed * 13.1, seed * 7.7, 0.);
  float mott = fbm3(sp * vec3(.9, 1.3, .9), 4);
  vec3 alb = base * (1. + .3 * (mott - .5) * 2. * .5);
  if (kind < .22){            // bedded: fine laminations along the block, a few darker partings
    float lam = fbm3(vec3(sp.x * .35, sp.y * 7.5, sp.z * .35), 3);
    alb *= .9 + .2 * lam; alb *= 1. - .22 * smoothstep(.62, .7, fbm3(vec3(sp.x * .25, sp.y * 3.1 + 4., sp.z * .25), 2));
  } else if (kind < .36){     // coarse and shelly: pitted, a little greyer
    alb *= vec3(.95, .96, .97) * (1. - .2 * smoothstep(.25, .6, gnoise(sp * 9.)));
  } else if (kind < .45){     // iron-stained: warm rusty clouds through the stone
    alb = mix(alb, alb * vec3(1.1, .82, .58), smoothstep(.35, .75, fbm3(sp * .8 + 3., 3)) * .75);
  }
  float fine = gnoise(sp * 22.) * .5 + gnoise(sp * 61.) * .25;
  alb *= 1. + .06 * fine;
  // weathering: broad darker patches; rain streaks running down the face from upper edges; darker near the ground
  alb *= 1. - .18 * smoothstep(.15, .55, fbm3(vec3(seed * 3.1, 1.7, 0.) + p * .45, 3));
  float rain = smoothstep(.45, .8, fbm3(vec3(p.x * 4.1, p.y * .35, p.z * 4.1) + seed, 3)) * smoothstep(.0, .6, -ng.y + .45);
  alb *= 1. - .2 * rain;
  float lich = smoothstep(.58, .78, fbm3(sp * 2.3 + 9., 4)) * smoothstep(.2, .9, ng.y + .3);
  alb = mix(alb, vec3(.5, .52, .42), lich * .5);
  alb *= .74 + .26 * smoothstep(0., 2.4, p.y);
  // the joints: a recessed mortar line that holds shadow and dirt
  vec3 nOther; float de = edgeInfo(i, p, ng, nOther);
  alb *= 1. - .38 * smoothstep(.045, .0, de);
  // the face as the mason left it: from rubbed smooth to boldly pitched, block by block, all the way to the arrises
  float centre = .35 + .65 * h11(seed + 21.);
  alb *= mix(1., .86 + .14 * fbm3(sp * 6.5, 3), centre);
  // normal: rounded/chipped arrises + tooled surface bump
  // arrises: crisp, with chips knocked out of them here and there
  float chip = smoothstep(.35, .7, gnoise(sp * 7.) + .5 * gnoise(sp * 19.));
  float r = .035 + .015 * gnoise(sp * 23.) + .09 * chip;
  vec3 n = ng;
  {
    vec2 perp = vec2(-uax.y, uax.x);
    vec3 off;
    if (abs(ng.z) > .5) off = vec3(uax * q.x / .5 + perp * q.y / .55, 0.);   // front/back face
    else { vec2 tg = vec2(-ng.y, ng.x); vec4 cc = B2(i); float zc = (cc.x + cc.y) * .5;
           off = vec3(tg * dot(p.xy - (B0(i).xy + B0(i).zw + B1(i).xy + B1(i).zw) * .25, tg) / .5, (p.z - zc) / ((cc.y - cc.x) * .5)); }
    off = clamp(off, -1.2, 1.2);
    float pil = .025 + .03 * h11(seed + 1.9);
    n = normalize(ng + off * pil * (.5 + .5 * dot(off, off)));
  }
  if (de < r){ float k = 1. - de / r; vec3 bis = ng + nOther; if (dot(bis, bis) > 1e-6) n = normalize(mix(n, normalize(bis), smoothstep(0., 1., k) * .9)); alb *= 1. - .05 * k - .12 * chip * k; }
  float e = .004;
  float h0 = fbm3(sp * 9., 3) * .7 + gnoise(sp * 37.) * .3;
  vec3 tA = ortho(ng), tB = cross(ng, tA);
  float hx = fbm3((sp + tA * e) * 9., 3) * .7 + gnoise((sp + tA * e) * 37.) * .3;
  float hy = fbm3((sp + tB * e) * 9., 3) * .7 + gnoise((sp + tB * e) * 37.) * .3;
  n = normalize(n - (tA * (hx - h0) + tB * (hy - h0)) / e * mix(.006, .03, centre));
  return M(alb, n);
}
float gDist = 10.;
M ground(vec3 p){
  vec2 g = p.xz; float far = clamp(18. / gDist, 0., 1.);   // fine detail is sub-pixel far away: fade it instead of aliasing
  float big = fbm2(g * .05, 4), mid = fbm2(g * .6, 4), fin = vnoise(g * 9.);
  vec3 alb = mix(vec3(.33, .27, .21), vec3(.47, .40, .32), big);
  alb *= .85 + .3 * mid; alb *= 1. + (fin - .5) * .1 * far;
  // dry crust in polygons: the borders curl up into low rims (pale, catching the low sun on one side), split by a dark crack
  vec2 cc = cell2(g * .55);
  float edge = cc.y - cc.x, crack = smoothstep(.06, .0, edge), rim = smoothstep(.22, .04, edge);
  alb *= 1. - .45 * crack * mix(.25, 1., far);
  alb *= 1. + .12 * rim * far;
  // scattered pebbles
  vec2 cp = cell2(g * 3.1 + 40.);
  float peb = smoothstep(.22, .12, cp.x) * step(.6, h21(floor(g * 3.1 + 40.)));
  alb = mix(alb, alb * vec3(.7, .66, .6), peb * far);
  vec3 n = normalize(vec3(-(fbm2((g + vec2(.02, 0)) * .6, 3) - fbm2(g * .6, 3)) * 1.5, 1., -(fbm2((g + vec2(0, .02)) * .6, 3) - fbm2(g * .6, 3)) * 1.5));
  if (far > .25){   // the rims' slopes, near enough to see
    float e = .03, hx = smoothstep(.22, .04, cell2((g + vec2(e, 0.)) * .55).y - cell2((g + vec2(e, 0.)) * .55).x), hz = smoothstep(.22, .04, cell2((g + vec2(0., e)) * .55).y - cell2((g + vec2(0., e)) * .55).x);
    n = normalize(n + vec3(-(hx - rim), 0., -(hz - rim)) / e * .045 * far);
  }
  return M(alb, n);
}
// rough-sawn timber for the centering: grain along the piece, darker end grain, a few knots
M wood(int i, vec3 p, vec3 ng){
  vec2 uax; vec3 q = blockLocal(i, p, uax);
  float g = fbm2(vec2(q.x * 1.5, q.y * 38. + q.z * 9.), 4);
  vec3 alb = mix(vec3(.30, .21, .13), vec3(.44, .32, .20), g);
  alb *= .85 + .3 * vnoise(vec2(q.x * .7, q.z * 3.) + B2(i).w);
  float knot = smoothstep(.12, .0, length(fract(vec2(q.x * .35, q.y * 3.) + B2(i).w) - .5));
  alb *= 1. - .5 * knot;
  if (abs(ng.z) > .5) alb *= .8;
  return M(alb, ng);
}
// hemp rope: dark, with a faint twist
M ropeM(vec3 p, vec3 ng){ return M(vec3(.15, .115, .08) * (.8 + .2 * sin(p.y * 90. + p.x * 40.)), ng); }
// the figure: a dark wool coat and hat, a little lighter where the light catches
M figureM(vec3 p, vec3 ng){ return M(vec3(.075, .068, .062) * (.85 + .3 * vnoise(p.xy * 40.)), ng); }
M material(int id, vec3 p, vec3 ng){ if (id == -2) { gDist = length(p - uCam); return ground(p); } float mt = matOf(id); if (mt > 2.5) return figureM(p, ng); if (mt > 1.5) return ropeM(p, ng); if (mt > .5) return wood(id, p, ng); return stone(id, p, ng); }

// distant mesas: elevation angle of the far skyline as a function of azimuth
float skyFar(float az){ return smoothstep(.48, .62, fbm2(vec2(az * 3.2, 1.7), 5)) * .022 + smoothstep(.55, .8, fbm2(vec2(az * 9., 4.2), 4)) * .008 + .004; }
float skyNear(float az){ return smoothstep(.56, .7, fbm2(vec2(az * 5.3, 9.3), 5)) * .011 + .0015; }
float skyline(vec3 d){ float az = atan(d.z, d.x); return max(skyFar(az), skyNear(az)); }
// a mesa face: lit where its slope turns toward the sun (on the left), in shadow on the far side; hazed by distance
vec3 mesa(vec3 rd, float az, float slope, float dist){
  float lit = clamp(.42 - slope * 2.2, .22, .9);
  vec3 rock = vec3(.30, .20, .13) * (uSunIrr * .55 * lit * max(.2, -uSun.x) / PI + skyL(vec3(0, 1, 0)) * .32);
  float T = exp(-dist * uHaze * 3.2);
  return rock * T + skyL(normalize(vec3(rd.x, .002, rd.z))) * (1. - T);
}

// high cirrus: thin streaks drawn out along the wind, lit by the low sun (warm), thinning toward the horizon haze
float cirrusD(vec3 rd){
  if (rd.y < .015) return 0.;
  vec2 c = rd.xz / rd.y * 9.;                       // a cloud deck 9 km up, in km
  vec2 w = vec2(.89, .45); c = vec2(dot(c, w), dot(c, vec2(-w.y, w.x)));
  float streak = fbm2(vec2(c.x * .06, c.y * .55) + 3.1, 5);
  float body = fbm2(c * .045 + 11.7, 4);
  float d = smoothstep(.5, .78, streak * .6 + body * .55) * smoothstep(.015, .09, rd.y) * (1. - smoothstep(.55, .9, rd.y));
  return d * .55;
}
vec3 cirrus(vec3 L, vec3 rd){
  float d = cirrusD(rd); if (d <= 0.) return L;
  float mu = dot(rd, uSun), g = .55, ph = (1. - g * g) / (4. * PI * pow(1. + g * g - 2. * g * mu, 1.5));
  vec3 lit = uCloudSun * ph * 1.6 + skyL(vec3(0, 1, 0)) * .9;   // (high cloud keeps the sun a while after the plain has lost it)
  return mix(L, lit, d);
}
vec3 sunDirect(vec3 p, vec3 ng, M m){
  vec3 ld = cone(uSun, uSunCos, rnd2());
  float ndl = dot(m.n, ld);
  if (ndl <= 0. || dot(ng, ld) <= 0.) return vec3(0);
  if (shadow(p + ng * 2e-3, ld)) return vec3(0);
  return m.alb / PI * uSunIrr * ndl;
}

void main(){
  vec2 fc = gl_FragCoord.xy;
  rngInit(fc, uFrame);
  vec2 px = fc + rnd2() - .5;
  // shifted-lens camera: verticals stay vertical; y = 0 is the mirror line
  float sx = (px.x - .5 * uRes.x) / (uRes.y);     // full-screen height = 2*uRes.y
  float sy = px.y / uRes.y;
  vec3 rd = normalize(vec3(sx * uTanH, sy * uTanH + uShift, 1.));
  vec3 ro = uCam;
  vec3 n; int id;
  float t = trace(ro, rd, 1e5, n, id);
  vec3 L;
  if (t < 0.){
    float az = atan(rd.z, rd.x), e = .018;
    if (rd.y < skyNear(az) && rd.y > -.01) L = mesa(rd, az, (skyNear(az + e) - skyNear(az - e)) / (2. * e), 6000.);
    else if (rd.y < skyFar(az) && rd.y > -.01) L = mesa(rd, az, (skyFar(az + e) - skyFar(az - e)) / (2. * e), 14000.);
    else {
      L = skyL(rd);
      float cs = dot(rd, uSun);
      if (cs > uSunCos) L += uSunIrr / (TAU * (1. - uSunCos));
      L = cirrus(L, rd);
    }
  } else {
    vec3 p = ro + rd * t;
    M m = material(id, p, n);
    L = sunDirect(p, n, m);
    // one bounce: sky light and light reflected from the ground and other stones
    vec3 bd = cosHemi(m.n, rnd2()); if (dot(bd, n) < 0.) bd = reflect(bd, n);
    vec3 n2; int id2;
    vec3 p0 = p + n * 2e-3;
    float t2 = trace(p0, bd, 1e5, n2, id2);
    if (t2 < 0.) L += m.alb * skyIrr(m.n) / PI;   // visibility from the ray, radiance from the projected sky
    else {
      vec3 p2 = p0 + bd * t2; M m2 = material(id2, p2, n2);
      vec3 l2 = sunDirect(p2, n2, m2);
      // second bounce approximated by sky ambient
      l2 += m2.alb * skyIrr(m2.n) / PI * .6;
      L += min(m.alb * l2, vec3(.35));   // a bounce off a sunlit face is clamped: few samples must not make sparks
    }
    // aerial perspective
    float T = exp(-t * uHaze);
    L = L * T + skyL(normalize(vec3(rd.x, max(rd.y, .01), rd.z))) * (1. - T);
  }
  // per-pixel accumulation: restart where the visible surface changed (a stone moved), cap history while the scene moves
  vec4 ps = texelFetch(uPrevSig, ivec2(gl_FragCoord.xy), 0);
  // the history is judged on the ray through the pixel's centre, not the jittered sample: a still edge keeps its history while
  // other things move (a jittered sample crossing it is just antialiasing)
  vec3 nc; int idc; float tc;
  { vec3 rdc = normalize(vec3((fc.x - .5 * uRes.x) / uRes.y * uTanH, fc.y / uRes.y * uTanH + uShift, 1.)); tc = trace(uCam, rdc, 1e5, nc, idc); }
  float sigId = idc >= 0 ? uidOf(idc) : float(idc), sigT = tc;
  // the plain and the sky are one surface for the history: at grazing angles jittered samples land far apart on the plain (or past
  // the horizon), and the plain's light changes only when something moves over it, which changes the id anyway
  if (idc < 0) sigId = -1.;
  // only judge history while something moves: a still world just keeps accumulating (silhouettes and grazing ground included)
  bool same = uMoved < .5 || (abs(ps.x - sigId) < .5 && (sigId < -.5 || abs(ps.y - sigT) < max(.05, sigT * .03)));
  vec4 pc = texelFetch(uPrev, ivec2(gl_FragCoord.xy), 0);
  if (any(isnan(L)) || any(isinf(L))) { L = same ? pc.rgb : vec3(0); }
  float hc = same ? min(pc.a, uCap) : 0.;
  o = vec4(mix(pc.rgb, L, 1. / (hc + 1.)), hc + 1.);
  oSig = vec4(sigId, sigT, 0., 1.);
}`;

  let progSky, progTrace, skyTex, skySmall, blockTex;
  function init() {
    progSky = GL.program('sky', skyFS, GLSL.common + GLSL.atmosphere);
    progTrace = GL.program('stone', traceFS, GLSL.common);
    skyTex = GL.target(SKY_W, SKY_H, { format: 'rgba16f' });
    skySmall = GL.target(SH_W, SH_H, { format: 'rgba32f' });
    blockTex = GL.texture(MAXB * 3 + MAXG * 2, 1, { format: 'rgba32f', filter: 'nearest' });
  }
  // The sky's lighting (spherical harmonics, and the light the plain bounces) for every sun height the evening passes through is
  // measured once at load — a small sky rendered and read back per height — and interpolated as the sun moves: no readbacks later.
  const table = [];
  function buildSunTable(azDeg, e0, e1, step = 0.5) {
    for (let e = e0; e <= e1 + 1e-6; e += step) {
      const d = sunDir(e, azDeg), irr = sunTransmittance(d).map(v => v * SUN_I);
      GL.draw(progSky, { uSun: d, uSunI: SUN_I }, skySmall);
      const r = projectSH(d, readSmall(), irr);
      table.push({ e, sh: r.sh, gb: r.gb });
    }
  }
  const SUN_I = 22;
  const sunDir = (elevDeg, azDeg) => { const e = elevDeg * Math.PI / 180, a = azDeg * Math.PI / 180; return [-Math.sin(a) * Math.cos(e), Math.sin(e), Math.cos(a) * Math.cos(e)]; };
  function setSun(elevDeg, azDeg) {
    // azimuth measured from +z (away from camera) toward -x (left)
    const d = sunDir(elevDeg, azDeg), a = azDeg * Math.PI / 180;
    S.sun = d; S.elev = elevDeg;
    S.sunIrr = sunTransmittance(d).map(v => v * SUN_I);
    // sunlight 9 km up: the cloud deck sees the sun about three degrees lower than the plain does, through less air
    { const e2 = Math.max(0.6, elevDeg + 3) * Math.PI / 180, d2 = [-Math.sin(a) * Math.cos(e2), Math.sin(e2), Math.cos(a) * Math.cos(e2)];
      const fade = Math.min(1, Math.max(0, (elevDeg + 4) / 3)); S.cloudSun = sunTransmittance(d2).map(v => v * SUN_I * fade * (1.2 - 0.2 * fade)); }
    GL.draw(progSky, { uSun: d, uSunI: SUN_I }, skyTex);
    if (table.length) {
      let i = 0; while (i < table.length - 2 && table[i + 1].e < elevDeg) i++;
      const A = table[i], B = table[i + 1] || A, t = B.e > A.e ? Math.max(0, Math.min(1, (elevDeg - A.e) / (B.e - A.e))) : 0;
      S.sh = A.sh.map((v, k) => v + (B.sh[k] - v) * t); S.groundBounce = A.gb.map((v, k) => v + (B.gb[k] - v) * t);
    } else {
      GL.draw(progSky, { uSun: d, uSunI: SUN_I }, skySmall);
      const r = projectSH(d, readSmall(), S.sunIrr); S.sh = r.sh; S.groundBounce = r.gb;
    }
  }
  function readSmall() {
    const gl = GL.gl, px = new Float32Array(SH_W * SH_H * 4);
    gl.bindFramebuffer(gl.FRAMEBUFFER, skySmall.fb); gl.readPixels(0, 0, SH_W, SH_H, gl.RGBA, gl.FLOAT, px); gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return px;
  }
  // the sky's light as order-2 spherical harmonics; the lower hemisphere is the plain itself, lit by sun and sky
  function projectSH(d, px, sunIrr) {
    const W = SH_W, H = SH_H;
    const dirs = [], up = [0, 0, 0];
    for (let j = 0; j < H; j++) {
      const v = (j + 0.5) / H, sv = v * 2 - 1, e = Math.sign(sv) * sv * sv * Math.PI / 2;
      const dOm = Math.cos(e) * (2 * Math.PI / W) * (2 * Math.PI * Math.abs(sv) / H);
      for (let i = 0; i < W; i++) {
        const phi = ((i + 0.5) / W - 0.5) * 2 * Math.PI, o = (j * W + i) * 4;
        const x = Math.cos(e) * Math.cos(phi), y = Math.sin(e), z = Math.cos(e) * Math.sin(phi);
        dirs.push([x, y, z, dOm, px[o], px[o + 1], px[o + 2]]);
        if (y > 0) for (let ch = 0; ch < 3; ch++) up[ch] += px[o + ch] * y * dOm;   // irradiance on the plain from the sky
      }
    }
    // the plain (albedo ~0.4) lit by the sun and by the sky above it
    const gb = sunIrr.map((v, ch) => 0.40 * (v * Math.max(0, d[1]) + up[ch]) / Math.PI + 0.002);
    const c = new Float32Array(27);
    for (const [x, y, z, dOm, r, g, b] of dirs) {
      const L = y < 0 ? gb : [r, g, b];
      const Y = [0.282095, 0.488603 * y, 0.488603 * z, 0.488603 * x, 1.092548 * x * y, 1.092548 * y * z, 0.315392 * (3 * z * z - 1), 1.092548 * x * z, 0.546274 * (x * x - y * y)];
      for (let k = 0; k < 9; k++) for (let ch = 0; ch < 3; ch++) c[k * 3 + ch] += L[ch] * Y[k] * dOm;
    }
    return { sh: c, gb };
  }
  // blocks are sorted along x and gathered in groups of GS, each with a bounding box, so a ray tests a few boxes and the blocks
  // inside the ones it meets rather than every block
  function setBlocks(blocks) {
    S.blocks = blocks; const D = S.data; D.fill(0);
    const n = Math.min(blocks.length, MAXB);
    const order = blocks.slice(0, n).map((b, i) => [i, (b.q[0][0] + b.q[1][0] + b.q[2][0] + b.q[3][0]) * 0.25]).sort((a, b) => a[1] - b[1]).map(e => e[0]);
    let ng = 0;
    for (let g0 = 0; g0 < n; g0 += GS, ng++) {
      const lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9], cnt = Math.min(GS, n - g0);
      for (let k = 0; k < cnt; k++) {
        const b = blocks[order[g0 + k]], o = (g0 + k) * 12;
        for (let v = 0; v < 4; v++) { const [x, y] = b.q[v]; D[o + 2 * v] = x; D[o + 2 * v + 1] = y; lo[0] = Math.min(lo[0], x); hi[0] = Math.max(hi[0], x); lo[1] = Math.min(lo[1], y); hi[1] = Math.max(hi[1], y); }
        D[o + 8] = b.z0; D[o + 9] = b.z1; D[o + 10] = (b.mat || 0) + 4 * ((b.uid || 0) % 1000000); D[o + 11] = b.seed || 0;
        lo[2] = Math.min(lo[2], b.z0); hi[2] = Math.max(hi[2], b.z1);
      }
      const go = MAXB * 12 + ng * 8;
      D.set([lo[0] - 1e-3, lo[1] - 1e-3, lo[2] - 1e-3, g0, hi[0] + 1e-3, hi[1] + 1e-3, hi[2] + 1e-3, cnt], go);
    }
    S.nb = n; S.ng = ng; GL.upload(blockTex, D, MAXB * 3 + MAXG * 2, 1);
  }
  function trace(target, prev, cam, frame, cap, moved) {
    GL.draw(progTrace, {
      uBlocks: blockTex, uNG: { i: S.ng || 0 }, uSky: skyTex.tex, uPrev: prev.texs[0], uPrevSig: prev.texs[1],
      uSun: S.sun, uSunIrr: S.sunIrr, uSunCos: S.sunCos, uCloudSun: S.cloudSun || S.sunIrr,
      uCam: cam.pos, uTanH: cam.tanH, uShift: cam.shift, uRes: [target.w, target.h],
      uFrame: { i: frame }, uCap: cap, uHaze: cam.haze || 2.2e-5, uSH: { v3: S.sh }, uMoved: moved ? 1 : 0,
    }, target);
  }
  return { S, init, setSun, buildSunTable, setBlocks, trace, get skyTex() { return skyTex; } };
})();
