import { useEffect, useState } from 'react';
import { PageHead } from '../_ui';
import { Button, Input, Textarea, toast, demande } from '../../../../ds/components';
import { useAuth, useStaff as useMonProfil } from '../../../../shared/auth';
import { useSettings } from '../../../../shared/settings';
import { useClients } from '../../../../shared/clients';
import { useStaff as useEquipe } from '../equipe/data';
import {
  ASSISTANTS_DE_LA_MAISON, CHOIX_DIT, RELAIS_DIT, decisionEnAttente, etatDe, reglagesComplets,
  type Assistant, type ChoixDeDecision, type Decision, type Relais, type ReglagesAssistants,
} from '../../../../shared/assistants-pur';
import {
  GENRE_DE_DECISION_DIT, donneUnJeton, etatDuRelaisDit, heureCotonouDite, litLesAssistantsRelies, minuitCotonouISO, prenomDe, quandDit,
  reglagesDits, retireLeJeton, trancheLaDecision, trancheLaPlace, type ChoixDePlace, type LectureDesAssistants,
} from '../../../../shared/assistants';
import type { Geste } from '../../../../shared/journal';
import './assistants.css';

/* ═══════════════════════════════════════════════════════════════════
   LES ASSISTANTS RELIÉS, 31 octobre 2026, maquette TtHPKpjCqovrn8nookJ7eu,
   section « L'écran Les assistants ». Les souverains seuls (route
   `/assistants`, ROUTES_SOUVERAIN).

   CINQ PARTS, DANS L'ORDRE OÙ ELLE LES LIT :
     ① LES TUILES : un assistant par tuile, son porteur, son état (éveillé,
        endormi depuis, empêché, sans jeton), son dernier passage, les
        compteurs du jour sans nom, le jeton (donné une fois, retiré d'un
        clic) ;
     ② LES DÉCISIONS EN ATTENTE du porteur connecté : le résumé, la
        proposition, les boutons de la décision ; une place tenue se
        confirme, se déplace ou se refuse ici ;
     ③ LES RELAIS : les trente derniers, de qui à qui, le genre, le mot ;
     ④ LE JOURNAL DU JOUR : les gestes entrés par la porte « assistant » ;
     ⑤ LES RÉGLAGES : rythme, veille, silence, tenue (`settings.assistants`).

   RIEN NE SE LIT EN TEMPS RÉEL : à l'ouverture et toutes les 60 secondes.
   Les assistants passent toutes les dix minutes ; une seconde près ne
   change rien, et le téléphone du porteur n'a pas à tenir un canal ouvert.

   UN SEUL PANNEAU OUVERT, LE RÉSUMÉ SUR LA LIGNE, LA BARRE QUI SUIT : la
   grammaire des écrans en liste du Trône (Accès & personnel, 22 septembre
   2026). Aucun nom de contact privé n'arrive ici : la table n'en porte pas,
   et la fonction refuse un mot qui en contiendrait un. La cliente d'un
   relais se dit par sa fiche du Trône quand on la connaît, sinon par la fin
   de son numéro. */

const DIT_VERBE: Record<Geste['verbe'], string> = { pose: 'a posé', modifie: 'a modifié', efface: 'a effacé' };

const DIT_APRES_LE_CHOIX: Record<string, string> = {
  envoyer: 'Tranché : l’assistant enverra au prochain passage.',
  modifier: 'Tranché avec votre texte : l’assistant l’enverra au prochain passage.',
  non: 'Tranché : rien ne partira.',
  confirmer: 'Place confirmée : la confirmation de la Maison part.',
  'autre-heure': 'Autre heure proposée : l’assistant qui a posé la relaie à la cliente.',
};

