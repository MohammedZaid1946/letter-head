import {
  computeLayout,
  MIN_BODY_START_PERCENT,
  type LayoutConfig,
  type LayoutResult,
  type LayoutSettings,
  type MeasurementFonts,
  STANDARD_FONTS,
} from './documentLayout';

export interface Adjustment {
  key: 'fontSizePt' | 'lineHeight' | 'paragraphSpacingPt' | 'bodyTopPct';
  label: string;
  from: number;
  to: number;
  unit: 'pt' | 'x' | '%';
}

export interface AutoAdjustOutcome {
  status: 'already-fits' | 'adjusted' | 'cannot-fit';
  /** Proposed configuration. Equal to the input when nothing was changed. */
  config: LayoutConfig;
  layout: LayoutResult;
  adjustments: Adjustment[];
  message: string;
}

const FONT_STEP_PT = 0.5;
const LINE_HEIGHT_STEP = 0.05;
const BODY_TOP_STEP_PCT = 0.5;
const EPSILON = 1e-6;

const round1 = (value: number) => Math.round(value * 10) / 10;
const round2 = (value: number) => Math.round(value * 100) / 100;

function layoutOf(config: LayoutConfig, settings: LayoutSettings, fonts: MeasurementFonts): LayoutResult {
  return computeLayout({ ...config, settings }, fonts);
}

/**
 * Attempts to fit the document at a single font size by applying the permitted
 * adjustments in priority order: paragraph spacing, then line height, then body
 * positioning. Returns the least-aggressive valid result, or `null`.
 */
function searchAtFontSize(
  config: LayoutConfig,
  fontSizePt: number,
  fonts: MeasurementFonts,
): { settings: LayoutSettings; layout: LayoutResult } | null {
  const limits = config.limits;
  let settings: LayoutSettings = { ...config.settings, fontSizePt: round1(fontSizePt) };

  // Priority 2 — reduce excessive paragraph spacing down to the configured
  // floor. Spacing is never increased and never reduced below the floor.
  const minParagraph = Math.min(limits.minParagraphSpacingPt, settings.paragraphSpacingPt);
  if (settings.paragraphSpacingPt > minParagraph + EPSILON) {
    settings = { ...settings, paragraphSpacingPt: minParagraph };
  }
  let layout = layoutOf(config, settings, fonts);
  if (layout.valid) return { settings, layout };

  // Priority 3 — reduce line height gradually.
  const minLineHeight = Math.min(limits.minLineHeight, settings.lineHeight);
  if (settings.lineHeight > minLineHeight + EPSILON) {
    for (
      let lh = round2(settings.lineHeight - LINE_HEIGHT_STEP);
      lh >= minLineHeight - EPSILON;
      lh = round2(lh - LINE_HEIGHT_STEP)
    ) {
      const candidate = { ...settings, lineHeight: lh };
      const candidateLayout = layoutOf(config, candidate, fonts);
      if (candidateLayout.valid) return { settings: candidate, layout: candidateLayout };
    }
    settings = { ...settings, lineHeight: minLineHeight };
    layout = layoutOf(config, settings, fonts);
    if (layout.valid) return { settings, layout };
  }

  // Priority 4 — move the body up, but never above the hard minimum start
  // position. If the content cannot fit at or below that line, Auto Adjust
  // reports overflow instead of crossing the boundary.
  const minBodyTop = Math.max(limits.minBodyTopPct, MIN_BODY_START_PERCENT);
  if (settings.bodyTopPct > minBodyTop + EPSILON) {
    for (
      let top = round1(settings.bodyTopPct - BODY_TOP_STEP_PCT);
      top >= minBodyTop - EPSILON;
      top = round1(top - BODY_TOP_STEP_PCT)
    ) {
      const candidate = { ...settings, bodyTopPct: top };
      const candidateLayout = layoutOf(config, candidate, fonts);
      if (candidateLayout.valid) return { settings: candidate, layout: candidateLayout };
    }
  }

  return null;
}

function diffAdjustments(before: LayoutSettings, after: LayoutSettings): Adjustment[] {
  const adjustments: Adjustment[] = [];
  if (Math.abs(before.paragraphSpacingPt - after.paragraphSpacingPt) > EPSILON) {
    adjustments.push({
      key: 'paragraphSpacingPt',
      label: 'Paragraph spacing',
      from: round1(before.paragraphSpacingPt),
      to: round1(after.paragraphSpacingPt),
      unit: 'pt',
    });
  }
  if (Math.abs(before.lineHeight - after.lineHeight) > EPSILON) {
    adjustments.push({
      key: 'lineHeight',
      label: 'Line spacing',
      from: round2(before.lineHeight),
      to: round2(after.lineHeight),
      unit: 'x',
    });
  }
  if (Math.abs(before.bodyTopPct - after.bodyTopPct) > EPSILON) {
    adjustments.push({
      key: 'bodyTopPct',
      label: 'Body position',
      from: round1(before.bodyTopPct),
      to: round1(after.bodyTopPct),
      unit: '%',
    });
  }
  if (Math.abs(before.fontSizePt - after.fontSizePt) > EPSILON) {
    adjustments.push({
      key: 'fontSizePt',
      label: 'Font size',
      from: round1(before.fontSizePt),
      to: round1(after.fontSizePt),
      unit: 'pt',
    });
  }
  return adjustments;
}

function formatAdjustment(adjustment: Adjustment): string {
  const { label, from, to, unit } = adjustment;
  if (adjustment.key === 'paragraphSpacingPt') {
    return `${label}: reduced by ${round1(from - to)} pt`;
  }
  if (unit === 'x') return `${label}: ${from} → ${to}`;
  if (unit === '%') return `${label}: ${from}% → ${to}%`;
  return `${label}: ${from} pt → ${to} pt`;
}

/**
 * Deterministic auto-fit. The search is bounded: it only ever reduces values
 * (never enlarges) and stops as soon as a valid layout is found.
 */
export function autoAdjust(config: LayoutConfig, fonts: MeasurementFonts = STANDARD_FONTS): AutoAdjustOutcome {
  const before = computeLayout(config, fonts);
  if (before.valid) {
    return {
      status: 'already-fits',
      config,
      layout: before,
      adjustments: [],
      message: 'No layout changes were necessary.',
    };
  }

  const limits = config.limits;
  const startFont = Math.max(config.settings.fontSizePt, limits.minFontPt);

  for (
    let font = round1(startFont);
    font >= limits.minFontPt - EPSILON;
    font = round1(font - FONT_STEP_PT)
  ) {
    const result = searchAtFontSize(config, font, fonts);
    if (result) {
      const adjustments = diffAdjustments(config.settings, result.settings);
      const changed = adjustments.length > 0;
      const nextConfig: LayoutConfig = changed ? { ...config, settings: result.settings } : config;
      return {
        status: changed ? 'adjusted' : 'already-fits',
        config: nextConfig,
        layout: result.layout,
        adjustments,
        message: changed
          ? 'Auto-adjusted successfully. All content fits within the permitted area.'
          : 'No layout changes were necessary.',
      };
    }
    if (font <= limits.minFontPt + EPSILON) break;
  }

  return {
    status: 'cannot-fit',
    config,
    layout: before,
    adjustments: [],
    message:
      'The document still exceeds the permitted content region. Reduce the content or adjust the permitted layout settings.',
  };
}

export { formatAdjustment };
