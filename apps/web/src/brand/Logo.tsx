import { cn } from '../lib/cn.ts';
import { MARK_DIAMOND, MARK_FILLS, MARK_LEGS_PATH, MARK_VIEWBOX, TAGLINE, type MarkTone } from './geometry.ts';

interface LogoMarkProps {
  tone?: Exclude<MarkTone, 'tile'>;
  /** Rendered height in px (the mark is square). Brand minimum for digital use: 24px. */
  size?: number;
  /** Give the mark an accessible name when it appears without the wordmark. */
  title?: string;
  className?: string;
}

/** The logomark alone ("icon only" on the brand board). */
export function LogoMark({ tone = 'color', size = 32, title, className }: LogoMarkProps) {
  const fills = MARK_FILLS[tone];
  return (
    <svg viewBox={MARK_VIEWBOX} width={size} height={size} className={cn('shrink-0', className)}
      {...(title ? { role: 'img', 'aria-label': title } : { 'aria-hidden': true })} focusable="false">
      <path d={MARK_LEGS_PATH} fill={fills.legs} />
      <rect {...MARK_DIAMOND} fill={fills.diamond} />
    </svg>
  );
}

const SIZES = {
  sm: { mark: 32, word: 'text-[1.25rem]', tagline: 'text-[0.6875rem]', gap: 'gap-2.5' },
  md: { mark: 48, word: 'text-[1.75rem]', tagline: 'text-caption', gap: 'gap-3' },
  lg: { mark: 88, word: 'text-[2.75rem]', tagline: 'text-body', gap: 'gap-4' },
} as const;

interface LogoProps {
  /** horizontal: navigation and headers. stacked: square/tall spaces (brand board §1). */
  layout?: 'horizontal' | 'stacked';
  tone?: 'color' | 'inverse';
  size?: keyof typeof SIZES;
  /** Include "Unified access to research facilities" (only where it stays legible). */
  tagline?: boolean;
  /** Stacked layout only: centred (default, as on the board) or aligned to the start edge. */
  align?: 'center' | 'start';
  className?: string;
}

/**
 * Mark + wordmark lockup. The wordmark is live text in the licensed Arkibal Display Bold, so it stays
 * crisp at any size and reads as "MOSAIC" to assistive technology.
 */
export function Logo({ layout = 'horizontal', tone = 'color', size = 'sm', tagline = false, align = 'center', className }: LogoProps) {
  const s = SIZES[size];
  const inverse = tone === 'inverse';
  const stackedAlign = align === 'center' ? 'items-center text-center' : 'items-start text-left';
  return (
    <span className={cn('inline-flex', layout === 'stacked' ? cn('flex-col', stackedAlign) : 'items-center', s.gap, className)}>
      <LogoMark tone={tone} size={s.mark} />
      <span className={cn('flex flex-col gap-1', layout === 'stacked' && align === 'center' ? 'items-center' : 'items-start')}>
        <span className={cn('font-display leading-none font-bold tracking-[0.06em]', s.word, inverse ? 'text-white' : 'text-pix-blue')}>MOSAIC</span>
        {tagline && (
          <span className={cn('flex items-center gap-1.5 leading-tight', s.tagline, inverse ? 'text-white/85' : 'text-ink-muted')}>
            <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full bg-pix-yellow" />
            {TAGLINE}
          </span>
        )}
      </span>
    </span>
  );
}
