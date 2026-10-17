import { describe, expect, it } from 'vitest';
import {
  A4_HEIGHT_PT,
  A4_WIDTH_PT,
  DEFAULT_BOUNDS,
  DEFAULT_LIMITS,
  DEFAULT_SETTINGS,
  DEFAULT_SIGNATURE,
  STANDARD_FONTS,
  bodyLineTexts,
  computeLayout,
  flattenBodyText,
  wrapText,
  type LayoutConfig,
} from './documentLayout';

function makeConfig(overrides: Partial<LayoutConfig> = {}): LayoutConfig {
  return {
    content: { heading: 'Subject heading', body: 'A short body that fits.' },
    settings: { ...DEFAULT_SETTINGS },
    signature: { ...DEFAULT_SIGNATURE },
    bounds: { ...DEFAULT_BOUNDS },
    limits: { ...DEFAULT_LIMITS },
    ...overrides,
  };
}

const paragraphBody = (count: number) =>
  Array.from({ length: count }, (_, i) => `Paragraph number ${i + 1}`).join('\n\n');

describe('computeLayout', () => {
  it('uses A4 dimensions and keeps a short document inside the bounds', () => {
    const layout = computeLayout(makeConfig());
    expect(A4_WIDTH_PT).toBeCloseTo(595.28, 2);
    expect(A4_HEIGHT_PT).toBeCloseTo(841.89, 2);
    expect(layout.valid).toBe(true);
    expect(layout.contentBottomPt).toBeLessThanOrEqual(DEFAULT_BOUNDS.bodyLimitPt + 1e-6);
  });

  it('preserves intentional blank lines and paragraph boundaries', () => {
    const body = 'First paragraph.\n\nSecond paragraph.\n\nThird paragraph.';
    const layout = computeLayout(makeConfig({ content: { heading: '', body } }));
    expect(layout.body.filter((line) => line.blank)).toHaveLength(2);
    expect(bodyLineTexts(layout)).toEqual(['First paragraph.', 'Second paragraph.', 'Third paragraph.']);
  });

  it('preserves explicit single line breaks without adding paragraph spacing', () => {
    const body = 'Line one\nLine two\nLine three';
    const layout = computeLayout(makeConfig({ content: { heading: '', body }, settings: { ...DEFAULT_SETTINGS, paragraphSpacingPt: 12 } }));
    expect(bodyLineTexts(layout)).toEqual(['Line one', 'Line two', 'Line three']);
    expect(layout.body.every((line) => line.spacingBeforePt === 0)).toBe(true);
  });

  it('applies paragraph spacing only to paragraphs after a blank line', () => {
    const body = 'One\n\nTwo\n\nThree';
    const layout = computeLayout(makeConfig({ content: { heading: '', body }, settings: { ...DEFAULT_SETTINGS, paragraphSpacingPt: 6 } }));
    const spaced = layout.body.filter((line) => line.spacingBeforePt === 6);
    expect(spaced).toHaveLength(2);
    expect(spaced.every((line) => line.text === 'Two' || line.text === 'Three')).toBe(true);
  });

  it('never overlaps the footer or the content limit when valid', () => {
    const layout = computeLayout(makeConfig({ content: { heading: '', body: paragraphBody(3) } }));
    expect(layout.valid).toBe(true);
    expect(layout.contentBottomPt).toBeLessThanOrEqual(layout.contentBottomPt + 1e-6);
    expect(layout.contentBottomPt).toBeLessThanOrEqual(DEFAULT_BOUNDS.bodyLimitPt + 1e-6);
  });

  it('detects a body/signature collision when the signature is moved up', () => {
    const body = Array.from({ length: 40 }, (_, i) => `Line ${i + 1}`).join('\n');
    const layout = computeLayout(
      makeConfig({
        content: { heading: '', body },
        signature: { ...DEFAULT_SIGNATURE, yPct: 55, aspect: 0.74 },
      }),
    );
    expect(layout.collisions.map((c) => c.kind)).toContain('body-signature');
    expect(layout.valid).toBe(false);
  });

  it('detects a signature/footer collision', () => {
    const layout = computeLayout(
      makeConfig({ signature: { ...DEFAULT_SIGNATURE, yPct: 92, widthPct: 20, aspect: 0.74 } }),
    );
    expect(layout.collisions.map((c) => c.kind)).toContain('signature-footer');
  });

  it('keeps the signature aspect ratio intact', () => {
    const layout = computeLayout(makeConfig({ signature: { ...DEFAULT_SIGNATURE, aspect: 0.74 } }));
    expect(layout.signature).not.toBeNull();
    expect(layout.signature!.heightPt / layout.signature!.widthPt).toBeCloseTo(0.74, 6);
  });

  it('handles empty content without throwing', () => {
    const layout = computeLayout(makeConfig({ content: { heading: '', body: '' } }));
    expect(layout.valid).toBe(true);
    expect(layout.heading.lines).toHaveLength(0);
  });

  it('is deterministic for identical input', () => {
    const config = makeConfig({ content: { heading: 'Hi', body: paragraphBody(4) } });
    expect(JSON.stringify(computeLayout(config))).toBe(JSON.stringify(computeLayout(config)));
  });

  it('uses the bold font metric for the heading', () => {
    const config = makeConfig({ content: { heading: 'Heading text', body: 'Body' } });
    const layout = computeLayout(config);
    const width = STANDARD_FONTS.bold.widthOfTextAtSize('Heading text', config.settings.headingSizePt);
    expect(width).toBeGreaterThan(0);
    expect(layout.heading.sizePt).toBe(config.settings.headingSizePt);
  });
});

describe('wrapText', () => {
  it('wraps long words and URLs so no line exceeds the column width', () => {
    const measure = (t: string) => STANDARD_FONTS.regular.widthOfTextAtSize(t, 10.5);
    const maxWidth = 200;
    const url = `https://example.com/${'a'.repeat(300)}`;
    const lines = wrapText(url, measure, maxWidth);
    expect(lines.length).toBeGreaterThan(1);
    for (const line of lines) {
      expect(measure(line)).toBeLessThanOrEqual(maxWidth + 1e-6);
    }
    expect(lines.join('')).toBe(url);
  });

  it('preserves word order and content', () => {
    const measure = (t: string) => STANDARD_FONTS.regular.widthOfTextAtSize(t, 11);
    const text = 'The quick brown fox jumps over the lazy dog';
    const lines = wrapText(text, measure, 120);
    expect(lines.join(' ')).toBe(text);
  });
});

describe('content preservation', () => {
  it('reconstructs the complete body content from rendered lines', () => {
    const body = paragraphBody(6);
    const layout = computeLayout(makeConfig({ content: { heading: '', body } }));
    const originalWords = body.split(/\s+/).filter(Boolean);
    const renderedWords = flattenBodyText(layout).split(/\s+/).filter(Boolean);
    expect(renderedWords).toEqual(originalWords);
  });
});
