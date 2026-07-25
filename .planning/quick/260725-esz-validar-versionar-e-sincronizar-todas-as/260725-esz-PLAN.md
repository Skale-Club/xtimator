---
quick_id: 260725-esz
title: Validar, versionar e sincronizar todas as alterações locais com main, dev e origin
mode: quick
status: ready
date: 2026-07-25
---

# Quick Task 260725-esz — Plan

## Goal

Fechar o pacote local já investigado, preservar todas as alterações existentes,
versioná-las e deixar `main`, `dev`, `origin/main` e `origin/dev` no mesmo SHA,
com os workflows desse SHA verdes.

Estado observado durante o planejamento:

- `main`, `dev`, `origin/main` e `origin/dev` apontam para
  `041820a88b19133c6f957050d6ea1396b8643619`;
- o worktree contém somente
  `instrumentation.ts`, `lib/observability/sentry-filters.ts`,
  `tests/unit/observability/sentry-filters.test.ts`,
  `tests/unit/components/landing-page.test.tsx` e
  `.planning/debug/inbox-incident-sweep.md`, além deste plano;
- não há alterações staged;
- `.planning/debug/inbox-incident-sweep.md` registra duas passagens completas do
  gate unit/eval (535 arquivos, 4312 testes), build de produção concluído,
  typecheck/lint focados e os probes de produção já executados.

Não ampliar o escopo. A verificação autenticada do Stripe Dashboard e qualquer
correção adicional de Stripe estão explicitamente adiadas para outra sessão.
Preservar o conteúdo Stripe já documentado no registro de debug, mas não editar
rotas, configuração, integrações ou testes Stripe nesta tarefa.

## Tasks

### Task 1 — Congelar o inventário e revalidar o pacote local

- **Files:** `instrumentation.ts`,
  `lib/observability/sentry-filters.ts`,
  `tests/unit/observability/sentry-filters.test.ts`,
  `tests/unit/components/landing-page.test.tsx`,
  `.planning/debug/inbox-incident-sweep.md`,
  `.planning/quick/260725-esz-validar-versionar-e-sincronizar-todas-as/260725-esz-PLAN.md`
- **Action:**
  1. Começar em `main` e executar `git fetch origin --prune`. Confirmar que
     `git merge-base --is-ancestor origin/main main`,
     `git merge-base --is-ancestor origin/dev main` e
     `git merge-base --is-ancestor dev main` retornam sucesso. Se qualquer ref
     tiver avançado de forma não fast-forward, parar e relatar; não fazer
     rebase, reset ou force-push.
  2. Revisar `git status --short`, `git diff --stat`, `git diff`,
     `git diff --cached` e `git diff --check`. O inventário deve ser exatamente
     o listado acima, sem conteúdo staged e sem whitespace errors. Se houver
     arquivo novo ou modificado por trabalho concorrente, parar antes de stage
     para não incorporar mudanças que não passaram por esta revisão.
  3. Confirmar que o filtro novo é restrito a `POST /page` + uma das mensagens
     exatas de multipart/FormData, que erros equivalentes em rotas de API
     continuam reportáveis e que `instrumentation.ts` o conecta ao
     `beforeSend`. Confirmar também que o mock do AuthDialog afeta apenas o teste
     de transição por query param.
  4. Usar a evidência completa já registrada no debug em vez de repetir o
     full-suite e o build local. Reexecutar somente os checks proporcionais ao
     diff: testes focados e o typecheck de produção. Os workflows pós-push
     repetirão o suite unit/eval duas vezes, conforme `.github/workflows/test.yml`.
- **Verify:**
  - **Automated:** `npx vitest run tests/unit/observability/sentry-filters.test.ts tests/unit/components/landing-page.test.tsx`
  - **Automated:** `npx tsc --noEmit -p tsconfig.ci.json`
  - **Automated:** `git diff --check`
- **Done:** o pacote revisado coincide com o inventário, os checks focados e o
  typecheck passam, e nenhuma mudança Stripe adicional foi introduzida.

### Task 2 — Versionar todo o inventário revisado

- **Files:** os seis caminhos da Task 1
- **Action:**
  1. Reconfirmar imediatamente antes do stage que o inventário não mudou.
  2. Criar commits convencionais e atômicos, sem `--amend`, `--no-verify` ou
     bypass dos hooks:
     - `fix(observability): suppress root-page FormData scanner noise` com
       `instrumentation.ts`, `lib/observability/sentry-filters.ts` e
       `tests/unit/observability/sentry-filters.test.ts`;
     - `test(landing): stabilize auth query-param transition test` com
       `tests/unit/components/landing-page.test.tsx`;
     - `docs(debug): record inbox incident sweep and sync plan` com
       `.planning/debug/inbox-incident-sweep.md` e este `260725-esz-PLAN.md`.
  3. Após cada stage, inspecionar `git diff --cached --name-status` e
     `git diff --cached`; o commit só pode conter os paths atribuídos a ele.
     Não reverter, reformar ou absorver alterações concorrentes.
