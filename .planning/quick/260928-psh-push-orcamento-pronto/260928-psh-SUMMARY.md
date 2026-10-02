# Push "orçamento pronto" com o app fechado

## Pedido
Avisar no celular quando o orçamento termina, mesmo com o app fechado ou a tela
bloqueada. O aviso anterior (toast + `new Notification`) dependia do app aberto.

## O que já existia
- `lib/notifications/push-client.ts` + `/api/notifications/push/subscribe`: scaffold
  da fase 77 (NOTIF-09). Guardava UMA inscrição por usuário; o envio ("fase 2")
  nunca foi implementado.
- `public/sw.js`: worker de emergência que se desregistra. `SWRegister` e
  `chunk-recovery` desregistram TODOS os workers a cada carga (regressão do PWA antigo).

## O que mudou
- `public/push-sw.js`: worker só de push, SEM fetch handler, escopo `/push/`
  (caminho que o app não serve), então não controla página nenhuma.
- `lib/pwa/push-worker.ts`: identidade do worker; `SWRegister` e `chunk-recovery`
  agora poupam só ele.
- `lib/notifications/push-devices.ts`: lista de aparelhos no mesmo JSONB
  (`{ v: 2, devices }`), sem migração; formatos antigos continuam legíveis.
- Rota de inscrição: GET devolve a chave pública em runtime; POST adiciona o
  aparelho com o idioma; DELETE remove só o aparelho atual.
- `lib/notifications/web-push.ts`: envio com `web-push` + VAPID; remove aparelhos
  404/410; no-op sem chaves.
- `lib/notifications/estimate-push.ts`: texto em en/pt/es; link para o orçamento.
- Eventos carregam `notifyUserId` (quem iniciou a captura) por texto, áudio e fotos.
  `createdByUserId` (que alimenta "Prepared by") não foi tocado.
- Inngest `generate-estimate`: passo memoizado `notify-push` (pronto / precisa de
  detalhes) e envio de "falhou" no `onFailure`. MCP não recebe push.
- UI: botão "Avisar neste aparelho quando ficar pronto" no checklist; confirmação
  quando já ativo; no iPhone fora da Tela de Início, dica para instalar.
  "Continuar em segundo plano" também inscreve o aparelho quando possível.

## Configuração necessária (produção)
No Coolify, variáveis de RUNTIME (não build args):
`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` e, opcional, `VAPID_SUBJECT`.
Gerar uma vez com `npx web-push generate-vapid-keys`. Sem as chaves, o recurso
fica desligado e o app não pede permissão.

## Verificação
- Typecheck do CI limpo; `vitest run tests/unit tests/eval` verde.
- Chromium real: o worker sobrevive à varredura de limpeza; um push entregue via
  DevTools mostra título, texto e link corretos; mesma tag substitui; o worker não
  controla página.
- NÃO verificado aqui: entrega real pelo serviço de push (o Chromium deste ambiente
  não tem o serviço do Google) e comportamento em iPhone.

## Limitações
- iPhone/iPad: só com o Xtimator adicionado à Tela de Início (iOS 16.4+).
- Chrome no desktop precisa do navegador aberto (em segundo plano) para receber.
