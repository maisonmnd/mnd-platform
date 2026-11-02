"""LA DICTÉE DE LA MAISON, SUR LE MAC · 2 novembre 2026.

La Dictée du bureau (C:\\Users\\…\\Dictee\\dictee.py, 30 octobre 2026), portée
sur macOS (Apple Silicon ou Intel), pour le Mac où Yéman travaille aussi.

Tenez la touche choisie (Option droite par défaut : un MacBook n'a pas de
Ctrl droite) et parlez ; relâchez : le texte s'écrit là où se trouve le
curseur, dans n'importe quelle application. Une autre touche pressée pendant
l'écoute annule (un raccourci n'est pas une dictée).

- La voix ne quitte pas le Mac : Whisper transcrit ici, en local (modèle
  small, int8, gardé dans ~/Dictee/modeles).
- La mise au propre se fait par le Trône (fonction dictee-au-propre, mêmes
  mots et mêmes modes que sur le PC) dès qu'un jeton est posé dans
  ~/Dictee/reglages.json ; sinon par Claude Haiku si ANTHROPIC_API_KEY est
  posée dans le Terminal (et le module anthropic dans ~/Dictee/.venv) ;
  sinon par des règles simples, ici.
- Les modes et les commandes se disent comme sur le PC : « mode message, … »,
  « mode liste », « en anglais », « à la ligne », « efface ça ».
- Vos mots (noms, marques, prénoms) sont dans ~/Dictee/mots.txt, un par
  ligne : Whisper les entend mieux. Le Trône y ajoute les siens.
- journal.txt ne garde que des durées, jamais ce qui a été dit.

Ce qui change avec le PC, et pourquoi (2 novembre 2026) :
- la touche s'écoute par pynput : le module keyboard demande root sur macOS ;
- les bips sont des sons du système (afplay, Tink puis Pop) : winsound
  n'existe que sous Windows ;
- le texte se colle par Cmd+V, et l'ancien presse-papiers revient après
  0,6 s : les applications du Mac lisent le presse-papiers un peu plus tard ;
- macOS doit autoriser le Terminal : Microphone, Accessibilité, Surveillance
  de l'entrée. La Dictée le dit au lancement s'il manque quelque chose.

Installation : scripts/dictee-installe-mac.sh, dans le dépôt de la Maison.
"""
from __future__ import annotations

import importlib
import json
import os
import re
import ssl
import subprocess
import sys
import threading
import time
import unicodedata
import urllib.error
import urllib.request
from pathlib import Path

# Les modules du Mac, posés par dictee-installe-mac.sh dans ~/Dictee/.venv.
# 2 novembre 2026 : chacun s'importe à part, sans faire tomber les autres. Ce
# qui manque se dit au lancement, et les fonctions pures se lisent aussi sur
# le PC, où le banc les essaie sans micro ni clavier du Mac.
MANQUENT: list[str] = []


def _module(nom: str):
    try:
        return importlib.import_module(nom)
    except Exception:  # ImportError, ou OSError quand une bibliothèque du système manque
        MANQUENT.append(nom)
        return None


np = _module('numpy')
pyperclip = _module('pyperclip')
sd = _module('sounddevice')
faster_whisper = _module('faster_whisper')
clavier = _module('pynput.keyboard')

