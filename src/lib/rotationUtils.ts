/**
 * Normalize a rotation value to the range [0, 360).
 *
 * JavaScript's `%` operator preserves the sign of the dividend, so
 * `-90 % 360` gives `-90` rather than `270`. The double-modulo trick
 * `((n % 360) + 360) % 360` corrects for negative inputs.
 */
export function normalizeRotation(current: number, delta: number): number {
  return ((current + delta) % 360 + 360) % 360;
}
