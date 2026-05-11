---
id: SEED-013
status: dormant
planted: 2026-05-10
planted_during: v2.0 WhatsApp Estimate Channel (post-milestone analysis)
trigger_when: When introducing paid plans, billing integration (Stripe), trial flows, or any milestone focused on monetization
scope: Large
---

# SEED-013: Subscription Tiers and Entitlements

## Why This Matters

O Xtimator está pronto para uso, mas **todo mundo tem acesso ilimitado**. Não existe noção de plano, trial, ou limite. Para virar SaaS sustentável, precisa de:

1. **Free tier** — pra atrair usuários novos, limitado o suficiente pra forçar upgrade quem usa de verdade
2. **Paid tier(s)** — recorrência mensal que paga o custo de Anthropic/OpenAI/Whisper
3. **Trial** — primeiros 14 dias com features de plano pago, depois rebaixa pra free
4. **Enforcement real** — não basta declarar limites, tem que bloquear quando atingir

Hoje cada estimativa gerada custa:
- Whisper transcription: ~$0.006/min de áudio
- Claude Vision (foto): ~$0.01-0.03/foto
- Claude Sonnet (estimativa): ~$0.05-0.20/estimativa

Sem limites, um usuário casual custa $5/mês — um power user custa $50/mês. Sem plano pago, isso vira pizza.

## A Estrutura: Inspirado no Chatbot

O projeto antigo (`/lib/ai/entitlements.ts`) tem um padrão limpo:

```typescript
type Entitlements = {
  maxEstimatesPerMonth: number
  maxEstimatesPerDay: number
  maxPhotosPerEstimate: number
  maxAudioMinutesPerEstimate: number
  whatsappEnabled: boolean
  customDomainEnabled: boolean
  priceBookEnabled: boolean
  pdfEnabled: boolean
  whitelabelEnabled: boolean
  prioritySupport: boolean
}

export const tiers: Record<TierName, Entitlements> = {
  trial: {
    maxEstimatesPerMonth: Infinity,
    maxEstimatesPerDay: 20,
    maxPhotosPerEstimate: 10,
    maxAudioMinutesPerEstimate: 5,
    whatsappEnabled: true,
    customDomainEnabled: false,
    priceBookEnabled: true,
    pdfEnabled: true,
    whitelabelEnabled: false,
    prioritySupport: false,
  },
  free: {
    maxEstimatesPerMonth: 10,
    maxEstimatesPerDay: 3,
    maxPhotosPerEstimate: 3,
    maxAudioMinutesPerEstimate: 2,
    whatsappEnabled: false,         // gating do canal premium
    customDomainEnabled: false,
    priceBookEnabled: false,
    pdfEnabled: true,
    whitelabelEnabled: false,
    prioritySupport: false,
  },
  pro: {
    maxEstimatesPerMonth: 200,
    maxEstimatesPerDay: 30,
    maxPhotosPerEstimate: 20,
    maxAudioMinutesPerEstimate: 15,
    whatsappEnabled: true,
    customDomainEnabled: false,
    priceBookEnabled: true,
    pdfEnabled: true,
    whitelabelEnabled: false,
    prioritySupport: false,
  },
  business: {
    maxEstimatesPerMonth: Infinity,
    maxEstimatesPerDay: 100,
    maxPhotosPerEstimate: 50,
    maxAudioMinutesPerEstimate: 30,
    whatsappEnabled: true,
    customDomainEnabled: true,
    priceBookEnabled: true,
    pdfEnabled: true,
    whitelabelEnabled: true,
    prioritySupport: true,
  },
}
```

**Pricing tentativo:** Free $0, Pro $29/mo, Business $99/mo. Refinar baseado em market research.

## Database Schema

```sql
-- Plano da company
ALTER TABLE companies ADD COLUMN tier TEXT NOT NULL DEFAULT 'free';
ALTER TABLE companies ADD COLUMN tier_trial_ends_at TIMESTAMPTZ;
ALTER TABLE companies ADD COLUMN stripe_customer_id TEXT;
ALTER TABLE companies ADD COLUMN stripe_subscription_id TEXT;
ALTER TABLE companies ADD COLUMN tier_renews_at TIMESTAMPTZ;
ALTER TABLE companies ADD COLUMN tier_cancelled_at TIMESTAMPTZ;

-- Usage tracking (rolling, não overwriting)
CREATE TABLE usage_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,  -- 'estimate_generated' | 'photo_analyzed' | 'audio_transcribed'
  units NUMERIC,             -- e.g., minutos de áudio, número de fotos
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX usage_events_company_created ON usage_events(company_id, created_at DESC);
```

