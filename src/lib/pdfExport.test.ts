import { describe, expect, it } from 'vitest';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { inflateSync } from 'node:zlib';
import {
  A4_HEIGHT_PT,
  A4_WIDTH_PT,
  DEFAULT_BOUNDS,
  DEFAULT_LIMITS,
  DEFAULT_SETTINGS,
  DEFAULT_SIGNATURE,
  MIN_BODY_START_PERCENT,
  computeLayout,
  type LayoutConfig,
} from './documentLayout';
import { autoAdjust } from './autoAdjust';

/**
 * Verifies the actual coordinates written into the exported PDF (rather than
 * only the in-memory layout) match the shared layout, and that the body never
 * starts above the minimum boundary. The exporter converts top-origin layout
 * points to pdf-lib's bottom-origin canvas with `y = H - topPt - fontSize`; this
 * test reads those `Tm` values back out of the (inflated) content stream.
 */

const BOUNDARY_PT = (MIN_BODY_START_PERCENT / 100) * A4_HEIGHT_PT;
const longParagraph = (n: number) => `MARKERONE ${'recovery '.repeat(n)}`.trim();

function makeConfig(overrides: Partial<LayoutConfig> = {}, aspect: number | null = null): LayoutConfig {
  return {
    content: { heading: '', body: 'MARKERONE short body line.' },
    settings: { ...DEFAULT_SETTINGS },
    signature: { ...DEFAULT_SIGNATURE, aspect },
    bounds: { ...DEFAULT_BOUNDS },
    limits: { ...DEFAULT_LIMITS },
    ...overrides,
  };
}

function decodeStreams(bytes: Uint8Array): string {
  const raw = Buffer.from(bytes).toString('latin1');
  let decoded = '';
  const re = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(raw))) {
    try {
      decoded += inflateSync(Buffer.from(match[1], 'latin1')).toString('latin1') + '\n';
    } catch {
      decoded += match[1] + '\n';
    }
  }
  return decoded;
}

/** Recovers the top-of-page position (pt, from the top) of the first body line. */
function firstBodyTopPt(bytes: Uint8Array, heightPt: number): number {
  const content = decodeStreams(bytes);
  const markerHex = Buffer.from('MARKERONE', 'latin1').toString('hex').toUpperCase();
  const index = content.indexOf(markerHex);
  expect(index).toBeGreaterThanOrEqual(0);
  const before = content.slice(Math.max(0, index - 200), index);
  const tm = [...before.matchAll(/(-?[\d.]+) (-?[\d.]+) (?:Td|Tm)/g)].pop();
  const tf = [...before.matchAll(/[\w-]+ ([\d.]+) Tf/g)].pop();
  if (!tm || !tf) throw new Error('No text placement found near marker.');
  return heightPt - Number(tm[2]) - Number(tf[1]);
}

async function exportFirstBodyTopPt(config: LayoutConfig): Promise<number> {
  const layout = computeLayout(config);
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([A4_WIDTH_PT, A4_HEIGHT_PT]);
  const height = page.getHeight();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  for (const line of layout.body) {
    if (line.blank) continue;
    page.drawText(line.text, {
      x: layout.bodyLeftPt,
      y: height - line.topPt - layout.fontSizePt,
      size: layout.fontSizePt,
      font,
    });
  }
  return firstBodyTopPt(await pdf.save(), height);
}

describe('PDF export body start boundary', () => {
  it('clamps a body requested above 20% and exports it exactly at 20%', async () => {
    const config = makeConfig({ settings: { ...DEFAULT_SETTINGS, bodyTopPct: 12 } });
    const layout = computeLayout(config);
    expect(layout.bodyTopPct).toBe(MIN_BODY_START_PERCENT);
    const top = await exportFirstBodyTopPt(config);
    expect(top).toBeCloseTo(BOUNDARY_PT, 2);
  });

  it('exports a body that starts exactly at 20% at 20%', async () => {
    const config = makeConfig({ settings: { ...DEFAULT_SETTINGS, bodyTopPct: MIN_BODY_START_PERCENT } });
    const top = await exportFirstBodyTopPt(config);
    expect(top).toBeCloseTo(BOUNDARY_PT, 2);
  });

  it('preserves a start below 20% in the PDF', async () => {
    const config = makeConfig({ settings: { ...DEFAULT_SETTINGS, bodyTopPct: 28 } });
    const layout = computeLayout(config);
    const top = await exportFirstBodyTopPt(config);
    expect(top).toBeCloseTo((28 / 100) * A4_HEIGHT_PT, 2);
    expect(top).toBeCloseTo(layout.bodyTopPt, 2);
  });

  it('keeps an auto-adjusted long letter at or after 20% in the PDF', async () => {
    const config = makeConfig({ content: { heading: '', body: longParagraph(440) } });
    const outcome = autoAdjust(config);
    expect(outcome.status).toBe('adjusted');
    expect(outcome.layout.bodyTopPct).toBeGreaterThanOrEqual(MIN_BODY_START_PERCENT);
    const top = await exportFirstBodyTopPt(outcome.config);
    expect(top).toBeGreaterThanOrEqual(BOUNDARY_PT - 0.01);
  });

  it('preview and PDF agree on the body start position', async () => {
    const config = makeConfig({ settings: { ...DEFAULT_SETTINGS, bodyTopPct: 24 } });
    const layout = computeLayout(config);
    const top = await exportFirstBodyTopPt(config);
    expect(top).toBeCloseTo(layout.bodyTopPt, 2);
  });

  it('exports no text at all when heading and body are empty', async () => {
    const config = makeConfig({ content: { heading: '', body: '' } });
    const layout = computeLayout(config);
    expect(layout.heading.lines).toHaveLength(0);
    expect(layout.body.filter((line) => !line.blank)).toHaveLength(0);

    const pdf = await PDFDocument.create();
    const page = pdf.addPage([A4_WIDTH_PT, A4_HEIGHT_PT]);
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const height = page.getHeight();
    layout.heading.lines.forEach((line, index) =>
      page.drawText(line, {
        x: layout.bodyLeftPt,
        y: height - layout.heading.topPt - index * layout.heading.lineAdvancePt - layout.headingSizePt,
        size: layout.headingSizePt,
        font,
      }),
    );
    for (const line of layout.body) {
      if (line.blank) continue;
      page.drawText(line.text, { x: layout.bodyLeftPt, y: height - line.topPt - layout.fontSizePt, size: layout.fontSizePt, font });
    }

    const content = decodeStreams(await pdf.save());
    expect(content).not.toMatch(/Tj/);
    expect(content).not.toContain('Enter your letter content');
  });
});
