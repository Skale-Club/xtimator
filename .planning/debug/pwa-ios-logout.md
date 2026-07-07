---
status: awaiting_human_verify
trigger: "PWA no iPhone (adicionado à tela inicial) desloga o usuário depois de ficar um tempo sem uso. Ao reabrir cai na tela de login. Objetivo: sessão durar o máximo possível."
created: 2026-07-06T00:00:00Z
updated: 2026-07-06T00:00:00Z
---

## Current Focus

hypothesis: CONFIRMADA (H1). O refresh token do @supabase/ssr é gravado no COOKIE via document.cookie (browser client sem opções → fallback document.cookie). Safari ITP limita cookies gravados por JavaScript (document.cookie) a 7 dias de vida efetiva, IGNORANDO o maxAge de 400 dias solicitado. Cookies gravados pelo SERVIDOR (Set-Cookie do middleware) são isentos do cap — mas o middleware só roda numa navegação de rede real. Como não há refresh proativo no cold-open e o SW pode servir HTML cacheado, após >7 dias sem uso o cookie do refresh token é apagado pelo iOS → cold-open sem token → middleware getClaims() = null → redirect /?auth=login = logout.
test: confirmado via leitura de node_modules/@supabase/ssr (cookies.js linhas 92-105 usam document.cookie; setItem usa maxAge=400d mas via document.cookie), Management API PROD (sem timeout de sessão), e pesquisa ITP (document.cookie capado a 7d; Set-Cookie server isento até 400d).
expecting: N/A — causa confirmada.
next_action: FIX IMPLEMENTADO (Camadas A + C). Aguardando verificação humana no iPhone real (só o iOS demonstra o cap de 7 dias ao vivo).

## Symptoms

expected: Depois de instalar o PWA na tela inicial do iPhone e ficar um tempo sem abrir, ao reabrir o app o usuário deveria continuar logado (sessão de longa duração).
actual: Ao reabrir o app depois de um tempo sem uso, o usuário é deslogado e cai na tela de login (/?auth=login).
errors: Nenhuma mensagem de erro reportada (não inspecionou console/network no iOS).
reproduction: Instalar PWA na tela inicial do iPhone, usar, fechar, deixar sem uso por um tempo, reabrir. Tempo até deslogar VARIÁVEL/desconhecido. Testado SOMENTE no iPhone.
started: Não especificado.

## Eliminated

- hypothesis: H2 — Timeout de sessão na PRODUÇÃO (inactivity timeout / timebox) expira o refresh token no servidor.
  evidence: Consultei a Management API de produção (GET /v1/projects/prmqgcrnpuvpzruyzvuv/config/auth com SUPABASE_ACCESS_TOKEN, HTTP 200). PROD retorna sessions_timebox=0, sessions_inactivity_timeout=0, sessions_single_per_user=false, jwt_exp=3600, refresh_token_rotation_enabled=true, security_refresh_token_reuse_interval=10. Nenhum timeout de sessão ativo no servidor → o servidor NÃO está expirando a sessão. Logout é client-side.
  timestamp: 2026-07-06

## Evidence

- timestamp: 2026-07-06
  checked: lib/supabase/client.ts
  found: createBrowserClient chamado SEM opções de auth (sem persistSession/autoRefreshToken/storage/cookieOptions).
  implication: Usa defaults do @supabase/ssr → sessão em cookies via document.cookie no cliente.

- timestamp: 2026-07-06
  checked: proxy.ts (middleware)
  found: matcher exclui _next/static, _next/image, favicon, e arquivos de imagem. Usa getClaims() (renova token). setAll sem cookieOptions custom → defaults 400 dias. Redireciona não-autenticados de rotas protegidas para /?auth=login.
  implication: Middleware renova server-side QUANDO roda numa navegação real de rede.

- timestamp: 2026-07-06
  checked: public/sw.js (cache v3)
  found: navegação = NetworkFirst com fallback offline; se rede falhar, serve HTML cacheado (/offline ou página cacheada). API e Supabase = passthrough.
  implication: Num cold-open OFFLINE, o middleware NÃO roda (SW serve cache) → sem renovação server-side; só o cliente renovaria — e não há refresh proativo (a confirmar).

