// Rechenkern für den Container-Scanner: Vermessung, Wand-Treffer, Foto-Projektion.
// Koordinaten "lokal" = Planer-Koordinaten: x entlang Länge, y nach oben (0 = Erdboden), z quer.
import * as THREE from 'three';

export const FLOOR_TOP = 0.16;                       // Innenboden über Erdboden (wie im Planer)
export const IN_OFF = { L: 0.16, W: 0.086, H: 0.198 }; // ISO-Container: außen minus innen
export const NORM = [
  { k: '10',   n: "10' Mini",      L: 2.991,  W: 2.438, H: 2.591 },
  { k: '20',   n: "20' Standard",  L: 6.058,  W: 2.438, H: 2.591 },
  { k: '20hc', n: "20' High Cube", L: 6.058,  W: 2.438, H: 2.896 },
  { k: '40',   n: "40' Standard",  L: 12.192, W: 2.438, H: 2.591 },
  { k: '40hc', n: "40' High Cube", L: 12.192, W: 2.438, H: 2.896 },
];
export const WALL_KEYS = ['links', 'rechts', 'hinten', 'vorne'];
const OUT_N = {
  links: new THREE.Vector3(0, 0, -1), rechts: new THREE.Vector3(0, 0, 1),
  hinten: new THREE.Vector3(-1, 0, 0), vorne: new THREE.Vector3(1, 0, 0),
};
export const isLong = (k) => k === 'links' || k === 'rechts';

/**
 * Baut das Container-Koordinatensystem aus drei Bodenpunkten.
 * A und B: entlang einer Längsseite. C: Ecke gegenüber von A (gleiche Stirnseite wie B = "vorne").
 * mode 'aussen': Punkte am Erdboden außen. mode 'innen': Punkte am Innenboden in den Ecken.
 */
export function makeFrame(A, B, C, mode) {
  const y0 = (A.y + B.y + C.y) / 3;
  const ex = new THREE.Vector3(B.x - A.x, 0, B.z - A.z);
  const lenAB = ex.length(); ex.normalize();
  const up = new THREE.Vector3(0, 1, 0);
  const ez = new THREE.Vector3().crossVectors(ex, up).normalize(); // rechtshändig
  const bc = new THREE.Vector3(C.x - B.x, 0, C.z - B.z);
  const wid = Math.abs(bc.dot(ez));
  const O = new THREE.Vector3((A.x + C.x) / 2, 0, (A.z + C.z) / 2);
  // Mitte exakt aus dem Rechteck bestimmen (A + ex*L/2 + Seite*W/2)
  const side = Math.sign(bc.dot(ez)) || 1;
  O.copy(new THREE.Vector3(A.x, 0, A.z).addScaledVector(ex, lenAB / 2).addScaledVector(ez, side * wid / 2));
  const f = { O, ex, ez, up, mode };
  if (mode === 'innen') {
    f.Li = lenAB; f.Wi = wid; f.L = lenAB + IN_OFF.L; f.W = wid + IN_OFF.W;
    O.y = y0 - FLOOR_TOP;
    f.Hi = 2.393; f.H = f.Hi + IN_OFF.H;
  } else {
    f.L = lenAB; f.W = wid; f.Li = lenAB - IN_OFF.L; f.Wi = wid - IN_OFF.W;
    O.y = y0;
    f.H = 2.591; f.Hi = f.H - IN_OFF.H;
  }
  f.matrix = new THREE.Matrix4().makeBasis(ex, up, ez).setPosition(O); // lokal -> Welt
  f.inv = f.matrix.clone().invert();
  return f;
}
export function setHeight(f, h, kind) { // h = gemessene Höhe des aktiven Kastens
  if (kind === 'innen') { f.Hi = h; f.H = h + IN_OFF.H; } else { f.H = h; f.Hi = h - IN_OFF.H; }
}
export function box(f, kind) {
  return kind === 'innen'
    ? { hx: f.Li / 2, hz: f.Wi / 2, y0: FLOOR_TOP, y1: FLOOR_TOP + f.Hi }
    : { hx: f.L / 2, hz: f.W / 2, y0: 0, y1: f.H };
}
export const toLocal = (f, p) => p.clone().applyMatrix4(f.inv);
export const dirToLocal = (f, d) => new THREE.Vector3(d.dot(f.ex), d.dot(f.up), d.dot(f.ez));

/** Strahl (Welt) gegen die virtuellen Wände des Kastens. Liefert nächsten Treffer. */
export function rayWall(f, originW, dirW, kind) {
  const o = toLocal(f, originW), d = dirToLocal(f, dirW).normalize(), b = box(f, kind);
  const planes = [
    { wall: 'links', ax: 'z', c: -b.hz }, { wall: 'rechts', ax: 'z', c: b.hz },
    { wall: 'hinten', ax: 'x', c: -b.hx }, { wall: 'vorne', ax: 'x', c: b.hx },
  ];
  let best = null;
  for (const p of planes) {
    if (Math.abs(d[p.ax]) < 1e-6) continue;
    const t = (p.c - o[p.ax]) / d[p.ax];
    if (t < 0.05) continue;
    const q = o.clone().addScaledVector(d, t);
    const other = p.ax === 'z' ? q.x : q.z, half = p.ax === 'z' ? b.hx : b.hz;
    if (Math.abs(other) > half + 0.05 || q.y < b.y0 - 0.2 || q.y > b.y1 + 0.4) continue;
    if (!best || t < best.t) best = { wall: p.wall, t, u: other, y: q.y, local: q };
  }
  return best;
}

