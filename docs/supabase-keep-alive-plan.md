# Plano de Keep-Alive do Supabase (Xtimator)

## Objetivo
Evitar que o projeto Supabase entre em estado de inatividade por falta de tráfego, mantendo um acesso periódico e seguro ao banco.

## Contexto do projeto
- O app atual (`Next.js`) ainda é client-side com `localStorage`.
- A integração com Supabase ainda será adicionada.
- O keep-alive precisa funcionar sem depender de usuários navegando no app.

## Estratégia recomendada
Usar **GitHub Actions com cron** para chamar um endpoint RPC no Supabase a cada 6 horas.

Motivos:
- Simples de operar com este repositório.
- Sem custo extra na maioria dos casos.
- Segredo (`service_role`) fica protegido em GitHub Secrets.

## Plano de implementação

### 1) Criar função SQL de ping no Supabase
No SQL Editor do Supabase:

```sql
create or replace function public.keepalive_ping()
returns jsonb
language sql
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'ok', true,
    'ts', now()
  );
$$;

revoke all on function public.keepalive_ping() from public;
grant execute on function public.keepalive_ping() to service_role;
```

Resultado esperado: endpoint `POST /rest/v1/rpc/keepalive_ping` disponível para chamadas autenticadas por `service_role`.

### 2) Configurar segredos no GitHub
No repositório, adicionar:
- `SUPABASE_URL` (ex.: `https://<project-ref>.supabase.co`)
- `SUPABASE_SERVICE_ROLE_KEY`

### 3) Criar workflow de agendamento
Arquivo sugerido: `.github/workflows/supabase-keepalive.yml`

Pontos obrigatórios do workflow:
- Cron a cada 6 horas (ex.: `17 */6 * * *`)
- `curl --fail` para falhar em respostas não-2xx
- Timeout curto (10-20s)
- Headers:
  - `apikey: $SUPABASE_SERVICE_ROLE_KEY`
  - `Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY`
  - `Content-Type: application/json`

Exemplo de chamada:

```bash
curl --fail --silent --show-error \
  -X POST "$SUPABASE_URL/rest/v1/rpc/keepalive_ping" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  --data '{}'
```

### 4) Monitoramento e alertas
- Habilitar notificações de falha de workflow no GitHub.
- Revisar logs no Supabase mensalmente para confirmar execução regular.
- Se falhar por 24h+, tratar como incidente (token revogado, URL errada, indisponibilidade).

### 5) Critérios de pronto
- Workflow executa com sucesso por 7 dias seguidos.
- Nenhum período de inatividade inesperada no Supabase.
- Chave `service_role` não aparece em logs públicos nem no frontend.

## Segurança
- Nunca usar `service_role` no cliente/browser.
- Não commitar `.env` com chaves reais.
- Limitar uso da chave ao workflow de keep-alive.

## Operação contínua
- Revisar este plano ao migrar de plano Free para Pro (keep-alive pode deixar de ser necessário).
- Se o app ganhar tráfego estável, reduzir ou remover o job agendado.