- **Verify:**
  - **Automated:** `git status --porcelain` não produz saída.
  - **Automated:** `git log --oneline --decorate -3` mostra os três commits no
    topo de `main`.
- **Done:** todas as alterações locais revisadas estão commitadas, os hooks
  passaram e o worktree está limpo.

### Task 3 — Fast-forward de dev, push atômico e verificação remota

- **Files:** nenhum arquivo; somente refs Git e observação de workflows
- **Action:**
  1. No PowerShell, salvar `$finalSha = git rev-parse main`, fazer novo
     `git fetch origin --prune` e repetir os gates de ancestralidade da Task 1
     para detectar corrida remota. Não usar `--force`, `--force-with-lease`,
     reset ou atualização destrutiva.
  2. Executar `git switch dev` e `git merge --ff-only main`; confirmar que
     `git rev-parse dev` é exatamente `$finalSha`. Voltar para `main` e
     confirmar o worktree limpo.
  3. Enviar as duas refs numa única operação:
     `git push --atomic origin main dev`. Se o servidor rejeitar o push atômico
     ou uma ref tiver avançado, parar e relatar em vez de degradar para push
     parcial ou forçado.
  4. Executar `git fetch origin --prune` e provar que `main`, `dev`,
     `origin/main` e `origin/dev` resolvem para `$finalSha`.
  5. Localizar pelo SHA e acompanhar com `gh run watch --exit-status` os dois
     runs do workflow `Test`, um para `main` e outro para `dev`. Depois acompanhar
     o run `Build and Deploy` disparado pelo `Test` verde de `main`. Não usar
     Vercel: produção é GitHub Actions → Docker/GHCR → Coolify. Confirmar que o
     deploy terminou verde, incluindo o health poll e o re-sync do Inngest.
  6. Consultar `https://xtimator.com/api/health` e confirmar que o campo
     `commit` é `$finalSha`. Não abrir nem modificar o Stripe Dashboard.
- **Verify:**
  - **Automated:** os quatro comandos `git rev-parse main`, `git rev-parse dev`,
    `git rev-parse origin/main` e `git rev-parse origin/dev` produzem o mesmo
    `$finalSha`.
  - **Automated:** `git ls-remote origin refs/heads/main refs/heads/dev` retorna
    `$finalSha` para ambas as refs.
  - **Automated:** `gh run list --workflow Test --commit "$finalSha" --json databaseId,headBranch,headSha,status,conclusion,url` mostra `success` para
    `main` e `dev`; `gh run list --workflow "Build and Deploy" --commit "$finalSha" --json databaseId,headSha,status,conclusion,url` mostra `success`.
  - **Automated:** a resposta de `https://xtimator.com/api/health` está saudável
    e reporta `commit == $finalSha`.
- **Done:** as quatro refs estão no mesmo SHA, ambos os gates `Test` passaram,
  o pipeline `Build and Deploy` concluiu e produção serve o SHA sincronizado.

## Safety gates

- Nunca usar force-push, reset destrutivo, amend ou bypass de hooks.
- Nunca sobrescrever ou reverter alterações de terceiros.
- Qualquer mudança no inventário ou nas refs remotas depois da revisão é um
  motivo para parar e relatar, não para incorporar silenciosamente.
- A operação externa autorizada é somente o push atômico de `main` e `dev` e a
  observação dos workflows/deploy resultantes.

## Source coverage audit

| Source | Item | Coverage | Status |
|---|---|---|---|
| GOAL | Validar, versionar e sincronizar todas as alterações locais com `main`, `dev` e `origin` | Tasks 1-3 | COVERED |
| REQ | Quick task sem IDs de requisito de fase | N/A | EXCLUDED |
| RESEARCH | Quick padrão sem research; evidência técnica está no registro de debug | Task 1 | COVERED |
| CONTEXT | Não criar correções Stripe adicionais; trabalho adiado | Tasks 1 e 3 | COVERED |

## Must-haves

- O inventário local é revisado antes de qualquer stage.
- Todos os arquivos revisados são commitados com hooks ativos.
- `dev` avança para `main` somente por fast-forward.
- `main`, `dev`, `origin/main` e `origin/dev` terminam no mesmo SHA.
- O push é atômico e nunca forçado.
- Os dois workflows `Test` e o `Build and Deploy` do SHA final terminam verdes.
- Produção reporta o SHA final, sem trabalho adicional de Stripe.
