import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Search, X } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { Button, demande, toast } from '../../../ds/components';
import { useStaff } from '../../../shared/auth';
import { useClients } from '../../../shared/clients';
import { createStore, uid, useStore } from '../../../shared/store';
import type { Personne } from '../../../shared/ia-anonymise-pur';
import {
  MOTEURS, IDS_DES_MOTEURS, MODELES_DE_QUESTION, ajouteALHistorique, effaceLaRecherche, historiqueVivant, lienDeRecherche, lienPermis,
  modeleDeQuestion, peutRechercher, questionComposee, questionDuModele, type Ecran, type Moteur, type Recherche,
} from '../../../shared/recherche-pur';
import './recherche.css';

/* RECHERCHER — 13 octobre 2026. Le bouton de la barre du haut ouvre un
   panneau à droite (une feuille en bas, au téléphone) : la question, le
   moteur, « Avec cet écran », puis « Chercher » ouvre claude.ai ou chatgpt.com
   dans une fenêtre posée à côté du Trône, la question déjà écrite. Aucun
   appel aux modèles depuis le Trône : la maquette validée le 13 octobre
   avait prévu un appel direct, Yéman a refusé toute dépense en plus de ses
   abonnements, et c'est l'abonnement qui répond.

   21 octobre 2026, « améliore ce modèle de recherche, les conversations
   doivent s'effacer aussi » (choix au sélecteur : tout) : des modèles de
   question qui portent les règles de la Maison, une ligne par question,
   « Effacer » et « Tout effacer », la conversation qui ne se garde pas chez
   ChatGPT (le fantôme rappelé pour Claude), un écran lu sans ses menus, et
   chaque recherche relançable dans l'un ou l'autre moteur.

   RÉSERVÉ AUX FONDATEURS. L'historique est propre à chacun, sur ce poste. */

/* Un seul magasin local, une liste par personne ; jamais relié au serveur. */
const recherchesStore = createStore<Record<string, Recherche[]>>('mnd_recherches', {});

const MOIS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
const dateCourte = (iso: string) => { const d = new Date(iso); return `${d.getDate()} ${MOIS[d.getMonth()]} ${d.getFullYear()}`; };

/** CE QUE L'ÉCRAN MONTRE, SANS SES MENUS (21 octobre 2026) : le contexte
    partait avec « WhatsApp Le chat du site Les appels », le sur-titre et les
    boutons. On lit une copie du contenu, débarrassée des onglets, des
    sur-titres, des boutons et des champs. */
function litLEcran(): Ecran {
  const titre = document.querySelector('.tr-page-head h2, .tr-content h2, .tr-content h1')?.textContent ?? document.title;
  const contenu = document.querySelector('.tr-content') as HTMLElement | null;
  if (!contenu) return { titre, texte: '' };
  const copie = contenu.cloneNode(true) as HTMLElement;
  copie.querySelectorAll('nav, [role="tablist"], .trc-tabs, .mnd-eyebrow, .tr-page-head h2, button, select, input, textarea, svg, [aria-hidden="true"]')
    .forEach((n) => n.remove());
  const morceaux: string[] = [];
  const marche = document.createTreeWalker(copie, NodeFilter.SHOW_TEXT);
  for (let n = marche.nextNode(); n; n = marche.nextNode()) {
    const t = (n.textContent ?? '').trim();
    if (t) morceaux.push(t);
  }
  return { titre, texte: morceaux.join(' ') };
}

/** La fenêtre posée à droite du Trône sur un ordinateur ; un nouvel onglet au téléphone. */
function ouvre(lien: string): boolean {
  if (!lienPermis(lien)) return false;
  const large = window.innerWidth >= 900;
  const w = Math.round(window.screen.availWidth * 0.42), h = window.screen.availHeight;
  const f = large ? `popup=yes,width=${w},height=${h},left=${window.screen.availWidth - w},top=0,resizable=yes,scrollbars=yes` : undefined;
  const fen = window.open(lien, 'mnd-recherche', f);
  if (fen) { try { fen.focus(); } catch { /* une fenêtre d'un autre domaine refuse parfois le focus */ } }
  return !!fen;
}

