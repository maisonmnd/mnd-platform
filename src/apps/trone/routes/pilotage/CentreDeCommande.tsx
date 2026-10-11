import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHead } from '../_ui';
import { Badge, Button, Input, Select, Textarea, toast } from '../../../../ds/components';
import { useStaff } from '../../../../shared/auth';
import { useBranch } from '../../../../shared/branches';
import { useClients } from '../../../../shared/clients';
import { useDemandes } from '../../../../shared/demandes';
import { useInvoices, useDepensesComptees, depensesDuMois } from '../../../../shared/finance';
import { useOffers } from '../../../../shared/offers';
import { attendEncore } from '../../../../shared/salle-des-envois';
import { useApprenants, useEnvois, useSubscribers } from '../equipe/data';
import { addDaysISO, revenuDuMois, revenusProjetesDuMois, todayISO, useBranchAppointments, useServicesById } from '../clients/_shared';
import { AGENTS, PHASES, PHASES_CONSTRUITES, etatDeLAgent, type Phase } from '../../../../shared/ia-agents-pur';
import { MEMOIRE } from '../../../../shared/ia-memoire-pur';
import { briefingDeBase, comptesDesMissions, francs, heureEnClair, jourEnClair, type FaitsDuJour } from '../../../../shared/ia-faits-pur';
import { CONSIGNES, TITRE_DU_GENRE, type GenreDeBriefing } from '../../../../shared/ia-prompts-pur';
import { GENRES, NIVEAU_DIT, STATUT_DE_TACHE_DIT, niveauRetenu, type StatutDeTache } from '../../../../shared/ia-validation-pur';
import { depenseDuMois, moisACotonou } from '../../../../shared/ia-budget-pur';
import {
  REGLAGES_PAR_DEFAUT, ajouteLaTache, ajouteUneNote, avanceLaTache, changeLeStatutDeMission, changeLesReglages, creeLaMission,
  decoupeLObjectif, demandeUnBriefing, etatDeLaFonction, nouvelleTache, noteLeReleve, retireLaNote, retireLaTache, valideLaTache,
  useBriefings, useCompteur, useJournalDuCentre, useJournalServeur, useMissions, useNotes, useReglages,
  type EtatDeLaFonction, type Mission, type Tache,
} from '../../../../shared/ia-centre';
import { objetPourClaude, type Personne } from '../../../../shared/ia-anonymise-pur';
import { useArticles, useContenus, useScripts, useSeances } from '../../../../shared/ia-atelier';
import './centre.css';

/* ══ LE CENTRE DE COMMANDE — 11 octobre 2026 ══════════════════════════════

   Cahier « Maison MND AI Operating System » (Yéman), phase 1, la fondation :
   l'orchestrateur, la mémoire, les missions et leurs tâches, la validation,
   les briefings, le journal, le plafond. Les choix du 11 octobre, au
   sélecteur : le Centre vit dans le Trône ; Yéman ou Brice valident ; aucun
   nom ni numéro de cliente ne part chez Claude ; les agents écrivent seuls
   le matin, le lundi, le vendredi et le premier du mois, sous un plafond de
   10 $ par mois ; le briefing arrive avec une notification ; on commence par
   la journée.

   RÉSERVÉ AUX FONDATEURS (`ROUTES_SOUVERAIN`). L'écran suit le patron des
   listes repliées : le résumé sur la ligne, un seul panneau ouvert à la
   fois, et ce qu'on règle nommé en haut du panneau ouvert.

   LE CENTRE SERT AVANT MÊME QUE L'ORCHESTRATEUR SOIT POSÉ : la journée se
   lit dans le Trône et le briefing de base s'écrit sans Claude. La fonction
   `centre-de-commande`, une fois collée, y ajoute les briefings rédigés et
   le découpage des missions. */

type Section = 'validations' | 'missions' | 'briefings' | 'agents' | 'memoire' | 'journal' | 'reglages' | 'suite';

const dateDite = (iso?: string): string => (iso ? jourEnClair(iso.slice(0, 10)).replace(/^\S+ /, '') : '');
const heureDe = (iso: string): string => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
};
const pl = (n: number, un: string, plusieurs: string) => `${n} ${n > 1 ? plusieurs : un}`;
const nomDeLAgent = (id: string): string => AGENTS.find((a) => a.id === id)?.nom ?? id;
const GENRE_DIT: Record<string, string> = {
  calendrier: 'Calendrier', analyse: 'Analyse', idees: 'Idées', brouillon: 'Brouillon', rangement: 'Rangement', rapport: 'Rapport',
  publication: 'Publication', campagne: 'Campagne', article: 'Article', shooting: 'Séance photo', video: 'Vidéo', concept: 'Concept',
  'message-clientes': 'Message aux clientes', contrat: 'Contrat', juridique: 'Juridique', paiement: 'Paiement', recrutement: 'Recrutement',
  identite: 'Identité', 'communication-sensible': 'Communication sensible', 'engagement-financier': 'Engagement financier', 'publication-sensible': 'Publication sensible',
};

