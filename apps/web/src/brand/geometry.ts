/**
 * The MOSAIC logomark, redrawn as exact vectors from the brand board
 * (docs/brand/MOSAIC_logo_system_v2.png). This module is the single source of the mark's geometry:
 * the React components and every generated icon (scripts/brand-assets.ts) are built from it.
 *
 * Grid: 48 × 48 units. Two mirrored isometric halves form the "M" (outer leg 12 wide, inner panel to
 * x = 22, a 4-unit channel at the centre); every diagonal shares slope 0.7. The rounded diamond sits
 * above the channel.
 */

export const MARK_VIEWBOX = '0 0 48 48';

/** Both halves of the M, as one path. */
export const MARK_LEGS_PATH =
  'M0 3L22 18.4L22 34.4L12 27.4L12 48L0 39.6Z' + // left half
  'M48 3L26 18.4L26 34.4L36 27.4L36 48L48 39.6Z'; // right half (mirror at x = 24)

/** The diamond: a rounded square rotated 45° about its centre. */
const DIAMOND_CENTRE = { x: 24, y: 8 };
const DIAMOND_HALF_DIAGONAL = 8;
const side = Number((DIAMOND_HALF_DIAGONAL * Math.SQRT2).toFixed(3));
export const MARK_DIAMOND = {
  x: Number((DIAMOND_CENTRE.x - side / 2).toFixed(3)),
  y: Number((DIAMOND_CENTRE.y - side / 2).toFixed(3)),
  width: side,
  height: side,
  rx: 1.6,
  transform: `rotate(45 ${DIAMOND_CENTRE.x} ${DIAMOND_CENTRE.y})`,
} as const;

/** Brand board colours; identical to the pix-* tokens in styles/tokens.css (a test enforces it). */
export const BRAND_COLORS = { blue: '#032F9B', yellow: '#FFCD01', white: '#FFFFFF' } as const;

export const TAGLINE = 'Unified access to research facilities';

export type MarkTone = 'color' | 'inverse' | 'tile';

/**
 * Fills per tone (brand board §2 and §4):
 *  color   — blue M, yellow diamond (on white / light backgrounds)
 *  inverse — all white (on brand blue or imagery)
 *  tile    — white M, yellow diamond (inside the blue app-icon tile)
 */
export const MARK_FILLS: Record<MarkTone, { legs: string; diamond: string }> = {
  color: { legs: BRAND_COLORS.blue, diamond: BRAND_COLORS.yellow },
  inverse: { legs: BRAND_COLORS.white, diamond: BRAND_COLORS.white },
  tile: { legs: BRAND_COLORS.white, diamond: BRAND_COLORS.yellow },
};
