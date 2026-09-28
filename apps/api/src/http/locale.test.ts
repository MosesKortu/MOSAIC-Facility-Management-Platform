import { describe, expect, it } from 'vitest';
import { localize, pickLocale } from './locale.ts';

describe('pickLocale', () => {
  it('picks the most preferred supported language', () => {
    expect(pickLocale('ca-ES,ca;q=0.9,es;q=0.8,en;q=0.7')).toBe('ca');
    expect(pickLocale('fr-FR,es;q=0.5,en;q=0.9')).toBe('en');
    expect(pickLocale('es')).toBe('es');
  });

  it('falls back to English for missing, unsupported or malformed headers', () => {
    expect(pickLocale(undefined)).toBe('en');
    expect(pickLocale('fr,de')).toBe('en');
    expect(pickLocale(';;;q=abc')).toBe('en');
  });
});

describe('localize', () => {
  it('uses the requested language, or English when that translation is missing', () => {
    expect(localize({ en: 'Dry etching', es: 'Grabado seco' }, 'es')).toBe('Grabado seco');
    expect(localize({ en: 'Dry etching', es: '' }, 'es')).toBe('Dry etching');
    expect(localize({ en: 'Dry etching' }, 'ca')).toBe('Dry etching');
  });
});
