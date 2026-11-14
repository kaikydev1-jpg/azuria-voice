# Visual novo, Ignis e Matsu OS — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Azúria Voice com visual novo (sem mudar funções), o Ignis como opção de placa de vídeo (instalação e Configurações), botões de janela no estilo de cada Linux com o estilo Matsu automático, bandeja em todos os sistemas e download próprio do Matsu OS.

**Architecture:** Visual pelos tokens de tema (`t3-theme.css`/`globals.css`), moldura e primitivos `components/ui`, sem mexer na lógica das telas. Ignis pelo backend Python via HTTP local (`127.0.0.1`), num cliente único usado pelo provedor de LLM, pelo motor `ignis` e por um router `/ignis/*`. Janela: o processo principal descobre sistema/estilo e o renderer desenha os botões no Linux; Windows e macOS seguem nativos.

**Tech Stack:** Electron 44, React + Tailwind 4 + shadcn, Vitest; FastAPI + pytest; electron-builder 26; bash.

**Spec:** `docs/superpowers/specs/2026-11-14-visual-ignis-matsu-design.md`

## Global Constraints

- Nenhuma função muda de lugar ou de comportamento, exceto as pedidas (bandeja, Ignis, botões no Linux).
- Todo texto novo via i18n em `electron/src/renderer/src/i18n/locales/*.json`; `bun run --cwd electron locale:check` e `tests/test_locale_parity.py` verdes. Português do Brasil revisado; demais idiomas podem levar o inglês.
- Sem CJK fixo fora do i18n (`tests/test_no_hardcoded_cjk.py`).
- Movimento: 80 / 150 / 250 / 350 / 500 ms; `cubic-bezier(0.22, 1, 0.36, 1)` e `cubic-bezier(0.34, 1.36, 0.64, 1)`; respeitar `prefers-reduced-motion` e `prefers-reduced-transparency`.
- Sem violeta, sem animação ao rolar, sem `motion`/`gsap`/`three` novos; nenhum código copiado de React Bits ou transitions.dev.
- Matsu: 12 px, 8 px de espaço, 14 px de margem; `#ff5f57` `#febc2e` `#28c840`; símbolos 1,35 px `#4d0000` `#995700` `#006500` só com o mouse no grupo; apertado `brightness(0.82)`; sem foco `#59545d` (escuro) / `#c9c9cf` (claro).
- Ignis: porta padrão `11470`; `config.json` em `%APPDATA%\ignis\`, `~/.config/ignis/`, `~/.var/app/io.github.kaikydev1jpg.Ignis/config/ignis/`; só `127.0.0.1`.
- Mudou tema → `bun scripts/export-mobile-tokens.ts`; mudou rota → `uv run python scripts/export_openapi.py` e `tests/fixtures/api_routes.txt`; `tests/test_mobile_contract.py` verde.
- Sem bump de versão nem publicação; tudo em `## [Unreleased]` do `CHANGELOG.md` (estilo de `tests/test_changelog_style.py`).
- Commits sem trailers de agente (regra de identidade do `CLAUDE.md`).

## Review Focus

1. Ignis fecha no meio do uso com o interruptor ligado → a geração falha rápido com "Abra o Ignis", sem travar 2 minutos (teste em B3).
2. Ignis com porta trocada ou instalado em Flatpak → a porta certa é lida do `config.json` (teste em B1).
3. A voz clonada muda de áudio de referência → o Ignis recebe a voz nova (nome com hash do conteúdo), não usa a antiga (teste em B3).
4. Linux sem `gsettings`/desktop desconhecido/Wayland → layout `menu:minimize,maximize,close`, sempre com fechar (teste em C1).
5. GNOME sem AppIndicator e fechar-para-bandeja → abrir o app de novo traz a janela (teste em C5).

---

## Fase A — Visual

### Task A1: Tokens do tema "Azúria 2"

**Files:**
- Modify: `electron/src/renderer/src/styles/t3-theme.css` (bloco `:root` e `@variant dark`)
- Modify: `electron/src/renderer/src/styles/globals.css` (`:root`, utilitários)
- Regenerate: saídas de `scripts/export-mobile-tokens.ts`
- Test: `electron/src/renderer/src/styles/theme-tokens.test.ts` (novo)