- timestamp: 2026-07-06
  checked: grep global por refresh proativo no cliente (visibilitychange/pageshow/focus + onAuthStateChange/refreshSession)
  found: NÃO existe refresh proativo global ao voltar o app ao primeiro plano. Único visibilitychange está em components/capture/capture-recorder.tsx (áudio, irrelevante). Único onAuthStateChange está em components/landing/top-nav-auth.tsx e SÓ atualiza estado de UI (avatar/email) — não chama refreshSession. Nenhum provider/layout dispara refreshSession no resume.
  implication: No cold-open, a única renovação é a passiva do autoRefreshTimer do @supabase/ssr APÓS o app já estar aberto e a passiva do middleware server-side (getClaims). Se o cookie do refresh token foi apagado pelo iOS antes de reabrir, NÃO há token para renovar → getClaims() no middleware retorna null → redirect /?auth=login. GAP-chave para mitigação.

- timestamp: 2026-07-06
  checked: Management API PROD config/auth (project ref prmqgcrnpuvpzruyzvuv)
  found: jwt_exp=3600, refresh_token_rotation_enabled=true, security_refresh_token_reuse_interval=10, sessions_timebox=0, sessions_inactivity_timeout=0, sessions_single_per_user=false.
  implication: Servidor NÃO expira sessão. Confirma que o problema é perda do refresh token no cliente (iOS). H2 eliminada. Rotação com reuse_interval=10s ainda é um risco teórico (H3) mas não é a causa da perda de sessão após "tempo sem uso".

- timestamp: 2026-07-06
  checked: middleware wiring — proxy.ts (root) vs lib/supabase/proxy.ts
  found: proxy.ts na raiz exporta config.matcher e a função proxy (convenção Next.js 16 que substitui middleware.ts). lib/supabase/proxy.ts (updateSession) é uma variante mais antiga; o matcher ativo é o de proxy.ts. Ambos usam getClaims() + setAll sem cookieOptions custom (defaults 400 dias).
  implication: Cookies server-set via Set-Cookie usam maxAge padrão 400 dias — a expiração do cookie não é o gargalo. Gargalo = iOS apagar o cookie antes da expiração.

- timestamp: 2026-07-06
  checked: node_modules/@supabase/ssr/dist/main/cookies.js (createStorageFromOptions) + createBrowserClient.js
  found: Como lib/supabase/client.ts chama createBrowserClient SEM cookie options, a lib cai no ramo "environment is browser" e implementa getAll/setAll via document.cookie (cookies.js linha ~92-105: `document.cookie = serialize(name, value, options)`). O setItem serializa a sessão com maxAge=DEFAULT_COOKIE_OPTIONS.maxAge (400 dias) — MAS a gravação é via document.cookie (JavaScript).
  implication: No iOS/Safari, cookies gravados por document.cookie têm vida efetiva CAPADA em 7 dias, independentemente do maxAge=400d solicitado. Toda vez que o app está aberto, o autoRefreshToken (a cada ~50min) e o getSession reescrevem o cookie via document.cookie → re-carimbam com validade efetiva de 7 dias. Se a última gravação antes de fechar foi client-side (quase sempre é), o cookie persiste só 7 dias.

- timestamp: 2026-07-06
  checked: WebSearch — comportamento atual (2025-2026) do iOS/Safari ITP para PWAs home-screen e distinção document.cookie vs Set-Cookie
  found: (1) O cap de 7 dias de script-writable storage se aplica a cookies gravados por document.cookie/localStorage/IndexedDB/SW registrations. (2) A afirmação da Apple de que home-screen web apps "têm seu próprio contador e não esperamos apagar" é frágil na prática: relatos 2025-2026 confirmam que o iOS ainda limpa storage de PWA após ~semanas sem uso, e o cap de 7 dias para document.cookie continua valendo. (3) Cookies gravados via Set-Cookie (resposta HTTP do servidor first-party) são ISENTOS do cap de 7 dias e persistem pelo TTL configurado (até 400 dias) — desde Safari 16.4 com a ressalva de "servidor não suspeito" (mesmo domínio first-party, o que é o nosso caso via Vercel).
  implication: A mitigação central é garantir que o refresh token seja gravado/renovado por VIA SERVIDOR (Set-Cookie) o mais frequentemente possível — em especial forçar um round-trip de servidor no cold-open/resume do PWA — para que o cookie seja re-carimbado como server-set (isento do cap de 7 dias) e não fique preso na validade efetiva de 7 dias imposta às gravações via document.cookie.

