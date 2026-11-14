// One combined post pass: refraction wobble + radial swim blur + colour grade + snorkel mask.
uniform sampler2D tDiffuse;
uniform float uTime;
uniform float uWobble;     // UV amplitude
uniform float uBlur;       // 0..1 radial blur
uniform float uExposure;
uniform float uSaturation;
uniform vec3 uTint;
uniform float uTintAmt;
uniform float uMask;       // 0..1 mask edge
uniform float uAspect;
uniform float uFlash;      // white flash 0..1
varying vec2 vUv;
#include <common_water>

void main() {
  vec2 uv = vUv;
  if (uWobble > 0.0) {
    float top = mix(0.6, 1.4, uv.y);
    vec2 n = vec2(snoise(uv * 3.0 + vec2(0.0, uTime * 0.03 * 10.0)), snoise(uv * 3.0 + vec2(5.2, -uTime * 0.03 * 10.0)));
    n += 0.5 * vec2(snoise(uv * 7.0 + uTime * 0.5), snoise(uv * 7.0 - uTime * 0.45 + 3.1));
    uv += n * uWobble * top;
  }
  vec3 col;
  if (uBlur > 0.001) {
    vec2 dir = uv - 0.5;
    col = vec3(0.0);
    for (int i = 0; i < 10; i++) {
      float s = 1.0 - uBlur * 0.12 * (float(i) / 9.0);
      col += texture2D(tDiffuse, 0.5 + dir * s).rgb;
    }
    col /= 10.0;
  } else {
    col = texture2D(tDiffuse, uv).rgb;
  }
  // grade
  col *= uExposure;
  float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col = mix(vec3(l), col, uSaturation);
  col = mix(col, col * uTint * 1.6, uTintAmt);

  // snorkel mask: soft rounded-rectangle vignette with a faint chromatic fringe
  if (uMask > 0.0) {
    vec2 p = (vUv - 0.5) * vec2(uAspect, 1.0) * 2.0;
    vec2 halfSize = vec2(uAspect, 1.0) * 0.98;
    vec2 q = abs(p) - halfSize + 0.42;
    float dist = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - 0.42;
    float edge = smoothstep(-0.28, 0.06, dist);
    vec3 fringe = vec3(smoothstep(-0.10, 0.02, dist), smoothstep(-0.13, 0.0, dist), smoothstep(-0.16, -0.02, dist));
    col = mix(col, col * (1.0 - fringe * 0.35), uMask);
    col = mix(col, vec3(0.01, 0.03, 0.05), edge * 0.85 * uMask);
  }
  col = mix(col, vec3(1.0), uFlash);
  gl_FragColor = vec4(col, 1.0);
}
