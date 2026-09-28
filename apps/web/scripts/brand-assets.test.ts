// @vitest-environment node
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { BRAND_ICON_FILES, faviconSvg, webManifest } from './brand-assets.ts';

const publicFile = (name: string) => readFileSync(path.resolve(process.cwd(), 'public', name));

/** Width/height from a PNG's IHDR chunk. */
function pngSize(png: Buffer): [number, number] {
  expect(png.subarray(1, 4).toString('ascii')).toBe('PNG');
  return [png.readUInt32BE(16), png.readUInt32BE(20)];
}

describe('generated brand icons (run `pnpm brand:assets` to regenerate)', () => {
  it('favicon.svg and the web manifest match the logo geometry', () => {
    expect(publicFile('favicon.svg').toString('utf8')).toBe(faviconSvg());
    expect(publicFile('manifest.webmanifest').toString('utf8')).toBe(webManifest());
  });

  it.each(Object.entries(BRAND_ICON_FILES))('%s is a %ipx square PNG', (name, size) => {
    expect(pngSize(publicFile(name))).toEqual([size, size]);
  });

  it('favicon.ico holds 16, 32 and 48px PNG images', () => {
    const ico = publicFile('favicon.ico');
    expect([ico.readUInt16LE(0), ico.readUInt16LE(2)]).toEqual([0, 1]); // reserved, type = icon
    const count = ico.readUInt16LE(4);
    const sizes = Array.from({ length: count }, (_, i) => {
      const entry = 6 + i * 16;
      const [length, offset] = [ico.readUInt32LE(entry + 8), ico.readUInt32LE(entry + 12)];
      return pngSize(ico.subarray(offset, offset + length))[0];
    });
    expect(sizes).toEqual([16, 32, 48]);
  });
});
