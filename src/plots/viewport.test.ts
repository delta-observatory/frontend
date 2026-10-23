import { describe, expect, it } from 'vitest';
import { boundRange, zoomRange } from './viewport';
describe('display time ranges', () => {
  it('preserves width when panning against either boundary', () => {
    expect(boundRange([-2, 3], [0, 20])).toEqual([0, 5]);
    expect(boundRange([18, 23], [0, 20])).toEqual([15, 20]);
    expect(boundRange([-5, 30], [0, 20])).toEqual([0, 20]);
  });
  it('keeps the pointer time fixed while zooming', () => {
    expect(zoomRange([0, 20], 5, 0.5, [0, 20])).toEqual([2.5, 12.5]);
    expect(zoomRange([2.5, 12.5], 5, 2, [0, 20])).toEqual([0, 20]);
  });
  it('rejects invalid ranges and retains a positive minimum width', () => {
    expect(boundRange([NaN, 3], [0, 20])).toEqual([0, 20]);
    expect(boundRange([5, 5], [0, 20])[1]).toBeCloseTo(5.01);
    expect(zoomRange([0, 20], 5, -1, [0, 20])).toEqual([0, 20]);
  });
});
