import assert from 'node:assert/strict'
import test from 'node:test'
import { focusTraversalKey } from '../../tests/qa/fixtures/keyboard-navigation.ts'

test('uses the native full-control shortcut only for WebKit hosted on macOS', () => {
  assert.equal(focusTraversalKey('darwin', 'webkit'), 'Alt+Tab')
  for (const [platform, browser] of [
    ['linux', 'webkit'], ['win32', 'webkit'], ['darwin', 'chromium'],
    ['darwin', 'firefox'], ['darwin', undefined],
  ]) assert.equal(focusTraversalKey(platform, browser), 'Tab')
})