ICI = Path(__file__).resolve().parent
REGLAGES_PAR_DEFAUT = {
    # 2 novembre 2026 : Option droite, car un MacBook n'a pas de Ctrl droite.
    # Autres valeurs : « commande droite », « option gauche », « maj droite »,
    # « contrôle droite » (clavier séparé seulement), « fn ».
    'touche': 'option droite',
    # Le même modèle que sur le PC (small : 2 s pour 12 s de parole là-bas,
    # moins sur un Mac Apple Silicon). « large-v3-turbo » reste possible.
    'modele': 'small',
    'langue': 'fr',
    'claude': True,
    'modele_claude': 'claude-haiku-5-5',
    'bips': True,
    # Le mode au départ (note, message, liste, anglais) ; « mode message » dit
    # en parlant passe devant.
    'mode': 'note',
    # Le Trône : la fonction dictee-au-propre, et le jeton de ce Mac, que
    # Paramètres › Dictée donne UNE fois (« Donner un jeton à un autre
    # ordinateur » : le PC garde le sien). Jeton vide : la Dictée met au
    # propre seule.
    'trone': {
        'url': 'https://rxjarbxjiogijmkywfsr.supabase.co/functions/v1/dictee-au-propre',
        'jeton': '',
    },
}
TAUX = 16000
DUREE_MINIMALE = 0.4  # secondes : en dessous, c'était un appui, pas une phrase
SONS = {'debut': '/System/Library/Sounds/Tink.aiff', 'fin': '/System/Library/Sounds/Pop.aiff'}
VK_FN = 63  # kVK_Function : la touche fn (globe) du Mac
# kVK_ANSI_V : la touche V, la même en AZERTY et en QWERTY. Jamais le code 0,
# que pynput prend quand il ne trouve pas une lettre : c'est Q en AZERTY, et
# Cmd+Q fermerait l'application où l'on écrit.
VK_V = 9

PERMISSIONS = (
    "macOS doit autoriser le Terminal (l'application qui lance la Dictée), dans\n"
    "Réglages Système › Confidentialité et sécurité :\n"
    "  · Microphone : Terminal coché (pour entendre) ;\n"
    "  · Accessibilité : Terminal coché (pour écrire au curseur, par Cmd+V) ;\n"
    "  · Surveillance de l'entrée : Terminal coché (pour sentir la touche tenue).\n"
    "Absent de la liste : bouton +, puis Applications › Utilitaires › Terminal.\n"
    "Ensuite, quittez le Terminal (Cmd+Q) et relancez « Dictee MND » sur le Bureau."
)


def ecris_en_prive(f: Path, texte: str) -> None:
    """Lisible par ce seul compte du Mac (600) : reglages.json porte le jeton."""
    fd = os.open(f, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, 'w', encoding='utf-8') as sortie:
        sortie.write(texte)


def lis_les_reglages() -> dict:
    f = ICI / 'reglages.json'
    r = json.loads(json.dumps(REGLAGES_PAR_DEFAUT))
    if f.exists():
        try:
            lu = json.loads(f.read_text(encoding='utf-8'))
            if not isinstance(lu, dict):
                raise ValueError('reglages.json n\'est pas un objet')
            trone_lu = lu.get('trone') if isinstance(lu.get('trone'), dict) else {}
            trone = {**r['trone'], **trone_lu}
            r.update(lu)
            r['trone'] = trone
        except ValueError:
            # Le message ne cite rien du fichier : le jeton y vit.
            print('reglages.json illisible : les réglages par défaut servent.')
    else:
        ecris_en_prive(f, json.dumps(REGLAGES_PAR_DEFAUT, ensure_ascii=False, indent=2) + '\n')
    return r


def lis_les_mots() -> list[str]:
    f = ICI / 'mots.txt'
    if not f.exists():
        return []
    return [m.strip() for m in f.read_text(encoding='utf-8').splitlines() if m.strip() and not m.startswith('#')]


def journal(texte: str) -> None:
    """Les durées seulement, jamais ce qui a été dit."""
    with open(ICI / 'journal.txt', 'a', encoding='utf-8') as f:
        f.write(f"{time.strftime('%Y-%m-%d %H:%M:%S')} {texte}\n")


