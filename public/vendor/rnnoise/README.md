# RNNoise bundled with the frontend

Source: `@shiguredo/rnnoise-wasm@2025.1.5`, distributed through the npm registry.
The upstream build pins xiph/rnnoise commit
`70f1d256acd4b34a572f999a05c87bf00b67730d` and Emscripten 4.0.8.

- Wrapper: Apache 2.0 (`LICENSE-APACHE-2.0.txt`).
- RNNoise/model: BSD (`LICENSE-RNNOISE.txt`).
- `worklet.js`: application adapter for mono 48 kHz audio and 480-sample frames.

The original package embeds WASM as base64 in `dist/rnnoise.js`. We decode
those exact bytes into `rnnoise.wasm` and serve them with the site; no remote
audio processing service or CDN is used.

Local adaptations to `runtime.js`: replace the embedded `CA()` decoder with
an ArrayBuffer supplied by `loadBinary()`, add that loader method, and accept
AudioWorkletGlobalScope in the environment check. Runtime assertions and
WebAssembly validation remain enabled. The model itself is unchanged.

SHA-256 of the source npm tarball:
`8e0690aee3f83fd80f45fbe69a5a243808f7a5bd42e0e28501f34dbe14700bb1`

SHA-256 of `rnnoise.wasm` (3,600,944 bytes):
`b3b67c9eae8f0791aad468c708659e0850bb37b0fb9c8a8666f2d7b0b6869bc4`

Publish this entire folder along with the frontend. HTTPS (or localhost for
development), WebAssembly and AudioWorklet are required. Initialization is
confirmed through a ready/error handshake; each microphone instance frees
its denoising state when it is replaced or stopped. The 128/480 adaptation
buffers 512 samples (about 10.7 ms) in addition to RNNoise's algorithm delay.
