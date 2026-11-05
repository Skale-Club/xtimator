# Login por telefone no Xtimator — referência Xpot e saída do Supabase Auth

Data: 2026-11-05 (America/New_York).

Status inicial: diagnóstico e proposta. A implementação posterior está entregue
atrás de ativação explícita; ver [AUTH-CUTOVER.md](./AUTH-CUTOVER.md) para o que foi
implementado, configuração, verificação e corte. Este diagnóstico continua como
registro da análise original e não comprova ativação em produção.

## Decisões do proprietário

- Sair do Supabase **para o sistema de login**.
- Telefone com código por SMS é o método principal.
- Google Login é secundário.
- Usar o sistema do Xpot como referência.

O pedido não exige retirar o banco de desenvolvimento do Supabase. As regras
compartilhadas em `C:/Users/Vanildo/Dev/AGENTS.md` mantêm desenvolvimento no
Supabase PostgreSQL e produção em PostgreSQL separado no Hetzner. A topologia
real do Xtimator deve ser verificada antes de qualquer alteração de ambiente;
não foi inspecionada nesta investigação.

## O que o Xpot realmente faz

Checkout analisado: `C:/Users/Vanildo/Dev/xpot`, HEAD `f37fa59`. Havia alterações
locais de telas de tarefas; nenhuma foi modificada nesta investigação.

| Etapa | Comportamento confirmado | Fonte no Xpot |
| --- | --- | --- |
| Entrada principal | Número com DDI, código de seis dígitos, reenviar com espera de 30 segundos | `client/src/components/PhoneSignIn.tsx` |
| Provedor atual | Quando `GOOGLE_AUTH_ENABLED=true`, o SMS e a verificação vêm do Google Identity Platform pelo SDK Firebase | `server/auth/phoneAuth.ts`, `client/src/lib/googleIdentity.ts` |
| Proteção do SMS | SDK `signInWithPhoneNumber` com reCAPTCHA invisível | `client/src/lib/googleIdentity.ts` |
| Alternativa Google | Popup com `GoogleAuthProvider`, abaixo do fluxo de telefone | `client/src/components/PhoneSignIn.tsx`, `client/src/lib/googleIdentity.ts` |
| Sessão do SDK | Persistência somente em memória; o SDK não é a sessão durável do aplicativo | `client/src/lib/googleIdentity.ts` |
| Troca de identidade | Browser envia `idToken` para `POST /api/auth/identity` | `server/auth/googleLogin.ts` |
| Validação | JWT RS256, assinatura por JWKS do Google, audience e issuer do projeto, expiração e claims obrigatórias; aceita `phone` e `google.com` | `server/auth/googleIdentity.ts` |
| Conta interna | `(project_id, subject)` aponta para `users.id`; UID Google não substitui o ID da conta | `server/auth/googleIdentityStore.ts`, `migrations/0079_google_identity_auth.sql` |
| Vinculação | Google desconhecido pede telefone; não reivindica conta apenas por e-mail igual. Identidade pendente fica na sessão por até dez minutos | `server/auth/googleLogin.ts` |
| Concorrência | Vinculações protegidas por transação e advisory locks em ordem estável; conflito com outra conta é rejeitado | `server/auth/googleIdentityStore.ts` |
| Sessão do aplicativo | `express-session` + `connect-pg-simple` em PostgreSQL, cookie HttpOnly, SameSite=Lax, Secure em produção, duração móvel de 30 dias | `server/auth/supabaseAuth.ts` |
| Autorização | Ativo entra; novo completa cadastro; pendente/bloqueado não recebe sessão autenticada do aplicativo | `server/auth/googleLogin.ts`, `server/auth/phoneAuth.ts` |

O nome `setupSupabaseAuth` é histórico: o arquivo atual configura a sessão
própria, e o antigo `POST /api/auth/login` responde 410. Não confundir nome de
arquivo com dependência ativa do Supabase Auth.

Também existe o caminho SMS anterior, com códigos hashados, prazo, tentativas
e integração Twilio. Ele é legado: com Google habilitado, a emissão por
`/api/auth/phone/start` responde 410. A verificação de códigos já emitidos é
mantida durante a transição. Não portar os dois provedores como se fossem
necessários para o novo sistema.

