# Proteções do repositório Azúria Voice

Distribuição: `kaikydev1-jpg/azuria-voice`. Este é o guia de administração desta edição. O arquivo `repository-settings.md` ao lado preserva uma receita histórica do projeto original; seus checks de CLA e serviços do autor original não são exigidos aqui.

## Acesso e alterações

- O público pode ler, criar forks, abrir issues e propor pull requests. Isso não concede acesso de escrita nem de administração.
- Na configuração verificada em 21/10/2026, somente `@kaikydev1-jpg` tem escrita e administração. Não conceda esses papéis a colaboradores que apenas precisam propor mudanças.
- `CODEOWNERS` aponta todos os arquivos para esse mantenedor, incluindo código, workflows, licenças e o próprio arquivo de responsáveis.
- A `main` exige pull request, bloqueia exclusão e force push e restringe atualizações a administradores. Como existe um único administrador, somente o mantenedor integra mudanças.
- Não se exige aprovação de uma segunda pessoa: o GitHub não permite aprovar o próprio pull request. O mantenedor deve revisar o diff e os resultados antes de integrar contribuições.
- A exceção administrativa vale somente ao integrar pull requests, inclusive para uma correção urgente. Ela não permite push direto, exclusão ou force push na `main`. Se novos administradores forem adicionados, eles também receberão essa exceção.
- Apenas administradores podem mudar essas regras. Um pull request que edita o JSON abaixo não altera automaticamente as configurações do GitHub.

A definição está em [`.github/azuria-main-ruleset.json`](../../.github/azuria-main-ruleset.json). O GitHub armazena a regra aplicada fora do Git; criar ou editar esse arquivo, isoladamente, não ativa a proteção.

Checks exigidos: `Secret scan (gitleaks)`, `CodeQL (python)` e `CodeQL (javascript-typescript)`, todos com origem GitHub Actions. A branch da contribuição precisa estar atualizada, e conversas de revisão precisam estar resolvidas. Esses checks confirmam a execução da análise; CodeQL pode registrar alertas sem reprovar o check. Testes funcionais e compilação continuam necessários para mudanças no aplicativo. Não se exigem checks de workflows históricos desativados nesta distribuição.

## Automações e relatos

- Permissão padrão do `GITHUB_TOKEN`: leitura; Actions não pode aprovar pull requests. Jobs de publicação e upload de análises declaram as permissões específicas de que precisam.
- Workflows de pull requests de forks exigem aprovação do mantenedor para todos os colaboradores externos. Revise especialmente mudanças em workflows antes de autorizar a execução.
- Actions externas devem usar o SHA completo do commit. As dependências das Actions já são fixadas dessa forma no código; a configuração do GitHub também deve exigir isso.
- Mantenha secret scanning e push protection ativados. Dependabot deve avisar sobre dependências e propor correções, sem integração automática.
- Relatos privados de vulnerabilidade devem ser enviados ao repositório desta edição, conforme [a política](../../.github/SECURITY.md).

## Alertas e limites desta revisão

Em 21/10/2026, a análise existente apresentava **563 alertas abertos: 24 de severidade alta, 13 média e 526 sem severidade de segurança atribuída**. Não havia alerta aberto de segredo na consulta realizada. Esses números podem mudar com novas análises.

Entre os avisos altos há uso de DOM/HTML em `book-settings.tsx` e fluxo de caminhos de arquivos em rotas e serviços Python. Há também um aviso em um servidor de teste. A contagem não confirma exploração: alguns caminhos possuem validações e precisam ser analisados em seu contexto. Os avisos permanecem abertos para revisão; esta configuração de permissões não os corrige.

Esta revisão cobre controle de alterações, canais de relato e configurações do GitHub. Ela não certifica toda a aplicação, modelos, dependências ou infraestrutura remota como seguros.

## Imagem do projeto

O README usa o mesmo ícone do aplicativo. A imagem para compartilhamento é [`assets/brand/social-preview.png`](../../assets/brand/social-preview.png), com 1280 × 640 pixels e fundo sólido. Aplique em **Settings → General → Social preview → Edit → Upload an image**. Essa imagem pertence ao repositório; o avatar da conta GitHub é uma configuração separada.
