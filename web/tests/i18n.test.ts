import { describe, expect, it } from 'vitest';
import { TRANSLATIONS, translateRating } from '../src/i18n/translations';

describe('Bilingual ES / FR dictionary completeness', () => {
  it('guarantees 100% key parity and non-empty strings across Spanish and French', () => {
    const esKeys = Object.keys(TRANSLATIONS.es).sort();
    const frKeys = Object.keys(TRANSLATIONS.fr).sort();
    expect(frKeys).toEqual(esKeys);

    for (const key of esKeys as Array<keyof typeof TRANSLATIONS.es>) {
      expect(TRANSLATIONS.es[key].trim().length).toBeGreaterThan(0);
      expect(TRANSLATIONS.fr[key].trim().length).toBeGreaterThan(0);
    }
  });

  it('translates standardized subjective rating scales in both languages', () => {
    expect(translateRating('excellent', 'es')).toBe('Excelente');
    expect(translateRating('excellent', 'fr')).toBe('Excellente');
    expect(translateRating('poor', 'fr')).toBe('Mauvaise');
    expect(translateRating(null, 'es')).toBe('—');
  });
});