**Interfaces:**
- Produces: variáveis CSS `--dur-micro|fast|base|medium|slow`, `--ease-out`, `--ease-spring`, `--shadow-card`, `--shadow-pop`, `--canvas-glow`, `--accent-text`; utilitários `transition-ui` e `lift-on-hover`.

- [ ] **Step 1: Teste** `theme-tokens.test.ts` lê os dois CSS como texto e afirma: `--dur-fast: 150ms`, `--ease-out: cubic-bezier(0.22, 1, 0.36, 1)`, `--ease-spring: cubic-bezier(0.34, 1.36, 0.64, 1)`, `--radius: 0.75rem`, dark `--background: #070b14`, light `--background: #f5f7fa`, primário `#2563eb` nos dois, e que o bloco `prefers-reduced-motion` existe.
- [ ] **Step 2:** `bun run --cwd electron vitest --run src/renderer/src/styles/theme-tokens.test.ts` → FAIL.
- [ ] **Step 3: Valores.** Escuro: canvas `#070b14`, chrome/sidebar `#0a101c`, card `#0e1524`, popover `#111a2c`, texto `#e6ebf2`, texto apagado `#8d9ab0`, borda `rgb(203 213 225 / 10%)`, campo `rgb(203 213 225 / 14%)`, hover `rgb(255 255 255 / 5%)`, foco/`--accent-text` `#60a5fa`. Claro: canvas `#f5f7fa`, sidebar `#eef2f7`, card `#ffffff`, texto `#0b1220`, apagado `#5b6779`, borda `#e2e8f0`, campo `#cbd5e1`, `--accent-text` `#1d4ed8`. `--canvas-glow`: radial azul `rgb(37 99 235 / 12%)` no topo esquerdo (escuro) e `/ 8%` (claro), aplicado em `.app-surface`. `lift-on-hover`: `translateY(-2px)` + `--shadow-pop` em `--dur-fast` `--ease-out`.
- [ ] **Step 4:** teste PASS; `bun scripts/export-mobile-tokens.ts`; `uv run pytest tests/test_mobile_contract.py -q` PASS.
- [ ] **Step 5: Commit** `Visual: tokens do tema Azúria 2`.

### Task A2: Primitivos

**Files:**
- Modify: `electron/src/renderer/src/components/ui/{button,card,input,textarea,select,tabs,switch,dialog,badge,tooltip,toggle-group,slider}.tsx`
- Test: `electron/src/renderer/src/components/ui/button.test.tsx` (novo)

**Interfaces:**
- Consumes: tokens de A1. Produces: mesmas props e variantes de hoje (nada removido ou renomeado).

- [ ] **Step 1: Teste**: `Button` `variant="default"` tem `rounded-full` e `transition-ui`; `active:` aplica escala `0.98`; `variant="outline"` mantém `border`; `disabled` mantém `disabled:opacity-50`.
- [ ] **Step 2:** rodar → FAIL.
- [ ] **Step 3:** botão principal em pílula; secundário/contorno com cantos `rounded-lg`; campos `rounded-lg` com foco `ring` em `--accent-text`; cartão `rounded-xl` com `--shadow-card` e borda fina; diálogo entra com escala `0.96→1` em `--dur-base` `--ease-spring`; tooltip/popover em `surface-glass`.
- [ ] **Step 4:** `bun run --cwd electron test` → PASS (todos os testes existentes de UI).
- [ ] **Step 5: Commit** `Visual: componentes base`.

### Task A3: Moldura (barra lateral, cabeçalhos, rodapé)

**Files:**
- Modify: `electron/src/renderer/src/components/app-shell/{workspace-sidebar,workspace-rail,workspace-header,status-bar,account-corner,sponsor-footer}.tsx`, `workspace-menu.css`, `sponsor-footer.css`
- Modify: `electron/src/renderer/src/components/workspace-pane.tsx`

