# Plano de melhorias do design do orçamento (PDF, página pública, editor, preview)

## Context

Análise feita renderizando o pipeline real (`renderToBuffer` via
`buildPagesForFixture`, templates Classic e Modern, com logo, fotos, assinatura,
desconto, imposto e sinal) e capturando a página pública, o editor e o preview
paginado em 1100px, 390px e 360px. Nada foi alterado no código durante a análise.

Veredito: a base visual está certa (uma margem, hierarquia clara, cor da marca
contida, contraste corrigido automaticamente) e a engenharia por baixo é boa (um
modelo de dados, um mapa de rótulos, um motor de paginação). O que falta são os
últimos 10% de acabamento, e a coordenação visual entre as superfícies quebra no
template Modern.

### Achados, por superfície

**PDF (os dois templates)**
- Um orçamento de 13 itens em 4 seções sai em **5 páginas** nos dois templates; cabia
  em 2-3. Três causas somadas: cabeçalho completo (logo 72pt + endereço + régua,
  ~130pt) repetido em todas as páginas; `PDF_RENDER_SAFETY_MARGIN_PT = 90`
  reservado por página; blocos atômicos grandes (assinatura, grade de fotos) que
  caem sozinhos na página seguinte. A margem de 90pt **não é a causa raiz**: é a
  folga calibrada para o motor de previsão (fontkit) não errar contra o layout real
  do Yoga, e `<Page>` fica com `wrap` padrão, então uma previsão para menos cria
  página extra silenciosa e quebra o "Page N of M". Reduzir a constante sem mexer
  no que é reservado por página gera PDFs com numeração errada.
- Hifenização automática do react-pdf quebra palavras ("coun-tertops",
  "Sher-win-Williams"). Não há `Font.registerHyphenationCallback` em lugar nenhum.
- Continuação de tabela em página nova mostra só o cabeçalho de colunas, sem o nome
  da seção.
- Selo "EN" aparece mesmo quando o idioma é inglês.
- Rodapé só "Page N of M": sem nº do orçamento nem empresa (páginas impressas se
  misturam).
- Grade de fotos encostada à esquerda com vão à direita; "Prepared by" solto depois
  das fotos, longe da assinatura.

**PDF Classic**
- Faixa da seção tem `marginHorizontal: -8` e fica 8pt mais larga que a faixa
  ESTIMATE logo acima (`estimate-pdf.tsx:253`). Mesma cor, não alinham.
- Cartões de termos/assinatura sem respiro interno: o fundo `cardTintFill` encosta
  no texto e os cinco termos viram um bloco contínuo. Na web são cartões separados
  com padding e cantos arredondados.

**PDF Modern**
- **Bug:** nome da empresa sai em azul de link. `styles.nameLink` não define `color`
  (`estimate-pdf-modern.tsx:210`) e `PdfHeader` só recebe `companyNameColor` no
  Classic. Aparece em todas as páginas sempre que a empresa tem site.
- Vão de ~55pt entre o Summary e a primeira seção na página 1.

**Página pública (web)**
- Modern: ordem dos totais é Subtotal → Tax → Deposit → **Balance Due** (negrito,
  régua grossa) → **TOTAL** (hero). O cliente vê o saldo antes do total; no PDF a
  ordem é Total → Deposit → Balance Due (`estimate-document-modern.tsx:366-375`).
- Modern usa `font-serif` genérico; só Inter é carregada em `app/layout.tsx`. O
  PDF usa Lora. A fonte, que é a assinatura do template, varia por aparelho.
- Telefone/e-mail/site do prestador são texto plano unido por " · "
  (`estimate-document.tsx:1643-1650`). No PDF são `<Link>`. No celular, onde tocar
  para ligar é o gesto natural, não funciona; e em 360px a linha quebra deixando
  "·" solto no fim.
- "Prepared by" não aparece (a view pública não passa `preparedBy`; há teste
  fixando isso). "Estimate Terms" da empresa é renderizado **fora** do documento
  num Card separado (`estimate-view.tsx:376`); no PDF e no preview é o primeiro
  cartão de termos dentro do documento.
- Títulos de seção do Modern são cor de marca na web e pretos no PDF.
- Nome do projeto e do cliente em `text-2xl font-bold` dominam a primeira tela;
  o nome da empresa é menor.

**Mobile (390px / 360px)**
- Zero transbordo horizontal nos dois templates (`scrollWidth == clientWidth`).
  Itens viram cartões (`sm:hidden`), corpo 16px, botões empilham em `lg`,
  assinatura por toque com `touch-none` + `preventDefault`. Tecnicamente sólido.