# ── La touche ──────────────────────────────────────────────────────────
# Les noms de reglages.json (« touche ») vers les noms de pynput. Le français
# d'abord, l'anglais aussi (un reglages.json recopié du PC dit « right ctrl »).
TOUCHES = {
    'option droite': 'alt_r', 'alt droite': 'alt_r', 'right option': 'alt_r', 'right alt': 'alt_r',
    'option gauche': 'alt', 'alt gauche': 'alt', 'left option': 'alt', 'left alt': 'alt',
    'commande droite': 'cmd_r', 'cmd droite': 'cmd_r', 'command droite': 'cmd_r',
    'right command': 'cmd_r', 'right cmd': 'cmd_r',
    'controle droite': 'ctrl_r', 'ctrl droite': 'ctrl_r', 'control droite': 'ctrl_r',
    'right ctrl': 'ctrl_r', 'right control': 'ctrl_r',
    'maj droite': 'shift_r', 'shift droite': 'shift_r', 'right shift': 'shift_r',
    'fn': 'fn', 'globe': 'fn', 'fn globe': 'fn',
}
NOMS_DES_TOUCHES = {
    'alt_r': 'Option droite', 'alt': 'Option gauche', 'cmd_r': 'Commande droite',
    'ctrl_r': 'Contrôle droite', 'shift_r': 'Maj droite', 'fn': 'fn',
}


def _sans_accents(t: str) -> str:
    return ''.join(c for c in unicodedata.normalize('NFD', t) if unicodedata.category(c) != 'Mn')


def nom_de_touche(texte: str) -> str | None:
    """« Option droite », « commande-droite », « alt_r »… vers le nom de
    pynput ; None pour une touche inconnue."""
    brut = str(texte or '').strip().lower()
    if brut in NOMS_DES_TOUCHES:
        return brut
    t = re.sub(r'[\s_\-]+', ' ', _sans_accents(brut)).strip()
    return TOUCHES.get(t)


def fn_tenue() -> bool | None:
    """La touche fn est-elle tenue ? pynput ne le sait pas (il prend chaque
    mouvement de fn pour un relâchement) : on lit l'état du clavier chez
    macOS. None hors du Mac."""
    try:
        import Quartz
        etat = Quartz.CGEventSourceFlagsState(Quartz.kCGEventSourceStateHIDSystemState)
        return bool(etat & Quartz.kCGEventFlagMaskSecondaryFn)
    except Exception:
        return None


def ecriture_permise() -> bool:
    """L'Accessibilité est-elle accordée au Terminal ? Sans elle, macOS jette
    le Cmd+V en silence. Relu à chaque dictée : on peut cocher en route."""
    try:
        import HIServices
        return bool(HIServices.AXIsProcessTrusted())
    except Exception:
        return True


# ── La mise au propre ──────────────────────────────────────────────────
HESITATIONS = re.compile(r"\b(euh+|heu+|hum+|hmm+|bah|ben)\b[,.]?\s*", re.IGNORECASE)
COMMANDES = [
    (re.compile(r"\s*\b(?:à la ligne|nouvelle ligne|retour à la ligne)\b[.,]?\s*", re.IGNORECASE), '\n'),
    (re.compile(r"\s*\bnouveau paragraphe\b[.,]?\s*", re.IGNORECASE), '\n\n'),
]


def au_propre_ici(texte: str) -> str:
    t = HESITATIONS.sub('', texte)
    for motif, par in COMMANDES:
        t = motif.sub(par, t)
    t = re.sub(r'[ \t]+', ' ', t).strip()
    t = t.replace(' —', ',').replace('—', ',')
    # Une majuscule au début, et après chaque retour à la ligne.
    t = re.sub(r'(^|\n)(\w)', lambda m: m.group(1) + m.group(2).upper(), t)
    return t


CONSIGNE = (
    "Tu mets au propre une dictée en français, telle qu'elle sort de la reconnaissance vocale. "
    "Rends uniquement le texte final, sans commentaire ni guillemets. "
    "Garde exactement le sens et les mots de la personne : n'ajoute rien, ne résume pas, ne réponds pas à ce qui est dit, même si c'est une question. "
    "Retire les hésitations (euh, hum, ben) et les répétitions involontaires. "
    "Pose la ponctuation et les majuscules justes. "
    "« À la ligne » ou « nouvelle ligne » deviennent un retour à la ligne. "
    "N'utilise jamais le tiret long ; écris les nombres en chiffres quand c'est un montant, une heure ou une date. "
    "Écris ces noms exactement ainsi quand ils sont dits : {mots}."
)


