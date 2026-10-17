import { describe, expect, it } from 'vitest';
import { DRAG_THRESHOLD_PX, clampSliderValue, decimalsOf, sliderValueFromDrag, snapSliderValue } from './slider';

describe('slider math', () => {
  it('exposes a 3-5px drag threshold', () => {
    expect(DRAG_THRESHOLD_PX).toBeGreaterThanOrEqual(3);
    expect(DRAG_THRESHOLD_PX).toBeLessThanOrEqual(5);
  });

  it('counts decimal places for step precision', () => {
    expect(decimalsOf(1)).toBe(0);
    expect(decimalsOf(0.5)).toBe(1);
    expect(decimalsOf(0.05)).toBe(2);
  });

  it('clamps values into range', () => {
    expect(clampSliderValue(5, 0, 10)).toBe(5);
    expect(clampSliderValue(-3, 0, 10)).toBe(0);
    expect(clampSliderValue(99, 0, 10)).toBe(10);
  });

  it('snaps to the nearest step and clamps', () => {
    expect(snapSliderValue(21.3, 20, 34, 0.5)).toBe(21.5);
    expect(snapSliderValue(21.2, 20, 34, 0.5)).toBe(21);
    expect(snapSliderValue(19, 20, 34, 0.5)).toBe(20);
    expect(snapSliderValue(40, 20, 34, 0.5)).toBe(34);
  });

  it('does not accumulate float drift when snapping', () => {
    for (let v = 1.1; v <= 1.6 + 1e-9; v += 0.05) {
      const snapped = snapSliderValue(v, 1.1, 1.6, 0.05);
      expect(snapped).toBeCloseTo(Number(v.toFixed(2)), 10);
    }
  });

  it('maps a drag delta to a relative value change', () => {
    const params = { startValue: 20, trackWidth: 200, min: 20, max: 34, step: 0.5 };
    // Half the track = half the range = +7.
    expect(sliderValueFromDrag({ ...params, dx: 100 })).toBe(27);
    expect(sliderValueFromDrag({ ...params, dx: -100 })).toBe(20); // clamped at the 20% minimum
    expect(sliderValueFromDrag({ ...params, dx: 0 })).toBe(20);
  });

  it('never returns a value below the minimum (body-start boundary)', () => {
    for (const dx of [-500, -50, -10, -1]) {
      expect(sliderValueFromDrag({ startValue: 20, dx, trackWidth: 300, min: 20, max: 34, step: 0.5 })).toBe(20);
    }
  });

  it('returns the start value when the track has no width', () => {
    expect(sliderValueFromDrag({ startValue: 24, dx: 40, trackWidth: 0, min: 20, max: 34, step: 0.5 })).toBe(24);
  });
});
