---
quick_id: 260725-gxy
title: Remover Login do header da landing page
mode: quick
status: complete
date: 2026-07-25
---

# Quick Task 260725-gxy — Plan

## Goal

Deixar o header público da landing page com um único CTA `Start`, removendo o
botão `Login` sem alterar o fluxo de autenticação do CTA, o menu do usuário
autenticado ou os demais pontos de login da aplicação.

## Tasks

### Task 1 — Simplificar o estado anônimo do header

- **Files:** `components/landing/top-nav-auth.tsx`,
  `tests/unit/components/landing-page.test.tsx`
- **Action:** remover o botão e handler `Login` do estado anônimo de
  `TopNavAuth`; manter o botão DB-driven `Start` abrindo o AuthDialog em modo
  signup; preservar integralmente o dropdown de usuários autenticados.
- **Verify:** teste focado confirma um único botão `Start free` no header,
  ausência do botão `Login` e abertura do diálogo em signup.
- **Done:** visitantes anônimos veem somente o CTA principal no header.

### Task 2 — Validar e publicar

- **Files:** os arquivos da Task 1 e artefatos desta quick task
- **Action:** executar testes focados, typecheck e Playwright em desktop/mobile;
  criar commits atômicos, alinhar `main` e `dev`, publicar e acompanhar o
  pipeline GitHub Actions → Docker/GHCR → Coolify.
- **Verify:** CI de `main`/`dev` e deploy verdes; produção no novo SHA; Playwright
  encontra `Start` e não encontra `Login` no header.
- **Done:** alteração visível em produção e refs locais/remotas alinhadas.

## Safety

- Não remover o suporte a `?auth=login`, usado por redirects e links externos.
- Não alterar o AuthDialog nem o comportamento de usuários autenticados.
- Não tocar nos CTAs do hero, footer ou outras páginas.
