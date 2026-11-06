/** Only static avatars are cropped; animated GIFs and cover/background files keep their bytes. */
export async function formatProfilePhoto(
  file: File,
  { avatar = true }: { avatar?: boolean } = {},
): Promise<File> {
  if (!file || file.size > 10_000_000 || !/^image\/(jpeg|png|webp|gif)$/.test(file.type))
    throw new Error('Escolha JPG, PNG, WebP ou GIF de até 10 MB.');
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  try {
    if (bitmap.width * bitmap.height > 40_000_000) throw new Error('Reduza a resolução da imagem.');
    if (!avatar || file.type === 'image/gif') return file;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 256;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Não foi possível preparar a foto.');
    const side = Math.min(bitmap.width, bitmap.height);
    context.drawImage(
      bitmap,
      (bitmap.width - side) / 2,
      (bitmap.height - side) / 2,
      side,
      side,
      0,
      0,
      256,
      256,
    );
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('Não foi possível preparar a foto.');
    return new File([blob], 'avatar.png', { type: 'image/png' });
  } finally {
    bitmap.close();
  }
}
