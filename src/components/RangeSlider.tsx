import { useCallback, useEffect, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from 'react';
import { DRAG_THRESHOLD_PX, sliderValueFromDrag, snapSliderValue } from '../lib/slider';

export interface SliderChange {
  /** The proposed value. */
  value: number;
  /** True when the change should be treated as a final, undoable edit. */
  committed: boolean;
  /** The value the control had when the interaction began. */
  fromValue: number;
  /** True when the interaction was cancelled (Escape) and `value` is the restore value. */
  cancelled: boolean;
}

interface RangeSliderProps {
  value: number;
  min: number;
  max: number;
  step: number;
  /** id of the element that visually labels this control (used for aria-labelledby). */
  labelId: string;
  /** Fallback accessible name when no visible label element is provided. */
  ariaLabel?: string;
  onChange: (change: SliderChange) => void;
  /** Formats the value for aria-valuetext (e.g. "21.5 percent"). */
  formatValue?: (value: number) => string;
}

const THUMB_SIZE_PX = 44;
const THUMB_INSET_PX = THUMB_SIZE_PX / 2;

export default function RangeSlider({
  value,
  min,
  max,
  step,
  labelId,
  ariaLabel,
  onChange,
  formatValue,
}: RangeSliderProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);
  const startXRef = useRef(0);
  const startValueRef = useRef(value);
  const movedRef = useRef(false);
  const [dragging, setDragging] = useState(false);

  const percent = max > min ? ((value - min) / (max - min)) * 100 : 0;

  const cancelDrag = useCallback(() => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    movedRef.current = false;
    setDragging(false);
    const from = startValueRef.current;
    if (value !== from) {
      onChange({ value: from, committed: false, fromValue: from, cancelled: true });
    }
  }, [onChange, value]);

  // Escape cancels an in-progress drag and restores the value from drag start.
  useEffect(() => {
    if (!dragging) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        cancelDrag();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [dragging, cancelDrag]);

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    // Only the thumb reaches this handler; track clicks never begin a drag.
    event.preventDefault();
    const element = event.currentTarget;
    try {
      element.setPointerCapture(event.pointerId);
    } catch {
      /* Pointer capture is best-effort (not available in every environment). */
    }
    draggingRef.current = true;
    movedRef.current = false;
    startXRef.current = event.clientX;
    startValueRef.current = value;
    setDragging(true);
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;
    const dx = event.clientX - startXRef.current;
    if (!movedRef.current) {
      if (Math.abs(dx) < DRAG_THRESHOLD_PX) return;
      movedRef.current = true;
    }
    const track = trackRef.current;
    const trackWidth = track ? track.getBoundingClientRect().width : 0;
    const next = sliderValueFromDrag({
      startValue: startValueRef.current,
      dx,
      trackWidth,
      min,
      max,
      step,
    });
    if (next !== value) {
      onChange({ value: next, committed: false, fromValue: startValueRef.current, cancelled: false });
    }
  };

  const endDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;
    const element = event.currentTarget;
    try {
      if (element.hasPointerCapture(event.pointerId)) element.releasePointerCapture(event.pointerId);
    } catch {
      /* no-op */
    }
    draggingRef.current = false;
    setDragging(false);
    if (movedRef.current && value !== startValueRef.current) {
      onChange({ value, committed: true, fromValue: startValueRef.current, cancelled: false });
    }
    movedRef.current = false;
  };

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    let next = value;
    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowUp':
        next = snapSliderValue(value + step, min, max, step);
        break;
      case 'ArrowLeft':
      case 'ArrowDown':
        next = snapSliderValue(value - step, min, max, step);
        break;
      case 'PageUp':
        next = snapSliderValue(value + step * 10, min, max, step);
        break;
      case 'PageDown':
        next = snapSliderValue(value - step * 10, min, max, step);
        break;
      case 'Home':
        next = min;
        break;
      case 'End':
        next = max;
        break;
      default:
        return;
    }
    event.preventDefault();
    if (next !== value) {
      onChange({ value: next, committed: true, fromValue: value, cancelled: false });
    }
  };

  return (
    <div className={`range-slider${dragging ? ' range-slider--dragging' : ''}`}>
      <div className="range-slider__track" ref={trackRef} aria-hidden="true">
        <div className="range-slider__fill" style={{ width: `${percent}%` }} />
      </div>
      <div
        className="range-slider__thumb"
        role="slider"
        tabIndex={0}
        aria-orientation="horizontal"
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-valuetext={formatValue ? formatValue(value) : String(value)}
        aria-labelledby={labelId}
        aria-label={labelId ? undefined : ariaLabel}
        style={{ left: `calc(${THUMB_INSET_PX}px + (100% - ${THUMB_SIZE_PX}px) * ${percent / 100})` }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onKeyDown={handleKeyDown}
      />
    </div>
  );
}
