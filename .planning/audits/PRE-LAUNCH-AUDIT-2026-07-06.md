# Auditoria Pré-Lançamento — Xtimator

> Data: 2026-07-06 · Milestone de referência: v4.17 · Branch: `claude/pre-launch-system-audit-gpm1wd`
> Método: leitura direta do código (não especulativo), 6 frentes paralelas — Segurança de API/Auth, Banco/RLS/Migrations, Billing/Stripe/Créditos, Pipeline de IA/Jobs, Operações/Deploy/CI, UX/Frontend — mais validação prática (typecheck CI verde, 3040 testes unit verdes).

---

## Sumário Executivo

A postura geral do Xtimator é **acima da média** para um pré-lançamento: RLS multi-tenant em 100% das tabelas, verificação de assinatura correta em todos os webhooks, tokens OAuth/share fortes e não-enumeráveis, gate de créditos em todas as superfícies de IA, servidor como autoridade financeira (recalcula totais), validação de output da IA em duas camadas, hardening de prompt-injection centralizado e um histórico de correções de segurança exemplar (cada fix é uma migration dedicada com o vetor de ataque documentado).

Os problemas reais concentram-se em **isolamento entre tenants em 2 rotas de IA**, **atomicidade do ledger de créditos**, **um bug crítico latente no auto-top-up** (cobra e não credita — hoje neutralizado por kill switch desligado) e um conjunto de lacunas de robustez no fluxo móvel principal e na operação (deploy/monitoramento).

### Bloqueadores de lançamento (corrigir ANTES de abrir tráfego pago)

| # | Severidade | Tema | Onde |
|---|-----------|------|------|
| B1 | 🔴 Crítico | Cross-tenant IDOR: `projectId` do corpo nunca validado contra a company | `lib/services/generate-estimate.ts:104-108`, `app/api/generate-estimate/route.ts`, `app/api/analyze-photos/route.ts`, canal de chat |
| B2 | 🔴 Crítico | Auto-top-up cobra o cartão e **nunca credita**, com risco de recobrança em loop | `lib/billing/auto-topup.ts:142-158` + webhook sem `payment_intent.succeeded` |
| B3 | 🔴 Alto | Ledger de créditos é read-modify-write não-atômico (double-spend / saldo negativo / drift permanente) | `lib/billing/credit-ledger.ts:112-140, 285-311` |
| B4 | 🔴 Alto | IDOR em `GET /api/jobs/[jobId]` — reconhecido no próprio código como pendência de pré-produção | `app/api/jobs/[jobId]/route.ts:18-20` |
| B5 | 🔴 Alto | Webhook Stripe "at-most-once": handler que falha perde o evento pago para sempre | `app/api/webhooks/stripe/route.ts:63-82` |
| B6 | 🔴 Alto | Onboarding pode travar o usuário permanentemente (loop de redirect) | `lib/actions/company.ts:271-275` |
| B7 | 🔴 Alto | Editor de orçamento sem botão "Salvar" + navegação SPA descarta edições sem aviso | `components/workspace/estimate/estimate-editor.tsx:258-278` |
| B8 | 🔴 Alto | Queda transitória de rede móvel durante o polling derruba todo o pipeline de captura | `hooks/use-job-status.ts:84` |
| B9 | 🟠 Médio-Alto | `/api/chat` sem rate limit nem cap de payload — gasto de IA ilimitado | `app/api/chat/route.ts` |
| B10 | 🟠 Médio-Alto | Duração/`storage_path` de áudio confiados ao cliente (transcrição "grátis" + leitura cross-tenant) | `lib/actions/recording.ts:100-121` |
| B11 | 🟠 Médio-Alto | Supabase em plano **FREE** em produção + `prod == dev` (mesmo banco) | `supabase/PROD-BOOTSTRAP.md`, keepalive workflows |

---

## 1. Segurança & Isolamento entre Tenants

### 🔴 B1 (Crítico) — IDOR de `projectId` nas rotas/canais de geração
`app/api/generate-estimate/route.ts` autentica e resolve `companyId` via `getActiveCompanyId()`, mas o `projectId` vem do corpo e **nunca é validado como pertencente àquela company**. O trabalho roda com service client (ignora RLS): `lib/services/generate-estimate.ts:104-108` lê o projeto só com `.eq('id', projectId)`. O mesmo gap existe no canal de chat (`lib/agent-tools/create-estimate.ts`, onde o `projectId` é input do LLM) e em `/api/analyze-photos` (`app/api/analyze-photos/route.ts:99-108` conta fotos só por `project_id`).

