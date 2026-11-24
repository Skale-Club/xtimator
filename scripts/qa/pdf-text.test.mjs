import assert from 'node:assert/strict'
import test from 'node:test'
import { normalizePdfText } from '../../tests/qa/fixtures/pdf-text.ts'

const expected = /Subtotal \$1,033\.33 Discount \(13\.33%\) -\$137\.74 Tax \(7\.25%\) \$62\.84 Total \$958\.43/
const extracted = 'Subtotal $1,033.33 Discount (13.33%) -$137 .74 Tax (7 .25%) $62.84 Total $958.43'

test('preserves the visually verified monetary breakdown despite decimal glyph extraction gaps', () => {
  assert.match(normalizePdfText(extracted), expected)
})

test('wrong cents, missing negative signs, extra precision and separate lines remain detectable', () => {
  for (const changed of [
    extracted.replace('958.43', '958 .42'),
    extracted.replace('62.84', '62 .85'),
    extracted.replace('-$137', '$137'),
    extracted.replace('7 .25', '7 .250'),
    extracted.replace('7 .25', '7\n.25'),
  ]) assert.doesNotMatch(normalizePdfText(changed), expected)
})
