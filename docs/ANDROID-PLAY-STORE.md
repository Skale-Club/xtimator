# Xtimator no Google Play (TWA) — handoff

Status em 2026-11-05. Documento para continuar o trabalho em outro computador.

## Onde estamos

| Item | Estado |
|---|---|
| Conta Google Play Console | ✅ Organização **SKALE CLUB LLC**, dona `skale.club@gmail.com`, Account ID `9003252933054961379`. Tudo verificado (site, trader, identidade/LLC, telefones). Botão **Create app** liberado. |
| App no Console | ✅ Criado (app id `4972530910854739329`). Release `2 (2)` publicada no **teste interno** em 2026-11-05 |
| Rota `/.well-known/assetlinks.json` | ✅ Com os dois fingerprints (app signing `AC:DE:D8…C0:5C` + upload `6F:3B:D5…E3:D2`) neste branch; ainda **não** em produção |
| Projeto Android (TWA) / `.aab` | ✅ Gerado em `~/Dev/xtimator-android` (fora de git), `versionCode 2`, `minSdkVersion 24` |
| Chave de upload (keystore) | ✅ `~/.android-keys/xtimator-upload.jks`, alias `upload` (fazer backup + senha no cofre) |

**Pegadinhas encontradas no Windows:**
- `minSdkVersion` do template do Bubblewrap é 21, mas `androidbrowserhelper` 2.7.4 exige 24 — subir para 24 em `twa-manifest.json` (o build regenera o `build.gradle`).
- Se `NoDefaultCurrentDirectoryInExePath=1` estiver no ambiente (shell do Claude Desktop), o `cmd` não acha `gradlew.bat`. Rodar o build com `$env:NoDefaultCurrentDirectoryInExePath = ''; bubblewrap build`.
- A pasta da keystore precisa existir antes do `bubblewrap init`, senão o `keytool` falha e **imprime as senhas** no erro.