**Impacto:** um usuário da company A envia o `projectId` (UUID v4, não-enumerável) de B → lê transcrições, fotos, PII do cliente de B; a estimativa gerada fica legível por A; e há **escritas destrutivas cross-tenant** — `UPDATE projects ... WHERE id = projectId` (`generate-estimate.ts:596-599`), `UPDATE photos SET ai_description WHERE id` e o versionamento (`DELETE`/`UPDATE is_current`).

**O padrão correto já existe** em `lib/mcp/tools/write.ts:257-274` (`project.company_id !== auth.company_id → notFound`).

**Correção:** guard defensivo no início de `generateEstimateForProject`: `if (project.company_id !== companyId) throw forbidden` (protege todos os canais de uma vez) + pre-flight de posse nas rotas antes do dispatch, escopando as queries de service-role por `company_id`.

### 🔴 B4 (Alto) — IDOR em `GET /api/jobs/[jobId]`
`app/api/jobs/[jobId]/route.ts:18-20` traz o comentário: *"any signed-in user can poll any jobId... tracked as a follow-up before production deploy"*. Qualquer usuário logado consulta o job de outro tenant e recebe `run.output` (estimateId, etc.; em falhas, 200 chars do erro upstream). **Este audit é o "before production deploy".**
**Correção:** persistir `jobId → companyId` no dispatch e validar contra a company ativa.

### 🟠 (Médio) — Modelo de posse inconsistente quebra Team Seats
`transcribe`, `analyze-photos`, `refine`, `clients`, `whoami`, `billing/*` resolvem a company via `companies.user_id = claims.sub` (single-owner), enquanto `generate-estimate` usa `getActiveCompanyId()` (baseado em `company_members`). **Consequência:** membros de equipe (não-donos) recebem 403/"No company found" — o fluxo de captura inteiro falha para contas de staff. Padronizar em `getActiveCompanyId()`.

### 🟠 (Médio) — `/api/translate` e `/api/chat`/photos sem caps
- `translate`: `texts[]` sem limite de tamanho/quantidade → amplificação de custo dentro do rate limit.
- `analyze-photos`: `MAX_PHOTOS=16` só no cliente; `createPhoto` sem limite; o job processa **todas** as fotos do projeto em paralelo (1 vision call por foto). Um cliente pode criar 500 fotos e disparar 500 chamadas num único job. Cap no `load-photos` + `createPhoto`.

### Pontos fortes (segurança)
- Webhooks com assinatura correta (Stripe `constructEvent` com 2 segredos + raw body; WhatsApp HMAC-SHA256 + `timingSafeEqual` + raw body antes do parse).
- OAuth/MCP: tokens opacos de 32 bytes armazenados como sha256, TTL, revogação, binding de `client_id` na rotação; ownership check correto no MCP.
- Share link: `gen_random_uuid()` (122 bits), payload público sanitizado (sem `share_token`/paths), noindex + robots, expiração server-side.
- Service-role key nunca no browser (`server-only`); admin gate em profundidade (`requireAdmin()` no layout **e** em cada rota/action).
- Prompt-injection: `sanitizeField` centralizado, `tool_choice` forçado, `companyId` nunca vindo do LLM/corpo; roteamento WhatsApp fail-closed em ambiguidade.

---

## 2. Banco de Dados, RLS & Migrations

### 🔴 B3 (Alto) — Ledger de créditos sem atomicidade
`lib/billing/credit-ledger.ts` faz `SELECT credit_balance` → calcula em JS → `INSERT` no ledger → `UPDATE companies SET credit_balance = balanceAfter`. Sem `FOR UPDATE` nem `UPDATE ... SET credit_balance = credit_balance - N`.
**Impacto:** débitos concorrentes (geração + fotos) são last-writer-wins → o cache perde débitos; `checkCredits` (gate) e o débito não são atômicos → N requisições paralelas passam com saldo para 1 → saldo negativo / bypass de cota. `reconcileBalance()` existe mas **nunca é chamado em produção** → drift permanente.
**Correção:** RPC plpgsql `debit_credits(...)` com `UPDATE companies SET credit_balance = credit_balance - $2 WHERE id=$1 RETURNING` + INSERT do ledger na mesma transação (`SECURITY DEFINER`, `SET search_path`, EXECUTE só para service role). O padrão correto já existe em `acquire_autotopup_lock` (`20260705000002`) — replicar. Agendar reconciliação periódica.