## Resolution

root_cause: |
  O refresh token da Supabase é persistido em COOKIE. O browser client (lib/supabase/client.ts → createBrowserClient sem opções) grava/renova esse cookie via document.cookie (fallback da @supabase/ssr quando não há cookie options). No iOS/Safari, cookies gravados por JavaScript (document.cookie) têm a vida efetiva LIMITADA a 7 dias pelo ITP, ignorando o maxAge de 400 dias que a lib solicita. Enquanto o PWA está aberto, o autoRefreshToken reescreve o cookie via document.cookie (re-carimbando 7 dias). Não existe nenhum refresh proativo no resume/cold-open do app (nenhum visibilitychange/pageshow/onAuthStateChange chama refreshSession), e o service worker (NetworkFirst) pode servir HTML cacheado sem passar pelo middleware. Resultado: depois de >~7 dias sem abrir o PWA (ou antes, sob pressão de storage do iOS), o iOS apaga o cookie do refresh token; no cold-open não há token para renovar; o middleware (proxy.ts) chama getClaims() → null → redireciona para /?auth=login. Isso é 100% client-side/iOS: o servidor Supabase de PRODUÇÃO NÃO tem timeout de sessão (sessions_timebox=0, sessions_inactivity_timeout=0) e o cookie server-set teria 400 dias.

  Causas ranqueadas por probabilidade (com evidência):
  1. [PRIMÁRIA] iOS ITP cap de 7 dias em cookie gravado por document.cookie + ausência de refresh proativo no resume. (confirmada)
  2. [ELIMINADA] Timeout de sessão na produção. (Management API: timebox=0, inactivity=0)
  3. [MENOR/secundária] Corrida de rotação (reuse_interval=10s) no cold-open entre middleware e client. Pode causar logouts esporádicos/aleatórios adicionais, mas NÃO explica o padrão "some depois de um tempo sem uso". Mitigada pelas mesmas mudanças.

