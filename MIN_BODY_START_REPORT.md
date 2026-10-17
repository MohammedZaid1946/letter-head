# Minimum Body Start Boundary — Implementation Report

## 1. Root cause

Auto Adjust could place the letter body above the intended 20% start line.

- The shared layout engine (`computeLayout`) had no hard floor on the body start. It used
  `settings.bodyTopPct` verbatim.
- `DEFAULT_LIMITS.minBodyTopPct` was **16**, so Auto Adjust's priority‑4 "move body up" step
  was allowed to reduce the body start to 16%.
- The Layout tab slider exposed `min="16"`, so a user could also set the body to 16%.
- The preview rendered `top: ${bodyTop}%` from the raw state, while the PDF rendered the
  layout value — a divergence risk if the two ever differed.

There was therefore no single enforced boundary, and both Auto Adjust and manual input could
move the body above 20%.

## 2. Files modified

| File | Change |
| --- | --- |
| `src/lib/documentLayout.ts` | Added `MIN_BODY_START_PERCENT = 20`; set `DEFAULT_LIMITS.minBodyTopPct` to it; **clamped** `bodyTopPct` centrally in `computeLayout` and report the clamped value. |
| `src/lib/autoAdjust.ts` | Priority‑4 floor is now `max(limits.minBodyTopPct, MIN_BODY_START_PERCENT)`; never proposes a start above the boundary; reports overflow (`cannot-fit`) when content cannot fit at/below it. |
| `src/App.tsx` | Imported the constant; body-start slider `min` set to 20 (and value clamped); preview now uses `layout.bodyTopPct`; added a validation warning if the state is below the minimum. |
| `src/lib/documentLayout.test.ts` | Added boundary tests (clamp above / exactly at / below 20%, `bodyTopPt` consistency). |
| `src/lib/autoAdjust.test.ts` | Added boundary tests (never above 20%, stays at 20%, moves only down to 20%, overflow instead of crossing). |
| `src/lib/pdfExport.test.ts` | **New.** Generates real PDFs and reads the actual body coordinates back out of the content streams. |
| `package.json` / `package-lock.json` | Added `@types/node` (dev) so the PDF test can inflate streams with `node:zlib`. |

## 3. Coordinate system used

- **Layout engine:** top‑origin. The body top is a percentage of page height converted to
  points measured from the **top** edge: `bodyTopPt = bodyTopPct / 100 * A4_HEIGHT_PT`
  (A4 = `595.28 × 841.89`). The 20% boundary is therefore `168.378 pt` from the top.
- **Preview:** CSS is top‑origin; the page is a container and the body is positioned with
  `top: <bodyTopPct>%`, i.e. the same normalized top-origin value.
- **PDF (`pdf-lib`):** bottom‑origin. The exporter converts the top-origin layout value with
  `y = H - topPt - fontSize` for text and `y = H - topPt - heightPt` for the signature image.
  The boundary is not applied separately in the PDF; the PDF consumes the already-clamped
  `layout.bodyTopPt`, so the two renderers cannot disagree.

Note: the body's **top** position is used for the boundary. The bottom position (overflow) and
the PDF's bottom-origin `y` are separate concerns and were not confused with it.

## 4. How the boundary is enforced

Enforced centrally in the shared layout calculation, not as a CSS fix:

```ts
// documentLayout.ts
const bodyTopPct = Math.max(settings.bodyTopPct, MIN_BODY_START_PERCENT);
const bodyTopPt = (bodyTopPct / 100) * H;
```

`LayoutResult.bodyTopPct` / `bodyTopPt` report the clamped values, so the preview, Auto Adjust
and the PDF exporter all consume the same guaranteed-valid start.

Auto Adjust additionally uses the boundary as the floor of its search
(`Math.max(limits.minBodyTopPct, MIN_BODY_START_PERCENT)`) and stops there. If the content
cannot fit at or below 20%, it returns `cannot-fit` and reports overflow; it never overrides
the boundary to force a fit.

The UI prevents an invalid position two ways: the slider `min` is 20, and the live preview
reads the clamped `layout.bodyTopPct`. A validation warning is shown if the state is ever
below the minimum.

## 5. Test results

`npm test` → **46 passed (3 files)**. Run in this environment:

```
✓ src/lib/documentLayout.test.ts (19 tests)
✓ src/lib/pdfExport.test.ts     (5 tests)
✓ src/lib/autoAdjust.test.ts    (22 tests)
Test Files  3 passed (3)
     Tests  46 passed (46)
```

Boundary-specific coverage:

- Body initially **above** 20% (e.g. 12%) → clamped to 20% in layout and in the PDF.
- Body initially **exactly** at 20% → preserved at 20%.
- Body initially **below** 20% (e.g. 28%) → preserved.
- **Short content** → valid, start unchanged.
- **Long content requiring font reduction** → adjusted, start never below 20%.
- **Content that cannot fit** without violating the boundary → `cannot-fit`, config unchanged,
  start never below 20%.
- **Preview/PDF consistency** → `bodyTopPt === bodyTopPct/100*H`, and the recovered PDF
  coordinate equals the layout coordinate.
- **Undo/reset** → undoing Auto Adjust restores the exact previous layout
  (`JSON.stringify(restored) === JSON.stringify(before)`); defaults (21.5%) are valid.
- **Mobile/desktop** → layout is resolution-independent (single normalized value); verified in
  the browser at both widths (section 7).

`npm run typecheck` (`tsc -b`): **pass**. `npm run build`: **pass**.

## 6. PDF verification results

A dedicated test (`pdfExport.test.ts`) generates real PDFs with `pdf-lib`, inflates the
FlateDecode content streams, locates the first body line's hex-encoded text, and recovers the
actual `Tm` placement. Since the exporter uses `y = H - topPt - fontSize`, the top is
`H - y - fontSize`. Measured values:

| Case | Requested start | Layout `bodyTopPct` | Recovered PDF top (pt) | Boundary (pt) |
| --- | --- | --- | --- | --- |
| Above boundary | 12% | 20% | **168.378** | 168.378 |
| Exactly at boundary | 20% | 20% | **168.378** | 168.378 |
| Below boundary | 28% | 28% | **235.729** | 168.378 |
| Auto-adjusted long letter | 21.5% → 9 pt | 21.5% | **181.006** | 168.378 |

The exported PDF body never starts above 168.378 pt (20%), and matches the preview value in
every case.

## 7. Live preview verification (desktop and mobile)

The production build was driven in headless Chrome at a desktop width (1440) and a narrow
width (500 effective). Results were identical:

| Check | Desktop | Mobile |
| --- | --- | --- |
| Body-start slider `min` | 20 | 20 |
| Set to 20 → preview top | 19.999% | 19.999% |
| Attempt to set 10 (above boundary) → effective value | 20 | 20 |
| Attempt to set 10 → preview top | 19.999% | 19.999% |
| Set to 26 → preview top | 25.999% | 26.0% |

The invalid position is prevented at the control, and the preview always renders the clamped
value.

## 8. Preserved behavior

- Letterhead artwork, page aspect ratio (A4 portrait), date and reference alignment, signature
  placement, font controls, font-size/line-spacing/paragraph-spacing priorities, undo, and the
  earlier closing-statement removal are unchanged.
- The default body start remains 21.5%, and "Reset layout to defaults" restores a valid start.

## 9. Known limitations

- Tests cover the pure layout/Auto-Adjust/PDF-coordinate logic. The React control wiring was
  verified with headless Chrome rather than a DOM test framework.
- If a body cannot fit below 20% at the minimum font, Auto Adjust reports overflow rather than
  moving the body above the boundary — this is the intended behavior, not a defect.
