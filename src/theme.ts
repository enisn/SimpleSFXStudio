export const THEME_STORAGE_KEY = 'soundmaker-theme'

export const THEME_MODES = ['system', 'light', 'dark'] as const

export type ThemeMode = (typeof THEME_MODES)[number]
export type ResolvedTheme = 'light' | 'dark'

export function isThemeMode(value: string | null): value is ThemeMode {
  return value === 'system' || value === 'light' || value === 'dark'
}

export function getThemeMediaQuery() {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return null
  }

  return window.matchMedia('(prefers-color-scheme: dark)')
}

export function getStoredThemeMode(): ThemeMode {
  if (typeof window === 'undefined') {
    return 'system'
  }

  const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY)

  return isThemeMode(storedTheme) ? storedTheme : 'system'
}

export function resolveTheme(
  themeMode: ThemeMode,
  mediaQuery: MediaQueryList | null = getThemeMediaQuery(),
): ResolvedTheme {
  if (themeMode === 'light' || themeMode === 'dark') {
    return themeMode
  }

  return mediaQuery?.matches ? 'dark' : 'light'
}

export function applyThemeMode(
  themeMode: ThemeMode,
  mediaQuery: MediaQueryList | null = getThemeMediaQuery(),
) {
  const resolvedTheme = resolveTheme(themeMode, mediaQuery)

  if (typeof document !== 'undefined') {
    document.documentElement.dataset.theme = resolvedTheme
  }

  return resolvedTheme
}
