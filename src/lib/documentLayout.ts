import { Encodings, Font, FontNames, type EncodingType } from '@pdf-lib/standard-fonts';

/**
 * Shared document layout engine.
 *
 * Canonical units are PDF points (A4 = 595.28 x 841.89). Both the live preview
 * and the PDF exporter consume the exact same `LayoutResult` produced here, so
 * line wrapping, vertical positions and bounds are identical in both outputs.
 *
 * Text measurement uses the standard-font AFM metrics (the same metrics
 * pdf-lib uses when it embeds Helvetica / Helvetica-Bold), which makes wrapping
 * deterministic and browser-independent.
 */

export const A4_WIDTH_PT = 595.28;
export const A4_HEIGHT_PT = 841.89;

/**
 * Hard layout constraint: the body may never start above this percentage of the
 * page height, measured from the top edge. This is an absolute boundary (not a
 * preference) and is enforced centrally in `computeLayout`, so the live preview,
 * Auto Adjust and the PDF exporter all agree. Auto Adjust must never move the
 * body above this line to force a fit; if the content cannot fit at or below it,
 * the layout is reported as overflow instead.
 */
export const MIN_BODY_START_PERCENT = 20;

export const HEADING_LINE_HEIGHT = 1.25;
export const HEADING_GAP_PT = 14;
export const SIGNATURE_NAME_SIZE_PT = 9.5;
export const SIGNATURE_DESIGNATION_SIZE_PT = 7.5;
export const SIGNATURE_NAME_OFFSET_PT = 12;
export const SIGNATURE_DESIGNATION_OFFSET_PT = 22;

export interface FontMetric {
  widthOfTextAtSize(text: string, sizePt: number): number;
}

export interface MeasurementFonts {
  regular: FontMetric;
  bold: FontMetric;
}

class StandardFontMetric implements FontMetric {
  private readonly font: Font;
  private readonly encoding: EncodingType;

  constructor(name: FontNames) {
    this.font = Font.load(name);
    this.encoding = Encodings.WinAnsi;
  }

  widthOfTextAtSize(text: string, sizePt: number): number {
    const codePoints = Array.from(text);
    let total = 0;
    for (let i = 0; i < codePoints.length; i += 1) {
      const left = this.glyphName(codePoints[i]);
      const right = i + 1 < codePoints.length ? this.glyphName(codePoints[i + 1]) : '';
      const kern = right ? this.font.getXAxisKerningForPair(left, right) || 0 : 0;
      total += (this.font.getWidthOfGlyph(left) || 250) + kern;
    }
    return (total * sizePt) / 1000;
  }

  private glyphName(char: string): string {
    const codePoint = char.codePointAt(0) ?? 0;
    try {
      return this.encoding.encodeUnicodeCodePoint(codePoint).name;
    } catch {
      return '.notdef';
    }
  }
}

export const STANDARD_FONTS: MeasurementFonts = {
  regular: new StandardFontMetric(FontNames.Helvetica),
  bold: new StandardFontMetric(FontNames.HelveticaBold),
};

export interface DocumentContent {
  heading: string;
  body: string;
}

export interface LayoutSettings {
  /** Top of the body block, as a percentage of page height. */
  bodyTopPct: number;
  /** Left edge of the body column, as a percentage of page width. */
  bodyLeftPct: number;
  /** Width of the body column, as a percentage of page width. */
  bodyWidthPct: number;
  fontSizePt: number;
  headingSizePt: number;
  /** Multiplier applied to the font size to obtain the line advance. */
  lineHeight: number;
  /** Extra spacing (pt) inserted before a paragraph that follows a blank line. */
  paragraphSpacingPt: number;
}

export interface SignatureSettings {
  xPct: number;
  yPct: number;
  widthPct: number;
  name: string;
  designation: string;
  /** Image height / width. `null` when there is no signature image. */
  aspect: number | null;
}

export interface LayoutLimits {
  minFontPt: number;
  maxFontPt: number;
  minLineHeight: number;
  maxLineHeight: number;
  minParagraphSpacingPt: number;
  maxParagraphSpacingPt: number;
  minBodyTopPct: number;
  maxBodyTopPct: number;
}

export interface LayoutBounds {
  /** Bottom boundary (pt, from top) the body text may not cross. */
  bodyLimitPt: number;
  /** Top of the protected footer (pt, from top) nothing may cross. */
  footerTopPt: number;
}

export interface LayoutConfig {
  content: DocumentContent;
  settings: LayoutSettings;
  signature: SignatureSettings;
  bounds: LayoutBounds;
  limits: LayoutLimits;
}

export const DEFAULT_SETTINGS: LayoutSettings = {
  bodyTopPct: 21.5,
  bodyLeftPct: 33.5,
  bodyWidthPct: 63,
  fontSizePt: 10.5,
  headingSizePt: 13,
  lineHeight: 1.35,
  paragraphSpacingPt: 0,
};

export const DEFAULT_SIGNATURE: SignatureSettings = {
  xPct: 80,
  yPct: 74,
  widthPct: 13,
  name: 'MA Saleem',
  designation: 'General Secretary TABBFAH',
  aspect: null,
};