### 🟠 (Médio) — Storage RLS não migrado para `company_members`
`20260409000001_initial_schema.sql:280-369` — buckets `audio/photos/pdfs` e INSERT/DELETE de `logos` ainda usam `companies WHERE user_id = auth.uid()`. A reescrita da Fase 82 cobriu só `schemaname='public'`. **Sem vazamento cross-tenant** (prefixo `{company_id}/` continua validado), mas **membros de equipe não leem/sobem/apagam** áudio/fotos/PDFs da própria empresa → Team Seats quebrado no storage. Nova migration reescrevendo as 11 policies.

### 🟠 (Médio) — Roles não diferenciados no RLS: `member` pode deletar a empresa
`20260526000002:52-58` (`companies_delete` aceita qualquer membro) e `20260526000001` (CRUD completo a qualquer linha de `company_members`, sem filtro de `role`). Um `member` chama a REST API direta e executa `DELETE FROM companies` ou apaga estimates/clients. Restringir DELETE/UPDATE de `companies` (e DELETE crítico) a `role='owner'` (ou owner/admin).

### 🟠 (Médio) — Demo "read-only" com lacunas pós-2026-05-30
`20260530000001_demo_readonly.sql` cria os `demo_block_*` só nas tabelas existentes naquele momento e nenhuma migration re-executa o bloco. Tabelas sem bloqueio demo: `invoices`, `price_book_item_options`, `knowledge_entries`, `company_invites`, `estimate_photos`. O usuário demo grava nelas via API. Re-rodar o DO-block (idempotente) em nova migration.

### 🟠 (Médio) — `price_book_item_options` regride ao padrão legado
`20260620000002:22-30` usa `companies WHERE user_id = auth.uid()` (25 dias após a Fase 82 proibir) → membros não gerenciam opções de item. Reescrever para `company_members`.

### 🟠 (Médio) — `translations` legível publicamente + alimentada por texto arbitrário
`20260424000001:20-24` tem `USING (true)` (dump via `GET /rest/v1/translations`) e `/api/translate` aceita `texts[]` arbitrários. Risco de poluição/abuso do cache público (hoje não há vazamento ativo pois só strings de UI passam). Restringir SELECT a `authenticated`; validar contra catálogo de UI; nunca rotear conteúdo de estimate por esse cache.

### 🟠 (Médio) — Índices ausentes em tabelas quentes
`initial_schema.sql` não cria índices secundários. Faltam em `clients(company_id)`, `recordings/photos(project_id, company_id)`, `estimate_sections/items(...)`, `estimate_activity/deliveries/signatures(...)`, `company_price_book(company_id)`, e crucialmente **`estimates(share_token)` sem índice nem UNIQUE** → seq scan na tabela mais quente a cada visita de share link, e todo `ON DELETE CASCADE` vira seq scan com o volume. Migration única de `CREATE INDEX IF NOT EXISTS` + `CREATE UNIQUE INDEX ON estimates(share_token) WHERE share_token IS NOT NULL`.

### 🔵 Baixos (DB)
- `estimate_photos` reintroduz policy anon `share_token IS NOT NULL` (hoje inerte, mas mina); dropar junto com `estimate_signatures_anon_insert` morta.
- `set_estimate_seq` MAX+1 → corrida vira 23505 (falha visível, sem corrupção).
- Grant hygiene: `cleanup_orphan_draft_projects()` e `get_platform_user_count()` sem `REVOKE EXECUTE FROM PUBLIC` (invocáveis via `/rest/v1/rpc`). `is_platform_admin`/`is_demo_user` são o gabarito correto.
- `notifications` depende de claim JWT (`custom_access_token`) desabilitado → policy nunca casa (código morto, fail-closed).
- Tooling `supabase/audits/` desatualizado (snapshot de maio, ~50 tabelas hoje; deny-all novas não estão na allowlist → `run-prod-readiness.mjs` provavelmente falha).
- `config.toml` local frouxo (`enable_confirmations=false`, senha mín. 6, sem MFA) — **verificar no dashboard hospedado**; exigir confirmação de email e senha ≥ 8 para launch.

