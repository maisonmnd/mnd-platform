import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { PageHead } from '../_ui';
import { Badge, Button, Input, Segs, Select, Textarea, toast } from '../../../../ds/components';
import { useStaff } from '../../../../shared/auth';
import { useClients } from '../../../../shared/clients';
import { addDaysISO, todayISO } from '../clients/_shared';
import { STATUT_DIT, type StatutDeContenu } from '../../../../shared/ia-validation-pur';
import { bloquant, type Remarque } from '../../../../shared/ia-marque-pur';
import {
  CHAMPS_DE_RESULTAT, FORMATS, PILIERS, PLATEFORMES, RESULTAT_DIT, declinaisonsDe, equilibreDesPiliers, remarquesDuContenu,
  type Contenu, type Format, type PilierId, type Plateforme, type SourceDeLUsine,
} from '../../../../shared/ia-contenu-pur';
import { PLANS_DES_RESEAUX, ENTREES_DES_PLANS } from '../../../../shared/ia-plans-des-reseaux';
import { FORMATS_PHOTO, TEMPS_DU_SCRIPT, avantDePublier, ecartDeDuree, remarquesDuScript, type SeancePhoto, type ScriptVideo } from '../../../../shared/ia-seance-pur';
import { ETAPES, PARCOURS, articleEnMarkdown, avantLaValidation, remarquesDeLArticle, type Article, type Parcours } from '../../../../shared/ia-journal-pur';
import { relisLesChamps } from '../../../../shared/ia-marque-pur';
import { jourEnClair } from '../../../../shared/ia-faits-pur';
import { etatDeLaFonction, type EtatDeLaFonction } from '../../../../shared/ia-centre';
import type { Personne } from '../../../../shared/ia-anonymise-pur';
import {
  changeLArticle, changeLaSeance, changeLeContenu, changeLeScript, creeLArticle, creeLaSeance, creeLeScript, ecrisLeScript, ecrisLesDeclinaisons,
  importeLesPlansPrepares, metAuCalendrier, noteLesResultats, nouveauContenu, passeLeContenu, prepareLaSeance, proposeLeCalendrier, redigeLArticle,
  refuseLeContenu, retireLArticle, retireLaSeance, retireLeContenu, retireLeScript, useArticles, useContenus, useScripts, useSeances, valideLaPiece, valideLePlan,
} from '../../../../shared/ia-atelier';
import './atelier.css';

/* ══ L'ATELIER DES CONTENUS — 11 octobre 2026 (phase 2) ══════════════════

   Cahier « Maison MND AI Operating System », phase 2, le contenu : les
   réseaux sociaux (calendrier, piliers, statuts), le Journal comme
   rédaction, la séance photo et sa liste des prises, le script vidéo,
   l'usine à contenus, et la direction artistique, ici un gardien de la
   marque qui relit chaque texte sans Claude. « Construis la phase suivante »
   (Yéman, 11 octobre 2026).

   RÉSERVÉ AUX FONDATEURS, comme le Centre de commande. Les agents
   proposent par la fonction `centre-de-commande` ; tout ce qu'ils rendent
   entre « à relire ». Meta n'est pas relié : « programmé » arrête la date,
   « publié » se coche après l'avoir fait. Rien ne part tout seul. */

type Onglet = 'calendrier' | 'seances' | 'videos' | 'journal' | 'usine' | 'piliers';

const dateDite = (iso?: string): string => (iso ? jourEnClair(iso.slice(0, 10)) : '');
const dateCourte = (iso?: string): string => dateDite(iso).replace(/^\S+ /, '');
const pl = (n: number, un: string, plusieurs: string) => `${n} ${n > 1 ? plusieurs : un}`;
const lundiDe = (iso: string): string => {
  const d = new Date(`${iso}T12:00:00Z`);
  const j = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - j);
  return d.toISOString().slice(0, 10);
};

function copie(texte: string, quoi: string): void {
  try {
    void navigator.clipboard.writeText(texte).then(() => toast(`${quoi} copié.`), () => toast('La copie est refusée par ce navigateur : sélectionnez le texte.'));
  } catch { toast('La copie est refusée par ce navigateur : sélectionnez le texte.'); }
}

function Remarques({ rs }: { rs: readonly Remarque[] }) {
  if (!rs.length) return <p className="at-marque at-marque--ok">Le gardien de la marque n’a rien à redire.</p>;
  return (
    <ul className="at-marque">
      {rs.map((r) => (
        <li key={`${r.regle}-${r.extrait}`} className={`at-marque__r at-marque__r--${r.gravite}`}>
          <b>{r.gravite === 'bloque' ? 'À corriger' : 'À juger'}</b> {r.dit} <small>« {r.extrait} »</small>
        </li>
      ))}
    </ul>
  );
}

function Statut({ s }: { s: StatutDeContenu }) {
  return <span className={`at-statut at-statut--${s}`}>{STATUT_DIT[s]}</span>;
}

function Champ({ label, children, large }: { label: string; children: ReactNode; large?: boolean }) {
  return <label className={`at-champ${large ? ' at-champ--large' : ''}`}><span>{label}</span>{children}</label>;
}

