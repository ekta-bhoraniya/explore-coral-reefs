// Injected into fish materials via onBeforeCompile. Geometry is baked so head = +X, length 1, centred.
float tailW = smoothstep(0.25, -0.5, transformed.x);
transformed.z += uWiggleAmp * sin(uWiggleFreq * uFishTime - transformed.x * 4.0) * tailW;
