import { createContext, useContext } from 'react';
import { type Language, type UnitSystem } from '../types/domain';
import { TRANSLATIONS, type TranslationKey } from './translations';

export interface PreferencesContextValue {
  language: Language;
  unitSystem: UnitSystem;
  ascentLimitMMin: number;
  t: (key: TranslationKey) => string;
  setPreferences: (patch: {
    language?: Language;
    unitSystem?: UnitSystem;
    ascentLimitMMin?: number;
  }) => Promise<void>;
}

export const PreferencesContext = createContext<PreferencesContextValue>({
  language: 'es',
  unitSystem: 'metric',
  ascentLimitMMin: 15,
  t: (key) => TRANSLATIONS.es[key],
  setPreferences: async () => {},
});

export function usePreferences(): PreferencesContextValue {
  return useContext(PreferencesContext);
}
