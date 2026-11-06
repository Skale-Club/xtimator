# Ativação do login por telefone e sessão própria

Implementação: 2026-11-05. Este documento separa o código entregue da ativação
de um ambiente. A implementação não publica uma versão, não envia SMS e não
altera configuração Google ou banco por conta própria.

## Estado de produção em 2026-11-05

O corte foi ativado em 2026-11-05 às 14:30:43 UTC. A versão de aplicação
`3934f5ed4dc0f026d80c96449e0c3e92e4362e61` está publicada, com modo `owned`,
readiness HTTP 200 e `auth=ok`; o pipeline concluiu o sync do Inngest.
Contas/identidades locais foram importadas e tokens antigos de dados são
rejeitados. O banco/transporte de dados continua no projeto Supabase existente.

Snapshot público/auth/storage restaurado e migration ensaiada antes do corte;
backup preservado em bucket R2 privado exclusivo. CI passou nas duas execuções
da suíte completa: 6.877 testes por execução. Relatório e evidências operacionais:
`.planning/quick/261105-bdv-configure-google-identity-platform-and-c/261105-bdv-SUMMARY.md`.

**Validação real em 2026-11-05:** Google confirmou a identidade da conta existente;
o proprietário confirmou o SMS e o telefone foi vinculado pelo fluxo normal.
O UUID legado e a empresa foram preservados. Depois do logout (zero sessões
ativas), uma nova entrada somente por telefone/SMS abriu o mesmo dashboard com
os seis projetos existentes; não houve criação de conta duplicada.
Após outro logout, a entrada secundária pelo Google também abriu a mesma conta
sem pedir outro SMS.

**Pendente:** recuperação por e-mail. O ambiente continua sem chave Resend e o
Auth antigo não tem SMTP personalizado para reutilizar. A entrega de e-mail de
recuperação ainda não foi validada. O commit acima identifica o corte original;
a validação real ocorreu posteriormente na versão de produção `2a422f37`.

O healthcheck do Coolify usa `/api/health` em `127.0.0.1`, timeout 15s, intervalo
10s, 12 tentativas e início em 30s. O host IPv4 explícito evita a falha de conexão
do `wget` com `localhost` na imagem Alpine. O healthcheck Docker de liveness
continua independente em `/api/health/live`.

## Comportamento entregue

- Formulário compartilhado no modal e no login: telefone com DDI, SMS/reCAPTCHA,
  código, espera de reenvio e Google como alternativa secundária.
- Firebase Auth somente em memória. ID token recente (até cinco minutos),
  assinatura RS256, issuer, audience, expiração, provedor e atributos verificados
  são validados no servidor. Claims do browser não escolhem usuário/empresa/role.
- Contas locais com os UUIDs antigos; vínculo por identidade externa. Google
  legado é reconhecido pelo subject importado de `auth.identities`, nunca por
  correspondência de e-mail digitado. Usuário Google sem telefone termina a
  verificação por SMS antes da sessão do aplicativo.
- Recuperação de conta antiga pelo e-mail já confirmado: código com validade de
  dez minutos, no máximo cinco tentativas, e telefone confirmado para concluir.
  O telefone editável do perfil e o WhatsApp não viram identidade automaticamente.
- Cookie opaco HttpOnly, restrito ao host, SameSite=Lax e Secure em produção;
  somente hash no banco. Sessão de 30 dias, renovação pelo servidor perto da
  expiração e limite absoluto de 90 dias. Logout revoga a sessão. Recuperação e
  troca de telefone revogam as demais sessões. O telefone antigo não pode voltar
  a entrar usando um vínculo antigo do Firebase.
- Novo usuário vai ao onboarding; dono OU membro vai ao dashboard. Convite
  retoma `/invite/accept` e, quando necessário, confirma o e-mail convidado
  antes disso. Não cria empresa para o convidado.
