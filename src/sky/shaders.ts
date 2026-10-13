// GLSL for the stereographic sky projection. Every sky layer uses these uniforms.
// Vertex positions are unit vectors in the equatorial frame.

export const projectionChunk = /* glsl */ `
uniform vec3 uR;
uniform vec3 uU;
uniform vec3 uF;
uniform float uK;
uniform vec2 uRes;
uniform float uDpr;
// Points farther than this angle from the view center are not drawn (about 149 degrees).
const float THETA_LIMIT = 2.6;

vec4 skyClip(vec3 v, out float theta) {
  float a = dot(v, uR), b = dot(v, uU), c = dot(v, uF);
  theta = acos(clamp(c, -1.0, 1.0));
  float rho = max(length(vec2(a, b)), 1e-9);
  vec2 px = vec2(a, b) / rho * 2.0 * uK * tan(min(theta, 3.1) * 0.5);
  return vec4(px / (uRes * 0.5), 0.0, 1.0);
}
`;

export const lineVertex = /* glsl */ `
${projectionChunk}
attribute float aAlong;
varying float vTheta;
varying float vAlong;
void main() {
  gl_Position = skyClip(position, vTheta);
  vAlong = aAlong;
}
`;

export const lineFragment = /* glsl */ `
uniform vec4 uColor;
uniform float uDash;
varying float vTheta;
varying float vAlong;
void main() {
  if (vTheta > 2.6) discard;
  if (uDash > 0.0 && mod(vAlong, uDash) > uDash * 0.62) discard;
  gl_FragColor = uColor;
}
`;

export const starVertex = /* glsl */ `
${projectionChunk}
uniform float uZoom;
attribute float aSize;
attribute float aGlow;
attribute vec3 aColor;
varying vec3 vColor;
varying float vGlow;
void main() {
  float theta;
  gl_Position = skyClip(position, theta);
  vColor = aColor;
  vGlow = aGlow;
  gl_PointSize = theta > 2.6 ? 0.0 : aSize * sqrt(uZoom) * (1.0 + 3.0 * aGlow) * uDpr;
}
`;

export const starFragment = /* glsl */ `
varying vec3 vColor;
varying float vGlow;
void main() {
  float r = length(gl_PointCoord - 0.5) * 2.0 * (1.0 + 3.0 * vGlow);
  float core = 1.0 - smoothstep(0.7, 1.0, r);
  float halo = vGlow * 0.35 * exp(-r * r * 0.5);
  float a = max(core, halo);
  if (a < 0.01) discard;
  gl_FragColor = vec4(vColor, a);
}
`;

export const targetVertex = /* glsl */ `
${projectionChunk}
attribute float aShape;
attribute float aState;
attribute vec3 aColor;
varying float vShape;
varying float vState;
varying float vSize;
varying vec3 vColor;
void main() {
  float theta;
  gl_Position = skyClip(position, theta);
  float radius = aState > 1.5 ? 6.0 : 4.0;
  vSize = 2.0 * (radius * 1.4 + 2.0);
  gl_PointSize = theta > 2.6 ? 0.0 : vSize * uDpr;
  vShape = aShape;
  vState = aState;
  vColor = aColor;
}
`;

// Outline markers: circle for a planet host, square for no known planet, diamond for an eclipsing binary.
export const targetFragment = /* glsl */ `
varying float vShape;
varying float vState;
varying float vSize;
varying vec3 vColor;
void main() {
  vec2 p = (gl_PointCoord - 0.5) * vSize;
  float radius = vState > 1.5 ? 6.0 : 4.0;
  float d;
  if (vShape < 0.5) d = length(p);
  else if (vShape < 1.5) d = max(abs(p.x), abs(p.y));
  else d = (abs(p.x) + abs(p.y)) / 1.3;
  float ring = 1.0 - smoothstep(0.55, 1.25, abs(d - radius));
  float alpha = ring * (vState > 0.5 && vState < 1.5 ? 0.22 : 1.0);
  if (alpha < 0.01) discard;
  gl_FragColor = vec4(vColor, alpha);
}
`;

// Milky Way glow: an analytic band around the galactic equator. It is a drawn model, not data.
export const milkyWayVertex = /* glsl */ `
void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

export const milkyWayFragment = /* glsl */ `
${projectionChunk}
uniform mat3 uGal;
uniform vec3 uColor;
uniform float uAlpha;
void main() {
  vec2 px = gl_FragCoord.xy / uDpr - uRes * 0.5;
  vec2 ab = px / uK;
  float rho = max(length(ab), 1e-9);
  float th = 2.0 * atan(rho * 0.5);
  float s = sin(th);
  vec3 v = (s * ab.x / rho) * uR + (s * ab.y / rho) * uU + cos(th) * uF;
  vec3 g = uGal * v;
  float b = degrees(asin(clamp(g.z, -1.0, 1.0)));
  float l = atan(g.y, g.x);
  // A narrow core and a wide wing. Both are brighter toward the galactic center (l = 0).
  float core = exp(-(b * b) / (2.0 * 4.0 * 4.0));
  float wing = 0.45 * exp(-(b * b) / (2.0 * 12.0 * 12.0));
  float a = (core + wing) * (0.4 + 0.6 * pow(0.5 + 0.5 * cos(l), 1.5)) * uAlpha;
  gl_FragColor = vec4(uColor, a);
}
`;
