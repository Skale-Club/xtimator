---
phase: quick-260725-gxy
status: complete
date: 2026-07-25
commit: 2bc2b6f4
files_modified:
  - components/landing/top-nav-auth.tsx
  - tests/unit/components/landing-page.test.tsx
---

# Summary: manter somente Start no header da landing page

O estado anônimo do header público agora exibe apenas o CTA principal `Start`.
O botão e o handler exclusivos de `Login` foram removidos, sem alterar o menu
de usuários autenticados, o suporte a `?auth=login` ou os demais CTAs da
landing page.

## Changes

- `TopNavAuth` inicia e abre o CTA público em modo `signup`.
- O wrapper anônimo contém um único botão, com o label configurável da landing.
- Um teste de regressão confirma a ausência de `Login` e o acionamento de
  `onOpenAuth('signup')`.

## Verification

- `npx vitest run tests/unit/components/landing-page.test.tsx`: 6/6 testes.
- `npx tsc --noEmit -p tsconfig.ci.json`: exit 0.
- `npm run build`: build otimizada concluída.
- Playwright em 1440 px e 390 px: exatamente um `Start`, zero `Login`, diálogo
  `Create account` aberto após o clique e zero erros no console.