export default function AtelierDesContenus() {
  const staff = useStaff();
  const qui = staff ? { user_id: staff.user_id, name: staff.name ?? 'Fondateur', role: staff.role } : null;
  const today = todayISO();
  const [onglet, setOnglet] = useState<Onglet>('calendrier');
  const [etat, setEtat] = useState<EtatDeLaFonction | null>(null);
  useEffect(() => { let vivant = true; void etatDeLaFonction().then((e) => { if (vivant) setEtat(e); }); return () => { vivant = false; }; }, []);
  const pose = etat?.posee === true;
  const [clients] = useClients();
  const personnes: Personne[] = useMemo(() => clients.map((c) => {
    const [prenom, ...reste] = (c.name ?? '').trim().split(/\s+/);
    return { prenom, nom: reste.join(' ') };
  }), [clients]);
  const [contenus] = useContenus();
  const [seances] = useSeances();
  const [scripts] = useScripts();
  const [articles] = useArticles();
  const [source, setSource] = useState<string>('');

  if (staff && staff.role !== 'souverain') {
    return (
      <div className="mnd-rise">
        <PageHead eyebrow="Marketing & Fidélité" title="L’atelier des contenus" />
        <p className="at-vide">L’atelier des contenus est réservé à Yéman et Brice.</p>
      </div>
    );
  }

  const aRelire = contenus.filter((c) => c.statut === 'a-relire').length;
  return (
    <div className="mnd-rise at">
      <PageHead eyebrow="Marketing & Fidélité" title="L’atelier des contenus" sub="Les agents proposent, la marque relit, Yéman et Brice valident." />
      <div className={`at-etat${pose ? ' at-etat--pose' : ''}`} role="status">
        {etat === null ? 'On interroge les agents…'
          : pose ? <>Les agents répondent (version {etat.version}). Ce qu’ils proposent entre « à relire ».</>
            : <>Les agents ne sont pas encore posés : l’atelier marche à la main, et le gardien de la marque relit déjà tout. Pour les poser, le dossier du bureau « A recoller - centre de commande ».</>}
      </div>
      <Segs<Onglet>
        value={onglet}
        onChange={setOnglet}
        options={[
          { value: 'calendrier', label: aRelire ? `Calendrier (${aRelire} à relire)` : 'Calendrier' },
          { value: 'seances', label: 'Séances photo' },
          { value: 'videos', label: 'Vidéos' },
          { value: 'journal', label: 'Journal' },
          { value: 'usine', label: 'Usine' },
          { value: 'piliers', label: 'Piliers' },
        ]}
      />
      {onglet === 'calendrier' && <LeCalendrier contenus={contenus} qui={qui} today={today} pose={pose} personnes={personnes} />}
      {onglet === 'seances' && <LesSeances seances={seances} qui={qui} today={today} pose={pose} personnes={personnes} decline={(id) => { setSource(`seance:${id}`); setOnglet('usine'); }} />}
      {onglet === 'videos' && <LesVideos scripts={scripts} qui={qui} pose={pose} personnes={personnes} decline={(id) => { setSource(`video:${id}`); setOnglet('usine'); }} />}
      {onglet === 'journal' && <LeJournal articles={articles} qui={qui} today={today} pose={pose} personnes={personnes} decline={(id) => { setSource(`article:${id}`); setOnglet('usine'); }} />}
      {onglet === 'usine' && <LUsine source={source} setSource={setSource} seances={seances} scripts={scripts} articles={articles} contenus={contenus} qui={qui} today={today} pose={pose} personnes={personnes} />}
      {onglet === 'piliers' && <LesPiliers contenus={contenus} today={today} />}
    </div>
  );
}

type Qui = { user_id: string; name: string; role: string } | null;