- Perfil/admin/exclusão usam contas locais no modo próprio. Verificação de novo
  e-mail e troca de telefone ficam em Settings → Account. Senhas e callback
  Supabase deixam de ser usados. A exclusão mantém o apagamento sancionado das
  empresas antes da conta, sem excluir identidades Google compartilhadas.
- Demo mantém host, principal e empresa isolados, sem senha, magic link ou SMS,
  verificando ausência de privilégios administrativos antes de emitir sessão.

## Fronteira de dados e RLS

O SDK Supabase continua sendo o transporte de dados/PostgREST, Storage e
Realtime. **Isso não é uma sessão Supabase Auth**. No modo próprio, os adapters
de `lib/supabase/{server,client,service}.ts` resolvem usuários/sessões/admin no
banco local e não usam `/auth/v1` para autenticação ou administração.

As consultas de usuário usam JWTs de até cinco minutos com `sub` igual ao UUID
existente e `role=authenticated`. Eles são assinados no servidor com uma chave
HS256 explicitamente aceita por esse PostgREST; a chave nunca vai ao browser.
O browser recebe somente o token curto, mantém-no em memória e atualiza-o pela
sessão HttpOnly. Chave administrativa nunca substitui o bearer do usuário.

As políticas originais de empresa/demo continuam em vigor. Políticas
restritivas adicionais checam existência/validade da sessão e conta; revogar o
cookie no banco invalida também seus tokens de dados. Se Storage legado ainda
for utilizado, `storage.objects` recebe a mesma restrição. R2 continua seguindo
os guards existentes na aplicação.

RPCs SECURITY DEFINER precisam também de um **pre-request hook do PostgREST**:
`public.xtimator_check_request`. Ele bloqueia tokens antigos após o corte e
tokens próprios sem sessão válida antes de alcançar uma função que possa
ignorar RLS. A ativação exige configuração do hook, e a ferramenta verifica
criptograficamente o caminho real da API; a configuração no catálogo sozinha
não comprova que o hook está rodando.

Este incremento escolhe a ponte de dados compatível descrita no diagnóstico.
Migrar todo o SDK de dados para acesso SQL nativo é outro trabalho; não é
necessário para encerrar o uso de Supabase Auth.

## Pré-requisitos por ambiente

1. Banco **exclusivo do Xtimator** e topologia conferida. O hook do PostgREST é
   global à instância; não o instalar em um projeto compartilhado com outros
   aplicativos. A migration recusa tabelas públicas desconhecidas antes de
   qualquer escrita. A lista corresponde às tabelas nas migrations do Xtimator;
   uma recusa exige revisar o alvo, não apagar tabelas para passar no guard.
2. Desenvolvimento continua em Supabase PostgreSQL separado da produção, que
   deve usar sua infraestrutura própria. Não restaurar dados de produção nem
   executar migrações de outros projetos incidentalmente.
3. Snapshot consistente de dados, schema, usuários e identidades, com restauração
   ensaiada; preservar o backup privado no R2 conforme a política do projeto.
4. Google Identity Platform/Firebase com Phone e Google habilitados, região SMS,
   cotas, domínio autorizado e configuração pública do aplicativo conferidos.
   Reutilizar o projeto do portfólio somente após conferir a configuração.
5. Resend funcionando no ambiente para recuperar contas antigas e verificar
   e-mails de convite. Reutiliza a integração já existente, com chave server-only.
   Em desenvolvimento, usar integração/sink isolado de produção.
6. Chave de assinatura aceita pelo serviço de dados. Não usar uma chave Firebase,
   nem um bearer service-role como segredo. Em Supabase gerenciado, verificar
   suporte real à chave importada e ao pre-request hook; a ferramenta falha se
   a API não aplicar essa configuração. Não presumir compatibilidade.

Configuração server-only:

```dotenv
GOOGLE_AUTH_PROJECT_ID=<projeto Google>
FIREBASE_API_KEY=<configuração pública do SDK>
FIREBASE_AUTH_DOMAIN=<domínio autorizado do aplicativo Firebase>
XTIMATOR_DATA_JWT_SECRET=<chave HS256 aceita pelo PostgREST deste ambiente>
```

Chaves e URL do transporte de dados existentes continuam necessárias. As três
variáveis de configuração Firebase são públicas quando retornadas pelo endpoint
de configuração; não incluir ali credenciais de serviço ou private keys.

O modo é definido em **build time**, para browser e servidor concordarem:

```dotenv
NEXT_PUBLIC_AUTH_MODE=owned
```

O default durante a entrega é `supabase`. O modo próprio nunca faz fallback
silencioso. Para Docker, o argumento é `PUBLIC_IDENTITY_MODE`; GitHub Actions usa a
variável `NEXT_PUBLIC_AUTH_MODE`, com default `supabase`. Alterar apenas o valor
no Coolify sem reconstruir a imagem não altera o bundle existente.

## Preparar schema e validar

A migration é `supabase/migrations/20261105000001_owned_identity.sql`. Revisar e
aplicar **somente ela** no alvo verificado pelo mecanismo existente de migration.
Não executar todas as migrations pendentes sem revisão. Usar conexão direta ou
session pooler em 5432, nunca transaction pooler em 6543 para este trabalho.

Ela copia contas/Google subjects, conserva IDs, espelha alterações antigas
durante a preparação e muda FKs públicas para contas locais. Guarda definições
anteriores de FKs e funções para recuperação. Senhas não são copiadas. O flag
`xtimator_auth_control.active` começa como false: o runtime antigo ainda pode
funcionar enquanto se prepara o novo ambiente.

A ferramenta não lê `.env` automaticamente. Selecionar um arquivo seguro ou
definir o ambiente explicitamente. `AUTH_DATABASE_URL` é somente para operação;
ela não será usada pelo aplicativo como destino implícito.

```powershell
# Os nomes de host abaixo são placeholders, não comandos prontos para produção.
node --env-file=<arquivo-do-ambiente> scripts/auth-cutover.mjs --expected-host=<host-verificado>
```

A inspeção usa transação read-only e retorna contagens/booleans sem credenciais,
e-mails, códigos ou tokens. Configurar também as variáveis do transporte de dados
e a chave de assinatura nesse ambiente para testar a API real. O `instance_id`
no banco precisa corresponder ao retornado pela API antes de qualquer corte.

Se não houver hook anterior ou composição pendente e o banco for exclusivo:

```powershell
node --env-file=<arquivo-do-ambiente> scripts/auth-cutover.mjs --expected-host=<host-verificado> --exclusive-database --install-hook
```

Aguardar o reload do PostgREST e repetir a inspeção. A ferramenta emite um JWT
com UUIDs de usuário/sessão inexistentes e exige a resposta **403 / 42501 /
Session is no longer valid** do nosso hook. Isso confirma chave aceita, API no
banco certo e hook real, sem criar usuário, sessão ou dado de aplicação. Um hook
anterior desconhecido não é substituído automaticamente.

## Corte coordenado

1. Ensaiar em desenvolvimento isolado: dois usuários/empresas, conta antiga,
   Google, número novo, recuperação, convite, perfil, upload, demo, logout/PWA e
   OAuth/MCP. Usar números fictícios/emulador nos testes automatizados. A
   documentação Google informa restrição de localhost para phone auth hospedado;
   usar domínio de desenvolvimento autorizado para o teste real controlado.
2. Passar typecheck, testes e build. Preparar a imagem com modo `owned` e a
   configuração runtime, sem enviar usuários a uma versão não preparada.
3. Em janela coordenada, interromper novas operações de login antigo, confirmar
   o backup e a inspeção de API/hook. Ativar explicitamente:

   ```powershell
   node --env-file=<arquivo-do-ambiente> scripts/auth-cutover.mjs --expected-host=<host-verificado> --exclusive-database --activate
   ```

