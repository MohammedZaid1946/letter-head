# Remove Default Field Values & Use Placeholders — Report

## Summary

All editable text fields on a fresh letter now start **empty**. The previous sample
content was removed and replaced with descriptive **placeholders** that live only in the
`placeholder` attribute (never as a field value, never in the preview, never in the PDF).
Reusable signature profiles and the letterhead/signature assets are untouched.

## Files Modified

- `src/App.tsx`
  - Removed the `today()` helper and the `initialBody` sample-text constant.
  - Text state defaults changed from sample strings to `''`:
    - `reference` — already `''`
    - `date` — was `today()` → `''`
    - `heading` — was `'Best Wishes for a Speedy Recovery'` → `''`
    - `body` — was `initialBody` → `''`
    - `signatory` — was `'MA Saleem'` → `''`
    - `designation` — was `'General Secretary TABBFAH'` → `''`
  - Startup signature-profile effect no longer auto-selects the first profile and no
    longer pre-fills `selectedProfile` / `signatureImage` / `signatory` / `designation`.
    It still loads stored profiles and seeds the reusable starter profile into the list.
  - PDF export guards the signature name/designation with `trim()` checks, so empty
    values draw nothing.
- `src/lib/documentLayout.ts`
  - `DEFAULT_SIGNATURE.name` / `DEFAULT_SIGNATURE.designation` changed from the example
    name/designation to `''` (the app was already passing explicit values; this keeps the
    library default blank as well).

## Placeholders Added

| Field | Placeholder |
| --- | --- |
| Reference | `Enter reference number` |
| Heading / subject | `Enter letter subject` |
| Body | `Enter your letter content here... Separate paragraphs with a blank line.` |
| Signatory | `Enter signatory name` |
| Designation | `Enter designation` |

The **Date** field remains a native `<input type="date">` (it shows the browser's own
`dd-mm-yyyy`-style affordance and has no configurable placeholder); it starts empty.

## Intentional Non-Changes

- **Starter signature profile** (`MA Saleem` / `General Secretary TABBFAH`) is kept as a
  *reusable* stored profile. It is no longer auto-applied; it only appears when the user
  picks it from the profile dropdown.
- No "new letter" / clear-content action exists in the app, and the layout-only
  **Reset layout to defaults** button intentionally never clears letter content or
  profiles. The conditional requirement was therefore not applicable.

## Verification

### Automated

- `npm run typecheck` — pass
- `npm test` — **57 passed (4 files)**
- `npm run build` — pass
- Added unit tests:
  - `documentLayout.test.ts` — "renders no visible lines for empty heading and body"
  - `autoAdjust.test.ts` — "already fits when the letter is empty"
  - `pdfExport.test.ts` — "exports no text at all when heading and body are empty"

### Browser E2E (headless Chrome, desktop 1440 and mobile)

Verified at both widths, identical results:

- Initial values empty for reference, date, heading, body, signatory, designation.
- Placeholders exactly as listed above; no placeholder ever appears in a field value.
- Reusable profiles preserved (dropdown offers the one-time option + starter profile).
- No signature image overlay on a fresh letter.
- Preview initially shows no placeholder and no body text.
- Typing "Hello world from e2e." shows it in preview and in the exported PDF's page
  content stream; the body placeholder is absent from the export.
- Clearing the body removes it from the preview and shows no placeholder.
- Export with all fields empty: the page content stream contains **no** `Tj` text
  operator (only the letterhead background draw), no sample content, no placeholder.
- Auto Adjust on an empty letter reports "Already fits" (no error).
- Reset layout leaves typed letter content intact ("Keep me please.").

## Acceptance Criteria

- [x] All editable fields start empty on new-letter initialization.
- [x] Placeholders describe each field and are not stored as values.
- [x] Placeholders never render in the preview or appear in the PDF.
- [x] Exported PDF for an empty letter contains no sample/placeholder/`undefined` text.
- [x] Reusable signature profiles and uploaded assets preserved.
- [x] No regression in Auto Adjust, preview, or export.
