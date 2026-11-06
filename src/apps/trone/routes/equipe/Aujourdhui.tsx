import { useMemo, useState } from 'react';
import { fmtMoney } from '../../../../shared/currency';
import { jourDitAvecLAnnee, type ReleveDuContrat } from '../../../../shared/abonnee-pur';
import { cheminDeLaLigne } from '../../../../shared/chemin-de-sceaux-pur';
import { joursDeLaTete, type Client } from '../../../../shared/clients';
import type { CompteAbonnement, ContratDuCompte, MoteurAbonnements, Subscriber } from '../../../../shared/abonnements';
import {
  finsDeCarnet, heureDuFauteuil, panierDit, prochaineSeance, sansRendezVous, seancesAPreparer, seancesDisponibles, semaineDe, tempsDuPanier,
  type PanierDAttention,
} from '../../../../shared/attentions-pur';
import { useArticlesDAttention, usePaniersDAttention } from '../../../../shared/attentions';
import { GestesDuPanier } from '../clients/PanierDeLaSeance';
import './attentions.css';

/* ══ AUJOURD'HUI, ET LA LIGNE DE L'ABONNÉE · 6 novembre 2026 ══════════════
   Lot 3 de l'abonnement refait (maquette
   `public/maquette-l-abonnement-refait.html`) : l'écran Abonnements s'ouvre
   sur ce qu'il y a à faire aujourd'hui.

   · Les séances de formule du jour, avec leur panier : « Arrivée », puis
     « Remise ».
   · Ce qui est à régler aujourd'hui ou en retard.
   · Les fins de carnet : le moment du sceau d'or, et de proposer de reprendre.
   · Les abonnées sans rendez-vous, avec leur jour d'habitude.

   « La ligne de l'abonnée » : une ligne par formule qui court, le résumé
   dessus, une seule ouverte à la fois.

   RIEN NE SE RECOMPTE ICI : les chiffres sont ceux du relevé du juge et du
   moteur. Les gestes d'argent restent ceux de l'écran (« Encaisser » ouvre
   le versement, « Suivi » la formule). */

const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const heureDe = (iso: string): string => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('fr-FR', { hour: 'numeric', minute: '2-digit', hour12: false, timeZone: 'Africa/Porto-Novo' }).format(d).replace(':', ' h ');
};

/** Le chemin de la formule en points : pleine, faite ; hachurée, réservée ; vide, disponible. */
function Points({ c }: { c: ReleveDuContrat }) {
  const bornees = c.seances.filter((l) => l.incluses !== null);
  if (bornees.length === 0) return null;
  const longue = bornees.reduce((m, l) => ((l.incluses ?? 0) > (m.incluses ?? 0) ? l : m));
  const pas = cheminDeLaLigne(c, longue, false) ?? [];
  if (pas.length === 0 || pas.length > 12) return null;
  return <span className="att-points" aria-hidden="true">{pas.map((p) => <i key={p.n} className={p.etat === 'faite' ? 'f' : p.etat === 'reservee' ? 'r' : ''} />)}</span>;
}

type Gestes = { onEncaisser: (sub: Subscriber) => void; onSuivi: (sub: Subscriber) => void };