O Xpot mantém regras específicas de representantes, aprovação, candidatura,
veículo e kit. Elas não pertencem ao cadastro de empresas do Xtimator.

## Onde o Xtimator depende do Supabase Auth

Checkout correto: `C:/Users/Vanildo/Dev/xtimator`, HEAD `d9e622e7`, árvore limpa
no início. A pasta `C:/Users/Vanildo/Documents/ChatGPT/Xtimator` estava sem
código e sem commits; não é o checkout da aplicação.

| Superfície | Dependência atual | Consequência para a migração |
| --- | --- | --- |
| Modal da landing | `components/landing/auth-dialog.tsx`: Google OAuth, e-mail/senha e CAPTCHA | Substituir por um componente compartilhado de telefone/código e alternativa Google |
| Login dedicado | `app/(auth)/login/login-form.tsx`, `components/auth/google-oauth-button.tsx` | Remover duplicação e chamadas `signInWithOAuth` |
| Cadastro e recuperação | `lib/actions/auth.ts`, `app/(auth)/callback/route.ts`, `app/(auth)/update-password/*` | Trocar cadastro/login por prova de identidade; aposentar senha, reset e callback antigo no corte |
| Sessão no servidor | `lib/supabase/server.ts`, `lib/queries/auth.ts`, `proxy.ts`, `lib/supabase/proxy.ts` | Hoje cookies e `auth.getClaims()` do Supabase identificam o usuário |
| Consultas e RLS | Actions e APIs usam o cliente Supabase autenticado; SQL usa `auth.uid()` | Um cookie próprio sozinho não autentica PostgREST nem fornece identidade às políticas RLS |
| Identificadores e FKs | Ex.: `companies.user_id REFERENCES auth.users(id)` em `20260409000001_initial_schema.sql`; membros, admins e outras tabelas repetem o vínculo | Preservar UUIDs e migrar referências, sem recriar empresas/usuários com novos IDs |
| Browser | 16 arquivos importam `@/lib/supabase/client`, incluindo polling, projetos, fotos, notificações, estimativas e uploads | Migrar leituras/mutações privadas e realtime ou prover compatibilidade RLS explicitamente validada |
| Perfil e conta | `lib/actions/settings.ts`: `auth.updateUser`, senha, e-mail, exclusão; tela em `app/(app)/settings/(tabs)/account/page.tsx` | Perfil deve passar a ser local; telefone de login precisa de fluxo de verificação separado |
| Admin e notificações | `auth.admin.getUserById/listUsers` em admin, integrações, layout de suporte e e-mail digest | Ler contas próprias; não deixar consulta administrativa dependente do GoTrue |
| Convites | `lib/actions/invite-accept.ts` exige e-mail correspondente ao convite e mantém token/role/company como autoridade | Login por telefone precisa resolver a comprovação do e-mail de convite sem aceitar campo digitado como prova |
| Demo | `lib/demo/session.ts` usa `auth.admin.generateLink` e `verifyOtp` para a identidade de demo | Reimplementar sessão isolada, host exclusivo e proibição de escrita; não encaminhar demo ao SMS |
| Logout/PWA | `app/api/logout/route.ts`, `app/api/auth/keepalive/route.ts`, `components/pwa/session-keepalive.tsx`, top-nav | Revogar/renovar sessão própria e atualizar a UI sem `onAuthStateChange` do Supabase |
| OAuth/MCP | `lib/oauth/*`, `lib/mcp/auth.ts`, `app/oauth/*` | Preservar tokens/consentimento próprios e atualizar resolução do principal; não confundir com Google Login |
| Entrega | Docker e GitHub Actions repassam configuração pública do Supabase | Incluir nova configuração pública/runtime e validar CSP/domínios no fluxo real de Coolify |

Inventário por busca estática: 70 arquivos em `app`, `lib`, `components` e
`proxy.ts` contêm `.auth.`; 262 linhas de migrations mencionam `auth.users`,
`auth.uid()` ou `auth.jwt()`. São indicadores de alcance, incluindo comentários
e histórico de migrations, não uma contagem de falhas ou objetos existentes no
banco de produção.

## Arquitetura proposta

Adotar a separação do Xpot: Google verifica a identidade; Xtimator mantém sua
conta, autorização e sessão. Adaptar para Route Handlers/Server Actions do
Next.js, sem introduzir o servidor Express do Xpot.