`usage_events` permite analytics (gráfico de uso no /settings/billing) sem cálculos pesados — pode ser agregado on-demand ou em view materializada.

## API de Enforcement

```typescript
// lib/entitlements.ts
import { rateLimit } from '@/lib/ratelimit'

export async function checkEntitlement(
  companyId: string,
  feature: keyof Entitlements
): Promise<{ allowed: boolean; reason?: string; upgradeUrl?: string }>

export async function consumeQuota(
  companyId: string,
  quotaType: 'estimate' | 'photo_batch' | 'audio_minutes',
  units = 1
): Promise<{ allowed: boolean; remaining: number }>
```

Uso típico:
```typescript
// Em generate-estimate/route.ts
const { allowed, remaining } = await consumeQuota(companyId, 'estimate')
if (!allowed) {
  return NextResponse.json({
    error: 'plan_limit_reached',
    upgradeUrl: '/settings/billing'
  }, { status: 402 })  // 402 Payment Required
}
```

## Stripe Integration

```
checkout flow:
  /settings/billing → /api/billing/create-checkout-session → Stripe Checkout
                                                          ↓
  Stripe webhook  ← /api/webhooks/stripe ← checkout.session.completed
                                       ← invoice.paid
                                       ← invoice.payment_failed
                                       ← customer.subscription.deleted
```

Webhook handler atualiza `companies.tier`, `stripe_subscription_id`, `tier_renews_at`.

## UI Surface

```
/settings/billing
├── Current plan card (Free / Pro / Business)
├── Usage this month (graph from usage_events)
│   ├── Estimates: 7 / 10
│   ├── Photos: 24 / 30
│   └── Audio: 4.2min / 6min
├── [Upgrade Plan] button → Stripe Checkout
└── [Manage Subscription] button → Stripe Customer Portal
```

Em-app gating:
- Banner persistente quando trial < 3 dias
- Modal "You've reached your monthly limit" com CTA Upgrade
- Features bloqueadas (whatsapp, custom domain) mostram badge "Pro" + tooltip

## Scope Estimate

**Large** — milestone próprio (v3.0 Monetization), 5-7 fases:

1. **Schema + tier definitions** — migrations, `lib/entitlements.ts`, `tiers` config, RLS updates
2. **Usage tracking** — `usage_events` table, hooks em todos os endpoints que consomem AI, helpers `recordUsage()` + `getUsage()`
3. **Enforcement layer** — `checkEntitlement()`, `consumeQuota()`, aplicar em todos os endpoints que precisam
4. **Stripe integration** — checkout sessions, customer portal, webhook handler com idempotência
5. **Settings UI** — `/settings/billing` page, usage graphs, upgrade flow
6. **Trial automation** — cron job para downgrade automático de trial → free quando expira; emails de aviso
7. **Admin tooling** — admin pode forçar tier, conceder créditos extras, ver MRR

**Dependências:**
- SEED-012 (Rate limiting infrastructure) — pré-requisito, enforcement por hora/dia usa o mesmo Redis
- SEED-014 (Error handling) — desejável, retorna erros tipados como `tier_limit_reached`

## Breadcrumbs

- `lib/queries/company.ts` — adicionar `getCompanyTier()`, `updateCompanyTier()`
- `app/api/generate-estimate/route.ts` — endpoint mais caro; primeiro a ganhar `consumeQuota('estimate')`
- `app/api/analyze-photos/route.ts` — `consumeQuota('photo_batch', photoCount)`
- `lib/whatsapp/handler.ts` — bloquear processamento se `whatsappEnabled === false`
- `lib/actions/custom-domain.ts` — bloquear se `customDomainEnabled === false`
- `components/settings/` — padrão de cards/forms já estabelecido; `billing-card.tsx` segue o mesmo
- `supabase/migrations/` — nova migration para colunas + `usage_events`
- Reference impl: `C:\Users\Vanildo\Dev\chatbot\lib\ai\entitlements.ts`
- Stripe docs: https://docs.stripe.com/billing/subscriptions/overview

## Open Questions

Decisões que precisam ser tomadas durante `/gsd:discuss-milestone` quando esse seed for ativado. O seed propõe uma direção, mas estas escolhas afetam schema, UX e arquitetura — não devem ser tomadas implicitamente no execute-phase.

### Critical — decidir antes de `plan-milestone`

1. **Pricing model: per-company flat, per-seat, ou hybrid?**
   O seed assume per-company (consistente com `companies.user_id` 1:1 atual). Mas se Xtimator quer crescer pra agências/franquias, **per-seat** é o padrão B2B — exige tabela `company_members` que não existe hoje. Decisão impacta schema, Stripe products, e UI de billing.

