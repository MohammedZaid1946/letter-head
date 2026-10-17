# Accidental Slider Jumps — Fix Report

## 1. Root cause

The Layout form used **native `<input type="range">`** controls
(`src/App.tsx`, previously lines 283–292). A native range element moves its thumb to the
pointer position on `pointerdown` **anywhere on the track** and immediately fires `input` /
`onChange`. Each handler wrote straight to React state, so a single click anywhere on the
track — or a click that merely started on the track while the user was interacting with the
form — instantly changed the layout (and, for the body sliders, also cleared the Auto Adjust
state).

CSS cannot suppress this: the browser handles the track press internally, so a custom control
was required.

## 2. Files modified

| File | Change |
| --- | --- |
| `src/lib/slider.ts` | **New.** Pure slider math: `DRAG_THRESHOLD_PX` (4), `clampSliderValue`, `snapSliderValue`, `sliderValueFromDrag`. |
| `src/components/RangeSlider.tsx` | **New.** Accessible, drag-only slider component (pointer events + pointer capture + keyboard). |
| `src/App.tsx` | Replaced all 8 native range inputs with `RangeSlider`; added a layout history, `undoLayoutChange`, `resetLayout`, and per-edit commit wiring; number inputs now push history too. |
| `src/styles.css` | Added `.range-slider*` styles (track, fill, thumb, focus ring, touch target, `touch-action`); removed `.range-field input[type=range]`. |
| `src/lib/slider.test.ts` | **New.** Unit tests for the slider math. |

## 3. Interaction strategy

- **Drag-only:** pointer handlers live on the **thumb** (`onPointerDown` / `onPointerMove` /
  `onPointerUp` / `onPointerCancel`). The track has no handlers, so clicking the track, the
  label text, or surrounding space does nothing.
- **Pointer capture:** on `pointerdown` the thumb calls `setPointerCapture(pointerId)`
  (guarded by `try/catch`), so the drag continues even when the pointer leaves the thumb.
  Pointer Events cover mouse, touch and pen; `pointerType === 'mouse' && button !== 0` is
  ignored so only the primary button starts a drag.
- **Drag threshold:** a movement under `DRAG_THRESHOLD_PX = 4` CSS px is ignored, so tiny
  accidental movements do not commit a change.
- **Relative mapping:** the value is computed from the pointer **delta** since press
  (`sliderValueFromDrag`), not the absolute pointer position, so the thumb does not jump when
  grabbed off-centre.
- **No duplicate handlers:** only pointer events are used (no parallel mouse handlers), so
  there are no double updates.
- **Live preview:** during a drag the parent is updated with `committed: false` for live
  preview; on `pointerup` a single `committed: true` change is emitted for history.
- **Cancel:** pressing **Escape** during a drag (window keydown listener while dragging)
  restores the value captured at drag start and performs no commit.

## 4. Accessibility

- `role="slider"`, `tabIndex=0`, `aria-orientation="horizontal"`, and
  `aria-valuemin` / `aria-valuemax` / `aria-valuenow` / `aria-valuetext`.
- Accessible name via `aria-labelledby` pointing at the visible label element.
- Keyboard: **Arrow Left/Up/Down/Right** step by `step`; **Page Up/Page Down** by `step × 10`;
  **Home** → minimum; **End** → maximum. Each keypress is a committed, undoable change.
- Visible focus indicator (a ring around the thumb via `:focus-visible`).
- Touch target: the interactive thumb is **44 × 44 px** (visual dot 22 px), meeting mobile
  touch-target guidance; the thumb uses `touch-action: none` while the container uses
  `touch-action: pan-y` so vertical page scrolling still works.

## 5. Cancellation, undo and reset

- **Escape** cancels an active drag and restores the drag-start value (no history entry).
- **Undo:** a capped (50-entry) layout history. Every committed edit — slider commit, number
  input, Auto Adjust, or Reset — pushes the previous full layout. The “Undo” button appears
  whenever history is non-empty and restores the previous layout. This replaces the old
  Auto-Adjust-only snapshot with a general action.
- **Reset:** the existing “Reset layout to defaults” button now pushes history before applying
  defaults, so it is itself undoable.
- **No cross-talk:** each control changes only its own field; nothing else is modified. This
  is covered by the e2e check that changing one slider leaves the others unchanged.

## 6. Constraints preserved

- The body-start slider’s minimum is `MIN_BODY_START_PERCENT = 20`, and the shared layout
  engine still clamps `bodyTopPct` centrally. Dragging the body-start slider far left clamps at
  **20%** (verified), so no slider interaction can bypass the boundary or produce an invalid
  export.
- The live preview and the PDF exporter both consume the same `computeLayout(layoutConfig)`, so
  both stay synchronized with the committed value. The existing PDF/auto-adjust/boundary tests
  all still pass.

## 7. Test results

### Unit tests

`npm test` → **54 passed (4 files)**, including `slider.test.ts` (8): threshold is 3–5 px,
decimal handling, clamping, step snapping without float drift, relative drag mapping, and
“never below the 20% minimum”.

### Interaction e2e (headless Chrome, built app)

Run at desktop (1440) and mobile (390 → 500 effective) widths with identical results:

| Check | Result |
| --- | --- |
| 1. Track click does not change the value | pass (`trackClickChanged: false`, value stayed 21.5) |
| 2. Clicking the label does not change the value | pass (`labelClickChanged: false`) |
| 3. Dragging the thumb changes the value | pass (21.5 → 23) |
| 4. Sub-threshold moves (2 px, 3 px) do not commit | pass (`subThresholdChanged: false`) |
| 5. Escape cancels an active drag | pass (moved mid-drag, then restored to drag-start) |
| 6. Keyboard Arrow / Home / End | pass (arrow increments; End = 34; Home = 20) |
| 7. Touch drag works | pass (`touchChanged: true`, synthetic `pointerType: 'touch'`) |
| 8. Undo and Reset | pass (Undo restores 21.5; Reset sets 21.5 and remains undoable) |
| 9. Body-start minimum enforced | pass (drag left clamps to 20; drag right reaches 34) |
| 10. Other functionality intact | pass (other sliders unchanged; Export button present/enabled) |

### Build / type-check

- `npm run typecheck` (`tsc -b`): **pass**.
- `npm run build` (`tsc -b && vite build`): **pass**.
- Existing 46 layout/auto-adjust/PDF tests still pass (now 54 total).

## 8. Remaining limitations

- The interaction e2e drives pointer/keyboard events via `PointerEvent` dispatch in headless
  Chrome rather than a real touchscreen; the touch code path is the same pointer-handler code
  used by mouse/pen, and `pointerType: 'touch'` was exercised. It is not a physical-device test.
- The slider is fully custom (`role="slider"`); it does not use the platform’s native range
  accessibility surface, but implements the WAI-ARIA slider semantics and keyboard model.
- History is capped at 50 entries; older committed changes are dropped.
- `setPointerCapture` is best-effort (wrapped in `try/catch`) because some test environments do
  not implement it; real browsers all support it.