- [ ] **Step 1:** rodar `electron/tests/workspace-shell-smoke.mjs` e `route-layout-smoke.mjs` contra o app atual (backend CPU + `dev:web`) e guardar a saída.
- [ ] **Step 2:** item ativo da barra lateral em pílula com fundo `--accent`, ícone e texto `--foreground`; inativos em `--muted-foreground`; cabeçalhos de seção em caixa normal (não maiúsculas); títulos de página `text-[15px] font-semibold tracking-tight`; rodapé com divisória fina.
- [ ] **Step 3:** smokes do Step 1 passam iguais (larguras 48 px / ≥ 220 px mantidas); `bun run --cwd electron test` PASS.
- [ ] **Step 4:** prints escuro/claro de `/`, `/clone`, `/dub`, `/settings` em `docs/assets/azuria-2/` (deviceScaleFactor 2).
- [ ] **Step 5: Commit** `Visual: moldura`.

### Task A4: Início e destaques

**Files:**
- Modify: `electron/src/renderer/src/features/home/{home-page.tsx,home-page.css}`
- Create: `electron/src/renderer/src/hooks/use-spotlight.ts`
- Test: `electron/src/renderer/src/hooks/use-spotlight.test.ts`

**Interfaces:**
- Produces: `useSpotlight<T extends HTMLElement>(): React.RefCallback<T>` — grava `--spot-x`/`--spot-y` no elemento em `pointermove` (com `requestAnimationFrame`), não faz nada com `prefers-reduced-motion: reduce`.

- [ ] **Step 1: Teste**: após `pointermove` em (30, 40) num elemento em (0, 0), `--spot-x` = `30px` e `--spot-y` = `40px`; com `matchMedia('(prefers-reduced-motion: reduce)').matches = true`, nenhuma variável é escrita.
- [ ] **Step 2:** rodar → FAIL.
- [ ] **Step 3:** implementar; nos cartões de ação do início, `lift-on-hover` + gradiente radial em `var(--spot-x) var(--spot-y)`; título de boas-vindas com entrada única (opacidade + 6 px, `--dur-slow`) e brilho discreto uma vez; nenhum item novo, removido ou reordenado.
- [ ] **Step 4:** teste + `home-page.test.tsx` PASS.
- [ ] **Step 5: Commit** `Visual: tela inicial`.

### Task A5: Assistente da primeira execução e tela de espera do backend

**Files:**
- Modify: `electron/src/renderer/src/components/{setup-gate,backend-gate,setup-recovery}.tsx`

- [ ] **Step 1:** passos em trilha lateral com número em círculo; conteúdo em cartão; botões finais pílula; mesmos passos, textos e ordem.
- [ ] **Step 2:** `electron/tests/setup-gate-smoke.mjs` e `backend-gate.test.tsx` PASS.
- [ ] **Step 3: Commit** `Visual: assistente`.

### Task A6: Docs do visual

**Files:** `docs/branding.md` (seção "Sistema visual Azúria 2" com tokens, escala de tempo e regra de não copiar React Bits/transitions.dev), `CHANGELOG.md` (`## [Unreleased]`), `docs/AZURIA.md` (prints).

- [ ] **Step 1:** escrever; `uv run pytest tests/test_changelog_style.py -q` PASS.
- [ ] **Step 2: Commit** `Docs: sistema visual Azúria 2`.

---

## Fase B — Ignis

### Task B1: Cliente do Ignis

**Files:**
- Create: `backend/services/ignis_client.py`
- Test: `tests/backend/services/test_ignis_client.py` (servidor falso em `http.server` numa thread)