---

## 3. Billing, Stripe & Créditos

### 🔴 B2 (Crítico) — Auto-top-up cobra e nunca credita, com risco de loop
`lib/billing/auto-topup.ts:142-158` cria um PaymentIntent (`metadata.type: 'auto_topup'`), mas o webhook (`app/api/webhooks/stripe/route.ts:111-264`) **não tem case `payment_intent.succeeded`** — a única concessão de top-up é `checkout.session.completed` com `metadata.type === 'credit_topup'`. Resultado: o cartão é cobrado, **nenhum crédito é concedido**, o saldo continua abaixo do threshold e **cada débito subsequente redispara nova cobrança**. O lock tem TTL de 60s e a `idempotencyKey` usa `Date.now()` (inútil entre tentativas); não há cap diário; `auto_topup_last_failed_at` é gravado mas nunca lido.
**Hoje é neutralizado** pelo kill switch `autoTopupEnabled` default `false` — **NÃO LIGAR antes de corrigir.** Fix: tratar `payment_intent.succeeded` chamando `grantCredits` idempotente pelo id do PI; key determinística por tentativa lógica; cooldown + cap diário; pausar após falha (ler `auto_topup_last_failed_at`).

### 🔴 B5 (Alto) — Webhook "at-most-once" perde eventos
`app/api/webhooks/stripe/route.ts:63-82` insere o `event_id` em `processed_stripe_events` **antes** de processar, sem try/catch. Se `handleStripeEvent` lançar (ex.: `stripe.subscriptions.retrieve` transitório em `invoice.paid`), o 500 dispara re-entrega da Stripe → a retentativa bate no dedup e retorna "Already processed" 200 → **efeito perdido** (cliente pagou e fica no free). Marcar como processado só após sucesso (ou deletar a linha de dedup antes de retornar 500).

### 🟠 (Médio-Alto) — Corrida `invoice.paid` × `checkout.session.completed`
Stripe não garante ordem. Se `invoice.paid` chega primeiro, o lookup por `stripe_subscription_id` falha → grant mensal pulado e `monthGrantKey` não consumido (grant=0 retorna antes do insert) → assinante pago fica sem créditos por até um mês. Conceder o grant também no arm de `checkout.session.completed` com a mesma `monthGrantKey` (dedup compartilhado impede double-grant).

### 🟠 (Médio) — `customer.subscription.updated` não tratado
Upgrade/downgrade via portal Stripe nunca sincroniza `companies.tier` → cliente paga Business e recebe entitlements de Pro (ou vice-versa). Tratar o evento resolvendo o tier pelo price ID.

### 🟠 (Médio) — Gating de plano só na UI para várias features
- `lib/actions/price-book.ts`: sem checagem de tier (free usa price book chamando a action direto).
- `lib/actions/custom-domain.ts:29-52`: sem checagem (free grava `custom_domain`).
- Fotos/áudio por estimate: `checkQuota` retorna `allowed:true` para `photo_batch`/`audio_minutes`.
- **Mitigante real:** o gate de créditos cobre o custo. Corretos server-side: chat (entitlement), WhatsApp send, price research, tetos de estimates.

### 🟠 (Médio) — Auto-top-up/top-up cria customer Stripe órfão
`create-autotopup-setup-session` / `create-topup-session` com `stripe_customer_id` nulo passam `customer: undefined` → Stripe cria customer novo; o webhook grava o PM nesse customer órfão mas `companies.stripe_customer_id` nunca é persistido → `triggerAutoTopupIfNeeded` pula. O tenant acha que ativou e nada acontece. Criar/persistir o customer antes da session.

### 🔵 Baixos (Billing)
- Preço exibido (`billing_config`, painel admin) vs cobrado (env `STRIPE_PRICE_*`) — duas fontes sem validação; `docs/HETZNER-DEPLOY.md:116` documenta nomes de env **errados**. Tier vem de `metadata.plan`, não do price pago.
- Re-trial por re-registro: signup grant (2000 créditos) sem vínculo a telefone/dispositivo. Decidir formalmente (aceitar ou adicionar sinais anti-abuso).
- `checkout.session.completed` (subscription) não checa `payment_status === 'paid'`.
- RPCs `acquire/release_autotopup_lock` sem REVOKE de anon/authenticated nem `search_path`.
- Demo criado por admin não recebe signup grant → com enforcement ligado, saldo 0 **bloqueia** a geração antes da cota de 3 — demo de rua nasce quebrado. Cota conta linhas atuais (delete reseta).
- Corrida webhook × redirect `success=1`: página não reconcilia; combinada com B5 pode ser permanente. Reconciliar via `checkout.sessions.retrieve` no retorno.