- O total e o botão Aceitar ficam a 3-4 telas de distância: a primeira tela mostra
  empresa, faixa ESTIMATE (~22% da tela) e PROJECT. O CTA é um Card comum no fim
  (`estimate-view.tsx:505`); nada fixo.
- Total do item no cartão mobile em peso regular, igual à descrição.
- Canvas de assinatura exibido com 120px de altura (`signature-pad.tsx:151`),
  curto para o dedo. Bitmap interno 600×160 (3,75:1) exibido em ~330×120 (2,75:1):
  a assinatura salva fica esticada ~35% na horizontal, e é essa que vai pro PDF.

**Editor e preview paginado**
- `EstimateDocument` (edit/view) e `PaginatedPreview` **não têm nenhuma referência a
  `modern`/`classic`**: renderizam sempre Classic. Uma empresa Modern edita em
  Classic, vê um preview Classic com as quebras de página do Modern (página 1
  meio vazia sem motivo visível, 3 páginas onde Classic daria 2) e só vê Modern no
  PDF e na página pública.
- O preview mostra cabeçalho compacto nas páginas 2+ (`paginated-preview.tsx:562`),
  mas o motor reserva a altura do cabeçalho completo em todas as páginas e o PDF
  imprime o cabeçalho completo em todas. O preview tem um vão onde o PDF tem
  cabeçalho.
- A tela de escolha do template (`company-info-form.tsx:483`) é um radio com texto,
  sem miniatura. A escolha é às cegas.
