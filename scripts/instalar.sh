#!/usr/bin/env bash
# Instalador do Azúria Voice para Linux.
# Descobre o sistema, baixa o arquivo certo da página oficial do GitHub,
# confere o SHA-256 e instala:
#   Matsu OS (Matsu 27 OS, 28…)   -> Azuria-Voice-Matsu-OS-x64.AppImage em ~/Applications
#   Fedora Atomic e outras ostree -> o mesmo AppImage (sem rpm-ostree)
#   Ubuntu, Debian, Mint…         -> o .deb da versão (apt)
#   outras                        -> o AppImage da versão em ~/Applications
# O AppImage se atualiza sozinho pelo próprio app (como o instalador do Windows).
#
# Uso:
#   curl -fsSL https://github.com/kaikydev1-jpg/azuria-voice/releases/latest/download/instalar.sh | bash
# Opções: --simular (mostra o que faria, sem baixar nem instalar)
#         AZURIA_VERSAO=0.5.14 (uma versão específica; padrão: a mais recente)
set -euo pipefail

REPO="kaikydev1-jpg/azuria-voice"
PAGINA="https://github.com/$REPO/releases"
VERSAO="${AZURIA_VERSAO:-latest}"
if [ "$VERSAO" = "latest" ]; then
  BASE="$PAGINA/latest/download"
else
  VERSAO="${VERSAO#v}"
  BASE="$PAGINA/download/v$VERSAO"
fi
MATSU_ARQUIVO="Azuria-Voice-Matsu-OS-x64.AppImage"
ICONE_URL="https://raw.githubusercontent.com/$REPO/main/assets/brand/app-icon-256.png"

SIMULAR=0
for opcao in "$@"; do
  case "$opcao" in
    --simular) SIMULAR=1 ;;
    -h|--help) sed -n '2,15p' "$0" 2>/dev/null || true; exit 0 ;;
    *) printf 'Opção desconhecida: %s (use --simular)\n' "$opcao" >&2; exit 2 ;;
  esac
done
OS_RELEASE="${AZURIA_OS_RELEASE:-/etc/os-release}"
OSTREE_MARK="${AZURIA_OSTREE_MARK:-/run/ostree-booted}"

diz() { printf '\033[1;34m▸\033[0m %s\n' "$*"; }
erro() { printf '\033[1;31m✗\033[0m %s\n' "$*" >&2; exit 1; }
rodar() { if [ "$SIMULAR" = 1 ]; then echo "  (simulação) $*"; else "$@"; fi; }

[ "${AZURIA_UNAME:-$(uname -s)}" = "Linux" ] ||
  erro "Este instalador é para Linux. No Windows e no macOS, baixe o instalador em $PAGINA/latest"
MAQUINA="${AZURIA_ARCH:-$(uname -m)}"
[ "$MAQUINA" = "x86_64" ] ||
  erro "O Azúria Voice para Linux só tem versão x86_64 (este computador é $MAQUINA)."

# ---------- qual sistema é ----------
campo() { grep -m1 "^$1=" "$OS_RELEASE" 2>/dev/null | cut -d= -f2- | tr -d '"'"'" || true; }
ID=$(campo ID | tr '[:upper:]' '[:lower:]')
ID_LIKE=$(campo ID_LIKE | tr '[:upper:]' '[:lower:]')
NOME=$(campo NAME)
BONITO=$(campo PRETTY_NAME)
VARIANTE=$(campo VARIANT_ID | tr '[:upper:]' '[:lower:]')
[ -n "$BONITO" ] || BONITO="${NOME:-Linux}"

junto=$(printf '%s %s %s' "$ID" "$NOME" "$BONITO" | tr '[:upper:]' '[:lower:]' | tr -d ' _-')
parecido() { case " $ID $ID_LIKE " in *" $1 "*) return 0 ;; esac; return 1; }
ostree=0
[ -e "$OSTREE_MARK" ] && ostree=1
case "$VARIANTE" in silverblue|kinoite|sericea|onyx|cosmic-atomic|atomic) ostree=1 ;; esac