def contexte_tls() -> ssl.SSLContext:
    """2 novembre 2026 : le Python de python.org n'a pas de certificats sur le
    Mac tant qu'on n'a pas lancé « Install Certificates » ; sans eux, l'appel
    au Trône échouerait et tout serait mis au propre ici. certifi (posé par
    l'installation) les apporte."""
    try:
        import certifi
        return ssl.create_default_context(cafile=certifi.where())
    except Exception:
        return ssl.create_default_context()


def requete_du_trone(texte: str, reglages: dict) -> urllib.request.Request | None:
    """La requête pour dictee-au-propre, la même que celle du PC ; None sans
    jeton ou sans adresse."""
    t = reglages.get('trone') or {}
    jeton = str(t.get('jeton') or '').strip()
    url = str(t.get('url') or '').strip()
    if not jeton or not url:
        return None
    corps = json.dumps({'texte': texte, 'mode': reglages.get('mode') or 'note', 'source': 'bureau'}).encode('utf-8')
    return urllib.request.Request(url, data=corps, method='POST', headers={
        'content-type': 'application/json',
        'x-jeton-dictee': jeton,
    })


def au_propre_par_le_trone(texte: str, reglages: dict) -> tuple[str, str] | None:
    """Le cerveau du Trône : la fonction dictee-au-propre, avec le jeton de
    ce Mac. Rend (texte propre, mode), ou None si le Trône ne répond pas :
    la dictée part quand même, mise au propre autrement. Le journal ne dit
    que le code ou le genre de l'erreur, jamais son texte : rien du jeton ni
    de la dictée n'y entre."""
    req = requete_du_trone(texte, reglages)
    if req is None:
        return None
    try:
        with urllib.request.urlopen(req, timeout=12, context=contexte_tls()) as r:
            lu = json.loads(r.read().decode('utf-8'))
    except urllib.error.HTTPError as e:
        journal(f'trone refuse ({e.code}) : mise au propre autrement')
        return None
    except Exception as e:  # réseau coupé, délai, certificats : la dictée part quand même
        journal(f'trone indisponible ({type(e).__name__}) : mise au propre autrement')
        return None
    if not isinstance(lu, dict) or not lu.get('ok') or not str(lu.get('propre') or '').strip():
        motif = lu.get('motif', '?') if isinstance(lu, dict) else '?'
        journal(f'trone dit {motif} : mise au propre autrement')
        return None
    return str(lu['propre']).strip(), str(lu.get('mode') or 'note')


def au_propre_par_claude(texte: str, reglages: dict, mots: list[str]) -> str | None:
    if not reglages.get('claude') or not os.environ.get('ANTHROPIC_API_KEY'):
        return None
    try:
        import anthropic
        client = anthropic.Anthropic(timeout=8.0, max_retries=1)
        r = client.messages.create(
            model=reglages.get('modele_claude', 'claude-haiku-5-5'),
            max_tokens=2048,
            system=CONSIGNE.format(mots=', '.join(mots) if mots else 'aucun'),
            messages=[{'role': 'user', 'content': texte}],
        )
        sortie = ''.join(b.text for b in r.content if b.type == 'text').strip()
        return sortie or None
    except Exception as e:  # le réseau, la clé, Claude occupé : la dictée part quand même
        journal(f'claude indisponible ({type(e).__name__}) : mise au propre locale')
        return None


def facon_de_mettre_au_propre(reglages: dict) -> str:
    """Ce que la fenêtre annonce au lancement : qui met au propre. Jamais le
    jeton, seulement s'il est là."""
    if str((reglages.get('trone') or {}).get('jeton') or '').strip():
        return 'le Trône (Claude Sonnet 5.5, les mots et les modes de la Maison)'
    if reglages.get('claude') and os.environ.get('ANTHROPIC_API_KEY'):
        return 'Claude Haiku'
    return 'les règles locales (pas de jeton du Trône, pas de clé Claude)'