export function Aujourdhui({ releves, moteur, clients, nomDe, aujourdhui, currency, onEncaisser, onSuivi, versLesAttentions }: Gestes & {
  releves: readonly ReleveDuContrat[];
  moteur: MoteurAbonnements;
  clients: readonly Client[];
  nomDe: (clientId: string) => string;
  aujourdhui: string;
  currency: Parameters<typeof fmtMoney>[1];
  versLesAttentions: () => void;
}) {
  const [articles] = useArticlesDAttention();
  const [paniers] = usePaniersDAttention();
  const sem = semaineDe(aujourdhui);
  const { duJour, cetteSemaine, fins, sans } = useMemo(() => ({
    duJour: seancesAPreparer(releves, aujourdhui, aujourdhui),
    cetteSemaine: seancesAPreparer(releves, sem.du, sem.au),
    fins: finsDeCarnet(releves, aujourdhui),
    sans: sansRendezVous(releves, aujourdhui),
  }), [releves, aujourdhui, sem.du, sem.au]);
  const cartesAEcrire = cetteSemaine.filter((s) => paniers.some((p) => p.id === s.apptId && p.etat === 'valide' && !p.remiseLe)).length;
  const dus = moteur.dues.filter((d) => d.dueIso <= aujourdhui);
  const releveDe = (subId: string) => releves.find((c) => c.sub.id === subId);
  const jourDe = (clientId: string): string => {
    const c = clients.find((x) => x.id === clientId);
    const j = c ? joursDeLaTete(c) : [];
    return j.length ? ` · son jour : le ${j.map((n) => JOURS[n]).join(' ou le ')}` : '';
  };
  const rien = duJour.length + dus.length + fins.length + sans.length === 0;

  return (
    <div className="att">
      <div className="att-bande">
        <div><b>{moteur.enCours}</b><span>formules en cours</span></div>
        <div><b>{cetteSemaine.length}</b><span>séances de formule cette semaine</span></div>
        <div><b>{moteur.aEncaisserXof > 0 ? fmtMoney(moteur.aEncaisserXof, currency) : '0'}</b><span>à encaisser d’ici la fin du mois</span></div>
        <div><b>{cartesAEcrire}</b><span>cartes à écrire cette semaine</span></div>
      </div>
      <h3 className="att-titre">À faire, {jourDitAvecLAnnee(aujourdhui)}</h3>
      {rien && <p className="att-vide">Rien à faire aujourd’hui pour les formules.</p>}
      <div className="att-fil">
        {duJour.map((s) => {
          const panier: PanierDAttention | undefined = paniers.find((p) => p.id === s.apptId);
          const c = releveDe(s.subId);
          return (
            <div key={s.apptId} className="att-rang">
              <div className="att-rang__quoi">
                <span><b>{heureDuFauteuil(s.time)} · {nomDe(s.clientId)}</b>{s.rang && s.total ? ` · séance ${s.rang} sur ${s.total}` : ` · ${s.formule}`}{c && <Points c={c} />}</span>
                <span className="att-petit">{panierDit(panier, articles, heureDe)}</span>
              </div>
              <div className="att-rang__gestes">
                {tempsDuPanier(panier) === 'a-valider'
                  ? <button type="button" className="tre-mini" onClick={versLesAttentions}>Les attentions</button>
                  : <GestesDuPanier panier={panier} compact />}
              </div>
            </div>
          );
        })}
        {dus.map((d) => (
          <div key={`${d.sub.id}:${d.numero}`} className="att-rang">
            <div className="att-rang__quoi">
              <span><b>À régler · {d.nom}</b> · {fmtMoney(d.montantXof, currency)}</span>
              <span className="att-petit">{d.formule} · échéance {d.numero} sur {d.total}, {d.retardJours > 0 ? `en retard de ${d.retardJours} jour${d.retardJours > 1 ? 's' : ''}` : 'due aujourd’hui'}.</span>
            </div>
            <div className="att-rang__gestes">
              <button type="button" className="tre-mini is-cuivre" onClick={() => onEncaisser(d.sub)}>Encaisser</button>
              <button type="button" className="tre-mini" onClick={() => onSuivi(d.sub)}>Suivi</button>
            </div>
          </div>
        ))}
        {fins.map((f) => {
          const panier = paniers.find((p) => p.id === f.apptId);
          const c = releveDe(f.subId);
          return (
            <div key={`fin:${f.subId}`} className="att-rang">
              <div className="att-rang__quoi">
                <span><b>Fin de carnet · {nomDe(f.clientId)}</b> · dernière séance le {jourDitAvecLAnnee(f.date)}</span>
                <span className="att-petit">{panier?.etat === 'valide' ? 'Le sceau d’or est prêt.' : 'Le sceau d’or est à valider, dans « Les attentions ».'} Proposer de reprendre un carnet.</span>
              </div>
              <div className="att-rang__gestes">{c && <button type="button" className="tre-mini" onClick={() => onSuivi(c.sub as Subscriber)}>Suivi</button>}</div>
            </div>
          );
        })}
        {sans.map((x) => {
          const c = releveDe(x.subId);
          return (
            <div key={`sans:${x.subId}`} className="att-rang">
              <div className="att-rang__quoi">
                <span><b>Sans rendez-vous · {nomDe(x.clientId)}</b>{x.disponibles === null ? '' : ` · ${x.disponibles} séance${x.disponibles > 1 ? 's' : ''} disponible${x.disponibles > 1 ? 's' : ''}`}</span>
                <span className="att-petit">{x.formule}{jourDe(x.clientId)}.</span>
              </div>
              <div className="att-rang__gestes">{c && <button type="button" className="tre-mini" onClick={() => onSuivi(c.sub as Subscriber)}>Suivi</button>}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const VIVANTS: readonly string[] = ['retenue', 'en-cours', 'en-pause', 'epuisee'];

/** LA LIGNE DE L'ABONNÉE : le résumé dessus, une seule ouverte à la fois. */
export function LesAbonnees({ comptes, aujourdhui, currency, onEncaisser, onSuivi }: Gestes & {
  comptes: readonly CompteAbonnement[];
  aujourdhui: string;
  currency: Parameters<typeof fmtMoney>[1];
}) {
  const [articles] = useArticlesDAttention();
  const [paniers] = usePaniersDAttention();
  const [ouverte, setOuverte] = useState<string | null>(null);
  const lignes = useMemo(() => comptes.flatMap((c) => c.contrats.filter((k) => VIVANTS.includes(k.etat)).map((k) => ({ nom: c.nom, k }))), [comptes]);
  if (lignes.length === 0) return null;
  const reglement = (k: ContratDuCompte): string =>
    (k.retardXof > 0 ? `${fmtMoney(k.retardXof, currency)} en retard` : k.resteXof > 0 ? `reste ${fmtMoney(k.resteXof, currency)}` : 'tout est réglé');
  return (
    <div className="att">
      <p className="att-petit">Une ligne par formule qui court, le résumé dessus. Une seule s’ouvre à la fois.</p>
      <div className="att-fil">
        {lignes.map(({ nom, k }) => {
          const c = k.releve;
          const prochaine = prochaineSeance(c, aujourdhui);
          const panier = prochaine ? paniers.find((p) => p.id === prochaine.apptId) : undefined;
          const dispo = seancesDisponibles(c);
          const ouvert = ouverte === k.sub.id;
          const quand = prochaine ? `${jourDitAvecLAnnee(prochaine.date)} à ${heureDuFauteuil(prochaine.time)}` : 'aucune';
          return (
            <div key={k.sub.id} className="att-rang">
              <div className="att-rang__quoi">
                <span><b>{nom}</b> · {c.nom}<Points c={c} /></span>
                <span className="att-petit">{reglement(k).replace(/^./, (x) => x.toUpperCase())} · prochaine séance : {quand}</span>
              </div>
              <div className="att-rang__gestes">
                <button type="button" className="tre-mini" aria-expanded={ouvert} onClick={() => setOuverte(ouvert ? null : k.sub.id)}>{ouvert ? 'Replier' : 'Ouvrir'}</button>
              </div>
              {ouvert && (
                <div className="att-rang__ouvert">
                  <div><span>Règlement</span><span>{fmtMoney(k.verseXof, currency)} versés · {reglement(k)}</span></div>
                  <div><span>Séances</span><span>{k.faites} faite{k.faites > 1 ? 's' : ''} · {k.reservees} réservée{k.reservees > 1 ? 's' : ''}{dispo === null ? '' : ` · ${dispo} disponible${dispo > 1 ? 's' : ''}`}</span></div>
                  <div><span>Prochaine séance</span><span>{quand}</span></div>
                  <div><span>Attention prévue</span><span>{!prochaine ? 'Pas de séance posée' : tempsDuPanier(panier) === 'a-valider' ? 'À valider, dans « Les attentions »' : panierDit(panier, articles, heureDe)}</span></div>
                  <div className="att-rang__gestes" style={{ justifyContent: 'flex-start' }}>
                    <button type="button" className="tre-mini" onClick={() => onSuivi(k.sub)}>Suivi</button>
                    <button type="button" className="tre-mini is-cuivre" onClick={() => onEncaisser(k.sub)}>Encaisser</button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
