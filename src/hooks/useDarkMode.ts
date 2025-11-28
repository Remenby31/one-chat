import { useEffect, useState } from 'react'

/**
 * Hook to detect and track the current theme (dark/light mode)
 *
 * @returns true if dark mode is active, false otherwise
 *
 * @example
 * const isDark = useDarkMode()
 * const theme = isDark ? 'dark' : 'light'
 */
export function useDarkMode(): boolean {
  const [isDark, setIsDark] = useState(() => {
    if (typeof document !== 'undefined') {
      return document.documentElement.classList.contains('dark')
    }
    return true // Default to dark on SSR
  })

  useEffect(() => {
    if (typeof document === 'undefined') return

    // Create observer to watch for theme changes
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.attributeName === 'class') {
          setIsDark(document.documentElement.classList.contains('dark'))
        }
      })
    })

    // Observe the document element for class changes
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    })

    // Cleanup
    return () => observer.disconnect()
  }, [])

  return isDark
}
