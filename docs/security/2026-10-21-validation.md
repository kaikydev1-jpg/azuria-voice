# Validação da revisão de segurança

## Escopo e ambiente

Validação local no Windows x64, Python 3.11.17, Bun 1.4.2 e dependências do
checkout isolado. As verificações Python usam `HF_HUB_OFFLINE=1` e um cache
Hugging Face vazio. O SDK MCP 1.30 foi instalado em um diretório de teste separado,
sem modificar o ambiente do aplicativo instalado. O probe do Accelerate 1.15
é uma reprodução separada; essa versão não foi adotada no lock do aplicativo.

## Resultados

| Verificação | Resultado |
|---|---|
| Electron `check:electron`, após atualização final do lock | 4.580 testes passaram; 3 casos existentes ignorados. TypeScript, 21 catálogos de idioma, compilação desktop/web e contrato de empacotamento passaram. |
| `backend/tests` | 503 passaram; 9 casos existentes ignorados. |
| Execução conjunta final: backend, regressões de exposição, rede e limites MCP, com SDK 1.30 e Accelerate do lock | 552 passaram; 9 ignorados, após corrigir as fixtures descritas abaixo. |
| Fluxos Python afetados, incluindo as oito novas regressões | 249 passaram; 3 ignorados por symlink Windows, 6 xfail legados e 1 xpass. |
| Rede/PIN/lifecycle | 38 passaram; duas regressões falharam antes da correção. |
| Controles existentes de downloads, MOSS, diagnóstico e validação | 143 passaram. |
| MCP e pisos Python | 127 passaram; 3 casos existentes ignorados. |
| Contratos de dispositivo/ROCm/constraints/versão/metadados | 85 passaram. São testes de contrato, não ensaios físicos em GPUs. |
| Subprocesso, teste estabilizado | 18 passaram. |
| `uv lock --check`, CPU dry-run e Bun frozen-lockfile | Passaram; sem instalação de modelos ou alteração do ambiente instalado. |
| `bun audit` | Quatro avisos permanecem, sem críticos. Resultado não considerado “passou sem vulnerabilidades”. |
| Revisão independente do código e do delta adicional de dependências | Sem bloqueio Critical/Important; documentação do runner atualizada após observação. |

As contagens são por suíte; há interseção entre elas e não devem ser somadas
como testes únicos. Os 4.580 são a soma das duas sessões Electron.

## Limites e falhas observadas durante a execução

- A primeira tentativa com o Vitest 5 incluído no Vite+ mudou o comportamento de
  testes. A solução preserva o runner standalone 4.1.11, atualizando o Vite+ das
  ferramentas. A verificação final usa o comando de produção do repositório.
- Um teste Electron pressupõe um executável uv disponível e falhava quando o
  PATH de validação não o continha. A execução final incluiu a ferramenta uv
  real no PATH; não foi alterado código de produção para mascarar o ambiente.
- Um teste de subprocesso acessava `backend._proc` depois de um `await`, mas o
  worker já podia limpar esse campo. A asserção agora usa o handle capturado
  antes da espera e continua exigindo a saída real do processo. A suíte foi
  executada novamente depois da correção.
- A execução conjunta revelou também um mock incompleto de hardware no teste
  de desligamento durante carga: continha somente `family`, sem `probe_ok`.
  A fixture agora usa o contrato real `HostCaps` para CPU, sem acessar uma GPU
  nem modificar detecção de hardware do produto. Também isola a verificação de
  licença do seu worker fictício, sem registrar aceite real ou carregar pesos.
- Avisos de depreciação de dependências e APIs incompletas do jsdom permanecem.
  As compilações também avisam sobre tamanho de chunks e imports dinâmicos
  ineficazes; não são apresentados como erros corrigidos.
- A suíte raiz inteira de Python não foi executada. Os testes backend,
  regressões e contratos pertinentes foram executados. Não há alegação de
  cobertura de todos os testes do repositório.
- Não houve instalação empacotada nova nem execução física em macOS/Linux ou
  GPUs AMD/NVIDIA. A lógica compartilhada foi preservada e testada no Windows.
- CI/CodeQL precisam executar no commit enviado; o resultado do GitHub não se
  confunde com a triagem manual e com os testes locais. Nenhum alerta foi
  descartado manualmente para produzir um contador menor.

## Integração

As alterações devem ser revisadas em PR. Não fazer merge nem publicar uma
versão com base apenas neste relatório. A versão instalada continua 0.5.8;
os sete avisos Dependabot restantes e os quatro avisos adicionais de npm estão
descritos no [relatório](2026-10-21-audit.md).
