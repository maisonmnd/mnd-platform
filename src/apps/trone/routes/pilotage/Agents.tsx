import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHead } from '../_ui';
import { Button, Input, Select, Textarea, toast, demande } from '../../../../ds/components';
import { useBranch } from '../../../../shared/branches';
import { useAuth, useStaff as useMonProfil } from '../../../../shared/auth';
import { fmtMoney } from '../../../../shared/currency';
import { useInvoices, invoiceResteXof } from '../../../../shared/finance';
import { useSettings } from '../../../../shared/settings';
import { useClients, type Client } from '../../../../shared/clients';
import { appelDe } from '../../../../shared/civilite';
import { lienWaMe } from '../../../../shared/conversations';
import { signeLeMessage } from '../../../../shared/identite';
import { uid } from '../../../../shared/store';
import { useCapturesLues } from '../../../../shared/ia-capture';
import { capturesAInscrire } from '../../../../shared/ia-capture-pur';
import { demandeAClaude, versionDeIaMaison } from '../../../../shared/ia-maison';
import { saitLeTableauIntelligent, dollarsDits } from '../../../../shared/ia-maison-pur';
import { demandeDeProcessus } from '../../../../shared/ia-tableau-pur';
import { relisLaMarque, bloquant } from '../../../../shared/ia-marque-pur';
import { prenomEtInitiale } from '../../../../shared/ia-anonymise-pur';
import {
  AUDIENCES_DES_PROCESSUS, JOURS_DE_LA_SEMAINE, MESSAGE_DES_REPRISES, audienceDite, compteRendu, listeDuPassage,
  messageDeLaLigne, nettoieLeProcessus, prochainCreneau, statsDuProcessus,
  type CleDAudience, type Passage, type Processus,
} from '../../../../shared/processus-pur';
import { RdvModal, apptDueXof, apptNetXof, todayISO, useBranchAppointments, useServicesById } from '../clients/_shared';
import {
  enregistreLeProcessus, maintenantLocal, poseLeStatut, preparePassageMaintenant, retireLeProcessus, useDepenseDuMois, useLancePassagesDus,
  useLesProcessus, usePlacesLibres, useTetesDuProcessus,
} from './agents-donnees';
import { AgentDeLaComptabilite, AgentDesAvis, AgentDuPlanning, AgentDuStock, Chiffres, TeteDAgent } from './AgentsSuivants';
import { tauxDeRealisation } from '../../../../shared/cadence';
import { JUSTESSE_PAR_DEFAUT } from '../../../../shared/prevision-du-mois-pur';
import './agents.css';

/* ═══════════════════════════════════════════════════════════════════
   LES AGENTS DE LA MAISON — 24 octobre 2026, maquette VJ5PJEGUPDbYKUgEdMUNbS
   (vues 2 et 3), « Construire le reste ». Onglet du Centre de commande,
   réservé aux souverains.

   TROIS PARTS, DANS L'ORDRE OÙ ELLE LES LIT :
     ① À VALIDER : les listes que les processus ont posées ; chaque ligne
        attend son geste (écrire sur WhatsApp, poser le rendez-vous, ou
        « pas maintenant ») ;
     ② LES AGENTS : les encaissements (ce qui attend un oui, sans écrire à
        personne) et les reprises (un processus livré, à allumer) ;
     ③ LES PROCESSUS : ceux qu'elle a construits, et l'assistant qui en
        propose un à partir d'une phrase (Claude, chantier `processus`), ou
        à la main sans lui.

   RIEN NE PART SEUL. « Écrire sur WhatsApp » ouvre WhatsApp avec le message
   prêt : c'est elle qui appuie sur Envoyer. */

