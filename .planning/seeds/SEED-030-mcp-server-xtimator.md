---
id: SEED-030
status: activating
planted: 2026-05-22
planted_during: v4.0 Multi-Tenancy (defining requirements) — v3.1.1 in-flight
trigger_when: Estimates pipeline funcional end-to-end em produção + demanda de power-users querendo automatizar via GPT/Claude assistants
scope: Large
last_revisited: 2026-05-26
revisit_outcome: User activated post v4.0 close-out (2026-05-26). New design decision locked: tool grouping with annotations (readOnlyHint / destructiveHint / titleHint) so Claude.ai's permission UI shows grouped "Always allow" toggles per capability tier. See "Locked Decisions (2026-05-26 session)" below.
---

# SEED-030: MCP Server for Xtimator (Model Context Protocol)

Implementação de um servidor MCP que permite usar o Xtimator de dentro do **Claude Desktop / Claude.ai** e do **ChatGPT/GPT custom connectors**. Um usuário com workspace no Xtimator conecta o MCP server e passa a invocar tools do Xtimator (criar/listar estimates, transcrever áudio, gerar PDF, etc.) diretamente do chat com seu assistente preferido.

## Why This Matters

**Problem solved:**
- O usuário-alvo do Xtimator (dono de small business de serviços nos EUA) já passa muito tempo dentro de assistentes (ChatGPT, Claude). Forçá-lo a sair do fluxo natural para abrir a webapp do Xtimator quebra o "do áudio ao orçamento em <5min".
- Power-users querem automações: "todo orçamento >$10k me mande resumo", "liste estimates pendentes de assinatura", "gere o PDF do último estimate do João".
- Diferencial competitivo forte: serviços como Jobber, Joist e Houzz **não têm** integração MCP nativa hoje (2026-05). Ser o primeiro estimating SaaS com MCP é narrativa de marketing e onboarding diferenciada.

**Opportunity created:**
- Canal de distribuição: ChatGPT Connectors marketplace e Claude Desktop directory exibem MCPs disponíveis — exposição orgânica.
- B2B integration story: agências e contadores podem orquestrar múltiplos workspaces Xtimator a partir de um único assistente.
- Reaproveita 100% das API routes já implementadas — o MCP server é uma **camada fina** de tradução `MCP tool → HTTP call autenticada`.

## When to Surface

**Trigger:** Implementar quando AMBAS as condições baterem:
1. Pipeline core (audio → transcribe → generate-estimate → PDF → send) estiver estável em produção (provavelmente pós v3.2 deploy + UAT).
2. Sinal de demanda explícito de pelo menos 2-3 power-users pedindo automação OU acesso programático.

Este seed deve aparecer durante `/gsd-new-milestone` quando o escopo da nova milestone tocar em:
- **API pública / developer platform** — qualquer milestone que mencione "API keys", "third-party integrations", "developer access"
- **Growth / activation** — quando o time estiver buscando canais de distribuição alternativos além da landing page
- **Power-user features / Pro tier** — features que justificam preço premium (MCP pode ser feature de tier alto)
- **Workspace API tokens** — qualquer phase que introduza tokens de longa duração por workspace (pré-requisito técnico)

**Não surfacear durante:**
- Milestones de bug-fixing, perf, ou refactor interno
- v4.0 Multi-Tenancy (foco em modelo de dados, não em superficie externa)

## Scope Estimate

**Large** — milestone completo. Quebra esperada em ~5-7 phases:

1. **Workspace API Keys** — schema `workspace_api_keys` (id, workspace_id, key_hash, scopes, last_used_at), endpoints CRUD em `/settings/api-keys`, RLS, rotação. **Pré-requisito** — sem isso, MCP não tem como autenticar.
2. **Auth middleware para API keys** — middleware Next.js que aceita `Authorization: Bearer xt_live_...` além do cookie Supabase, mapeia para `workspace_id` e injeta no contexto RLS. Reutiliza as mesmas API routes existentes.
3. **MCP server (Node/TS)** — pacote standalone (`packages/mcp-server` ou repo separado `xtimator-mcp`) implementando MCP protocol via stdio (Claude Desktop) e HTTP/SSE (ChatGPT Connectors). Stack: `@modelcontextprotocol/sdk`.
4. **Tool mapping** — mapear cada tool MCP para uma chamada HTTP autenticada para a API do Xtimator. Tools mínimas:
   - `list_estimates(status?, client_id?, limit?)`
   - `get_estimate(id)`
   - `create_estimate_from_text(client_id, description, photos?)`
   - `transcribe_and_create_estimate(audio_url, client_id)`
   - `generate_pdf(estimate_id)`
   - `send_estimate(estimate_id, channel: email|sms|whatsapp)`
   - `list_clients(search?)`
   - `create_client(name, email, phone, address)`
   - `check_job_status(job_id)` — útil porque pipeline de IA é async via Inngest
5. **Resources** — expor recursos MCP read-only: `xtimator://estimate/{id}`, `xtimator://client/{id}`, `xtimator://workspace/stats`.
6. **Onboarding / install flow** — UI em `/settings/integrations/mcp` que gera API key, mostra JSON de config pronto para colar em `~/Library/Application Support/Claude/claude_desktop_config.json` e instruções para ChatGPT connector.
7. **Observability & security** — rate limiting por API key, audit log de cada tool call, telemetria de uso (qual tool mais chamada, etc.), revogação imediata.

**Estimativa grosseira:** 3-4 semanas de eng full-time para versão production-ready. PoC funcional em 3-5 dias.

## Breadcrumbs

API routes existentes que serão envolvidas pelas MCP tools (reaproveitamento direto):

- [app/api/generate-estimate/route.ts](app/api/generate-estimate/route.ts) — pipeline principal de geração
- [app/api/transcribe/route.ts](app/api/transcribe/route.ts) — Whisper transcription
- [app/api/analyze-photos/route.ts](app/api/analyze-photos/route.ts) — Claude vision
- [app/api/estimates/[id]/pdf/route.ts](app/api/estimates/%5Bid%5D/pdf/route.ts) — geração de PDF
- [app/api/estimates/[id]/send/route.ts](app/api/estimates/%5Bid%5D/send/route.ts) — envio por email
- [app/api/estimates/[id]/send-sms/route.ts](app/api/estimates/%5Bid%5D/send-sms/route.ts) — envio por SMS
- [app/api/estimates/[id]/sign/route.ts](app/api/estimates/%5Bid%5D/sign/route.ts) — assinatura
- [app/api/estimates/[id]/refine/route.ts](app/api/estimates/%5Bid%5D/refine/route.ts) — refinamento iterativo (combina bem com SEED-006)
- [app/api/clients/route.ts](app/api/clients/route.ts) — CRUD de clientes
- [app/api/jobs/[jobId]/route.ts](app/api/jobs/%5BjobId%5D/route.ts) — polling de jobs Inngest (essencial: MCP tools devem retornar job_id e cliente faz polling)
- [app/api/inngest/route.ts](app/api/inngest/route.ts) — pipeline async (relevante porque MCP tools de geração serão necessariamente async)

Camada de auth/Supabase que precisa ser estendida para aceitar API keys:

- [lib/storage/supabase-provider.ts](lib/storage/supabase-provider.ts) — cliente Supabase server-side
- Middleware Next.js de auth (procurar `middleware.ts` na raiz e helpers em `lib/auth/*`)

## Related Seeds & Decisions

- **[[SEED-006-iterative-estimate-refinement]]** — refinement workflow casa perfeito com MCP: usuário pode iterar via chat ("torne o item 3 mais detalhado", "adicione 10% de margem")
- **[[SEED-005-multi-modal-project-input]]** — MCP pode aceitar áudio/foto via resource URI ou base64; alinhar tipos de input
- **[[SEED-013-subscription-tiers-entitlements]]** — MCP provavelmente é feature de tier Pro/Business; precisa estar atrás de entitlement check
- **[[SEED-012-redis-rate-limiting-infrastructure]]** — MCP por API key precisa de rate limiting forte (cada tool call é um endpoint exposto programaticamente)
- **[[SEED-014-typed-error-handling-system]]** — MCP retorna erros tipados ao assistente; sistema de erros precisa estar maduro para mensagens úteis no LLM
- **[[SEED-026-language-onboarding-and-estimate-ui-complete]]** — MCP deve respeitar idioma do workspace (Estimate gerado em pt-BR mesmo se prompt vier em inglês, ou vice-versa)