**Interfaces:**
- Produces:
  - `discover_base_url(env: Mapping[str, str] = os.environ, home: Path | None = None) -> str` — `IGNIS_BASE_URL` > `porta` do primeiro `config.json` existente (Windows `%APPDATA%`, Linux `~/.config`, Flatpak) > `http://127.0.0.1:11470`. Recusa host que não seja loopback.
  - `class IgnisError(Exception)` com `status: int`, `code: str`, `message: str`.
  - `class IgnisClient(base_url: str | None = None, timeout: float = 5.0)` com `version() -> dict | None` (None = fechado), `models() -> list[str]`, `state() -> dict`, `audio_plan() -> dict`, `prepare(families: list[str]) -> dict`, `voices() -> list[str]`, `register_voice(name: str, ref_text: str, wav: bytes) -> None`, `speech(text: str, *, voice: str | None, language: str | None, seed: int | None, timeout: float) -> bytes` (WAV).
  - Erros OpenAI `{"error": {"message","code"}}` viram `IgnisError`; conexão recusada vira `IgnisError(0, "ignis_fechado", …)`.

- [ ] **Step 1: Testes**: `test_discover_reads_port_from_linux_config` (`{"porta": 12000}` → `http://127.0.0.1:12000`), `test_discover_flatpak_config`, `test_discover_rejects_remote_env` (`IGNIS_BASE_URL=http://example.com` → padrão), `test_version_none_when_closed`, `test_speech_returns_wav`, `test_503_maps_to_audio_nao_preparado`, `test_register_voice_sends_base64`.
- [ ] **Step 2:** `uv run pytest tests/backend/services/test_ignis_client.py -q` → FAIL.
- [ ] **Step 3:** implementar com `urllib.request` (sem dependência nova).
- [ ] **Step 4:** PASS.
- [ ] **Step 5: Commit** `Ignis: cliente local`.

### Task B2: Provedor de LLM `ignis`

**Files:**
- Modify: `backend/services/llm_providers.py` (entrada após `lmstudio`), `backend/services/llm_transport.py` ou o ponto onde o corpo do pedido é montado (para `chat_template_kwargs.enable_thinking=false` quando o provedor é `ignis`)
- Test: `tests/backend/services/test_llm_provider_ignis.py`

**Interfaces:**
- Consumes: `discover_base_url()` (B1). Produces: `Provider("ignis", "Ignis (local)", <descoberto>, "default", local=True, key_envs=("IGNIS_API_KEY",), base_url_env="IGNIS_BASE_URL", model_env="IGNIS_MODEL", signup_url="https://github.com/kaikydev1-jpg/Ignis/releases/latest", notes="Fully offline. Uses your AMD, NVIDIA or Intel GPU through Ignis.")`.

- [ ] **Step 1: Testes**: o catálogo lista `ignis` com `local=True` e modelo `default`; a URL segue `config.json` com porta trocada; o corpo enviado ao `ignis` leva `chat_template_kwargs: {"enable_thinking": false}` e o dos outros provedores não.
- [ ] **Step 2:** FAIL → implementar → PASS; `uv run pytest tests -q -k "llm_provider"` PASS.
- [ ] **Step 3: Commit** `Ignis: provedor de linguagem`.

### Task B3: Motor de voz `ignis`

**Files:**
- Create: `backend/engines/ignis/__init__.py`
- Modify: `backend/services/tts_backend.py` (`_LAZY_REGISTRY`, dica de instalação, mapa de docs e demais tabelas onde `audiocpp` aparece), `docs/licensing/model-license-data.json`, `docs/features.yaml`, `docs/feature-catalog.md`, `docs/engine-acceptance.md`
- Create: `docs/engines/ignis.md`
- Test: `tests/backend/services/test_ignis_backend.py`

**Interfaces:**
- Consumes: `IgnisClient`, `IgnisError` (B1).
- Produces: `class IgnisTTSBackend(TTSBackend)`: `id = "ignis"`, `display_name = "Ignis · OmniVoice na placa (AMD, NVIDIA, Intel; voz CC BY-NC 4.0, não comercial)"`, `gpu_compat = ("cpu",)` (a placa é do Ignis, não do PyTorch), `runs_out_of_process = True`, `is_available()` (True só se `version()` responde e `"omnivoice"` está em `models()`), `generate(text, **kw) -> torch.Tensor` (24 kHz), `sample_rate`, `supported_languages`, `unload()` (`POST /motor/audio/descarregar`). Nome da voz: `azuria-` + 16 hex do SHA-256 do WAV de referência; registra só se não estiver em `voices()`.

