/** Option reverses WebKit's preference; verified full navigation uses plain Tab. */
export function focusTraversalKey(platform: string, browserName: string | undefined, fullKeyboardNavigation = false): 'Tab' | 'Alt+Tab' {
  return platform === 'darwin' && browserName === 'webkit' && !fullKeyboardNavigation ? 'Alt+Tab' : 'Tab'
}
