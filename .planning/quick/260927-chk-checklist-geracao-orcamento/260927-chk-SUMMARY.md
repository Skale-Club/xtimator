# Summary: checklist de geração do orçamento

## O que mudou

### Etapa 1: checklist com memória e previsão
- `lib/estimate/progress-model.ts`: `buildChecklist` substitui `computeProgress`. Uma
  linha por etapa do pipeline e por sub-fase da geração, com estado, duração, fato
  reportado e peso pelo tempo típico. A barra nunca anda para trás, nem quando a
  segunda passada (auto-refine) aparece.
- `lib/estimate/generation-phases.ts`: ordem das fases corrigida para a ordem real do
  grafo (saving antes de reviewing); `buildPhaseVisits` reconstrói as visitas do journal.
- `lib/estimate/journal-medians.ts`: medianas por etapa e por sub-fase medidas como
  intervalos entre timestamps do journal.
- `lib/actions/attempt-outcome.ts`: o estado pendente devolve `stepTimings`,
  `phaseVisits` e `lastEventAt`.
- `components/capture/capture-progress-checklist.tsx` e overlay reescrito: cabeçalho,
  tempo restante, barra ponderada, checklist. Piadas rotativas removidas.

### Etapa 2: pode sair e ser avisado
- `lib/estimate/background-generations.ts` + `hooks/use-background-generations.ts`:
  registro por navegador das gerações deixadas em andamento.
- `components/capture/background-generation-watcher.tsx` (montado no layout do app):
  lê o journal e avisa com toast (e notificação do navegador com a aba oculta).
- Botão "Continuar em segundo plano"; o aviso "pode sair" só aparece após o despacho.
- Selo "Gerando orçamento" na lista de projetos.

### Etapa 3: feedback durante a redação
- `lib/ai/providers/openrouter-stream.ts`: leitura do stream SSE do OpenRouter,
  remontando a mesma resposta; contagem de seções e itens no JSON parcial.
- O serviço reporta cada nova seção como linha `drafting` (limite de 1 a cada 2s).
  Só ativo quando há tentativa rastreada (MCP e WhatsApp seguem sem streaming).

### Etapa 4: unificar e robustecer
- Aba do orçamento: mesmo checklist (via `hooks/use-attempt-progress.ts`), sem criar
  orçamento em branco durante a geração; banner compacto para nova versão.
- Rota `/capture`: checklist no lugar do stepper antigo (removido com seus testes).
- Gravador inline passa a tentativa na URL e registra a geração em segundo plano.
- Timeout do poll virou janela de inatividade reiniciada por atividade do journal,
  com teto de 20 min; ao estourar, a tentativa vai para o observador em segundo plano.

## Verificação
- `npx tsc --noEmit -p tsconfig.ci.json`: limpo.
- `npx vitest run tests/unit tests/eval`: tudo verde.
- Capturas visuais (pt claro, en escuro, largura de celular) dos estados redação ao
  vivo, precificação, segunda passada, atrasado e pronto.

## Revisão pós-implementação (correções)
- Popup "New Xtimate": o overlay absoluto ficava cortado no contêiner de 260px
  (checklist ~470px). Agora flui em linha e o contêiner rola quando necessário.
  Medido no navegador: desktop sem rolagem; iPhone SE rola 2px no pior caso.
- Aba do orçamento: um `attempt` estranho na URL (outra empresa ou inexistente)
  travava a aba num checklist eterno. O hook desiste após `unauthorized` ou 30s
  sem linhas no journal; a aba limpa os parâmetros e o registro em segundo plano.
- Corrida ao concluir: o resultado "concluído" fica retido por 20s depois que o
  registro em segundo plano some, para a aba não criar um orçamento em branco
  no intervalo até o refresh.
- Observador global: descarta a tentativa após 3 leituras `unauthorized` seguidas
  (troca de empresa ou de conta), em vez de consultar por 45 minutos.
- Medianas: a consulta busca só `metadata->>phase`, não o JSON inteiro.
- Painel de admin: linhas `started` consecutivas do mesmo passo viram uma entrada
  com contador (×N), para as dezenas de reportes de redação não virarem um muro.

## Pendências conhecidas
- Aviso no celular com o app fechado ou tela bloqueada exige push por service
  worker ou WhatsApp; hoje o aviso depende do app aberto (e `new Notification`
  não existe no iOS).
- Com a página do projeto aberta, a aba e o observador global consultam o journal
  em paralelo (2,5s e 5s). É desperdício pequeno, não erro.
- A segunda passada usa a faixa de 95% a 99% da barra; o detalhe da linha mostra a
  sub-fase atual.
- O streaming da redação só vale para o OpenRouter. O fallback do Gemini segue sem
  progresso intermediário.
