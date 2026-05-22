---
id: SEED-030
status: dormant
planted: 2026-05-22
planted_during: v4.0 Multi-Tenancy (defining requirements) — v3.1.1 in-flight
trigger_when: Estimates pipeline funcional end-to-end em produção + demanda de power-users querendo automatizar via GPT/Claude assistants
scope: Large
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
