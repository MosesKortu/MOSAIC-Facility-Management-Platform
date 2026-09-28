import { LOCALES, type Locale, type LocalizedText } from '@mosaic/contracts';

/** Chooses en / es / ca from an Accept-Language header by preference weight; English otherwise. */
export function pickLocale(header: string | undefined): Locale {
  if (!header) return 'en';
  const ranked = header
    .split(',')
    .map((part, index) => {
      const [tag = '', ...params] = part.trim().split(';');
      const q = params.map((p) => p.trim()).find((p) => p.startsWith('q='));
      const weight = q ? Number(q.slice(2)) : 1;
      return { language: tag.split('-')[0]!.toLowerCase(), weight: Number.isFinite(weight) ? weight : 0, index };
    })
    .filter((entry) => entry.weight > 0)
    .sort((a, b) => b.weight - a.weight || a.index - b.index);
  return (ranked.find((entry) => (LOCALES as readonly string[]).includes(entry.language))?.language as Locale) ?? 'en';
}

/** The text in the requested locale, falling back to English when that translation is empty. */
export function localize(text: LocalizedText, locale: Locale): string {
  return text[locale]?.trim() || text.en;
}