## Locked Decisions (2026-05-26 session)

### Tool grouping for permission UX

User confirmed via screenshot reference (Vercel MCP "Tool permissions" panel with "Read-only tools (13) — Always allow" pattern) that Claude.ai's permission UI groups tools by capability and offers per-group toggles.

Implementation: every Xtimator MCP tool declares MCP annotations on its definition. The Claude.ai UI renders three groups automatically:

| Group | Annotation flag | Tools |
|---|---|---|
| **Read-only** | `readOnlyHint: true`, `destructiveHint: false` | `list_estimates`, `get_estimate`, `list_clients`, `list_projects` |
| **Write (non-destructive)** | `readOnlyHint: false`, `destructiveHint: false`, `idempotentHint: false` | `create_estimate` |
| (future) **Destructive** | `destructiveHint: true` | none in MVP — placeholder for `delete_*` / `cancel_*` in later cuts |

Annotations are wired at the SDK level (`@modelcontextprotocol/sdk` `Tool` type accepts an `annotations` object). No custom UI work in Xtimator — the grouping is purely metadata that Claude.ai consumes.

This makes "Always allow read-only, ask each write" a one-click setup for the user — exactly the UX shown in the Vercel screenshot.

### Naming convention

Tool names use `verb_noun` snake_case (mirrors the Vercel MCP convention from the screenshot: `list_deployments`, `get_project`, `deploy_to_vercel`). Avoids prefixing with `xtimator_` because the workspace context is implicit once the connector is added.

### Pagination contract

`list_*` tools return `{ items: [...], nextCursor?: string }`. Cursor is opaque (base64-encoded `created_at` timestamp + id tuple). Default `limit: 25`, max 100. Mirrors REST API list conventions and is what GPT/Claude expect.

### Async tool returns

`create_estimate` may take 30-60s (AI generation). Per the seed's original Note #3: tool returns `{ job_id, status: 'queued' }` immediately. Add a sixth tool to the MVP — `check_job_status(job_id)` — so the LLM can poll naturally in the conversation. This bumps MVP from 5 to 6 tools but is required for the async pattern to work end-to-end.

## Locked Decisions (2026-05-25 session)

