<div align="center">
  <img src="assets/brand/app-icon-128.png" alt="Ícone do aplicativo Azúria Voice" width="96" height="96" />
  <h1>Azúria Voice</h1>
  <p>Clonagem de voz, criação de vozes, dublagem, ditado, transcrição e audiolivros, com identidade em prata e azul.</p>
  <p><a href="https://github.com/kaikydev1-jpg/azuria-voice/releases">Downloads</a> · <a href="docs/AZURIA.md">Guia desta distribuição</a> · <a href="LICENSE">AGPL-3.0</a></p>
</div>

Azúria Voice é uma distribuição modificada do [VoiceStudio](https://github.com/debpalash/VoiceStudio), baseada no commit `28bf2c7a83b8a64836297340c52a45d716684aed`, versão 0.5.7. As alterações se concentram na marca, nas cores, na retirada de promoções e nos endereços de distribuição e atualização. A autoria original e os avisos de licença são preservados.

O aplicativo mantém os motores, modelos, integrações, telas e fluxos da base. A geração local usa o hardware do computador; integrações remotas e serviços de terceiros continuam sujeitos às suas configurações e termos. Os nomes técnicos OmniVoice, `OMNIVOICE_*`, IDs dos modelos e contratos de API permanecem por compatibilidade. O serviço externo VoiceStudio Cloud conserva sua identificação própria.

## Windows

Baixe o instalador `.exe` para Windows x64 em [Releases](https://github.com/kaikydev1-jpg/azuria-voice/releases). Compare seu SHA-256 com `SHA256SUMS.txt` da mesma versão. O assistente instala para o usuário atual e permite escolher a pasta. Consulte [instalação Windows](docs/install/windows.md) e o [guia Azúria](docs/AZURIA.md).

Na primeira execução, use o assistente existente para preparar o ambiente Python, as ferramentas de mídia e os modelos necessários. A interface mostra o progresso e os consentimentos dos modelos. Modelos grandes podem exigir vários GB; a aplicação não inclui todos os pesos no instalador.

Sem NVIDIA, o ambiente padrão de PyTorch no Windows usa CPU. Motores com runtime próprio mantêm suas opções existentes. A AMD Radeon RX 580 não oferece aceleração CUDA.

## Executar e compilar o código

Requisitos: Git, Node.js 22+, Bun 1.4.2; para o instalador, Rust/Cargo e Visual Studio Build Tools com C++/Windows SDK.

```powershell
git clone https://github.com/kaikydev1-jpg/azuria-voice.git
cd azuria-voice
bun install --frozen-lockfile
bun run setup:api
bun run dev
```

Para gerar o instalador Windows localmente:

```powershell
bun run dist -- --win --x64
```

Os artefatos ficam em `electron/release/`. O workflow `azuria-windows.yml` também compila no Windows e permite publicar uma versão com seu manifesto de atualização. Consulte [o guia](docs/AZURIA.md) antes de publicar futuras versões.

## Documentação e recursos

| Assunto | Guia |
|---|---|
| Recursos e motores | [Catálogo](docs/feature-catalog.md) · [Motores](docs/engines/README.md) |
| Modelos e armazenamento | [Downloads](docs/downloading-models.md) · [Desempenho](docs/performance.md) |
| Instalação e recuperação | [Windows](docs/install/windows.md) · [Solução de problemas](docs/install/troubleshooting.md) |
| API e integrações | [API local](docs/speech-platform.md) · [MCP](docs/mcp.md) · [Exemplos](examples/README.md) |
| Desenvolvimento | [Electron](electron/README.md) · [Histórico original](CHANGELOG.md) |
| Identidade visual | [Marca](docs/branding.md) · [SVG, PNG e ICO](assets/brand/README.md) |

Documentos históricos e termos de terceiros podem mencionar VoiceStudio ou seus autores para preservar a procedência. Os guias originais descrevem recursos da base; os endereços de distribuição desta edição estão neste README e em `docs/AZURIA.md`.

## Segurança e contribuições

O repositório é público para consulta, forks e propostas por pull request. A integração na `main` fica sob controle de `@kaikydev1-jpg`. Consulte a [política de segurança](.github/SECURITY.md) para relatar vulnerabilidades em privado e as [proteções do repositório](docs/maintainers/azuria-repository-settings.md) para conhecer as regras e verificações.

## Licenças e créditos

Copyright 2024-present Palash Debnath and VoiceStudio contributors. A aplicação permanece sob [GNU AGPL-3.0](LICENSE), com os avisos em [LICENSE-NOTICE.md](LICENSE-NOTICE.md) e o aviso MIT dos componentes T3 Code em [electron/T3CODE-LICENSE.txt](electron/T3CODE-LICENSE.txt). O pacote OmniVoice, os modelos, tokenizadores e outras dependências conservam suas licenças próprias.

Os avisos e consentimentos dos modelos continuam disponíveis no aplicativo. A licença da aplicação não concede direitos sobre vozes, gravações, pesos ou serviços externos. Consulte [os registros dos modelos](docs/licensing/model-inventory.md) e use gravações com a autorização necessária.