### Fluxo de entrada

1. Exibir telefone com DDI como primeiro campo e “Send code” como ação principal.
2. Solicitar SMS pelo SDK Firebase com reCAPTCHA. O usuário digita o código;
   autocomplete de código e estados de reenviar/expirado/limite ficam visíveis.
3. Enviar o ID token ao servidor. Validar assinatura, projeto, emissor,
   expiração, provedor e telefone confirmado. Exigir autenticação recente para
   vinculação e troca de telefone; não confiar em telefone enviado no JSON.
4. Resolver a conta interna por vínculo já registrado ou prova de continuidade
   da conta antiga. Criar nova conta apenas quando isso não abandonar uma conta
   existente. Repetição e concorrência não podem gerar contas duplicadas.
5. Gerar sessão própria persistida no PostgreSQL; guardar somente o identificador
   opaco em cookie HttpOnly/Secure/SameSite=Lax, restrito ao host. Regenerar após
   login/vinculação, revogar no logout e renovar sob regra definida no servidor.
6. Retomar convite válido quando houver; caso contrário, empresa própria OU
   associação existente leva ao dashboard, e usuário sem empresa vai ao onboarding.

Google fica como botão secundário. Uma identidade Google já vinculada entra
diretamente; a primeira vinculação pede prova do telefone e da conta existente,
quando aplicável. Não criar uma empresa extra para um membro convidado.

### Identidade local e continuidade

Propor tabelas próprias para contas, identidades e sessões. Preservar os UUIDs
atuais de usuários; o UID Firebase pertence a uma coluna de identidade externa,
com unicidade por projeto/emissor e sujeito. Telefone de login confirmado deve
ser único em formato E.164. Perfil, foto e e-mail de contato pertencem à conta
local, com indicação explícita da origem/estado de verificação.

Importar metadados e identidades existentes por um processo controlado e
reconciliado. Não copiar senhas para o novo sistema. Não associar conta por
correspondência de e-mail enviado pelo browser ou telefone editável do perfil.

Em particular, `lib/actions/settings.ts` declara que o telefone de perfil é
editável e separado de `company_whatsapp.owner_phone`. Nenhum dos dois é prova
suficiente de posse da conta. Confirmar hoje um número não comprova quem inseriu
esse número na conta antiga. Para vincular legado, exigir sessão antiga válida,
identidade externa antiga comprovada ou recuperação com prova do canal já
verificado. Colisões precisam de resolução explícita, sem fusão automática.

Excluir conta deve apagar os dados locais conforme as regras de retenção e
revogar sessões. Não excluir automaticamente uma identidade Firebase compartilhada
com Xpot ou outros aplicativos. Reutilizar projeto Google não significa
compartilhar autorização, cookies ou contas do Xtimator.

### Autorização e acesso ao banco

Recomendação para o destino: acesso privado por funções do servidor, com conexão
PostgreSQL e autorização por principal/empresa em cada operação. Preservar RLS:
se continuar usando `auth.uid()`, transmitir claims somente após validar a
sessão, dentro da MESMA transação e conexão, com role sem BYPASSRLS e `SET LOCAL`
para impedir vazamento entre usuários no pool. Testar com o role real de execução.
Revisar funções SECURITY DEFINER e migrar FKs de `auth.users` para contas locais.

Isso demanda substituir consultas privadas diretas do browser e decidir a
entrega de notificações/atualizações, por exemplo polling autenticado na mesma
origem. Não trocar o cliente autenticado por service role global: isso remove
a proteção que as políticas atuais fornecem.

Se for necessário um incremento temporário mantendo PostgREST, projetar uma
ponte de identidade com JWT aceito pelo banco e escopo de usuário, com testes de
RLS reais. Firebase ID token e cookie próprio não são substitutos automáticos
do access token Supabase. A implementação posterior escolheu essa ponte para
preservar as consultas e RLS existentes enquanto retira Supabase Auth; detalhes
e pré-requisitos estão em [AUTH-CUTOVER.md](./AUTH-CUTOVER.md).

## Sequência de implementação e critérios de conclusão

