import { useState, useCallback } from 'react'

export type Theme = 'light' | 'dark' | 'system'

function getStoredTheme(): Theme {
  return (localStorage.getItem('proto-theme') as Theme) || 'dark'
}

function applyTheme(theme: Theme) {
  const root = document.documentElement
  if (theme === 'system') {
    const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    root.classList.toggle('dark', isDark)
  } else {
    root.classList.toggle('dark', theme === 'dark')
  }
}

// Apply on load (before React renders)
applyTheme(getStoredTheme())

// Listen for system theme changes
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  if (getStoredTheme() === 'system') applyTheme('system')
})

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(getStoredTheme)

  const setTheme = useCallback((t: Theme) => {
    localStorage.setItem('proto-theme', t)
    setThemeState(t)
    applyTheme(t)
  }, [])

  return { theme, setTheme }
}
