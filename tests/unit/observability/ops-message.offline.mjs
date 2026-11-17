// Run: node --experimental-strip-types tests/unit/observability/ops-message.offline.mjs
// Built-in assertions keep this fixture runnable without a Vitest worker.
import assert from 'node:assert/strict'
import { formatOpsMessage } from '../../../lib/observability/ops-message.ts'

let checks = 0
for (const [kind, prefix] of [
  ['tenant_signup', '🔵 Informação'],
  ['tenant_payment_received', '🔵 Informação'],
  ['subscription_payment_received', '🔵 Informação'],
  ['cron_failed', '🔴 Crítico'],
  ['ai_provider_failed', '🟠 Atenção'],
]) {
  const out = formatOpsMessage({
    kind, title: '5<10 & tenant', message: '<script>',
    severity: kind === 'cron_failed' ? 'error' : 'warning', icon: '🎉',
  })
  assert.ok(out.startsWith(prefix + ' | <b>Xtimator — '))
  assert.ok(out.includes('5&lt;10 &amp; tenant'))
  assert.ok(out.includes('&lt;script&gt;'))
  checks += 3
}
const out = formatOpsMessage({
  kind: 'new_kind', title: '<unknown>', message: '',
  fields: [['Company', 'A & B'], ['Phone', null], ['Email', '  ']],
})
assert.ok(out.includes('&lt;unknown&gt;'))
assert.ok(out.includes('<b>Empresa:</b> A &amp; B'))
assert.ok(!out.includes('Telefone:'))
assert.ok(!out.includes('E-mail:'))
checks += 4
assert.ok(formatOpsMessage({kind: 'constructor', title: 'literal', message: '', fields: [['toString', 'value']]}).includes('<b>toString:</b> value'))
checks += 1
console.log(`Offline formatting assertions passed: ${checks}`)
