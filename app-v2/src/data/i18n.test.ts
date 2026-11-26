import { describe, expect, it } from 'vitest';
import { translations, type TranslationKey } from './i18n';

describe('application translations', () => {
  it('provides every Arabic translation key in French and English', () => {
    const keys = Object.keys(translations.ar) as TranslationKey[];
    for (const key of keys) {
      expect(translations.fr[key], 'missing French key: ' + key).toBeTruthy();
      expect(translations.en[key], 'missing English key: ' + key).toBeTruthy();
    }
  });

  it('contains the owner settings labels in all supported languages', () => {
    const keys: TranslationKey[] = [
      'settings','settingsTitle','settingsSubtitle','settingsLanguageTitle',
      'settingsBusinessTitle','settingsCurrency','settingsStorage','settingsDatabase',
      'settingsDataTitle','settingsOpenBackup','settingsSecurityTitle',
    ];
    for (const key of keys) {
      expect(translations.ar[key]).toBeTruthy();
      expect(translations.fr[key]).toBeTruthy();
      expect(translations.en[key]).toBeTruthy();
    }
  });
});
