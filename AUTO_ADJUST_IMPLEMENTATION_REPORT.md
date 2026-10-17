# Auto Adjust — Implementation Report

## 1. Root causes and existing architecture

Before this change the editor did **not** have a shared layout engine:

- The **preview** wrapped text with CSS (`white-space: normal`) and never measured anything.
- The **PDF exporter** in `src/App.tsx` wrapped text independently with `pdf-lib`'s
  `widthOfTextAtSize()` and re-implemented spacing (`fontSize * 1.35`) and heading gaps
  (`+ 14`) inline.
- Overflow detection was a character-count heuristic
  (`Math.floor((bodyWidth/100*595)/(fontSize*0.52))`) with a hard-coded `> 80` threshold.
- There was no concept of line height, paragraph spacing, protected footer bounds, or
  signature collision detection, and no way to fit content automatically.

Because the two outputs were computed by two different algorithms, they could disagree,
and there was no single place to reason about "does this document fit?".

## 2. Files inspected and modified

| File | Change |
| --- | --- |
| `src/App.tsx` | Removed closing statement; added line-height + paragraph-spacing state; builds a `LayoutConfig`; renders preview from the computed layout; exporter consumes the same layout; added Auto Adjust / Undo UI and status. |
| `src/styles.css` | Preview now renders explicit lines (`white-space: pre`, no CSS wrapping); heading rendered as explicit lines; Auto Adjust button, undo control and status styling; removed closing-statement preview styles. |
| `src/lib/documentLayout.ts` | **New.** Shared layout engine, units, measurement, wrapping, bounds, collisions. |
| `src/lib/autoAdjust.ts` | **New.** Deterministic bounded auto-fit algorithm. |
| `src/lib/documentLayout.test.ts` | **New.** Layout/wrapping/bounds tests. |
| `src/lib/autoAdjust.test.ts` | **New.** Auto Adjust behaviour tests. |
| `package.json` | Added `test`/`typecheck` scripts, explicit `@pdf-lib/standard-fonts` dependency, `vitest` dev dependency. |

## 3. Auto Adjust algorithm and adjustment order

`autoAdjust(config, fonts)`:

1. Compute the current layout. If valid → **"Already fits"**, nothing changes.
2. Otherwise run a bounded search over font sizes from the current value **down to the
   configured minimum** (0.5 pt steps, never increasing). For each font size it tries, in
   priority order:
   - **P2 – paragraph spacing:** reduce to the configured floor (0 pt default). Spacing is never increased (only an existing value above the floor is lowered).
   - **P3 – line height:** reduce gradually (0.05 steps) toward the floor (1.2).
   - **P4 – body position:** move the body up (0.5% steps) toward the configured floor (16%).
3. The first font size that yields a valid layout wins; the least-aggressive valid result at
   that font size is kept.
4. If no font size works → **"Could not fit safely"** and the configuration is left untouched.

Only these four settings can change. `signature` position/width, body left/width, heading
font and all text are never modified. The search is bounded (≤ `(current-min)/0.5 + 1`
outer iterations) and deterministic.

## 4. Formatting and line-break preservation strategy

- The engine never mutates `content.body` / `content.heading`. It produces a separate
  `LayoutResult` containing `body: PositionedLine[]`.
- Source text is split on `\n`. A blank source line emits exactly one blank rendered line.
  Consecutive non-blank lines (explicit line breaks) are treated as separate lines inside
  one paragraph and never receive paragraph spacing.
- Paragraph spacing is applied at most once, only to the first line of a paragraph that
  follows a blank line.
- Automatic wrapping may change when the font size changes, but the stored text does not.
  `wrapText()` preserves word order and internal spacing; words longer than the column are
  split at character boundaries so URLs/long words cannot overflow.
- Heading keeps bold + centered rendering; body keeps left alignment. (The app has no
  per-run bold/italic in the body; that model is unchanged.)

## 5. Font-size and spacing limits

| Setting | Floor | Ceiling | Note |
| --- | --- | --- | --- |
| Body font | 9 pt | 14 pt | Auto Adjust only reduces, never enlarges |
| Heading font | — | — | never changed by Auto Adjust |
| Line height | 1.2× | 1.5× | UI slider exposes 1.1–1.6× |
| Paragraph spacing | 0 pt | 12 pt | |
| Body top | 16% | 34% | |

If the current font is already below 9 pt (the UI allows 7), Auto Adjust cannot reduce it
further and reports "Could not fit safely" instead.

## 6. Protected-region and collision detection

`computeLayout` computes a **body limit** (default 80% of page height, matching the previous
overflow threshold) and a **protected footer line** (default 93%). It checks:

- `body` bottom vs body limit → `overflowPt`.
- body vs signature image / name / designation (using bounding boxes, only when the body
  column horizontally overlaps the signature column) → `body-signature`, `body-name`,
  `body-designation`.
- signature/designation bottom vs footer line → `signature-footer`.