export const DEFAULT_LIMITS: LayoutLimits = {
  minFontPt: 9,
  maxFontPt: 14,
  minLineHeight: 1.2,
  maxLineHeight: 1.5,
  minParagraphSpacingPt: 0,
  maxParagraphSpacingPt: 12,
  // The body's preferred travel floor is the hard minimum start position.
  minBodyTopPct: MIN_BODY_START_PERCENT,
  maxBodyTopPct: 34,
};

/** Footer protection defaults chosen to match the previous 80% overflow heuristic. */
export const DEFAULT_BOUNDS: LayoutBounds = {
  bodyLimitPt: (80 / 100) * A4_HEIGHT_PT,
  footerTopPt: (93 / 100) * A4_HEIGHT_PT,
};

export interface PositionedLine {
  text: string;
  blank: boolean;
  /** Extra space inserted above this line, in points. */
  spacingBeforePt: number;
  /** Distance from the top of the page to the top of this line box, in points. */
  topPt: number;
}

export interface HeadingLayout {
  lines: string[];
  topPt: number;
  lineAdvancePt: number;
  sizePt: number;
}

export interface SignatureLayout {
  xPt: number;
  topPt: number;
  widthPt: number;
  heightPt: number;
  bottomPt: number;
  name: { text: string; topPt: number; sizePt: number; bottomPt: number };
  designation: { text: string; topPt: number; sizePt: number; bottomPt: number };
}

export type CollisionKind =
  | 'body-signature'
  | 'body-name'
  | 'body-designation'
  | 'signature-footer'
  | 'designation-footer';

export interface Collision {
  kind: CollisionKind;
  detail: string;
}

export interface LayoutResult {
  valid: boolean;
  fontSizePt: number;
  headingSizePt: number;
  lineHeight: number;
  paragraphSpacingPt: number;
  bodyTopPct: number;
  bodyLeftPt: number;
  bodyWidthPt: number;
  bodyTopPt: number;
  bodyHeightPt: number;
  contentBottomPt: number;
  heading: HeadingLayout;
  body: PositionedLine[];
  signature: SignatureLayout | null;
  overflowPt: number;
  collisions: Collision[];
}

const EPSILON = 1e-6;

/**
 * Wraps `text` to `maxWidth` while preserving word order and internal spacing.
 * Words longer than the available width are split at character boundaries so
 * long words/URLs can never overflow the column.
 */
export function wrapText(text: string, measure: (text: string) => number, maxWidth: number): string[] {
  if (text === '') return [''];
  if (maxWidth <= 0) return [text];

  const tokens = text.split(/(\s+)/).filter((token) => token !== '');
  const lines: string[] = [];
  let line = '';

  const breakLongToken = (token: string): string[] => {
    const pieces: string[] = [];
    let current = '';
    for (const char of token) {
      const next = current + char;
      if (current !== '' && measure(next) > maxWidth) {
        pieces.push(current);
        current = char;
      } else {
        current = next;
      }
    }
    if (current !== '') pieces.push(current);
    return pieces.length ? pieces : [token];
  };

  for (const token of tokens) {
    if (/^\s+$/.test(token)) {
      line += token;
      continue;
    }
    const trial = line + token;
    if (line.trim() !== '' && measure(trial) > maxWidth) {
      lines.push(line.replace(/\s+$/, ''));
      line = '';
    }
    if (line === '' && measure(token) > maxWidth) {
      const pieces = breakLongToken(token);
      for (let i = 0; i < pieces.length - 1; i += 1) lines.push(pieces[i]);
      line = pieces[pieces.length - 1];
    } else {
      line += token;
    }
  }
  lines.push(line.replace(/\s+$/, ''));
  return lines.length ? lines : [''];
}

function splitSourceLines(body: string): string[] {
  return body.replace(/\r\n?/g, '\n').split('\n');
}

