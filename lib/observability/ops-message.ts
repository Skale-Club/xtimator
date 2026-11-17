// Pure operations message formatting; no transport or server dependencies.
export type OpsAlert = {
  kind: string
  title: string
  message: string
  severity?: 'warning' | 'error'
  dedupeKey?: string
  suppressWindowSec?: number
  /** Legacy caller hint; the shared severity vocabulary takes precedence. */
  icon?: string
  /** Labelled facts rendered one per line under the message; empty values are skipped. */
  fields?: Array<[label: string, value: string | null | undefined]>
}

/**
 * Render an alert to the Telegram HTML payload: a severity emoji + <b>title</b>
 * on line one, then the message. Titles/messages are internal, but error strings
 * can contain '<', '>' or '&', so we do the minimal HTML escaping Telegram's
 * parse_mode: 'HTML' requires to avoid a malformed-entity send failure.
 */
const opsTitles: Record<string, string> = {
  tenant_signup: 'Novo cadastro',
  tenant_payment_received: 'Pagamento recebido',
  subscription_payment_received: 'Assinatura paga',
  tenant_quota_exhausted: 'Cota esgotada',
  stripe_event_unresolved: 'Evento Stripe sem empresa',
  payment_disputed: 'Pagamento contestado',
  whatsapp_link_conflict: 'Conflito no vínculo WhatsApp',
  cron_failed: 'Tarefa agendada falhou',
  db_cron_failed: 'Tarefa do banco falhou',
  transcription_failed: 'Transcrição falhou',
  vision_failed: 'Análise de fotos falhou',
  estimate_generation_failed: 'Geração de orçamento falhou',
  pipeline_stuck: 'Geração parada',
  ai_fallback: 'IA operando com alternativa',
  ai_provider_failed: 'Falha no provedor de IA',
  credit_balance_drift: 'Saldo de créditos divergente',
  paid_tier_without_subscription: 'Plano pago sem assinatura',
  stale_open_invoices: 'Faturas abertas há mais de 30 dias',
  monthly_credit_grant_zero_success: 'Créditos mensais não concedidos',
  auto_topup_charged_without_grant: 'Recarga cobrada sem créditos',
  auto_topup_charge_failed: 'Cobrança da recarga falhou',
  credit_ledger_write_failed: 'Registro de créditos falhou',
  signup_credit_grant_failed: 'Créditos de cadastro não concedidos',
  stripe_connect_account_mismatch: 'Conta Stripe Connect divergente',
  invoice_amount_mismatch: 'Valor de fatura divergente',
  error_spike: 'Pico de erros no servidor',
}

const factLabels: Record<string, string> = {
  Company: 'Empresa', Industries: 'Setores', Owner: 'Responsável', Phone: 'Telefone',
  Email: 'E-mail', Location: 'Local', Language: 'Idioma', 'Company ID': 'ID da empresa',
  'Phone (last 4)': 'Telefone (últimos 4)', 'Company that tried to link': 'Empresa solicitante',
  'Company already linked': 'Empresa vinculada', User: 'Usuário',
}

export function formatOpsMessage(alert: OpsAlert): string {
  // Business events are informational, even though legacy callers use warning
  // for Sentry. Keep that transport's severity and all delivery gates unchanged.
  const informational = ['tenant_signup', 'tenant_payment_received', 'subscription_payment_received'].includes(alert.kind)
  const severity = informational ? '🔵 Informação' : alert.severity === 'error' ? '🔴 Crítico' : '🟠 Atenção'
  const esc = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const title = Object.hasOwn(opsTitles, alert.kind) ? opsTitles[alert.kind] : alert.title
  const lines = [`${severity} | <b>Xtimator — ${esc(title)}</b>`]
  // Preserve the original title as diagnostic context, including dynamic
  // company names, operation names, cron IDs and counts from existing callers.
  if (title !== alert.title) lines.push('', `<b>Contexto:</b> ${esc(alert.title)}`)
  if (alert.message) lines.push('', `<b>Detalhes:</b> ${esc(alert.message)}`)
  const fields = (alert.fields ?? []).filter(([, value]) => value != null && String(value).trim() !== '')
  if (fields.length > 0) {
    lines.push('')
    for (const [label, value] of fields) lines.push(`<b>${esc(Object.hasOwn(factLabels, label) ? factLabels[label] : label)}:</b> ${esc(String(value))}`)
  }
  return lines.join('\n')
}