# ── Le son ─────────────────────────────────────────────────────────────
def au_bon_taux(audio, taux: int):
    """Whisper veut du 16 kHz. Un micro du Mac qui refuse ce taux enregistre
    au sien (44,1 ou 48 kHz) : on le ramène ici, lissé d'abord pour ne pas
    replier les aigus sur la voix."""
    if taux == TAUX or len(audio) == 0:
        return audio
    pas = max(1, round(taux / TAUX))
    if pas > 1:
        audio = np.convolve(audio, np.ones(pas, dtype=np.float32) / pas, mode='same')
    n = max(1, int(round(len(audio) * TAUX / taux)))
    x = np.linspace(0, len(audio) - 1, n)
    return np.interp(x, np.arange(len(audio)), audio).astype(np.float32)


# ── Écrire au curseur ──────────────────────────────────────────────────
def ecris_au_curseur(texte: str, sortie) -> bool:
    """Colle le texte au curseur par Cmd+V, puis rend l'ancien presse-papiers.
    Rend False quand macOS refuse d'écrire (Accessibilité) : le texte reste
    alors dans le presse-papiers, pour un Cmd+V à la main."""
    try:
        avant = pyperclip.paste()
    except Exception:
        avant = None
    pyperclip.copy(texte)
    if sortie is None or not ecriture_permise():
        return False
    time.sleep(0.05)
    v = clavier.KeyCode.from_vk(VK_V)
    with sortie.pressed(clavier.Key.cmd):
        sortie.press(v)
        sortie.release(v)
    time.sleep(0.6)
    # Une image dans le presse-papiers revient vide (None) : rien à rendre.
    if isinstance(avant, str):
        try:
            pyperclip.copy(avant)
        except Exception:
            pass
    return True


