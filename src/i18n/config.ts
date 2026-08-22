export const defaultLocale = 'ru' as const;
export const supportedLocales = ['ru'] as const;
export type Locale = (typeof supportedLocales)[number];

export const localeNames: Record<Locale, string> = {
  ru: 'Русский',
};