- [ ] **Step 1: Testes**: `test_unavailable_without_omnivoice`; `test_clone_registers_once` (duas gerações com o mesmo `ref_audio` → um único `POST /v1/audio/voices`); `test_changed_reference_registers_new_voice`; `test_closed_mid_session_fails_fast` (servidor parado → `IgnisError`/`TTSInputError` com "Abra o Ignis" em < 5 s); `test_503_message_tells_to_prepare`; `test_502_retries_once`.
- [ ] **Step 2:** FAIL → implementar (WAV → tensor com `soundfile`) → PASS.
- [ ] **Step 3:** `uv run pytest tests/backend/api/test_engines_route_shape.py tests/test_engine_install_capability.py tests/test_engine_language_options.py tests/test_engine_disk_usage.py -q` PASS (registrar o motor em cada tabela que esses testes exigem).
- [ ] **Step 4: Commit** `Ignis: motor de voz na placa`.

### Task B4: Rotas `/ignis/*`

**Files:**
- Create: `backend/api/routers/ignis.py`; Modify: `backend/main.py` (incluir router), `tests/fixtures/api_routes.txt`; Regenerate: OpenAPI móvel
- Test: `tests/backend/api/test_ignis_routes.py`

**Interfaces:**
- Produces:
  - `GET /ignis/status` → `{"open": bool, "enabled": bool, "version": str|None, "gpu": str|None, "voice": {"ready": bool, "backend": str|None}, "transcription": {"ready": bool}, "download_url": str, "platform_supported": bool}` (`platform_supported=False` no macOS).
  - `POST /ignis/enable` → guarda as escolhas atuais (`ignis.previous` no `settings_store`: provedor LLM ativo, motor TTS, motor ASR, URL/modelo do ASR compatível) e aplica: LLM `ignis`, TTS `ignis`, ASR compatível com `{base}/v1` + `whisper-1`; responde o status. `409` se o Ignis está fechado.
  - `POST /ignis/disable` → restaura `ignis.previous`.
  - `POST /ignis/prepare` `{"families": ["voz","transcricao"]}` → repassa a `/motor/audio/preparar`.
  - Todas com o mesmo guarda de loopback/admin das rotas de `settings.py`.

- [ ] **Step 1: Testes**: enable→disable devolve exatamente as escolhas anteriores; enable com Ignis fechado → 409 sem mudar nada; status no macOS → `platform_supported=False`.
- [ ] **Step 2:** FAIL → implementar → PASS; `uv run python scripts/export_openapi.py`; `uv run pytest tests/test_mobile_contract.py tests/test_api_routes*.py -q` PASS.
- [ ] **Step 3: Commit** `Ignis: rotas de estado, ligar e preparar`.

### Task B5: Telas do Ignis

**Files:**
- Create: `electron/src/renderer/src/features/settings/ignis-settings.tsx` + `.test.tsx`
- Modify: `features/settings/performance-settings.tsx` (cartão no topo), `features/settings/asr-openai-compat-settings.tsx` (botão "Usar o Ignis"), `components/setup-gate.tsx` (cartão na etapa `setup.system_check`), `i18n/locales/*.json`

**Interfaces:**
- Consumes: rotas B4. Produces: `IgnisCard({ variant }: { variant: 'setup' | 'settings' })`, query key `['ignis-status']`.

- [ ] **Step 1: Testes** (`ignis-settings.test.tsx`, fetch simulado): fechado → mostra "Abra o Ignis" e link `download_url`, sem interruptor; aberto → interruptor desligado, nome da placa; ligar → `POST /ignis/enable` e invalida `engines`/`llm-providers`; voz não preparada → botão "Preparar no Ignis" abre confirmação com tamanho e licença CC BY-NC 4.0; `platform_supported=false` → texto "O Ignis ainda não tem versão para macOS", sem link. ASR: clicar "Usar o Ignis" preenche `http://127.0.0.1:<porta>/v1` e `whisper-1`.
- [ ] **Step 2:** FAIL → implementar → PASS; `bun run --cwd electron locale:check` PASS.
- [ ] **Step 3: Commit** `Ignis: opção na instalação e nas Configurações`.

