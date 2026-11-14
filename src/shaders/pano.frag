// Panorama sphere: two equirect textures (A -> B swim crossfade), caustics on the reef, shimmer at the surface.
uniform sampler2D uPanoA;
uniform sampler2D uPanoB;
uniform float uMix;
uniform float uYawA;      // radians, extra rotation per panorama (devTwin)
uniform float uYawB;
uniform float uZoomA;     // >0 pulls directions toward uForward (zoom in)
uniform float uZoomB;
uniform vec3 uForward;
uniform float uTime;
uniform float uCaustics;
uniform float uShimmer;
uniform float uDepth;
varying vec3 vDir;
#include <common_water>

const float PI = 3.14159265359;

vec3 zoomDir(vec3 d, float k) { return normalize(d + uForward * k); }

vec3 samplePano(sampler2D tex, vec3 d, float yawOff) {
  float lon = atan(d.x, -d.z) - yawOff;
  float lat = asin(clamp(d.y, -1.0, 1.0));
  vec2 uv = vec2(fract(0.5 + lon / (2.0 * PI)), 0.5 + lat / PI);
  return texture2D(tex, uv).rgb;
}

void main() {
  vec3 d = normalize(vDir);
  vec3 a = samplePano(uPanoA, zoomDir(d, uZoomA), uYawA);
  vec3 col = a;
  if (uMix > 0.0) {
    vec3 b = samplePano(uPanoB, zoomDir(d, uZoomB), uYawB);
    col = mix(a, b, uMix);
  }
  float lum = dot(col, vec3(0.299, 0.587, 0.114));

  // Caustics on the reef below the horizon, projected onto a floor plane.
  if (d.y < 0.0 && uCaustics > 0.0) {
    vec2 p = d.xz / max(-d.y, 0.06) * uDepth;
    float c = caustic(p * 1.6, uTime * 0.9);
    float downness = smoothstep(0.05, 0.6, -d.y);
    col += c * 0.12 * uCaustics * downness * (0.35 + lum * 1.4) * vec3(0.85, 1.0, 1.0);
  }
  // Surface shimmer overhead.
  if (d.y > 0.35 && uShimmer > 0.0) {
    vec2 p = d.xz / d.y * 3.0;
    float c = caustic(p * 1.3, uTime * 1.6);
    col += c * 0.15 * uShimmer * smoothstep(0.35, 0.7, d.y) * vec3(0.9, 1.0, 1.0);
  }
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}
