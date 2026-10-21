# Azúria Voice: instalação e futuras atualizações

Esta distribuição usa o código do VoiceStudio 0.5.7, commit `28bf2c7a83b8a64836297340c52a45d716684aed`. A marca musical, as cores e os endereços de distribuição são próprios. As funções e os contratos dos motores permanecem na base original.

A revisão de segurança e as pendências conhecidas estão no
[relatório de 21/10/2026](security/2026-10-21-audit.md), com as correções no
[PR #9](https://github.com/kaikydev1-jpg/azuria-voice/pull/9). Esse PR não é uma
nova versão instalada.

## Atualização 0.5.10

A versão 0.5.10 inclui as correções do
[PR #11](https://github.com/kaikydev1-jpg/azuria-voice/pull/11): Stanza 1.12.2
na tradução Argos, proteção adicional para checkpoints e mensagens de falha
NLLB/Argos sem diagnósticos internos. A referência da API também foi atualizada.
O Stanza corrigido foi validado no Windows com tradução real inglês → português.

Instale sobre o Azúria Voice existente e mantenha o mesmo ambiente local.
O aplicativo sincroniza as dependências sem exigir que você apague modelos,
vozes, projetos ou configurações. Os avisos restantes de setuptools, Torch,
Accelerate, NLTK e ferramentas JavaScript continuam documentados nas pendências;
esta versão não declara ausência de vulnerabilidades.

## Atualização 0.5.9

A versão 0.5.9 leva as correções do PR #9 ao instalador Windows: proteção do
PIN desde o início do compartilhamento LAN, mensagens de erro sem diagnósticos
privados e sessões MCP com limite e expiração. O aplicativo sincroniza o ambiente
Python existente; não é necessário apagar modelos, vozes ou configurações.
Os avisos de dependências ainda pendentes constam no relatório de segurança.
A situação atual de cada um, depois da 0.5.9, está em
[pendências de segurança](security/2026-10-21-followup.md). A versão 0.5.10
leva ao instalador as correções do PR #11, conforme descrito acima.

O workflow Windows também valida pull requests com a verificação
**Tests (backend + frontend)**: backend e regressões de segurança em modo offline,
testes de frontend, compilação e verificação do instalador.

## Instalar no Windows

1. Abra [Releases](https://github.com/kaikydev1-jpg/azuria-voice/releases) e baixe `Azuria-Voice-Electron-<versão>-win-x64.exe` e `SHA256SUMS.txt`.
2. Confira o arquivo com `Get-FileHash -Algorithm SHA256` e compare o resultado com a soma publicada.
3. Execute o instalador e escolha a pasta. O pacote instala para o usuário atual.
4. Abra **Azúria Voice**, instale o ambiente local pelo assistente e selecione os modelos necessários. Os downloads e consentimentos continuam sob o controle do aplicativo.
5. Para testar, escolha uma voz de demonstração, escreva um texto curto e gere áudio. A primeira geração pode demorar enquanto o motor carrega.

Instaladores sem certificado de assinatura podem mostrar o editor como desconhecido no Windows. A compilação aceita os segredos opcionais `ELECTRON_WINDOWS_CSC_LINK` e `ELECTRON_WINDOWS_CSC_KEY_PASSWORD` para um certificado próprio. Não use credenciais ou a identidade comercial dos mantenedores originais.

## macOS, Linux e execução pelo código-fonte

O código conserva o suporte da base original, mas o pacote configurado nesta edição é o Windows `.exe`; esse arquivo não instala no macOS nem no Linux. As verificações desta edição foram executadas no Windows. Ainda não compilamos nem testamos pacotes nativos do Azúria Voice em macOS/Linux.

| Plataforma | Suporte da base e situação desta edição |
| --- | --- |
| Windows x64 | Workflow de instalador NSIS e verificações locais disponíveis. |
| Mac com Apple Silicon, macOS 13.3+ | Backend local suportado pela base; Azúria disponível pelo código-fonte até publicarmos e validarmos um pacote nativo. |
| Mac Intel | Interface com backend remoto; o backend local não é suportado, inclusive pelo código-fonte. |
| Linux x64 com desktop X11/Wayland | Suporte desktop da base preservado; Azúria disponível pelo código-fonte até publicarmos e validarmos um pacote nativo. |

Para executar pelo código-fonte em uma plataforma com backend local, instale Git, Node.js 22.18+ (22.x), 24.11+ (24.x) ou 26+, Bun 1.4.2, uv e Rust/Cargo com a toolchain nativa do sistema. A compilação do helper também exige as ferramentas nativas: Xcode Command Line Tools no macOS; compilador C/C++, `pkg-config` e bibliotecas de desenvolvimento de áudio/janelas no Linux; Visual Studio Build Tools com C++/Windows SDK no Windows.

```bash
git clone https://github.com/kaikydev1-jpg/azuria-voice.git
cd azuria-voice
bun install --frozen-lockfile
bun run setup:api
bun run dev
```

No Mac Intel, pule `bun run setup:api`, execute `VOICESTUDIO_SKIP_BACKEND=1 bun run dev` e configure a conexão com um backend em outra máquina suportada. Os modelos e ambientes continuam exigindo configuração e downloads próprios.

Os guias de [macOS](install/macos.md) e [Linux](install/linux.md) detalham os requisitos da base. São guias históricos: seus links e nomes de arquivos de download apontam para VoiceStudio original, não para pacotes Azúria. Os scripts de download automático deste repositório dependem de o pacote da plataforma existir na própria [release Azúria](https://github.com/kaikydev1-jpg/azuria-voice/releases); mudar a marca não cria esses arquivos.

## Dados e modelos

O perfil físico Electron usa o nome estável ASCII **Azuria Voice** (`%APPDATA%\Azuria Voice` no Windows). A interface, os menus, o título e o Sobre mantêm **Azúria Voice**. O nome interno sem acento evita falhas de bibliotecas nativas de fala ao abrir dados do ambiente. Para um ambiente escolhido manualmente, prefira um caminho sem acentos, como `C:\AzuriaVoice`. O ambiente local fica no local escolhido pelo assistente. O backend conserva os diretórios e as variáveis de compatibilidade OmniVoice, incluindo `OMNIVOICE_DATA_DIR`, `OMNIVOICE_CACHE_DIR` e `OMNIVOICE_ENGINES_DIR`.

Mantenha `config/app.json` e os caminhos persistentes estáveis nas próximas versões; não acrescente a versão ao nome do perfil ou aos diretórios de modelos. Instale uma atualização sobre o mesmo aplicativo sem apagar o perfil, o ambiente ou os caches. O atualizador usa somente `kaikydev1-jpg/azuria-voice`.

Uma instalação antiga chamada VoiceStudio possui seu próprio perfil Electron. Esta edição não move nem apaga esse perfil automaticamente. As opções de armazenamento e as variáveis existentes continuam disponíveis para escolher os dados e modelos que deseja usar. Faça cópia dos seus projetos antes de qualquer migração manual.

## Compilar e publicar

O workflow [Azúria Voice Windows](https://github.com/kaikydev1-jpg/azuria-voice/actions/workflows/azuria-windows.yml) compila cada push em `main`, valida o pacote e disponibiliza o artefato `Azuria-Voice-Windows-x64` com:

- instalador NSIS `.exe`;
- `.exe.blockmap` e `electron-stable-win32-x64.yml` usados pelo atualizador;
- `SHA256SUMS.txt`.

Para publicar uma nova versão, altere a versão canônica no `package.json` da raiz e mantenha os espelhos `pyproject.toml` e `backend/core/version.py` iguais. Execute as verificações e envie o código para `main`. Em Actions, execute o workflow com **publish = true** e **run_tests = true**. A opção `run_tests = false` permite reconstruir um pacote quando os testes já passaram para o mesmo código da aplicação; mantenha-a ativada para novas alterações de código. Ele cria `v<versão>` e publica os arquivos no seu repositório; recusa substituir uma release já existente.

Mantenha o manifesto, o instalador e o blockmap na mesma release. O aplicativo instalado usa esse manifesto para encontrar a próxima versão sem trocar seus caminhos de dados. Os workflows de publicação herdados foram mantidos para consulta e execução manual apenas no repositório original; a distribuição Windows desta edição usa `azuria-windows.yml`. As verificações genéricas de segurança continuam ativas neste repositório.

Para compilar localmente, instale Git, Node.js 22.18+ (22.x), 24.11+ (24.x) ou 26+, Bun 1.4.2, Rust e Visual Studio Build Tools com C++/Windows SDK, então execute `bun install --frozen-lockfile` e `bun run dist -- --win --x64`. Os scripts de validação de pacote e de primeira execução estão em `electron/tests/`.

## Atualização de segurança 0.5.8

O código atualizado exige Pillow 13.0.0 e certifi 2026.10.19 para corrigir, respectivamente, o aviso crítico GHSA-8g5g-8vmr-9782 e a lista de autoridades de certificação do aviso GHSA-6q48-6c7w-9gw2. A antiga demonstração `omnivoice-demo` em Gradio deixou de integrar o pacote: o servidor Gradio exigia Pillow abaixo de 13. O aplicativo Electron, a API e os motores de voz permanecem; `gradio-client` continua disponível para a integração remota SoniTranslate. O extra `ui` conserva apenas as dependências do cliente remoto.

Use o instalador Windows 0.5.8 ou atualize o checkout e sincronize o ambiente com o novo lockfile. O instalador 0.5.7 já publicado permanece intacto e não contém essas mudanças. As cópias históricas da demonstração no código não são uma interface suportada desta distribuição.

## Licenças e serviços

Preserve `LICENSE`, `LICENSE-NOTICE.md`, `electron/T3CODE-LICENSE.txt` e os avisos dos modelos. A aplicação permanece AGPL-3.0; os pesos e serviços têm termos próprios. Os nomes, IDs, URLs e consentimentos necessários a integrações e modelos não devem ser trocados apenas para remover referências textuais à marca original.

VoiceStudio Cloud é um serviço externo original e mantém seu nome. Integrações remotas, contas e telemetria opcionais seguem o comportamento e os consentimentos da base; a mudança de marca não cria um novo serviço de nuvem.
