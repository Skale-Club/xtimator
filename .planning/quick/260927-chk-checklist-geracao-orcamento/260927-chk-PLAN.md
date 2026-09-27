# Checklist de geração do orçamento (menos ansiedade na espera)

## Context

Relato do usuário: a geração do orçamento demora, e a tela atual gera ansiedade.
Pedido: cada etapa concluída vira um item marcado num checklist ("fazendo tal
coisa… pronto"), e analisar o processo inteiro de espera.

Diagnóstico do overlay anterior (components/capture/capture-processing-overlay.tsx):

- Barra de 3 segmentos iguais, mas a geração é ~90% do tempo: a barra chegava a
  2/3 em 10s e depois quase não se mexia por minutos.
- Os tempos típicos das sub-fases somavam ~78s contra rodadas reais de minutos;
  a barra da fase de redação enchia em 30s e congelava.
- Só um rótulo por vez: nada ficava marcado como feito, e os fatos reportados
  pelo servidor ("38 itens em 5 seções") sumiam na fase seguinte.
- Cronômetro contando para cima, sem previsão do que falta.
- A redação (chamada do LLM, a fase mais longa) era cega: nenhum sinal intermediário.
- Ordem declarada das fases (reviewing antes de saving) diferente da ordem real do
  grafo (generate → assess → autoRefine → generate).
- Fechar o popup desmontava o gravador e parava o acompanhamento, sem aviso ao terminar.
- Três loaders diferentes (popup, aba do projeto com `autoGenerating`, rota `/capture`).
- Timeout fixo de 6 min no cliente contra rodadas reais de 5 min.
- Piadas rotativas em inglês ("Haggling with the supply house") viravam ruído.

## Etapas

1. **Checklist com memória e previsão.** Uma linha por etapa e por sub-fase da
   geração, com check, duração e o fato reportado. Barra ponderada pelo tempo real
   (medianas do journal por etapa e por sub-fase). Linha de tempo restante. Segunda
   passada (auto-refine) como linha própria. Piadas removidas.
2. **Pode sair e ser avisado.** Botão "Continuar em segundo plano", registro das
   gerações em andamento, observador global que avisa com toast (e notificação do
   navegador, se permitida) quando o orçamento fica pronto, precisa de detalhes ou falha.
3. **Feedback durante a redação.** Streaming da chamada ao OpenRouter; o servidor
   reporta seções e itens conforme o modelo escreve.
4. **Unificar e robustecer.** Mesmo checklist na aba do projeto e na rota `/capture`;
   timeout do poll guiado pela atividade do journal em vez de relógio fixo.

## Verificação

- `npx tsc --noEmit -p tsconfig.ci.json`
- `npx vitest run tests/unit tests/eval`
- Captura visual do overlay nos estados em andamento, segunda passada, atrasado e pronto.
