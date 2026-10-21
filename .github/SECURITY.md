# Política de segurança — Azúria Voice

## Versões mantidas

As correções desta distribuição são aplicadas na `main` e disponibilizadas em novas releases. Use a última [release Azúria Voice](https://github.com/kaikydev1-jpg/azuria-voice/releases). Builds antigos do VoiceStudio possuem manutenção e canais próprios.

## Relatar uma vulnerabilidade

Envie detalhes pelo [relato privado de vulnerabilidade do GitHub](https://github.com/kaikydev1-jpg/azuria-voice/security/advisories/new). Não publique credenciais, gravações pessoais ou instruções de exploração em uma issue pública.

Inclua a versão, o sistema operacional, os passos para reproduzir e o impacto observado. O mantenedor desta distribuição é `@kaikydev1-jpg`; este projeto não promete prazos de atendimento nem encaminha automaticamente relatos ao autor original.

## Uso local e acesso remoto

- Mantenha a API em loopback quando usar apenas o próprio computador.
- Antes de acessar por outra máquina, configure autenticação com `OMNIVOICE_API_KEY` ou o compartilhamento com PIN previsto pelo aplicativo. Para acesso remoto, use TLS em um proxy ou uma rede privada. Veja [autenticação da API](../docs/api-auth.md).
- Baixe modelos de fontes verificáveis, confira suas licenças e não execute programas recebidos junto de arquivos de modelos desconhecidos.
- Confira o SHA-256 do instalador com o manifesto da mesma release. Um checksum verifica a correspondência entre os arquivos; a assinatura do editor é uma proteção adicional e o instalador Windows atual não possui certificado de assinatura.

## Verificações automáticas

O [workflow Security](workflows/security.yml) executa gitleaks, CodeQL, Bandit e auditorias de dependências. A varredura de segredos bloqueia o workflow quando encontra uma credencial; os demais relatórios podem registrar alertas mesmo quando a execução termina verde. Uma execução bem-sucedida não significa ausência de vulnerabilidades.

Os alertas do GitHub devem ser avaliados por impacto e possibilidade de exploração. Avisos de qualidade e possíveis falsos positivos não são excluídos apenas para reduzir o contador. As [configurações desta distribuição](../docs/maintainers/azuria-repository-settings.md) documentam as proteções de branches, permissões e automações.