### BYOK (bem implementado, com ressalvas)
AES-256-GCM com `APP_ENCRYPTION_KEY`, `server-only`, nunca logado em plaintext. Ressalvas: (a) ciphertext fica em `companies` (legível por membros via RLS SELECT — só o blob cifrado); (b) falha de decrypt faz **fail-open para a chave da plataforma com cobrança normal** (decisão consciente, com Sentry, mas o cliente BYOK passa a ser debitado silenciosamente).

---

## 4. Pipeline de IA & Background Jobs

### 🟠 (Médio) — Sem watchdog para jobs presos; polling infinito
`hooks/use-job-status.ts:82-93` — `while (!signal.aborted)` sem deadline. Job Inngest preso (sync quebrado) → overlay de processamento nunca termina. Não há tabela de jobs nem cron de stale jobs. Deadline (5 min → falha com "editar manualmente") + cron que consulta `pipeline_events` por `started` sem terminal correspondente.

### 🟠 (Médio) — Concorrência: 2 gerações simultâneas corrompem o versionamento
`lib/inngest/functions/generate-estimate.ts:42-47` tem `idempotency` no `requestId` mas **sem `concurrency`**; o versionamento em `generate-estimate.ts:~445-470` é read-then-write → dois runs concorrentes = dois estimates com o mesmo `version` e ambos `is_current=true`. (O retry do usuário reusa o `requestId` — bem coberto.) Fix: `concurrency: { key: 'event.data.projectId', limit: 1 }` + constraint parcial única `(project_id) WHERE is_current`.

### 🟠 (Médio) — Sem timeout nas chamadas HTTP de IA
`lib/ai/openrouter-client.ts:97,238,343` e `providers/openrouter.ts:186` — `fetch` sem `AbortSignal.timeout`. Conexão pendurada segura a invocação até o timeout da plataforma (sem `maxDuration` configurado). Adicionar `AbortSignal.timeout(60s/30s)` + `maxDuration` na rota `/api/inngest`.

### 🟠 (Médio) — PDF: fontes Latin-1 + fotos anexadas ilimitadas
`app/api/estimates/[id]/pdf/route.ts:80-110` — fontes built-in `Times-Roman/Helvetica` (WinAnsi): char fora do Latin-1 gerado pela IA pode quebrar o render; `attachedPhotos` sem cap → URL expirada ou dezenas de fotos grandes derrubam o render (500)/estouram memória. Sanitizar strings (ou fonte TTF Unicode), cap de fotos, try/catch por imagem.

### 🔵 Baixos (IA)
- Mensagem de erro crua do provider chega ao usuário (`onFailure` passa `error.message`; `/api/jobs` devolve 200 chars do output).
- Prompts completos (transcripts, PII) vão para o Langfuse input — conflita com a postura "safe-metadata" declarada; mascarar/documentar.
- Fotos órfãs no Storage sem GC (áudio tem GC de 7 dias; fotos não).
- `ai_job.failed` com ambos os canais de notificação default OFF → usuário não sabe de falha pós-navegação. Considerar default ON.

### Pontos fortes (IA) — verificados
- Durabilidade exemplar: checkpoints `step.run` garantem que nenhuma chamada paga de IA re-executa em retry (incl. 1 step por foto).
- Validação de output em 2 camadas (tool schema + zod) com retry corretivo bounded → falha tipada `invalid_output`, nunca persiste lixo.
- Servidor autoridade financeira: totais/tax/discount/deposit recomputados; preços ancorados ao price book + clamp de $1M.
- Fallback de provider exatamente 1× (OpenRouter→Gemini / →OpenAI); `notifyOps` (Telegram+Sentry) + `pipeline_events` terminal.
- Enforcement real de upload no bucket (50MB áudio, 10MB foto, MIME allowlist) + RLS por prefixo; `buildStorageKey` anti-traversal.

---

## 5. Operações, Deploy, CI/CD & Resiliência