export function computeLayout(config: LayoutConfig, fonts: MeasurementFonts = STANDARD_FONTS): LayoutResult {
  const { content, settings, signature, bounds } = config;
  const W = A4_WIDTH_PT;
  const H = A4_HEIGHT_PT;

  const bodyLeftPt = (settings.bodyLeftPct / 100) * W;
  const bodyWidthPt = (settings.bodyWidthPct / 100) * W;
  // Hard constraint: clamp the requested start position to the minimum. The body
  // top is measured from the top edge of the page in both the preview and the PDF.
  const bodyTopPct = Math.max(settings.bodyTopPct, MIN_BODY_START_PERCENT);
  const bodyTopPt = (bodyTopPct / 100) * H;
  const lineAdvancePt = settings.fontSizePt * settings.lineHeight;

  // Heading
  const headingText = content.heading.trim();
  const headingLines = headingText
    ? wrapText(headingText, (t) => fonts.bold.widthOfTextAtSize(t, settings.headingSizePt), bodyWidthPt)
    : [];
  const headingAdvancePt = settings.headingSizePt * HEADING_LINE_HEIGHT;
  const heading: HeadingLayout = {
    lines: headingLines,
    topPt: bodyTopPt,
    lineAdvancePt: headingAdvancePt,
    sizePt: settings.headingSizePt,
  };

  let y = bodyTopPt;
  if (headingLines.length > 0) {
    y += headingLines.length * headingAdvancePt + HEADING_GAP_PT;
  }

  // Body: preserve every source line and every blank line.
  const body: PositionedLine[] = [];
  const sourceLines = splitSourceLines(content.body);
  let previousBlank = true;
  for (const sourceLine of sourceLines) {
    if (sourceLine.trim() === '') {
      body.push({ text: '', blank: true, spacingBeforePt: 0, topPt: y });
      y += lineAdvancePt;
      previousBlank = true;
      continue;
    }
    const wrappedLines = wrapText(
      sourceLine,
      (t) => fonts.regular.widthOfTextAtSize(t, settings.fontSizePt),
      bodyWidthPt,
    );
    let first = true;
    for (const wrapped of wrappedLines) {
      const spacing = first && previousBlank && body.length > 0 ? settings.paragraphSpacingPt : 0;
      y += spacing;
      body.push({ text: wrapped, blank: false, spacingBeforePt: spacing, topPt: y });
      y += lineAdvancePt;
      first = false;
    }
    previousBlank = false;
  }
  const bodyBottomPt = y;

  // Signature (only when an image with a known aspect ratio is present).
  let signatureLayout: SignatureLayout | null = null;
  const aspect = signature.aspect;
  if (aspect && aspect > 0) {
    const sigWidthPt = (signature.widthPct / 100) * W;
    const sigHeightPt = sigWidthPt * aspect;
    const xPt = (signature.xPct / 100) * W;
    const topPt = (signature.yPct / 100) * H;
    const imageBottom = topPt + sigHeightPt;
    const nameTop = imageBottom + SIGNATURE_NAME_OFFSET_PT - SIGNATURE_NAME_SIZE_PT;
    const designationTop = imageBottom + SIGNATURE_DESIGNATION_OFFSET_PT - SIGNATURE_DESIGNATION_SIZE_PT;
    signatureLayout = {
      xPt,
      topPt,
      widthPt: sigWidthPt,
      heightPt: sigHeightPt,
      bottomPt: imageBottom + SIGNATURE_DESIGNATION_OFFSET_PT,
      name: {
        text: signature.name,
        topPt: nameTop,
        sizePt: SIGNATURE_NAME_SIZE_PT,
        bottomPt: imageBottom + SIGNATURE_NAME_OFFSET_PT,
      },
      designation: {
        text: signature.designation,
        topPt: designationTop,
        sizePt: SIGNATURE_DESIGNATION_SIZE_PT,
        bottomPt: imageBottom + SIGNATURE_DESIGNATION_OFFSET_PT,
      },
    };
  }

  const overflowPt = Math.max(0, bodyBottomPt - bounds.bodyLimitPt);

  const collisions: Collision[] = [];
  if (signatureLayout) {
    const bodyRight = bodyLeftPt + bodyWidthPt;
    const sigLeft = signatureLayout.xPt;
    const sigRight = signatureLayout.xPt + signatureLayout.widthPt;
    const horizontalOverlap = bodyRight > sigLeft && bodyLeftPt < sigRight;
    if (horizontalOverlap) {
      if (bodyBottomPt > signatureLayout.topPt + EPSILON) {
        collisions.push({ kind: 'body-signature', detail: 'Body text overlaps the signature image.' });
      }
      if (bodyBottomPt > signatureLayout.name.topPt + EPSILON) {
        collisions.push({ kind: 'body-name', detail: 'Body text overlaps the signatory name.' });
      }
      if (bodyBottomPt > signatureLayout.designation.topPt + EPSILON) {
        collisions.push({ kind: 'body-designation', detail: 'Body text overlaps the designation.' });
      }
    }
    if (signatureLayout.bottomPt > bounds.footerTopPt + EPSILON) {
      collisions.push({ kind: 'signature-footer', detail: 'Signature overlaps the protected footer.' });
    }
  }

  const valid = overflowPt <= EPSILON && collisions.length === 0;

  return {
    valid,
    fontSizePt: settings.fontSizePt,
    headingSizePt: settings.headingSizePt,
    lineHeight: settings.lineHeight,
    paragraphSpacingPt: settings.paragraphSpacingPt,
    bodyTopPct,
    bodyLeftPt,
    bodyWidthPt,
    bodyTopPt,
    bodyHeightPt: bodyBottomPt - bodyTopPt,
    contentBottomPt: bodyBottomPt,
    heading,
    body,
    signature: signatureLayout,
    overflowPt,
    collisions,
  };
}

/** All non-blank rendered body line strings, in reading order. */
export function bodyLineTexts(layout: LayoutResult): string[] {
  return layout.body.filter((line) => !line.blank).map((line) => line.text);
}

/** Reconstructs the readable body text (wrapped lines joined by a space). */
export function flattenBodyText(layout: LayoutResult): string {
  return bodyLineTexts(layout).join(' ');
}