# ── La dictée ──────────────────────────────────────────────────────────
class Dictee:
    def __init__(self) -> None:
        self.reglages = lis_les_reglages()
        self.mots = lis_les_mots()
        nom = str(self.reglages.get('touche') or '')
        self.touche = nom_de_touche(nom)
        if self.touche is None:
            print(f'Touche inconnue dans reglages.json : {nom}. La Dictée prend Option droite.')
            self.touche = 'alt_r'
        self.cle = None  # la touche chez pynput, posée au lancement
        self.sortie = None  # le clavier qui tape Cmd+V, créé au lancement
        self.modele = None
        # Le modèle chargé : avant, la touche ne fait rien.
        self.pret = False
        self.blocs: list = []
        self.ecoute = False
        self.annulee = False
        self.debut = 0.0
        self.taux_du_micro = TAUX
        # Le plus fort niveau entendu au lancement : un micro refusé par macOS
        # ne donne que des zéros, sans erreur.
        self.niveau_au_lancement = 0.0
        self.verrou = threading.Lock()
        # Une transcription à la fois : une seconde dictée attend la première.
        self.verrou_modele = threading.Lock()

    def charge_le_modele(self) -> None:
        dossier = ICI / 'modeles'
        if not any(dossier.glob('**/model.bin')):
            print(f"Premier lancement : le modèle {self.reglages['modele']} se télécharge dans {dossier}"
                  " (small : environ 500 Mo).", flush=True)
        print(f"Chargement du modèle {self.reglages['modele']}…", flush=True)
        t = time.time()
        coeurs = max(1, (os.cpu_count() or 4) - 2)
        self.modele = faster_whisper.WhisperModel(self.reglages['modele'], device='cpu', compute_type='int8',
                                                  cpu_threads=coeurs, download_root=str(dossier))
        print(f'Prêt en {time.time() - t:.1f} s.', flush=True)

    def _micro(self, donnees, _frames, _instant, _etat) -> None:
        if self.ecoute:
            self.blocs.append(donnees.copy())
        elif not self.pret:
            self.niveau_au_lancement = max(self.niveau_au_lancement, float(np.abs(donnees).max()))

    def _ouvre_le_micro(self):
        """16 kHz d'abord, comme sur le PC ; si le micro refuse ce taux, le
        sien, ramené à 16 kHz avant Whisper."""
        try:
            flux = sd.InputStream(samplerate=TAUX, channels=1, dtype='float32', callback=self._micro)
            self.taux_du_micro = TAUX
        except Exception:
            taux = int(sd.query_devices(kind='input')['default_samplerate'])
            flux = sd.InputStream(samplerate=taux, channels=1, dtype='float32', callback=self._micro)
            self.taux_du_micro = taux
        flux.start()
        return flux

    def _bip(self, quand: str) -> None:
        if not self.reglages.get('bips'):
            return
        try:
            subprocess.Popen(['afplay', SONS[quand]], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        except OSError:
            pass  # pas d'afplay (hors du Mac) : la dictée se passe de bip

    def _est_la_touche(self, key) -> bool:
        if self.touche == 'fn':
            return getattr(key, 'vk', None) == VK_FN
        return key is not None and key == self.cle

    def _fn_bouge(self) -> None:
        tenue = fn_tenue()
        if tenue is None:  # l'état de macOS illisible : chaque mouvement bascule
            tenue = not self.ecoute
        if tenue:
            self.demarre()
        else:
            self.termine()

    def _appui(self, key, injected: bool = False) -> None:
        # Notre propre Cmd+V arrive ici aussi (injected) : ce n'est pas elle
        # qui tape, il n'annule rien.
        if injected:
            return
        try:
            if self._est_la_touche(key):
                if self.touche == 'fn':
                    self._fn_bouge()
                elif self.ecoute:
                    # La même touche « appuyée » deux fois : macOS l'a relâchée
                    # pendant que l'autre touche du même nom restait tenue.
                    self.termine()
                else:
                    self.demarre()
            elif self.ecoute:
                # Une autre touche pendant l'écoute : c'est un raccourci, on annule.
                self.annulee = True
        except Exception as e:  # une erreur ici arrêterait l'écoute du clavier
            journal(f'touche ({type(e).__name__})')

    def _relache(self, key, injected: bool = False) -> None:
        if injected:
            return
        try:
            if self._est_la_touche(key):
                if self.touche == 'fn':
                    self._fn_bouge()
                else:
                    self.termine()
        except Exception as e:
            journal(f'touche ({type(e).__name__})')

    def demarre(self) -> None:
        with self.verrou:
            if self.ecoute or not self.pret:
                return
            self.blocs = []
            self.annulee = False
            self.ecoute = True
            self.debut = time.time()
        self._bip('debut')

    def termine(self) -> None:
        with self.verrou:
            if not self.ecoute:
                return
            self.ecoute = False
        duree = time.time() - self.debut
        if self.annulee or duree < DUREE_MINIMALE or not self.blocs:
            return
        self._bip('fin')
        audio = np.concatenate(self.blocs)[:, 0].astype(np.float32)
        threading.Thread(target=self._transcris, args=(audio, duree), daemon=True).start()

    def _transcris(self, audio, duree: float) -> None:
        if not np.any(audio):
            # Des zéros seulement : macOS refuse le micro au Terminal.
            journal(f'parole {duree:.1f} s : micro muet')
            print('Le micro ne donne que du silence.\n' + PERMISSIONS, flush=True)
            return
        audio = au_bon_taux(audio, self.taux_du_micro)
        with self.verrou_modele:
            t0 = time.time()
            segments, _ = self.modele.transcribe(
                audio, language=self.reglages.get('langue', 'fr'), beam_size=1, vad_filter=True,
                condition_on_previous_text=False,
                initial_prompt=('Vocabulaire : ' + ', '.join(self.mots) + '.') if self.mots else None,
            )
            brut = ' '.join(s.text.strip() for s in segments).strip()
        t1 = time.time()
        if not brut:
            journal(f'parole {duree:.1f} s : rien entendu')
            return
        par_le_trone = au_propre_par_le_trone(brut, self.reglages)
        if par_le_trone is not None:
            propre, par = par_le_trone[0], f'trone, mode {par_le_trone[1]}'
        else:
            propre = au_propre_par_claude(brut, self.reglages, self.mots)
            par = 'claude'
            if propre is None:
                propre, par = au_propre_ici(brut), 'local'
        t2 = time.time()
        if not ecris_au_curseur(propre, self.sortie):
            print('Texte prêt dans le presse-papiers : collez-le avec Cmd+V'
                  ' (Accessibilité non accordée au Terminal).', flush=True)
            par += ', sans collage'
        journal(f'parole {duree:.1f} s, transcription {t1 - t0:.1f} s, mise au propre ({par}) {t2 - t1:.1f} s')

    def lance(self) -> int:
        nom = NOMS_DES_TOUCHES[self.touche]
        # 1. Le clavier d'abord : sans Surveillance de l'entrée, inutile de
        #    télécharger un modèle. Le Controller naît ici, sur le fil
        #    principal : il lit la disposition du clavier chez macOS.
        self.sortie = clavier.Controller()
        self.cle = None if self.touche == 'fn' else getattr(clavier.Key, self.touche)
        ecoute = clavier.Listener(on_press=self._appui, on_release=self._relache)
        ecoute.start()
        ecoute.wait()
        time.sleep(0.3)
        if not ecoute.is_alive():
            print(f"La touche {nom} ne s'entend pas : macOS refuse l'écoute du clavier au Terminal.")
            print(PERMISSIONS, flush=True)
            return 1
        if not ecriture_permise():
            print("Accessibilité non accordée au Terminal : le texte attendra dans le presse-papiers (Cmd+V à la main).")
            print(PERMISSIONS, flush=True)
        if self.touche == 'fn':
            print("Touche fn : dans Réglages Système › Clavier, mettez « Appuyer sur la touche fn (globe) pour »"
                  " sur « Ne rien faire », sinon macOS ouvre aussi les emoji ou sa propre dictée.")
        elif self.touche == 'ctrl_r':
            print("Contrôle droite n'existe que sur un clavier séparé : un MacBook n'en a pas."
                  " Sinon, « option droite » dans ~/Dictee/reglages.json.")
        # 2. Le micro.
        try:
            flux = self._ouvre_le_micro()
        except Exception as e:
            print(f"Le micro ne s'ouvre pas ({type(e).__name__} : {e}).")
            print(PERMISSIONS, flush=True)
            ecoute.stop()
            return 1
        try:
            time.sleep(0.6)
            if self.niveau_au_lancement == 0.0:
                print("Le micro ne donne que du silence pour l'instant. Si macOS demande l'accès au micro, acceptez ;"
                      " sinon : Réglages Système › Confidentialité et sécurité › Microphone › Terminal.", flush=True)
            # 3. Le modèle.
            self.charge_le_modele()
            with self.verrou:
                self.pret = True
            print(f'Tenez [{nom}] et parlez ; relâchez pour écrire. Mise au propre : '
                  f'{facon_de_mettre_au_propre(self.reglages)}. Fermez cette fenêtre pour arrêter.', flush=True)
            while ecoute.is_alive():
                ecoute.join(0.5)
            print("L'écoute du clavier s'est arrêtée.")
            print(PERMISSIONS, flush=True)
            return 1
        finally:
            ecoute.stop()
            flux.stop()
            flux.close()


def main() -> int:
    if sys.platform != 'darwin':
        print('Cette Dictée est celle du Mac. Sur le PC : C:\\Users\\…\\Dictee\\dictee.py.')
        return 1
    if MANQUENT:
        print(f"Il manque : {', '.join(MANQUENT)}. Relancez l'installation : bash ~/dictee-installe-mac.sh")
        return 1
    return Dictee().lance()


if __name__ == '__main__':
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        sys.exit(0)
