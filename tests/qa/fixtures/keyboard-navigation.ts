/** Native macOS WebKit uses Option-Tab to include all interactive controls. */
export function focusTraversalKey(platform: string, browserName: string | undefined): 'Tab' | 'Alt+Tab' {
  return platform === 'darwin' && browserName === 'webkit' ? 'Alt+Tab' : 'Tab'
}
