---
id: SEED-004
status: sprouted
planted: 2026-05-06
sprouted: 2026-05-08
planted_during: v1.2 Brand Identity & Global Reach (Phase 18 voice-first recorder complete)
sprouted_during: v1.4 Estimate Plain Text & Pricing Tools (Phases 24-26)
trigger_when: Próximo milestone focado em output formats / canais de distribuição do orçamento
scope: Large
---

# SEED-004: Versão texto simples do orçamento (além de PDF e web page)

## Why This Matters

Hoje o Xtimator entrega o orçamento em duas formas: **PDF branded** e **web page compartilhável (link)**. Ambas são profissionais, mas pressupõem um canal "formal" (email, link compartilhado).

Na realidade do dia-a-dia de service businesses (cleaning, landscaping, plumbing, etc.), boa parte do contato com cliente acontece em canais **informais**:

- **SMS** — cliente respondeu por mensagem, owner quer mandar o número rápido
- **WhatsApp** — canal #1 de comunicação cliente↔contractor em muitos mercados
- **Email casual / inline** — owner prefere colar o breakdown no corpo do email em vez de anexar PDF
- **Notas de voz / copy para CRM externo** — owner cola o texto em outro sistema

Hoje o usuário precisa **transcrever manualmente** o conteúdo do orçamento para esses canais — atrito que mata o ganho de produtividade que o Xtimator promete. PDF não cola bem em SMS. Link funciona, mas tem fricção (cliente precisa clicar, abrir browser, alguns só leem inline).

**Versão texto simples** resolve isso: um botão "Copiar como texto" gera um breakdown limpo, formatado, com saudação + categorias + itens + preços + total + assinatura + disclaimer da IA, pronto para colar em qualquer lugar.

## Exemplo de output

```
Hey Karol,

Thank you for reaching out to Skleanings! Here is your estimate for cleaning:

[Upholstery Cleaning]
King Mattress: $120

[Carpet Cleaning]
Small room: $85

Total Estimate: $205

Let me know if you have any questions or would like to schedule an appointment. I'd be happy to assist you!

Best regards,
Ellen Laurino
Skleanings.com
```

## When to Surface

**Trigger:** Próximo milestone focado em output formats / canais de distribuição do orçamento.

Surface durante `/gsd:new-milestone` quando o escopo do próximo milestone tocar em:

- Expansão de formatos de exportação do orçamento (texto, markdown, JSON, etc.)
- Integração com canais de mensagem (SMS via Twilio, WhatsApp Business API)
- Melhorias na experiência de share / send-to-client
- Feedback recorrente sobre PDF/link serem pesados para canais informais
- Trabalho em templates de comunicação per-empresa

## Scope Estimate

**Medium** — 3-4 fases. Quebras esperadas:

1. **Geração do texto** — função pura que transforma o objeto `estimate` (line items, totals, company branding, client name) em string formatada. Reusa dados que já existem em `lib/queries/estimate.ts`.
2. **Template configurável pela empresa** — cada empresa quer sua voz própria. Tabela `company_estimate_templates` com:
   - Saudação (`Hey {client_name}`, `Hi {client_name}`, `Olá {client_name}`)
   - Frase de abertura (`Thank you for reaching out to {company}!`)
   - Frase de fechamento (`Let me know if you have any questions...`)
   - Assinatura (`Best regards, {owner_name}` + `{company_domain}`)
3. **i18n do template** — strings respeitam idioma do orçamento (EN/PT-BR/ES, alinhado com Phase 12).
4. **UI de preview e cópia** — tela de orçamento ganha aba "Plain Text" ao lado de "PDF" e "Web Link". Owner vê preview, pode editar antes de copiar (override pontual sem mudar template). Botão `Copy to clipboard` proeminente.
5. **Editor de template (settings)** — `/settings/estimate-templates` onde a empresa edita as partes do template uma vez e reusa em todos os orçamentos. Variáveis suportadas: `{client_name}`, `{company_name}`, `{owner_name}`, `{total}`, `{items_breakdown}`.

**Fora do escopo:** integrações com SMS (Twilio), WhatsApp Business API, ou qualquer envio direto. O usuário copia e cola onde quiser.

Estimativa grosseira: 3-4 fases (template engine, template config UI, output UI + copy button, i18n).

## Breadcrumbs

Pontos de integração no código atual:

- [lib/queries/estimate.ts](lib/queries/estimate.ts) — fonte dos dados do orçamento (line items, totals, etc.)
- [lib/queries/share.ts](lib/queries/share.ts) — lógica atual de share/link público; novo formato pode reusar share token.
- [app/api/estimates/[id]/pdf/route.ts](app/api/estimates/[id]/pdf/route.ts) — endpoint de PDF; espelhar com `app/api/estimates/[id]/text/route.ts` (ou função pura no client, sem rota — TBD).
- [app/api/estimates/[id]/send/route.ts](app/api/estimates/[id]/send/route.ts) — endpoint de envio; pode ganhar parâmetro `format: "pdf" | "text"` ou rotas separadas para SMS/WhatsApp.
- [app/estimate/[token]/actions.ts](app/estimate/[token]/actions.ts) — actions da página pública do orçamento; ponto de extensão se quisermos URL `?format=text`.
- [lib/utils/format.ts](lib/utils/format.ts) — helpers de formatação (preços, datas); reusar para currency e formatação de números.
- [lib/i18n/translations.ts](lib/i18n/translations.ts) — sistema de i18n (Phase 12); disclaimer e strings de template passam por aqui.

## Notes

- **Sem disclaimer de IA** — o texto de saída não menciona que foi gerado por IA. O dono da empresa assina com seu nome e da empresa; é comunicação profissional normal.
- Considerar **markdown variant** como subformato adicional (mesma fonte, output em `**bold**` para canais que renderizam markdown — Slack, Discord, alguns webmail).
- Considerar **JSON export** como output separado (para empresas que querem mandar pro CRM próprio via API). Pode ser outro seed se ficar grande.
- O exemplo ilustra o tom: caloroso, profissional, direto, com call-to-action de fechamento. Template default deve refletir isso.
- **Sem integrações de mensageria** — copia e cola. Simples e suficiente.
- Plantado durante v1.2 para não desviar foco do milestone atual (brand identity + i18n + voice-first recorder).
