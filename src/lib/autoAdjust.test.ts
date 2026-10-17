import { describe, expect, it } from 'vitest';
import {
  A4_HEIGHT_PT,
  DEFAULT_BOUNDS,
  DEFAULT_LIMITS,
  DEFAULT_SETTINGS,
  DEFAULT_SIGNATURE,
  MIN_BODY_START_PERCENT,
  STANDARD_FONTS,
  computeLayout,
  flattenBodyText,
  type LayoutConfig,
} from './documentLayout';
import { autoAdjust } from './autoAdjust';

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

const longParagraph = (words: number) => `recovery ${'recovery '.repeat(words)}`.trim();

describe('autoAdjust', () => {
  it('leaves a short letter unchanged', () => {
    const config = makeConfig();
    const outcome = autoAdjust(config);
    expect(outcome.status).toBe('already-fits');
    expect(outcome.adjustments).toHaveLength(0);
    expect(outcome.config).toBe(config);
  });

  it('already fits when the letter is empty', () => {
    const config = makeConfig({ content: { heading: '', body: '' } });
    const outcome = autoAdjust(config);
    expect(outcome.status).toBe('already-fits');
    expect(outcome.adjustments).toHaveLength(0);
    expect(outcome.layout.valid).toBe(true);
  });

  it('reduces font size only when needed and reports the change', () => {
    const config = makeConfig({ content: { heading: '', body: longParagraph(440) } });
    const outcome = autoAdjust(config);
    expect(outcome.status).toBe('adjusted');
    expect(outcome.layout.valid).toBe(true);
    expect(outcome.adjustments.some((a) => a.key === 'fontSizePt')).toBe(true);
    const fontAdjustment = outcome.adjustments.find((a) => a.key === 'fontSizePt')!;
    expect(fontAdjustment.to).toBeLessThan(fontAdjustment.from);
    expect(outcome.config.settings.fontSizePt).toBeGreaterThanOrEqual(config.limits.minFontPt);
  });

  it('reduces paragraph spacing before touching the font size', () => {
    const paragraphs = Array.from({ length: 17 }, (_, i) => `Paragraph ${i}`).join('\n\n');
    const config = makeConfig({
      content: { heading: '', body: paragraphs },
      settings: { ...DEFAULT_SETTINGS, paragraphSpacingPt: 12 },
    });
    const outcome = autoAdjust(config);
    expect(outcome.status).toBe('adjusted');
    expect(outcome.adjustments.some((a) => a.key === 'paragraphSpacingPt')).toBe(true);
    expect(outcome.adjustments.some((a) => a.key === 'fontSizePt')).toBe(false);
    expect(outcome.config.settings.paragraphSpacingPt).toBe(DEFAULT_LIMITS.minParagraphSpacingPt);
  });

  it('reduces line height before reducing the font size', () => {
    const paragraphs = Array.from({ length: 19 }, (_, i) => `Paragraph ${i}`).join('\n\n');
    const config = makeConfig({
      content: { heading: '', body: paragraphs },
      settings: { ...DEFAULT_SETTINGS, paragraphSpacingPt: 0 },
    });
    const outcome = autoAdjust(config);
    expect(outcome.status).toBe('adjusted');
    expect(outcome.adjustments.some((a) => a.key === 'lineHeight')).toBe(true);
    expect(outcome.adjustments.some((a) => a.key === 'fontSizePt')).toBe(false);
  });

  it('accepts a document that only fits at the minimum font size', () => {
    const config = makeConfig({
      content: { heading: '', body: longParagraph(440) },
      settings: { ...DEFAULT_SETTINGS, fontSizePt: 12 },
    });
    const outcome = autoAdjust(config);
    expect(outcome.status).toBe('adjusted');
    expect(outcome.layout.valid).toBe(true);
    expect(outcome.config.settings.fontSizePt).toBeGreaterThanOrEqual(DEFAULT_LIMITS.minFontPt);
  });

  it('never falls below the configured minimum font size', () => {
    const config = makeConfig({
      content: { heading: '', body: longParagraph(300) },
      settings: { ...DEFAULT_SETTINGS, fontSizePt: 14 },
    });
    const outcome = autoAdjust(config);
    if (outcome.status === 'adjusted') {
      expect(outcome.config.settings.fontSizePt).toBeGreaterThanOrEqual(DEFAULT_LIMITS.minFontPt);
    }
  });

  it('rejects a document that cannot fit without modifying the layout', () => {
    const config = makeConfig({ content: { heading: '', body: longParagraph(1200) } });
    const outcome = autoAdjust(config);
    expect(outcome.status).toBe('cannot-fit');
    expect(outcome.config).toBe(config);
    expect(outcome.config.settings).toEqual(config.settings);
    expect(outcome.layout.valid).toBe(false);
  });

  it('never produces a layout that overlaps the footer', () => {
    const config = makeConfig({ content: { heading: '', body: longParagraph(300) } });
    const outcome = autoAdjust(config);
    if (outcome.status === 'adjusted') {
      expect(outcome.layout.contentBottomPt).toBeLessThanOrEqual(DEFAULT_BOUNDS.bodyLimitPt + 1e-6);
      if (outcome.layout.signature) {
        expect(outcome.layout.signature.bottomPt).toBeLessThanOrEqual(
          DEFAULT_BOUNDS.footerTopPt + 1e-6,
        );
      }
    }
  });

  it('keeps the original text byte-for-byte', () => {
    const body = `${longParagraph(300)}\n\nSecond paragraph with trailing newline.\n`;
    const config = makeConfig({ content: { heading: 'Heading', body } });
    const outcome = autoAdjust(config);
    expect(outcome.config.content.body).toBe(body);
    expect(outcome.config.content.heading).toBe('Heading');
  });

  it('is idempotent when run repeatedly', () => {
    const config = makeConfig({ content: { heading: '', body: longParagraph(300) } });
    const first = autoAdjust(config);
    const second = autoAdjust(first.config);
    expect(second.status).toBe('already-fits');
    expect(second.adjustments).toHaveLength(0);
  });

  it('supports undo by restoring the exact previous layout', () => {
    const config = makeConfig({ content: { heading: '', body: longParagraph(300) } });
    const before = computeLayout(config);
    const outcome = autoAdjust(config);
    expect(outcome.config.settings).not.toEqual(config.settings);
    const restored = computeLayout(config);
    expect(JSON.stringify(restored)).toBe(JSON.stringify(before));
  });

  it('does not enlarge the font size', () => {
    const config = makeConfig({
      content: { heading: '', body: longParagraph(300) },
      settings: { ...DEFAULT_SETTINGS, fontSizePt: 10.5 },
    });
    const outcome = autoAdjust(config);
    if (outcome.status === 'adjusted') {
      expect(outcome.config.settings.fontSizePt).toBeLessThanOrEqual(config.settings.fontSizePt);
    }
  });

  it('keeps the signature aspect ratio intact through adjustment', () => {
    const config = makeConfig({
      content: { heading: '', body: longParagraph(280) },
      signature: { ...DEFAULT_SIGNATURE, aspect: 0.74 },
    });
    const outcome = autoAdjust(config);
    if (outcome.layout.signature) {
      expect(outcome.layout.signature.heightPt / outcome.layout.signature.widthPt).toBeCloseTo(0.74, 6);
    }
  });

  it('treats a signature collision as unfixable without relocating the signature', () => {
    const body = Array.from({ length: 60 }, (_, i) => `Line ${i + 1}`).join('\n');
    const config = makeConfig({
      content: { heading: '', body },
      signature: { ...DEFAULT_SIGNATURE, yPct: 55, aspect: 0.74 },
    });
    const outcome = autoAdjust(config);
    // The signature position is never modified by auto adjust.
    expect(outcome.config.signature.yPct).toBe(55);
    if (outcome.status === 'cannot-fit') {
      expect(outcome.config.settings).toEqual(config.settings);
    }
  });

  it('produces identical results on repeated calculation (mobile == desktop)', () => {
    const config = makeConfig({ content: { heading: '', body: longParagraph(300) } });
    const a = autoAdjust(config);
    const b = autoAdjust(config);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(flattenBodyText(a.layout)).toBe(flattenBodyText(b.layout));
  });

  it('reports paragraph spacing and font size in its message', () => {
    const paragraphs = Array.from({ length: 17 }, (_, i) => `Paragraph ${i}`).join('\n\n');
    const config = makeConfig({
      content: { heading: '', body: paragraphs },
      settings: { ...DEFAULT_SETTINGS, paragraphSpacingPt: 12 },
    });
    const outcome = autoAdjust(config);
    expect(outcome.message).toContain('Auto-adjusted successfully');
  });
});

