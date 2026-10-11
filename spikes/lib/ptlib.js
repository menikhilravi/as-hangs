// ptlib.js — GLSL snippets for progressive path-traced spikes. Exposes GLK.pt (string).
(function () {
  GLK.pt = `
  // ---------- RNG (per-pixel, per-frame) ----------
  uint _seed;
  void rngInit(vec2 fc, int frame){ _seed = uint(fc.x) * 1973U + uint(fc.y) * 9277U + uint(frame) * 26699U | 1U; }
  float rnd(){ _seed = _seed * 747796405U + 2891336453U; uint w = ((_seed >> ((_seed >> 28U) + 4U)) ^ _seed) * 277803737U; return float((w >> 22U) ^ w) / 4294967296.; }
  vec2 rnd2(){ return vec2(rnd(), rnd()); }

  // ---------- sampling ----------
  vec3 cosHemi(vec3 n){ vec2 u = rnd2(); float r = sqrt(u.x), a = 6.2831853 * u.y;
    vec3 t = normalize(abs(n.y) < .999 ? cross(n, vec3(0,1,0)) : cross(n, vec3(1,0,0))), b = cross(n, t);
    return normalize(t * r * cos(a) + b * r * sin(a) + n * sqrt(1. - u.x)); }
  vec3 coneDir(vec3 d, float cosMax){ vec2 u = rnd2(); float c = 1. - u.x * (1. - cosMax), s = sqrt(1. - c*c), a = 6.2831853 * u.y;
    vec3 t = normalize(abs(d.y) < .999 ? cross(d, vec3(0,1,0)) : cross(d, vec3(1,0,0))), b = cross(d, t);
    return normalize(t * s * cos(a) + b * s * sin(a) + d * c); }

  // ---------- SDF primitives ----------
  float sdBox(vec3 p, vec3 b){ vec3 q = abs(p) - b; return length(max(q, 0.)) + min(max(q.x, max(q.y, q.z)), 0.); }
  float sdRBox(vec3 p, vec3 b, float r){ return sdBox(p, b - r) - r; }
  float sdTorus(vec3 p, vec2 t){ vec2 q = vec2(length(p.xz) - t.x, p.y); return length(q) - t.y; }
  float sdCaps(vec3 p, vec3 a, vec3 b, float r){ vec3 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / dot(ba, ba), 0., 1.); return length(pa - ba * h) - r; }
  float sdCyl(vec3 p, float h, float r){ vec2 d = abs(vec2(length(p.xz), p.y)) - vec2(r, h); return min(max(d.x, d.y), 0.) + length(max(d, 0.)); }
  float sdSeg2(vec2 p, vec2 a, vec2 b){ vec2 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / dot(ba, ba), 0., 1.); return length(pa - ba * h); }
  float smin(float a, float b, float k){ float h = clamp(.5 + .5 * (b - a) / k, 0., 1.); return mix(b, a, h) - k * h * (1. - h); }

  // ---------- BRDF helpers ----------
  float fresnelSchlick(float c, float f0){ return f0 + (1. - f0) * pow(1. - c, 5.); }
  // sample GGX half-vector around n with roughness a
  vec3 ggxH(vec3 n, float a){ vec2 u = rnd2(); float a2 = a*a; float ct = sqrt((1. - u.x) / (1. + (a2 - 1.) * u.x)), st = sqrt(1. - ct*ct), ph = 6.2831853 * u.y;
    vec3 t = normalize(abs(n.y) < .999 ? cross(n, vec3(0,1,0)) : cross(n, vec3(1,0,0))), b = cross(n, t);
    return normalize(t * st * cos(ph) + b * st * sin(ph) + n * ct); }

  // ---------- simple physically-flavoured sky (single-scattering approximation) ----------
  // sunDir: normalized; returns radiance (linear, arbitrary scale ~1 for bright sky)
  vec3 skyRad(vec3 d, vec3 sunDir){
    float mu = dot(d, sunDir);
    float up = max(d.y, 0.);
    // optical depth along view (thicker near horizon)
    float od = 1. / (up + .08 * exp(-up * 12.) + .02);
    vec3 betaR = vec3(5.8, 13.5, 33.1) * .012;   // Rayleigh-ish
    float betaM = .21 * .012;                      // Mie-ish
    float sunUp = max(sunDir.y, 0.);
    float sod = 1. / (sunUp + .08 * exp(-sunUp * 12.) + .02);
    vec3 sunTrans = exp(-(betaR + betaM) * sod * 1.);
    vec3 ext = exp(-(betaR + betaM) * od);
    float phR = .75 * (1. + mu * mu);
    float g = .78, phM = (1. - g*g) / pow(1. + g*g - 2.*g*mu, 1.5) * .25;
    vec3 inscat = (betaR * phR + betaM * phM) / (betaR + betaM) * (1. - ext) * sunTrans;
    return inscat * 7.5;
  }
  vec3 sunRad(vec3 sunDir){ float sunUp = max(sunDir.y, 0.); float sod = 1. / (sunUp + .08 * exp(-sunUp * 12.) + .02);
    return exp(-(vec3(5.8, 13.5, 33.1) * .012 + .21*.012) * sod) * 30000.; }
  `;
})();