### Task B6: Docs do Ignis

**Files:** `docs/engines/ignis.md` (completar), `docs/engines/README.md`, `README.md` (linha na tabela de motores), `docs/AZURIA.md`, `CHANGELOG.md`.

- [ ] **Step 1:** escrever (o que vai pela placa, o que não vai — música e efeitos —, licença, como preparar); `uv run pytest tests/test_changelog_style.py -q` PASS.
- [ ] **Step 2: Commit** `Docs: Ignis`.

---

## Fase C — Linux, Matsu OS e bandeja

### Task C1: Sistema e estilo dos botões

**Files:**
- Create: `electron/src/main/window-chrome.ts` + `window-chrome.test.ts`

**Interfaces:**
- Produces:
  - `type WindowButton = 'close' | 'minimize' | 'maximize'`; `type ChromeStyle = 'windows' | 'gnome' | 'kde' | 'mac' | 'matsu'`; `type ChromePreference = 'auto' | 'windows' | 'gnome' | 'kde' | 'mac'`.
  - `interface DesktopInfo { os: 'windows' | 'linux' | 'mac'; layout?: string; theme?: string; desktop?: string; matsu: boolean }`
  - `interface WindowChrome { style: ChromeStyle; left: WindowButton[]; right: WindowButton[]; native: boolean }` (`native` = Windows com estilo windows ou macOS: sem botões desenhados).
  - `parseLayout(layout: string): { left: WindowButton[]; right: WindowButton[] }`
  - `isMatsuOsRelease(text: string): boolean`; `readOsRelease(read?: (p: string) => string): string | null` (ordem `/run/host/os-release`, `/etc/os-release`, `/usr/lib/os-release`).
  - `readDesktopInfo(platform, run?: (cmd, args) => string | null, read?): DesktopInfo` — layout por `gsettings get org.gnome.desktop.wm.preferences button-layout`, depois `~/.config/gtk-3.0/settings.ini` (`gtk-decoration-layout`), depois `~/.config/kwinrc` (`ButtonsOnLeft`/`ButtonsOnRight`, letras `X`=close `I`=minimize `A`=maximize); tema por `gsettings get org.gnome.desktop.interface gtk-theme`; `XDG_CURRENT_DESKTOP`.
  - `chooseWindowChrome(info: DesktopInfo, preferred: ChromePreference): WindowChrome` — mesma regra de `escolher()` em `kaikydev1-jpg/Ignis` `crates/ignis-core/src/janela.rs` (padrão GTK `menu:minimize,maximize,close`; Windows `:minimize,maximize,close`; Mac `close,minimize,maximize:`; temas WhiteSur/Mojave/… → mac; Pantheon → gnome; sem botões → só fechar).

- [ ] **Step 1: Testes** — portar os casos de `janela.rs` (Windows sempre à direita; GNOME `appmenu:close` → gnome só fechar; `close,minimize,maximize:` → mac à esquerda; tema WhiteSur → mac; KDE → kde; Matsu com e sem layout → matsu; preferência manual) e mais: `isMatsuOsRelease('NAME="Matsu 27 OS"')` true, `'ID=matsu_os'` true, `'NAME=Fedora'` false; `/run/host/os-release` tem prioridade; `readDesktopInfo` com `run` sempre `null` e sem arquivos → layout padrão GTK e `right` contém `close`; kwinrc `ButtonsOnLeft=XIA` → `close,minimize,maximize`.
- [ ] **Step 2:** `bun run --cwd electron vitest --run src/main/window-chrome.test.ts` → FAIL → implementar → PASS.
- [ ] **Step 3: Commit** `Linux: sistema e estilo dos botões da janela`.

### Task C2: Janela, IPC e preferência

**Files:**
- Modify: `electron/src/main/index.ts` (`createWindow`), `electron/src/main/ipc.ts` (canais), `electron/src/preload/index.ts`, `electron/src/preload/index.d.ts`, `electron/CONTRACT.md`
- Create: `electron/src/main/window-chrome-settings.ts` + test (JSON `window-chrome.json` em `userData`, gravação atômica como `shortcut-settings.ts`)