2. **Quota consumption: check→execute→record (não consume→execute)**
   O exemplo do seed (`consumeQuota()` antes da execução) cobra o usuário mesmo se Whisper/Vision falhar. Correto é `checkQuota()` antes (throws if denied) + `recordUsage()` depois (só em sucesso). API deve refletir esse padrão.

3. **Idempotência de `recordUsage()`**
   WhatsApp webhook é re-tentado pela Meta. Sem idempotency key, mesma mensagem conta 2-3x na quota. Usar `message_id` (já existe em `whatsapp_processed_messages`) como dedup natural. Para web app, gerar `request_id` por estimativa.

4. **Ciclo de vida de estimativas após downgrade**
   Usuário Pro gera 100 estimativas → cancela → vira free (10/mês). Os 100 links `/estimate/{token}` antigos continuam ativos? Opções:
   - **Manter ativos sempre** (boa UX, perdoa abuso)
   - **Quebrar após N dias** (força retenção, péssima UX)
   - **Read-only mas sem edição** (compromisso)

5. **WhatsApp gating: onde no pipeline?**
   `lib/whatsapp/handler.ts` faz download de áudio (Meta) + Whisper + Vision **antes** de qualquer check de tier. Em plano free com `whatsappEnabled=false`, isso significa gastar $$ pra rejeitar no final. Check tem que ser **antes** do primeiro download — possivelmente no webhook route handler, não no handler.

### Important — decidir durante `plan-milestone`

6. **Storage costs nos limites de tier**
   Fotos vão pra Supabase Storage e ficam lá indefinidamente. Tier "50 fotos/estimativa × 100 estimativas/mês × 12 meses" = 60k fotos retidas. Adicionar `maxStorageGB` ou política de retenção (free: 30 dias, pro: 1 ano, business: forever).

7. **Stripe Tax para compliance US**
   Vários estados americanos exigem coleta de sales tax em SaaS. Stripe Tax resolve mas exige ativação e configuração de nexus. Decidir: ativar de cara ou só quando MRR justificar?

8. **Multi-currency: USD-only ou USD + BRL?**
   O Xtimator suporta PT-BR (SEED-001) — implica intenção de servir mercado brasileiro. Stripe handles multi-currency, mas precisa decidir pricing em BRL (R$ 79/mês = ~$15? Ou R$ 149/mês = ~$29?).

9. **Admin tooling: forçar tier vs conceder créditos**
   Suporte vai precisar resolver casos como "trial expirou, cliente legítimo, estende mais 7 dias". Granularidade:
   - **Coarse**: admin força tier (`tier='pro'` por X dias)
   - **Fine**: créditos extras (`bonus_estimates: 20`)
   - **Híbrido**: ambos

10. **Grandfathering policy**
    "Pro legacy gratuito" pra todos os usuários atuais sai caro se houver power users. Alternativas:
    - **Free + 30 dias Pro grátis** (força conversão consciente)
    - **Pro 50% off para sempre** (compensa lealdade sem perder margem)
    - **Pro grátis até X estimativas/mês, depois upgrade obrigatório**

### Minor — resolver durante execute-phase

11. **Status code: 402 vs 403 + code body**
    402 Payment Required é "correto" mas raro. Muitos clientes (incluindo SDKs) tratam 403 melhor. Decisão de baixo nível, mas afeta DX da API.

12. **JSON serialization de "unlimited"**
    `Infinity` não vai em JSON. Usar `null` (semântico: "sem limite") ou número alto (`999999`)? Afeta tipo TypeScript e checks no frontend.

## Notes

- **Quando triggar:** quando o produto tiver >50 usuários ativos OU quando alguém pedir pra pagar. Antes disso, free ilimitado é melhor pra growth.
- **Trial de 14 dias** é o padrão da indústria — período suficiente pra usuário ver valor, curto o suficiente pra não esquecer.
- **Stripe vs Lemon Squeezy vs Paddle**: Stripe é mais flexível, Lemon/Paddle são MoR (lidam com tax). Para US-first SaaS, Stripe é a escolha óbvia.
- **Anti-abuse**: mesmo no plano free, rate limiting por IP/hora (SEED-012) protege contra abuse — limites de tier são "fair use", rate limit é "abuse prevention".
- **Grandfathering**: usuários atuais (pré-monetização) ganham tier `pro` legacy gratuito. Política a definir.
- **Não acoplar tier check com auth check** — separação de concerns: auth diz "quem é", tier diz "o que pode".
- **GraceWindow**: quando subscription falha pagamento, dar 3-7 dias antes de rebaixar — evita rage-quit de usuário com cartão temporariamente bloqueado.