4. Publicar pelo fluxo GitHub Actions → Docker/GHCR → Coolify. O flag ativo passa
   a rejeitar tokens antigos; alinhar a troca de imagem para minimizar a janela
   em que o frontend antigo ainda está servido. Não descrever esse corte como
   uma atualização sem logout. Sessões Supabase antigas exigem novo login ou
   recuperação; dados e IDs permanecem.
5. Verificar commit em `/api/health`, Inngest ressincado, conta antiga com dados
   intactos e login/código real em navegador e celular/PWA. Observar erros e
   garantir ausência de chamadas a `/auth/v1` nos novos fluxos.
6. Só depois retirar os provedores/endpoints de login antigos e credenciais
   exclusivas do Supabase Auth. Não apagar `auth.users`, seus usuários ou o projeto
   Supabase; o banco de desenvolvimento/transporte ainda pode precisar deles.

## Recuperação

Antes de novas contas/alterações próprias, é possível voltar ao flag inativo e
ao build antigo, após verificar a equivalência das contas espelhadas e os hooks.
As definições anteriores estão em `xtimator_auth_legacy_fks` e
`xtimator_auth_legacy_functions`. Não restaurar constraints ou apagar contas
automaticamente: a reversão precisa considerar os dados escritos após o corte.

**Depois que novas contas próprias existem**, restaurar simplesmente o build
antigo pode deixá-las sem login no GoTrue. Preferir corrigir a versão própria ou
executar uma restauração/reconciliação planejada a partir do backup ensaiado.
Não prometer rollback sem perda de dados sem realizar esse ensaio.

## Verificação da implementação

- Reteste final: 148 testes aprovados em 18 arquivos, incluindo 46 testes novos
  de identidade, SQL/RLS, sessões, rotas, recuperação, demo e interface.
- Build de produção Next.js em modo `owned`: compilação, typecheck da aplicação
  e geração das 98 páginas concluídos com transporte de dados fictício local.
- Chromium em viewport de celular: `/login` 200, telefone antes de Google,
  recuperação visível, `/api/auth/config` no modo próprio, sessão anônima sem
  token e `/dashboard` redirecionando 307 para login. Zero erros client-side e
  zero chamadas a `/auth/v1` nesse smoke test. Nenhum SMS foi solicitado.
- A execução ampla anterior passou em 6.860 testes e encontrou sete falhas;
  todas as classes de falha foram corrigidas e os arquivos afetados passaram no
  reteste final. A suíte inteira não foi repetida após os ajustes.
- O bare typecheck advisory também apontou divergências anteriores em fixtures
  de testes fora desta mudança. O build usa o mesmo escopo de código de produção
  do check bloqueante em CI, sem ignorar erros do código da aplicação.
- Nenhuma migration remota ou ativação foi executada. A tentativa read-only de
  inventário pelo pooler local em 6543 não concluiu e foi encerrada. Não há
  comprovação de configuração Google, entrega SMS, API/hook reais ou corte de
  produção nesta etapa.

Além da autenticação, a validação exigiu remover exports auxiliares inválidos
de rotas/páginas Next, retirar `node:crypto` de um utilitário compartilhado com o
browser e alinhar o escopo de tipos do build ao CI. Os testes SQL existentes
foram normalizados para CRLF/LF sem mudar suas assertions; o teste de dispatch
passou a mockar sua escrita de ownership, eliminando acesso externo no unit test.

## Referências oficiais

- [Firebase phone authentication](https://firebase.google.com/docs/auth/web/phone-auth).
- [ID token verification](https://firebase.google.com/docs/auth/admin/verify-id-tokens).
- [PostgREST configuration and pre-request hooks](https://docs.postgrest.org/en/stable/references/configuration.html).
- [Externally minted JWTs and accessToken client integration](https://supabase.com/docs/guides/auth/jwts).
