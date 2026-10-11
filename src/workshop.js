// workshop.js — the world below the line: a lamp-lit room where the chain hangs from a beam (model metres, 1:20).
'use strict';
const Workshop = (() => {
  const MAXL = 160, MAXC = 40, CL = 6;   // links, link clusters (CL consecutive links share a bounding sphere)
  const W = { links: null, nl: 0, nc: 0, data: new Float32Array(MAXL * 8 + MAXC * 4), sacks: [] };
  // link proportions (metres): wire diameter d, centreline radius R, straight half-length HL (set from pitch)
  const D = 0.0085, RR = 0.0125;
  let HL = 0.006;

  const traceFS = `
uniform sampler2D uLinks; uniform int uNL; uniform int uNC; uniform vec4 uChainBox; uniform float uHL; uniform vec2 uHooks[8]; uniform int uNH; uniform vec4 uEnds[4]; uniform int uNE;
uniform vec4 uSacks[12]; uniform int uNS;
uniform sampler2D uPrev; uniform vec3 uCam; uniform float uTanH; uniform float uShift; uniform vec2 uRes;
uniform int uFrame; uniform float uCap; uniform sampler2D uPrevSig; uniform float uMoved; uniform vec3 uLamp; uniform vec3 uLampTop; uniform float uLampR; uniform vec3 uLampE; uniform float uAperture; uniform float uFocus; uniform int uBounces; uniform float uClampL; uniform float uWindowK;
const float RR = ${RR.toFixed(5)}, RW = ${(D / 2).toFixed(5)};
layout(location = 1) out vec4 oSig;
// room
const float WALLZ = .24, FLOORY = -2.6, SIDEX = 6., FRONTZ = -3.2;

vec4 L0(int j){ return texelFetch(uLinks, ivec2(2 * j, 0), 0); }
vec4 L1(int j){ return texelFetch(uLinks, ivec2(2 * j + 1, 0), 0); }
float linkSD(int j, vec3 p){
  vec4 a = L0(j), b = L1(j); vec3 q = p - vec3(a.xy, 0.);
  float u = dot(q.xy, a.zw), v = dot(q.xy, vec2(-a.w, a.z)), w = q.z;
  if (b.x > .5){ float t = v; v = w; w = t; }
  float dc = length(vec2(max(abs(u) - uHL, 0.), v)) - RR;
  return length(vec2(dc, w)) - RW;
}
float hookSD(vec3 p, float x){ // screw shank into the ceiling, closed eye below; the chain hangs from the eye
  vec3 q = p - vec3(x, -.0215, 0.);
  float ring = length(vec2(length(q.xy) - .0095, q.z)) - .0034;
  float shank = length(vec2(q.x, q.z)) - .0033; shank = max(shank, max(q.y - .0215, -(q.y - .009)));
  float plate = max(length(q.xz) - .012, abs(q.y - .0205) - .0012);
  return min(min(ring, shank), plate);
}
// an open S-hook on a loose chain's end: a wire bent into a J below the last link, its point turned back up — it wants hooking
float endHookSD(vec3 p, vec4 e){
  vec2 u = e.zw, v = vec2(-u.y, u.x);
  vec3 q = p - vec3(e.xy, 0.); vec2 l = vec2(dot(q.xy, u), dot(q.xy, v));
  float wire = .0026;
  float shank = length(vec3(max(abs(l.x - .009) - .009, 0.), l.y, q.z)) - wire;
  vec2 c = l - vec2(.018, .0085);                                   // the bend: half a ring past the shank
  float ring = length(vec2(length(vec2(c.x, c.y)) - .0085, q.z)) - wire;
  ring = max(ring, -c.x - .001);
  float tip = length(vec3(max(abs(l.x - .0135) - .0045, 0.), l.y - .017, q.z)) - wire * .9;
  return min(min(shank, ring), tip);
}
float sackSD(vec3 p, vec4 s){ // s: x, y (hanging node), mass, seed — a jute sack of shot: pear-shaped, gathered neck, tied
  float sz = .021 * pow(max(s.z, .5), .38);
  vec3 top = vec3(s.x, s.y - .016, 0.);
  vec3 q = p - (top - vec3(0., .035 + sz * 1.2, 0.));
  // body: heavy bottom sphere blended into a narrower upper lobe (the shot pools at the bottom)
  float lower = length(q / vec3(1., .92, .96)) - sz;
  float upper = length((q - vec3(0., sz * .95, 0.)) / vec3(1., 1.3, 1.)) - sz * .58;
  float k = sz * .6; float h = clamp(.5 + .5 * (upper - lower) / k, 0., 1.);
  float body = mix(upper, lower, h) - k * h * (1. - h);
  // cloth folds running up into the gather, and lumpy shot
  float ang = atan(q.z, q.x);
  body += .0014 * sin(ang * 9. + q.y * 120. + s.w) * smoothstep(-.2, 1.2, q.y / sz) + .0011 * gnoise(q * 260. + s.w);
  // gathered neck and the cord tied round it, up to the link
  vec3 nq = p - top; float neckH = .03;
  float neck = length(vec2(length(nq.xz) - 0., max(abs(nq.y + neckH * .5) - neckH * .5, 0.))) - (.0035 + .0025 * smoothstep(-neckH, -neckH * .4, nq.y));
  float tie = length(vec2(length(nq.xz) - .0052, nq.y + neckH * .62)) - .0013;
  float kk = .006; float hh = clamp(.5 + .5 * (neck - body) / kk, 0., 1.);
  return min(mix(neck, body, hh) - kk * hh * (1. - hh), tie);
}
float sphereHit(vec3 ro, vec3 rd, vec3 c, float r, out float t1){
  vec3 oc = ro - c; float b = dot(oc, rd), cc = dot(oc, oc) - r * r, h = b * b - cc;
  if (h < 0.) { t1 = -1.; return -1.; } h = sqrt(h); t1 = -b + h; return -b - h;
}
// returns t, normal, material id: 1 wall, 2 ceiling/boards, 3 beam, 4 floor, 5 iron link, 6 hook, 7 sack, 8 lamp, 9 window
// the things in the room that cast shadows: chain links (found through their clusters), hooks, sacks. With shadow set, the first
// hit closer than t ends the search.
float objects(vec3 ro, vec3 rd, float t, inout float mat, bool shadow){
  for (int c = 0; c < ${MAXC}; c++){
    if (c >= uNC) break;
    vec4 C = texelFetch(uLinks, ivec2(${MAXL * 2} + c, 0), 0);
    float tB; float tA = sphereHit(ro, rd, vec3(C.xy, 0.), C.z, tB);
    if (tB < 0. || tA > t) continue;
    int j0 = int(mod(C.w, 1000.) + .5), nj = int(C.w / 1000.);
    for (int jj = 0; jj < ${CL}; jj++){
      if (jj >= nj) break; int j = j0 + jj;
      vec4 a = L0(j); float tB2; float tA2 = sphereHit(ro, rd, vec3(a.xy, 0.), uHL + RR + RW + .002, tB2);
      if (tB2 < 0. || tA2 > t) continue;
      float tt = max(tA2, 0.);
      for (int k = 0; k < 28; k++){
        float d = linkSD(j, ro + rd * tt);
        if (d < 2e-5){ if (tt < t){ t = tt; mat = 5. + float(j) * .0001; if (shadow) return t; } break; }
        tt += d; if (tt > tB2) break;
      }
    }
  }
  for (int s = 0; s < 8; s++){
    if (s >= uNH) break;
    float x = uHooks[s].x;
    float tB; float tA = sphereHit(ro, rd, vec3(x, -.016, 0.), .03, tB);
    if (tB > 0. && tA < t){ float tt = max(tA, 0.); for (int k = 0; k < 32; k++){ float d = hookSD(ro + rd * tt, x); if (d < 2e-5){ if (tt < t){ t = tt; mat = 6.; if (shadow) return t; } break; } tt += d; if (tt > tB) break; } }
  }
  for (int s = 0; s < 4; s++){
    if (s >= uNE) break; vec4 e = uEnds[s];
    float tB; float tA = sphereHit(ro, rd, vec3(e.xy + e.zw * .016, 0.), .03, tB);
    if (tB > 0. && tA < t){ float tt = max(tA, 0.); for (int k = 0; k < 40; k++){ float d = endHookSD(ro + rd * tt, e); if (d < 2e-5){ if (tt < t){ t = tt; mat = 6.2 + float(s) * .01; if (shadow) return t; } break; } tt += d * .8; if (tt > tB) break; } }
  }
  for (int s = 0; s < 12; s++){
    if (s >= uNS) break; vec4 sk = uSacks[s];
    // bounds grow with the sack (a heavy one hangs lower and wider)
    float sz = .021 * pow(max(sk.z, .5), .38), yT = sk.y - .012, yB = sk.y - .055 - 2.15 * sz;
    float tB; float tA = sphereHit(ro, rd, vec3(sk.x, (yT + yB) * .5, 0.), (yT - yB) * .5 + .004, tB);
    if (tB > 0. && tA < t){ float tt = max(tA, 0.); for (int k = 0; k < 40; k++){ float d = sackSD(ro + rd * tt, sk); if (d < 3e-5){ if (tt < t){ t = tt; mat = 7. + float(s) * .01; if (shadow) return t; } break; } tt += d * .8; if (tt > tB) break; } }
  }
  return t;
}
float trace(vec3 ro, vec3 rd, out vec3 n, out float mat){
  float t = 1e9; mat = 0.; n = vec3(0);
  // room planes
  if (rd.z > 0.){ float tt = (WALLZ - ro.z) / rd.z; if (tt < t){ t = tt; n = vec3(0, 0, -1); mat = 1.; } }
  if (rd.z < 0.){ float tt = (FRONTZ - ro.z) / rd.z; if (tt < t){ t = tt; n = vec3(0, 0, 1); mat = 1.; } }
  if (rd.y > 0.){ float tt = -ro.y / rd.y; if (tt < t){ t = tt; n = vec3(0, -1, 0); mat = 2.; } }
  if (rd.y < 0.){ float tt = (FLOORY - ro.y) / rd.y; if (tt < t){ t = tt; n = vec3(0, 1, 0); mat = 4.; } }
  if (rd.x > 0.){ float tt = (SIDEX - ro.x) / rd.x; if (tt < t){ t = tt; n = vec3(-1, 0, 0); mat = 1.; } }
  if (rd.x < 0.){ float tt = (-SIDEX - ro.x) / rd.x; if (tt < t){ t = tt; n = vec3(1, 0, 0); mat = 1.; } }
  // window on the right wall
  if (mat == 1. && n.x < -.5){ vec3 p = ro + rd * t; if (abs(p.z + 1.9) < .45 && p.y > -1.0 && p.y < -.2) mat = 9.; }
  // lamp cord (a thin cylinder from its hook in the ceiling to the bulb, which may be swinging) and the bulb's cap
  { vec3 up = normalize(uLampTop - uLamp), cc = uLamp + up * (uLampR * .9 + .006);
    vec3 ba = uLampTop - cc, oc = ro - cc; float baba = dot(ba, ba), bard = dot(ba, rd), baoc = dot(ba, oc);
    float k2 = baba - bard * bard, k1 = baba * dot(oc, rd) - baoc * bard, k0 = baba * dot(oc, oc) - baoc * baoc - .0022 * .0022 * baba, h = k1 * k1 - k2 * k0;
    if (h > 0. && k2 > 1e-12){ float tc = (-k1 - sqrt(h)) / k2, y = baoc + tc * bard;
      if (tc > 0. && tc < t && y > 0. && y < baba){ t = tc; mat = 6.5; n = normalize(oc + tc * rd - ba * y / baba); } }
    float t1; float tcap = sphereHit(ro, rd, cc, .009, t1);
    if (tcap > 0. && tcap < t){ t = tcap; mat = 6.5; n = normalize(ro + rd * tcap - cc); } }
  // lamp bulb
  { float t1; float tl = sphereHit(ro, rd, uLamp, uLampR, t1); if (tl > 0. && tl < t){ t = tl; mat = 8.; n = normalize(ro + rd * tl - uLamp); } }
  float m0 = mat;
  t = objects(ro, rd, t, mat, false);
  if (mat != m0 && mat >= 5. && mat < 8.){
    vec3 p = ro + rd * t; vec2 e = vec2(5e-5, 0.);
    if (mat < 6.){ int j = int(round((mat - 5.) * 10000.)); n = normalize(vec3(linkSD(j, p + e.xyy) - linkSD(j, p - e.xyy), linkSD(j, p + e.yxy) - linkSD(j, p - e.yxy), linkSD(j, p + e.yyx) - linkSD(j, p - e.yyx))); }
    else if (mat > 6.15 && mat < 6.3){ int s = int(round((mat - 6.2) * 100.)); vec4 en = uEnds[s]; n = normalize(vec3(endHookSD(p + e.xyy, en) - endHookSD(p - e.xyy, en), endHookSD(p + e.yxy, en) - endHookSD(p - e.yxy, en), endHookSD(p + e.yyx, en) - endHookSD(p - e.yyx, en))); }
    else if (mat == 6.){ float x = uHooks[0].x, bd = 9.; for (int s = 0; s < 8; s++){ if (s >= uNH) break; float d = abs(p.x - uHooks[s].x); if (d < bd){ bd = d; x = uHooks[s].x; } } n = normalize(vec3(hookSD(p + e.xyy, x) - hookSD(p - e.xyy, x), hookSD(p + e.yxy, x) - hookSD(p - e.yxy, x), hookSD(p + e.yyx, x) - hookSD(p - e.yyx, x))); }
    else { int s = int(round((mat - 7.) * 100.)); vec4 sk = uSacks[s]; vec2 e2 = vec2(2e-4, 0.); n = normalize(vec3(sackSD(p + e2.xyy, sk) - sackSD(p - e2.xyy, sk), sackSD(p + e2.yxy, sk) - sackSD(p - e2.yxy, sk), sackSD(p + e2.yyx, sk) - sackSD(p - e2.yyx, sk))); }
  }
  return mat == 0. ? -1. : t;
}
// the room is a convex box, so only the things in it can shadow a light
bool occluded(vec3 ro, vec3 rd, float maxT){ float m = 0.; objects(ro, rd, maxT, m, true); return m != 0.; }

struct Mt { vec3 alb; vec3 f0; float rough; vec3 n; float metal; };
Mt material(float mat, vec3 p, vec3 n, bool detail){
  Mt m; m.n = n; m.f0 = vec3(.04); m.rough = .9; m.metal = 0.;
  if (mat == 1. && !detail){ // plaster seen by a bounce: broad colour only
    vec2 q = n.z != 0. ? p.xy : (n.x != 0. ? p.zy : p.xz);
    vec3 c = mix(vec3(.60, .54, .45), vec3(.70, .64, .54), fbm2(q * 3.1, 2));
    m.alb = c * (1. - smoothstep(-.5, .0, p.y) * .25);
  } else if (mat == 1.){ // plaster, warm, trowelled, stained
    vec2 q = n.z != 0. ? p.xy : (n.x != 0. ? p.zy : p.xz);
    float big = fbm2(q * 3.1, 4), mid = fbm2(q * 18., 3), fine = vnoise(q * 160.);
    vec3 c = mix(vec3(.60, .54, .45), vec3(.70, .64, .54), big);
    c *= .92 + .1 * mid; c *= .97 + .05 * fine;
    float stain = smoothstep(.55, .78, fbm2(q * 1.4 + 3.7, 5)); c = mix(c, c * vec3(.78, .70, .58), stain * .6);
    float soot = smoothstep(-.5, .0, p.y) * .25; c *= 1. - soot;      // darker toward the ceiling
    m.alb = c;
    vec2 e = vec2(.004, 0.); float h0 = fbm2(q * 7., 3);
    vec3 tA = ortho(n), tB = cross(n, tA);
    m.n = normalize(n + (tA * (fbm2((q + e.xy) * 7., 3) - h0) + tB * (fbm2((q + e.yx) * 7., 3) - h0)) / e.x * .006);
  } else if (mat == 2.){ // ceiling boards
    float pl = abs(fract(p.z * 6.5) - .5); float grain = fbm2(vec2(p.x * 3., p.z * 60.), 4);
    m.alb = mix(vec3(.18, .11, .06), vec3(.27, .17, .09), grain) * (1. - .55 * smoothstep(.44, .5, pl));
  } else if (mat == 3.){ // (unused)
    float grain = fbm2(vec2(p.x * 2.2, (p.y + p.z) * 70.), 5);
    m.alb = mix(vec3(.13, .075, .04), vec3(.24, .15, .08), grain); m.rough = .7;
    m.alb *= .85 + .3 * fbm2(p.xz * 9., 3);
  } else if (mat == 4.){ m.alb = vec3(.16, .13, .1) * (.8 + .4 * fbm2(p.xz * 4., 3)); }
  else if (mat >= 5. && mat < 7.){ // blackened iron with rust in patches
    float rust = smoothstep(.45, .75, fbm3(p * 90., 4));
    m.metal = 1. - rust * .85; m.f0 = mix(vec3(.36, .35, .33), vec3(.10, .06, .04), rust); m.alb = mix(vec3(.04), vec3(.28, .12, .05), rust);
    m.rough = mix(.36, .85, rust) + .08 * gnoise(p * 400.);
  } else if (mat >= 7. && mat < 8.){ // jute sack: coarse weave, darker where the cloth creases, a pale cord tied round the neck
    int si = int(round((mat - 7.) * 100.)); vec4 sk = uSacks[si];
    float sz = .021 * pow(max(sk.z, .5), .38);
    vec3 q = p - vec3(sk.x, sk.y - .016, 0.);
    float weave = sin(p.x * 900.) * sin(p.y * 900.) * .5 + .5; float n2 = fbm3(p * 160., 3);
    m.alb = mix(vec3(.30, .22, .13), vec3(.47, .37, .23), n2) * (.8 + .2 * weave);
    float ang = atan(q.z, q.x); float crease = .5 + .5 * sin(ang * 9. + q.y * 120. + sk.w);
    m.alb *= .78 + .22 * crease;
    float cord = smoothstep(.0024, .0012, abs(q.y + .03 * .62));
    m.alb = mix(m.alb, vec3(.62, .55, .42), cord * step(length(q.xz), .009));
    m.rough = .95;
  }
  return m;
}
// light sampling: the bulb (sphere) and a cool window
vec3 lightAt(vec3 p, vec3 ng, Mt m, vec3 v){
  vec3 L = vec3(0);
  // bulb
  vec3 lp = uLamp + normalize(vec3(rnd() - .5, rnd() - .5, rnd() - .5)) * uLampR * .9;
  vec3 ld = lp - p; float dist = length(ld); ld /= dist;
  float c = dot(m.n, ld);
  if (c > 0. && dot(ng, ld) > 0. && !occluded(p + ng * 2e-4, ld, dist - uLampR * 1.05)){
    float omega = PI * uLampR * uLampR / (dist * dist);
    vec3 h = normalize(ld + v); float nh = max(dot(m.n, h), 0.), a2 = m.rough * m.rough * m.rough * m.rough;
    float Dg = a2 / (PI * pow(nh * nh * (a2 - 1.) + 1., 2.));
    vec3 F = m.f0 + (1. - m.f0) * pow(1. - max(dot(h, v), 0.), 5.);
    vec3 spec = Dg * F / (4. * max(dot(m.n, v), .05));
    L += uLampE * omega * (m.alb * (1. - m.metal) / PI * c + spec);
  }
  // window (area light on the right wall)
  vec3 wp = vec3(SIDEX - .001, -.6 + (rnd() - .5) * .8, -1.9 + (rnd() - .5) * .9);
  vec3 wd = wp - p; float wdist = length(wd); wd /= wdist;
  float cw = dot(m.n, wd), cl = max(dot(vec3(-1, 0, 0), -wd), 0.);
  if (cw > 0. && cl > 0. && !occluded(p + ng * 2e-4, wd, wdist - .002)) L += vec3(.42, .52, .7) * 7.3 * uWindowK * m.alb * (1. - m.metal * .7) / PI * cw * cl * (.8 * .9) / (wdist * wdist);
  return L;
}

void main(){
  vec2 fc = gl_FragCoord.xy; rngInit(fc + 913., uFrame);
  vec2 px = fc + rnd2() - .5;
  float sx = (px.x - .5 * uRes.x) / uRes.y, sy = px.y / uRes.y;   // sy: 0 at the mirror line, 1 at the bottom
  vec3 rd = normalize(vec3(sx * uTanH, -(sy * uTanH + uShift), 1.));
  vec3 ro = uCam;
  // thin lens focused on the chain plane
  { float ft = uFocus / rd.z; vec3 fp = ro + rd * ft; vec2 a = rnd2(); float r = uAperture * sqrt(a.x), an = TAU * a.y;
    ro += vec3(cos(an), sin(an), 0.) * r; rd = normalize(fp - ro); }
  vec3 L = vec3(0), Lbulb = vec3(0), thr = vec3(1); float sigM = -1., sigT = 0.;
  // the history is judged on the ray through the pixel's centre (no jitter, no lens offset)
  { vec3 nc; float mc; vec3 rdc = normalize(vec3((fc.x - .5 * uRes.x) / uRes.y * uTanH, -(fc.y / uRes.y * uTanH + uShift), 1.)); float tc = trace(uCam, rdc, nc, mc); sigM = floor(mc * 10000.); sigT = tc; }
  for (int b = 0; b < 3; b++){
    if (b >= uBounces) break;
    vec3 n; float mat; float t = trace(ro, rd, n, mat);
    if (t < 0.) break;
    vec3 p = ro + rd * t;
    if (mat == 8.){
      // the bulb seen directly: a frosted globe, brightest round the filament at its heart, warmer toward its rim
      if (b == 0){ float mu = max(dot(n, -rd), 0.); Lbulb = uLampE * (.012 + .07 * pow(mu, 3.)) * mix(vec3(1., .78, .55), vec3(1.), mu); }
      break; }
    if (mat == 9.){ L += thr * vec3(.42, .52, .7) * .55 * uWindowK * (b == 0 ? 1. : 0.); break; }
    Mt m = material(mat, p, n, b == 0);
    vec3 v = -rd;
    { vec3 c = thr * lightAt(p, n, m, v); if (b > 0) c = min(c, vec3(.6)); L += c; }
    // bounce
    if (m.metal > .5){
      float a = m.rough * m.rough; vec2 u = rnd2();
      float ct = sqrt((1. - u.x) / (1. + (a * a - 1.) * u.x)), st = sqrt(1. - ct * ct), ph = TAU * u.y;
      vec3 tA = ortho(m.n), tB = cross(m.n, tA); vec3 h = normalize(tA * st * cos(ph) + tB * st * sin(ph) + m.n * ct);
      vec3 nd = reflect(rd, h); if (dot(nd, n) <= 0.) break;
      thr *= m.f0 + (1. - m.f0) * pow(1. - max(dot(h, v), 0.), 5.);
      rd = nd;
    } else { rd = cosHemi(m.n, rnd2()); if (dot(rd, n) < 0.) rd = reflect(rd, n); thr *= m.alb; }
    ro = p + n * 2e-4;
  }
  L = min(L, vec3(uClampL)) + Lbulb;   // fireflies: clamped hard while the room moves (few samples), gently once still; the bulb itself never
  vec4 ps = texelFetch(uPrevSig, ivec2(gl_FragCoord.xy), 0);
  bool same = uMoved < .5 || (abs(ps.x - sigM) < .5 && abs(ps.y - sigT) < max(.006, sigT * .03));
  vec4 pc = texelFetch(uPrev, ivec2(gl_FragCoord.xy), 0);
  if (any(isnan(L)) || any(isinf(L))) { L = same ? pc.rgb : vec3(0); }
  float nn = same ? min(pc.a, uCap) : 0.;
  o = vec4(mix(pc.rgb, L, 1. / (nn + 1.)), nn + 1.);
  oSig = vec4(sigM, sigT, 0., 1.);
}`;

  let prog, linkTex;
  function init() {
    prog = GL.program('workshop', traceFS, GLSL.common);
    linkTex = GL.texture(MAXL * 2 + MAXC, 1, { format: 'rgba32f', filter: 'nearest' });
  }
  // nodes: chain node positions (model metres); links span consecutive nodes
  // several chains: links of each span consecutive nodes; hooks are the chains' fixed ends
  function setChains(list, pitch, hooks, ends = []) {
    W.ends = ends;
    HL = Math.max(0.001, pitch / 2 + D / 2 - RR);
    const d = W.data; d.fill(0); let m = 0;
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    let nc = 0; const reach = HL + RR + D / 2 + 0.004;
    for (const nodes of list) {
      const first = m;
      for (let j = 0; j < nodes.length - 1 && m < MAXL; j++, m++) {
        const a = nodes[j], b = nodes[j + 1]; const cx = (a[0] + b[0]) / 2, cy = (a[1] + b[1]) / 2; let ax = b[0] - a[0], ay = b[1] - a[1]; const l = Math.hypot(ax, ay) || 1; ax /= l; ay /= l;
        d.set([cx, cy, ax, ay, j & 1, 0, 0, 0], m * 8);
        x0 = Math.min(x0, cx); x1 = Math.max(x1, cx); y0 = Math.min(y0, cy); y1 = Math.max(y1, cy);
      }
      // clusters of consecutive links within this chain
      for (let s0 = first; s0 < m && nc < MAXC; s0 += CL, nc++) {
        const cnt = Math.min(CL, m - s0); let sx = 0, sy = 0;
        for (let k = s0; k < s0 + cnt; k++) { sx += d[k * 8]; sy += d[k * 8 + 1]; }
        sx /= cnt; sy /= cnt; let r = 0;
        for (let k = s0; k < s0 + cnt; k++) r = Math.max(r, Math.hypot(d[k * 8] - sx, d[k * 8 + 1] - sy));
        d.set([sx, sy, r + reach, s0 + cnt * 1000], MAXL * 8 + nc * 4);
      }
    }
    W.nl = m; W.nc = nc; W.box = [x0, y0, x1, y1]; W.hooks = hooks.slice(0, 8);
    GL.upload(linkTex, d, MAXL * 2 + MAXC, 1);
  }
  const ED = new Float32Array(16);
  function endData() { ED.fill(0); (W.ends || []).slice(0, 4).forEach((e, i) => ED.set(e, i * 4)); return ED; }
  function trace(target, prev, cam, frame, cap, opts = {}) {
    const sacks = new Float32Array(48); const ns = Math.min(12, W.sacks.length);
    W.sacks.slice(0, 12).forEach((s, k) => sacks.set([s.x, s.y, s.m, s.seed || k * 7.3], k * 4));
    GL.draw(prog, {
      uLinks: linkTex, uNL: { i: W.nl }, uNC: { i: W.nc }, uChainBox: W.box || [0, 0, 0, 0], uHL: HL, uHooks: { v2: new Float32Array((W.hooks || []).flatMap(h => [h, 0]).concat(new Array(16).fill(0)).slice(0, 16)) }, uNH: { i: (W.hooks || []).length }, uEnds: { v4: endData() }, uNE: { i: Math.min(4, (W.ends || []).length) },
      uSacks: { v4: sacks }, uNS: { i: ns },
      uPrev: prev.texs[0], uPrevSig: prev.texs[1], uCam: cam.pos, uTanH: cam.tanH, uShift: cam.shift, uRes: [target.w, target.h],
      uFrame: { i: frame }, uCap: cap, uMoved: opts.moved ? 1 : 0,
      uLamp: opts.lamp || [-0.66, -0.36, -0.42], uLampTop: opts.lampTop || [-0.66, 0, -0.42], uLampR: 0.022, uLampE: opts.lampE || [560, 340, 150],
      uAperture: opts.aperture ?? 0.004, uFocus: opts.focus ?? 2.1, uBounces: { i: opts.bounces || 3 }, uClampL: opts.clampL || 9, uWindowK: opts.windowK ?? 1,
    }, target);
  }
  return { W, init, setChains, trace };
})();
