# Azúria Voice: visual novo, motor Ignis e versão Linux para o Matsu OS

Data: 14/11/2026. Pedido do dono do projeto (`@kaikydev1-jpg`), em três etapas e
nesta ordem.

## Por quê

1. **Visual:** deixar o app mais bonito, com o ar calmo e limpo do ElevenLabs,
   mas com cara própria (prata e azul do Azúria), sem perder nem mudar nenhuma
   função. Melhorar pode; mudar não.
2. **Ignis:** o dono criou o Ignis (`kaikydev1-jpg/Ignis`), um motor de IA local
   que usa a placa de vídeo de verdade (Vulkan para AMD/Intel, inclusive a
   RX 580; CUDA na NVIDIA; ROCm no Linux). Hoje, no Windows, o Azúria só acelera
   NVIDIA, e placas AMD e Intel rodam no processador. O Ignis entra como uma
   **opção a mais na instalação e nas Configurações** para a pessoa usar a placa.
3. **Linux / Matsu OS:** o app tem que se sentir em casa no Matsu OS (o sistema
   do dono, base Fedora Atomic), com as bolinhas da janela dos prints, e seguir o
   jeito de cada Linux nos outros sistemas.

## Metas

- Visual novo em todas as telas, temas claro e escuro, sem mover funções.
- Ignis integrado conforme `docs/IGNIS_PARA_AZURIA.md` do repositório Ignis
  (versão 0.3.0), mais a opção no assistente da primeira execução.
- Barra de título integrada no Linux com botões no estilo do sistema e o estilo
  Matsu automático no Matsu OS.
- Linux continua saindo na release oficial e se atualizando como no Windows.

## Fora do escopo

- Mudar telas, fluxos, rotas, API, IPC ou contratos de motor.
- Mudar nomes dos arquivos de download ou o atualizador (o dono confirmou: fica
  como o projeto já faz; o AppImage do Linux já se atualiza pelo GitHub, igual ao
  `.exe`).
- Subir a versão ou publicar release (só quando o dono pedir).
- Transformar o Azúria num app "de bandeja" (ver decisões).

## Anti-metas (falharia mesmo funcionando)

- Qualquer função que some, muda de lugar ou passa a se comportar diferente.
- Efeitos pesados ou em todo lugar, roxo/violeta, animações ao rolar a página.
- Quem não tem o Ignis perceber qualquer diferença no funcionamento.
- Texto fixo fora do i18n, ou regressão em Windows/macOS.

## Restrições do repositório

`CLAUDE.md`/`AGENTS.md`: Electron é a única interface; paridade entre sistemas
(o comportamento padrão igual em macOS, Windows e Linux; o que for de um sistema
só, atrás de opção); i18n obrigatório (paridade de locales verificada em teste);
`CHANGELOG.md` em `## [Unreleased]`; docs atualizados no mesmo PR; `main` verde
(testes Electron, backend, empacotamento); nada sai da máquina sem um "sim".

## Abordagens consideradas

### Visual
| Abordagem | Troca |
|---|---|
| **A. Sistema visual novo por tokens + moldura + primitivos (escolhida)** | Novas cores, tipografia, cantos, sombras e movimento nos tokens; redesenho da moldura (barra lateral, barra de cima, rodapé), dos componentes base (botão, cartão, campo, abas, diálogo) e das telas de entrada (início e assistente). Todas as telas mudam de cara juntas, sem tocar na lógica. Risco baixo. |
| B. Redesenhar tela por tela no layout do ElevenLabs | Mais parecido com o ElevenLabs, mas mexe na estrutura e na posição das funções: vai contra "não mudar". |
| C. Só trocar as cores | Barato, mas não chega no "mais bonito" pedido. |

### Ignis
| Abordagem | Troca |
|---|---|
| **A. O backend Python fala com o Ignis por HTTP local (escolhida)** | Segue o guia do Ignis: provedor de LLM, motor `ignis-tts` no registro de motores, transcrição pelo cliente "OpenAI-compatible" já existente. Tudo em `127.0.0.1`, nada sai da máquina. |
| B. O Azúria embutir os binários do Ignis | Duplica o que o Ignis já faz (escolher motor, baixar, atualizar) e pesa o instalador. |