/* ── LE CALENDRIER ─────────────────────────────────────────────────────── */
function LeCalendrier({ contenus, qui, today, pose, personnes }: { contenus: Contenu[]; qui: Qui; today: string; pose: boolean; personnes: Personne[] }) {
  const [vue, setVue] = useState<'avenir' | 'passees' | 'tout'>('avenir');
  const [reseau, setReseau] = useState<'tous' | Plateforme>('tous');
  const [ouvert, setOuvert] = useState<string | null>(null);
  const [neuf, setNeuf] = useState({ date: addDaysISO(today, 1), sujet: '', format: 'post' as Format, plateforme: 'instagram' as Plateforme });
  const [agent, setAgent] = useState({ du: today, au: addDaysISO(today, 13), objectif: '', reseaux: ['instagram', 'facebook'] as Plateforme[] });
  const [attente, setAttente] = useState(false);

  const importables = ENTREES_DES_PLANS.filter((e) => !contenus.some((c) => c.id === `plan-${e.id}`)).length;
  const parPlan = PLANS_DES_RESEAUX.map((p) => ({ ...p, aRelire: contenus.filter((c) => c.plan === p.id && c.statut === 'a-relire').length })).filter((p) => p.aRelire > 0);
  /* Tout ce qui est daté d'avant aujourd'hui et n'est pas marqué publié : les
     plans importés commencent parfois avant le jour de l'import. */
  const enSouffrance = (c: Contenu) => c.date < today && ['brouillon', 'a-relire', 'valide', 'programme'].includes(c.statut);
  const passeesAConfirmer = contenus.filter(enSouffrance);
  const visibles = contenus
    .filter((c) => reseau === 'tous' || c.plateformes.includes(reseau))
    .filter((c) => (vue === 'tout' ? true : vue === 'passees' ? enSouffrance(c) : c.date >= today && c.date <= addDaysISO(today, 41)))
    .sort((a, b) => a.date.localeCompare(b.date) || (a.heure ?? '').localeCompare(b.heure ?? ''));
  const semaines = useMemo(() => {
    const m = new Map<string, Contenu[]>();
    for (const c of visibles) { const k = lundiDe(c.date); m.set(k, [...(m.get(k) ?? []), c]); }
    return [...m.entries()];
  }, [visibles]);

  const propose = async () => {
    setAttente(true);
    try { const n = await proposeLeCalendrier({ du: agent.du, au: agent.au, plateformes: agent.reseaux, objectif: agent.objectif }, personnes, qui); toast(`${pl(n, 'publication proposée', 'publications proposées')}, à relire.`); }
    catch (e) { toast(e instanceof Error ? e.message : String(e), 7000); } finally { setAttente(false); }
  };

  return (
    <section className="at-section">
      <div className="at-outils">
        {importables > 0 && (
          <div className="at-encart">
            <p><b>{pl(importables, 'publication déjà préparée', 'publications déjà préparées')}</b> dans vos plans : trente jours de réseaux, Instagram des mois deux et trois, LinkedIn sur deux mois. Elles entrent « à relire », sans rien réputer publié.</p>
            <Button size="sm" onClick={() => toast(`${pl(importeLesPlansPrepares(qui), 'publication importée', 'publications importées')}.`)}>Importer les plans</Button>
          </div>
        )}
        {parPlan.map((p) => (
          <div key={p.id} className="at-encart">
            <p>« {p.nom} » : {pl(p.aRelire, 'publication attend', 'publications attendent')} votre relecture.</p>
            <Button size="sm" variant="ghost" onClick={() => { const r = valideLePlan(p.id, qui); toast(r.valides || r.bloquees ? `${pl(r.valides, 'publication validée', 'publications validées')}${r.bloquees ? `, ${r.bloquees} à corriger d’abord` : ''}.` : 'Seuls Yéman et Brice valident.'); }}>Valider tout le plan</Button>
          </div>
        ))}
        {passeesAConfirmer.length > 0 && vue !== 'passees' && (
          <div className="at-encart at-encart--cuivre">
            <p>{pl(passeesAConfirmer.length, 'publication datée d’avant aujourd’hui n’est pas marquée publiée', 'publications datées d’avant aujourd’hui ne sont pas marquées publiées')} : publiées, à décaler, ou à retirer.</p>
            <Button size="sm" variant="ghost" onClick={() => setVue('passees')}>Les voir</Button>
          </div>
        )}
      </div>

      <div className="at-filtres">
        <Select value={vue} onChange={(e) => setVue(e.target.value as typeof vue)} aria-label="Période">
          <option value="avenir">Les six semaines qui viennent</option>
          <option value="passees">Passées, à confirmer</option>
          <option value="tout">Tout le calendrier</option>
        </Select>
        <Select value={reseau} onChange={(e) => setReseau(e.target.value as typeof reseau)} aria-label="Réseau">
          <option value="tous">Tous les réseaux</option>
          {(Object.keys(PLATEFORMES) as Plateforme[]).map((p) => <option key={p} value={p}>{PLATEFORMES[p]}</option>)}
        </Select>
      </div>

      <details className="at-ajout">
        <summary>Ajouter une publication</summary>
        <div className="at-grille">
          <Champ label="Date"><Input type="date" value={neuf.date} onChange={(e) => setNeuf({ ...neuf, date: e.target.value })} /></Champ>
          <Champ label="Réseau"><Select value={neuf.plateforme} onChange={(e) => setNeuf({ ...neuf, plateforme: e.target.value as Plateforme })}>{(Object.keys(PLATEFORMES) as Plateforme[]).map((p) => <option key={p} value={p}>{PLATEFORMES[p]}</option>)}</Select></Champ>
          <Champ label="Format"><Select value={neuf.format} onChange={(e) => setNeuf({ ...neuf, format: e.target.value as Format })}>{(Object.keys(FORMATS) as Format[]).map((f) => <option key={f} value={f}>{FORMATS[f]}</option>)}</Select></Champ>
          <Champ label="Sujet" large><Input value={neuf.sujet} onChange={(e) => setNeuf({ ...neuf, sujet: e.target.value })} placeholder="Ce que dit la publication" /></Champ>
        </div>
        <Button size="sm" disabled={!neuf.sujet.trim()} onClick={() => { const c = nouveauContenu({ date: neuf.date, sujet: neuf.sujet.trim(), format: neuf.format, plateformes: [neuf.plateforme] }, qui); setNeuf({ ...neuf, sujet: '' }); setOuvert(c.id); }}>Ajouter au calendrier</Button>
      </details>

      {pose && (
        <details className="at-ajout">
          <summary>Proposer avec l’agent des réseaux</summary>
          <div className="at-grille">
            <Champ label="Du"><Input type="date" value={agent.du} onChange={(e) => setAgent({ ...agent, du: e.target.value })} /></Champ>
            <Champ label="Au"><Input type="date" value={agent.au} onChange={(e) => setAgent({ ...agent, au: e.target.value })} /></Champ>
            <Champ label="Objectif" large><Input value={agent.objectif} onChange={(e) => setAgent({ ...agent, objectif: e.target.value })} placeholder="Par exemple : faire réserver les soins avant décembre" /></Champ>
          </div>
          <div className="at-cases">
            {(['instagram', 'facebook', 'tiktok', 'linkedin'] as Plateforme[]).map((p) => (
              <label key={p}><input type="checkbox" checked={agent.reseaux.includes(p)} onChange={(e) => setAgent({ ...agent, reseaux: e.target.checked ? [...agent.reseaux, p] : agent.reseaux.filter((x) => x !== p) })} /> {PLATEFORMES[p]}</label>
            ))}
          </div>
          <Button size="sm" variant="copper" disabled={attente || !agent.reseaux.length} onClick={() => void propose()}>{attente ? 'L’agent écrit…' : 'Proposer'}</Button>
        </details>
      )}

      {semaines.length === 0 && <p className="at-vide">{contenus.length ? 'Rien dans cette vue.' : 'Le calendrier est vide : importez vos plans, ajoutez une publication, ou demandez à l’agent.'}</p>}
      {semaines.map(([lundi, cs]) => (
        <div key={lundi} className="at-semaine">
          <p className="at-semaine__titre">Semaine du {dateCourte(lundi)}</p>
          {cs.map((c) => <LaPublication key={c.id} c={c} ouvert={ouvert === c.id} bascule={() => setOuvert((o) => (o === c.id ? null : c.id))} qui={qui} today={today} />)}
        </div>
      ))}
    </section>
  );
}

