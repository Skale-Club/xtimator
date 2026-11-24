import assert from 'node:assert/strict'
import test from 'node:test'
import { focusTraversalKey } from '../../tests/qa/fixtures/keyboard-navigation.ts'

test('honors verified full keyboard navigation and retains platform defaults otherwise', () => {
  assert.equal(focusTraversalKey('darwin', 'webkit'), 'Alt+Tab')
  assert.equal(focusTraversalKey('darwin', 'webkit', true), 'Tab')
  for (const [platform, browser] of [
    ['linux', 'webkit'], ['win32', 'webkit'], ['darwin', 'chromium'],
    ['darwin', 'firefox'], ['darwin', undefined],
  ]) {
    assert.equal(focusTraversalKey(platform, browser), 'Tab')
    assert.equal(focusTraversalKey(platform, browser, true), 'Tab')
  }
})
