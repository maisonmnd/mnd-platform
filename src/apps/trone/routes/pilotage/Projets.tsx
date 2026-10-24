import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { PageHead } from '../_ui';
import { Button, Input, Modal, Select, Textarea, toast, demande } from '../../../../ds/components';
import { ChampDeDate } from '../../../../ds/dates';
import { useBranch } from '../../../../shared/branches';
import { useAuth, useStaff as useMonProfil } from '../../../../shared/auth';
import { useInvoices } from '../../../../shared/finance';
import { uid } from '../../../../shared/store';
import {
  filStore, useFil, nouveauMessage, demandeOuverte, estDemande, puisJeClore, CANAL_MAISON, A_PRENDRE,
  type FilMessage,
} from '../../../../shared/fil';
import { projetsStore, useProjets } from '../../../../shared/projets';
import {
  COLONNES_DU_TABLEAU, NOMS_DES_ETATS, ajouteJours, avancementDe, colonneDe, dateCourte, etatDuJalon,
  etatDuProjet, fenetreDu, filtreLesProjets, moisDeLaFenetre, positionDans, prochaineEtape,
  projetIncomplet, propositionDeConfier, seancesParSemaine, tachesDu, tachesParSemaine, tacheEnRetard,
  type EtatDuProjet, type FiltreDesProjets, type JalonDuProjet, type Membre, type Projet, type TacheDuProjet,
} from '../../../../shared/projets-pur';
import { useStaff, useAnnuaire, nomDuCompte, adresseDe } from '../equipe/data';
import { useBranchAppointments } from '../clients/_shared';
import { DEPARTEMENTS } from '../index';
import './projets.css';

/* ═══════════════════════════════════════════════════════════════════
   LES PROJETS — 24 octobre 2026, maquette VJ5PJEGUPDbYKUgEdMUNbS (vues 5
   à 7), « construis » le même soir. Les règles vivent dans
   `shared/projets-pur.ts` ; cet écran les montre et pose les gestes.

   QUATRE VUES, LES MÊMES PROJETS : la Liste (ouverte en premier, choix du
   sélecteur), le Tableau des tâches, le Calendrier, l'Équipe. Un projet
   s'ouvre à la même adresse (`?p=`), sans quitter l'écran.

   UNE TÂCHE EST UNE DEMANDE DU FIL : l'ajouter ici la pose dans le fil de la
   Maison et sur le Tableau de l'équipe ; la cocher ici la coche là-bas. */

type Vue = 'liste' | 'tableau' | 'calendrier' | 'equipe';
const VUES: { cle: Vue; nom: string }[] = [
  { cle: 'liste', nom: 'Liste' },
  { cle: 'tableau', nom: 'Tableau' },
  { cle: 'calendrier', nom: 'Calendrier' },
  { cle: 'equipe', nom: 'Équipe' },
];

const p2 = (n: number) => String(n).padStart(2, '0');
const aujourdhuiLocal = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
};
const maintenant = (): string => {
  const d = new Date();
  return `${aujourdhuiLocal()}T${p2(d.getHours())}:${p2(d.getMinutes())}`;
};
const pluriel = (n: number, un: string, plusieurs: string) => `${n} ${n > 1 ? plusieurs : un}`;
const initiale = (nom: string) => (nom.trim()[0] ?? '?').toUpperCase();

const SIGNES: Record<EtatDuProjet, string> = { heure: '●', retard: '▲', oui: '◆', clos: '■' };

