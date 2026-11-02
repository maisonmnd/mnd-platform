#!/bin/bash
# ONYX, L'ASSISTANT DE BRICE (Maison MND) : installation sur son Mac. 31 octobre 2026.
# 2 novembre 2026 : la veille n'est plus dite ici (plus de /loop) ; la charte, sections 3 et 14,
# la bâtit sur les réglages du Trône. Relancer ce script réécrit ~/Onyx/CLAUDE.md et le lanceur.
#
# Ce script est lu depuis le dépôt public de la Maison, puis lancé sur le Mac :
#   curl -fsSL -o ~/onyx-installe.sh https://raw.githubusercontent.com/maisonmnd/mnd-platform/main/scripts/onyx-installe.sh
#   bash ~/onyx-installe.sh
# Il vérifie Node.js, Claude Code (dans VS Code ou dans le Terminal) et Chrome ;
# crée le dossier ~/Onyx (CLAUDE.md, la charte, la ligne de commande, reglages.json
# avec le jeton tapé à l'aveugle) ; pose le lanceur Onyx.command sur le Bureau ;
# dit si Onyx est relié au Trône. VS Code présent (1er novembre 2026) : le lanceur
# ouvre le dossier Onyx dans VS Code, où l'extension Claude Code lit CLAUDE.md.
# Il ne touche à rien d'autre. Le jeton n'est jamais affiché ni envoyé ailleurs
# qu'à la fonction assistants-maison du Trône. Voir docs/ASSISTANTS.md.
set -e

DEPOT="https://raw.githubusercontent.com/maisonmnd/mnd-platform/main"
DOSSIER="$HOME/Onyx"
FONCTION="https://rxjarbxjiogijmkywfsr.supabase.co/functions/v1/assistants-maison"

echo "Onyx : installation dans $DOSSIER"
echo

# 1. Node.js 18 ou plus (la ligne de commande en a besoin)
if ! command -v node >/dev/null 2>&1; then
  echo "Il manque Node.js. Installez la version LTS depuis https://nodejs.org puis relancez ce script."
  exit 1
fi
NODE_MAJ="$(node -p "process.versions.node.split('.')[0]")"
if [ "$NODE_MAJ" -lt 18 ]; then
  echo "Node.js $NODE_MAJ est trop ancien : il faut la version 18 ou plus (https://nodejs.org)."
  exit 1
fi

# 2. Claude Code, sous le compte Claude de Brice : dans VS Code (l'extension
#    Claude Code) ou dans le Terminal (la commande claude). Un seul des deux suffit ;
#    VS Code passe d'abord quand il est là.
VSCODE=""
if [ -d "/Applications/Visual Studio Code.app" ]; then VSCODE="oui"; fi
CLAUDE_BIN="$(command -v claude 2>/dev/null || true)"
if [ -z "$CLAUDE_BIN" ] && [ -x "$HOME/.local/bin/claude" ]; then CLAUDE_BIN="$HOME/.local/bin/claude"; fi
if [ -z "$CLAUDE_BIN" ] && [ -z "$VSCODE" ]; then
  echo "Il manque Claude Code. Au choix :"
  echo "  - VS Code (https://code.visualstudio.com), glissé dans Applications, puis son extension « Claude Code » ;"
  echo "  - ou dans le Terminal :  curl -fsSL https://claude.ai/install.sh | bash"
  echo "Connectez-vous avec VOTRE compte Claude, puis relancez ce script."
  exit 1
fi
if [ -n "$VSCODE" ]; then
  echo "VS Code est là : Onyx veillera dans VS Code, avec l'extension Claude Code."
fi

# 3. Chrome (avec l'extension Claude in Chrome, à installer depuis le Chrome Web Store)
if [ ! -d "/Applications/Google Chrome.app" ]; then
  echo "Attention : Google Chrome n'est pas dans /Applications. Onyx lit WhatsApp Web dans Chrome, avec l'extension Claude in Chrome."
fi

mkdir -p "$DOSSIER"
cd "$DOSSIER"
curl -fsSL -o assistants-maison.mjs "$DEPOT/scripts/assistants-maison.mjs"
curl -fsSL -o ASSISTANTS.md "$DEPOT/docs/ASSISTANTS.md"

# 4. Le CLAUDE.md d'Onyx : ce qui est propre à ce dossier (la charte fait foi pour le reste)
cat > CLAUDE.md <<'FIN'
# Onyx

Tu es Onyx, l'assistant de Brice Ahouansou, maître fondateur de la Maison MND (un salon de locks à Cotonou), depuis le 31 octobre 2026.

## À lire d'abord

- La charte des assistants reliés, qui fait foi : `~/Onyx/ASSISTANTS.md` (remise à jour à chaque démarrage depuis le dépôt de la Maison).
- Ce Mac n'a pas la mémoire de la Maison : la charte et ce fichier disent tout ce que tu dois savoir. Tu apprends la voix de Brice de ses propres messages envoyés (section 12 de la charte) et tu la gardes dans `~/Onyx/voix.md`, jamais ailleurs.

## Le réveil

Quand Brice écrit « Réveille-toi » (ou ouvre une session dans ce dossier sans autre demande) : lis `~/Onyx/ASSISTANTS.md` puis ce fichier, fais tes trois contrôles et ton passage (section 3 de la charte), liste ce qui est arrivé pendant ton sommeil, puis pose la veille comme le disent les sections 3 et 14 de la charte : des tâches cron bâties sur les réglages du Trône (`veille.crons` dans la réponse du passage), jamais `/loop`.

Ce fichier ne dit aucune heure ni aucun rythme de veille : la charte et les réglages du Trône en décident. Si un texte de lancement en dit un, c'est la charte qui fait foi.

## Ce dossier, `~/Onyx`

