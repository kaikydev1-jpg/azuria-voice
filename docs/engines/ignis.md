# Ignis (voz na placa de vídeo)

O motor `ignis` gera a voz com o **OmniVoice rodando no Ignis**, o motor de IA
local do criador do Azúria ([kaikydev1-jpg/Ignis](https://github.com/kaikydev1-jpg/Ignis)).
O Ignis usa a placa de vídeo de verdade: **Vulkan** em placas AMD e Intel
(inclusive a RX 580, que o PyTorch não acelera no Windows), **CUDA** na NVIDIA e
**ROCm** no Linux, ou o processador quando a placa não dá conta.

## Como usar

1. Instale e abra o Ignis (ele fica perto do relógio).
2. No Azúria, em **Configurações → Desempenho**, ligue **Usar a placa pelo Ignis**
   (ou escolha a opção no assistente da primeira execução).
3. Se a voz ainda não estiver preparada, clique em **Preparar no Ignis**. O
   tamanho e a licença aparecem antes do download.

Ligado, o interruptor escolhe o motor de voz `ignis`, o provedor de linguagem
**Ignis (local)** e aponta a transcrição "OpenAI-compatible" para o Whisper do
Ignis. Desligar devolve as escolhas que estavam antes. Sem o Ignis aberto, nada
muda no resto do app.

## O que vai pela placa

| Parte | Pelo Ignis |
|---|---|
| Voz e clonagem | OmniVoice (`/v1/audio/speech`, `/v1/audio/voices`) |
| Transcrição | Whisper (`/v1/audio/transcriptions`) |
| Tradução da dublagem e refinamentos | modelo de texto carregado no Ignis (`/v1/chat/completions`) |
| Música e efeitos sonoros | não: continuam no PyTorch do Azúria |

## Detalhes

- Tudo fica em `127.0.0.1`: nada sai do computador. A porta vem do
  `config.json` do Ignis (Windows `%APPDATA%\ignis\`, Linux `~/.config/ignis/`,
  Flatpak `~/.var/app/io.github.kaikydev1jpg.Ignis/config/ignis/`); a variável
  `IGNIS_BASE_URL` (só endereços locais) tem prioridade.
- A voz clonada é enviada ao Ignis uma vez, com um nome tirado do áudio de
  referência e da transcrição; mudar o áudio cria uma voz nova.
- O primeiro pedido demora mais (o Ignis carrega a voz na placa).
- Direção de voz, design de voz por descrição e velocidade não são suportados
  por este motor.

## Licença

Os pesos do OmniVoice são **CC BY-NC 4.0 (uso não comercial)**. O código do
Ignis é MIT. O Azúria mostra a licença no nome do motor e antes de preparar.
