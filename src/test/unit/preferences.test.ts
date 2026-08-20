import { describe, expect, it } from 'vitest'

import { applyTheme, loadLocale, loadTheme, saveLocale, saveTheme } from '../../app/preferences'
import { translate } from '../../app/i18n'

function storage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial))
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value), values }
}

describe('local preferences', () => {
  it('defaults to Spanish and dark while persisting valid individual choices', () => {
    const store = storage()
    expect(loadLocale(store)).toBe('es')
    expect(loadTheme(store)).toBe('dark')
    expect(translate('es', 'createSession')).toBe('Crear partida')
    expect(translate('en', 'createSession')).toBe('Create game')
    saveLocale('en', store)
    saveTheme('light', store)
    expect(loadLocale(store)).toBe('en')
    expect(loadTheme(store)).toBe('light')
  })

  it('applies the selected color scheme to the device document only', () => {
    const root = document.createElement('html')
    applyTheme('light', root)
    expect(root.dataset.theme).toBe('light')
    expect(root.style.colorScheme).toBe('light')
  })
})