Deploy real: **Coolify em VPS Hetzner** (não Vercel — `vercel.json` é vestigial). GitHub Actions builda a imagem Docker → GHCR → Coolify pull+restart. Crons via GitHub Actions + Inngest.

### 🔴 B11 (Médio-Alto) — Supabase FREE em produção + `prod == dev`
Os workflows `supabase-keepalive*.yml` confirmam free tier; `PROD-BOOTSTRAP.md` diz `PROD_DB_URL` == dev `DATABASE_URL`. Riscos: (a) GitHub desativa workflows agendados após 60 dias sem atividade → keepalive para → projeto pausa → **outage total** (DB/auth/storage); sem PITR/SLA; (b) um `db reset` local ou o `seed.sql` (que muta "a empresa mais antiga do banco") atinge dados reais. **Migrar para Supabase Pro e separar prod de dev antes do launch.**

### 🟠 (Alto) — Testes não bloqueiam o deploy
`build-deploy.yml` roda em push para `main` **em paralelo** com `test.yml`; sem `needs:`/`workflow_run`/branch protection. Gitleaks idem. Um commit com suíte quebrada (ou segredo vazado) é buildado e deployado. Exigir os checks `Test` e `gitleaks` via branch protection, deployando só via PR.

### 🟠 (Alto) — `cron-jobs.yml` chama 2 endpoints inexistentes
Agenda `/api/cron/expire-trials` e `/api/cron/trial-warning-emails` — não existem mais (migração para modelo de créditos). Workflow falha 2×/dia (ruído que mascara os crons reais); e se a expiração de trial ainda for regra, **trials nunca expiram**. Remover/reimplementar; confirmar com o time o mecanismo atual.

### 🟠 (Alto) — `/api/health` bloqueado pelo middleware + sem uptime monitoring
`proxy.ts` inclui `/api` em protegidas e `isPublicRoute()` isenta cron/webhooks/inngest mas **não `/api/health`** → 307 para login. Por isso o `docker-compose.yaml` aponta o healthcheck para `/` (só prova que a landing renderiza). Nenhum monitor externo consegue usar o endpoint, e o único dead-man's-switch existente monitora o Supabase, não o app. Isentar `/api/health` (e `/api/mcp`, que quebra o desafio Bearer) + plugar monitor externo.

### 🟠 (Médio)
- **Sem validação de env no boot** — falhas aparecem em request time; `types/env.d.ts` declara tudo como sempre presente. Validar com zod em `instrumentation.ts:register()`.
- **Rate limiting falha ABERTO sem Redis** (`lib/ratelimit.ts`) — typo na env Upstash desliga todos os limites de IA silenciosamente. Com validação de env, tratar `UPSTASH_*` como obrigatória em prod.
- **Sentry `sendDefaultPii: true`** em todos os inits + Replay `blockAllMedia: false` → IPs/headers/cookies e possivelmente fotos de clientes em replays (CCPA). Desligar PII + `beforeSend` de scrubbing.
- **`sentry.server.config.ts`** diz ser vazio mas contém `Sentry.init()` ativo — risco de dupla init OTel se importado. Esvaziar/deletar.
- **E2E (Playwright, ~20 specs incl. mobile) nunca roda em CI** — o fluxo crítico capture→estimate→send só é validado localmente. Job noturno/pré-release contra build de produção.
- **CSP Report-Only sem `report-uri`/`report-to`** → violações nunca coletadas, nunca vai a enforcing. Adicionar endpoint coletor (Sentry aceita) e agendar a virada.
- **Crons sem watchdog** (GitHub auto-disable 60d; Inngest dessync já causou incidente de 11 dias) — `monthly-credit-grant` para silenciosamente. Dead-man's-switch por cron (padrão já existe no keepalive).

### 🔵 Baixos (Ops)
- `GIT_SHA` nunca setado → `/api/health` reporta commit "unknown". `ENV GIT_SHA=$DEPLOYMENT_VERSION` no Dockerfile.
- `vercel.json` vestigial — remover.
- Sem `COOLIFY_TOKEN` o deploy "skipa" verde com warning (o caso "secret apagado" passa despercebido).
- Service role key em GitHub Secrets só para keepalive ping — blast radius máximo; a publishable key bastaria.
- Rollback manual (`:latest` fixo) — documentar procedimento (imagem por SHA já existe no GHCR).