The letterhead artwork is never resized or moved; page size stays A4 and the aspect ratio is
unchanged (the preview already locks to `595.28 / 841.89`). Auto Adjust never moves the
signature; if it collides and cannot be resolved by shrinking the content, the operation is
reported as unfixable.

## 7. Undo implementation

- On a successful adjustment the app stores `LayoutSnapshot`
  `{ fontPt, lineHeight, paragraphSpacingPt, bodyTopPct }` — the exact values before the change.
- "Undo Auto Adjust" restores those four values and clears the snapshot. It never touches
  text content.
- Clicking Auto Adjust again when the document already fits does not overwrite the snapshot.
- Manually editing font size / line spacing / paragraph spacing / body top (or using
  "Reset layout to defaults") clears the snapshot so Undo always reverts the last applied
  adjustment.

## 8. Preview and PDF consistency

- Both the preview and `exportPdf()` call the **same** `computeLayout(layoutConfig)`.
- The preview renders the computed lines explicitly (`white-space: pre`, one element per
  line) so the browser performs no independent wrapping.
- Point values are converted to preview coordinates with `calc(100cqw * pt / 595.28)`; the
  page is a CSS container, so the conversion matches the PDF's point grid.
- `pdf-lib`'s `StandardFonts.Helvetica`/`Helvetica-Bold` metrics are exactly the AFM
  metrics used by the engine (`@pdf-lib/standard-fonts`), so wrapping is identical.
- The preview body/heading font stack was set to `Arial, Helvetica, sans-serif` to match
  Helvetica metrics.

## 9. Tests added and actual results

`npm test` → **30 passed (2 files)**:

`documentLayout.test.ts` (14): A4 dimensions, short doc fits, blank lines preserved,
explicit line breaks preserved, paragraph spacing applied once, footer not crossed,
body/signature collision, signature/footer collision, aspect ratio preserved, empty content,
determinism, bold heading metric, long-word/URL wrapping, content reconstruction.

`autoAdjust.test.ts` (16): short letter unchanged, font reduced only when needed, paragraph
spacing reduced before font, line height reduced before font, min-font acceptance, never below
min, cannot-fit leaves config untouched, footer never overlapped, text byte-for-byte unchanged,
idempotent repeat, undo restores exact layout, no font enlargement, signature aspect preserved,
signature collision unfixable without relocation, mobile==desktop determinism, success message.

## 10. Build, lint, type-check results

- `npm run typecheck` (`tsc -b`): **pass**.
- `npm test` (`vitest run`): **30 passed**.
- `npm run build` (`tsc -b && vite build`): **pass** (only the pre-existing chunk-size warning).

There is no ESLint/Prettier configuration in the repository, so no lint step was available.

## 11. PDF visual verification

A headless-Chrome harness drove the real app: set a 440-word body, captured the PDF before
(10.5 pt) and after Auto Adjust, and inspected the content streams and a rendered image.

- Both PDFs are A4 `595.28 × 841.89`.
- Before: body `Tf` = `10.5`. After: body `Tf` = `9` — the exporter used the adjusted layout.
- The rendered after-PDF shows the heading centered, the body wrapped inside the column and
  ending above the signature/footer, the date top-right and reference top-left, and the
  signature + name + designation intact. Footer artwork untouched.
- Auto Adjust in the browser reported: `Line spacing: 1.35 → 1.2`, `Body position: 21.5% → 18.5%`,
  `Font size: 10.5 pt → 9 pt`; Undo restored 10.5 pt; a 1200-word body reported
  "Could not fit safely" with the font unchanged.
- Explicit-breaks test rendered `["Alpha","Beta","","Gamma","","Delta line one","Delta line two"]`
  from `Alpha\nBeta\n\nGamma\n\nDelta line one\nDelta line two`.

## 12. Known limitations

- Automated tests cover the pure layout/auto-adjust modules. The React integration
  (button, undo wiring, preview DOM) was verified via headless-Chrome e2e, not a DOM test
  framework; no DOM test runner is configured.
- The body supports a single style (plus a bold heading), matching the pre-existing app —
  there is no per-run bold/italic model to preserve.
- Auto Adjust does not move the signature. If a user-placed signature collides with the body,
  the document is reported as unfixable rather than relocated.
- Preview and PDF use Arial for preview vs Helvetica in the PDF; metrics are near-identical
  but not byte-identical, so a wrapped line could differ by sub-pixel amounts.
- Font reduction alone may not fit arbitrary content; the footer is never overlapped and the
  layout is never applied when invalid.

## 13. Manual verification instructions

1. `npm install && npm run dev`.
2. Open the app; the Content tab no longer shows a closing statement field.
3. Click **Auto Adjust** under the preview (or in the Layout tab) with a long body:
   the status panel lists the exact changes and the preview updates.
4. Click **Undo Auto Adjust** to restore the previous layout.
5. Click **Download print-ready PDF** and confirm it matches the preview.
6. Repeat at a narrow mobile width; the same settings produce the same document.