ultima_versao() {
  if [ "$VERSAO" != "latest" ]; then echo "$VERSAO"; return; fi
  if [ "$SIMULAR" = 1 ]; then echo "<versão mais recente>"; return; fi
  local url
  url=$(curl -fsSLI -o /dev/null -w '%{url_effective}' "$PAGINA/latest") || erro "Não consegui consultar a versão mais recente em $PAGINA."
  url="${url##*/}"
  echo "${url#v}"
}

if [[ "$junto" == *matsu* ]]; then
  SISTEMA="$BONITO (Matsu OS)"; ARQUIVO="$MATSU_ARQUIVO"; MODO=appimage
elif [ "$ostree" = 1 ]; then
  SISTEMA="$BONITO (Fedora Atomic)"; ARQUIVO="$MATSU_ARQUIVO"; MODO=appimage
elif parecido debian || parecido ubuntu; then
  SISTEMA="$BONITO"; ARQUIVO="Azuria-Voice-Electron-$(ultima_versao)-linux-x64.deb"; MODO=apt
else
  SISTEMA="$BONITO"; ARQUIVO="Azuria-Voice-Electron-$(ultima_versao)-linux-x64.AppImage"; MODO=appimage
fi

DESTINO="$HOME/Applications/Azuria-Voice.AppImage"
ATALHO="$HOME/.local/share/applications/azuria-voice.desktop"
ICONE="$HOME/.local/share/icons/hicolor/256x256/apps/azuria-voice.png"

diz "Sistema: $SISTEMA"
diz "Baixar: $BASE/$ARQUIVO"
diz "Conferir o SHA-256 com $BASE/SHA256SUMS.txt"
if [ "$MODO" = appimage ]; then
  diz "Instalar em: $DESTINO (atualiza sozinho pelo app)"
  diz "Atalho no menu: $ATALHO"
else
  diz "Instalar com: sudo apt install ./$ARQUIVO"
fi

if [ "$SIMULAR" = 1 ]; then
  echo "  (simulação) nada foi baixado nem instalado."
  exit 0
fi

command -v curl >/dev/null 2>&1 || erro "Preciso do curl para baixar (instale o pacote curl)."
command -v sha256sum >/dev/null 2>&1 || erro "Preciso do sha256sum para conferir o arquivo (pacote coreutils)."
PASTA=$(mktemp -d)
trap 'rm -rf "$PASTA"' EXIT

diz "Baixando…"
curl -fL --progress-bar -o "$PASTA/$ARQUIVO" "$BASE/$ARQUIVO" || erro "Falha ao baixar $ARQUIVO."
curl -fsSL -o "$PASTA/SHA256SUMS.txt" "$BASE/SHA256SUMS.txt" || erro "Falha ao baixar SHA256SUMS.txt."
diz "Conferindo o SHA-256…"
grep "  $ARQUIVO\$" "$PASTA/SHA256SUMS.txt" > "$PASTA/conferir.txt" || erro "$ARQUIVO não está em SHA256SUMS.txt."
(cd "$PASTA" && sha256sum -c conferir.txt >/dev/null) || erro "O arquivo baixado não confere com o SHA-256 publicado. Nada foi instalado."

if [ "$MODO" = apt ]; then
  diz "Instalando o pacote (o sistema vai pedir a sua senha)…"
  sudo apt install -y "$PASTA/$ARQUIVO"
  diz "Pronto. Abra o Azúria Voice pelo menu de aplicativos."
  exit 0
fi

mkdir -p "$(dirname "$DESTINO")" "$(dirname "$ATALHO")" "$(dirname "$ICONE")"
install -m 755 "$PASTA/$ARQUIVO" "$DESTINO"
curl -fsSL -o "$ICONE" "$ICONE_URL" 2>/dev/null || true
cat > "$ATALHO" <<DESKTOP
[Desktop Entry]
Type=Application
Name=Azúria Voice
Comment=Clonagem de voz, dublagem, ditado e transcrição no seu computador
Exec="$DESTINO" %U
Icon=azuria-voice
Terminal=false
Categories=AudioVideo;Audio;
DESKTOP
command -v update-desktop-database >/dev/null 2>&1 && update-desktop-database "$(dirname "$ATALHO")" >/dev/null 2>&1 || true
diz "Pronto. Abra o Azúria Voice pelo menu de aplicativos (ou rode $DESTINO)."