function LaPublication({ c, ouvert, bascule, qui, today }: { c: Contenu; ouvert: boolean; bascule: () => void; qui: Qui; today: string }) {
  const rs = remarquesDuContenu(c);
  const [mot, setMot] = useState('');
  const [lien, setLien] = useState(c.lien ?? '');
  const passe = (vers: StatutDeContenu, extra: Partial<Contenu> = {}) => { const r = passeLeContenu(c.id, vers, qui, extra); if (!r.ok) toast(r.pourquoi ?? 'Refusé.', 7000); };
  return (
    <div className={`at-pub${ouvert ? ' is-ouverte' : ''}${bloquant(rs) ? ' at-pub--bloque' : ''}`}>
      <button type="button" className="at-pub__ligne" aria-expanded={ouvert} onClick={bascule}>
        <span className="at-pub__date">{dateDite(c.date).replace(/ \d{4}$/, '')}{c.heure ? ` · ${c.heure}` : ''}</span>
        <span className="at-pub__sujet"><b>{c.sujet}</b><small>{c.plateformes.map((p) => PLATEFORMES[p]).join(', ')} · {FORMATS[c.format]}{c.serie ? ` · ${c.serie}` : ''}{rs.length ? ` · ${pl(rs.length, 'remarque', 'remarques')}` : ''}</small></span>
        <Statut s={c.statut} />
      </button>
      {ouvert && (
        <div className="at-pub__corps">
          {c.date < today && c.statut !== 'publie' && c.statut !== 'analyse' && c.statut !== 'optimise' && <p className="at-alerte">La date est passée : publiée ? Menez-la jusqu’à « publiée », ou changez la date.</p>}
          <div className="at-grille">
            <Champ label="Date"><Input type="date" value={c.date} onChange={(e) => changeLeContenu(c.id, { date: e.target.value }, qui)} /></Champ>
            <Champ label="Heure"><Input type="time" value={c.heure ?? ''} onChange={(e) => changeLeContenu(c.id, { heure: e.target.value }, qui)} /></Champ>
            <Champ label="Pilier"><Select value={c.pilier ?? ''} onChange={(e) => changeLeContenu(c.id, { pilier: e.target.value as PilierId | '' }, qui)}><option value="">À ranger</option>{PILIERS.map((p) => <option key={p.id} value={p.id}>{p.nom}</option>)}</Select></Champ>
            <Champ label="Format"><Select value={c.format} onChange={(e) => changeLeContenu(c.id, { format: e.target.value as Format }, qui)}>{(Object.keys(FORMATS) as Format[]).map((f) => <option key={f} value={f}>{FORMATS[f]}</option>)}</Select></Champ>
            <Champ label="Sujet" large><Input value={c.sujet} onChange={(e) => changeLeContenu(c.id, { sujet: e.target.value }, qui)} /></Champ>
            <Champ label="Objectif" large><Input value={c.objectif ?? ''} onChange={(e) => changeLeContenu(c.id, { objectif: e.target.value }, qui)} /></Champ>
            <Champ label="Accroche (la première ligne)" large><Input value={c.accroche ?? ''} onChange={(e) => changeLeContenu(c.id, { accroche: e.target.value }, qui)} /></Champ>
            <Champ label="Légende" large><Textarea rows={6} value={c.legende ?? ''} onChange={(e) => changeLeContenu(c.id, { legende: e.target.value }, qui)} /></Champ>
            <Champ label="Appel" large><Input value={c.appel ?? ''} onChange={(e) => changeLeContenu(c.id, { appel: e.target.value }, qui)} /></Champ>
            <Champ label="Visuel" large><Textarea rows={2} value={c.visuel ?? ''} onChange={(e) => changeLeContenu(c.id, { visuel: e.target.value }, qui)} /></Champ>
          </div>
          <div className="at-cases">
            {(Object.keys(PLATEFORMES) as Plateforme[]).filter((p) => p !== 'journal').map((p) => (
              <label key={p}><input type="checkbox" checked={c.plateformes.includes(p)} onChange={(e) => changeLeContenu(c.id, { plateformes: e.target.checked ? [...c.plateformes, p] : c.plateformes.filter((x) => x !== p) }, qui)} /> {PLATEFORMES[p]}</label>
            ))}
          </div>
          {(c.description || c.note) && <p className="at-note">{[c.description, c.note].filter(Boolean).join(' ')}</p>}
          <Remarques rs={rs} />
          {c.validation && <p className="at-note">{c.validation.verdict === 'oui' ? 'Validée' : 'Refusée'} par {c.validation.nom}, {dateCourte(c.validation.le)}{c.validation.mot ? ` : ${c.validation.mot}` : ''}.</p>}

          {(c.statut === 'publie' || c.statut === 'analyse' || c.statut === 'optimise') && (
            <div className="at-resultats">
              <p className="at-label">Les résultats, relevés à la main sur le réseau</p>
              <div className="at-grille at-grille--chiffres">
                {CHAMPS_DE_RESULTAT.map((k) => (
                  <Champ key={k} label={RESULTAT_DIT[k]}><Input type="number" min={0} value={c.resultats?.[k] ?? ''} onChange={(e) => noteLesResultats(c.id, { [k]: e.target.value === '' ? undefined : Number(e.target.value) }, qui)} /></Champ>
                ))}
              </div>
              {(c.statut === 'analyse' || c.statut === 'optimise') && <Champ label="Ce qu’on en retient" large><Textarea rows={2} value={c.retenu ?? ''} onChange={(e) => changeLeContenu(c.id, { retenu: e.target.value }, qui)} /></Champ>}
            </div>
          )}

          <div className="at-actions">
            {c.legende && <Button size="sm" variant="ghost" onClick={() => copie([c.accroche && !(c.legende ?? '').startsWith(c.accroche) ? c.accroche : '', c.legende ?? ''].filter(Boolean).join('\n'), 'La légende')}>Copier la légende</Button>}
            {c.statut === 'brouillon' && <Button size="sm" onClick={() => passe('a-relire')}>Envoyer à la relecture</Button>}
            {c.statut === 'a-relire' && <>
              <Input placeholder="Un mot (facultatif)" value={mot} onChange={(e) => setMot(e.target.value)} aria-label="Un mot avec la décision" />
              <Button size="sm" disabled={bloquant(rs)} onClick={() => passe('valide')}>Valider</Button>
              <Button size="sm" variant="ghost" onClick={() => { const r = refuseLeContenu(c.id, qui, mot); if (!r.ok) toast(r.pourquoi ?? ''); }}>Refuser</Button>
            </>}
            {c.statut === 'valide' && <Button size="sm" onClick={() => passe('programme')}>Programmer au {dateCourte(c.date)}{c.heure ? ` à ${c.heure}` : ''}</Button>}
            {c.statut === 'programme' && <>
              <Input placeholder="Le lien de la publication" value={lien} onChange={(e) => setLien(e.target.value)} aria-label="Lien de la publication" />
              <Button size="sm" onClick={() => passe('publie', { lien: lien.trim() || undefined })}>Marquer publiée</Button>
            </>}
            {c.statut === 'publie' && <Button size="sm" onClick={() => passe('analyse')}>Analysée</Button>}
            {c.statut === 'analyse' && <Button size="sm" onClick={() => passe('optimise')}>Optimisée</Button>}
            {(c.statut === 'valide' || c.statut === 'programme') && <Button size="sm" variant="ghost" onClick={() => passe(c.statut === 'programme' ? 'valide' : 'brouillon')}>Revenir en arrière</Button>}
            <Button size="sm" variant="ghost" onClick={() => retireLeContenu(c.id, qui)}>Retirer</Button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── LES SÉANCES PHOTO ─────────────────────────────────────────────────── */
function LesSeances({ seances, qui, today, pose, personnes, decline }: { seances: SeancePhoto[]; qui: Qui; today: string; pose: boolean; personnes: Personne[]; decline: (id: string) => void }) {
  const [neuf, setNeuf] = useState({ titre: '', date: addDaysISO(today, 7) });
  const [ouvert, setOuvert] = useState<string | null>(seances[0]?.id ?? null);
  const [attente, setAttente] = useState<string | null>(null);
  const prepare = async (s: SeancePhoto) => {
    setAttente(s.id);
    try { await prepareLaSeance(s, personnes, qui); toast('Le brief est prêt : relisez-le.'); } catch (e) { toast(e instanceof Error ? e.message : String(e), 7000); } finally { setAttente(null); }
  };
  return (
    <section className="at-section">
      <div className="at-grille">
        <Champ label="Nouvelle séance" large><Input value={neuf.titre} onChange={(e) => setNeuf({ ...neuf, titre: e.target.value })} placeholder="Par exemple : la couronne de Noël" /></Champ>
        <Champ label="Date"><Input type="date" value={neuf.date} onChange={(e) => setNeuf({ ...neuf, date: e.target.value })} /></Champ>
      </div>
      <Button size="sm" disabled={!neuf.titre.trim()} onClick={() => { const s = creeLaSeance(neuf.titre, neuf.date, qui); setNeuf({ ...neuf, titre: '' }); setOuvert(s.id); }}>Créer la séance</Button>
      <p className="at-note">Chaque séance naît avec les dix prises du cahier. Formats : {FORMATS_PHOTO.map((f) => `${f.nom}, ${f.dit}`).join(' ; ')}.</p>
      {seances.length === 0 && <p className="at-vide">Aucune séance préparée.</p>}
      {seances.map((s) => {
        const manque = avantDePublier(s);
        const faites = s.prises.filter((p) => p.faite).length;
        const champ = (k: keyof SeancePhoto, label: string, rows = 2) => (
          <Champ key={k} label={label} large><Textarea rows={rows} value={String(s[k] ?? '')} onChange={(e) => changeLaSeance(s.id, { [k]: e.target.value } as Partial<SeancePhoto>)} /></Champ>
        );
        return (
          <div key={s.id} className={`at-pub${ouvert === s.id ? ' is-ouverte' : ''}`}>
            <button type="button" className="at-pub__ligne" aria-expanded={ouvert === s.id} onClick={() => setOuvert((o) => (o === s.id ? null : s.id))}>
              <span className="at-pub__date">{dateDite(s.date).replace(/ \d{4}$/, '')}</span>
              <span className="at-pub__sujet"><b>{s.titre}</b><small>{faites} sur {s.prises.length} prises · accord {s.accord === 'inscrit' ? 'inscrit au registre' : s.accord === 'signe' ? 'signé, à inscrire' : 'à obtenir'}</small></span>
              <Statut s={s.statut} />
            </button>
            {ouvert === s.id && (
              <div className="at-pub__corps">
                <div className="at-grille">
                  <Champ label="Modèle (prénom et initiale)"><Input value={s.modele} onChange={(e) => changeLaSeance(s.id, { modele: e.target.value })} /></Champ>
                  <Champ label="Accord"><Select value={s.accord} onChange={(e) => changeLaSeance(s.id, { accord: e.target.value as SeancePhoto['accord'] })}><option value="a-obtenir">À obtenir</option><option value="signe">Signé, à inscrire</option><option value="inscrit">Inscrit au registre</option></Select></Champ>
                  <label className="at-champ"><span>Un enfant</span><input type="checkbox" checked={s.enfant} onChange={(e) => changeLaSeance(s.id, { enfant: e.target.checked })} /></label>
                  <Champ label="Campagne"><Input value={s.campagne} onChange={(e) => changeLaSeance(s.id, { campagne: e.target.value })} /></Champ>
                  {champ('objectif', 'Objectif')}{champ('concept', 'Concept')}{champ('histoire', 'Histoire')}{champ('coiffure', 'Coiffure')}
                  {champ('tenue', 'Tenue')}{champ('accessoires', 'Accessoires')}{champ('decor', 'Décor')}{champ('lumiere', 'Lumière')}
                  {champ('cadrage', 'Cadrage')}{champ('poses', 'Poses')}{champ('expressions', 'Expressions')}{champ('details', 'Détails à photographier')}
                </div>
                {manque.length > 0 && <ul className="at-marque">{manque.map((m) => <li key={m} className="at-marque__r at-marque__r--attention"><b>Avant de publier</b> {m}</li>)}</ul>}
                <Remarques rs={relisLesChamps([s.decor, s.lumiere, s.concept, s.tenue].map((t) => ({ texte: t, visuel: true })))} />
                <p className="at-label">La liste des prises</p>
                <ol className="at-prises">
                  {s.prises.map((p, i) => (
                    <li key={p.num}>
                      <label><input type="checkbox" checked={p.faite} onChange={(e) => changeLaSeance(s.id, { prises: s.prises.map((x, j) => (j === i ? { ...x, faite: e.target.checked } : x)) })} /> <b>Prise {String(p.num).padStart(2, '0')} · {p.nom}</b></label>
                      <span>{p.consigne} <small>{p.format}</small></span>
                    </li>
                  ))}
                </ol>
                <div className="at-actions">
                  {pose && <Button size="sm" variant="copper" disabled={attente !== null} onClick={() => void prepare(s)}>{attente === s.id ? 'L’agent prépare…' : 'Préparer avec l’agent photo'}</Button>}
                  {s.statut === 'brouillon' && <Button size="sm" onClick={() => changeLaSeance(s.id, { statut: 'a-relire' })}>Envoyer à la relecture</Button>}
                  {s.statut === 'a-relire' && <><Button size="sm" onClick={() => { const r = valideLaPiece('seance', s.id, qui, 'oui'); if (!r.ok) toast(r.pourquoi ?? ''); }}>Valider le brief</Button><Button size="sm" variant="ghost" onClick={() => valideLaPiece('seance', s.id, qui, 'non')}>Refuser</Button></>}
                  <Button size="sm" variant="ghost" onClick={() => decline(s.id)}>Décliner en contenus</Button>
                  <Button size="sm" variant="ghost" onClick={() => retireLaSeance(s.id)}>Retirer</Button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </section>
  );
}

/* ── LES VIDÉOS ────────────────────────────────────────────────────────── */
function LesVideos({ scripts, qui, pose, personnes, decline }: { scripts: ScriptVideo[]; qui: Qui; pose: boolean; personnes: Personne[]; decline: (id: string) => void }) {
  const [titre, setTitre] = useState('');
  const [ouvert, setOuvert] = useState<string | null>(scripts[0]?.id ?? null);
  const [attente, setAttente] = useState<string | null>(null);
  const ecris = async (s: ScriptVideo) => {
    setAttente(s.id);
    try { await ecrisLeScript(s, personnes, qui); toast('Le script est écrit : relisez-le.'); } catch (e) { toast(e instanceof Error ? e.message : String(e), 7000); } finally { setAttente(null); }
  };
  return (
    <section className="at-section">
      <div className="at-grille">
        <Champ label="Nouvelle vidéo" large><Input value={titre} onChange={(e) => setTitre(e.target.value)} placeholder="Par exemple : le DÀNDÀN™, en trente secondes" /></Champ>
      </div>
      <Button size="sm" disabled={!titre.trim()} onClick={() => { const s = creeLeScript(titre, qui); setTitre(''); setOuvert(s.id); }}>Créer le script</Button>
      {scripts.length === 0 && <p className="at-vide">Aucun script.</p>}
      {scripts.map((s) => {
        const ecart = ecartDeDuree(s);
        const rs = remarquesDuScript(s);
        return (
          <div key={s.id} className={`at-pub${ouvert === s.id ? ' is-ouverte' : ''}`}>
            <button type="button" className="at-pub__ligne" aria-expanded={ouvert === s.id} onClick={() => setOuvert((o) => (o === s.id ? null : s.id))}>
              <span className="at-pub__date">{s.duree} s</span>
              <span className="at-pub__sujet"><b>{s.titre}</b><small>{PLATEFORMES[s.plateforme]} · {pl(s.plans.length, 'plan', 'plans')}{ecart ? ` · ${ecart > 0 ? '+' : ''}${ecart} s sur la durée` : ''}</small></span>
              <Statut s={s.statut} />
            </button>
            {ouvert === s.id && (
              <div className="at-pub__corps">
                <div className="at-grille">
                  <Champ label="Réseau"><Select value={s.plateforme} onChange={(e) => changeLeScript(s.id, { plateforme: e.target.value as ScriptVideo['plateforme'] })}>{(['instagram', 'tiktok', 'youtube', 'facebook'] as const).map((p) => <option key={p} value={p}>{PLATEFORMES[p]}</option>)}</Select></Champ>
                  <Champ label="Durée (secondes)"><Input type="number" min={5} max={600} value={s.duree} onChange={(e) => changeLeScript(s.id, { duree: Number(e.target.value) || 30 })} /></Champ>
                  {TEMPS_DU_SCRIPT.map((t) => (
                    <Champ key={t.cle} label={`${t.nom} · ${t.dit}`} large><Textarea rows={2} value={s[t.cle]} onChange={(e) => changeLeScript(s.id, { [t.cle]: e.target.value } as Partial<ScriptVideo>)} /></Champ>
                  ))}
                </div>
                <p className="at-label">Les plans</p>
                <div className="at-plans">
                  {s.plans.map((p, i) => (
                    <div key={p.num} className="at-plan">
                      <b>{String(p.num).padStart(2, '0')}</b>
                      <Input placeholder="L’image" value={p.image} onChange={(e) => changeLeScript(s.id, { plans: s.plans.map((x, j) => (j === i ? { ...x, image: e.target.value } : x)) })} aria-label={`Image du plan ${p.num}`} />
                      <Input placeholder="Texte à l’écran" value={p.texteEcran} onChange={(e) => changeLeScript(s.id, { plans: s.plans.map((x, j) => (j === i ? { ...x, texteEcran: e.target.value } : x)) })} aria-label={`Texte du plan ${p.num}`} />
                      <Input type="number" min={1} max={60} value={p.duree} onChange={(e) => changeLeScript(s.id, { plans: s.plans.map((x, j) => (j === i ? { ...x, duree: Number(e.target.value) || 1 } : x)) })} aria-label={`Durée du plan ${p.num}`} />
                    </div>
                  ))}
                  <Button size="sm" variant="ghost" onClick={() => changeLeScript(s.id, { plans: [...s.plans, { num: s.plans.length + 1, image: '', texteEcran: '', duree: 5 }] })}>Ajouter un plan</Button>
                </div>
                {ecart !== 0 && <p className="at-alerte">Les plans font {s.duree + ecart} s pour {s.duree} s annoncées.</p>}
                <div className="at-grille">
                  <Champ label="Transitions" large><Input value={s.transitions} onChange={(e) => changeLeScript(s.id, { transitions: e.target.value })} /></Champ>
                  <Champ label="Musique (une ambiance)" large><Input value={s.musique} onChange={(e) => changeLeScript(s.id, { musique: e.target.value })} /></Champ>
                  <Champ label="Miniature" large><Input value={s.miniature} onChange={(e) => changeLeScript(s.id, { miniature: e.target.value })} /></Champ>
                  <Champ label="Légende" large><Textarea rows={3} value={s.legende} onChange={(e) => changeLeScript(s.id, { legende: e.target.value })} /></Champ>
                </div>
                <Remarques rs={rs} />
                <div className="at-actions">
                  {pose && <Button size="sm" variant="copper" disabled={attente !== null} onClick={() => void ecris(s)}>{attente === s.id ? 'L’agent écrit…' : 'Écrire avec l’agent vidéo'}</Button>}
                  {s.statut === 'brouillon' && <Button size="sm" onClick={() => changeLeScript(s.id, { statut: 'a-relire' })}>Envoyer à la relecture</Button>}
                  {s.statut === 'a-relire' && <><Button size="sm" disabled={bloquant(rs)} onClick={() => { const r = valideLaPiece('script', s.id, qui, 'oui'); if (!r.ok) toast(r.pourquoi ?? ''); }}>Valider le script</Button><Button size="sm" variant="ghost" onClick={() => valideLaPiece('script', s.id, qui, 'non')}>Refuser</Button></>}
                  <Button size="sm" variant="ghost" onClick={() => decline(s.id)}>Décliner en contenus</Button>
                  <Button size="sm" variant="ghost" onClick={() => retireLeScript(s.id)}>Retirer</Button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </section>
  );
}

/* ── LE JOURNAL ────────────────────────────────────────────────────────── */
function LeJournal({ articles, qui, today, pose, personnes, decline }: { articles: Article[]; qui: Qui; today: string; pose: boolean; personnes: Personne[]; decline: (id: string) => void }) {
  const [titre, setTitre] = useState('');
  const [ouvert, setOuvert] = useState<string | null>(articles[0]?.id ?? null);
  const [attente, setAttente] = useState<string | null>(null);
  const [fait, setFait] = useState('');
  const redige = async (a: Article) => {
    setAttente(a.id);
    try { await redigeLArticle(a, personnes, qui); toast('L’article est rédigé : vérifiez les faits, puis relisez.'); } catch (e) { toast(e instanceof Error ? e.message : String(e), 7000); } finally { setAttente(null); }
  };
  return (
    <section className="at-section">
      <div className="at-grille">
        <Champ label="Une idée d’article (en question, comme le Journal)" large><Input value={titre} onChange={(e) => setTitre(e.target.value)} placeholder="Par exemple : comment protéger ses locks la nuit ?" /></Champ>
      </div>
      <Button size="sm" disabled={!titre.trim()} onClick={() => { const a = creeLArticle(titre, qui); setTitre(''); setOuvert(a.id); }}>Ouvrir l’article</Button>
      <p className="at-note">La rédaction : {ETAPES.map((e) => e.nom).join(', ')}. Un article validé se copie dans la forme exacte du site ; il paraît à la prochaine publication du site.</p>
      {articles.length === 0 && <p className="at-vide">Aucun article en préparation.</p>}
      {articles.map((a) => {
        const i = ETAPES.findIndex((e) => e.id === a.etape);
        const manque = avantLaValidation(a);
        const rs = remarquesDeLArticle(a);
        return (
          <div key={a.id} className={`at-pub${ouvert === a.id ? ' is-ouverte' : ''}`}>
            <button type="button" className="at-pub__ligne" aria-expanded={ouvert === a.id} onClick={() => setOuvert((o) => (o === a.id ? null : a.id))}>
              <span className="at-pub__date">{ETAPES[i]?.nom}</span>
              <span className="at-pub__sujet"><b>{a.titre}</b><small>{PARCOURS[a.parcours].nom} · {a.corps.trim() ? `${a.corps.trim().split(/\s+/).length} mots` : 'pas encore écrit'}{a.validation?.verdict === 'oui' ? ` · validé par ${a.validation.nom}` : ''}</small></span>
              <span className="at-etapes" aria-hidden="true">{ETAPES.map((e, j) => <i key={e.id} className={j <= i ? 'fait' : ''} />)}</span>
            </button>
            {ouvert === a.id && (
              <div className="at-pub__corps">
                <div className="at-grille">
                  <Champ label="Titre" large><Input value={a.titre} onChange={(e) => changeLArticle(a.id, { titre: e.target.value })} /></Champ>
                  <Champ label="Parcours"><Select value={a.parcours} onChange={(e) => changeLArticle(a.id, { parcours: e.target.value as Parcours })}>{(Object.keys(PARCOURS) as Parcours[]).map((p) => <option key={p} value={p}>{PARCOURS[p].nom}</option>)}</Select></Champ>
                  <Champ label="Adresse"><Input value={a.slug} onChange={(e) => changeLArticle(a.id, { slug: e.target.value })} /></Champ>
                  <Champ label="Description pour Google" large><Textarea rows={2} value={a.description} onChange={(e) => changeLArticle(a.id, { description: e.target.value })} /></Champ>
                  <Champ label="Mots-clés (séparés par des virgules)" large><Input value={a.motsCles.join(', ')} onChange={(e) => changeLArticle(a.id, { motsCles: e.target.value.split(',').map((m) => m.trim()).filter(Boolean) })} /></Champ>
                  <Champ label="Image (fichier du registre)"><Input value={a.image} onChange={(e) => changeLArticle(a.id, { image: e.target.value })} placeholder="journal-4.jpg" /></Champ>
                  <Champ label="Portrait (facultatif)"><Input value={a.portrait} onChange={(e) => changeLArticle(a.id, { portrait: e.target.value })} placeholder="cliente-10.jpg" /></Champ>
                  <Champ label="Angle" large><Textarea rows={2} value={a.angle} onChange={(e) => changeLArticle(a.id, { angle: e.target.value })} /></Champ>
                  <Champ label="Plan (une partie par ligne)" large><Textarea rows={4} value={a.plan.join('\n')} onChange={(e) => changeLArticle(a.id, { plan: e.target.value.split('\n') })} /></Champ>
                  <Champ label="Le texte (« ## » pour une partie)" large><Textarea rows={16} value={a.corps} onChange={(e) => changeLArticle(a.id, { corps: e.target.value })} /></Champ>
                </div>
                <p className="at-label">Les faits à vérifier</p>
                <ul className="at-faits">
                  {a.aVerifier.map((f, j) => (
                    <li key={`${f.fait}-${j}`}><label><input type="checkbox" checked={f.verifie} onChange={(e) => changeLArticle(a.id, { aVerifier: a.aVerifier.map((x, k) => (k === j ? { ...x, verifie: e.target.checked } : x)) })} /> {f.fait}</label></li>
                  ))}
                </ul>
                <div className="at-ligne">
                  <Input placeholder="Un fait à vérifier" value={fait} onChange={(e) => setFait(e.target.value)} aria-label="Un fait à vérifier" />
                  <Button size="sm" variant="ghost" disabled={!fait.trim()} onClick={() => { changeLArticle(a.id, { aVerifier: [...a.aVerifier, { fait: fait.trim(), verifie: false }] }); setFait(''); }}>Ajouter</Button>
                </div>
                {manque.length > 0 && <ul className="at-marque">{manque.map((m) => <li key={m} className="at-marque__r at-marque__r--attention"><b>Avant la validation</b> {m}</li>)}</ul>}
                <Remarques rs={rs} />
                <div className="at-actions">
                  {pose && <Button size="sm" variant="copper" disabled={attente !== null} onClick={() => void redige(a)}>{attente === a.id ? 'La rédaction écrit…' : 'Rédiger avec le Journal'}</Button>}
                  {i < ETAPES.findIndex((e) => e.id === 'validation') && <Button size="sm" onClick={() => changeLArticle(a.id, { etape: ETAPES[i + 1].id })}>Étape suivante : {ETAPES[i + 1].nom}</Button>}
                  {a.etape === 'validation' && <>
                    <Button size="sm" disabled={manque.length > 0 || bloquant(rs)} onClick={() => { const r = valideLaPiece('article', a.id, qui, 'oui'); if (!r.ok) toast(r.pourquoi ?? ''); }}>Valider l’article</Button>
                    <Button size="sm" variant="ghost" onClick={() => valideLaPiece('article', a.id, qui, 'non')}>Renvoyer à l’édition</Button>
                  </>}
                  {a.etape === 'publication' && a.validation?.verdict === 'oui' && <Button size="sm" variant="copper" onClick={() => copie(articleEnMarkdown(a, today), 'Le texte pour le site')}>Copier le texte pour le site</Button>}
                  <Button size="sm" variant="ghost" onClick={() => decline(a.id)}>Décliner en contenus</Button>
                  <Button size="sm" variant="ghost" onClick={() => retireLArticle(a.id)}>Retirer</Button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </section>
  );
}

/* ── L'USINE ───────────────────────────────────────────────────────────── */
function LUsine({ source, setSource, seances, scripts, articles, contenus, qui, today, pose, personnes }: {
  source: string; setSource: (s: string) => void; seances: SeancePhoto[]; scripts: ScriptVideo[]; articles: Article[]; contenus: Contenu[];
  qui: Qui; today: string; pose: boolean; personnes: Personne[];
}) {
  const sources: SourceDeLUsine[] = [
    ...seances.map((s) => ({ genre: 'seance' as const, titre: s.titre, date: s.date > today ? s.date : today, id: s.id })),
    ...scripts.map((s) => ({ genre: 'video' as const, titre: s.titre, date: today, id: s.id })),
    ...articles.map((a) => ({ genre: 'article' as const, titre: a.titre, date: today, id: a.id })),
    ...contenus.filter((c) => c.statut === 'valide' || c.statut === 'publie').map((c) => ({ genre: 'contenu' as const, titre: c.sujet, date: c.date > today ? c.date : today, id: c.id })),
  ];
  const choisie = sources.find((s) => `${s.genre}:${s.id}` === source);
  const decl = choisie ? declinaisonsDe(choisie) : [];
  const [coches, setCoches] = useState<number[]>([]);
  const [resume, setResume] = useState('');
  const [attente, setAttente] = useState(false);
  useEffect(() => { setCoches(decl.map((_, i) => i)); }, [source]); // eslint-disable-line react-hooks/exhaustive-deps
  const ecris = async () => {
    if (!choisie) return;
    setAttente(true);
    try { const n = await ecrisLesDeclinaisons(choisie, resume, coches, personnes, qui); toast(`${pl(n, 'déclinaison écrite', 'déclinaisons écrites')}, à relire au calendrier.`); } catch (e) { toast(e instanceof Error ? e.message : String(e), 7000); } finally { setAttente(false); }
  };
  return (
    <section className="at-section">
      <p className="at-note">Cahier : « comment maximiser la valeur d’un contenu unique ? ». Une source donne ses déclinaisons, au rythme de la Maison ; chacune entre au calendrier, à relire.</p>
      <Select value={source} onChange={(e) => setSource(e.target.value)} aria-label="La source">
        <option value="">Choisir une source</option>
        {sources.map((s) => <option key={`${s.genre}:${s.id}`} value={`${s.genre}:${s.id}`}>{s.genre === 'seance' ? 'Séance' : s.genre === 'video' ? 'Vidéo' : s.genre === 'article' ? 'Article' : 'Publication'} · {s.titre}</option>)}
      </Select>
      {!sources.length && <p className="at-vide">Créez une séance, une vidéo ou un article, ou validez une publication : l’usine part d’une source.</p>}
      {choisie && (
        <>
          <ul className="at-decl">
            {decl.map((d, i) => ({ d, i })).sort((x, y) => x.d.decalageJours - y.d.decalageJours).map(({ d, i }) => (
              <li key={`${d.format}-${i}`}>
                <label><input type="checkbox" checked={coches.includes(i)} onChange={(e) => setCoches(e.target.checked ? [...coches, i] : coches.filter((x) => x !== i))} /> <b>{FORMATS[d.format]}</b> · {d.plateformes.map((p) => PLATEFORMES[p]).join(', ')} · {PILIERS.find((p) => p.id === d.pilier)?.nom}</label>
                <span>{d.sujet} <small>le {dateCourte(addDaysISO(choisie.date, d.decalageJours))}</small></span>
              </li>
            ))}
          </ul>
          {pose && <Champ label="Ce que contient la source (pour l’agent)" large><Textarea rows={3} value={resume} onChange={(e) => setResume(e.target.value)} /></Champ>}
          <div className="at-actions">
            <Button size="sm" disabled={!coches.length} onClick={() => toast(`${pl(metAuCalendrier(choisie, coches, qui), 'brouillon mis', 'brouillons mis')} au calendrier.`)}>Mettre au calendrier en brouillons</Button>
            {pose && <Button size="sm" variant="copper" disabled={attente || !coches.length} onClick={() => void ecris()}>{attente === true ? 'L’usine écrit…' : 'Écrire avec l’usine'}</Button>}
          </div>
        </>
      )}
    </section>
  );
}

/* ── LES PILIERS ───────────────────────────────────────────────────────── */
function LesPiliers({ contenus, today }: { contenus: Contenu[]; today: string }) {
  const au = addDaysISO(today, 29);
  const eq = equilibreDesPiliers(contenus, today, au);
  const max = Math.max(1, ...Object.values(eq));
  return (
    <section className="at-section">
      <p className="at-note">Les dix piliers du cahier, et leur poids dans les trente prochains jours (du {dateCourte(today)} au {dateCourte(au)}).</p>
      <div className="at-piliers">
        {PILIERS.map((p) => (
          <div key={p.id} className="at-pilier">
            <div className="at-pilier__tete"><b>{p.nom}</b><Badge tone={eq[p.id] ? 'indigo' : undefined}>{eq[p.id]}</Badge></div>
            <div className="at-barre"><i style={{ width: `${(100 * eq[p.id]) / max}%` }} /></div>
            <p>{p.dit}</p>
            {p.garde && <small>{p.garde}</small>}
          </div>
        ))}
        <div className="at-pilier at-pilier--sans">
          <div className="at-pilier__tete"><b>À ranger</b><Badge>{eq.sans}</Badge></div>
          <p>Les publications sans pilier, à ranger pour lire l’équilibre.</p>
        </div>
      </div>
    </section>
  );
}