### Pontos fortes (Ops) — verificados
- Pipeline Docker maduro (build em CI nunca na VPS, multi-stage Alpine, não-root uid 1001, standalone, actions pinadas por SHA, Sentry token via build secret).
- Skew protection em 3 camadas (deploymentId por SHA, chunk-recovery nos error boundaries, SW NetworkFirst para HTML, caches versionados).
- Auth de cron exemplar (`timingSafeEqual`, 503 sem secret, testes dedicados).
- `ops-alert` fan-out Sentry+Telegram never-throw com dedupe Redis; gitleaks pre-commit + CI full-history; headers de segurança (HSTS preload, nosniff, X-Frame-Options, Permissions-Policy alinhada às features).
- Watchdog do keepalive que abre issue no GitHub automaticamente — replicar para `cron-jobs.yml`.

---

## 6. Fluxos de Usuário & Frontend

### 🔴 B6 (Alto) — Lockout permanente no onboarding
`lib/actions/company.ts:271-275` — o insert em `company_members` no fluxo first-time **não checa erro** (ao contrário do fluxo "add") e segue para `redirect('/dashboard')`. Como `getActiveCompany()` resolve só via `company_members`, o usuário entra em loop `/dashboard`↔`/onboarding`; re-submeter cai no branch UPDATE que nunca insere membership → só se resolve no BD na mão. Checar o erro + `upsert` de membership no branch UPDATE (self-healing).

### 🔴 B7 (Alto) — Editor de orçamento perde edições
- **Sem botão "Salvar"**: `handleSaveDraft` só no atalho Cmd/Ctrl+S (`estimate-editor.tsx:258-267`); sem autosave. No mobile (persona principal!) qualquer toque em link perde tudo.
- **`beforeunload` não cobre navegação SPA** (`:270-278`): `<Link>`/`router.push` não disparam o guard.
- **Concorrência last-write-wins destrutiva** (`lib/actions/estimate.ts:152-176, 307-345`): salva sem checar versão e **deleta** itens/seções ausentes no payload stale → duas abas se sobrescrevem silenciosamente.
Fix: botão "Salvar rascunho" + autosave debounced; guard de navegação interna quando `isDirty`; guard otimista por `updated_at`.

### 🔴 B8 (Alto) — Rede móvel derruba o pipeline de captura
`hooks/use-job-status.ts:84-85` — o `fetch` do polling não tem try/catch; um único request perdido (handoff de célula 4G no canteiro) lança `TypeError: Failed to fetch` → tela de falha, mesmo com o job rodando no servidor. Isso ataca diretamente a promessa "5 minutos no canteiro". Retry com backoff (3-5 tentativas) para erros de rede + deadline total.

### 🟡 Médios (UX)
- **HEIC não tratado**: `.heic` bruto (Arquivos/AirDrop/desktop) falha no decode e o fallback sobe **bytes HEIC rotulados como `image/jpeg`** → thumbnail quebrada + análise de IA falhando de forma opaca. Rejeitar com toast se `compressImage` falhar (ou converter com `heic2any`).
- **Áudio só em memória até o stop** (`recorder.start()` sem timeslice) → crash do iOS Safari perde a gravação. `recorder.start(5000)` + persistência incremental.
- **Fotos com falha de upload sem retry** — única ação é remover e re-selecionar. Botão de retry reusando o blob.
- **Share link ignora expiração no aceitar/assinar** (`actions.ts:117-121`, `sign/route.ts:35-44`) — só a renderização checa. Reusar `isShareLinkExpired` nos endpoints.
- **Idioma misto na página do cliente**: documento no idioma do orçamento, mas o chrome (botões "Accept/Decline", fluxo de assinatura hardcoded em inglês) no idioma do visitante; `/api/translate` exige auth → visitante anônimo nunca traduz. Envolver `EstimateView` em `ScopedLanguageProvider` com `estimate.language` + strings no `staticDict`.
- **`/onboarding` sem guard** para quem já tem empresa → re-survey sobrescreve dados com defaults.
- **Só `app/error.tsx`/`global-error.tsx`** — sem `error.tsx` por segmento; um throw em `projects/[id]` ou `estimate/[token]` troca o app inteiro pela tela de erro raiz.
- **Quantidade negativa aceita** (`item-row.tsx:56`) — `parseFloat || 0` sem clamp → reduz o total. `Math.max(0, …)`.