### Botões da janela
| Abordagem | Troca |
|---|---|
| **A. Linux desenha os próprios botões; Windows e macOS mantêm os nativos (escolhida)** | No Windows o `titleBarOverlay` já dá os botões reais do Windows 11 (46 px, fechar vermelho, menu de encaixe); no macOS, as bolinhas reais. No Linux o overlay do Electron não segue GNOME/KDE, então o app desenha. |
| B. Desenhar tudo em todos os sistemas | Perde o menu de encaixe do Windows 11 e as bolinhas nativas do Mac. |

## Desenho

### 1. Visual "Azúria 2"
- **Base:** fundo azul-noite quase preto, superfícies em camadas por pequenas
  diferenças de luz, bordas finas com pouca opacidade (como o cartão de vidro do
  print do Matsu), texto prata/branco, **um** acento azul. Tema claro equivalente
  (fundo gelo, cartões brancos). Sem violeta.
- **Tipografia:** Inter Variable (já no app). Títulos maiores e mais firmes (600,
  espaçamento levemente fechado), rótulos discretos, números tabulares.
- **Um sistema só:** uma escala de cantos (8 / 12 / 16 px), um estilo de botão
  por papel (principal em pílula, secundário, fantasma), um cartão, um campo.
  Botões respondem ao passar o mouse e ao clicar; cartões com link sobem 2 px.
- **Movimento:** escala única 80 / 150 / 250 / 350 / 500 ms, saída suave
  `cubic-bezier(0.22, 1, 0.36, 1)` e mola contida
  `cubic-bezier(0.34, 1.36, 0.64, 1)`. A primeira tela entra uma vez; nada surge
  ao rolar. "Reduzir movimento" e "reduzir transparência" respeitados.
- **Destaques (no máximo dois):** luz que segue o ponteiro nos cartões de ação do
  início e brilho discreto no título de boas-vindas. Escritos no próprio projeto,
  em CSS, sem `motion`/`gsap`/`three`.
- **Onde muda:** tokens (`t3-theme.css`, paleta padrão), moldura (`app-shell/`),
  primitivos (`components/ui/`), início e assistente da primeira execução. As
  demais telas herdam pelos primitivos. Paletas alternativas existentes
  continuam disponíveis.
- **Referências:** Taste Skill (regras), transitions.dev (escala de tempo),
  React Bits (ideias de efeito). **Não se copia código** do transitions.dev nem
  do React Bits: as licenças deles proíbem redistribuir os componentes, o que
  conflita com a AGPL do Azúria. Usam-se só os números (tempos, curvas) e as
  ideias, com implementação própria.

### 2. Ignis
Conforme `docs/IGNIS_PARA_AZURIA.md` (Ignis 0.3.0):
1. **Provedor de LLM** `ignis` em `backend/services/llm_providers.py`
   (`http://127.0.0.1:11470/v1`, modelo `default`, sem chave; porta lida do
   `config.json` do Ignis, inclusive no Flatpak). Pensamento desligado nos
   pedidos de dublagem.
2. **Motor de voz `ignis-tts`** (novo `backend/engines/ignis/`): disponível só
   quando `GET /motor/versao` responde e `GET /v1/models` lista `omnivoice`.
   Registra a voz clonada uma vez em `POST /v1/audio/voices` (clipe já cortado
   pela regra de até 20 s), gera com `POST /v1/audio/speech`, tempo-limite de
   2 min no primeiro pedido com o aviso "Carregando a voz no Ignis…".
3. **Transcrição:** botão "Usar o Ignis" no cliente "OpenAI-compatible" que já
   existe (`Server URL = http://127.0.0.1:11470/v1`, `Model = whisper-1`).
4. **Configurações → Desempenho:** interruptor "Usar a placa pelo Ignis (AMD,
   NVIDIA, Intel)", linha de estado (placa, motor, voz e transcrição prontas),
   botão "Preparar no Ignis" mostrando antes tamanho e licença, e o aviso
   "Abra o Ignis" com o link de download quando ele está fechado.
5. **Assistente da primeira execução (pedido do dono):** na etapa de checagem do
   sistema, um cartão "Usar a placa de vídeo pelo Ignis". Com o Ignis aberto:
   mostra a placa encontrada e um interruptor (desligado por padrão, marcado
   como recomendado quando não há NVIDIA). Sem o Ignis: link para baixar e
   "Verificar de novo". Liga o mesmo interruptor das Configurações.