const heureDite = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return `${h} h${m ? ` ${String(m).padStart(2, '0')}` : ''}`;
};
const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const creneauDit = (c: string) => {
  const [iso, h] = c.split('T');
  const [a, m, j] = iso.split('-').map(Number);
  const jds = new Date(Date.UTC(a, m - 1, j)).getUTCDay();
  return `${JOURS_DE_LA_SEMAINE[jds]} ${j === 1 ? '1er' : j} ${MOIS[m - 1]} ${a} à ${heureDite(h)}`;
};
const joursDits = (jours: readonly number[]) => (jours.length === 7 ? 'chaque jour' : `chaque ${jours.map((j) => JOURS_DE_LA_SEMAINE[j]).join(', ')}`);
const pluriel = (n: number, un: string, plusieurs: string) => `${n} ${n > 1 ? plusieurs : un}`;

export default function Agents() {
  const navigate = useNavigate();
  const { branch } = useBranch();
  const { session } = useAuth();
  const monProfil = useMonProfil();
  const estSouverain = monProfil?.role === 'souverain';
  const monNom = monProfil?.name?.trim() || (session?.user?.email ?? '').split('@')[0] || 'La direction';
  const { processus, passages } = useLesProcessus();
  const tetes = useTetesDuProcessus(passages);
  useLancePassagesDus(estSouverain, processus, passages, tetes);
  const placesPour = usePlacesLibres();
  const [clients] = useClients();
  const depense = useDepenseDuMois();
  const [rdvPour, setRdvPour] = useState<{ passageId: string; clientId: string; date?: string; time?: string; avant: number } | null>(null);
  const appts = useBranchAppointments();
  const aujourdhui = todayISO();
  const maintenantMin = (() => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); })();

  const ficheDe = (id: string) => clients.find((c) => c.id === id);
  const nomDe = (p: Processus | undefined) => p?.nom ?? 'Un processus';
  const aValider = passages.filter((x) => x.lignes.some((l) => l.statut === 'a-valider'));
  const recents = passages.filter((x) => !x.lignes.some((l) => l.statut === 'a-valider')).slice(0, 4);
  const agentReprises = processus.find((p) => p.agent === 'reprises');
  const construits = processus.filter((p) => !p.agent);

  const aReserveDepuis = (clientId: string, depuis: string) =>
    appts.some((a) => a.clientId === clientId && a.status !== 'annulé' && a.date >= depuis);

  return (
    <div className="agt">
      <PageHead
        eyebrow="Centre de commande · Les agents"
        title="Une équipe numérique, formée à vos règles."
        sub="Ils proposent, vous décidez."
        actions={depense && (
          <div className="agt-budget" title="Le compteur de la fonction ia-maison, ce mois-ci à Cotonou">
            <span className="agt-sur">Claude ce mois</span>
            <span className="agt-budget__chiffre">{dollarsDits(depense.usd)} <span className="agt-doux">sur {depense.plafond} $</span></span>
            <div className="agt-jauge" aria-hidden="true"><div style={{ width: `${Math.min(100, (depense.usd / depense.plafond) * 100)}%` }} /></div>
          </div>
        )}
      />

      {/* ══ ① À VALIDER ══ */}
      <section className="agt-carte agt-valider" aria-label="À valider">
        <div className="agt-entre"><span className="agt-sur">À valider</span><span className="agt-doux">{aValider.length === 0 ? 'rien n’attend' : pluriel(aValider.reduce((n, x) => n + x.lignes.filter((l) => l.statut === 'a-valider').length, 0), 'ligne', 'lignes')}</span></div>
        {aValider.length === 0 && <p className="agt-doux agt-vide">Rien n’attend votre oui. Les listes arrivent ici à l’heure de leur processus, quand le Trône est ouvert.</p>}
        {aValider.map((x) => (
          <ListeAValider key={x.id} passage={x} processus={processus.find((p) => p.id === x.processusId)}
            ficheDe={ficheDe} placesPour={placesPour} monNom={monNom}
            poser={(clientId, date, time) => setRdvPour({ passageId: x.id, clientId, date, time, avant: appts.filter((a) => a.clientId === clientId).length })} />
        ))}
        {recents.length > 0 && (
          <div className="agt-recents">
            <span className="agt-sur">Les derniers passages</span>
            {recents.map((x) => {
              const cr = compteRendu(x, aReserveDepuis);
              return (
                <div key={x.id} className="agt-recent">
                  <span>{nomDe(processus.find((p) => p.id === x.processusId))} · {creneauDit(x.prevuA)}</span>
                  <span className="agt-doux">{x.lignes.length === 0 ? 'personne à relancer' : `${pluriel(cr.ecrites, 'écrite', 'écrites')}, ${cr.reserve} ${cr.reserve > 1 ? 'ont' : 'a'} réservé depuis`}</span>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ══ ② LES AGENTS ══ */}
      <div className="agt-grille">
        <AgentDesEncaissements />
        {agentReprises && (
          <AgentDesReprises agent={agentReprises} passages={passages} tetes={tetes} aujourdhui={aujourdhui} maintenantMin={maintenantMin} monNom={monNom} />
        )}
      </div>
      {/* LES QUATRE AUTRES (24 octobre 2026, « construis les quatre autres
          agents ») : ils lisent et proposent, chaque geste est un clic. */}
      <div className="agt-grille">
        <AgentDuPlanning preparerUneListe={() => {
          if (!agentReprises) return;
          const r = preparePassageMaintenant(agentReprises, tetes);
          toast(r.lignes === 0 ? 'Aucune cliente à relancer aujourd’hui : la liste est vide.' : `${r.lignes} cliente${r.lignes > 1 ? 's' : ''} à relancer, en haut dans « À valider », avec les places libres des prochains jours.`);
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }} />
        <AgentDeLaComptabilite />
        <AgentDesAvis />
        <AgentDuStock />
      </div>

      {/* ══ ③ LES PROCESSUS ══ */}
      <section className="agt-carte agt-processus" aria-label="Les processus">
        <div className="agt-entre"><span className="agt-sur">Les processus de la Maison</span><span className="agt-doux">{pluriel(construits.length, 'processus', 'processus')}</span></div>
        <ul className="agt-liste">
          <li><span>Relances des factures · J+1, 3, 7, 14</span><button type="button" className="agt-lien" onClick={() => navigate('/parametres')}>Paramètres ›</button></li>
          <li><span>Confirmations · salle d’attente de 10 min</span><button type="button" className="agt-lien" onClick={() => navigate('/conversations?envois=1')}>Les envois ›</button></li>
          {construits.map((p) => {
            const s = statsDuProcessus(passages, p.id);
            const prochain = prochainCreneau(p, aujourdhui, maintenantMin);
            return (
              <li key={p.id} className="agt-ligne-processus">
                <span className="agt-ligne-processus__nom">
                  <b>{p.nom}</b>
                  <span className="agt-doux">{joursDits(p.jours)} à {heureDite(p.heure)} · {audienceDite(p.audience, p.delaiJours)}{p.avecPlaces ? ' · avec deux places' : ''}</span>
                  <span className="agt-doux">{p.actif ? (prochain ? `prochain passage ${creneauDit(prochain)}` : 'allumé') : 'éteint'} · {pluriel(s.proposes, 'proposée', 'proposées')}, {pluriel(s.ecrits + s.poses, 'écrite', 'écrites')}</span>
                </span>
                <span className="agt-gestes">
                  <Button size="sm" variant={p.actif ? 'ghost' : 'copper'} onClick={() => enregistreLeProcessus({ ...p, actif: !p.actif, actifDepuis: !p.actif ? maintenantLocal() : p.actifDepuis })}>{p.actif ? 'Éteindre' : 'Allumer'}</Button>
                  <Button size="sm" variant="ghost" onClick={async () => {
                    if (!await demande({ quoi: 'Processus', titre: `Retirer « ${p.nom} » ?`, dit: 'Ses listes encore à valider partent avec lui ; ce qui a été écrit reste noté.', accepter: 'Retirer le processus', refuser: 'Le garder' })) return;
                    retireLeProcessus(p);
                    toast('Processus retiré.');
                  }}>Retirer</Button>
                </span>
              </li>
            );
          })}
        </ul>
        <Constructeur branchId={branch.id} monNom={monNom} tetes={tetes} aujourdhui={aujourdhui} />
      </section>

      <section className="agt-carte agt-regles" aria-label="Ce qu’ils ne font jamais">
        <span className="agt-sur">Ce qu’ils ne font jamais</span>
        <p>Rien ne part sans votre geste · aucun chiffre inventé · ni nom ni numéro chez Claude · ni prix ni numéro de pièce dans un message · une même cliente au plus une fois en 30 jours.</p>
      </section>

      {rdvPour && (
        <RdvModal
          title="Poser le rendez-vous"
          initial={{ clientId: rdvPour.clientId, date: rdvPour.date, time: rdvPour.time }}
          onClose={() => {
            const pose = appts.filter((a) => a.clientId === rdvPour.clientId).length > rdvPour.avant;
            if (pose) poseLeStatut(rdvPour.passageId, rdvPour.clientId, 'pose', monNom);
            setRdvPour(null);
          }}
        />
      )}
    </div>
  );
}

/* ═══ UNE LISTE À VALIDER ═══════════════════════════════════════════ */
function ListeAValider({ passage, processus, ficheDe, placesPour, monNom, poser }: {
  passage: Passage;
  processus: Processus | undefined;
  ficheDe: (id: string) => Client | undefined;
  placesPour: (clientId: string) => { iso: string; heure: string }[];
  monNom: string;
  poser: (clientId: string, date?: string, time?: string) => void;
}) {
  const [ouverte, setOuverte] = useState<string | null>(null);
  const lignes = passage.lignes.filter((l) => l.statut === 'a-valider');
  const modele = processus?.message ?? MESSAGE_DES_REPRISES;
  return (
    <div className="agt-passage">
      <div className="agt-passage__tete">
        <b>{processus?.nom ?? 'Un processus retiré'}</b>
        <span className="agt-doux">{creneauDit(passage.prevuA)} · {pluriel(lignes.length, 'à valider', 'à valider')}</span>
      </div>
      {lignes.map((l) => {
        const c = ficheDe(l.clientId);
        const places = processus?.avecPlaces ? placesPour(l.clientId) : [];
        const texte = signeLeMessage(messageDeLaLigne(modele, { appel: appelDe(c ?? null, c?.name), places, avecPlaces: !!processus?.avecPlaces }));
        const lien = lienWaMe(c?.phone, texte);
        const estOuverte = ouverte === l.clientId;
        return (
          <div key={l.clientId} className={`agt-ligne${estOuverte ? ' is-open' : ''}`}>
            <div className="agt-ligne__tete">
              <button type="button" className="agt-ligne__nom" aria-expanded={estOuverte} onClick={() => setOuverte(estOuverte ? null : l.clientId)}>
                <b>{c?.name ?? 'Fiche introuvable'}</b>
                <span className="agt-doux">{l.raison}</span>
              </button>
              <span className="agt-gestes">
                {lien
                  ? <a className="mnd-btn mnd-btn--copper mnd-btn--sm" href={lien} target="_blank" rel="noreferrer" onClick={() => poseLeStatut(passage.id, l.clientId, 'ecrit', monNom)}>Écrire sur WhatsApp</a>
                  : <span className="agt-doux">pas de numéro</span>}
                <Button size="sm" variant="ghost" onClick={() => poser(l.clientId, places[0]?.iso, places[0]?.heure)}>Poser le RDV</Button>
                <Button size="sm" variant="ghost" onClick={() => poseLeStatut(passage.id, l.clientId, 'ecarte', monNom)}>Pas maintenant</Button>
              </span>
            </div>
            {estOuverte && <p className="agt-message">{texte}</p>}
          </div>
        );
      })}
    </div>
  );
}

/* ═══ L'AGENT DES ENCAISSEMENTS ═════════════════════════════════════
   Il n'écrit à personne : les relances des factures ont leur tournée au
   serveur, les captures leur lecture. Il rassemble ce qui attend un oui,
   EN CHIFFRES, avec le total à encaisser (24 octobre 2026). */
function AgentDesEncaissements() {
  const { branch, currency } = useBranch();
  const [captures] = useCapturesLues();
  const [reglages] = useSettings();
  const [invoices] = useInvoices();
  const appts = useBranchAppointments();
  const byId = useServicesById();
  const lues = capturesAInscrire(captures).length;
  const factures = useMemo(() => invoices.filter((i) => i.branchId === branch.id && i.kind === 'facture' && invoiceResteXof(i) > 0), [invoices, branch.id]);
  const resteFactures = factures.reduce((s, i) => s + invoiceResteXof(i), 0);
  const aujourdhui = todayISO();
  const rituels = useMemo(() => appts.filter((a) => a.status === 'honoré' && !a.invoiceId && a.date < aujourdhui && apptDueXof(a, byId) > 0), [appts, byId, aujourdhui]);
  const resteRituels = rituels.reduce((s, a) => s + apptDueXof(a, byId), 0);
  const relancesActives = !!reglages.relances?.actives;
  const fmt = (x: number) => fmtMoney(x, currency);
  return (
    <section className="agt-carte agt-agent" aria-label="L’agent des encaissements">
      <TeteDAgent nom="Les encaissements" rythme="chaque jour" autonomie="après votre oui" />
      <Chiffres
        lignes={[
          { libelle: 'Captures MoMo et KkiaPay à inscrire', nombre: lues, geste: <LienVers vers="/conversations">Inscrire</LienVers> },
          { libelle: 'Factures avec un reste', nombre: factures.length, montant: fmt(resteFactures), geste: <LienVers vers="/creances">Les créances</LienVers> },
          { libelle: 'Rituels honorés sans versement', nombre: rituels.length, montant: fmt(resteRituels), geste: <LienVers vers="/carnet">Le carnet</LienVers> },
          { libelle: 'Relances J+1, 3, 7, 14', nombre: relancesActives ? 'allumées' : 'éteintes', geste: <LienVers vers={relancesActives ? '/a-faire' : '/parametres'}>{relancesActives ? 'À appeler' : 'Les allumer'}</LienVers> },
        ]}
        total={{ libelle: 'Total à encaisser', nombre: factures.length + rituels.length, montant: fmt(resteFactures + resteRituels) }}
      />
    </section>
  );
}

function LienVers({ vers, children }: { vers: string; children: string }) {
  const navigate = useNavigate();
  return <button type="button" className="agt-lien" onClick={() => navigate(vers)}>{children} ›</button>;
}

/* ═══ L'AGENT DES REPRISES : un processus livré, à régler et à allumer.
   Son total prévisionnel : la valeur du dernier rituel de chaque cliente
   trouvée, comptée à la justesse mesurée de la Cadence (la même que la
   prévision du mois). ═══ */
function AgentDesReprises({ agent, passages, tetes, aujourdhui, maintenantMin, monNom }: {
  agent: Processus;
  passages: Passage[];
  tetes: ReturnType<typeof useTetesDuProcessus>;
  aujourdhui: string;
  maintenantMin: number;
  monNom: string;
}) {
  const { currency } = useBranch();
  const appts = useBranchAppointments();
  const byId = useServicesById();
  const [delai, setDelai] = useState(agent.delaiJours);
  const [avecPlaces, setAvecPlaces] = useState(agent.avecPlaces);
  const [message, setMessage] = useState(agent.message);
  const [reglage, setReglage] = useState(false);
  const s = statsDuProcessus(passages, agent.id);
  const prochain = prochainCreneau(agent, aujourdhui, maintenantMin);
  const essai = listeDuPassage({ audience: 'reprises', delaiJours: delai }, tetes, aujourdhui);
  const { valeur, justesse } = useMemo(() => {
    const ids = new Set(essai.map((l) => l.clientId));
    let v = 0;
    for (const id of ids) {
      const dernier = appts.filter((a) => a.clientId === id && a.status === 'honoré').sort((a, b) => a.date.localeCompare(b.date)).pop();
      if (dernier) v += apptNetXof(dernier, byId);
    }
    const juste = tauxDeRealisation(appts.filter((a) => a.status === 'honoré' && !(a.seriesIndex && a.seriesIndex > 1)));
    return { valeur: v, justesse: juste ? juste.dans14 / 100 : JUSTESSE_PAR_DEFAUT };
  }, [essai, appts, byId]);
  const fmt = (x: number) => fmtMoney(x, currency);
  const remarques = relisLaMarque(message, { campagne: true });
  const sauve = (actif: boolean) => {
    if (bloquant(remarques)) { toast(remarques.find((r) => r.gravite === 'bloque')!.dit); return; }
    enregistreLeProcessus({ ...agent, delaiJours: delai, avecPlaces, message, actif, actifDepuis: actif && !agent.actif ? maintenantLocal() : agent.actifDepuis, creePar: agent.creePar === 'La Maison' ? monNom : agent.creePar });
    toast(actif ? (agent.actif ? 'Réglages enregistrés.' : `Allumé : premier passage ${prochain ? creneauDit(prochain) : 'au prochain lundi'}.`) : 'Éteint : il ne pose plus de liste.');
    setReglage(false);
  };
  return (
    <section className="agt-carte agt-agent" aria-label="L’agent des reprises">
      <TeteDAgent nom={agent.nom} rythme={agent.actif ? (prochain ? creneauDit(prochain) : 'allumé') : 'éteint'} autonomie="propose" />
      <Chiffres
        lignes={[
          { libelle: <>Clientes en retard <span className="agt-doux">(au moins {delai} jours, rien de posé)</span></>, nombre: essai.length },
          { libelle: 'Valeur de leurs derniers rituels', montant: fmt(valeur) },
          { libelle: <>Justesse de la Cadence</>, nombre: `× ${Math.round(justesse * 100)} %` },
          { libelle: 'Proposées · écrites ou posées · écartées', nombre: `${s.proposes} · ${s.ecrits + s.poses} · ${s.ecartes}` },
        ]}
        total={{ libelle: 'À faire revenir (prévision)', montant: fmt(Math.round((valeur * justesse) / 1000) * 1000) }}
      />
      {reglage ? (
        <div className="agt-reglage">
          <label>Retard d’au moins
            <Select value={String(delai)} onChange={(e) => setDelai(Number(e.target.value))}>
              {[7, 10, 14, 21, 30].map((d) => <option key={d} value={d}>{d} jours</option>)}
            </Select>
          </label>
          <label className="agt-case"><input type="checkbox" checked={avecPlaces} onChange={(e) => setAvecPlaces(e.target.checked)} /> Proposer deux places libres de la semaine</label>
          <label>Le message ({'{appel}'} : comment on s’adresse à elle ; {'{places}'} : les places)
            <Textarea rows={3} value={message} onChange={(e) => setMessage(e.target.value)} />
          </label>
          {remarques.map((r) => <span key={r.regle + r.extrait} className={r.gravite === 'bloque' ? 'agt-alerte' : 'agt-doux'}>{r.dit}</span>)}
          <div className="agt-gestes">
            <Button size="sm" variant="copper" onClick={() => sauve(agent.actif)}>Enregistrer</Button>
            <Button size="sm" variant="ghost" onClick={() => setReglage(false)}>Annuler</Button>
          </div>
        </div>
      ) : (
        <div className="agt-gestes">
          <Button size="sm" variant={agent.actif ? 'ghost' : 'copper'} onClick={() => sauve(!agent.actif)}>{agent.actif ? 'Éteindre' : 'Allumer'}</Button>
          <Button size="sm" variant="ghost" onClick={() => setReglage(true)}>Lui apprendre quelque chose</Button>
        </div>
      )}
    </section>
  );
}

/* ═══ CONSTRUIRE UN PROCESSUS : en parlant (Claude) ou à la main ═══════ */
type Brouillon = Pick<Processus, 'nom' | 'jours' | 'heure' | 'audience' | 'delaiJours' | 'avecPlaces' | 'message'>;
const BROUILLON_VIDE: Brouillon = { nom: 'Les reprises du lundi', jours: [1], heure: '09:00', audience: 'reprises', delaiJours: 10, avecPlaces: true, message: MESSAGE_DES_REPRISES };

function Constructeur({ branchId, monNom, tetes, aujourdhui }: {
  branchId: string;
  monNom: string;
  tetes: ReturnType<typeof useTetesDuProcessus>;
  aujourdhui: string;
}) {
  const [phrase, setPhrase] = useState('');
  const [brouillon, setBrouillon] = useState<Brouillon | null>(null);
  const [clarifier, setClarifier] = useState('');
  const [enCours, setEnCours] = useState(false);
  const [claude, setClaude] = useState<boolean | null>(null);
  const [clients] = useClients();
  useEffect(() => { let v = true; void versionDeIaMaison().then((x) => { if (v) setClaude(saitLeTableauIntelligent(x)); }); return () => { v = false; }; }, []);

  const proposer = async () => {
    if (!phrase.trim()) return;
    setEnCours(true);
    const r = await demandeAClaude(demandeDeProcessus(phrase));
    setEnCours(false);
    if (!r.ok) { toast(r.message); return; }
    const n = nettoieLeProcessus(r.data as Record<string, unknown>);
    if (!n.ok) { toast(n.raison); return; }
    setBrouillon(n.processus);
    setClarifier(n.aClarifier);
  };

  const b = brouillon;
  const essai = b ? listeDuPassage(b, tetes, aujourdhui) : [];
  const remarques = b ? relisLaMarque(b.message, { campagne: true }) : [];
  const audience = b ? AUDIENCES_DES_PROCESSUS.find((a) => a.cle === b.audience) : undefined;
  const garde = (actif: boolean) => {
    if (!b) return;
    if (!b.jours.length) { toast('Choisissez au moins un jour.'); return; }
    if (bloquant(remarques)) { toast(remarques.find((r) => r.gravite === 'bloque')!.dit); return; }
    const maintenant = maintenantLocal();
    enregistreLeProcessus({ ...b, id: `prc-${uid()}`, branchId, actif, actifDepuis: actif ? maintenant : undefined, creePar: monNom, creeLe: maintenant });
    toast(actif ? `« ${b.nom} » est allumé.` : `« ${b.nom} » est gardé, éteint.`);
    setBrouillon(null); setPhrase(''); setClarifier('');
  };

  return (
    <div className="agt-constructeur">
      <span className="agt-sur">Construire un processus</span>
      <div className="agt-constructeur__phrase">
        <Textarea rows={2} value={phrase} onChange={(e) => setPhrase(e.target.value)}
          placeholder="Décrivez-le en une phrase : « chaque vendredi, rappelle les clientes venues une seule fois il y a deux mois »" aria-label="La phrase du processus" />
        <div className="agt-gestes">
          {claude && <Button variant="copper" size="sm" onClick={() => { void proposer(); }} disabled={enCours || !phrase.trim()}>{enCours ? 'L’assistant lit…' : 'Proposer avec l’assistant'}</Button>}
          <Button variant="ghost" size="sm" onClick={() => { setBrouillon(BROUILLON_VIDE); setClarifier(''); }}>Composer à la main</Button>
        </div>
        {claude === false && <span className="agt-doux agt-petit">L’assistant attend la nouvelle fonction ia-maison (dossier du bureau « A recoller - ia-maison ») ; à la main, tout marche déjà.</span>}
      </div>
      {b && (
        <div className="agt-brouillon">
          {clarifier && <p className="agt-clarifier">L’assistant demande : {clarifier}</p>}
          <label>Le nom<Input value={b.nom} onChange={(e) => setBrouillon({ ...b, nom: e.target.value })} /></label>
          <div className="agt-champ">
            <span>Quand</span>
            <div className="agt-jours" role="group" aria-label="Les jours">
              {JOURS_DE_LA_SEMAINE.map((j, i) => (
                <button key={j} type="button" aria-pressed={b.jours.includes(i)} className={`agt-puce${b.jours.includes(i) ? ' is-on' : ''}`}
                  onClick={() => setBrouillon({ ...b, jours: b.jours.includes(i) ? b.jours.filter((x) => x !== i) : [...b.jours, i].sort() })}>{j.slice(0, 3)}</button>
              ))}
              <Select value={b.heure} onChange={(e) => setBrouillon({ ...b, heure: e.target.value })} aria-label="L’heure">
                {['08:00', '09:00', '10:00', '11:00', '12:00', '14:00', '16:00', '18:00'].map((h) => <option key={h} value={h}>{heureDite(h)}</option>)}
              </Select>
            </div>
          </div>
          <div className="agt-champ">
            <span>Qui</span>
            <div className="agt-jours">
              <Select value={b.audience} onChange={(e) => {
                const a = AUDIENCES_DES_PROCESSUS.find((x) => x.cle === e.target.value)!;
                setBrouillon({ ...b, audience: a.cle as CleDAudience, delaiJours: a.delai ?? 0 });
              }} aria-label="L’audience">
                {AUDIENCES_DES_PROCESSUS.map((a) => <option key={a.cle} value={a.cle}>{a.nom}</option>)}
              </Select>
              {audience?.delai !== null && (
                <Select value={String(b.delaiJours)} onChange={(e) => setBrouillon({ ...b, delaiJours: Number(e.target.value) })} aria-label="Le délai">
                  {[...new Set([7, 10, 14, 21, 30, 45, 60, 90, 120, 180, b.delaiJours])].sort((x, y) => x - y).map((d) => <option key={d} value={d}>{d} jours</option>)}
                </Select>
              )}
            </div>
            <span className="agt-doux agt-petit">{audienceDite(b.audience, b.delaiJours)}.</span>
          </div>
          <label className="agt-case"><input type="checkbox" checked={b.avecPlaces} onChange={(e) => setBrouillon({ ...b, avecPlaces: e.target.checked })} /> Proposer deux places libres de la semaine</label>
          <label>Le message<Textarea rows={3} value={b.message} onChange={(e) => setBrouillon({ ...b, message: e.target.value })} /></label>
          {remarques.map((r) => <span key={r.regle + r.extrait} className={r.gravite === 'bloque' ? 'agt-alerte' : 'agt-doux'}>{r.dit}</span>)}
          <p className="agt-essai">Cette semaine, il aurait trouvé <b>{pluriel(essai.length, 'cliente', 'clientes')}</b>
            {essai.length > 0 && <> ({essai.slice(0, 3).map((l) => { const c = clients.find((x) => x.id === l.clientId); const m = (c?.name ?? '').trim().split(/\s+/); return prenomEtInitiale({ prenom: m[0] ?? '', nom: m.slice(1).join(' ') }); }).join(', ')}{essai.length > 3 ? ` et ${essai.length - 3} autre${essai.length - 3 > 1 ? 's' : ''}` : ''})</>}.
            Au passage suivant, il dira qui a réservé.</p>
          <div className="agt-gestes">
            <Button variant="copper" size="sm" onClick={() => garde(true)}>Allumer</Button>
            <Button variant="ghost" size="sm" onClick={() => garde(false)}>Garder éteint</Button>
            <Button variant="ghost" size="sm" onClick={() => setBrouillon(null)}>Abandonner</Button>
          </div>
        </div>
      )}
    </div>
  );
}
