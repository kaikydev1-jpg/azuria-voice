# Música e efeitos sonoros locais

O Azúria Voice 0.5.11 gera música e efeitos sonoros neste computador, em **Ferramentas → Música** e **Ferramentas → Efeitos sonoros**. Depois que o modelo é baixado, nada exige internet e nenhuma API em nuvem é usada.

## Modelos

Você escolhe o modelo e a qualidade. Os pesos não vêm no instalador: cada um é baixado só quando você pedir, na revisão fixada pelo app.

| Tipo | Modelo | Licença declarada | Classe no app | Tamanho |
|---|---|---|---|---|
| Música | ACE-Step v1 3.5B | Apache-2.0 | Uso comercial permitido — conforme licença | ~7,7 GB |
| Música | MusicGen small (mono) | CC-BY-NC-4.0 | Somente não comercial | ~2,2 GB |
| Música | MusicGen stereo medium | CC-BY-NC-4.0 | Somente não comercial | ~3,8 GB |
| Efeitos | Stable Audio Open 1.0 | Stability AI Community | Uso comercial com condições | ~4,9 GB |
| Efeitos | AudioLDM2 | CC-BY-NC-SA-4.0 | Somente não comercial | ~4,2 GB |

Os tamanhos e o hardware informados são **estimativas** até haver medições reais (ver abaixo). Não há promessa de suporte a GPUs AMD antigas; sem GPU compatível o app usa a CPU, mais devagar. Em Mac com Apple Silicon a GPU (MPS) é tentada e cai para a CPU se falhar, mas ainda não foi validada.

### Stable Audio Open (condições)

O uso comercial exige registro na Stability AI e vale só abaixo de USD 1 milhão de receita anual (incluindo afiliadas). Antes de gerar para uso comercial o app pede a sua confirmação explícita. **O app não registra, não paga e não aceita termos por você.** O modelo é restrito no Hugging Face: aceite os termos lá e use o seu próprio token em Configurações.

## Finalidade declarada

Em cada geração você informa **Pessoal / não comercial** (padrão) ou **Comercial / monetizado**. O servidor confere isso com a licença do modelo escolhido, também para a API e o MCP:

- Comercial com modelo não comercial: recusado (HTTP 403), com a lista de alternativas.
- Comercial com Stable Audio Open: exige confirmação das condições (HTTP 409 até confirmar).
- Licença não confirmada: recusada para uso comercial.

A declaração é gravada com o resultado. **Ela não é uma licença** e não muda os direitos de gerações anteriores.

## Qualidade

Rápido, Equilibrado, Alto e Personalizado (parâmetros dentro de limites validados no servidor). O MusicGen tem um único perfil.

## Fila, progresso e cancelamento

Cada geração roda em um processo próprio. Os trabalhos entram numa fila (um por vez). Cancelar um trabalho em execução encerra o processo e libera a memória; nada fica no histórico.

## Ambientes isolados

Os modelos usam ambientes Python separados (`audiogen-torch` e `audiogen-acestep`), instalados pelo app. O Torch e o Transformers do aplicativo principal não são alterados.

## Histórico e proveniência

Cada take guarda: modelo, revisão exata dos pesos, classe e documentos da licença, finalidade declarada, perfil e parâmetros. Takes antigos aparecem como "proveniência não registrada" e nada é presumido sobre eles. **Exportar WAV + proveniência** gera um ZIP com o WAV, `.provenance.json` e `.provenance.txt`. O áudio passa pelo mesmo `mark_synthetic` das demais vozes.

## API

- `GET /audio-gen/catalog` — modelos, licenças e estado de instalação (não baixa nada)
- `POST /audio-gen/music` e `/audio-gen/sfx` — iniciam um trabalho (202)
- `GET /audio-gen/jobs/{id}` e `POST /audio-gen/jobs/{id}/cancel`
- `GET /audio-gen/takes/{id}/provenance` e `/export`

Ferramentas MCP: `list_audio_models`, `generate_music`, `generate_sound_effect`, `get_audio_job`, `cancel_audio_job`.

## Limitações conhecidas

- O texto exato da licença do Stable Audio Open exige login no Hugging Face e não pôde ser lido sem conta; o app guarda os documentos públicos da Stability e a revisão fixada.
- A geração real do Stable Audio Open no CI depende de um token do Hugging Face com os termos aceitos.
- MPS (Apple) e GPUs AMD não foram validados.
