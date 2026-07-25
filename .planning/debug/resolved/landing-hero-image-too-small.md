---
status: resolved
trigger: "A imagem do hero precisa ser maior; no desktop o capacete do homem deve quase tocar o header, como já solicitado em versões anteriores."
created: 2026-07-25
updated: 2026-07-25T12:54:41.7436414-04:00
slug: landing-hero-image-too-small
---

# Landing hero image too small

## Symptoms

- Expected: em desktop, a imagem do casal ocupa mais altura e o topo do
  capacete fica quase encostado na base do header.
- Actual: a imagem começa muito abaixo do header, deixando uma faixa vazia
  grande acima do capacete.
- Expected: no breakpoint intermediário, texto e imagem continuam em duas
  colunas lado a lado, seguindo a composição desktop.
- Actual: entre 820 e 1023 px o conteúdo fica empilhado, com a imagem puxada
  para cima por margem negativa e os botões em coluna.
- Expected: a distância entre o trust bar, How It Works e as demais seções é
  uniforme em todas as larguras.
- Actual: existe um vazio vertical muito maior entre o trust bar e How It
  Works, e o ritmo muda conforme o breakpoint.
- Errors: nenhum erro de console ou rede; o problema é de geometria visual.
- Timeline: ajuste já foi solicitado em versões anteriores e voltou a ficar
  pequeno após mudanças recentes da landing page.
- Reproduction: abrir `https://xtimator.com` em viewport desktop e observar a
  distância entre a base do header e o topo do capacete no hero.

## Scope and constraints

- Corrigir a composição desktop e o breakpoint intermediário de 820–1023 px.
- Preservar o layout de telefone e a faixa compacta abaixo de 820 px.
- Manter a imagem ancorada à base do hero, sem cortar o capacete.
- Validar a distância em pixels via Playwright antes e depois.
- Unificar o espaçamento vertical entre todas as seções em todos os breakpoints.

## Current Focus

reasoning_checkpoint:
  hypothesis: "Confirmada: o último polish reduziu a imagem desktop para 90%, enquanto wrappers 100dvh e paddings divergentes criavam espaçamento dependente da altura/largura da tela."
  test: "Build otimizada e matriz Playwright em 390, 819, 820, 1023, 1024, 1204 e 1440 px."
  expecting: "Desktop com imagem próxima ao header; 820-1023 em row; todos os limites de seção com 64px."
  next_action: "Publicar e repetir a matriz no domínio de produção."

## Eliminated

## Evidence

- timestamp: 2026-07-25T12:36:00-04:00
  checked: Histórico de `components/landing/hero-section.tsx`
  found: O commit `9d16f770` trocou `lg:scale-100` por `lg:scale-90` e elevou o offset XL para 65px.
  implication: A redução recorrente da imagem foi causada por uma regra explícita, não pelo asset ou pelo carregamento.

- timestamp: 2026-07-25T12:39:00-04:00
  checked: Geometria da produção antes da correção
  found: Em 1440x900 havia 109,4px entre header e caixa da imagem e 282,5px entre o trust bar e o conteúdo de How It Works; o mesmo intervalo caía para 64px em touch/mobile.
  implication: O hero `max-height:520px` dentro de um shell `min-height:100dvh`, somado aos wrappers abaixo da dobra, convertia altura de viewport em espaço vazio.

- timestamp: 2026-07-25T12:54:41.7436414-04:00
  checked: Testes, build otimizada e Playwright local final
  found: 9/9 testes passaram; typecheck e `next build` concluíram; desktop mediu 7-7,6px entre header e imagem; 820-1023 renderizou `flex-direction:row` com 22-29px entre colunas; todos os breakpoints mediram exatamente 64px entre trust bar e How It Works e padding de 64px em How It Works, Features e Final CTA; zero erros de console.
  implication: Os três sintomas foram corrigidos com contratos mensuráveis e proteção de regressão.

## Resolution

root_cause: O polish desktop mais recente reduziu a imagem para 90% e adicionou offsets superiores; simultaneamente, shells `min-height:100dvh` e um padding desktop de 40px faziam o ritmo vertical variar com o viewport. O tier 820-1023 mantinha a estrutura empilhada e tentava simular colunas com margem negativa.
fix: Restaurada a imagem desktop em escala integral com offsets próximos ao header; o tier 820-1023 agora é uma composição real de duas colunas; wrappers abaixo da dobra usam altura natural e todas as seções usam 64px de padding vertical.
verification: Teste focado 9/9, typecheck exit 0, build otimizada concluída e Playwright verde em sete limites responsivos, sem erros de console.
files_changed:
  - app/globals.css
  - components/landing/hero-section.tsx
  - components/landing/how-it-works-section.tsx
  - components/landing/landing-page.tsx
  - tests/unit/components/landing-page.test.tsx
