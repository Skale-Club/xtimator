# Resumo: melhorias do design do orçamento (Etapas 1 a 4)

Execução do `261002-dsg-PLAN.md`. Orquestração e validação por um agente, execução
por subagentes; cada entrega foi revisada (diff, PDFs rasterizados, testes) antes
do commit.

## Decisões de produto (tomadas durante a execução)

- Cabeçalho compacto nas páginas 2+ do PDF: **sim**.
- Modern no editor: **o preview paginado passa a mostrar Modern** (Etapa 3, não feita).
- Títulos de seção do Modern: **cor da marca** (aplicado no PDF).
- Escopo desta rodada: **Etapas 1 e 2**.

## Desvios do plano

- **Rótulo "Deposit due at signing" (1.7) não feito.** `L.deposit` também rotula um
  select do editor (`whitespace-nowrap`); um texto longo quebraria o editor. Precisa de
  um rótulo separado só para superfícies de leitura.
- **Selo de idioma (1.8) movido para a Etapa 2**, porque o selo entra na altura medida
  do cabeçalho.
- **A margem de segurança não era a causa, era o disfarce.** A calibração da 2B achou
  o bloco de totais medido ~75pt menor do que renderiza (nos dois templates), além de
  legendas de foto e nome longo da empresa não medidos. O código anterior a esta rodada
  tinha casos reais de página extra silenciosa ("Página 4 de 3") em orçamentos
  completos. O modelo foi corrigido e a margem caiu de 90 para 24pt.

## Commits

| Commit | Conteúdo |
|---|---|
| `186df39` | Nome da empresa azul no PDF Modern; faixa de seção do Classic alinhada ao banner, com recuo de 10pt e largura medida no motor |
| `d65af22` | Web: ordem dos totais do Modern igual ao PDF; Lora carregada; contatos tocáveis (tel/mailto) sem ponto solto no mobile; total do item em negrito; "Estimate #" sem espaço |
| `a0efe64` | Cabeçalho compacto nas páginas 2+ (PDF e preview); hifenização desligada e quebra de linha só em espaço; selo de idioma só fora do inglês; rodapé com empresa, nº e página |
| `72b3c19` | Modelo de paginação exato (totais, cabeçalhos, legendas, nome longo); guarda em produção que re-renderiza e avisa no Sentry se o PDF real divergir do plano; cartões com respiro; "(cont.)"; fotos na largura toda; "Prepared by" após a assinatura; seções do Modern na cor da marca |

## Verificação

- `npx tsc -p tsconfig.ci.json --noEmit`: 0 erros. (O `tsc` completo tem 18 erros
  pré-existentes em arquivos de teste, iguais antes e depois.)
- `npx vitest run tests/unit tests/eval`: 693 arquivos, 6595 testes passando.
- Teste aleatório (gerador independente: seções, itens, descrições, títulos longos,
  termos, 0-9 fotos com legendas longas, assinatura, logo, nome/endereço longos,
  cliente ausente, en/es/pt, desconto/imposto/sinal, os dois templates), comparando
  páginas previstas pelo motor com páginas reais do PDF:
  - código antes desta rodada: falhas encontradas (ex.: Classic pt com assinatura);
  - código final: **0 falhas em 1.800 renderizações** com 6 sementes que não foram
    usadas no ajuste, mais 0 nas sementes usadas no ajuste.
- Fixture de referência (4 seções × 4 itens com descrições longas, logo, 3 fotos,
  assinatura, 5 termos, desconto/imposto/sinal): Classic 5 páginas, Modern 5 páginas,
  rodapé "of M" igual ao total real em ambos. Num fixture menor (13 itens), o Classic
  caiu de 5 para 4 páginas.

## Etapas 3 e 4

| Commit | Conteúdo |
|---|---|
| `fe6dd8e` | Seletor de template com miniaturas reais do PDF (geradas por `scripts/generate-template-thumbnails.ts`); "Total" no WhatsApp igual ao PDF |
| `f6f6a05` | Página pública com o mesmo conteúdo do PDF ("Prepared by" e Estimate Terms dentro do documento); barra fixa com total e Aceitar no celular; assinatura sem distorção e mais alta; hierarquia empresa > projeto/cliente na web; faixa ESTIMATE compacta no celular |
| `1e505e1` | Preview paginado renderiza o Modern; aviso no editor para empresas Modern |
| `3f90a19` | Preview Classic com os tamanhos do PDF: cada folha cabe numa página Carta (antes chegava a 1.463px contra 1.056px) |
| `7481243` | "Deposit required" / "Entrada exigida" / "Depósito requerido" nas linhas de sinal somente leitura; tipo de projeto formatado no PDF (antes saía `kitchen_remodel`) |
| `b501b1d` | Preview com os pesos, tamanhos e espaçamento entre letras do PDF; teste impede pesos 500/600 no preview |
| `b3518b4` | Margens entre blocos do preview somam como no PDF; cabeçalho sem a linha do responsável e com separador "\|" |

Correção extra: no editor em ~360px, os campos de desconto e sinal sobrepunham o valor ("10 %$150.00"); agora o valor desce para a linha de baixo no celular, desktop inalterado.

Regra fixada durante a execução: **o preview segue o PDF** (tamanho, peso, espaçamento); a hierarquia maior de projeto/cliente vale só para a página web e o editor.

## Verificação final

- `npx tsc -p tsconfig.ci.json --noEmit`: 0 erros.
- `npx vitest run tests/unit tests/eval`: 702 arquivos, 6685 testes passando.
- Teste aleatório de paginação com duas sementes novas após as últimas mudanças: 0 divergências em 600 renderizações.
- Preview × PDF com as fontes reais (Inter/Lora): todas as folhas com exatamente a altura Carta, mesmo número de páginas que o PDF, espaçamentos dentro de ~2pt.

## Pendências

- **Precisão restante do modelo:** nome do projeto e endereço do cliente muito longos no bloco de informações são cobertos pela folga de 12pt, não medidos exatamente; os avisos `[pdf_page_drift]` no Sentry mostram se isso acontece em produção.
- **Imposto no WhatsApp** mostra "(10%)" e no PDF "(10.00%)".
