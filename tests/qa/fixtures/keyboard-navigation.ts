/** macOS WebKit supports the alternate native Option-Tab traversal mode. */
export function focusTraversalKey(platform: string, browserName: string | undefined): 'Tab' | 'Alt+Tab' {
  return platform === 'darwin' && browserName === 'webkit' ? 'Alt+Tab' : 'Tab'
}