fix: |
  Plano em camadas (a aplicar — nenhuma alteração feita nesta rodada de diagnóstico):

  CAMADA A (código, principal) — Refresh proativo via SERVIDOR no resume/cold-open do PWA:
    - Novo client component montado no layout autenticado (app/(app)/layout.tsx) que, em visibilitychange→visible, pageshow (persisted) e focus, chama supabase.auth.refreshSession() (browser) E dispara um fetch same-origin a uma rota de servidor leve (ex.: GET /api/whoami já existe e usa createClient().auth) para forçar o middleware/route a reemitir os cookies via Set-Cookie (isento do cap de 7 dias). Debounce para evitar tempestade de refresh (respeitar rate_limit token_refresh=150/5min).
    - Efeito: cada vez que o usuário reabre o app, o refresh token é re-carimbado como server-set (400 dias) e revalidado, resetando o relógio do ITP.

  CAMADA B (config Supabase) — Reduzir a superfície de expiração:
    - Já OK em prod (timebox/inactivity = 0). Manter assim. Opcional: aumentar jwt_expiry não ajuda (o problema é o refresh token no cookie, não o access token).
    - Avaliar desativar rotação de refresh token (enable_refresh_token_rotation=false) OU aumentar security_refresh_token_reuse_interval para reduzir risco da corrida H3 no cold-open (trade-off de segurança — decisão do usuário).

  CAMADA C (service worker) — Garantir round-trip de servidor no cold-open:
    - Assegurar que a navegação inicial do PWA online SEMPRE atinja a rede (NetworkFirst já faz isso quando online); considerar não servir HTML de rotas autenticadas do cache quando online, para o middleware sempre rodar e reemitir cookies server-set.

  CAMADA D (opcional, robustez) — cookieOptions explícitas no createBrowserClient/createServerClient:
    - Passar cookieOptions consistentes (maxAge 400d, sameSite 'lax', secure) para alinhar client e server. Não resolve o cap do ITP sozinho (document.cookie continua capado), mas evita divergências.

  A CAMADA A é a que efetivamente mantém a sessão "praticamente para sempre" no iOS, pois transforma cada reabertura em uma gravação server-set isenta do cap de 7 dias.

  --- IMPLEMENTADO (2026-07-06, Camadas A + C; Camada B NÃO mexida por decisão do usuário) ---

  Camada A (novo):
  - app/api/auth/keepalive/route.ts — rota GET leve que valida a sessão via createClient() (server) com getClaims() e retorna { ok, loggedIn } com Cache-Control: no-store. Por estar sob /api, passa pelo middleware (proxy.ts): quando o access token de 1h expirou, getClaims() → getSession() → _callRefreshToken() renova server-side e o setAll do middleware reemite os cookies sb-*-auth-token via Set-Cookie (isento do cap de 7 dias do ITP). O refresh é feito SÓ pelo middleware (server-side) — NÃO chamamos refreshSession() no cliente — para manter um único caminho de refresh no foreground e evitar a corrida de rotação (causa secundária H3).
  - components/pwa/session-keepalive.tsx — client component que, em visibilitychange→visible, pageshow e focus (e uma vez no mount, para cobrir cold-open servido do cache do SW), faz fetch('/api/auth/keepalive', { credentials:'same-origin', cache:'no-store', keepalive:true }). Throttle de 5 min (KEEPALIVE_MIN_INTERVAL_MS) + guarda inFlight para não estourar o rate limit token_refresh (150/5min) da Supabase e evitar disparos duplicados no mesmo foreground.
  - app/(app)/layout.tsx — monta <SessionKeepalive /> nas DUAS branches de render (support-mode + normal), ao lado de <SWRegister />. Fica só no shell autenticado (o layout já faz getAuthClaims() + redirect), nunca na landing pública.

  Camada C (verificado, sem alteração de código necessária):
  - public/sw.js já trata /api/* como NetworkOnly (retorna early na linha 49) → a rota keepalive NUNCA é servida do cache. networkFirstWithFallback já prefere a rede quando online → navegações online já atingem o middleware. O ping no mount cobre o caso cold-open offline→foreground. Nenhuma mudança no SW foi necessária.

  Teste adicionado:
  - tests/unit/pwa/session-keepalive.test.ts — trava o contrato: rota usa server client + getClaims + no-store + dynamic; vive sob /api (NetworkOnly no SW); component escuta os 3 eventos de foreground, faz fetch same-origin/no-store, e faz throttle; layout monta SessionKeepalive nas 2 branches.

verification: |
  Feito nesta rodada (o que dá para provar sem iPhone):
  - typecheck (tsc --noEmit): meus arquivos novos/alterados estão LIMPOS (nenhum erro referencia keepalive/route.ts, session-keepalive.tsx ou (app)/layout.tsx). Os erros de tsc que aparecem são pré-existentes: módulos ausentes neste ambiente (ai, @sentry/nextjs, react-colorful, etc.) — não instalados, sem relação com o fix.
  - eslint nos 4 arquivos: 0 errors (1 warning pré-existente 'TourHelpButton' unused no layout, não introduzido por mim).
  - vitest tests/unit/pwa/session-keepalive.test.ts: 7 passed / 7.
  - Revisão do fluxo do middleware (proxy.ts): /api/auth/keepalive é rota protegida (prefixo /api), não pública; autenticado → não redireciona, retorna supabaseResponse com os cookies reemitidos por setAll. Correto.

  Pendente (verificação HUMANA no iPhone real — só o iOS demonstra o cap de 7 dias ao vivo):
  - Deploy em prod/preview. Instalar PWA na tela inicial, logar, fechar.
  - Com o iPhone conectado ao Safari desktop (Web Inspector), ao reabrir o app conferir na aba Network que a chamada a /api/auth/keepalive retorna 200 e traz Set-Cookie para sb-*-auth-token (server-set = isento do cap de 7 dias).
  - Deixar >7 dias sem uso (ou simular apagando o cookie via Storage no Web Inspector e reabrindo com refresh token ainda válido) e reabrir → deve continuar logado, sem cair em /?auth=login.
files_changed:
  - app/api/auth/keepalive/route.ts (novo)
  - components/pwa/session-keepalive.tsx (novo)
  - app/(app)/layout.tsx (import + <SessionKeepalive /> nas 2 branches)
  - tests/unit/pwa/session-keepalive.test.ts (novo)