export default function Recherche() {
  const staff = useStaff();
  const role = staff?.role;
  const moi = staff?.user_id ?? '';
  const emplacement = useLocation();
  const [clients] = useClients();
  const personnes: Personne[] = useMemo(() => clients.map((c) => { const [prenom, ...reste] = (c.name ?? '').trim().split(/\s+/); return { prenom, nom: reste.join(' ') }; }), [clients]);
  const [tout, setTout] = useStore(recherchesStore);
  const [ouvert, setOuvert] = useState(false);
  const [moteur, setMoteur] = useState<Moteur>('claude');
  const [avecEcran, setAvecEcran] = useState(true);
  /* Choix de Yéman : les conversations s'effacent aussi chez les services. */
  const [temporaire, setTemporaire] = useState(true);
  const [modele, setModele] = useState<string | undefined>(undefined);
  const [question, setQuestion] = useState('');
  const zone = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!ouvert) return;
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') setOuvert(false); };
    window.addEventListener('keydown', h);
    zone.current?.focus();
    return () => window.removeEventListener('keydown', h);
  }, [ouvert]);

  if (!peutRechercher(role)) return null;

  const historique = historiqueVivant(tout[moi] ?? [], new Date().toISOString());
  const ecran = avecEcran ? litLEcran() : null;
  const apercu = ecran ? questionComposee('', ecran, personnes).replace(/^\s*Contexte, depuis le Trône de la Maison MND\. /, '') : '';
  const choisi = modeleDeQuestion(modele);

  const cherche = (q: string, m: Moteur, e: Ecran | null, mod: string | undefined) => {
    const texte = q.trim();
    if (!texte) { zone.current?.focus(); return; }
    const composee = questionDuModele(texte, mod);
    const lien = lienDeRecherche(m, composee, e, personnes, { temporaire });
    if (!ouvre(lien)) { toast('Le navigateur a bloqué la fenêtre : autorisez les fenêtres pour le Trône, puis réessayez.', 7000); return; }
    const r: Recherche = { id: uid(), le: new Date().toISOString(), moteur: m, question: texte, ecran: e ? e.titre : undefined, ...(mod ? { modele: mod } : {}) };
    setTout({ ...tout, [moi]: ajouteALHistorique(tout[moi] ?? [], r, r.le) });
    setQuestion('');
    if (temporaire && !MOTEURS[m].seGardePas.parLien) toast(MOTEURS[m].seGardePas.dit, 7000);
  };

  const efface = (r: Recherche) => setTout({ ...tout, [moi]: effaceLaRecherche(tout[moi] ?? [], r) });
  const effaceTout = async () => {
    if (!await demande({
      quoi: 'Vos recherches',
      titre: 'Effacer toutes vos recherches de ce poste ?',
      dit: `${historique.length} recherche${historique.length > 1 ? 's' : ''} s’en vont du Trône. Claude et ChatGPT gardent les leurs, sauf les conversations temporaires.`,
      accepter: 'Tout effacer',
      refuser: 'Garder',
    })) return;
    setTout({ ...tout, [moi]: [] });
  };

  const panneau = ouvert ? createPortal(
    <div className="rc-voile" onClick={() => setOuvert(false)}>
      <aside className="rc-panneau" role="dialog" aria-label="Recherche" onClick={(e) => e.stopPropagation()}>
        <header className="rc-tete">
          <h4>Recherche</h4>
          <button type="button" className="rc-fermer" aria-label="Fermer" onClick={() => setOuvert(false)}><X size={18} /></button>
        </header>
        <div className="rc-reglages">
          <div className="rc-moteurs" role="group" aria-label="Où chercher">
            {IDS_DES_MOTEURS.map((m) => (
              <button key={m} type="button" aria-pressed={moteur === m} onClick={() => setMoteur(m)}>{MOTEURS[m].nom}</button>
            ))}
          </div>
          <label className="rc-contexte">
            <input type="checkbox" checked={avecEcran} onChange={(e) => setAvecEcran(e.target.checked)} />
            <span>Joindre cet écran, sans numéro ni adresse</span>
          </label>
          {avecEcran && apercu && <p className="rc-apercu" title={apercu}>{apercu}</p>}
          <label className="rc-contexte">
            <input type="checkbox" checked={temporaire} onChange={(e) => setTemporaire(e.target.checked)} />
            <span>Une conversation qui ne se garde pas</span>
          </label>
          {temporaire && <p className="rc-note">{MOTEURS[moteur].seGardePas.dit}</p>}
        </div>
        <form className="rc-saisie" onSubmit={(e) => { e.preventDefault(); cherche(question, moteur, ecran, modele); }}>
          <p className="rc-sur">Modèles de question</p>
          <div className="rc-modeles" role="group" aria-label="Modèles de question">
            <button type="button" aria-pressed={!modele} onClick={() => setModele(undefined)}>Question libre</button>
            {MODELES_DE_QUESTION.map((m) => (
              <button key={m.id} type="button" aria-pressed={modele === m.id} onClick={() => { setModele(m.id); zone.current?.focus(); }}>{m.nom}</button>
            ))}
          </div>
          <label htmlFor="rc-question" className="rc-sur">{choisi ? choisi.nom : 'Votre question'}</label>
          <textarea id="rc-question" ref={zone} value={question} onChange={(e) => setQuestion(e.target.value)} rows={choisi ? 5 : 3}
            placeholder={choisi ? choisi.invite : 'Une démarche, un produit, une adresse, un texte à écrire…'}
            onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); cherche(question, moteur, ecran, modele); } }} />
          {choisi && <p className="rc-note">Part avec les règles de la Maison : vous, jamais de prix, pas de tiret cadratin, aucune civilité supposée.</p>}
          <div className="rc-bas">
            <span className="rc-note">S’ouvre dans {MOTEURS[moteur].nom}, avec votre abonnement. Rien n’est facturé au Trône.</span>
            <Button type="submit" size="sm">Chercher</Button>
          </div>
        </form>
        <div className="rc-historique">
          <div className="rc-historique__tete">
            <p className="rc-sur">Vos recherches, trente jours</p>
            {historique.length > 0 && <button type="button" className="rc-lien" onClick={() => void effaceTout()}>Tout effacer</button>}
          </div>
          {historique.length === 0 ? <p className="rc-vide">Aucune recherche encore sur ce poste.</p> : (
            <ul>
              {historique.map((r) => (
                <li key={r.id}>
                  <button type="button" className="rc-reprendre" onClick={() => { setQuestion(r.question); setMoteur(r.moteur); setModele(r.modele); zone.current?.focus(); }} title="Reprendre cette question">
                    <b>{r.question}</b>
                    <small>
                      {dateCourte(r.le)} · {(r.moteurs ?? [r.moteur]).map((m) => MOTEURS[m].nom).join(' et ')}
                      {r.modele ? ` · ${modeleDeQuestion(r.modele)?.nom ?? ''}` : ''}{r.ecran ? ` · ${r.ecran}` : ''}
                    </small>
                  </button>
                  <div className="rc-gestes">
                    {IDS_DES_MOTEURS.map((m) => (
                      <button key={m} type="button" className="rc-lien" onClick={() => cherche(r.question, m, ecran, r.modele)} title={`Relancer dans ${MOTEURS[m].nom}`}>{MOTEURS[m].nom} ›</button>
                    ))}
                    <button type="button" className="rc-effacer" aria-label={`Effacer la recherche « ${r.question.slice(0, 40)} »`} title="Effacer" onClick={() => efface(r)}><X size={14} /></button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>
    </div>,
    document.body,
  ) : null;

  return (
    <>
      <button type="button" className="rc-bouton" onClick={() => setOuvert(true)} title="Rechercher avec Claude ou ChatGPT, sans quitter cet écran" aria-haspopup="dialog" aria-expanded={ouvert} data-emplacement={emplacement.pathname}>
        <Search size={14} /><span>Rechercher</span>
      </button>
      {panneau}
    </>
  );
}
