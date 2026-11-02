#!/bin/bash
# LA DICTÉE DE LA MAISON, SUR LE MAC : installation. 2 novembre 2026.
#
# Ce script est lu depuis le dépôt public de la Maison, puis lancé sur le Mac :
#   curl -fsSL -o ~/dictee-installe-mac.sh https://raw.githubusercontent.com/maisonmnd/mnd-platform/main/scripts/dictee-installe-mac.sh
#   bash ~/dictee-installe-mac.sh
# Il vérifie Python 3.10 ou plus ; crée le dossier ~/Dictee et son environnement
# ~/Dictee/.venv (faster-whisper, sounddevice, numpy, pyperclip, pynput, certifi) ;
# y pose dictee_mac.py, mots.txt (s'il manque) et reglages.json (s'il manque, avec
# le jeton tapé à l'aveugle) ; pose le lanceur « Dictee MND.command » sur le Bureau ;
# dit les trois autorisations que macOS doit donner au Terminal. Il ne touche à rien
# d'autre. Le jeton n'est jamais affiché ni envoyé ailleurs qu'à la fonction
# dictee-au-propre du Trône. Relancé, il remet dictee_mac.py et les modules à jour
# et garde mots.txt et reglages.json tels quels.
set -e

DEPOT="https://raw.githubusercontent.com/maisonmnd/mnd-platform/main"
DOSSIER="$HOME/Dictee"
FONCTION="https://rxjarbxjiogijmkywfsr.supabase.co/functions/v1/dictee-au-propre"

echo "La Dictée de la Maison : installation dans $DOSSIER"
echo

if [ "$(uname -s)" != "Darwin" ]; then
  echo "Ce script est celui du Mac. Sur le PC, la Dictée vit dans C:\\Users\\…\\Dictee."
  exit 1
fi
PUCE="$(uname -m)"
if [ "$PUCE" = "arm64" ]; then echo "Mac Apple Silicon."; else echo "Mac Intel."; fi

# 1. Python 3.10 ou plus. Les versions numérotées d'abord : le python3 d'Apple
#    (/usr/bin) est un 3.9, et sans les outils de développement il ouvre une
#    fenêtre d'installation au lieu de répondre.
PYTHON=""
for p in python3.13 python3.12 python3.11 python3.10 python3; do
  chemin="$(command -v "$p" 2>/dev/null || true)"
  [ -n "$chemin" ] || continue
  if [ "$chemin" = "/usr/bin/python3" ] && ! xcode-select -p >/dev/null 2>&1; then continue; fi
  if "$chemin" -c 'import sys; sys.exit(0 if sys.version_info >= (3, 10) else 1)' >/dev/null 2>&1; then
    PYTHON="$chemin"
    break
  fi
done
if [ -z "$PYTHON" ]; then
  echo "Il manque Python 3.10 ou plus. Installez Python 3.13 depuis https://www.python.org/downloads/macos/"
  echo "(le paquet « macOS 64-bit universal2 installer »), puis relancez ce script."
  exit 1
fi
VERSION="$("$PYTHON" -c 'import sys; print("%d.%d" % sys.version_info[:2])')"
echo "Python $VERSION : $PYTHON"
# onnxruntime (que faster-whisper demande) n'a pas encore de version Intel
# pour Python 3.14 : sur un Mac Intel, Python 3.13 au plus.
INTEL_TROP_NEUF=""
if [ "$PUCE" != "arm64" ] && "$PYTHON" -c 'import sys; sys.exit(0 if sys.version_info >= (3, 14) else 1)'; then
  INTEL_TROP_NEUF="oui"
  echo "Attention : sur un Mac Intel, faster-whisper s'installe avec Python 3.13 au plus (python.org)."
fi

mkdir -p "$DOSSIER"
cd "$DOSSIER"

# 2. L'environnement Python de la Dictée, à part du reste du Mac
if [ ! -x .venv/bin/python ]; then
  echo "Création de l'environnement Python : $DOSSIER/.venv"
  "$PYTHON" -m venv .venv
fi
echo "Installation des modules (faster-whisper, sounddevice, numpy, pyperclip, pynput) :"
echo "quelques minutes, la fenêtre reste calme pendant ce temps."
if ! .venv/bin/python -m pip install --quiet --disable-pip-version-check --upgrade pip \
  || ! .venv/bin/python -m pip install --quiet --disable-pip-version-check --upgrade \
    faster-whisper sounddevice numpy pyperclip pynput certifi; then
  echo
  echo "L'installation des modules a échoué (réseau ?). Relancez ce script."
  if [ -n "$INTEL_TROP_NEUF" ]; then
    echo "Sur ce Mac Intel : installez Python 3.13 (python.org), effacez $DOSSIER/.venv, puis relancez."
  fi
  exit 1
fi

