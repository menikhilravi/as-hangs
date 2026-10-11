// glsl.js — shared GLSL: constants, hashing, noise, sampling, atmosphere.
'use strict';
const GLSL = {};

GLSL.common = `
#define PI 3.14159265359
#define TAU 6.28318530718
// ---- hashing (pcg-ish), per-pixel RNG
uint pcg(uint v){ uint s = v * 747796405u + 2891336453u; uint w = ((s >> ((s >> 28u) + 4u)) ^ s) * 277803737u; return (w >> 22u) ^ w; }
float h11(float x){ return float(pcg(floatBitsToUint(x))) / 4294967296.; }
float h21(vec2 p){ return float(pcg(floatBitsToUint(p.x) ^ pcg(floatBitsToUint(p.y)))) / 4294967296.; }
float h31(vec3 p){ return float(pcg(floatBitsToUint(p.x) ^ pcg(floatBitsToUint(p.y) ^ pcg(floatBitsToUint(p.z))))) / 4294967296.; }
uint _rs;
void rngInit(vec2 fc, int frame){ _rs = pcg(uint(fc.x) + pcg(uint(fc.y) + pcg(uint(frame) * 9781u))); }
float rnd(){ _rs = pcg(_rs); return float(_rs) / 4294967296.; }
vec2 rnd2(){ return vec2(rnd(), rnd()); }

// ---- gradient noise (3D), fbm
vec3 _g3(vec3 p){ uint h = pcg(floatBitsToUint(p.x) ^ pcg(floatBitsToUint(p.y) ^ pcg(floatBitsToUint(p.z))));
  return normalize(vec3(float(h & 1023u), float((h >> 10) & 1023u), float((h >> 20) & 1023u)) / 511.5 - 1.); }
float gnoise(vec3 p){
  vec3 i = floor(p), f = fract(p), u = f * f * f * (f * (f * 6. - 15.) + 10.);
  float n000 = dot(_g3(i), f), n100 = dot(_g3(i + vec3(1,0,0)), f - vec3(1,0,0));
  float n010 = dot(_g3(i + vec3(0,1,0)), f - vec3(0,1,0)), n110 = dot(_g3(i + vec3(1,1,0)), f - vec3(1,1,0));
  float n001 = dot(_g3(i + vec3(0,0,1)), f - vec3(0,0,1)), n101 = dot(_g3(i + vec3(1,0,1)), f - vec3(1,0,1));
  float n011 = dot(_g3(i + vec3(0,1,1)), f - vec3(0,1,1)), n111 = dot(_g3(i + vec3(1,1,1)), f - vec3(1,1,1));
  return mix(mix(mix(n000, n100, u.x), mix(n010, n110, u.x), u.y), mix(mix(n001, n101, u.x), mix(n011, n111, u.x), u.y), u.z);
}
float fbm3(vec3 p, int oct){ float s = 0., a = .5; for (int i = 0; i < 8; i++){ if (i >= oct) break; s += a * gnoise(p); p = p * 2.03 + vec3(11.7, 3.1, 7.9); a *= .5; } return s; }
// value noise 2D (cheap)
float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
  return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }
float fbm2(vec2 p, int oct){ float s = 0., a = .5; for (int i = 0; i < 8; i++){ if (i >= oct) break; s += a * vnoise(p); p = p * 2.07 + 13.1; a *= .5; } return s; }
// cellular: distance to nearest and second-nearest feature (2D)
vec2 cell2(vec2 p){ vec2 i = floor(p), f = fract(p); float d1 = 9., d2 = 9.;
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++){ vec2 g = vec2(x, y); vec2 o = vec2(h21(i + g), h21(i + g + 17.3));
    float d = length(g + o - f); if (d < d1){ d2 = d1; d1 = d; } else if (d < d2) d2 = d; }
  return vec2(d1, d2); }

// ---- sampling
vec3 ortho(vec3 n){ return normalize(abs(n.y) < .99 ? cross(n, vec3(0,1,0)) : cross(n, vec3(1,0,0))); }
vec3 cosHemi(vec3 n, vec2 u){ float r = sqrt(u.x), a = TAU * u.y; vec3 t = ortho(n), b = cross(n, t);
  return normalize(t * r * cos(a) + b * r * sin(a) + n * sqrt(max(0., 1. - u.x))); }
vec3 cone(vec3 d, float cosMax, vec2 u){ float c = 1. - u.x * (1. - cosMax), s = sqrt(max(0., 1. - c * c)), a = TAU * u.y; vec3 t = ortho(d), b = cross(d, t);
  return normalize(t * s * cos(a) + b * s * sin(a) + d * c); }

// ---- tone mapping (AgX-like fit) and sRGB
vec3 agx(vec3 c){
  const mat3 inMat = mat3(.842479, .0423282, .0423756, .0784336, .878468, .0784336, .0792237, .0791661, .879142);
  const mat3 outMat = mat3(1.19688, -.0528968, -.0529716, -.0980208, 1.15190, -.0980434, -.0990297, -.0989612, 1.15107);
  c = inMat * max(c, 1e-10);
  c = clamp((log2(c) + 12.47393) / 16.5, 0., 1.);
  vec3 c2 = c * c, c4 = c2 * c2;
  c = 15.5 * c4 * c2 - 40.14 * c4 * c + 31.96 * c4 - 6.868 * c2 * c + .4298 * c2 + .1191 * c - .00232;
  c = outMat * c;
  return clamp(pow(max(c, 0.), vec3(2.2)), 0., 1.);
}
// hue-preserving filmic: ACES-style curve on luminance, gentle desaturation where channels would clip
vec3 filmic(vec3 c){
  c = max(c, 0.);
  float l = dot(c, vec3(.2126, .7152, .0722));
  float lt = l * (2.51 * l + .03) / (l * (2.43 * l + .59) + .14);
  vec3 r = c * (lt / max(l, 1e-6));
  float mx = max(r.r, max(r.g, r.b));
  if (mx > 1.) r = mix(r, vec3(lt), clamp((mx - 1.) / mx * 1.4, 0., 1.));
  return clamp(r, 0., 1.);
}
vec3 toSRGB(vec3 c){ return mix(c * 12.92, 1.055 * pow(c, vec3(1. / 2.4)) - .055, step(.0031308, c)); }
`;