**Interfaces:**
- Consumes: C1.
- Produces: IPC `window:chrome` (invoke → `WindowChrome`), `window:setChromePreference` (invoke `(pref: ChromePreference) => { restartRequired: boolean }`), evento `window:focused` (boolean). Bridge: `window.chrome(): Promise<WindowChrome>`, `window.setChromePreference(pref)`, `window.onFocusChange(cb: (focused: boolean) => void): () => void`.
- `createWindow`: macOS como hoje; Windows com `chrome.native` → `titleBarOverlay` como hoje, senão sem overlay; Linux sempre sem overlay (`titleBarStyle: 'hidden'`), `minWidth`/`minHeight` iguais.

- [ ] **Step 1: Testes**: preferência inválida no arquivo → `auto`; trocar para `mac` no Windows → `restartRequired: true`; no Linux → `false` (renderer redesenha); evento de foco é enviado em `focus`/`blur`.
- [ ] **Step 2:** FAIL → implementar → PASS; `bun run --cwd electron typecheck` PASS.
- [ ] **Step 3: Commit** `Janela: barra integrada no Linux e preferência de estilo`.

### Task C3: Botões desenhados no renderer

**Files:**
- Create: `electron/src/renderer/src/components/app-shell/window-controls.tsx`, `window-controls.css`, `window-controls.test.tsx`
- Modify: `app-shell.tsx` (montar o componente), `account-corner.tsx` e `styles/globals.css` (trocar `148px` fixo por `var(--window-controls-right, 148px)`; `--window-controls-left` no topo da barra lateral), `workspace-sidebar.tsx`, `backend-gate.tsx`, `setup-gate.tsx` (espaço à esquerda quando há botões à esquerda)

**Interfaces:**
- Consumes: bridge C2. Produces: `WindowControls()` — não renderiza nada quando `chrome.native`; grava `data-window-chrome=<style>` e `data-window-inactive` no `<html>` e as larguras em `--window-controls-left/right`.
- Desenhos: Matsu/Mac conforme Global Constraints (SVGs de `Ignis app/ui/app.js` `ICONES_JANELA.mac`); GNOME círculos 24 px com ícone 16 px; KDE Breeze; Windows 46 px com fechar `#C42B1C`/X branco. Maximizar vira restaurar quando maximizada.
- Duplo clique na faixa `.workspace-titlebar`/barra lateral → `toggleMaximize()` (só onde o sistema não faz sozinho; conferir no Linux X11 e Wayland).

- [ ] **Step 1: Testes**: matsu com foco → três bolinhas nas cores exatas e SVGs com `opacity: 0`; `:hover` no grupo → símbolos visíveis; sem foco → `data-window-inactive` e cor `#59545d` no escuro / `#c9c9cf` no claro; layout `close,minimize,maximize:` → grupo à esquerda na ordem; GNOME `appmenu:close` → só fechar; clicar em cada um chama `minimize`/`toggleMaximize`/`close`; `native: true` → nada renderizado e variáveis removidas.
- [ ] **Step 2:** FAIL → implementar → PASS; smokes de A3 PASS.
- [ ] **Step 3:** print das bolinhas nos três estados, temas escuro e claro, para comparar com os prints do dono.
- [ ] **Step 4: Commit** `Linux: botões da janela no estilo do sistema e do Matsu OS`.

### Task C4: Preferência na Aparência

**Files:** `features/settings/settings-page.tsx` (seção Aparência), `i18n/locales/*.json`, test em `settings-extra.test.ts` ou novo.

- [ ] **Step 1: Teste**: select "Estilo dos botões da janela" com Automático, Windows, GNOME, KDE, Mac; não aparece no macOS; escolher no Windows mostra "Vale ao reabrir o Azúria Voice".
- [ ] **Step 2:** FAIL → implementar → PASS.
- [ ] **Step 3: Commit** `Configurações: estilo dos botões da janela`.

### Task C5: Bandeja em todos os sistemas