- Editor: inputs de descrição de uma linha cortam o texto ("Remove existing upper
  and lower cal…"); "Estimate # EST-1042" com espaço vs "#EST-1042" na view.

**Outros canais**
- WhatsApp: formato de entrega é configuração da conta (`share_link` padrão,
  `formatted_text`, `pdf_attachment`); o PDF só vai por padrão se o dono escolher.
  O formatador tem seu próprio mapa de rótulos (`lib/whatsapp/formatter.ts`,
  "Total Estimate") separado de `document/labels.ts` ("Total").

### Princípios para as mudanças

1. **O PDF é a referência.** É o que o cliente arquiva e assina. Quando duas
   superfícies divergem, a web se alinha ao PDF, salvo decisão explícita.
2. **Toda mudança de altura no PDF passa pelo motor.** Qualquer alteração de
   padding/margem/fonte em bloco medido exige atualizar a fórmula correspondente em
   `lib/estimate/pagination/blocks-from-model.ts` (ou
   `lib/pdf/measure-header-height.ts`) e re-rodar
   `scripts/pagination-render-calibration.ts` para confirmar zero mismatches e, se
   mudar, atualizar `PDF_RENDER_SAFETY_MARGIN_PT` com o comentário.
3. **Não baixar a margem de segurança "a seco".** O ganho de páginas vem de reduzir
   o que é reservado por página (cabeçalho das páginas 2+, blocos atômicos), não da
   constante.
4. **Uma mudança por commit, com antes/depois.** Cada etapa gera os PDFs de
   referência (Classic e Modern, com logo/fotos/assinatura) via `pdftoppm` e compara
   com o anterior.

## Etapas

### Etapa 1 — Acabamento sem tocar no motor de paginação

Mudanças pequenas, cada uma verificável em isolamento. Nenhuma altera altura de
bloco medido.

1. **Nome da empresa no PDF Modern.** Passar `companyNameColor: '#1f2937'` (ou a
   cor que `styles.companyName` já usa) no call de `PdfHeader` em
   `estimate-pdf-modern.tsx`, ou dar `color` ao `nameLink`. Teste: snapshot de texto
   não cobre cor; adicionar asserção no estilo resolvido em
   `tests/unit/pdf/` (há padrão em `estimate-pdf-banner-fill.test.tsx`).
2. **Faixa da seção alinhada no Classic.** Remover `marginHorizontal: -8` e
   `paddingHorizontal: 8` de `styles.sectionHeader` em `estimate-pdf.tsx` (o
   título já cai na margem de 40pt; o comentário do próprio arquivo diz que a
   intenção era essa). `paddingVertical` fica, então a altura medida não muda.
3. **Ordem dos totais no Modern web.** Em `estimate-document-modern.tsx`, mover o
   bloco hero TOTAL para antes de Deposit/Balance Due, espelhando
   `pdf-totals-block.tsx` (Subtotal → Discount → Tax → [hero] Total → Deposit →
   Balance Due). Atualizar o teste cross-surface de totais, se existir.
4. **Lora na web.** Carregar `Lora` via `next/font/google` em `app/layout.tsx`
   (pesos 400/700, `variable: '--font-lora'`), definir `--font-serif` em
   `globals.css` e manter `font-serif` no `EstimateDocumentModern`. Confirmar que o
   preview paginado (quando ganhar modo Modern, Etapa 3) usa a mesma variável.
5. **Contatos tocáveis.** No cabeçalho de `estimate-document.tsx` e
   `estimate-document-modern.tsx`, renderizar telefone como `<a href="tel:">`,
   e-mail como `mailto:` e site como link, com `formatPhoneForDisplay` mantido. No
   mobile (`sm:` para baixo) um por linha (`flex flex-col sm:flex-row`), sem o
   separador "·" solto.
6. **Total do item em negrito no cartão mobile** (`estimate-document.tsx`, ramo
   `sm:hidden`, e o equivalente no Modern).
7. **Rótulo do sinal.** Trocar "Deposit" por "Deposit due at signing" (en/pt/es) em
   `lib/estimate/document/labels.ts`; o sinal negativo fica (aritmética visível).
   Checar que `lib/whatsapp/formatter.ts` usa texto compatível.
8. **"Estimate #" sem espaço no editor** e selo de idioma só quando `language !==
   'en'` (`PdfHeader`, `langLabel`).
9. **Cor dos títulos de seção no Modern.** Decidir uma (recomendação: cor de marca
   via `brandText`, como na web) e aplicar no PDF (`estimate-pdf-modern.tsx`
   `sectionTitle.color`) para bater com `estimate-document-modern.tsx`.

Verificação da etapa: `npm run typecheck`, `npx vitest run tests/unit tests/eval`,
PDFs antes/depois dos dois templates renderizados com `pdftoppm -r 80` e conferidos
visualmente (nome preto no Modern, faixas alinhadas no Classic, ordem dos totais).

### Etapa 2 — Páginas: menos papel, mesma previsibilidade

Tudo aqui mexe em altura medida; cada item fecha com a recalibração.

1. **Cabeçalho compacto nas páginas 2+ no PDF.** Hoje `PageConstraints` tem um só
   `contentHeightPt`. Introduzir `firstPageContentHeightPt` e
   `continuationPageContentHeightPt` em `lib/estimate/pagination/types.ts` /
   `page-constraints.ts`; `computePageBreaks` usa o primeiro para `pageIndex 0` e
   o segundo para o resto. `measureHeaderHeightPt` ganha variante compacta (nome da
   empresa + nº do orçamento + régua, sem logo/endereço). `PdfHeader` recebe
   `compact: boolean`. O preview já desenha compacto nas páginas 2+ e passa a estar
   certo. Esse item sozinho tende a tirar 1-2 páginas do caso de 13 itens.
2. **Termos e assinatura com respiro no PDF Classic.** Dar `padding: 10` e
   `marginBottom: 8` aos cartões em `pdf-terms-section.tsx` / `pdf-signature-block.tsx`
   e atualizar `termsCardHeightPt`/`signatureHeightPt` em `blocks-from-model.ts`.
   Resultado: mesma aparência de cartão da web.
3. **"(cont.)" na continuação.** Quando `page.continuesTable`, renderizar o título
   da seção com sufixo `L.continued` (novo rótulo en/pt/es) acima do
   `PdfTableHeaderOnly`. Somar a altura do título em
   `CONTINUATION_TABLE_HEADER_HEIGHT_PT`.
4. **Hifenização desligada.** `Font.registerHyphenationCallback((w) => [w])` em
   `lib/pdf/register-fonts.ts`. O estimador (`lib/estimate/pagination/measure/
   estimator.ts`) já quebra por `linebreak` (sem hífen), então a previsão tende a
   ficar **mais** próxima do render, não menos; confirmar na calibração.
5. **Fotos e Prepared by.** Grade de fotos com `justifyContent: 'space-between'`
   (ou tile calculado para preencher `contentWidthPt`) em `pdf-photo-grid.tsx`;
   "Prepared by" passa a vir logo após a assinatura (ordem em `blocksFromModel`)
   e antes das fotos. Rodapé ganha `{company.name} · {estimate_number} · Page N of M`.
6. **Vão Summary → primeira seção no Modern.** Reduzir `marginBottom` do summary
   ou `marginTop` da primeira `sectionHeader` para ~16pt; ajustar
   `summaryHeightPt`.
7. **Recalibrar.** `npx tsx scripts/pagination-render-calibration.ts`; atualizar
   `PDF_RENDER_SAFETY_MARGIN_PT` e seu comentário com o resultado e a data.

Verificação da etapa: calibração com zero mismatches nos dois templates;
`tests/unit/pdf/estimate-pdf-pagination.test.tsx` e `tests/unit/pagination/**`
verdes; o fixture de 13 itens/4 seções sai em ≤ 3 páginas nos dois templates; o
preview paginado e o PDF mostram o mesmo cabeçalho na página 2.

### Etapa 3 — Harmonia entre superfícies

1. **Página pública completa.** `estimate-view.tsx` passa `preparedBy` e
   `companyTerms` para `EstimateDocument`/`EstimateDocumentModern`, remove o Card
   externo de Estimate Terms. Atualizar o teste PGMODE-05 (que hoje fixa o
   contrário) para o novo contrato. Resultado: página pública = PDF em conteúdo e
   ordem.
2. **Preview sensível ao template.** `PaginatedPreview` recebe `templateId` e
   aplica o conjunto de classes do Modern (serifa, réguas finas, sem faixas,
   seções com borda inferior, hero total) quando `modern`. Reaproveitar os blocos
   de `estimate-document-modern.tsx` onde der; a estrutura de dispatch por
   `PageBlock` já existe.
3. **Hierarquia do cabeçalho web.** Nome da empresa ≥ nome do projeto/cliente
   (ex.: empresa `text-2xl`, projeto/cliente `text-xl`), nos dois templates.
4. **Rótulos do WhatsApp** apontando para `document/labels.ts` onde houver
   equivalente ("Total" em vez de "Total Estimate"), mantendo o que é específico
   do canal.

Verificação: `tests/unit/estimate/presentation-settings-cross-surface.test.tsx` e
os testes de paridade de `tests/unit/estimate/` verdes; capturas da página
pública Modern vs PDF Modern lado a lado.

### Etapa 4 — Mobile e conversão (página pública)

1. **Barra inferior fixa** em `estimate-view.tsx` (só `< sm`, só enquanto
   `!responded`): total à esquerda, botão "Accept" à direita que rola até o Card de
   resposta (ou abre a assinatura). `position: sticky; bottom: 0` com
   `safe-area-inset-bottom`.
2. **Assinatura.** Canvas exibido com 160px; bitmap interno com a mesma proporção
   do elemento exibido (calcular `width/height` a partir de `getBoundingClientRect`
   × `devicePixelRatio` no mount) para a assinatura salva não sair esticada.
3. **Faixa ESTIMATE menor no mobile** (`py-4` em vez do atual, ou texto `text-2xl`),
   liberando a primeira tela para projeto e valor.
4. **Miniaturas no seletor de template** (`company-info-form.tsx`): duas imagens
   estáticas em `public/` geradas a partir dos PDFs de referência (Classic e
   Modern), ao lado do radio.

Verificação: capturas em 360px e 390px (Playwright com
`executablePath: '/opt/pw-browsers/chromium'`) sem transbordo; assinatura
desenhada num círculo aparece como círculo no PDF.

### Decisões de produto pendentes (antes das Etapas 3 e 4)

- **Editor Modern:** criar modo `edit` no `EstimateDocumentModern` (trabalho
  grande) ou aceitar "edita em Classic, vê Modern no preview/PDF" com um aviso no
  editor. Recomendação: a segunda, desde que o preview (Etapa 3.2) mostre o Modern.
- **Cabeçalho compacto nas páginas 2+ do PDF:** recomendado sim; é o que o preview
  já faz e o que mais reduz páginas.
- **Cor dos títulos de seção no Modern:** marca (como a web) ou preto (como o PDF).
  Recomendação: marca.

## Verificação

- CI: `npm run typecheck` + `npx vitest run tests/unit tests/eval` verdes em cada
  etapa.
- Calibração (`scripts/pagination-render-calibration.ts`) com zero mismatches após
  qualquer item da Etapa 2, e `PDF_RENDER_SAFETY_MARGIN_PT` atualizado com data.
- PDFs de referência (fixture 13 itens / 4 seções, com logo, 3 fotos, assinatura,
  desconto, imposto, sinal) renderizados antes e depois de cada etapa nos dois
  templates e conferidos visualmente via `pdftoppm`.
- Capturas da página pública (desktop 1100px, mobile 390px e 360px) e do preview
  paginado antes e depois das Etapas 3 e 4.
- Critério final: fixture de referência em ≤ 3 páginas nos dois templates; página
  pública, preview e PDF com o mesmo conteúdo na mesma ordem; nenhum texto
  hifenizado; nome da empresa na cor certa no Modern.