/** Öffnung aus zwei diagonalen Eckpunkten auf derselben Wand. */
export function openingFrom(h1, h2, type) {
  if (!h1 || !h2 || h1.wall !== h2.wall) return null;
  const u = (h1.u + h2.u) / 2, w = Math.abs(h1.u - h2.u), yb = Math.min(h1.y, h2.y), h = Math.abs(h1.y - h2.y);
  if (w < 0.2 || h < 0.2) return null;
  const r = (n) => Math.round(n * 100) / 100;
  return { wall: h1.wall, type, u: r(u), w: r(w), h: r(h), sill: r(Math.max(0, yb - FLOOR_TOP)) };
}

/** Nächstes Normmaß, falls Messung nahe dran ist. */
export function nearestNorm(L, W, H, tol = 0.12) {
  let best = null;
  for (const n of NORM) {
    const e = Math.max(Math.abs(n.L - L), Math.abs(n.W - W), Math.abs(n.H - H));
    if (e <= tol && (!best || e < best.e)) best = { ...n, e };
  }
  return best;
}

/** Ausdehnung einer Wandseite in Planer-Koordinaten (u horizontal, v = Höhe über Erdboden). */
export function wallExtents(f, wall, side) {
  const long = isLong(wall);
  if (side === 'out') {
    const half = long ? f.L / 2 : f.W / 2, c = long ? f.W / 2 : f.L / 2;
    return { u0: -half, u1: half, v0: 0, v1: f.H, c };
  }
  const half = long ? f.Li / 2 : f.Wi / 2, c = long ? f.Wi / 2 : f.Li / 2;
  return { u0: -half, u1: half, v0: FLOOR_TOP, v1: FLOOR_TOP + f.Hi, c };
}
function localPoint(wall, u, v, c) {
  const s = (wall === 'links' || wall === 'hinten') ? -1 : 1;
  return isLong(wall) ? [u, v, s * c] : [s * c, v, u];
}

/**
 * Projiziert Fotos auf eine Wandseite.
 * captures: [{ data: Uint8Array RGBA (Zeile 0 = unten, GL-Reihenfolge), w, h, vp: Matrix4 Welt->Clip, pos: Vector3 Welt }]
 * Rückgabe: { pixels: Uint8ClampedArray RGBA (Zeile 0 = oben), w, h, coverage, extents } oder null.
 */
export function buildWallTexture(f, wall, side, captures, pxPerM = 160) {
  const ext = wallExtents(f, wall, side);
  const n = OUT_N[wall].clone(); if (side === 'in') n.negate();
  const b = box(f, 'aussen'), bi = box(f, 'innen');
  const center = new THREE.Vector3(...localPoint(wall, 0, (ext.v0 + ext.v1) / 2, ext.c));
  const cands = [];
  for (const cap of captures) {
    const cl = toLocal(f, cap.pos);
    const inside = Math.abs(cl.x) < bi.hx && Math.abs(cl.z) < bi.hz;
    const outside = Math.abs(cl.x) > b.hx || Math.abs(cl.z) > b.hz;
    if (side === 'in' ? !inside : !outside) continue;
    const dir = cl.clone().sub(center); const dist = dir.length(); dir.normalize();
    const facing = dir.dot(n);
    if (facing < 0.15) continue;
    const M = new THREE.Matrix4().multiplyMatrices(cap.vp, f.matrix).elements;
    cands.push({ cap, M, score: facing / Math.max(1, dist) });
  }
  if (!cands.length) return null;
  cands.sort((a, b2) => b2.score - a.score);
  const W = Math.max(16, Math.min(2048, Math.round((ext.u1 - ext.u0) * pxPerM)));
  const H = Math.max(16, Math.min(1024, Math.round((ext.v1 - ext.v0) * pxPerM)));
  const out = new Uint8ClampedArray(W * H * 4);
  let covered = 0, sr = 0, sg = 0, sb = 0;
  const mask = new Uint8Array(W * H);
  for (let r = 0; r < H; r++) {
    const v = ext.v1 - (r + 0.5) / H * (ext.v1 - ext.v0);
    for (let i = 0; i < W; i++) {
      const u = ext.u0 + (i + 0.5) / W * (ext.u1 - ext.u0);
      const [x, y, z] = localPoint(wall, u, v, ext.c);
      for (const c of cands) {
        const e = c.M;
        const cw = e[3] * x + e[7] * y + e[11] * z + e[15];
        if (cw <= 0.01) continue;
        const nx = (e[0] * x + e[4] * y + e[8] * z + e[12]) / cw;
        const ny = (e[1] * x + e[5] * y + e[9] * z + e[13]) / cw;
        if (nx < -0.985 || nx > 0.985 || ny < -0.985 || ny > 0.985) continue;
        const cap = c.cap;
        const px = Math.min(cap.w - 1, Math.floor((nx + 1) / 2 * cap.w));
        const py = Math.min(cap.h - 1, Math.floor((ny + 1) / 2 * cap.h));
        const si = (py * cap.w + px) * 4, di = (r * W + i) * 4;
        out[di] = cap.data[si]; out[di + 1] = cap.data[si + 1]; out[di + 2] = cap.data[si + 2]; out[di + 3] = 255;
        sr += out[di]; sg += out[di + 1]; sb += out[di + 2];
        mask[r * W + i] = 1; covered++;
        break;
      }
    }
  }
  if (!covered) return null;
  const ar = sr / covered, ag = sg / covered, ab = sb / covered;
  for (let k = 0; k < W * H; k++) if (!mask[k]) { out[k * 4] = ar; out[k * 4 + 1] = ag; out[k * 4 + 2] = ab; out[k * 4 + 3] = 255; }
  return { pixels: out, mask, w: W, h: H, coverage: covered / (W * H), extents: { u0: ext.u0, u1: ext.u1, v0: ext.v0, v1: ext.v1 } };
}