**Abordagem:** Trusted Web Activity via [Bubblewrap](https://github.com/GoogleChromeLabs/bubblewrap). O app Android é só uma casca que abre `https://xtimator.com` em tela cheia pelo Chrome; todo deploy web atualiza o app sem nova versão na loja. Microfone, câmera e push continuam funcionando (é o Chrome).

## Decisões já tomadas

- **Package name:** `com.xtimator.app` — permanente depois de publicado. Definido em `lib/pwa/android-twa.ts`.
- **Host:** `xtimator.com` (sem `www`; o proxy redireciona `www` → apex).
- **Cobrança:** continua via Stripe. Revisar a política de pagamentos do Play antes de publicar (ver "Antes de produção").
- **Keystore fora do git.** Nunca commitar `.jks`/`.keystore` nem senhas (o pre-commit `gitleaks` não pega keystore binário — atenção manual).

## O que este branch contém

- `lib/pwa/android-twa.ts` — `ANDROID_TWA_PACKAGE_NAME` e `ANDROID_TWA_SHA256_FINGERPRINTS` (lista vazia por enquanto) + `buildAssetLinks()`; fingerprints inválidos são descartados.
- `app/.well-known/assetlinks.json/route.ts` — serve o JSON público, `cache-control: public, max-age=3600`. `/.well-known/*` não é rota protegida no `proxy.ts`.
- `tests/unit/pwa/android-twa.test.ts` — 4 testes (`npx vitest run tests/unit/pwa/android-twa.test.ts`).

## Passo a passo no outro PC

### 1. Pré-requisitos

- Node 18+ e git; ~3 GB livres em disco.
- `git fetch && git switch feat/android-twa-assetlinks` no repo do Xtimator.
- Bubblewrap: `npm i -g @bubblewrap/cli`
- Na primeira execução o Bubblewrap oferece baixar **JDK 17** e **Android SDK** sozinho para `~/.bubblewrap` — aceite (inclui aceitar a licença do Android SDK). Alternativa: apontar para instalações existentes com `bubblewrap updateConfig --jdkPath <path> --androidSdkPath <path>`.
- `bubblewrap doctor` deve terminar sem erros.

### 2. Gerar o projeto Android

Fora do repo do Xtimator (ex.: `~/Dev/xtimator-android/`), para o projeto Gradle e a keystore não irem para este repo:

```bash
mkdir ~/Dev/xtimator-android && cd ~/Dev/xtimator-android
bubblewrap init --manifest https://xtimator.com/manifest.webmanifest
```

Respostas para o assistente:

| Pergunta | Resposta |
|---|---|
| Domain | `xtimator.com` |
| URL path | `/` |
| Application name | `Xtimator` |
| Short name | `Xtimator` |
| Application ID (package) | `com.xtimator.app` |
| Starting version code | `1` |
| Display mode | `standalone` |
| Orientation | `portrait` (ou `default` se quiser permitir paisagem) |
| Status bar color | `#406EF1` |
| Splash screen color | `#0a0a0f` |
| Icon URL | `https://xtimator.com/icons/icon-maskable-512.png` se o `/icon` não for aceito (precisa ser PNG 512×512) |
| Maskable icon URL | `https://xtimator.com/icons/icon-maskable-512.png` |
| Monochrome icon | deixar vazio |
| Play Billing | **No** |
| Location delegation | No |
| Notification delegation | **Yes** (o Xtimator usa web push) |
| Key store location | **fora de qualquer repo**, ex.: `~/.android-keys/xtimator-upload.jks` |
| Key name (alias) | `upload` |
| Senhas | gerar fortes e salvar no gerenciador de senhas **antes** de seguir |

Se o projeto Android for versionado, criar um repo próprio (ex.: `skale-club/xtimator-android`) com `.gitignore` contendo `*.jks`, `*.keystore`, `*.aab`, `*.apk`, `build/`, `.gradle/`.

### 3. Build

```bash
bubblewrap build
```

Gera `app-release-bundle.aab` (para o Play) e `app-release-signed.apk` (para instalar direto num Android de teste). Para builds não interativos: `BUBBLEWRAP_KEYSTORE_PASSWORD` e `BUBBLEWRAP_KEY_PASSWORD` como variáveis de ambiente.

Fingerprint SHA-256 da chave de upload (anotar):

```bash
keytool -list -v -keystore ~/.android-keys/xtimator-upload.jks -alias upload
```

**Backup da keystore + senhas** no gerenciador de senhas / cofre. Com Play App Signing, perder a chave de upload é recuperável (Google permite reset), mas dá trabalho.

### 4. Criar o app no Play Console

Play Console → **Create app**: nome `Xtimator`, idioma padrão English (US), **App**, **Free**, aceitar declarações (Developer Program Policies, US export laws).

Depois: **Test and release → Testing → Internal testing → Create new release**, subir o `.aab`. Aceitar **Play App Signing** (padrão).

### 5. Ligar o domínio ao app (assetlinks)

1. Play Console → **Test and release → App integrity → App signing**: copiar o SHA-256 da **App signing key certificate** e da **Upload key certificate**.
2. Colar os dois em `ANDROID_TWA_SHA256_FINGERPRINTS` (`lib/pwa/android-twa.ts`), formato `AA:BB:…` (32 pares).
3. Rodar o teste, abrir PR para `main`, deploy (GitHub Actions → GHCR → Coolify).
4. Conferir em produção:
   ```bash
   curl -s https://xtimator.com/.well-known/assetlinks.json
   ```
   e no validador do Google: `https://digitalassetlinks.googleapis.com/v1/statements:list?source.web.site=https://xtimator.com&relation=delegate_permission/common.handle_all_urls`
5. Instalar pelo link do teste interno num Android: se abrir **sem barra de URL**, o vínculo funcionou. Com barra = fingerprint errado/ausente.

### 6. Ficha da loja (Grow → Store presence → Main store listing)

- Nome (≤30), descrição curta (≤80), descrição completa (≤4000)
- Ícone 512×512 PNG; feature graphic 1024×500
- Screenshots de celular (mín. 2, recomendado 4–8, 9:16)
- Política de privacidade (URL pública)
- **App content:** Data Safety (áudio, fotos, e-mail, dados de clientes, pagamento via Stripe), classificação etária, público-alvo (18+ / negócios), anúncios = não, acesso ao app (**fornecer conta de demo** para o revisor — o app exige login)

### 7. Antes de produção

- **Política de pagamentos:** assinaturas Free/Trial/Pro/Business são cobradas via Stripe dentro do app. Confirmar se o caso se enquadra nas regras atuais do Play para os EUA (pagamento alternativo / link externo) ou se é preciso esconder upgrade/checkout na TWA. Decidir antes do envio para produção.
- **Exclusão de conta:** já existe (`deleteAccount()` em `lib/actions/settings.ts`); o Play exige também uma URL web de exclusão de conta na ficha.
- **Offline:** o app remove service workers de cache a cada carga (só o `push-sw.js` fica). Sem tela offline web; a TWA mostra o fallback nativo do Chrome. Não bloqueia publicação.
- Conta de organização **não** tem a regra de 12 testadores / 14 dias: dá para promover de teste interno para produção direto após revisão.

## Checklist rápido

- [ ] Bubblewrap + JDK 17 + Android SDK (`bubblewrap doctor` ok)
- [ ] `bubblewrap init` com as respostas acima
- [ ] Keystore criada fora do repo + backup das senhas
- [ ] `bubblewrap build` → `.aab`
- [ ] App criado no Play Console + `.aab` no teste interno
- [ ] Fingerprints (app signing + upload) em `lib/pwa/android-twa.ts` → PR → deploy
- [ ] `assetlinks.json` validado; app abre sem barra de URL
- [ ] Ficha da loja + App content + conta de demo
- [ ] Decisão sobre Stripe vs política de pagamentos do Play
- [ ] Enviar para produção