### 🟡 (Médio) — Prova social fabricada na landing
`components/landing/trust-bar.tsx:7-10,62` — "50+ Contractors", "500+ Estimates sent", "5 Stars" hardcoded num produto pré-lançamento. Risco de claims/confiança. Trocar por copy defensável.

### 🔵 Baixos (UX)
- Footer: link Twitter `href="#"`; "See Demo" aponta para `/?auth=login` em vez de `/demo` (`site-footer.tsx:102-107`).
- `/blog` mostra "No posts yet." linkado com destaque — publicar ≥1 post ou esconder.
- Demo depende de `DEMO_COMPANY_ID` seedado em prod — verificar antes do launch.
- `next.config.ts` sem `compiler.removeConsole` (com `exclude:['error']`) — defesa em profundidade.
- Desconto pode exceder subtotal → total negativo (sem floor no `grandTotal`).

### Pontos fortes (UX) — verificados
- Pipeline de captura maduro: dedup de retry sem re-cobrança (lineage `attemptId/requestId`), fallback iOS mp4 na ordem certa, hard cap de 10 min com timer wall-clock resistente a backgrounding, detecção de revogação de permissão mid-recording, rascunho de texto em localStorage.
- Dinheiro server-authoritative: float em dólares mas com disciplina consistente client/servidor, servidor sempre recalcula, NaN guardado em todas as entradas, split de invoice cents-exato sem drift.
- Share link seguro por padrão; onboarding resiliente a refresh; price book vazio não quebra a geração (degrada para `ai_estimate`).
- Base de código limpa: zero TODO/FIXME acionável em produção; um único `console.log` server-side com email redigido (sha256); demo genuinamente read-only.

---

## 7. Validação prática executada

- **Typecheck CI** (`tsc -p tsconfig.ci.json`): ✅ verde, zero erros.
- **Testes unit + integration** (`vitest run`): 3040 passaram, 4 falharam em 5 arquivos — **todas as falhas são de ambiente** (testes de integração de RLS `blog-rls`, `cleanup-orphan-projects`, `platform-brand-rls`, `price-book-rls` exigem Supabase real; `landing-page.test.tsx` instancia o browser client sem `NEXT_PUBLIC_SUPABASE_URL`). O gate de CI exclui integration; não são bugs de código. **Ressalva:** `landing-page.test.tsx` está em `tests/unit` (roda no gate) e falha sem env — vale mockar o Supabase client para não quebrar o CI em ambientes sem env.

---

## 8. Plano de ação sugerido (ordem)

**Onda 1 — Bloqueadores de isolamento e dinheiro (antes de qualquer tráfego pago)**
1. B1 — guard `project.company_id === companyId` em `generateEstimateForProject` + pre-flights (fecha generate-estimate, analyze-photos e chat de uma vez).
2. B2 — corrigir auto-top-up (handler `payment_intent.succeeded` + grant idempotente + cap/cooldown) **antes de ligar o kill switch**.
3. B3 — RPC atômico de débito/grant + reconciliação agendada.
4. B4 — ownership em `/api/jobs/[jobId]`.
5. B5 — webhook Stripe: marcar processado só após sucesso.

**Onda 2 — Robustez do fluxo principal (a promessa do produto)**
6. B6 — self-healing de membership no onboarding.
7. B7 — botão Salvar + autosave + guard de navegação + guard otimista.
8. B8 — retry de rede + deadline no `pollJob`.
9. B9/B10 — rate limit no chat; validar prefixo do `storagePath` + duração server-side; cap de fotos.
10. Concorrência Inngest por projeto; resolução de empresa para staff (getActiveCompanyId).

**Onda 3 — Infra/operação**
11. B11 — Supabase Pro + separar prod/dev.
12. Testes/gitleaks bloqueando deploy; corrigir `cron-jobs.yml`; `/api/health` público + monitor externo; validação de env no boot.

**Onda 4 — DB/RLS hardening**
13. Storage + `price_book_item_options` para `company_members`; roles no RLS; re-rodar demo_block; índices (share_token); fechar `translations`; atualizar tooling de auditoria; endurecer config de auth hospedada.

**Onda 5 — Polish**
14. Sentry PII; CSP report endpoint; HEIC; i18n da página do cliente; error.tsx por segmento; prova social da landing; clamps de quantidade/desconto; GC de fotos; mockar Supabase no teste unit da landing.