// Single-scattering atmosphere (Nishita / Scratchapixel style), used to precompute an equirectangular sky.
GLSL.atmosphere = `
const float RE = 6360e3, RA = 6420e3, HR = 7994., HM = 1500.;
const vec3 BR = vec3(5.8e-6, 13.5e-6, 33.1e-6); const float BM = 30e-6, GMIE = .76;
const vec3 BO = vec3(.650e-6, 1.881e-6, .085e-6); // ozone absorption (Chappuis band)
float ozone(float h){ return max(0., 1. - abs(h - 25000.) / 15000.); }
vec2 raySphere(vec3 ro, vec3 rd, float r){ float b = dot(ro, rd), c = dot(ro, ro) - r * r, d = b * b - c; if (d < 0.) return vec2(1, -1); d = sqrt(d); return vec2(-b - d, -b + d); }
// returns in-scattered radiance along a ray from height h (metres), direction d; sun direction s; sunI intensity
vec3 atmo(vec3 d, vec3 s, float h, float sunI, float maxDist, out vec3 trans){
  vec3 ro = vec3(0., RE + h, 0.);
  vec2 ta = raySphere(ro, d, RA); float tEnd = ta.y;
  vec2 tg = raySphere(ro, d, RE); if (tg.x > 0.) tEnd = min(tEnd, tg.x);
  tEnd = min(tEnd, maxDist);
  const int N = 20, NL = 8;
  float seg = tEnd / float(N), odR = 0., odM = 0., odO = 0.;
  vec3 sR = vec3(0), sM = vec3(0);
  float mu = dot(d, s);
  float phR = 3. / (16. * PI) * (1. + mu * mu);
  float g2 = GMIE * GMIE; float phM = 3. / (8. * PI) * ((1. - g2) * (1. + mu * mu)) / ((2. + g2) * pow(1. + g2 - 2. * GMIE * mu, 1.5));
  for (int i = 0; i < N; i++){
    vec3 p = ro + d * (seg * (float(i) + .5));
    float hh = length(p) - RE;
    float dr = exp(-hh / HR) * seg, dm = exp(-hh / HM) * seg;
    odR += dr; odM += dm; odO += ozone(hh) * seg;
    vec2 tl = raySphere(p, s, RA); float segL = tl.y / float(NL), lR = 0., lM = 0., lO = 0.; bool shadow = false;
    for (int j = 0; j < NL; j++){ vec3 q = p + s * (segL * (float(j) + .5)); float hq = length(q) - RE; if (hq < 0.){ shadow = true; break; } lR += exp(-hq / HR) * segL; lM += exp(-hq / HM) * segL; lO += ozone(hq) * segL; }
    if (!shadow){ vec3 tau = BR * (odR + lR) + BM * 1.1 * (odM + lM) + BO * (odO + lO); vec3 att = exp(-tau); sR += att * dr; sM += att * dm; }
  }
  trans = exp(-(BR * odR + BM * 1.1 * odM + BO * odO));
  vec3 single = sR * BR * phR + sM * BM * phM;
  // multiple scattering, roughly isotropic for air but not for haze (Mie stays forward-peaked): only a little of the haze term
  vec3 multi = (sR * BR * .9 + sM * BM * .3) * (1. / (4. * PI));
  return sunI * (single + multi);
}
`;
