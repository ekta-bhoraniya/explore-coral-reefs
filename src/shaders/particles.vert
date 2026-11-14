// Marine snow: positions drift and wrap inside a box around the camera (GPU only).
uniform float uTime;
uniform float uBox;
uniform float uPixelRatio;
attribute float aSize;
attribute float aSeed;
varying float vAlpha;
void main() {
  vec3 p = position;
  p.y -= uTime * (0.03 + aSeed * 0.05);
  p.x += sin(uTime * 0.21 + aSeed * 31.0) * 0.4 + uTime * 0.02;
  p.z += cos(uTime * 0.17 + aSeed * 17.0) * 0.4;
  p = mod(p + uBox * 0.5, uBox) - uBox * 0.5;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  float dist = -mv.z;
  vAlpha = smoothstep(0.3, 1.2, dist) * (1.0 - smoothstep(4.0, uBox * 0.5, dist));
  gl_PointSize = aSize * uPixelRatio * clamp(4.0 / dist, 0.6, 1.6);
  gl_Position = projectionMatrix * mv;
}
