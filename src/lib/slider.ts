/**
 * Pure math for the drag-only slider. Kept separate from the React component so
 * the value mapping can be unit-tested without a DOM.
 */

/** Pointer must move at least this many CSS pixels before a drag starts. */
export const DRAG_THRESHOLD_PX = 4;

export function decimalsOf(step: number): number {
  const text = String(step);
  const dot = text.indexOf('.');
  return dot < 0 ? 0 : text.length - dot - 1;
}

export function clampSliderValue(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Clamps to `[min, max]` and snaps to the nearest `step`, avoiding float drift. */
export function snapSliderValue(value: number, min: number, max: number, step: number): number {
  if (step <= 0) return clampSliderValue(value, min, max);
  const steps = Math.round((value - min) / step);
  const snapped = min + steps * step;
  return clampSliderValue(Number(snapped.toFixed(decimalsOf(step))), min, max);
}

export interface DragInput {
  /** Value when the thumb was first pressed. */
  startValue: number;
  /** Horizontal pointer delta since the press, in CSS pixels. */
  dx: number;
  /** Width (px) of the draggable travel, i.e. the track's inner width. */
  trackWidth: number;
  min: number;
  max: number;
  step: number;
}

/**
 * Maps a drag delta to a new value relative to the value at press time. Using a
 * relative delta (rather than the absolute pointer position) keeps the thumb
 * from jumping when the user grabs it off-centre.
 */
export function sliderValueFromDrag({ startValue, dx, trackWidth, min, max, step }: DragInput): number {
  if (trackWidth <= 0) return snapSliderValue(startValue, min, max, step);
  const raw = startValue + (dx / trackWidth) * (max - min);
  return snapSliderValue(raw, min, max, step);
}
