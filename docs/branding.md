# Marca Azúria Voice

Nome de exibição: **Azúria Voice**, preservando o acento. O símbolo usa uma onda sonora contínua, semelhante a um M, em prata e azul, com um pequeno buraco negro no canto superior direito. O desenho usa cores chapadas e formas simples para funcionar em tamanho pequeno.

| Papel | Cor |
|---|---|
| Azul principal | `#2563EB` |
| Prata | `#CBD5E1` |
| Azul escuro | `#0B1220` |

O kit em `assets/brand/` contém a fonte SVG, PNG transparente, ICO Windows com múltiplas resoluções, versão horizontal com o nome e versões monocromáticas. Consulte [o inventário e a exportação](../assets/brand/README.md). Os ícones derivados da mesma fonte ficam em `electron/build/icons/`; `electron/public/favicon.svg` abastece o navegador e a marca na interface.

Não redesenhe a estrutura das telas para aplicar a marca. Ajuste os tokens de cor existentes e mantenha a legibilidade de texto, estados de foco e mensagens de erro.

## Identificadores de compatibilidade

A marca de exibição é independente dos contratos internos. Preserve os imports `omnivoice`, IDs e nomes dos modelos, variáveis `OMNIVOICE_*`/`VOICESTUDIO_*`, chaves de armazenamento, IPC, cabeçalhos e rotas de API. Os diretórios de dados/modelos continuam sob o gerenciamento existente. Não acrescente números de versão aos caminhos persistentes.

Referências aos autores originais, licenças e nomes de serviços externos permanecem onde sua identificação é necessária. A distribuição e as atualizações do Azúria usam `kaikydev1-jpg/azuria-voice`.