- `reglages.json` : ton identité et ton jeton d'appareil. Ne jamais l'ouvrir, l'afficher, le copier, le citer ni le réécrire. Seule la ligne de commande le lit.
- `etat.json` : ton état local, et lui seul : l'instantané des fils (par nom · non-lus · aperçu), les cercles des contacts, le dernier tour. Jamais un fait de rendez-vous dedans : les rendez-vous vivent au Trône.
- `voix.md` : la voix de Brice, apprise ici, corrigée à chaque « Je modifie ».

## La ligne de commande

Toujours lancée depuis `~/Onyx` (elle y trouve `reglages.json`) :

    cd ~/Onyx && node assistants-maison.mjs <sous-commande> ...

- `--aide` liste les sous-commandes : `sante`, `passage`, `relais deposer|traiter`, `decision deposer|executee`, `rdv poser|deplacer|annuler`, `note poser`, `notifier`, `depense poser`, `fiche chercher` (charte, sections 16 et 17).
- `--essai` montre la requête qui partirait, sans l'envoyer.
- Un rendez-vous se pose par `rdv poser`, jamais à la souris dans le Trône.

## Les identifiants

- Toi : `onyx` ; l'autre assistant : `opale` (Yéman, sur son ordinateur Windows).
- Les maîtres (`--pour`) : Brice Ahouansou `st-d4t24p6inh` ; Yéman Boya `st-5qduae5jef`.
- Les fils que tu n'ouvres jamais : Yéman, « Maison MND », les groupes, les statuts, les chaînes.
- Les tresses : la coiffeuse Hermine n'est prévenue que par Opale, depuis le fil de Yéman ; toi, tu relaies (la fonction le fait d'elle-même quand tu poses des tresses).
FIN

# 5. Le jeton d'Onyx, tapé à l'aveugle, jamais affiché
if [ -f reglages.json ]; then
  echo "reglages.json existe déjà : gardé tel quel."
else
  echo "Collez le jeton d'Onyx (Le Trône › Direction › Les assistants › Onyx › « Donner un jeton », depuis le compte de Brice)."
  echo "Il ne s'affichera pas pendant la frappe. Puis Entrée :"
  read -r -s JETON
  echo
  if [ -z "$JETON" ]; then echo "Aucun jeton saisi : relancez ce script quand vous l'aurez."; exit 1; fi
  umask 077
  printf '{\n  "assistant": "onyx",\n  "nom": "Onyx",\n  "url": "%s",\n  "jeton": "%s"\n}\n' "$FONCTION" "$JETON" > reglages.json
  chmod 600 reglages.json
  unset JETON
fi

# 6. Le lanceur sur le Bureau. Avec VS Code : il ouvre WhatsApp Web, remet la
#    charte à jour, puis ouvre le dossier Onyx dans VS Code ; Brice ouvre Claude
#    Code (l'icône Claude) et écrit « Réveille-toi ». Sans VS Code : le Terminal.
LANCEUR="$HOME/Desktop/Onyx.command"
if [ -n "$VSCODE" ]; then
cat > "$LANCEUR" <<FIN
#!/bin/bash
# Onyx, l'assistant de Brice : un double-clic ouvre WhatsApp Web, remet la charte à jour, puis le dossier Onyx dans VS Code.
open -a "Google Chrome" "https://web.whatsapp.com"
cd "\$HOME/Onyx"
curl -fsSL -o assistants-maison.mjs "$DEPOT/scripts/assistants-maison.mjs" 2>/dev/null || true
curl -fsSL -o ASSISTANTS.md "$DEPOT/docs/ASSISTANTS.md" 2>/dev/null || true
open -a "Visual Studio Code" "\$HOME/Onyx"
echo
echo "Onyx : dans VS Code, ouvre Claude Code (l'icône Claude, en haut à droite) et écris : Réveille-toi"
echo "Cette fenêtre peut se fermer."
FIN
else
cat > "$LANCEUR" <<FIN
#!/bin/bash
# Onyx, l'assistant de Brice : un double-clic ouvre WhatsApp Web puis Claude Code avec la charte.
open -a "Google Chrome" "https://web.whatsapp.com"
sleep 3
cd "\$HOME/Onyx"
curl -fsSL -o assistants-maison.mjs "$DEPOT/scripts/assistants-maison.mjs" 2>/dev/null || true
curl -fsSL -o ASSISTANTS.md "$DEPOT/docs/ASSISTANTS.md" 2>/dev/null || true
cd "\$HOME"
"$CLAUDE_BIN" "Tu es Onyx, l'assistant de Brice. Lis d'abord \$HOME/Onyx/ASSISTANTS.md puis \$HOME/Onyx/CLAUDE.md, fais tes trois contrôles et ton passage, liste ce qui est arrivé pendant ton sommeil, puis pose la veille comme le disent les sections 3 et 14 de la charte (des tâches cron bâties sur les réglages du Trône, jamais /loop)."
FIN
fi
chmod +x "$LANCEUR"

# 7. Onyx est-il relié ?
echo
if node assistants-maison.mjs sante >/dev/null 2>&1; then
  echo "Le Trône répond. Sur le Bureau, « Onyx.command » réveille Onyx (la première fois : clic droit, Ouvrir)."
  echo "Le jeton se vérifie à son premier réveil : s'il est refusé, Onyx le dit. Refaites alors « Nouveau jeton » au Trône,"
  echo "effacez ~/Onyx/reglages.json et relancez ce script."
  if [ -n "$VSCODE" ]; then echo "Dans VS Code, ouvrez Claude Code et écrivez : Réveille-toi"; fi
else
  echo "Le Trône ne répond pas pour l'instant (réseau ?). Le dossier est prêt ; réessayez avec : cd ~/Onyx && node assistants-maison.mjs sante"
fi
