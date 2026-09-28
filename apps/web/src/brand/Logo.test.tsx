import { render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { BRAND_COLORS, MARK_VIEWBOX } from './geometry.ts';
import { Logo, LogoMark } from './Logo.tsx';

describe('LogoMark', () => {
  it('is decorative by default and named when it stands alone', () => {
    const { container, rerender } = render(<LogoMark />);
    expect(container.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
    rerender(<LogoMark title="MOSAIC" />);
    expect(screen.getByRole('img', { name: 'MOSAIC' }).getAttribute('viewBox')).toBe(MARK_VIEWBOX);
  });

  it('uses brand blue with the yellow diamond in colour, and is all white inverted (brand board §2)', () => {
    const fills = (tone: 'color' | 'inverse') => {
      const { container, unmount } = render(<LogoMark tone={tone} />);
      const result = [...container.querySelectorAll('path, rect')].map((el) => el.getAttribute('fill'));
      unmount();
      return result;
    };
    expect(fills('color')).toEqual([BRAND_COLORS.blue, BRAND_COLORS.yellow]);
    expect(fills('inverse')).toEqual([BRAND_COLORS.white, BRAND_COLORS.white]);
  });
});

describe('Logo', () => {
  it('reads as the product name, with the tagline when requested', () => {
    render(<Logo tagline />);
    expect(screen.getByText('MOSAIC')).toBeTruthy();
    expect(screen.getByText('Unified access to research facilities')).toBeTruthy();
  });
});

describe('brand colours', () => {
  it('match the design tokens exactly', () => {
    const tokens = readFileSync(path.resolve(process.cwd(), 'src/styles/tokens.css'), 'utf8').toLowerCase();
    expect(tokens).toContain(`--color-pix-blue: ${BRAND_COLORS.blue.toLowerCase()};`);
    expect(tokens).toContain(`--color-pix-yellow: ${BRAND_COLORS.yellow.toLowerCase()};`);
  });
});
