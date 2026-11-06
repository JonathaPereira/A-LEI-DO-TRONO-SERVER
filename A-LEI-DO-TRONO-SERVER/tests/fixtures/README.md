`speech-flite.ogg` is a synthetic speech fixture generated locally with FFmpeg's
libflite `slt` voice. It contains no user's recording. Text: "Testing the
microphone. Keep my voice clear while reducing background noise."

Generation command:

```bash
ffmpeg -f lavfi -i "flite=text='Testing the microphone. Keep my voice clear while reducing background noise.':voice=slt" -ar 48000 -ac 1 -c:a libopus -b:a 32k speech-flite.ogg
```

The RNNoise check mixes this signal with deterministic noise and measures real
worklet output. It verifies noise attenuation and that speech is not silenced;
it is not a listening-quality benchmark for physical microphones.