# 3. Le programme, depuis le dépôt de la Maison. Téléchargé à côté puis relu
#    avant de remplacer l'ancien : un téléchargement coupé ne casse rien.
if ! curl -fsSL -o dictee_mac.py.nouveau "$DEPOT/scripts/dictee-mac/dictee_mac.py" \
  || ! .venv/bin/python -c 'import ast, sys; ast.parse(open(sys.argv[1], encoding="utf-8").read())' dictee_mac.py.nouveau; then
  rm -f dictee_mac.py.nouveau
  echo "dictee_mac.py n'a pas pu être téléchargé (réseau ?). Relancez ce script."
  exit 1
fi
mv dictee_mac.py.nouveau dictee_mac.py

# 4. Les mots, un par ligne : posés une fois, puis à vous
if [ -f mots.txt ]; then
  echo "mots.txt existe déjà : gardé tel quel."
else
cat > mots.txt <<'FIN'
# Vos mots : un par ligne. Whisper les entend mieux, Claude les écrit ainsi.
Maison MND
Le Trône
Ma Couronne
Yéman
FIN
fi

# 5. Le jeton de la Dictée, tapé à l'aveugle, jamais affiché. Il passe à Python
#    par l'entrée (printf est interne à bash : il n'apparaît dans aucune liste de
#    processus), et reglages.json naît en 600, lisible par ce seul compte du Mac.
if [ -f reglages.json ]; then
  echo "reglages.json existe déjà : gardé tel quel."
else
  echo
  echo "Collez le jeton de la Dictée de ce Mac : Le Trône › Paramètres › Dictée ›"
  echo "« Donner un jeton à un autre ordinateur » (nom : Le Mac). Le PC garde le sien."
  echo "Pas « Refaire un jeton » : celui-là remplace le jeton du PC et le couperait."
  echo "Sans jeton (Entrée seule), la Dictée met au propre seule, sur le Mac."
  echo "Il ne s'affichera pas pendant la frappe. Puis Entrée :"
  read -r -s JETON || JETON=""
  echo
  SANS_JETON=""
  if [ -z "$JETON" ]; then SANS_JETON="oui"; fi
  (
    umask 077
    printf '%s' "$JETON" | FONCTION="$FONCTION" .venv/bin/python -c '
import json, os, sys
jeton = sys.stdin.read().strip()
reglages = {
    "touche": "option droite",
    "modele": "small",
    "langue": "fr",
    "claude": True,
    "modele_claude": "claude-haiku-5-5",
    "bips": True,
    "mode": "note",
    "trone": {"url": os.environ["FONCTION"], "jeton": jeton},
}
fd = os.open("reglages.json", os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
with os.fdopen(fd, "w", encoding="utf-8") as f:
    json.dump(reglages, f, ensure_ascii=False, indent=2)
    f.write("\n")
'
  )
  unset JETON
  chmod 600 reglages.json
  if [ -n "$SANS_JETON" ]; then
    echo "Aucun jeton : la mise au propre se fera sur le Mac. Pour le poser plus tard :"
    echo "effacez ~/Dictee/reglages.json et relancez ce script."
  else
    echo "Jeton posé dans ~/Dictee/reglages.json (lisible par ce seul compte du Mac)."
  fi
fi

# 6. Le lanceur sur le Bureau : un double-clic ouvre la Dictée dans le Terminal
mkdir -p "$HOME/Desktop"
LANCEUR="$HOME/Desktop/Dictee MND.command"
cat > "$LANCEUR" <<'FIN'
#!/bin/bash
# La Dictée de la Maison : un double-clic l'ouvre dans le Terminal. Tenez Option droite, parlez, relâchez.
cd "$HOME/Dictee" || exit 1
export LANG="${LANG:-fr_FR.UTF-8}"
source .venv/bin/activate
python dictee_mac.py || read -r -p "La Dictée s'est arrêtée. Entrée pour fermer. " _
FIN
chmod +x "$LANCEUR"

# 7. Ce qui reste à faire, côté macOS
echo
echo "C'est prêt. Sur le Bureau, « Dictee MND.command » lance la Dictée."
echo "Le premier lancement télécharge le modèle small de Whisper (environ 500 Mo) dans ~/Dictee/modeles."
echo
echo "macOS doit autoriser le Terminal, dans Réglages Système › Confidentialité et sécurité :"
echo "  · Microphone : macOS le demande au premier lancement, acceptez (sinon, cochez Terminal) ;"
echo "  · Accessibilité : cochez Terminal (pour écrire au curseur, par Cmd+V) ;"
echo "  · Surveillance de l'entrée : cochez Terminal (pour sentir la touche tenue)."
echo "Absent de la liste : bouton +, puis Applications › Utilitaires › Terminal."
echo "Après avoir coché, quittez le Terminal (Cmd+Q) et relancez « Dictee MND »."
echo
echo "Puis : tenez Option droite, parlez, relâchez. Une autre touche pendant l'écoute annule."
echo "Vos mots : ~/Dictee/mots.txt (un par ligne). La touche et le reste : ~/Dictee/reglages.json."
