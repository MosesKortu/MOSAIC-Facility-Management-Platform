import { Resvg } from '@resvg/resvg-js';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { BRAND_COLORS, MARK_DIAMOND, MARK_FILLS, MARK_LEGS_PATH } from '../src/brand/geometry.ts';

/**
 * Builds the favicon / app-icon set from the logo geometry (brand board §4 "Favicon & App Icon":
 * white M with the yellow diamond on a Mosaic Blue tile). Run `pnpm brand:assets` after changing
 * src/brand/geometry.ts; a test fails if public/ is out of date.
 */

const TILE = 88; // the 48-unit mark centred with 20 units of padding (~55% of the tile, as on the board)
const PADDING = (TILE - 48) / 2;

function tileSvg({ rounded }: { rounded: boolean }): string {
  const fills = MARK_FILLS.tile;
  const d = MARK_DIAMOND;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${TILE} ${TILE}">`,
    `<rect width="${TILE}" height="${TILE}" rx="${rounded ? 20 : 0}" fill="${BRAND_COLORS.blue}"/>`,
    `<g transform="translate(${PADDING} ${PADDING})">`,
    `<path d="${MARK_LEGS_PATH}" fill="${fills.legs}"/>`,
    `<rect x="${d.x}" y="${d.y}" width="${d.width}" height="${d.height}" rx="${d.rx}" transform="${d.transform}" fill="${fills.diamond}"/>`,
    '</g></svg>',
    '',
  ].join('');
}

/** Rounded tile: browser tabs and "any"-purpose manifest icons. */
export const faviconSvg = () => tileSvg({ rounded: true });

/**
 * Full-bleed tile: iOS and Android apply their own masks. The mark stays inside the maskable
 * safe zone (its bounding circle has radius ≈ 39% of the tile; the limit is 40%).
 */
const fullBleedSvg = () => tileSvg({ rounded: false });

export function webManifest(): string {
  return `${JSON.stringify({
    name: 'MOSAIC — ICFO Core Facilities',
    short_name: 'MOSAIC',
    description: 'Unified access to research facilities',
    start_url: '/',
    display: 'standalone',
    background_color: '#F8F6F1',
    theme_color: BRAND_COLORS.blue,
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }, null, 2)}\n`;
}

/** PNG icons written to public/, with their pixel size. */
export const BRAND_ICON_FILES = {
  'apple-touch-icon.png': 180,
  'icon-192.png': 192,
  'icon-512.png': 512,
  'icon-maskable-512.png': 512,
} as const;

function renderPng(svg: string, size: number): Buffer {
  return new Resvg(svg, { fitTo: { mode: 'width', value: size } }).render().asPng();
}

/** A .ico container of PNG images (supported by every browser that reads favicon.ico). */
function icoFromPngs(pngs: { size: number; data: Buffer }[]): Buffer {
  const header = Buffer.alloc(6 + pngs.length * 16);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(pngs.length, 4);
  let offset = header.length;
  pngs.forEach(({ size, data }, i) => {
    const entry = 6 + i * 16;
    header.writeUInt8(size >= 256 ? 0 : size, entry); // width (0 = 256)
    header.writeUInt8(size >= 256 ? 0 : size, entry + 1); // height
    header.writeUInt8(0, entry + 2); // palette colours
    header.writeUInt8(0, entry + 3); // reserved
    header.writeUInt16LE(1, entry + 4); // colour planes
    header.writeUInt16LE(32, entry + 6); // bits per pixel
    header.writeUInt32LE(data.length, entry + 8);
    header.writeUInt32LE(offset, entry + 12);
    offset += data.length;
  });
  return Buffer.concat([header, ...pngs.map((p) => p.data)]);
}

export function buildBrandAssets(): Record<string, Buffer | string> {
  const icons = Object.fromEntries(Object.entries(BRAND_ICON_FILES).map(([name, size]) => [
    name,
    renderPng(name === 'icon-192.png' || name === 'icon-512.png' ? faviconSvg() : fullBleedSvg(), size),
  ]));
  return {
    'favicon.svg': faviconSvg(),
    'favicon.ico': icoFromPngs([16, 32, 48].map((size) => ({ size, data: renderPng(faviconSvg(), size) }))),
    'manifest.webmanifest': webManifest(),
    ...icons,
  };
}

// CLI: node scripts/brand-assets.ts
if (import.meta.main) {
  const dir = path.resolve(import.meta.dirname, '../public');
  for (const [name, content] of Object.entries(buildBrandAssets())) {
    writeFileSync(path.join(dir, name), content);
    console.log(`wrote public/${name}`);
  }
}
