export type NativePixelFormat = 'bgra' | 'yuv420p' | 'nv12';
/** Packed layouts keep the selected track's native YUV planes when possible. */
export function nativeFrameLayout(format: NativePixelFormat, width: number, height: number) {
  const pixels = width * height;
  if (format === 'yuv420p')
    return {
      format: 'I420' as VideoPixelFormat,
      bytes: pixels * 1.5,
      layout: [
        { offset: 0, stride: width },
        { offset: pixels, stride: width / 2 },
        { offset: pixels * 1.25, stride: width / 2 },
      ],
    };
  if (format === 'nv12')
    return {
      format: 'NV12' as VideoPixelFormat,
      bytes: pixels * 1.5,
      layout: [
        { offset: 0, stride: width },
        { offset: pixels, stride: width },
      ],
    };
  return {
    format: 'BGRA' as VideoPixelFormat,
    bytes: pixels * 4,
    layout: [{ offset: 0, stride: width * 4 }],
  };
}
