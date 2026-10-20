# Azúria Voice: instalação e futuras atualizações

Esta distribuição usa o código do VoiceStudio 0.5.7, commit `28bf2c7a83b8a64836297340c52a45d716684aed`. A marca musical, as cores e os endereços de distribuição são próprios. As funções e os contratos dos motores permanecem na base original.

## Instalar no Windows

1. Abra [Releases](https://github.com/kaikydev1-jpg/azuria-voice/releases) e baixe `Azuria-Voice-Electron-<versão>-win-x64.exe` e `SHA256SUMS.txt`.
2. Confira o arquivo com `Get-FileHash -Algorithm SHA256` e compare o resultado com a soma publicada.
3. Execute o instalador e escolha a pasta. O pacote instala para o usuário atual.
4. Abra **Azúria Voice**, instale o ambiente local pelo assistente e selecione os modelos necessários. Os downloads e consentimentos continuam sob o controle do aplicativo.
5. Para testar, escolha uma voz de demonstração, escreva um texto curto e gere áudio. A primeira geração pode demorar enquanto o motor carrega.

Instaladores sem certificado de assinatura podem mostrar o editor como desconhecido no Windows. A compilação aceita os segredos opcionais `ELECTRON_WINDOWS_CSC_LINK` e `ELECTRON_WINDOWS_CSC_KEY_PASSWORD` para um certificado próprio. Não use credenciais ou a identidade comercial dos mantenedores originais.

## Dados e modelos

O perfil Electron usa o nome estável **Azúria Voice**. O ambiente local fica no local escolhido pelo assistente. O backend conserva os diretórios e as variáveis de compatibilidade OmniVoice, incluindo `OMNIVOICE_DATA_DIR`, `OMNIVOICE_CACHE_DIR` e `OMNIVOICE_ENGINES_DIR`.

Mantenha `config/app.json` e os caminhos persistentes estáveis nas próximas versões; não acrescente a versão ao nome do perfil ou aos diretórios de modelos. Instale uma atualização sobre o mesmo aplicativo sem apagar o perfil, o ambiente ou os caches. O atualizador usa somente `kaikydev1-jpg/azuria-voice`.

Uma instalação antiga chamada VoiceStudio possui seu próprio perfil Electron. Esta edição não move nem apaga esse perfil automaticamente. As opções de armazenamento e as variáveis existentes continuam disponíveis para escolher os dados e modelos que deseja usar. Faça cópia dos seus projetos antes de qualquer migração manual.

## Compilar e publicar

O workflow [Azúria Voice Windows](https://github.com/kaikydev1-jpg/azuria-voice/actions/workflows/azuria-windows.yml) compila cada push em `main`, valida o pacote e disponibiliza o artefato `Azuria-Voice-Windows-x64` com:

- instalador NSIS `.exe`;
- `.exe.blockmap` e `electron-stable-win32-x64.yml` usados pelo atualizador;
- `SHA256SUMS.txt`.

Para publicar uma nova versão, altere a versão canônica no `package.json` da raiz e mantenha os espelhos `pyproject.toml` e `backend/core/version.py` iguais. Execute as verificações e envie o código para `main`. Em Actions, execute o workflow com **publish = true**. Ele cria `v<versão>` e publica os arquivos no seu repositório; recusa substituir uma release já existente.

Mantenha o manifesto, o instalador e o blockmap na mesma release. O aplicativo instalado usa esse manifesto para encontrar a próxima versão sem trocar seus caminhos de dados. Os workflows de publicação herdados foram mantidos para consulta e execução manual apenas no repositório original; a distribuição Windows desta edição usa `azuria-windows.yml`. As verificações genéricas de segurança continuam ativas neste repositório.

Para compilar localmente, instale Git, Node.js 22+, Bun 1.4.2, Rust e Visual Studio Build Tools com C++/Windows SDK, então execute `bun install --frozen-lockfile` e `bun run dist -- --win --x64`. Os scripts de validação de pacote e de primeira execução estão em `electron/tests/`.

## Licenças e serviços

Preserve `LICENSE`, `LICENSE-NOTICE.md`, `electron/T3CODE-LICENSE.txt` e os avisos dos modelos. A aplicação permanece AGPL-3.0; os pesos e serviços têm termos próprios. Os nomes, IDs, URLs e consentimentos necessários a integrações e modelos não devem ser trocados apenas para remover referências textuais à marca original.

VoiceStudio Cloud é um serviço externo original e mantém seu nome. Integrações remotas, contas e telemetria opcionais seguem o comportamento e os consentimentos da base; a mudança de marca não cria um novo serviço de nuvem.