function Groupe({ id, nom, resume, ouvert, bascule, children }: {
  id: Section; nom: string; resume: string; ouvert: boolean; bascule: (id: Section) => void; children: ReactNode;
}) {
  return (
    <div className={`cc-groupe${ouvert ? ' is-ouvert' : ''}`}>
      <button type="button" className="cc-groupe__ligne" aria-expanded={ouvert} aria-controls={`cc-${id}`} onClick={() => bascule(id)}>
        <span className="cc-groupe__nom">{nom}</span>
        <span className="cc-groupe__resume">{resume}</span>
        <span className="cc-groupe__chevron" aria-hidden="true"><svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M3 5l4 4 4-4" /></svg></span>
      </button>
      {ouvert && (
        <div className="cc-groupe__corps" id={`cc-${id}`}>
          <div className="cc-suit">{nom}</div>
          {children}
        </div>
      )}
    </div>
  );
}

function Niveau({ niveau }: { niveau: Tache['niveau'] }) {
  return <span className={`cc-niveau cc-niveau--${niveau}`}>{NIVEAU_DIT[niveau]}</span>;
}

export default function CentreDeCommande() {
  const navigate = useNavigate();
  const staff = useStaff();
  const moi = staff?.name ?? 'Fondateur';
  const { branch } = useBranch();
  const [ouvert, setOuvert] = useState<Section | null>('validations');
  const bascule = (id: Section) => setOuvert((o) => (o === id ? null : id));

  /* ── Les faits du jour, lus dans le Trône ── */
  const today = todayISO();
  const appts = useBranchAppointments();
  const [demandes] = useDemandes();
  const [envois] = useEnvois();
  const [offres] = useOffers();
  const [invoices] = useInvoices();
  const byId = useServicesById();
  const [apprenants] = useApprenants();
  const [abonnes] = useSubscribers();
  const expenses = useDepensesComptees();
  const [missions] = useMissions();
  const [clients] = useClients();
  const [contenus] = useContenus();
  const [seances] = useSeances();
  const [scripts] = useScripts();
  const [articles] = useArticles();

  const faits: FaitsDuJour = useMemo(() => {
    const duJour = appts.filter((a) => a.date === today && a.status !== 'annulé').map((a) => a.time).filter(Boolean).sort();
    const mois = today.slice(0, 7);
    const moisAvant = addDaysISO(`${mois}-01`, -1).slice(0, 7);
    const finAvant = new Date(Number(moisAvant.slice(0, 4)), Number(moisAvant.slice(5, 7)), 0).getDate();
    const coupeAvant = `${moisAvant}-${String(Math.min(Number(today.slice(8, 10)), finAvant)).padStart(2, '0')}`;
    const args = { invoices, appts, byId, apprenants, abonnes, branchId: branch.id };
    const comptes = comptesDesMissions(missions, today);
    return {
      jour: today,
      rdv: { nombre: duJour.length, premiere: duJour[0], derniere: duJour[duJour.length - 1] },
      demandesNouvelles: demandes.filter((d) => d.branchId === branch.id && d.statut === 'nouvelle' && !d.archiveeLe).length,
      envoisEnAttente: envois.filter(attendEncore).length,
      encaisse: {
        aCeJour: revenuDuMois(args, mois, { cut: today }),
        moisPrecedent: revenuDuMois(args, moisAvant, { cut: coupeAvant }),
        projete: revenusProjetesDuMois(args, mois, today).total,
        depenses: depensesDuMois(expenses, branch.id, mois),
      },
      offres: offres
        .filter((o) => o.active && (o.du || o.au) && (!o.du || today >= o.du) && (!o.au || today <= o.au))
        .map((o) => ({ titre: o.title, remise: o.deal, jusquau: o.au })),
      validationsEnAttente: comptes.validations,
      tachesEnRetard: comptes.retard,
      missionsOuvertes: comptes.ouvertes,
      contenus: {
        aRelire: contenus.filter((c) => c.statut === 'a-relire').length,
        aujourdHui: contenus.filter((c) => c.date === today && (c.statut === 'valide' || c.statut === 'programme')).length,
      },
    };
  }, [appts, today, demandes, envois, offres, invoices, byId, apprenants, abonnes, expenses, missions, contenus, branch.id]);

  /* LE RELEVÉ POUR LE MATIN : la fonction ne recompte pas l'argent, elle
     reprend celui-ci, avec son heure (au plus une écriture par heure). */
  useEffect(() => {
    if (staff?.role !== 'souverain' || !faits.encaisse) return;
    noteLeReleve({ releveLe: new Date().toISOString(), jour: today, encaisse: faits.encaisse });
  }, [staff?.role, faits.encaisse, today]);

  const base = briefingDeBase(faits);
  const [briefings] = useBriefings();
  const duJour = briefings.find((b) => b.jour === today);

  /* ── L'orchestrateur répond-il ? ── */
  const [etat, setEtat] = useState<EtatDeLaFonction | null>(null);
  useEffect(() => { let vivant = true; void etatDeLaFonction().then((e) => { if (vivant) setEtat(e); }); return () => { vivant = false; }; }, []);
  const pose = etat?.posee === true;
  const [compteur] = useCompteur();
  const [reglagesBruts] = useReglages();
  const reglages = { ...REGLAGES_PAR_DEFAUT, ...reglagesBruts };
  const mois = moisACotonou();
  const depense = depenseDuMois(compteur, mois);

  const [attente, setAttente] = useState<string | null>(null);
  const briefing = async (genre: GenreDeBriefing) => {
    setAttente(`briefing-${genre}`);
    try { await demandeUnBriefing(genre, moi); toast(`${TITRE_DU_GENRE[genre]} est arrivé.`); } catch (e) { toast(e instanceof Error ? e.message : String(e), 7000); } finally { setAttente(null); }
  };

  /* ── Les personnes connues, pour que rien de nominatif ne parte ── */
  const personnes: Personne[] = useMemo(() => clients.map((c) => {
    const [prenom, ...reste] = (c.name ?? '').trim().split(/\s+/);
    return { prenom, nom: reste.join(' ') };
  }), [clients]);

  /* ── Les validations ── */
  const aValider = missions.flatMap((m) => m.taches.filter((t) => t.statut === 'a-valider' && !t.validation).map((t) => ({ m, t })));
  /* L'ATELIER DES CONTENUS (phase 2) : ce qui attend une relecture se tranche
     là-bas, pièce par pièce, avec le gardien de la marque ; ici on le compte. */
  const aRelireAtelier = [
    { n: contenus.filter((c) => c.statut === 'a-relire').length, un: 'publication', plusieurs: 'publications' },
    { n: seances.filter((x) => x.statut === 'a-relire').length, un: 'brief de séance photo', plusieurs: 'briefs de séance photo' },
    { n: scripts.filter((x) => x.statut === 'a-relire').length, un: 'script vidéo', plusieurs: 'scripts vidéo' },
    { n: articles.filter((a) => a.etape === 'validation' && !a.validation).length, un: 'article du Journal', plusieurs: 'articles du Journal' },
  ].filter((x) => x.n > 0);
  const nAtelier = aRelireAtelier.reduce((t, x) => t + x.n, 0);
  const aVenir = ([2, 3, 4, 5] as Phase[]).filter((ph) => !PHASES_CONSTRUITES.includes(ph));
  const [mots, setMots] = useState<Record<string, string>>({});
  const tranche = (m: Mission, t: Tache, verdict: 'oui' | 'non') => {
    const r = valideLaTache(m.id, t.id, verdict, staff ? { user_id: staff.user_id, name: staff.name ?? 'Fondateur', role: staff.role } : null, mots[t.id]);
    if (!r.ok) toast(r.pourquoi ?? 'Refusé.');
  };

  /* ── Les missions ── */
  const [objectif, setObjectif] = useState('');
  const [missionOuverte, setMissionOuverte] = useState<string | null>(null);
  const ouvertes = missions.filter((m) => m.statut !== 'terminee' && m.statut !== 'abandonnee');
  const fermees = missions.filter((m) => m.statut === 'terminee' || m.statut === 'abandonnee');
  const decoupe = async () => {
    setAttente('mission');
    try {
      const m = await decoupeLObjectif(objectif, personnes, today, moi);
      setObjectif('');
      setMissionOuverte(m.id);
      toast('La mission est découpée : relisez-la.');
    } catch (e) { toast(e instanceof Error ? e.message : String(e), 7000); } finally { setAttente(null); }
  };
  const aLaMain = () => {
    const texte = objetPourClaude(objectif, personnes).trim();
    if (texte.length < 4) return;
    const m = creeLaMission({ titre: texte.slice(0, 80), objectif: texte, par: moi });
    setObjectif('');
    setMissionOuverte(m.id);
  };

  /* ── La mémoire ── */
  const [notes] = useNotes();
  const [note, setNote] = useState({ rubrique: '', texte: '' });

  /* ── Le journal, les deux mains réunies ── */
  const [journalTrone] = useJournalDuCentre();
  const [journalServeur] = useJournalServeur();
  const journal = useMemo(() => [...journalTrone, ...journalServeur].sort((a, b) => b.quand.localeCompare(a.quand)).slice(0, 120), [journalTrone, journalServeur]);

  if (staff && staff.role !== 'souverain') {
    return (
      <div className="mnd-rise">
        <PageHead eyebrow="Direction" title="Centre de commande" />
        <p className="cc-vide">Le Centre de commande est réservé à Yéman et Brice.</p>
      </div>
    );
  }

  return (
    <div className="mnd-rise cc">
      <PageHead
        eyebrow="Direction"
        title="Centre de commande"
        sub="Les agents préparent, Yéman et Brice décident."
        actions={pose ? <Button variant="copper" disabled={attente !== null} onClick={() => void briefing('matin')}>{attente === 'briefing-matin' ? 'Le briefing s’écrit…' : 'Écrire le briefing du jour'}</Button> : undefined}
      />

      <div className={`cc-etat${pose ? ' cc-etat--pose' : ''}`} role="status">
        {etat === null ? 'On interroge l’orchestrateur…'
          : pose ? <>L’orchestrateur est en service (version {etat.version}). Ce mois : {depense.toFixed(2).replace('.', ',')} $ sur {reglages.plafondUsd} $ de plafond.</>
            : <>L’orchestrateur n’est pas encore posé : la journée ci-dessous est lue dans le Trône et le briefing s’écrit sans Claude. Pour le poser, le dossier du bureau « A recoller - centre de commande ».</>}
      </div>

      {/* ── AUJOURD'HUI ── */}
      <section className="cc-jour" aria-labelledby="cc-jour-titre">
        <h3 id="cc-jour-titre" className="cc-jour__titre">{jourEnClair(today).replace(/^./, (c) => c.toUpperCase())}</h3>
        <div className="cc-tuiles">
          <button type="button" className="cc-tuile" onClick={() => navigate('/calendrier')}>
            <span className="cc-tuile__chiffre">{faits.rdv.nombre}</span>
            <span className="cc-tuile__nom">Rendez-vous</span>
            <span className="cc-tuile__sous">{faits.rdv.premiere ? `${heureEnClair(faits.rdv.premiere)} à ${heureEnClair(faits.rdv.derniere)}` : 'Aucun aujourd’hui'}</span>
          </button>
          <button type="button" className="cc-tuile" onClick={() => navigate('/demandes')}>
            <span className="cc-tuile__chiffre">{faits.demandesNouvelles}</span>
            <span className="cc-tuile__nom">Demandes du site</span>
            <span className="cc-tuile__sous">à traiter</span>
          </button>
          <button type="button" className="cc-tuile" onClick={() => setOuvert('validations')}>
            <span className="cc-tuile__chiffre">{faits.validationsEnAttente + nAtelier}</span>
            <span className="cc-tuile__nom">Validations</span>
            <span className="cc-tuile__sous">vous attendent</span>
          </button>
          <button type="button" className="cc-tuile" onClick={() => navigate('/')}>
            <span className="cc-tuile__chiffre cc-tuile__chiffre--argent">{francs(faits.encaisse?.aCeJour ?? 0)}</span>
            <span className="cc-tuile__nom">Encaissé à ce jour</span>
            <span className="cc-tuile__sous">mois dernier au même jour : {francs(faits.encaisse?.moisPrecedent ?? 0)}</span>
          </button>
        </div>

        <div className="cc-briefings">
          <article className="cc-briefing">
            <p className="cc-briefing__sur">Écrit sans Claude, à l’instant</p>
            <h4>{base.titre}</h4>
            <ul>{base.points.map((p) => <li key={p}>{p}</li>)}</ul>
          </article>
          {duJour && (
            <article className="cc-briefing cc-briefing--ia">
              <p className="cc-briefing__sur">{TITRE_DU_GENRE[duJour.genre]} · écrit à {heureDe(duJour.creeLe)} par l’orchestrateur</p>
              <h4>{duJour.sortie.titre}</h4>
              {duJour.sortie.resume && <p>{duJour.sortie.resume}</p>}
              {duJour.sortie.priorites.length > 0 && (
                <ol className="cc-priorites">{duJour.sortie.priorites.map((p) => <li key={p.texte}><b>{p.texte}</b><span>{p.pourquoi}</span></li>)}</ol>
              )}
              {duJour.sortie.alertes.length > 0 && (
                <ul className="cc-alertes">{duJour.sortie.alertes.map((a) => <li key={a.texte}>{a.texte}</li>)}</ul>
              )}
              {duJour.sortie.propositions.length > 0 && (
                <div className="cc-propositions">
                  <p className="cc-briefing__sur">Propositions</p>
                  {duJour.sortie.propositions.map((p) => (
                    <div key={p.texte} className="cc-proposition">
                      <span>{p.texte} <small>{nomDeLAgent(p.agent)} · {GENRE_DIT[p.genre] ?? p.genre}</small></span>
                      <Niveau niveau={p.niveau} />
                      <Button size="sm" variant="ghost" onClick={() => {
                        const m = creeLaMission({ titre: p.texte.slice(0, 80), objectif: p.texte, par: moi, source: 'briefing', consigne: duJour.consigne,
                          taches: [nouvelleTache({ titre: p.texte, agent: p.agent, genre: p.genre, niveau: p.niveau, echeance: addDaysISO(today, 7) })] });
                        setOuvert('missions'); setMissionOuverte(m.id);
                      }}>En faire une mission</Button>
                    </div>
                  ))}
                </div>
              )}
            </article>
          )}
        </div>
      </section>

      <div className="cc-groupes">
        <Groupe id="validations" nom="Validations" ouvert={ouvert === 'validations'} bascule={bascule}
          resume={aValider.length || nAtelier ? [aValider.length ? pl(aValider.length, 'tâche', 'tâches') : '', nAtelier ? `${nAtelier} à l’atelier des contenus` : ''].filter(Boolean).join(' · ') + ' pour Yéman ou Brice' : 'Rien n’attend de décision'}>
          {nAtelier > 0 && (
            <div className="cc-validation">
              <div className="cc-validation__dire">
                <b>L’atelier des contenus attend votre relecture</b>
                <small>{aRelireAtelier.map((x) => pl(x.n, x.un, x.plusieurs)).join(', ')}</small>
              </div>
              <div className="cc-actions"><Button size="sm" onClick={() => navigate('/atelier-des-contenus')}>Ouvrir l’atelier</Button></div>
            </div>
          )}
          {aValider.length === 0 ? (nAtelier ? null : <p className="cc-vide">Aucune tâche n’attend de validation. Les tâches à relire et les décisions humaines arrivent ici.</p>) : (
            <div className="cc-liste">
              {aValider.map(({ m, t }) => (
                <div key={t.id} className="cc-validation">
                  <div className="cc-validation__dire">
                    <b>{t.titre}</b>
                    <small>{m.titre} · {nomDeLAgent(t.agent)} · {GENRE_DIT[t.genre] ?? t.genre}{t.echeance ? ` · pour le ${dateDite(t.echeance)}` : ''}</small>
                    {t.pourquoi && <small>{t.pourquoi}</small>}
                  </div>
                  <Niveau niveau={t.niveau} />
                  <Input placeholder="Un mot (facultatif)" value={mots[t.id] ?? ''} onChange={(e) => setMots({ ...mots, [t.id]: e.target.value })} aria-label="Un mot avec la décision" />
                  <div className="cc-actions">
                    <Button size="sm" onClick={() => tranche(m, t, 'oui')}>Valider</Button>
                    <Button size="sm" variant="ghost" onClick={() => tranche(m, t, 'non')}>Refuser</Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Groupe>

        <Groupe id="missions" nom="Missions" ouvert={ouvert === 'missions'} bascule={bascule}
          resume={`${pl(ouvertes.length, 'mission ouverte', 'missions ouvertes')}${faits.tachesEnRetard ? ` · ${pl(faits.tachesEnRetard, 'tâche en retard', 'tâches en retard')}` : ''}`}>
          <div className="cc-nouvelle">
            <label className="cc-label" htmlFor="cc-objectif">Un objectif, en une phrase</label>
            <Textarea id="cc-objectif" rows={3} value={objectif} onChange={(e) => setObjectif(e.target.value)}
              placeholder="Par exemple : préparer la campagne de novembre pour les soins." />
            <p className="cc-note">Les noms de clientes deviennent prénom et initiale, les numéros disparaissent, avant que rien ne parte.</p>
            <div className="cc-actions">
              {pose && <Button variant="copper" disabled={attente !== null || objectif.trim().length < 8} onClick={() => void decoupe()}>{attente === 'mission' ? 'L’orchestrateur découpe…' : 'Découper avec l’orchestrateur'}</Button>}
              <Button variant={pose ? 'ghost' : 'indigo'} disabled={objectif.trim().length < 4} onClick={aLaMain}>Créer à la main</Button>
            </div>
          </div>
          {ouvertes.length === 0 && <p className="cc-vide">Aucune mission ouverte.</p>}
          {ouvertes.map((m) => <LaMission key={m.id} m={m} ouverte={missionOuverte === m.id} bascule={() => setMissionOuverte((x) => (x === m.id ? null : m.id))} moi={moi} today={today} />)}
          {fermees.length > 0 && <p className="cc-note">{pl(fermees.length, 'mission terminée ou abandonnée', 'missions terminées ou abandonnées')}, gardées au journal.</p>}
        </Groupe>

        <Groupe id="briefings" nom="Briefings et rapports" ouvert={ouvert === 'briefings'} bascule={bascule}
          resume={briefings.length ? `Le dernier : ${dateDite(briefings[0].jour)}, ${TITRE_DU_GENRE[briefings[0].genre].toLowerCase()}` : 'Aucun encore : le premier viendra demain matin, une fois l’orchestrateur posé'}>
          {pose && (
            <div className="cc-actions">
              {(['lundi', 'vendredi', 'mois'] as GenreDeBriefing[]).map((g) => (
                <Button key={g} size="sm" variant="ghost" disabled={attente !== null} onClick={() => void briefing(g)}>{attente === `briefing-${g}` ? 'Il s’écrit…' : TITRE_DU_GENRE[g]}</Button>
              ))}
            </div>
          )}
          <p className="cc-note">Automatiques : le briefing chaque matin à 7 h, la semaine le lundi à 7 h 30, la revue le vendredi à 17 h, le rapport le premier du mois, avec une notification.</p>
          {briefings.length === 0 ? <p className="cc-vide">Aucun briefing rédigé pour l’instant.</p> : (
            <div className="cc-liste">
              {briefings.slice(0, 20).map((b) => (
                <details key={b.id} className="cc-ancien">
                  <summary><b>{TITRE_DU_GENRE[b.genre]}</b> · {dateDite(b.jour)} · {b.source === 'auto' ? 'automatique' : 'demandé'} · {b.cout.toFixed(3).replace('.', ',')} $</summary>
                  <p><b>{b.sortie.titre}</b></p>
                  {b.sortie.resume && <p>{b.sortie.resume}</p>}
                  <ol className="cc-priorites">{b.sortie.priorites.map((p) => <li key={p.texte}><b>{p.texte}</b><span>{p.pourquoi}</span></li>)}</ol>
                  <p className="cc-note">Consigne {b.consigne}, modèle {b.modele}.</p>
                </details>
              ))}
            </div>
          )}
        </Groupe>

        <Groupe id="agents" nom="Les agents" ouvert={ouvert === 'agents'} bascule={bascule}
          resume={`${pl(AGENTS.filter((a) => etatDeLAgent(a, pose) === 'en-service').length, 'en service', 'en service')} sur ${AGENTS.length}, les autres arrivent par phases`}>
          {([1, 2, 3, 4, 5] as Phase[]).map((ph) => (
            <div key={ph} className="cc-phase">
              <p className="cc-phase__titre">Phase {ph} · {PHASES[ph].nom}</p>
              {AGENTS.filter((a) => a.phase === ph).map((a) => {
                const e = etatDeLAgent(a, pose);
                return (
                  <div key={a.id} className="cc-agent">
                    <div className="cc-agent__tete">
                      <b>{a.nom}</b>
                      <Badge tone={e === 'en-service' ? 'indigo' : e === 'pret' ? 'copper' : undefined}>{e === 'en-service' ? 'En service' : e === 'pret' ? 'Prêt, fonction à poser' : `Phase ${a.phase}`}</Badge>
                    </div>
                    <p>{a.mission}</p>
                    <small>Lit : {a.lit.join(', ')}. Rend : {a.produit.join(', ')}. Validation de ce qu’il produit, au minimum : {NIVEAU_DIT[a.niveau].toLowerCase()}.{a.consigne ? ` Consigne ${a.consigne}.` : ''}</small>
                    <small className="cc-agent__garde">Jamais : {a.gardeFous.join(' ; ')}.</small>
                  </div>
                );
              })}
            </div>
          ))}
          <p className="cc-note">Consignes versionnées : {Object.keys(CONSIGNES).join(', ')}.</p>
        </Groupe>

        <Groupe id="memoire" nom="La mémoire de la Maison" ouvert={ouvert === 'memoire'} bascule={bascule}
          resume={`${MEMOIRE.length} rubriques sourcées${notes.length ? `, ${pl(notes.length, 'note des fondateurs', 'notes des fondateurs')}` : ''}`}>
          <p className="cc-note">Ce que les agents relisent avant d’écrire. Chaque rubrique dit sa source ; un banc vérifie qu’elle dit toujours vrai.</p>
          {MEMOIRE.map((r) => (
            <details key={r.id} className="cc-ancien">
              <summary><b>{r.titre}</b> <small>{r.source}</small></summary>
              <ul>{r.faits.map((f) => <li key={f}>{f}</li>)}</ul>
            </details>
          ))}
          <div className="cc-nouvelle">
            <label className="cc-label" htmlFor="cc-note-texte">Ajouter une note</label>
            <div className="cc-deux">
              <Input placeholder="Rubrique (par exemple : ton, saison, partenaire)" value={note.rubrique} onChange={(e) => setNote({ ...note, rubrique: e.target.value })} aria-label="Rubrique" />
              <Textarea id="cc-note-texte" rows={2} value={note.texte} onChange={(e) => setNote({ ...note, texte: e.target.value })} placeholder="Ce que les agents doivent savoir." />
            </div>
            <div className="cc-actions">
              <Button size="sm" disabled={!note.texte.trim()} onClick={() => { ajouteUneNote(note.rubrique, objetPourClaude(note.texte, personnes), moi); setNote({ rubrique: '', texte: '' }); }}>Ajouter à la mémoire</Button>
            </div>
          </div>
          {notes.map((n) => (
            <div key={n.id} className="cc-noteligne">
              <span>{n.rubrique && <b>{n.rubrique} · </b>}{n.texte} <small>{n.par}, {dateDite(n.le)}</small></span>
              <Button size="sm" variant="ghost" onClick={() => retireLaNote(n.id, moi)}>Retirer</Button>
            </div>
          ))}
        </Groupe>

        <Groupe id="journal" nom="Le journal des actions" ouvert={ouvert === 'journal'} bascule={bascule}
          resume={journal.length ? `${pl(journal.length, 'ligne', 'lignes')}, la dernière ${dateDite(journal[0].quand)} à ${heureDe(journal[0].quand)}` : 'Vide pour l’instant'}>
          {journal.length === 0 ? <p className="cc-vide">Chaque geste du Centre et de l’orchestrateur s’écrit ici : qui, quoi, quand, pourquoi, et le résultat.</p> : (
            <div className="cc-table" role="table" aria-label="Journal des actions">
              {journal.map((l) => (
                <div key={l.id} className={`cc-jligne cc-jligne--${l.statut}`} role="row">
                  <span role="cell">{dateDite(l.quand)} {heureDe(l.quand)}</span>
                  <span role="cell">{l.qui}</span>
                  <span role="cell">{l.quoi}{l.pourquoi ? <small> · {l.pourquoi}</small> : null}{l.erreur ? <small className="cc-erreur"> · {l.erreur}</small> : null}</span>
                  <span role="cell">{l.statut === 'ok' ? 'Fait' : l.statut === 'refus' ? 'Refusé' : l.statut === 'attente' ? 'En cours' : 'Erreur'}</span>
                </div>
              ))}
            </div>
          )}
        </Groupe>

        <Groupe id="reglages" nom="Réglages et plafond" ouvert={ouvert === 'reglages'} bascule={bascule}
          resume={`${depense.toFixed(2).replace('.', ',')} $ dépensés ce mois sur ${reglages.plafondUsd} $ · automatique ${reglages.automatique ? 'en marche' : 'coupé'}`}>
          <div className="cc-reglage">
            <span>Plafond mensuel des appels à Claude <small>Au-delà, les agents s’arrêtent et le disent. Estimation prudente : la vraie facture est dans la console d’Anthropic.</small></span>
            <div className="cc-suffixe"><Input type="number" min={1} max={200} step={1} value={reglages.plafondUsd}
              onChange={(e) => { const v = Number(e.target.value); if (Number.isFinite(v) && v >= 1 && v <= 200) changeLesReglages({ plafondUsd: v }, moi); }} aria-label="Plafond mensuel en dollars" /><span>$ par mois</span></div>
          </div>
          <div className="cc-reglage">
            <span>Briefings et rapports automatiques <small>Le matin, le lundi, le vendredi, le premier du mois.</small></span>
            <Select value={reglages.automatique ? 'oui' : 'non'} onChange={(e) => changeLesReglages({ automatique: e.target.value === 'oui' }, moi)} aria-label="Briefings automatiques">
              <option value="oui">En marche</option><option value="non">Coupés</option>
            </Select>
          </div>
          <div className="cc-reglage">
            <span>Notification sur le téléphone <small>Quand un briefing est prêt, à Yéman et Brice.</small></span>
            <Select value={reglages.notifier ? 'oui' : 'non'} onChange={(e) => changeLesReglages({ notifier: e.target.value === 'oui' }, moi)} aria-label="Notification">
              <option value="oui">Oui</option><option value="non">Non</option>
            </Select>
          </div>
          <p className="cc-note">Ce mois ({mois}) : {compteur[mois]?.appels ?? 0} appels, {depense.toFixed(4).replace('.', ',')} $.</p>
        </Groupe>

        <Groupe id="suite" nom="La suite du Centre" ouvert={ouvert === 'suite'} bascule={bascule}
          resume={`${aVenir.map((ph) => PHASES[ph].nom.toLowerCase()).join(', ').replace(/^./, (c) => c.toUpperCase())} : ${pl(aVenir.length, 'phase à venir', 'phases à venir')}`}>
          {PHASES_CONSTRUITES.includes(2) && (
            <div className="cc-noteligne">
              <span><b>Phase 2 · {PHASES[2].nom}, construite.</b> {PHASES[2].dit} Elle vit dans l’atelier des contenus.</span>
              <Button size="sm" variant="ghost" onClick={() => navigate('/atelier-des-contenus')}>Ouvrir</Button>
            </div>
          )}
          {aVenir.map((ph) => (
            <div key={ph} className="cc-noteligne"><span><b>Phase {ph} · {PHASES[ph].nom}.</b> {PHASES[ph].dit}</span></div>
          ))}
          <p className="cc-note">Les réseaux sociaux ne sont pas encore reliés : tant que Meta n’a pas ouvert l’accès, la publication reste à la main. Aucune intégration n’est simulée.</p>
        </Groupe>
      </div>
    </div>
  );
}

function LaMission({ m, ouverte, bascule, moi, today }: { m: Mission; ouverte: boolean; bascule: () => void; moi: string; today: string }) {
  const [t, setT] = useState({ titre: '', agent: 'orchestrateur', genre: 'brouillon', echeance: addDaysISO(today, 7) });
  const faites = m.taches.filter((x) => x.statut === 'faite' || x.statut === 'validee').length;
  const avance = (x: Tache, statut: StatutDeTache) => { const r = avanceLaTache(m.id, x.id, statut, moi); if (!r.ok) toast(r.pourquoi ?? 'Refusé.'); };
  const niveauDuGenre = niveauRetenu(t.genre);
  return (
    <div className={`cc-mission${ouverte ? ' is-ouverte' : ''}`}>
      <button type="button" className="cc-mission__ligne" aria-expanded={ouverte} onClick={bascule}>
        <b>{m.titre}</b>
        <small>{m.statut === 'a-relire' ? 'À relire' : 'En cours'} · {faites} sur {m.taches.length} tâches · {m.source === 'orchestrateur' ? 'découpée par l’orchestrateur' : m.source === 'briefing' ? 'née d’un briefing' : 'créée à la main'} · {dateDite(m.creeLe)}</small>
      </button>
      {ouverte && (
        <div className="cc-mission__corps">
          <p>{m.objectif}</p>
          {m.questions.length > 0 && (
            <div className="cc-questions"><p className="cc-label">À trancher par les fondateurs</p><ul>{m.questions.map((q) => <li key={q}>{q}</li>)}</ul></div>
          )}
          {m.taches.map((x) => (
            <div key={x.id} className="cc-tache">
              <div className="cc-validation__dire">
                <b>{x.titre}</b>
                <small>{nomDeLAgent(x.agent)} · {GENRE_DIT[x.genre] ?? x.genre}{x.echeance ? ` · pour le ${dateDite(x.echeance)}` : ''}{x.validation ? ` · ${x.validation.verdict === 'oui' ? 'validée' : 'refusée'} par ${x.validation.nom}` : ''}</small>
              </div>
              <Niveau niveau={x.niveau} />
              <Select value={x.statut} onChange={(e) => avance(x, e.target.value as StatutDeTache)} aria-label={`Statut de ${x.titre}`}>
                {(Object.keys(STATUT_DE_TACHE_DIT) as StatutDeTache[]).filter((s) => (s !== 'validee' && s !== 'refusee') || s === x.statut).map((s) => <option key={s} value={s}>{STATUT_DE_TACHE_DIT[s]}</option>)}
              </Select>
              <Button size="sm" variant="ghost" onClick={() => retireLaTache(m.id, x.id, moi)}>Retirer</Button>
            </div>
          ))}
          <div className="cc-ajout">
            <Input placeholder="Une tâche" value={t.titre} onChange={(e) => setT({ ...t, titre: e.target.value })} aria-label="Nouvelle tâche" />
            <Select value={t.agent} onChange={(e) => setT({ ...t, agent: e.target.value })} aria-label="Agent">
              {AGENTS.map((a) => <option key={a.id} value={a.id}>{a.nom}</option>)}
            </Select>
            <Select value={t.genre} onChange={(e) => setT({ ...t, genre: e.target.value })} aria-label="Genre">
              {GENRES.map((g) => <option key={g} value={g}>{GENRE_DIT[g] ?? g}</option>)}
            </Select>
            <Input type="date" value={t.echeance} onChange={(e) => setT({ ...t, echeance: e.target.value })} aria-label="Échéance" />
            <Button size="sm" disabled={!t.titre.trim()} onClick={() => { ajouteLaTache(m.id, nouvelleTache({ ...t }), moi); setT({ ...t, titre: '' }); }}>Ajouter</Button>
          </div>
          <p className="cc-note">Ce genre de tâche se fait en « {NIVEAU_DIT[niveauDuGenre].toLowerCase()} » au moins.</p>
          <div className="cc-actions">
            {m.statut === 'a-relire' && <Button size="sm" onClick={() => changeLeStatutDeMission(m.id, 'en-cours', moi)}>Lancer la mission</Button>}
            <Button size="sm" variant="ghost" onClick={() => changeLeStatutDeMission(m.id, 'terminee', moi)}>Terminer</Button>
            <Button size="sm" variant="ghost" onClick={() => changeLeStatutDeMission(m.id, 'abandonnee', moi)}>Abandonner</Button>
          </div>
        </div>
      )}
    </div>
  );
}