**Files:**
- Create: `electron/src/main/close-policy.ts` + test (decisão pura: `closeAction({ quitting, closeToTray, platform }) => 'hide-to-tray' | 'quit' | 'allow'`)
- Modify: `electron/src/main/index.ts` (`win.on('close')`, `win.on('closed')`, `window-all-closed`, `second-instance`), configuração `closeToTray` no mesmo JSON de C2 (padrão `true`), aviso de primeira vez (notificação do sistema, texto i18n vindo do renderer como os rótulos da bandeja), `features/settings` (interruptor "Ao fechar, manter na bandeja")

**Interfaces:**
- Produces: IPC `app:setCloseToTray(boolean)`, `app:getCloseToTray()`.
- Ao esconder: grava a persistência do renderer, destrói a janela (libera memória), backend e atalho de ditado continuam; ícone/abrir de novo → `createWindow()`; "Sair" → `beginOrderlyQuit()`.

- [ ] **Step 1: Testes**: Windows/Linux/macOS com `closeToTray=true` → `hide-to-tray`; `false` no Windows/Linux → `quit`; `quitting=true` → `allow`; `second-instance` sem janela → cria e mostra.
- [ ] **Step 2:** FAIL → implementar → PASS; `blank-window-guard.test.ts`, `window-safety.test.ts` PASS.
- [ ] **Step 3: Commit** `Bandeja: fechar a janela mantém o Azúria ligado em todos os sistemas`.

### Task C6: Download e instalação no Matsu OS

**Files:**
- Create: `scripts/instalar.sh` (com `--simular`); test `tests/test_instalar_sh.py` (roda o script com `--simular` e `os-release` falso via `AZURIA_OS_RELEASE`)
- Modify: `scripts/prepare_electron_release.py` (com alvo `linux-x64`: copia o AppImage para `Azuria-Voice-Matsu-OS-x64.AppImage` e `scripts/instalar.sh` para os assets antes do `SHA256SUMS.txt`), `scripts/check_electron_release_assets.py` (aceitar os dois nomes), `tests/test_electron_release_assets.py`, `README.md`, `docs/AZURIA.md`, `docs/install/linux.md` (seção Matsu OS), `CHANGELOG.md`

**Interfaces:**
- `instalar.sh`: Matsu OS ou Fedora Atomic (`/run/ostree-booted`) → baixa `releases/latest/download/Azuria-Voice-Matsu-OS-x64.AppImage`, confere no `SHA256SUMS.txt`, instala em `~/Applications/Azuria-Voice.AppImage`, cria `~/.local/share/applications/azuria-voice.desktop` e ícone; Debian/Ubuntu → `.deb` da versão (`apt`); resto → AppImage. `--simular` só imprime o plano.

- [ ] **Step 1: Testes**: `NAME="Matsu 27 OS"` → plano com `Matsu-OS-x64.AppImage` e `~/Applications`; `ID=ubuntu` → `.deb`; `ID=arch` → AppImage; `prepare()` com AppImage falso gera a cópia Matsu idêntica (mesmo SHA-256) e lista os dois no `SHA256SUMS.txt`.
- [ ] **Step 2:** FAIL → implementar → PASS.
- [ ] **Step 3:** conferir no código do `electron-updater` (`AppImageUpdater`) que nome sem versão é sobrescrito no lugar; anotar em `docs/install/linux.md`.
- [ ] **Step 4: Commit** `Linux: download e instalador do Matsu OS`.

---

## Fechamento

- [ ] `bun run --cwd electron typecheck && bun run --cwd electron test && bun run --cwd electron build && bun run --cwd electron build:web` PASS
- [ ] `uv run --no-sync pytest backend/tests tests -q -x` (conjunto do CI Linux) PASS
- [ ] `node electron/tests/packaging-contract.mjs` PASS
- [ ] Prints finais (escuro/claro, bolinhas) no relatório ao dono; limites: sem Windows, placa real nem Matsu OS aqui.
- [ ] `git push -u origin claude/stoic-ride-bwyqoe`; PR só se o dono pedir.