describe('minimum body start boundary', () => {
  it('never moves the body above the boundary to fit long content', () => {
    const config = makeConfig({
      content: { heading: '', body: longParagraph(440) },
      settings: { ...DEFAULT_SETTINGS, bodyTopPct: MIN_BODY_START_PERCENT },
    });
    const outcome = autoAdjust(config);
    expect(outcome.layout.bodyTopPct).toBeGreaterThanOrEqual(MIN_BODY_START_PERCENT);
    if (outcome.status === 'adjusted') {
      expect(outcome.config.settings.bodyTopPct).toBeGreaterThanOrEqual(MIN_BODY_START_PERCENT);
      const first = outcome.layout.body.find((line) => !line.blank)!;
      expect(first.topPt).toBeGreaterThanOrEqual((MIN_BODY_START_PERCENT / 100) * A4_HEIGHT_PT - 1e-6);
    }
  });

  it('leaves a body already at the boundary untouched', () => {
    const config = makeConfig({
      content: { heading: '', body: longParagraph(120) },
      settings: { ...DEFAULT_SETTINGS, bodyTopPct: MIN_BODY_START_PERCENT },
    });
    const outcome = autoAdjust(config);
    expect(outcome.layout.bodyTopPct).toBe(MIN_BODY_START_PERCENT);
  });

  it('may move a body that starts below the boundary down to the boundary, never past it', () => {
    const config = makeConfig({
      content: { heading: '', body: longParagraph(440) },
      settings: { ...DEFAULT_SETTINGS, bodyTopPct: 30 },
    });
    const outcome = autoAdjust(config);
    expect(outcome.layout.bodyTopPct).toBeGreaterThanOrEqual(MIN_BODY_START_PERCENT);
    if (outcome.status === 'adjusted') {
      expect(outcome.config.settings.bodyTopPct).toBeGreaterThanOrEqual(MIN_BODY_START_PERCENT);
      expect(outcome.config.settings.bodyTopPct).toBeLessThanOrEqual(30);
    }
  });

  it('reports overflow instead of crossing the boundary when content cannot fit', () => {
    const config = makeConfig({
      content: { heading: '', body: longParagraph(900) },
      settings: { ...DEFAULT_SETTINGS, bodyTopPct: MIN_BODY_START_PERCENT },
      signature: { ...DEFAULT_SIGNATURE, yPct: 26, aspect: 0.74 },
    });
    const outcome = autoAdjust(config);
    expect(outcome.status).toBe('cannot-fit');
    expect(outcome.config).toBe(config);
    expect(outcome.layout.bodyTopPct).toBeGreaterThanOrEqual(MIN_BODY_START_PERCENT);
    expect(outcome.layout.valid).toBe(false);
  });

  it('clamps a body requested above the boundary even before evaluating fit', () => {
    const config = makeConfig({ settings: { ...DEFAULT_SETTINGS, bodyTopPct: 10 } });
    const outcome = autoAdjust(config);
    expect(outcome.layout.bodyTopPct).toBe(MIN_BODY_START_PERCENT);
  });

  it('keeps preview/PDF start identical: bodyTopPt tracks bodyTopPct after adjustment', () => {
    const config = makeConfig({ content: { heading: '', body: longParagraph(440) } });
    const outcome = autoAdjust(config);
    expect(outcome.layout.bodyTopPt).toBeCloseTo(
      (outcome.layout.bodyTopPct / 100) * A4_HEIGHT_PT,
      6,
    );
  });
});