| Ordem | Entrega | Evidência necessária |
| --- | --- | --- |
| 1 | Confirmar destinos de desenvolvimento/produção, inventariar usuários/identidades e dependências SQL reais; exportar backup e testar restauração antes de migração | Host/ambiente identificados sem expor credenciais; totais e IDs reconciliados; plano de reversão |
| 2 | Contas locais com os mesmos UUIDs, identidades e sessões; migração incremental de referências | Nenhuma empresa/membro/admin órfão, colisão rejeitada, rerun seguro |
| 3 | Camada de principal e consultas com isolamento por empresa, incluindo browser/realtime | Dois usuários de empresas diferentes não leem/escrevem dados um do outro; pools não vazam claims |
| 4 | UI compartilhada de telefone/código, Google secundário e endpoint de sessão/vinculação | Prova criptográfica, CSRF/origem, limites, replay/conflitos, erros e navegação testados |
| 5 | Perfil, troca de telefone, conta/admin, convites, demo, keepalive, logout e OAuth/MCP | Nenhuma dependência residual de GoTrue nesses fluxos; permissões, demo e convites mantidos |
| 6 | Configurar e verificar Google/CSP e execução no ambiente de desenvolvimento isolado | Testes automatizados com números fictícios; SMS/Google real controlado e teste em celular/PWA |
| 7 | Corte coordenado no pipeline Test → Docker/GHCR → Coolify | CI aprovada, imagem correta, health SHA e Inngest ressincado; smoke test de login e ações privadas |
| 8 | Observar e retirar o login Supabase antigo | Zero chamadas a `/auth/v1` nos fluxos novos e de administração; rollback ensaiado; sem retorno silencioso ao login antigo |

As credenciais Supabase necessárias ao banco de desenvolvimento ou a acessos
de dados ainda existentes não devem ser removidas como se fossem exclusivas do
login. A saída de autenticação precisa ser comprovada separadamente.

## Configuração externa a confirmar

- Projeto Google Identity Platform/Firebase adequado; avaliar o projeto já usado
  pelo portfólio antes de criar outro. Nenhuma configuração foi copiada do Xpot.
- Phone e Google habilitados, domínios autorizados, auth domain, regiões de SMS,
  limites/cotas e configuração pública de SDK completa.
- Desenvolvimento isolado com números de teste/emulador; a documentação atual
  informa restrição de localhost para phone auth hospedado. Verificar em domínio
  de desenvolvimento autorizado antes de considerar SMS real validado.
- CSP e headers permitindo somente os endpoints necessários ao SDK/reCAPTCHA e
  popup; validar também retorno ao host canônico e comportamento no celular.
- Segredo de sessão próprio, acesso PostgreSQL de privilégio mínimo e dados de
  desenvolvimento sem jobs/notificações de produção.

Referências oficiais consultadas em 2026-11-05:

- [Phone authentication for web](https://firebase.google.com/docs/auth/web/phone-auth).
- [Verify ID tokens](https://firebase.google.com/docs/auth/admin/verify-id-tokens).
- [Manage user sessions](https://firebase.google.com/docs/auth/admin/manage-sessions).

## Verificação executada nesta investigação

- Xpot: `npx vitest run tests/google-identity.test.ts tests/google-jwt.test.ts tests/google-login-disabled.test.ts tests/session-gate.test.ts --maxWorkers=1 --no-file-parallelism` — 4 arquivos, 21 testes aprovados.
- Xtimator: `npx vitest run tests/unit/auth-actions.test.ts tests/unit/auth/callback-route.test.ts tests/unit/actions/auth-invite-redirect.test.ts tests/unit/queries/auth.test.ts tests/unit/pwa/session-keepalive.test.ts tests/unit/storage/proxy-auth.test.ts --maxWorkers=1 --no-file-parallelism` — 6 arquivos, 37 testes aprovados.

Esses testes exercitam limites unitários e mocks; não comprovam login real,
configuração Google de produção, entrega de SMS, sessão em banco real nem
isolamento RLS da nova arquitetura. O teste do Xpot chamado
`google-login-disabled.test.ts` cobre identificação de provedores legados, não
significa que o Google atual esteja desativado. A integração Google/PostgreSQL
do Xpot não foi executada porque escreve dados no banco configurado.

Não houve alteração de código funcional, execução de migrations, conexão a
banco para inventário, envio de SMS, provisionamento Google ou deploy nesta etapa.
