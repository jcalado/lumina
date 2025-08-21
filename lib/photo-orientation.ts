/**
 * Utility functions for handling photo orientation from EXIF data
 */

// EXIF orientation values mapping
export const ORIENTATION_VALUES = {
  NORMAL: 1,           // 0° - no rotation needed
  FLIP_HORIZONTAL: 2,  // 0° + horizontal flip
  ROTATE_180: 3,       // 180° rotation
  FLIP_VERTICAL: 4,    // 180° + horizontal flip
  TRANSPOSE: 5,        // 90° CCW + horizontal flip
  ROTATE_90_CW: 6,     // 90° CW rotation
  TRANSVERSE: 7,       // 90° CW + horizontal flip
  ROTATE_90_CCW: 8     // 90° CCW rotation
} as const;

/**
 * Get the orientation value from photo metadata
 */
export function getPhotoOrientation(metadata: string | null): number {
  if (!metadata) return ORIENTATION_VALUES.NORMAL;
  
  try {
    const parsed = JSON.parse(metadata);
    return parsed.orientation || ORIENTATION_VALUES.NORMAL;
  } catch (error) {
    console.error('Error parsing photo metadata:', error);
    return ORIENTATION_VALUES.NORMAL;
  }
}

/**
 * Get CSS transform styles for photo orientation
 */
export function getOrientationTransform(orientation: number): string {
  switch (orientation) {
    case ORIENTATION_VALUES.NORMAL:
      return '';
    case ORIENTATION_VALUES.FLIP_HORIZONTAL:
      return 'scaleX(-1)';
    case ORIENTATION_VALUES.ROTATE_180:
      return 'rotate(180deg)';
    case ORIENTATION_VALUES.FLIP_VERTICAL:
      return 'scaleX(-1) rotate(180deg)';
    case ORIENTATION_VALUES.TRANSPOSE:
      return 'rotate(90deg) scaleX(-1)';
    case ORIENTATION_VALUES.ROTATE_90_CW:
      return 'rotate(90deg)';
    case ORIENTATION_VALUES.TRANSVERSE:
      return 'rotate(-90deg) scaleX(-1)';
    case ORIENTATION_VALUES.ROTATE_90_CCW:
      return 'rotate(-90deg)';
    default:
      return '';
  }
}

/**
 * Check if the orientation requires dimension swapping (90° or 270° rotations)
 */
export function requiresDimensionSwap(orientation: number): boolean {
  const rotationOrientations = [
    ORIENTATION_VALUES.TRANSPOSE,
    ORIENTATION_VALUES.ROTATE_90_CW,
    ORIENTATION_VALUES.TRANSVERSE,
    ORIENTATION_VALUES.ROTATE_90_CCW
  ];
  return rotationOrientations.includes(orientation as any);
}