These were locked during a session where the user asked to start the MCP milestone immediately. We deferred (respecting this seed's trigger and avoiding interruption of v4.0 Multi-Tenancy) but the decisions stand for when the milestone activates.

### Auth: OAuth 2.0 (Claude-initiated flow)

User picked **OAuth 2.0** over workspace API tokens.

- Claude (Claude.ai / Claude Desktop / Claude Code) is the OAuth *client*; Xtimator is the OAuth *authorization server* + *resource server*.
- Flow: Claude pings `/.well-known/oauth-protected-resource` → discovers the auth server URL → registers as a client (dynamic client registration, `POST /oauth/register`) → redirects user to `/oauth/authorize` (PKCE) → Xtimator shows a consent screen ("Authorize Claude to access your Xtimator workspace?") → user confirms → Claude exchanges the code at `/oauth/token` for an access token + refresh token → uses `Authorization: Bearer <token>` on every MCP call.
- Required endpoints on Xtimator: `GET /.well-known/oauth-authorization-server`, `GET /.well-known/oauth-protected-resource`, `POST /oauth/register`, `GET /oauth/authorize`, `POST /oauth/token`, plus the consent UI screen.
- Required schema: `oauth_clients` (issued at register), `oauth_authorization_codes` (short-lived PKCE codes), `oauth_access_tokens` and `oauth_refresh_tokens` (scoped to `company_id` once v4.0 lands; before that, scoped to `user_id`).

This **supersedes** the "Workspace API Keys" first phase listed under "Scope Estimate" above. API keys may still ship later as a *secondary* auth path for power-users running scripts, but OAuth is the primary path for in-chat connectors.

### Initial tool scope (MVP)

Reduced from the original 9-tool wishlist down to **5 tools** for the first cut, all of which map to existing API surface area:

- `list_estimates(status?, client_id?, project_id?, limit?, cursor?)` → wraps existing list query
- `get_estimate(id)` → wraps `getEstimateById` + sections + items
- `list_clients(search?, limit?, cursor?)` → wraps existing client list
- `list_projects(client_id?, status?, limit?, cursor?)` → wraps existing project list
- `create_estimate(project_id, prompt_or_items)` → wraps the AI generation pipeline; returns `job_id` + must work async (see "Sync vs async tools" below)

Tools deferred to a later cut: `transcribe_and_create_estimate`, `generate_pdf`, `send_estimate`, `create_client`, `check_job_status` (note: still required as a *helper* alongside `create_estimate`'s async return — add it back in if `create_estimate` lands).

### Hosting: Next.js route in the same deploy

`/api/mcp/route.ts` (Streamable HTTP transport) inside the existing Next.js app. Reuses Supabase auth/clients, current Vercel/Hetzner deploy, current observability. No separate service.

OAuth endpoints sit alongside the MCP route: `app/oauth/authorize/page.tsx` for the consent screen (server component + form action), `app/api/oauth/{register,token}/route.ts` for the machine endpoints, `app/.well-known/oauth-authorization-server/route.ts` + `app/.well-known/oauth-protected-resource/route.ts` for the metadata.

### Target clients (must work in all three)

- **Claude Code** (the CLI we are running in right now) — connects via `claude mcp add <name> https://<host>/api/mcp` or via project-local `.mcp.json`. This is the explicit must-have stated by the user this session.
- **Claude Desktop / Claude.ai** — connects via the "Add custom connector" dialog (BETA, screenshot captured in session 2026-05-25). Asks for Name + Remote MCP server URL + optional OAuth Client ID/Secret (which we won't need to expose because dynamic client registration handles it).
- **ChatGPT Connectors** — same Streamable HTTP endpoint should be reachable from ChatGPT's connector marketplace flow.

## Notes

**Decisões técnicas a deliberar quando ativar:**

1. **stdio vs HTTP/SSE** — Claude Desktop usa stdio (cliente local conecta a binário); ChatGPT Connectors usa HTTP/SSE remoto. Servir **ambos** com a mesma lógica de negócio (e.g., entrypoints separados que importam o mesmo "core").
2. **Hosting do MCP HTTP server** — pode rodar dentro do próprio Next.js (rota `/api/mcp/*`) ou em deployment separado. Iniciar dentro do Next reduz superfície operacional.
3. **Tools síncronas vs async** — `create_estimate` leva 30-60s (Whisper + Claude). Não bloquear o LLM: retornar `job_id` imediatamente e expor `check_job_status` tool — assistente faz polling natural na conversa.
4. **Schemas das tools** — investir tempo em descrições Zod ricas; é o que o LLM lê para decidir qual tool chamar. Ruim aqui = MCP inútil.
5. **Multi-tenancy** — pós v4.0, API key deve ser por (user, company) — usuário escolhe qual company conectar.
6. **Privacy** — fotos e áudios trafegam por API key; documentar claramente o que vai pro Anthropic/OpenAI vs o que fica no Xtimator.

**Concorrência (snapshot 2026-05):** verificar se Jobber/Joist/Houzz/Bluebeam lançaram MCP. Se sim, urgência sobe. Se não, sustentar narrativa "primeiro estimating SaaS com MCP nativo" enquanto possível.

**Marketing angle:** vídeo curto "Closing a $50k estimate from inside ChatGPT in 3 minutes" — material de demo poderoso para tier Pro.
