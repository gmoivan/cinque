export type Locale = 'es' | 'en'
export type Theme = 'dark' | 'light'

const localeKey = 'cinque.locale'
const themeKey = 'cinque.theme'

export function loadLocale(storage: Pick<Storage, 'getItem'> = localStorage): Locale {
  return storage.getItem(localeKey) === 'en' ? 'en' : 'es'
}

export function saveLocale(locale: Locale, storage: Pick<Storage, 'setItem'> = localStorage): void {
  storage.setItem(localeKey, locale)
}

export function loadTheme(storage: Pick<Storage, 'getItem'> = localStorage): Theme {
  return storage.getItem(themeKey) === 'light' ? 'light' : 'dark'
}

export function saveTheme(theme: Theme, storage: Pick<Storage, 'setItem'> = localStorage): void {
  storage.setItem(themeKey, theme)
}

export function applyTheme(theme: Theme, root: HTMLElement = document.documentElement): void {
  root.dataset.theme = theme
  root.style.colorScheme = theme
}
