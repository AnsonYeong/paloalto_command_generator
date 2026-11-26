import { useEffect, useState } from 'react'
import { Icon } from './ui'

type Theme = 'light' | 'dark'
const THEME_KEY = 'pan-command-builder-theme'

export function ThemeSelector() {
  const [theme, setTheme] = useState<Theme>(() => document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light')
  const [saveError, setSaveError] = useState(false)

  useEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])

  useEffect(() => {
    const syncTheme = (event: StorageEvent) => {
      if (event.key === THEME_KEY || event.key === null) {
        setTheme(event.newValue === 'dark' ? 'dark' : 'light')
      }
    }
    window.addEventListener('storage', syncTheme)
    return () => window.removeEventListener('storage', syncTheme)
  }, [])

  function selectTheme(next: Theme) {
    setTheme(next)
    try { localStorage.setItem(THEME_KEY, next); setSaveError(false) }
    catch { setSaveError(true) }
  }

  return <div className="theme-control">
    <div className="theme-selector" role="group" aria-label="Color theme">
      <button type="button" aria-pressed={theme === 'light'} aria-label="Use light mode" onClick={() => selectTheme('light')}><Icon name="sun" size={16} /><span>Light</span></button>
      <button type="button" aria-pressed={theme === 'dark'} aria-label="Use dark mode" onClick={() => selectTheme('dark')}><Icon name="moon" size={16} /><span>Dark</span></button>
    </div>
    {saveError && <span className="theme-save-error" role="status">Theme changed for this session; browser storage is unavailable.</span>}
  </div>
}
