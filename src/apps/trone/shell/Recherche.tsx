import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Search, X } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { Button, toast } from '../../../ds/components';
import { useStaff } from '../../../shared/auth';
import { useClients } from '../../../shared/clients';
import { createStore, uid, useStore } from '../../../shared/store';
import type { Personne } from '../../../shared/ia-anonymise-pur';
import { MOTEURS, IDS_DES_MOTEURS, ajouteALHistorique, historiqueVivant, lienDeRecherche, lienPermis, peutRechercher, questionComposee, type Ecran, type Moteur, type Recherche } from '../../../shared/recherche-pur';
import './recherche.css';

/* RECHERCHER — 13 octobre 2026. Le bouton de la barre du haut ouvre un
   panneau à droite (une feuille en bas, au téléphone) : la question, le
   moteur, « Avec cet écran », puis « Chercher » ouvre claude.ai ou chatgpt.com
   dans une fenêtre posée à côté du Trône, la question déjà écrite. Aucun
   appel aux modèles depuis le Trône : la maquette validée le 13 octobre
   avait prévu un appel direct, Yéman a refusé toute dépense en plus de ses
   abonnements, et c'est l'abonnement qui répond.

   RÉSERVÉ AUX FONDATEURS. L'historique est propre à chacun, sur ce poste. */

/* Un seul magasin local, une liste par personne ; jamais relié au serveur. */
const recherchesStore = createStore<Record<string, Recherche[]>>('mnd_recherches', {});

const MOIS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
const dateCourte = (iso: string) => { const d = new Date(iso); return `${d.getDate()} ${MOIS[d.getMonth()]} ${d.getFullYear()}`; };

/** Ce que l'écran montre : son titre et son texte visible, ramenés court. */
function litLEcran(): Ecran {
  const titre = document.querySelector('.tr-page-head h2, .tr-content h2, .tr-content h1')?.textContent ?? document.title;
  const texte = (document.querySelector('.tr-content') as HTMLElement | null)?.innerText ?? '';
  return { titre, texte };
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

  const cherche = (q: string, m: Moteur, e: Ecran | null) => {
    const texte = q.trim();
    if (!texte) { zone.current?.focus(); return; }
    const lien = lienDeRecherche(m, texte, e, personnes);
    if (!ouvre(lien)) { toast('Le navigateur a bloqué la fenêtre : autorisez les fenêtres pour le Trône, puis réessayez.', 7000); return; }
    const r: Recherche = { id: uid(), le: new Date().toISOString(), moteur: m, question: texte, ecran: e ? ecran?.titre : undefined };
    setTout({ ...tout, [moi]: ajouteALHistorique(tout[moi] ?? [], r, r.le) });
    setQuestion('');
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
            <span>{avecEcran ? 'Avec cet écran, sans numéro ni adresse' : 'Sans cet écran : la question part seule'}</span>
          </label>
          {avecEcran && apercu && <p className="rc-apercu" title={apercu}>{apercu}</p>}
        </div>
        <form className="rc-saisie" onSubmit={(e) => { e.preventDefault(); cherche(question, moteur, ecran); }}>
          <label htmlFor="rc-question" className="rc-sur">Votre question</label>
          <textarea id="rc-question" ref={zone} value={question} onChange={(e) => setQuestion(e.target.value)} rows={3}
            placeholder="Une démarche, un produit, une adresse, un texte à écrire…"
            onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); cherche(question, moteur, ecran); } }} />
          <div className="rc-bas">
            <span className="rc-note">S’ouvre dans {MOTEURS[moteur].nom}, avec votre abonnement. Rien n’est facturé au Trône.</span>
            <Button type="submit" size="sm">Chercher</Button>
          </div>
        </form>
        <div className="rc-historique">
          <p className="rc-sur">Vos recherches, trente jours</p>
          {historique.length === 0 ? <p className="rc-vide">Aucune recherche encore sur ce poste.</p> : (
            <ul>
              {historique.map((r) => (
                <li key={r.id}>
                  <button type="button" onClick={() => { setQuestion(r.question); setMoteur(r.moteur); zone.current?.focus(); }} title="Reprendre cette question">
                    <b>{r.question}</b>
                    <small>{dateCourte(r.le)} · {MOTEURS[r.moteur].nom}{r.ecran ? ` · ${r.ecran}` : ''}</small>
                  </button>
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