export default function Projets() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { branch } = useBranch();
  const { session } = useAuth();
  const monProfil = useMonProfil();
  const [tous] = useFil();
  const [invoices] = useInvoices();
  const [equipe] = useStaff();
  const [annuaire] = useAnnuaire();
  const [projetsDeTous] = useProjets();
  const rdvs = useBranchAppointments();

  const monMail = (session?.user?.email ?? '').trim().toLowerCase();
  const maFiche = equipe.find((m) => adresseDe(m) === monMail);
  const monNom = nomDuCompte(annuaire, monMail, maFiche?.name?.trim() || monMail.split('@')[0] || 'La maison');
  /* Seuls les souverains ouvrent un projet et nomment son pilote (choix du
     24 octobre 2026). Le profil serveur fait foi, comme au Tableau. */
  const estSouverain = monProfil?.role === 'souverain';
  const aujourdhui = useMemo(aujourdhuiLocal, []);

  const [vue, setVue] = useState<Vue>('liste');
  const [filtre, setFiltre] = useState<FiltreDesProjets>('tous');
  const [edition, setEdition] = useState<Projet | 'nouveau' | null>(null);
  const [ecartees, setEcartees] = useState<string[]>([]);

  const membres = useMemo(
    () => equipe
      .filter((mb) => mb.branchId === branch.id && adresseDe(mb) !== '')
      .sort((a, b) => (a.ordre ?? 900) - (b.ordre ?? 900) || a.name.localeCompare(b.name)),
    [equipe, branch.id],
  );
  const lesMembres: Membre[] = useMemo(() => membres.map((mb) => ({ mail: adresseDe(mb), nom: mb.name })), [membres]);
  const nomDe = (mail: string | undefined, repli: string): string =>
    nomDuCompte(annuaire, mail, equipe.find((mb) => adresseDe(mb) === (mail ?? '').toLowerCase())?.name?.trim() || repli);

  const projets = useMemo(() => projetsDeTous.filter((p) => p.branchId === branch.id), [projetsDeTous, branch.id]);
  const nomsDesProjets = useMemo(() => new Map(projets.map((p) => [p.id, p.nom])), [projets]);

  /* Les demandes du Fil rattachées à un projet ; `close` lit la vraie fin
     (case cochée, ou pièce soldée), comme le Tableau. */
  const taches: TacheDuProjet[] = useMemo(
    () => tous
      .filter((m) => m.branchId === branch.id && estDemande(m) && !!m.projetId)
      .map((m) => ({
        id: m.id, texte: m.texte, projetId: m.projetId, jalonId: m.jalonId,
        demandePour: m.demandePour, demandePourNom: m.demandePourNom, echeance: m.echeance,
        faitAt: m.faitAt, auteurNom: m.auteurNom, at: m.at, close: !demandeOuverte(m, invoices),
      })),
    [tous, branch.id, invoices],
  );
  /* Les tâches des projets rangés ne pèsent plus sur personne. */
  const ouverts = useMemo(() => new Set(projets.filter((p) => p.statut !== 'clos').map((p) => p.id)), [projets]);
  const tachesVives = useMemo(() => taches.filter((t) => ouverts.has(t.projetId ?? '')), [taches, ouverts]);

  const etatDe = (p: Projet): EtatDuProjet => etatDuProjet(p, tachesDu(p.id, taches), aujourdhui);
  const visibles = filtreLesProjets(projets, filtre, monMail, etatDe)
    .sort((a, b) => a.fin.localeCompare(b.fin) || a.nom.localeCompare(b.nom));
  const actifs = projets.filter((p) => p.statut !== 'clos');

  /* Quatre fenêtres de sept jours, dès aujourd'hui (voir projets-pur.ts). */
  const lundis = useMemo(() => [0, 1, 2, 3].map((i) => ajouteJours(aujourdhui, 7 * i)), [aujourdhui]);
  const charge = useMemo(() => tachesParSemaine(tachesVives, lesMembres, lundis), [tachesVives, lesMembres, lundis]);
  const proposition = useMemo(
    () => propositionDeConfier(charge, tachesVives.filter((t) => !ecartees.includes(t.id)), lundis),
    [charge, tachesVives, ecartees, lundis],
  );

  const ouvert = projets.find((p) => p.id === params.get('p')) ?? null;
  const ouvrir = (id: string | null) => {
    const suite = new URLSearchParams(params);
    if (id) suite.set('p', id); else suite.delete('p');
    setParams(suite);
  };

  const peutConduire = (p: Projet | undefined) => !!p && (estSouverain || p.piloteMail.toLowerCase() === monMail);

  /* ── LES GESTES, TOUS SUR LA DEMANDE DU FIL ─────────────────────── */
  const messageDe = (id: string): FilMessage | undefined => tous.find((m) => m.id === id);

  const basculerFait = (id: string) => {
    const m = messageDe(id);
    if (!m) return;
    if (!puisJeClore(m, monMail) && !estSouverain) {
      toast(`À ${nomDe(m.demandePour, m.demandePourNom ?? '')} de la cocher, ou à qui l’a demandée.`);
      return;
    }
    if (!m.faitAt && !demandeOuverte(m, invoices)) {
      toast('Cette demande s’est éteinte d’elle-même : sa facture est soldée.');
      return;
    }
    filStore.set((prev) => prev.map((x) => (x.id === id
      ? (x.faitAt ? { ...x, faitAt: undefined, faitPar: undefined } : { ...x, faitAt: maintenant(), faitPar: monNom })
      : x)));
    toast(m.faitAt ? 'Rouverte, elle revient au Tableau.' : 'Faite, la case est cochée dans le Fil.');
  };

  const confier = (id: string, vers: Membre) => {
    const m = messageDe(id);
    if (!m) return;
    if (!peutConduire(projets.find((p) => p.id === m.projetId))) {
      toast('Seuls le pilote du projet et la direction confient ses tâches.');
      return;
    }
    const deNom = nomDe(m.demandePour, m.demandePourNom ?? m.demandePour ?? '');
    if ((m.demandePour ?? '').toLowerCase() === vers.mail.toLowerCase()) return;
    filStore.set((prev) => prev.map((x) => (x.id === id
      ? {
        ...x, demandePour: vers.mail, demandePourNom: vers.nom,
        mouvements: [...(x.mouvements ?? []), { parNom: monNom, deNom, aNom: vers.nom, at: maintenant() }],
      }
      : x)));
    toast(`Confiée à ${vers.nom}. La trace reste sur la carte.`);
  };

  const changerEcheance = (id: string, echeance: string) => {
    filStore.set((prev) => prev.map((x) => (x.id === id ? { ...x, echeance: echeance || undefined } : x)));
  };

  const ajouterTache = (p: Projet, texte: string, pour: string, echeance: string, jalonId: string) => {
    const dit = texte.trim();
    if (!dit) return false;
    const dest = pour === A_PRENDRE ? undefined : membres.find((mb) => adresseDe(mb) === pour);
    filStore.set((prev) => [...prev, nouveauMessage({
      branchId: branch.id,
      canal: CANAL_MAISON,
      auteurMail: monMail,
      auteurNom: monNom,
      texte: dit,
      demandePour: dest ? adresseDe(dest) : A_PRENDRE,
      demandePourNom: dest ? dest.name : 'À prendre',
      echeance: echeance || undefined,
      projetId: p.id,
      jalonId: jalonId || undefined,
    })]);
    toast(dest ? `Tâche confiée à ${dest.name}, elle est au Fil et sur son Tableau.` : 'Tâche posée, à prendre sur le Tableau.');
    return true;
  };

  const enregistrer = (p: Projet) => {
    projetsStore.set((prev) => (prev.some((x) => x.id === p.id) ? prev.map((x) => (x.id === p.id ? p : x)) : [...prev, p]));
    toast(edition === 'nouveau' ? `Projet « ${p.nom} » ouvert.` : 'Projet mis à jour.');
    setEdition(null);
    if (edition === 'nouveau') ouvrir(p.id);
  };

  const changerStatut = async (p: Projet, statut: Projet['statut']) => {
    if (statut === 'clos' && !await demande({
      quoi: 'Projet',
      titre: `Clore « ${p.nom} » ?`,
      dit: 'Il sort des vues et ses tâches ne pèsent plus sur personne. Les demandes restent au Fil.',
      accepter: 'Clore le projet',
      refuser: 'Garder ouvert',
    })) return;
    projetsStore.set((prev) => prev.map((x) => (x.id === p.id ? { ...x, statut } : x)));
    toast(statut === 'clos' ? 'Projet clos.' : statut === 'attente' ? 'Le projet attend votre oui.' : 'Le projet repart.');
    if (statut === 'clos') ouvrir(null);
  };

  /* ── LE RÉSUMÉ DE LA SEMAINE ───────────────────────────────────────── */
  const deLaSemaine = tachesVives.filter((t) => colonneDe(t, aujourdhui) === 'semaine').length;
  const enRetard = tachesVives.filter((t) => colonneDe(t, aujourdhui) === 'retard').length;

  const modale = edition && (
    <ProjetModal
      initial={edition === 'nouveau' ? null : edition}
      membres={lesMembres}
      branchId={branch.id}
      monNom={monNom}
      aujourdhui={aujourdhui}
      onClose={() => setEdition(null)}
      onSave={enregistrer}
    />
  );

  if (ouvert) {
    return (
      <>
        <FicheDuProjet
          projet={ouvert}
          taches={tachesDu(ouvert.id, taches)}
          etat={etatDe(ouvert)}
          membres={lesMembres}
          rdvs={rdvs}
          lundis={lundis}
          charge={charge}
          aujourdhui={aujourdhui}
          peutConduire={peutConduire(ouvert)}
          estSouverain={estSouverain}
          monMail={monMail}
          nomDe={nomDe}
          retour={() => ouvrir(null)}
          ouvrirLeFil={() => navigate('/fil')}
          basculerFait={basculerFait}
          confier={confier}
          changerEcheance={changerEcheance}
          ajouterTache={ajouterTache}
          modifier={() => setEdition(ouvert)}
          changerStatut={(s) => { void changerStatut(ouvert, s); }}
        />
        {modale}
      </>
    );
  }

  return (
    <div className="prj">
      <PageHead
        eyebrow="Direction · Les projets"
        title={actifs.length ? `${pluriel(actifs.length, 'chantier', 'chantiers')}, une seule vue.` : 'Les projets de la Maison.'}
        sub={actifs.length
          ? `Dans les 7 jours : ${deLaSemaine === 0 ? 'aucune tâche due' : pluriel(deLaSemaine, 'tâche due', 'tâches dues')}${enRetard ? `, et ${pluriel(enRetard, 'tâche en retard', 'tâches en retard')}` : ''}.`
          : 'Un projet regroupe des demandes du Fil : un nom, un pilote, des dates et des jalons.'}
        actions={estSouverain ? <Button variant="copper" onClick={() => setEdition('nouveau')}>Nouveau projet</Button> : undefined}
      />

      <div className="prj-nav">
        <div role="tablist" aria-label="Les vues" className="prj-onglets">
          {VUES.map((v) => (
            <button key={v.cle} type="button" role="tab" aria-selected={vue === v.cle}
              className={`prj-onglet${vue === v.cle ? ' is-on' : ''}`} onClick={() => setVue(v.cle)}>{v.nom}</button>
          ))}
        </div>
        {vue !== 'equipe' && vue !== 'tableau' && (
          <div role="group" aria-label="Quels projets" className="prj-filtres">
            {([['tous', `Tous · ${actifs.length}`],
              ['miens', `Les miens · ${actifs.filter((p) => p.piloteMail.toLowerCase() === monMail).length}`],
              ['attention', `À regarder · ${actifs.filter((p) => etatDe(p) !== 'heure').length}`]] as [FiltreDesProjets, string][]).map(([cle, nom]) => (
              <button key={cle} type="button" aria-pressed={filtre === cle}
                className={`prj-puce${filtre === cle ? ' is-on' : ''}`} onClick={() => setFiltre(cle)}>{nom}</button>
            ))}
          </div>
        )}
      </div>

      {actifs.length === 0 && (
        <div className="prj-carte prj-vide">
          {estSouverain
            ? <>Aucun projet ouvert. <button type="button" className="prj-lien" onClick={() => setEdition('nouveau')}>Ouvrir le premier ›</button></>
            : 'Aucun projet ouvert pour l’instant. La direction les ouvre ; vos tâches arrivent au Fil et sur le Tableau.'}
        </div>
      )}

      {actifs.length > 0 && vue === 'liste' && (
        <div className="prj-carte prj-defile">
          <table className="prj-table">
            <thead>
              <tr><th scope="col">Projet</th><th scope="col">Pilote</th><th scope="col">Avancement</th><th scope="col">Prochaine étape</th><th scope="col">Fin prévue</th><th scope="col">État</th></tr>
            </thead>
            <tbody>
              {visibles.map((p) => {
                const leurs = tachesDu(p.id, taches);
                const av = avancementDe(leurs);
                const pro = prochaineEtape(leurs);
                const e = etatDe(p);
                return (
                  <tr key={p.id}>
                    <td>
                      <button type="button" className="prj-nom" onClick={() => ouvrir(p.id)}>{p.nom}</button>
                      <div className="prj-doux">{p.departement}</div>
                    </td>
                    <td><span className="prj-qui"><span className="prj-avatar" aria-hidden="true">{initiale(p.piloteNom)}</span>{p.piloteNom}</span></td>
                    <td>
                      <div className="prj-avance">
                        <div className="prj-jauge" aria-hidden="true"><div style={{ width: `${av.pct}%` }} /></div>
                        <span className="prj-chiffre">{av.faites} / {av.total}</span>
                      </div>
                    </td>
                    <td>
                      {p.statut === 'attente'
                        ? <>Valider le projet<div className="prj-doux">Rien n’avance avant votre oui</div></>
                        : pro
                          ? <>{pro.texte}<div className="prj-doux">{nomDe(pro.demandePour, pro.demandePourNom ?? '')}{pro.echeance ? ` · ${tacheEnRetard(pro, aujourdhui) ? 'prévue le' : 'pour le'} ${dateCourte(pro.echeance)}` : ''}</div></>
                          : <span className="prj-doux">{av.total ? 'Toutes les tâches sont faites' : 'Aucune tâche encore'}</span>}
                    </td>
                    <td className="prj-chiffre">{dateCourte(p.fin)}</td>
                    <td className={`prj-etat est-${e}`}><span aria-hidden="true">{SIGNES[e]}</span> {NOMS_DES_ETATS[e]}</td>
                  </tr>
                );
              })}
              {visibles.length === 0 && <tr><td colSpan={6} className="prj-doux">Aucun projet sous ce filtre.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {actifs.length > 0 && vue === 'tableau' && (
        <div className="prj-colonnes">
          {COLONNES_DU_TABLEAU.map((c) => {
            const cartes = tachesVives
              .filter((t) => colonneDe(t, aujourdhui) === c.cle)
              .filter((t) => c.cle !== 'fait' || (!!t.faitAt && t.faitAt.slice(0, 10) >= ajouteJours(aujourdhui, -7)))
              .sort((a, b) => (a.echeance || '9999').localeCompare(b.echeance || '9999'));
            return (
              <section key={c.cle} className={`prj-colonne est-${c.cle}`} aria-label={c.nom}>
                <div className="prj-colonne__tete"><span>{c.cle === 'fait' ? 'Fait · 7 jours' : c.nom}</span><span className="prj-doux">{cartes.length}</span></div>
                {cartes.map((t) => (
                  <article key={t.id} className="prj-carte prj-tache">
                    <button type="button" className="prj-tache__projet" onClick={() => ouvrir(t.projetId ?? null)}>{nomsDesProjets.get(t.projetId ?? '') ?? 'Projet'}</button>
                    <b className={t.close ? 'est-faite' : ''}>{t.texte}</b>
                    <div className="prj-tache__pied">
                      <span className="prj-qui"><span className="prj-avatar prj-avatar--petit" aria-hidden="true">{initiale(nomDe(t.demandePour, t.demandePourNom ?? ''))}</span>{nomDe(t.demandePour, t.demandePourNom ?? '')}</span>
                      <span className={c.cle === 'retard' ? 'prj-retard' : 'prj-doux'}>{t.echeance ? dateCourte(t.echeance) : ''}</span>
                    </div>
                    <button type="button" className="prj-lien" onClick={() => basculerFait(t.id)}>{t.close ? 'Rouvrir' : 'Marquer faite'} ›</button>
                  </article>
                ))}
              </section>
            );
          })}
        </div>
      )}

      {actifs.length > 0 && vue === 'calendrier' && <Calendrier projets={visibles} taches={taches} aujourdhui={aujourdhui} etatDe={etatDe} ouvrir={ouvrir} />}

      {actifs.length > 0 && vue === 'equipe' && (
        <div className="prj-carte prj-equipe">
          <div className="prj-equipe__tete">
            <span className="prj-sur">Qui porte quoi, sept jours par sept jours</span>
            <span className="prj-doux">Les tâches de projets ouvertes, par sept jours ; les séances de l’Agenda sont rappelées dessous, pour mémoire. Une tâche en retard pèse sur les 7 premiers jours.</span>
          </div>
          <div className="prj-defile">
            <table className="prj-table prj-table--equipe">
              <thead>
                <tr><th scope="col">Qui</th>{lundis.map((l, i) => <th key={l} scope="col">{i === 0 ? 'Les 7 jours' : `Dès le ${dateCourte(l)}`}</th>)}<th scope="col">Sans date</th></tr>
              </thead>
              <tbody>
                {charge.map((c) => {
                  const seances = seancesParSemaine(rdvs, c.nom, lundis);
                  return (
                    <tr key={c.mail}>
                      <td><span className="prj-qui"><span className="prj-avatar" aria-hidden="true">{initiale(c.nom)}</span>{c.nom}</span></td>
                      {c.parSemaine.map((n, i) => (
                        <td key={lundis[i]} title={`${c.nom} · 7 jours dès le ${dateCourte(lundis[i])} · ${pluriel(n, 'tâche', 'tâches')}, ${pluriel(seances[i], 'séance', 'séances')}`}>
                          <span className="prj-compte"><b>{n}</b> {n > 1 ? 'tâches' : 'tâche'}<span className="prj-points" aria-hidden="true">{'●'.repeat(Math.min(n, 8))}</span></span>
                          <div className="prj-doux">{seances[i] === 0 ? 'aucune séance' : pluriel(seances[i], 'séance', 'séances')}</div>
                        </td>
                      ))}
                      <td className="prj-doux">{c.sansDate || ''}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {proposition && (
            <div className="prj-propose" role="note">
              <p>
                <span className="prj-sur">Le Trône remarque</span><br />
                {proposition.semaine === lundis[0] ? 'Dans les 7 jours' : `Dans les 7 jours dès le ${dateCourte(proposition.semaine)}`}, {proposition.de.nom} porte {proposition.avant[0]} tâches et {proposition.a.nom} {proposition.avant[1] === 0 ? 'aucune' : proposition.avant[1] === 1 ? 'une seule' : proposition.avant[1]}.
                {' '}Confier « {proposition.texte} » à {proposition.a.nom} ?
              </p>
              <div className="prj-propose__gestes">
                {peutConduire(projets.find((p) => p.id === tachesVives.find((t) => t.id === proposition.tacheId)?.projetId))
                  && <Button variant="copper" onClick={() => confier(proposition.tacheId, proposition.a)}>Confier à {proposition.a.nom}</Button>}
                <Button variant="ghost" onClick={() => setEcartees((e) => [...e, proposition.tacheId])}>Laisser ainsi</Button>
              </div>
            </div>
          )}
        </div>
      )}

      <p className="prj-note">Chaque tâche est une demande du Fil : elle apparaît aussi au Tableau de l’équipe, et sa fin prévient qui l’a demandée.</p>
      {modale}
    </div>
  );
}

/* ═══ LE CALENDRIER ═════════════════════════════════════════════════ */
function Calendrier({ projets, taches, aujourdhui, etatDe, ouvrir }: {
  projets: Projet[];
  taches: TacheDuProjet[];
  aujourdhui: string;
  etatDe: (p: Projet) => EtatDuProjet;
  ouvrir: (id: string) => void;
}) {
  const f = fenetreDu(projets, aujourdhui);
  const mois = moisDeLaFenetre(f);
  const auj = positionDans(f, aujourdhui);
  return (
    <div className="prj-carte prj-defile">
      <div className="prj-gantt">
        <div className="prj-gantt__ligne prj-gantt__entete">
          <div className="prj-gantt__nom" />
          <div className="prj-gantt__piste">
            {mois.map((m) => <span key={m.iso} className="prj-gantt__mois" style={{ left: `${positionDans(f, m.iso)}%` }}>{m.nom}</span>)}
            <span className="prj-gantt__auj-dit" style={{ left: `${auj}%` }}>aujourd’hui</span>
          </div>
        </div>
        {projets.map((p) => {
          const leurs = tachesDu(p.id, taches);
          const av = avancementDe(leurs);
          const e = etatDe(p);
          const x = positionDans(f, p.debut);
          const w = Math.max(0.6, positionDans(f, ajouteJours(p.fin, 1)) - x);
          return (
            <div key={p.id} className="prj-gantt__ligne">
              <div className="prj-gantt__nom">
                <button type="button" className="prj-nom prj-nom--petit" onClick={() => ouvrir(p.id)}>{p.nom}</button>
                <span className={`prj-etat est-${e}`}><span aria-hidden="true">{SIGNES[e]}</span> {NOMS_DES_ETATS[e]} · {p.piloteNom}</span>
              </div>
              <div className="prj-gantt__piste">
                {mois.map((m) => <span key={m.iso} className="prj-gantt__trait" style={{ left: `${positionDans(f, m.iso)}%` }} aria-hidden="true" />)}
                <div className="prj-gantt__barre" style={{ left: `${x}%`, width: `${w}%` }}
                  title={`${p.nom} · du ${dateCourte(p.debut)} au ${dateCourte(p.fin)} · ${av.faites} tâches sur ${av.total}`}>
                  <div style={{ width: `${av.pct}%` }} />
                </div>
                {p.jalons.map((j) => (
                  <span key={j.id} className={`prj-gantt__jalon${etatDuJalon(j, leurs).atteint ? ' est-atteint' : j.date < aujourdhui && etatDuJalon(j, leurs).restent > 0 ? ' est-retard' : ''}`}
                    style={{ left: `${positionDans(f, j.date)}%` }} title={`${j.nom} · ${dateCourte(j.date)}`} />
                ))}
                <span className="prj-gantt__auj" style={{ left: `${auj}%` }} aria-hidden="true" />
              </div>
            </div>
          );
        })}
      </div>
      <div className="prj-legende">
        <span><i className="prj-cle prj-cle--fait" />Fait</span>
        <span><i className="prj-cle prj-cle--reste" />Reste à faire</span>
        <span><i className="prj-cle prj-cle--jalon" />Jalon (survolez pour son nom)</span>
      </div>
    </div>
  );
}

/* ═══ UN PROJET OUVERT ══════════════════════════════════════════════ */
function FicheDuProjet(props: {
  projet: Projet;
  taches: TacheDuProjet[];
  etat: EtatDuProjet;
  membres: Membre[];
  rdvs: { date: string; status: string; master?: string }[];
  lundis: string[];
  charge: { mail: string; nom: string; parSemaine: number[] }[];
  aujourdhui: string;
  peutConduire: boolean;
  estSouverain: boolean;
  monMail: string;
  nomDe: (mail: string | undefined, repli: string) => string;
  retour: () => void;
  ouvrirLeFil: () => void;
  basculerFait: (id: string) => void;
  confier: (id: string, vers: Membre) => void;
  changerEcheance: (id: string, echeance: string) => void;
  ajouterTache: (p: Projet, texte: string, pour: string, echeance: string, jalonId: string) => boolean;
  modifier: () => void;
  changerStatut: (s: Projet['statut']) => void;
}) {
  const { projet: p, taches, etat, membres, aujourdhui, nomDe } = props;
  const [ouverte, setOuverte] = useState<string | null>(null);
  const [texte, setTexte] = useState('');
  const [pour, setPour] = useState(A_PRENDRE);
  const [echeance, setEcheance] = useState('');
  const [jalonId, setJalonId] = useState('');

  const av = avancementDe(taches);
  const jalons = [...p.jalons].sort((a, b) => a.date.localeCompare(b.date));
  const groupes: { cle: string; nom: string; taches: TacheDuProjet[] }[] = [
    ...jalons.map((j) => ({ cle: j.id, nom: `${j.nom} · ${dateCourte(j.date)}`, taches: taches.filter((t) => t.jalonId === j.id) })),
    { cle: '', nom: 'Sans jalon', taches: taches.filter((t) => !t.jalonId || !p.jalons.some((j) => j.id === t.jalonId)) },
  ].filter((g) => g.cle !== '' || g.taches.length > 0);
  const tri = (a: TacheDuProjet, b: TacheDuProjet) => Number(a.close) - Number(b.close) || (a.echeance || '9999').localeCompare(b.echeance || '9999');

  /* Ceux qui ont une tâche ici, et le pilote. */
  const mails = new Set([p.piloteMail.toLowerCase(), ...taches.map((t) => (t.demandePour ?? '').toLowerCase())]);
  const equipeDuProjet = membres.filter((m) => mails.has(m.mail.toLowerCase()));
  const lundi = props.lundis[0];

  const poser = () => {
    if (props.ajouterTache(p, texte, pour, echeance, jalonId)) { setTexte(''); setEcheance(''); }
  };

  return (
    <div className="prj">
      <button type="button" className="prj-lien prj-retour" onClick={props.retour}>‹ Les projets</button>
      <div className="prj-fiche__tete">
        <div className="prj-fiche__titre">
          <span className="prj-sur">Projet · {p.departement}</span>
          <h2>{p.nom}</h2>
          <div className="prj-fiche__meta">
            <span className="prj-qui"><span className="prj-avatar" aria-hidden="true">{initiale(p.piloteNom)}</span>{p.piloteNom} pilote</span>
            <span>du {dateCourte(p.debut)} au {dateCourte(p.fin)}</span>
            <span className={`prj-etat est-${etat}`}><span aria-hidden="true">{SIGNES[etat]}</span> {NOMS_DES_ETATS[etat]}</span>
          </div>
          {p.note && <p className="prj-doux prj-fiche__note">{p.note}</p>}
        </div>
        <div className="prj-carte prj-fiche__avance">
          <div className="prj-entre"><span className="prj-sur">Avancement</span><span className="prj-doux">{av.faites} tâches sur {av.total}</span></div>
          <span className="prj-gros">{av.pct} %</span>
          <div className="prj-jauge prj-jauge--grande" aria-hidden="true"><div style={{ width: `${av.pct}%` }} /></div>
        </div>
      </div>

      {props.estSouverain && (
        <div className="prj-gestes">
          <Button variant="ghost" size="sm" onClick={props.modifier}>Modifier le projet</Button>
          {p.statut === 'attente'
            ? <Button variant="copper" size="sm" onClick={() => props.changerStatut('actif')}>Valider, il démarre</Button>
            : <Button variant="ghost" size="sm" onClick={() => props.changerStatut('attente')}>Mettre en attente</Button>}
          <Button variant="ghost" size="sm" onClick={() => props.changerStatut('clos')}>Clore le projet</Button>
        </div>
      )}

      {jalons.length > 0 && (
        <section className="prj-carte prj-jalons" aria-label="Les jalons">
          <span className="prj-sur">Les jalons</span>
          <ol>
            {jalons.map((j) => {
              const e = etatDuJalon(j, taches);
              const passe = j.date < aujourdhui && !e.atteint && e.total > 0;
              return (
                <li key={j.id} className={e.atteint ? 'est-atteint' : passe ? 'est-retard' : ''}>
                  <span className="prj-losange" aria-hidden="true" />
                  <b>{j.nom}</b>
                  <span className="prj-doux">{dateCourte(j.date)}</span>
                  <span className={passe ? 'prj-retard' : 'prj-doux'}>
                    {e.total === 0 ? 'aucune tâche' : e.atteint ? 'atteint' : `${pluriel(e.restent, 'tâche reste', 'tâches restent')}`}
                  </span>
                </li>
              );
            })}
          </ol>
        </section>
      )}

      <div className="prj-fiche__corps">
        <section className="prj-carte prj-taches" aria-label="Les tâches">
          <div className="prj-entre"><span className="prj-sur">Les tâches</span><span className="prj-doux">Touchez une tâche pour l’ouvrir · le rond la marque faite</span></div>
          {taches.length === 0 && <p className="prj-doux">Aucune tâche encore. {props.peutConduire ? 'Posez la première ci-dessous.' : ''}</p>}
          {groupes.map((g) => (
            <div key={g.cle || 'sans'} className="prj-groupe">
              {(jalons.length > 0) && (
                <div className="prj-entre prj-groupe__tete"><span>{g.nom}</span><span className="prj-doux">{g.taches.filter((t) => t.close).length} sur {g.taches.length}</span></div>
              )}
              {[...g.taches].sort(tri).map((t) => {
                const qui = nomDe(t.demandePour, t.demandePourNom ?? '');
                const retard = tacheEnRetard(t, aujourdhui);
                const estOuverte = ouverte === t.id;
                return (
                  <div key={t.id} className={`prj-ligne${estOuverte ? ' is-open' : ''}`}>
                    <div className="prj-ligne__tete">
                      <button type="button" className={`prj-coche${t.close ? ' is-on' : ''}`} aria-pressed={t.close}
                        aria-label={`${t.close ? 'Rouvrir' : 'Marquer faite'} : ${t.texte}`} onClick={() => props.basculerFait(t.id)}>✓</button>
                      <button type="button" className={`prj-ligne__titre${t.close ? ' est-faite' : ''}`} aria-expanded={estOuverte}
                        onClick={() => setOuverte(estOuverte ? null : t.id)}>{t.texte}</button>
                      <span className="prj-qui"><span className="prj-avatar prj-avatar--petit" aria-hidden="true">{initiale(qui)}</span>{qui}</span>
                      <span className={`prj-ligne__quand ${t.close ? 'prj-ok' : retard ? 'prj-retard' : 'prj-doux'}`}>
                        {t.close ? 'faite' : retard ? `en retard · ${dateCourte(t.echeance!)}` : t.echeance ? `pour le ${dateCourte(t.echeance)}` : 'sans date'}
                      </span>
                    </div>
                    {estOuverte && (
                      <div className="prj-ligne__panneau">
                        <p className="prj-doux">Demandée par {t.auteurNom ?? 'la Maison'}{t.at ? ` le ${dateCourte(t.at)}` : ''}{t.faitAt ? ` · faite le ${dateCourte(t.faitAt)}` : ''}.</p>
                        {props.peutConduire && !t.close && (
                          <div className="prj-panneau__champs">
                            <label>Confier à
                              <Select value={(t.demandePour ?? '').toLowerCase()} onChange={(e) => {
                                const v = e.target.value;
                                props.confier(t.id, v === A_PRENDRE ? { mail: A_PRENDRE, nom: 'À prendre' } : membres.find((m) => m.mail.toLowerCase() === v) ?? { mail: v, nom: v });
                              }}>
                                <option value={A_PRENDRE}>À prendre</option>
                                {membres.map((m) => <option key={m.mail} value={m.mail.toLowerCase()}>{m.nom}</option>)}
                              </Select>
                            </label>
                            <label>Échéance
                              <ChampDeDate compact value={t.echeance ?? ''} onChange={(v) => props.changerEcheance(t.id, v)} ariaLabel="Échéance de la tâche" />
                            </label>
                          </div>
                        )}
                        <button type="button" className="prj-lien" onClick={props.ouvrirLeFil}>En parler au Fil ›</button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ))}

          {props.peutConduire && p.statut !== 'clos' && (
            <div className="prj-ajout">
              <label className="prj-masque" htmlFor="prj-ajout-texte">Ajouter une tâche</label>
              <Input id="prj-ajout-texte" value={texte} onChange={(e) => setTexte(e.target.value)} placeholder="+ Ajouter une tâche…"
                onKeyDown={(e) => { if (e.key === 'Enter') poser(); }} />
              <div className="prj-ajout__reglages">
                <Select value={pour} onChange={(e) => setPour(e.target.value)} aria-label="Pour qui">
                  <option value={A_PRENDRE}>À prendre</option>
                  {membres.map((m) => <option key={m.mail} value={m.mail}>{m.nom}</option>)}
                </Select>
                <ChampDeDate compact value={echeance} onChange={setEcheance} ariaLabel="Échéance" />
                {jalons.length > 0 && (
                  <Select value={jalonId} onChange={(e) => setJalonId(e.target.value)} aria-label="Jalon">
                    <option value="">Sans jalon</option>
                    {jalons.map((j) => <option key={j.id} value={j.id}>{j.nom}</option>)}
                  </Select>
                )}
                <Button size="sm" onClick={poser} disabled={!texte.trim()}>Ajouter</Button>
              </div>
            </div>
          )}
        </section>

        <aside className="prj-fiche__cote">
          <section className="prj-carte prj-cote" aria-label="L’équipe du projet">
            <span className="prj-sur">L’équipe du projet · les 7 prochains jours</span>
            {equipeDuProjet.length === 0 && <p className="prj-doux">Personne encore.</p>}
            {equipeDuProjet.map((m) => {
              const ici = taches.filter((t) => !t.close && (t.demandePour ?? '').toLowerCase() === m.mail.toLowerCase()).length;
              const cetteSemaine = props.charge.find((c) => c.mail.toLowerCase() === m.mail.toLowerCase())?.parSemaine[0] ?? 0;
              const seances = seancesParSemaine(props.rdvs, m.nom, [lundi])[0];
              return (
                <div key={m.mail} className="prj-cote__ligne">
                  <span className="prj-avatar" aria-hidden="true">{initiale(m.nom)}</span>
                  <span className="prj-cote__nom">{m.nom}<span className="prj-doux">{ici === 0 ? 'aucune tâche ouverte ici' : `${pluriel(ici, 'tâche ouverte', 'tâches ouvertes')} ici`}</span></span>
                  <span className="prj-doux prj-cote__compte">{pluriel(cetteSemaine, 'tâche', 'tâches')} · {seances === 0 ? 'aucune séance' : pluriel(seances, 'séance', 'séances')}</span>
                </div>
              );
            })}
            <span className="prj-doux prj-petit">Les tâches se comptent au Fil, les séances dans l’Agenda : personne ne saisit d’heures.</span>
          </section>
        </aside>
      </div>
    </div>
  );
}

/* ═══ OUVRIR OU MODIFIER UN PROJET ══════════════════════════════════ */
function ProjetModal({ initial, membres, branchId, monNom, aujourdhui, onClose, onSave }: {
  initial: Projet | null;
  membres: Membre[];
  branchId: string;
  monNom: string;
  aujourdhui: string;
  onClose: () => void;
  onSave: (p: Projet) => void;
}) {
  const [nom, setNom] = useState(initial?.nom ?? '');
  const [departement, setDepartement] = useState(initial?.departement ?? 'Direction');
  const [piloteMail, setPiloteMail] = useState(initial?.piloteMail ?? '');
  const [debut, setDebut] = useState(initial?.debut ?? aujourdhui);
  const [fin, setFin] = useState(initial?.fin ?? '');
  const [attente, setAttente] = useState(initial?.statut === 'attente');
  const [note, setNote] = useState(initial?.note ?? '');
  const [jalons, setJalons] = useState<JalonDuProjet[]>(initial?.jalons ?? []);

  const pilote = membres.find((m) => m.mail === piloteMail);
  const brouillon = { nom, piloteMail, debut, fin, jalons };
  const manque = projetIncomplet(brouillon);

  const enregistrer = () => {
    if (manque) { toast(manque); return; }
    onSave({
      id: initial?.id ?? `prj-${uid()}`,
      branchId: initial?.branchId ?? branchId,
      nom: nom.trim(),
      departement,
      piloteMail,
      piloteNom: pilote?.nom ?? initial?.piloteNom ?? piloteMail,
      debut, fin,
      jalons: jalons.map((j) => ({ ...j, nom: j.nom.trim() })),
      statut: initial?.statut === 'clos' ? 'clos' : attente ? 'attente' : 'actif',
      note: note.trim() || undefined,
      creeAt: initial?.creeAt ?? maintenant(),
      creePar: initial?.creePar ?? monNom,
    });
  };

  return (
    <Modal title={initial ? 'Modifier le projet' : 'Ouvrir un projet'} onClose={onClose} width={560}>
      <div className="prj-form">
        <label>Le nom<Input value={nom} onChange={(e) => setNom(e.target.value)} placeholder="Ouverture de la Boutique" autoFocus /></label>
        <div className="prj-form__deux">
          <label>Le département
            <Select value={departement} onChange={(e) => setDepartement(e.target.value)}>
              {DEPARTEMENTS.map((d) => <option key={d.k} value={d.l}>{d.l}</option>)}
            </Select>
          </label>
          <label>Le pilote
            <Select value={piloteMail} onChange={(e) => setPiloteMail(e.target.value)}>
              <option value="">Choisir…</option>
              {membres.map((m) => <option key={m.mail} value={m.mail}>{m.nom}</option>)}
            </Select>
          </label>
        </div>
        <div className="prj-form__deux">
          <label>Début<ChampDeDate value={debut} onChange={setDebut} ariaLabel="Date de début" /></label>
          <label>Fin prévue<ChampDeDate value={fin} onChange={setFin} ariaLabel="Date de fin" /></label>
        </div>
        <div className="prj-form__jalons">
          <span className="prj-sur">Les jalons</span>
          {jalons.map((j, i) => (
            <div key={j.id} className="prj-form__jalon">
              <Input value={j.nom} onChange={(e) => setJalons((js) => js.map((x, k) => (k === i ? { ...x, nom: e.target.value } : x)))} placeholder="Articles posés" aria-label="Nom du jalon" />
              <ChampDeDate compact value={j.date} onChange={(v) => setJalons((js) => js.map((x, k) => (k === i ? { ...x, date: v } : x)))} ariaLabel="Date du jalon" />
              <button type="button" className="prj-lien" onClick={() => setJalons((js) => js.filter((_, k) => k !== i))}>Retirer</button>
            </div>
          ))}
          <button type="button" className="prj-lien" onClick={() => setJalons((js) => [...js, { id: `jal-${uid()}`, nom: '', date: fin || '' }])}>+ Ajouter un jalon</button>
        </div>
        <label>Une note (facultatif)<Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} /></label>
        <label className="prj-form__case">
          <input type="checkbox" checked={attente} onChange={(e) => setAttente(e.target.checked)} />
          Il attend encore votre oui (rien n’avance avant)
        </label>
        {manque && <p className="prj-doux">{manque}</p>}
        <div className="prj-form__gestes">
          <Button variant="ghost" onClick={onClose}>Annuler</Button>
          <Button variant="copper" onClick={enregistrer} disabled={!!manque}>{initial ? 'Enregistrer' : 'Ouvrir le projet'}</Button>
        </div>
      </div>
    </Modal>
  );
}
