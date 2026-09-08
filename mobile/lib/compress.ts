import * as ImageManipulator from 'expo-image-manipulator';

const MAX_DIMENSION = 1920;
const JPEG_QUALITY = 0.82;

/**
 * Compress and resize an image URI before uploading.
 * - Caps longest side at MAX_DIMENSION px
 * - Re-encodes as JPEG at JPEG_QUALITY
 * Returns a new local URI to the compressed file.
 */
export async function compressImage(uri: string): Promise<string> {
  const result = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: MAX_DIMENSION } }],
    { compress: JPEG_QUALITY, format: ImageManipulator.SaveFormat.JPEG },
  );
  return result.uri;
}
