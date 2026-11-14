varying float vAlpha;
uniform vec3 uColor;
uniform float uOpacity;
void main() {
  float d = length(gl_PointCoord - 0.5);
  float a = smoothstep(0.5, 0.0, d) * vAlpha * uOpacity;
  if (a < 0.01) discard;
  gl_FragColor = vec4(uColor, a);
}
