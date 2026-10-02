# Resumo: melhorias do design do orçamento (Etapas 1 e 2)

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

## Pendências

- **Etapa 3:** preview paginado mostrando Modern; página pública com "Prepared by" e
  Estimate Terms dentro do documento; hierarquia do cabeçalho web; rótulos do WhatsApp.
  O recuo do título da seção no preview (30pt) difere do PDF (10pt).
- **Etapa 4:** barra fixa com total e Aceitar no mobile; canvas de assinatura maior e
  sem distorção; faixa ESTIMATE menor no mobile; miniaturas no seletor de template.
- **Editor no mobile:** campos de desconto e sinal sobrepõem o valor em ~360px
  (pré-existente; sugerido como tarefa separada).
- **Precisão restante do modelo:** nome do projeto e endereço do cliente muito longos
  no bloco de informações são cobertos pelos 12pt de folga, não medidos exatamente.
  Os avisos `[pdf_page_drift]` no Sentry mostram se isso acontece em produção.
