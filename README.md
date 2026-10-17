# Letterhead Studio

A local-first React + TypeScript letterhead generator using `pdf-lib`. It uses the supplied association letterhead scan as the fixed background and overlays editable letter content and a draggable signature for A4 PDF export.

## Included assets

- `public/assets/letterhead-template.jpg`: cropped from the supplied letterhead image to remove the black letterbox bars around the page.
- `public/assets/ma-saleem-signature.png`: a starter transparent crop of the handwritten signature from the supplied signature card. Review it before official use; the crop is generated from a small raster image and may need replacing with a cleaner original.

## Requirements

- Node.js 20 or newer recommended
- npm

## Run locally

```bash
npm install
npm run dev
```

Open the local URL Vite prints in the terminal.

## Build

```bash
npm run build
npm run preview
```

## Current functionality

- Letter content, date, reference, heading, closing, and signatory details
- Starter letterhead scan and replace-template upload (PNG/JPEG/WebP accepted in the UI; PDF-template import is not implemented)
- Per-letter signature upload
- Reusable signature profiles saved in browser `localStorage`
- Draggable signature placement and width control
- Body position, width, and font-size controls
- A4 PDF export via `pdf-lib`
- Basic content overflow heuristic and a reminder to inspect the exported PDF

## Important limitations / before production

1. The original uploaded letterhead is a raster scan, not a blank PDF. The app scales that image to A4, so the header and footer quality is limited by source resolution.
2. The body and signature defaults are starting points, not a certified exact match to a printer. Tune the layout against the actual blank template and inspect the exported PDF.
3. The app currently exports a single A4 page. It warns heuristically about possible overflow but does not automatically paginate or shrink text to fit.
4. Date/reference positions and body layout can be calibrated further. The starter image includes the fixed header, bodybuilder watermark, left office-bearer panel, and footer.
5. Saved signatures are sensitive assets. They are stored only in this browser's local storage in this MVP; do not use a shared/public device. A future version should include explicit access control if used by multiple people.
6. The starter signature was cropped from a small image that includes printed text. Replace it with a clean signature-only PNG if available.
# letter-head