6. **Erros:** `503 audio_nao_preparado` → "Prepare a voz no Ignis" com o botão;
   `400` → mensagem do Ignis (já em português); `502 motor_sem_resposta` → tenta
   de novo uma vez e avisa.
7. **Licença visível:** a voz pelo Ignis usa o OmniVoice (CC BY-NC 4.0, uso não
   comercial), mostrado no motor e antes de preparar.
8. **Paridade:** a opção é igual no Windows, Linux e macOS; no macOS o Ignis não
   tem versão, então o cartão diz isso em vez de oferecer o download. Sem o
   Ignis, nada muda.

### 3. Linux e Matsu OS
- **Reconhecer o Matsu OS** no processo principal: primeiro arquivo que existir
  entre `/run/host/os-release`, `/etc/os-release`, `/usr/lib/os-release`; Matsu
  quando `ID`, `NAME` ou `PRETTY_NAME` contém "matsu" (ignorando maiúsculas,
  espaços, hífen e sublinhado). Automático, sem opção manual.
- **Estilo e posição dos botões no Linux:** mesma regra do `janela.rs` do Ignis
  (portada para TypeScript com os mesmos casos de teste): `gtk-decoration-layout`
  (lido por `gsettings`, `settings.ini` do GTK e `kwinrc` do KDE), tema GTK e
  `XDG_CURRENT_DESKTOP`. Estilos: Matsu, Mac, GNOME (Adwaita), KDE (Breeze),
  Windows.
- **Bolinhas Matsu (dos prints):** 12 px, 8 px entre elas, 14 px da lateral;
  `#ff5f57`, `#febc2e`, `#28c840`; símbolos de 1,35 px só com o mouse no grupo
  (× `#4d0000`, − `#995700`, dois triângulos `#006500`); apertando, brilho 82%;
  sem foco, cinza `#59545d` (escuro) / `#c9c9cf` (claro), sem símbolo, e as cores
  voltam com o mouse em cima. Lado e ordem seguem o sistema.
- **Janela no Linux:** sem overlay; a faixa de cima arrasta, duplo clique
  maximiza/restaura, botões e campos não arrastam, redimensiona pelas bordas,
  contorno de 1 px para separar do fundo. Foco/sem foco vêm do processo
  principal.
- **Configurações → Aparência:** "Estilo dos botões da janela": Automático,
  Windows, GNOME, KDE, Mac (Windows e Linux; no macOS ficam as bolinhas nativas).
  No Windows, um estilo diferente de Automático/Windows vale ao reabrir o app.
- **Pacotes e atualização:** ficam como hoje: AppImage (atualiza sozinho pelo
  GitHub, como o `.exe`) e `.deb`, já na release oficial. O AppImage é o pacote
  indicado para o Matsu OS/Fedora Atomic (não precisa de `rpm-ostree`); a
  documentação Linux ganha a seção Matsu OS.

## Decisões minhas (para o dono conferir)

- Ignis desligado por padrão, mesmo quando encontrado; o assistente recomenda
  quando não há NVIDIA.
- Sem modo "bandeja": o Azúria roda um backend Python pesado; fechar continua
  encerrando tudo e liberando a memória, que é o que o padrão "leve em repouso"
  pede na prática.
- Estilo manual dos botões só no Windows e Linux.
- Sem copiar código do React Bits/transitions.dev (licença), só ideias e números.

## O que fica para quem implementa

Valores exatos de cor e espaçamento dentro da direção acima, nome e cache das
vozes registradas no Ignis, onde exatamente fica cada texto novo, e os testes.

## Como provar

- Testes existentes (Vitest, backend, empacotamento, paridade de locales) verdes.
- Testes novos: regra dos botões (casos do Ignis), detecção do Matsu, provedor e
  motor Ignis contra um servidor Ignis falso, erros 503/400/502.
- Prints antes/depois das telas principais, nos temas claro e escuro, e das
  bolinhas nos três estados.
- **Limites honestos:** daqui só dá para testar no Linux (sem placa de vídeo e
  sem o Matsu OS de verdade). Windows, macOS, placa real e Matsu OS ficam para o
  CI e para o teste do dono.