const CHAMPS_DES_REGLAGES: { cle: keyof ReglagesAssistants; libelle: string; unite: string; min: number; max: number }[] = [
  { cle: 'rythmeMin', libelle: 'Rythme des passages', unite: 'min', min: 5, max: 60 },
  { cle: 'veilleDe', libelle: 'Veille à partir de', unite: 'h', min: 0, max: 23 },
  { cle: 'veilleA', libelle: 'Veille jusqu’à', unite: 'h', min: 1, max: 24 },
  { cle: 'silenceMin', libelle: 'Silence avant de prévenir', unite: 'min', min: 15, max: 240 },
  { cle: 'tenueHeures', libelle: 'Une place tenue dure', unite: 'h ouvrées', min: 1, max: 12 },
];

const pluriel = (n: number, un: string, plusieurs: string) => `${n} ${n > 1 ? plusieurs : un}`;
const apresMs = (iso: string | null | undefined, borneMs: number): boolean => {
  const t = Date.parse(iso ?? '');
  return Number.isFinite(t) && t >= borneMs;
};

export default function Assistants() {
  const { session } = useAuth();
  const monProfil = useMonProfil();
  const monId = session?.user?.id ?? null;
  const estSouverain = monProfil?.role === 'souverain';
  const [equipe] = useEquipe();
  const [clients] = useClients();
  const [reglages, setReglages] = useSettings();
  const [lecture, setLecture] = useState<LectureDesAssistants | null>(null);
  const [maintenant, setMaintenant] = useState(() => Date.now());
  const [tour, setTour] = useState(0);
  const [ouvert, setOuvert] = useState<string | null>(null);
  const [jetonMontre, setJetonMontre] = useState<{ id: string; nom: string; jeton: string } | null>(null);
  const [enCours, setEnCours] = useState<string | null>(null);

  /* LA LECTURE : à l'ouverture, après chaque geste (`relis`), et toutes les
     60 secondes. Le compteur `tour` relance l'effet, qui repart avec une
     horloge neuve ; une lecture arrivée après la fermeture ne touche rien. */
  const relis = () => setTour((n) => n + 1);
  useEffect(() => {
    let vivant = true;
    const lis = async () => {
      const ms = Date.now();
      const l = await litLesAssistantsRelies(ms);
      if (!vivant) return;
      setMaintenant(ms);
      setLecture(l);
    };
    void lis();
    const t = setInterval(() => { void lis(); }, 60_000);
    return () => { vivant = false; clearInterval(t); };
  }, [tour]);

  const r = reglagesComplets(reglages.assistants);
  const assistants: Assistant[] = lecture?.assistants ?? [];
  const minuitMs = Date.parse(minuitCotonouISO(maintenant));
  const relais: Relais[] = lecture?.relais ?? [];
  const relaisDuJour = relais.filter((x) => apresMs(x.quand, minuitMs));
  const decisions: Decision[] = (lecture?.decisions ?? []).filter((d) => decisionEnAttente(d, maintenant));
  const journal: Geste[] = lecture?.journal ?? [];

  const prenomDuPorteur = (a: Assistant): string => {
    const m = equipe.find((x) => x.id === a.porteurTeamId);
    if (m) return prenomDe(m.name);
    return ASSISTANTS_DE_LA_MAISON.find((x) => x.id === a.id)?.porteurPrenom ?? '';
  };
  const nomDe = (id: string): string => assistants.find((a) => a.id === id)?.nom ?? ASSISTANTS_DE_LA_MAISON.find((x) => x.id === id)?.nom ?? id;
  const clienteDite = (clientId: string | null | undefined, numeroCle: string | null | undefined): string => {
    const c = clientId ? clients.find((x) => x.id === clientId) : undefined;
    if (c) return c.name;
    if (numeroCle) return `la cliente dont le numéro finit par ${numeroCle.slice(-4)}`;
    return '';
  };
  const compteurs = (a: Assistant) => ({
    traites: a.etat?.traites ?? 0,
    rdv: journal.filter((g) => g.parNom === a.nom && g.table === 'appointments' && g.verbe === 'pose').length,
    relais: relaisDuJour.filter((x) => x.de === a.id).length,
    /* La politique de la table ne rend que les décisions du porteur connecté :
       le compte n'a de sens que pour son assistant à lui. */
    enAttente: a.porteurUserId && a.porteurUserId === monId ? decisions.filter((d) => d.assistant === a.id).length : null,
  });

  /* ── Les jetons ── */
  const donner = async (a: Assistant) => {
    if (a.aUnJeton && !await demande({
      quoi: 'Jeton', titre: `Donner un nouveau jeton à ${a.nom} ?`,
      dit: 'L’ancien ne vaudra plus : la session de l’assistant devra recevoir le nouveau dans son reglages.json.',
      accepter: 'Donner le jeton', refuser: 'Garder l’ancien',
    })) return;
    setEnCours(`jeton:${a.id}`);
    const res = await donneUnJeton(a.id, { nom: a.nom, ...(a.porteurTeamId ? { porteurTeamId: a.porteurTeamId } : {}), ...(a.appareil ? { appareil: a.appareil } : {}) });
    setEnCours(null);
    if (!res.ok) { toast(res.erreur); return; }
    setJetonMontre({ id: a.id, nom: a.nom, jeton: res.jeton });
    relis();
  };
  const retirer = async (a: Assistant) => {
    if (!await demande({
      quoi: 'Jeton', titre: `Retirer le jeton de ${a.nom} ?`,
      dit: 'Son prochain passage sera refusé : l’assistant ne pourra plus rien poser ni déposer tant qu’un nouveau jeton ne lui est pas donné.',
      accepter: 'Retirer le jeton', refuser: 'Le garder',
    })) return;
    setEnCours(`jeton:${a.id}`);
    const res = await retireLeJeton(a.id);
    setEnCours(null);
    if (!res.ok) { toast(res.erreur); return; }
    if (jetonMontre?.id === a.id) setJetonMontre(null);
    toast(`Jeton retiré : ${a.nom} ne passe plus.`);
    relis();
  };
  const copier = async (texte: string) => {
    try { await navigator.clipboard.writeText(texte); toast('Jeton copié. Collez-le dans reglages.json, puis fermez ce bloc.'); } catch { toast('La copie n’a pas marché : sélectionnez le jeton à la main.'); }
  };

  /* ── Les décisions ── */
  const trancher = async (d: Decision, choix: ChoixDeDecision, extras: { texte?: string; date?: string; time?: string } = {}) => {
    setEnCours(`decision:${d.id}`);
    const res = d.genre === 'place-tenue'
      ? await trancheLaPlace({ decisionId: d.id, choix: choix as ChoixDePlace, ...(extras.date ? { date: extras.date } : {}), ...(extras.time ? { time: extras.time } : {}) })
      : await trancheLaDecision(d.id, choix, extras.texte);
    setEnCours(null);
    if (!res.ok) { toast(res.erreur); return; }
    toast(DIT_APRES_LE_CHOIX[choix] ?? 'Tranché.');
    setOuvert(null);
    relis();
  };

  /* ── Les réglages ── */
  const regle = (cle: keyof ReglagesAssistants, v: string) => {
    const n = v.trim() === '' ? undefined : Number(v);
    setReglages((prev) => ({ ...prev, assistants: { ...(prev.assistants ?? {}), [cle]: n !== undefined && Number.isFinite(n) ? n : undefined } }));
  };

  const luLe = lecture ? heureCotonouDite(lecture.luLe) : '';

  return (
    <div className="ast">
      <PageHead
        eyebrow="Direction · Les assistants"
        title="Deux assistants, un seul Trône."
        sub="Qui veille, ce qui attend votre geste, ce qu’ils ont fait aujourd’hui. Rien ne part sans le oui du porteur."
        actions={(
          <div className="ast-lu">
            <span className="ast-doux">{lecture ? `Lu à ${luLe} · relu toutes les minutes` : 'Lecture…'}</span>
            <Button size="sm" variant="ghost" onClick={relis}>Relire</Button>
          </div>
        )}
      />

      {!estSouverain && (
        <p className="ast-doux ast-note">Cet écran est celui de la direction : les décisions et les jetons ne s’y touchent qu’avec ce rang.</p>
      )}
      {lecture?.tablesAbsentes && (
        <p className="ast-alerte ast-note">Les tables des assistants ne sont pas encore en ligne (migration 0148) : l’écran se remplira dès qu’elles le seront.</p>
      )}

      {/* ══ ① LES TUILES ══ */}
      <section className="ast-tuiles" aria-label="Les assistants">
        {lecture && !lecture.tablesAbsentes && assistants.length === 0 && (
          <div className="ast-carte"><p className="ast-doux ast-vide">Aucun assistant dans la table : la migration 0148 amorce Opale et Onyx.</p></div>
        )}
        {assistants.map((a) => {
          const e = etatDe(a, maintenant);
          const c = compteurs(a);
          const occupe = enCours === `jeton:${a.id}`;
          return (
            <div className={`ast-tuile est-${e.etat}`} key={a.id}>
              <div className="ast-tuile__tete">
                <b className="ast-tuile__nom">{a.nom}</b>
                <span className="ast-etat"><i className="ast-point" aria-hidden="true" />{e.etat === 'eveille' ? 'éveillé' : e.etat === 'endormi' ? 'endormi' : e.etat === 'empeche' ? 'empêché' : 'sans jeton'}</span>
              </div>
              <span className="ast-doux">
                {prenomDuPorteur(a) || 'porteur à nommer'}{a.appareil ? ` · ${a.appareil}` : ''}
              </span>
              <span className="ast-detail">
                {e.detail}{a.vuLe && e.etat !== 'eveille' ? ` · dernier passage ${quandDit(a.vuLe, maintenant)}` : ''}
              </span>
              <span className="ast-chiffres">
                <span><b>{c.traites}</b> traités</span>
                <span><b>{c.rdv}</b> RDV</span>
                <span><b>{c.relais}</b> relais</span>
                {c.enAttente !== null && <span><b>{c.enAttente}</b> en attente</span>}
              </span>
              {a.etat?.dortPrevenuLe && e.etat === 'endormi' && (
                <span className="ast-doux">Prévenu sur son téléphone {quandDit(a.etat.dortPrevenuLe, maintenant)}</span>
              )}
              {a.etat?.version && <span className="ast-doux ast-petit">Charte {a.etat.version}</span>}
              {estSouverain && (
                <div className="ast-gestes">
                  {a.aUnJeton
                    ? <Button size="sm" variant="ghost" disabled={occupe} onClick={() => { void retirer(a); }}>Retirer le jeton</Button>
                    : <Button size="sm" variant="copper" disabled={occupe} onClick={() => { void donner(a); }}>Donner un jeton</Button>}
                  {a.aUnJeton && <Button size="sm" variant="ghost" disabled={occupe} onClick={() => { void donner(a); }}>Nouveau jeton</Button>}
                </div>
              )}
              {jetonMontre?.id === a.id && (
                <div className="ast-jeton" role="status">
                  <span className="ast-sur">Le jeton de {jetonMontre.nom}, montré une seule fois</span>
                  <code className="ast-jeton__code">{jetonMontre.jeton}</code>
                  <span className="ast-doux">Collez-le dans le reglages.json de l’assistant, sur son ordinateur. Il ne se verra plus : la base n’en garde que l’empreinte.</span>
                  <div className="ast-gestes">
                    <Button size="sm" variant="copper" onClick={() => { void copier(jetonMontre.jeton); }}>Copier</Button>
                    <Button size="sm" variant="ghost" onClick={() => setJetonMontre(null)}>J’ai fini</Button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </section>

      {/* ══ ② LES DÉCISIONS EN ATTENTE ══ */}
      <section className="ast-carte" aria-label="Décisions en attente">
        <div className="ast-entre">
          <span className="ast-sur">Décisions en attente</span>
          <span className="ast-doux">{decisions.length === 0 ? 'rien n’attend votre geste' : pluriel(decisions.length, 'décision', 'décisions')}</span>
        </div>
        {decisions.length === 0 && (
          <p className="ast-doux ast-vide">Votre assistant dépose ici ce qu’il propose sans l’envoyer : une réponse, une note, une place tenue sur votre fauteuil. Vous tranchez d’un toucher, de l’ordinateur ou du téléphone.</p>
        )}
        <div className="ast-liste">
          {decisions.map((d) => {
            const cle = `decision:${d.id}`;
            const estOuverte = ouvert === cle;
            return (
              <div className={`ast-ligne${estOuverte ? ' est-ouverte' : ''}`} key={d.id}>
                <button type="button" className="ast-ligne__tete" aria-expanded={estOuverte} onClick={() => setOuvert(estOuverte ? null : cle)}>
                  <span className="ast-ligne__h">{quandDit(d.creeLe, maintenant)}</span>
                  <span className="ast-ligne__qui">{nomDe(d.assistant)} · {GENRE_DE_DECISION_DIT[d.genre] ?? d.genre}</span>
                  <span className="ast-ligne__quoi">{d.resume}</span>
                  <span className="ast-ligne__etat">{d.echeance ? `avant ${quandDit(d.echeance, maintenant)}` : d.choix.map((x) => CHOIX_DIT[x] ?? x).join(' · ')}</span>
                </button>
                {estOuverte && (
                  <PanneauDecision
                    decision={d}
                    nom={nomDe(d.assistant)}
                    cliente={clienteDite(d.clientId, d.numeroCle)}
                    occupe={enCours === cle}
                    maintenant={maintenant}
                    fermer={() => setOuvert(null)}
                    trancher={(choix, extras) => { void trancher(d, choix, extras); }}
                  />
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* ══ ③ LES RELAIS ══ */}
      <section className="ast-carte" aria-label="Relais">
        <div className="ast-entre">
          <span className="ast-sur">Relais</span>
          <span className="ast-doux">{relais.length === 0 ? 'aucun relais encore' : `les ${relais.length} derniers · ${relaisDuJour.length} aujourd’hui`}</span>
        </div>
        {relais.length === 0 && (
          <p className="ast-doux ast-vide">Un relais est un fait de la Maison qu’un assistant laisse à l’autre : une cliente par son numéro, un jour, une heure, une prestation. Jamais la phrase d’un message.</p>
        )}
        <div className="ast-liste">
          {relais.map((x) => {
            const cle = `relais:${x.id}`;
            const estOuverte = ouvert === cle;
            const qui = clienteDite(x.clientId, x.numeroCle);
            return (
              <div className={`ast-ligne${estOuverte ? ' est-ouverte' : ''}`} key={x.id}>
                <button type="button" className="ast-ligne__tete" aria-expanded={estOuverte} onClick={() => setOuvert(estOuverte ? null : cle)}>
                  <span className="ast-ligne__h">{quandDit(x.quand, maintenant)}</span>
                  <span className="ast-ligne__qui">{nomDe(x.de)} → {nomDe(x.pour)}</span>
                  <span className="ast-ligne__quoi"><b>{RELAIS_DIT[x.genre] ?? x.genre}</b>{x.mot ? ` · ${x.mot}` : ''}</span>
                  <span className="ast-ligne__etat">{etatDuRelaisDit(x, maintenant)}</span>
                </button>
                {estOuverte && (
                  <div className="ast-panneau">
                    <div className="ast-suit">
                      <b>{RELAIS_DIT[x.genre] ?? x.genre}</b>
                      <small>{nomDe(x.de)} pour {nomDe(x.pour)} · {quandDit(x.quand, maintenant)}</small>
                      <span className="ast-suit__actions"><Button size="sm" variant="ghost-invert" onClick={() => setOuvert(null)}>Fermer</Button></span>
                    </div>
                    <div className="ast-corps">
                      {x.mot && <p className="ast-proposition">{x.mot}</p>}
                      <dl className="ast-faits">
                        {qui && <><dt>Cliente</dt><dd>{qui}</dd></>}
                        {x.rdvId && <><dt>Rendez-vous</dt><dd className="ast-mono">{x.rdvId}</dd></>}
                        {x.perimeLe && <><dt>Périme</dt><dd>{quandDit(x.perimeLe, maintenant)}</dd></>}
                        <dt>État</dt><dd>{etatDuRelaisDit(x, maintenant)}</dd>
                      </dl>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* ══ ④ LE JOURNAL DU JOUR ══ */}
      <section className="ast-carte" aria-label="Le journal du jour">
        <div className="ast-entre">
          <span className="ast-sur">Le journal du jour</span>
          <span className="ast-doux">{journal.length === 0 ? 'aucun geste aujourd’hui' : pluriel(journal.length, 'geste', 'gestes')}</span>
        </div>
        {journal.length === 0 && (
          <p className="ast-doux ast-vide">Les gestes de la Maison faits par un assistant : rendez-vous posés, notes, relais, places tranchées. Jamais une lecture, un pouce, une proposition. Le mois entier se relit dans Système › Journal.</p>
        )}
        <div className="ast-journal">
          {journal.map((g) => (
            <div className="ast-geste" key={g.id}>
              <span className="ast-ligne__h">{heureCotonouDite(g.quand) || '·'}</span>
              <span className="ast-ligne__qui">{g.parNom}</span>
              <span className="ast-ligne__quoi">{DIT_VERBE[g.verbe] ?? g.verbe} <b>{g.piece}</b></span>
            </div>
          ))}
        </div>
      </section>

      {/* ══ ⑤ LES RÉGLAGES ══ */}
      <section className="ast-carte" aria-label="Réglages">
        <div className="ast-entre">
          <span className="ast-sur">Réglages</span>
          <span className="ast-doux">lus par la fonction et par chaque assistant à son passage</span>
        </div>
        <p className="ast-resume">{reglagesDits(r)}.</p>
        {estSouverain && (
          <div className="ast-reglages">
            {CHAMPS_DES_REGLAGES.map((ch) => {
              const brut = reglages.assistants?.[ch.cle];
              const horsBornes = typeof brut === 'number' && brut !== r[ch.cle];
              return (
                <label key={ch.cle}>
                  <span>{ch.libelle}</span>
                  <span className="ast-champ">
                    <Input type="number" min={ch.min} max={ch.max} step={1} inputMode="numeric"
                      value={typeof brut === 'number' ? String(brut) : ''} placeholder={String(r[ch.cle])}
                      onChange={(e) => regle(ch.cle, e.target.value)} aria-label={ch.libelle} />
                    <span className="ast-doux">{ch.unite}</span>
                  </span>
                  {horsBornes && <span className="ast-alerte ast-petit">Hors des bornes ({ch.min} à {ch.max}) : la Maison lit {r[ch.cle]}.</span>}
                </label>
              );
            })}
          </div>
        )}
      </section>

      <section className="ast-carte ast-regles" aria-label="Ce qu’ils ne font jamais">
        <span className="ast-sur">Ce qu’ils ne font jamais</span>
        <p>Lire un autre téléphone que celui de leur porteur · envoyer sans son oui, hormis le pouce sur un accusé · faire sortir le texte d’un message privé de l’ordinateur · poser un rendez-vous à la souris · toucher aux proches, à la famille, aux fournisseurs au Trône.</p>
      </section>
    </div>
  );
}

/* ═══ LE PANNEAU D'UNE DÉCISION ════════════════════════════════════════
   La proposition de l'assistant, puis les boutons de son genre. « Modifier »
   ouvre le texte ; « Autre heure » demande un jour et une heure. Le panneau
   ne vit qu'ouvert : le refermer oublie ce qu'on y tapait. */
function PanneauDecision({ decision: d, nom, cliente, occupe, maintenant, fermer, trancher }: {
  decision: Decision;
  nom: string;
  cliente: string;
  occupe: boolean;
  maintenant: number;
  fermer: () => void;
  trancher: (choix: ChoixDeDecision, extras?: { texte?: string; date?: string; time?: string }) => void;
}) {
  const [modifie, setModifie] = useState<string | null>(null);
  const [autreHeure, setAutreHeure] = useState<{ date: string; time: string } | null>(null);
  const placeTenue = d.genre === 'place-tenue';

  return (
    <div className="ast-panneau">
      <div className="ast-suit">
        <b>{GENRE_DE_DECISION_DIT[d.genre] ?? d.genre}</b>
        <small>{nom} · {quandDit(d.creeLe, maintenant)}{d.echeance ? ` · à trancher avant ${quandDit(d.echeance, maintenant)}` : ''}</small>
        <span className="ast-suit__actions"><Button size="sm" variant="ghost-invert" onClick={fermer}>Fermer</Button></span>
      </div>
      <div className="ast-corps">
        <p className="ast-resume">{d.resume}</p>
        {cliente && <p className="ast-doux">Cliente : {cliente}</p>}
        {d.proposition && modifie === null && (
          <>
            <span className="ast-sur">{placeTenue ? 'Ce qui a été dit' : 'La réponse proposée, dans votre voix'}</span>
            <p className="ast-proposition">{d.proposition}</p>
          </>
        )}
        {modifie !== null && (
          <label className="ast-modifie">
            <span className="ast-sur">Votre texte</span>
            <Textarea rows={3} value={modifie} onChange={(e) => setModifie(e.target.value)} aria-label="Le texte modifié" />
            <div className="ast-gestes">
              <Button size="sm" variant="copper" disabled={occupe || !modifie.trim()} onClick={() => trancher('modifier', { texte: modifie.trim() })}>Envoyer ce texte</Button>
              <Button size="sm" variant="ghost" onClick={() => setModifie(null)}>Reprendre la proposition</Button>
            </div>
          </label>
        )}
        {autreHeure !== null && (
          <div className="ast-modifie">
            <span className="ast-sur">L’heure que vous proposez</span>
            <div className="ast-gestes">
              <Input type="date" value={autreHeure.date} onChange={(e) => setAutreHeure({ ...autreHeure, date: e.target.value })} aria-label="Le jour" />
              <Input type="time" value={autreHeure.time} onChange={(e) => setAutreHeure({ ...autreHeure, time: e.target.value })} aria-label="L’heure" />
            </div>
            <div className="ast-gestes">
              <Button size="sm" variant="copper" disabled={occupe || !autreHeure.date || !autreHeure.time} onClick={() => trancher('autre-heure', autreHeure)}>Proposer cette heure</Button>
              <Button size="sm" variant="ghost" onClick={() => setAutreHeure(null)}>Annuler</Button>
            </div>
            <span className="ast-doux ast-petit">La place tenue est libérée ; l’assistant qui l’a posée propose cette heure à la cliente.</span>
          </div>
        )}
        {modifie === null && autreHeure === null && (
          <div className="ast-choix">
            {d.choix.map((choix, i) => {
              if (choix === 'modifier') return <Button key={choix} size="sm" variant="ghost" disabled={occupe} onClick={() => setModifie(d.proposition ?? '')}>{CHOIX_DIT[choix]}</Button>;
              if (choix === 'autre-heure') return <Button key={choix} size="sm" variant="ghost" disabled={occupe} onClick={() => setAutreHeure({ date: '', time: '' })}>{CHOIX_DIT[choix]}</Button>;
              return (
                <Button key={choix} size="sm" variant={i === 0 ? 'copper' : 'ghost'} disabled={occupe} onClick={() => trancher(choix)}>
                  {CHOIX_DIT[choix] ?? choix}
                </Button>
              );
            })}
          </div>
        )}
        {placeTenue && <span className="ast-doux ast-petit">Confirmer fait partir la confirmation officielle de la Maison à la cliente ; Non libère la place et le dit à l’assistant qui l’avait posée.</span>}
      </div>
    </div>
  );
}
