import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { PageHead } from '../_ui';
import { Button, Input, Select, Textarea, toast } from '../../../../ds/components';
import { useBranch } from '../../../../shared/branches';
import { useStaff } from '../../../../shared/auth';
import { clientsStore, type Client } from '../../../../shared/clients';
import { usePlans, useSubscribers } from '../../../../shared/abonnements';
import { uid } from '../../../../shared/store';
import { useClassement } from '../../../../shared/classement';
import {
  CHAMPS, CRITERES_PROPOSES, ETAPES, LA_PRIVILEGIEE_DITE, LIEUX, MARQUES, RYTHMES,
  abonnementActif, carteDeLaVue, classeLaCliente, definitionDeLaVue, ficheDuClassement, jourDit, joursEntre, optionsDuChamp, villeADeduire,
  type CategorieDeLaMaison, type ChampDeCritere, type ChoixDuParcours, type CriteresDuClassement,
  type FicheDuClassement, type Libelle, type ResultatDuClassement,
} from '../../../../shared/classement-pur';
import { todayISO, useBranchAppointments, useBranchClients } from './_shared';
import './classement.css';

/* ══ LE CLASSEMENT DES CLIENTES — 20 novembre 2026 ═══════════════════════
   « Construis-moi Le classement des clientes dans le Trône » ; « rajoute les
   catégories avec leurs spécifications dans le Trône » (Yéman). La page
   « Le classement des clientes » (artifact 7dMsfEcG…) devient un onglet des
   Clientes : les critères se règlent ici (document `mnd_classement`), chaque
   cliente se range sur quatre axes (étape, lieu, rythme, marques), et son
   dossier se corrige sur place (`Client.parcours`). Le calcul : classement-pur.

   « AUTO-REMPLIS CE QUE TU SAIS » : à l'ouverture, une fiche sans ville et au
   numéro étranger reçoit le pays de son numéro, une seule fois
   (`villeDeduiteLe`) ; le dossier dit que la ville est déduite. */

type Vue = string;
const nomDans = (liste: readonly Libelle[], cle: string) => liste.find((x) => x.cle === cle)?.nom ?? cle;
const sansAccents = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

export default function Classement() {
  const { branch } = useBranch();
  const moi = useStaff();
  const par = moi?.name ?? undefined;
  const clients = useBranchClients();
  const rdvs = useBranchAppointments();
  const [abonnements] = useSubscribers();
  const [formules] = usePlans();
  const [reglages, ecris] = useClassement();
  const aujourdhui = todayISO();

  /* « Auto-remplis ce que tu sais » : le pays d'un numéro étranger, une fois. */
  const dejaRempli = useRef(false);
  useEffect(() => {
    if (dejaRempli.current) return;
    const aRemplir = clients.filter((c) => !c.essai && villeADeduire(c));
    if (aRemplir.length === 0) return;
    dejaRempli.current = true;
    const ids = new Set(aRemplir.map((c) => c.id));
    clientsStore.set((prev) => prev.map((c) => {
      if (!ids.has(c.id)) return c;
      const pays = villeADeduire(c);
      return pays ? { ...c, city: pays, villeDeduiteLe: aujourdhui } : c;
    }));
    toast(`${aRemplir.length} ville${aRemplir.length > 1 ? 's' : ''} remplie${aRemplir.length > 1 ? 's' : ''} d’après l’indicatif du numéro.`);
  }, [clients, aujourdhui]);

  /* Les brouillons : rien ne change pour l'équipe tant qu'on n'enregistre pas. */
  const [brouillonP, setBrouillonP] = useState<CriteresDuClassement | null>(null);
  const [brouillonsCat, setBrouillonsCat] = useState<Record<string, CategorieDeLaMaison>>({});
  const p = brouillonP ?? reglages.criteres;
  const categories = useMemo(() => reglages.categories.map((c) => brouillonsCat[c.id] ?? c), [reglages.categories, brouillonsCat]);
  /* CINQ CATÉGORIES (25 novembre 2026) : les cinq, puis celles de la Maison,
     puis « Sans catégorie », qui ferme la colonne. */
  const etapes: Libelle[] = useMemo(() => [
    ...ETAPES.filter((e) => e.cle !== 'hors'), ...categories.filter((c) => c.type === 'etape').map((c) => ({ cle: c.id, nom: c.nom })), ...ETAPES.filter((e) => e.cle === 'hors'),
  ], [categories]);
  const marques: Libelle[] = useMemo(() => [...MARQUES, ...categories.filter((c) => c.type === 'marque').map((c) => ({ cle: c.id, nom: c.nom }))], [categories]);

  const fiches = useMemo(() => {
    const abosDeLaBranche = abonnements.filter((a) => a.branchId === branch.id);
    const nomDeLaFormule = (id: string) => formules.find((f) => f.id === id)?.name ?? 'formule';
    return clients.map((c) => ficheDuClassement(c, rdvs, abosDeLaBranche, nomDeLaFormule, aujourdhui));
  }, [clients, rdvs, abonnements, formules, branch.id, aujourdhui]);
  const resultats = useMemo(() => new Map(fiches.map((f) => [f.id, classeLaCliente(f, p, categories, aujourdhui)])), [fiches, p, categories, aujourdhui]);
  const res = (f: FicheDuClassement) => resultats.get(f.id)!;
  const compte = (pred: (r: ResultatDuClassement, f: FicheDuClassement) => boolean) => fiches.filter((f) => pred(res(f), f)).length;
  const estModifiee = (f: FicheDuClassement) => !!(f.choix.etape || f.choix.lieu || f.choix.rythme || f.choix.note);

  const [vue, setVue] = useState<Vue>('criteres');
  const [cherche, setCherche] = useState('');
  const [ouvert, setOuvert] = useState<string | null>(null);
  const choisis = (v: Vue) => { setVue(v); setOuvert(null); };
  /* « MODIFIER LA DÉFINITION » (25 novembre 2026) : depuis une catégorie, on
     revient à « Les critères », à SA carte, qui s'éclaire un instant. */
  const [cible, setCible] = useState<string | null>(null);
  const modifieLaDefinition = (v: Vue) => { setCible(carteDeLaVue(v, categories)); choisis('criteres'); };
  useEffect(() => {
    if (vue !== 'criteres' || !cible) return;
    const id = cible;
    setCible(null);
    let eteint: ReturnType<typeof setTimeout> | undefined;
    const image = requestAnimationFrame(() => {
      const el = document.getElementById(id);
      if (!el) return;
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('is-cible');
      eteint = setTimeout(() => el.classList.remove('is-cible'), 2600);
    });
    return () => { cancelAnimationFrame(image); if (eteint) clearTimeout(eteint); };
  }, [vue, cible]);

  /* ── Les écritures ── */
  const changeP = (k: keyof CriteresDuClassement, v: CriteresDuClassement[keyof CriteresDuClassement]) => setBrouillonP({ ...p, [k]: v });
  const enregistreP = () => { ecris((r) => ({ ...r, criteres: { ...p } }), par); setBrouillonP(null); toast('Critères enregistrés : toute l’équipe voit ce classement.'); };
  const brouillonCat = (id: string): CategorieDeLaMaison => brouillonsCat[id] ?? (() => { const c = categories.find((x) => x.id === id)!; return { ...c, criteres: c.criteres.map((x) => ({ ...x })) }; })();
  const changeCat = (id: string, fn: (c: CategorieDeLaMaison) => CategorieDeLaMaison) => setBrouillonsCat((b) => ({ ...b, [id]: fn(brouillonCat(id)) }));
  const enregistreCat = (id: string) => {
    const c = brouillonCat(id);
    ecris((r) => ({ ...r, categories: r.categories.map((x) => (x.id === id ? { ...c, nom: c.nom.trim() || 'Sans nom', regle: c.regle.trim() } : x)) }), par);
    setBrouillonsCat((b) => { const n = { ...b }; delete n[id]; return n; });
    toast('Catégorie enregistrée.');
  };
  const supprimeCat = (id: string) => {
    ecris((r) => ({ ...r, categories: r.categories.filter((x) => x.id !== id) }), par);
    setBrouillonsCat((b) => { const n = { ...b }; delete n[id]; return n; });
    if (vue === `e:${id}` || vue === `m:${id}`) choisis('criteres');
  };
  const creeCat = (nom: string) => {
    const id = uid();
    ecris((r) => ({ ...r, categories: [...r.categories, { id, nom, regle: '', type: 'etape', criteres: [], ordre: Date.now() }] }), par);
  };
  const poseLeChoix = (id: string, ch: ChoixDuParcours) => {
    const vide = !ch.etape && !ch.lieu && !ch.rythme && !(ch.note ?? '').trim();
    clientsStore.set((prev) => prev.map((c: Client) => (c.id === id ? { ...c, parcours: vide ? undefined : { ...ch, note: (ch.note ?? '').trim(), le: new Date().toISOString(), ...(par ? { par } : {}) } } : c)));
    toast(vide ? 'Rendu aux critères.' : 'Enregistré.');
  };


  /* ── La colonne des catégories ── */
  const bouton = (v: Vue, nom: string, n: number | null, cls = '') => (
    <button type="button" key={v} className={`trc-cl-cat ${cls}`} aria-current={vue === v} onClick={() => choisis(v)}>
      <span>{nom}</span>{n != null && <b>{n}</b>}
    </button>
  );
  const nav = (
    <nav className="trc-cl-nav" aria-label="Catégories du classement">
      {bouton('criteres', 'Les critères', null, 'is-criteres')}
      {bouton('tout', 'Toutes les fiches', fiches.length, 'is-speciale')}
      <div className="trc-cl-axe">Les catégories</div>
      {etapes.map((e) => bouton(`e:${e.cle}`, e.nom, compte((r) => r.etape === e.cle), e.cle === 'hors' ? 'is-speciale' : ''))}
      {/* Une marque que la Maison créerait reste visible. */}
      {marques.some((x) => categories.some((c) => c.id === x.cle)) && <div className="trc-cl-axe">Vos marques</div>}
      {marques.filter((x) => categories.some((c) => c.id === x.cle)).map((x) => bouton(`m:${x.cle}`, x.nom, compte((r) => r.marques.includes(x.cle))))}
    </nav>
  );

  return (
    <div className="trc-cl">
      <PageHead
        eyebrow={`Le Trône · ${branch.city}`}
        title="Le classement des clientes"
        sub="Chaque cliente se range dans une catégorie : la Privilégiée, la Régulière, l’Annulée, la Dormante ou la Diaspora. Les critères se règlent ici ; un choix posé dans son dossier passe avant eux."
      />
      <div className="trc-cl-grille">
        {nav}
        <main className="trc-cl-main">
          {vue === 'criteres'
            ? <VueCriteres p={p} brouillon={!!brouillonP} modifieLe={reglages.modifieLe} modifiePar={reglages.modifiePar} changeP={changeP}
                enregistre={enregistreP} annule={() => setBrouillonP(null)} proposes={() => setBrouillonP({ ...CRITERES_PROPOSES })}
                compte={compte} categories={categories} brouillonsCat={brouillonsCat} changeCat={changeCat} enregistreCat={enregistreCat}
                supprimeCat={supprimeCat} creeCat={creeCat} fiches={fiches} total={fiches.length} />
            : <VueListe vue={vue} fiches={fiches} res={res} etapes={etapes} marques={marques} categories={categories} p={p} aujourdhui={aujourdhui}
                cherche={cherche} setCherche={setCherche} ouvert={ouvert} setOuvert={setOuvert} estModifiee={estModifiee} poseLeChoix={poseLeChoix}
                modifieLaDefinition={modifieLaDefinition} />}
        </main>
      </div>
    </div>
  );
}

/* ══ Un nombre qu'on peut effacer pour en taper un autre ═════════════ */
function Nombre({ valeur, min, max, onChange, label }: { valeur: number; min: number; max: number; onChange: (n: number) => void; label: string }) {
  const [texte, setTexte] = useState(String(valeur));
  useEffect(() => { setTexte(String(valeur)); }, [valeur]);
  return (
    <input type="number" className="trc-cl-nombre" aria-label={label} min={min} max={max} value={texte}
      onChange={(e) => { setTexte(e.target.value); const n = Number(e.target.value); if (e.target.value !== '' && Number.isFinite(n) && n >= min && n <= max) onChange(n); }} />
  );
}
function Coche({ coche, onChange, children }: { coche: boolean; onChange: (b: boolean) => void; children: ReactNode }) {
  return <label className="trc-cl-coche"><input type="checkbox" checked={coche} onChange={(e) => onChange(e.target.checked)} /> {children}</label>;
}

/* ══ Les critères ═════════════════════════════════════════════════════ */
function VueCriteres(o: {
  p: CriteresDuClassement; brouillon: boolean; modifieLe?: string; modifiePar?: string;
  changeP: (k: keyof CriteresDuClassement, v: CriteresDuClassement[keyof CriteresDuClassement]) => void;
  enregistre: () => void; annule: () => void; proposes: () => void;
  compte: (pred: (r: ResultatDuClassement, f: FicheDuClassement) => boolean) => number;
  categories: CategorieDeLaMaison[]; brouillonsCat: Record<string, CategorieDeLaMaison>;
  changeCat: (id: string, fn: (c: CategorieDeLaMaison) => CategorieDeLaMaison) => void; enregistreCat: (id: string) => void;
  supprimeCat: (id: string) => void; creeCat: (nom: string) => void; fiches: FicheDuClassement[]; total: number;
}) {
  const { p, changeP: c, compte } = o;
  const n = (k: keyof CriteresDuClassement, min: number, max: number) => <Nombre valeur={p[k] as number} min={min} max={max} onChange={(v) => c(k, v)} label={String(k)} />;
  const parEtape = (cle: string) => compte((r) => r.etape === cle);
  const phrases: Record<string, ReactNode> = {
    privilegiee: <>{LA_PRIVILEGIEE_DITE} Le Trône ne la devine pas : on l’y range depuis son dossier (« Catégorie »), et ce choix passe avant tous les critères.</>,
    hors: <>Ce n’est pas une catégorie. Y restent les fiches jamais venues (même avec un rendez-vous à venir), la fiche d’essai, et celles où : <Coche coche={p.hors_stop} onChange={(b) => c('hors_stop', b)}>elle a dit STOP</Coche><Coche coche={p.hors_locks} onChange={(b) => c('hors_locks', b)}>elle a défait ses locks</Coche><Coche coche={p.hors_passage_pose} onChange={(b) => c('hors_passage_pose', b)}>la Maison l’a marquée « de passage » à la main</Coche></>,
    annulee: <>Une annulation il y a {n('annulee_jours', 1, 365)} jours au plus, et ni visite ni rendez-vous depuis. <Coche coche={p.annulee_absences} onChange={(b) => c('annulee_absences', b)}>un rendez-vous passé resté « confirmé » compte comme une absence</Coche></>,
    diaspora: <><Coche coche={p.diaspora_remplace} onChange={(b) => c('diaspora_remplace', b)}>Une cliente qui vit à l’étranger entre ici : ses relances suivent ses séjours.</Coche> On le sait par le lieu choisi dans son dossier, une ville de l’étranger sur sa fiche, la marque diaspora, ou <Coche coche={p.numero_suffit} onChange={(b) => c('numero_suffit', b)}>un numéro étranger</Coche></>,
    dormante: <>Sa dernière visite date de plus de {n('dormante_jours', 30, 720)} jours. Celle qui vient une ou deux fois par an (un rythme de {n('annuelle_rythme', 60, 400)} jours ou plus) n’y entre qu’au-delà de son rythme et de {n('annuelle_marge', 0, 180)} jours de marge.</>,
    reguliere: <>Toutes les autres : elle est venue, et sa dernière visite date de {p.dormante_jours} jours au plus (le chiffre se règle dans « La Dormante »), ou elle reste dans son rythme d’une ou deux fois par an.</>,
  };
  /** L'ordre des règles : la première qui s'applique l'emporte. */
  const REGLES = ['privilegiee', 'hors', 'annulee', 'diaspora', 'dormante', 'reguliere'];
  const carte = (titre: string, ordre: number | null, phrase: ReactNode, nb: number, key: string) => (
    <div className="trc-cl-critere" key={key} id={key}>
      <div className="trc-cl-critere__titre">{ordre != null && <span className="trc-cl-ordre">{ordre}</span>}{titre}</div>
      <div className="trc-cl-critere__phrase">{phrase}</div>
      <div className="trc-cl-critere__compte">{nb}<small>fiches</small></div>
    </div>
  );
  const [nouvelle, setNouvelle] = useState('');
  return (
    <>
      <div className="trc-cl-barre">
        <span className="trc-cl-dit" role="status">{o.brouillon ? 'Critères modifiés, pas encore enregistrés.' : o.modifieLe ? `Critères enregistrés le ${jourDit(o.modifieLe)}${o.modifiePar ? ` par ${o.modifiePar}` : ''}.` : 'Les critères proposés, pas encore enregistrés.'}</span>
        <Button onClick={o.enregistre} disabled={!o.brouillon && !!o.modifieLe}>Enregistrer les critères</Button>
        <Button variant="ghost" onClick={o.annule} disabled={!o.brouillon}>Revenir aux critères enregistrés</Button>
        <Button variant="ghost" onClick={o.proposes}>Critères proposés</Button>
      </div>
      <p className="trc-cl-intro">Ce qui fait entrer une cliente dans chaque catégorie. Changez un nombre : les comptes suivent aussitôt, sur les {o.total} fiches.</p>
      <section className="trc-cl-bloc">
        <h3>Les cinq catégories</h3>
        <p>Une seule catégorie par cliente. Les règles se lisent dans cet ordre, la première qui s’applique l’emporte ; vos catégories passent juste après « Sans catégorie ».</p>
        {REGLES.map((cle, i) => carte(nomDans(ETAPES, cle), i + 1, phrases[cle], parEtape(cle), `def-e:${cle}`))}
      </section>
      <section className="trc-cl-bloc">
        <h3>Vos catégories</h3>
        <p>Si les cinq ne suffisent pas : créez une catégorie, donnez-lui ses critères (tous doivent tenir), et dites si c’est une catégorie ou une marque. Sans critère, on y range une fiche depuis son dossier.</p>
        {o.categories.map((cat) => (
          <EditeurDeCategorie key={cat.id} cat={cat} modifiee={!!o.brouillonsCat[cat.id]} change={(fn) => o.changeCat(cat.id, fn)}
            enregistre={() => o.enregistreCat(cat.id)} supprime={() => o.supprimeCat(cat.id)}
            dedans={compte((r) => r.etape === cat.id || r.marques.includes(cat.id))}
            aLaMain={o.fiches.filter((f) => f.choix.etape === cat.id).length} />
        ))}
        <form className="trc-cl-ajout" onSubmit={(e) => { e.preventDefault(); const nom = nouvelle.trim(); if (nom) { o.creeCat(nom); setNouvelle(''); } }}>
          <Input value={nouvelle} onChange={(e) => setNouvelle(e.target.value)} placeholder="Nom de la nouvelle catégorie" aria-label="Nom de la nouvelle catégorie" maxLength={60} />
          <Button type="submit" variant="ghost">Créer la catégorie</Button>
        </form>
      </section>
    </>
  );
}

function EditeurDeCategorie({ cat, modifiee, change, enregistre, supprime, dedans, aLaMain }: {
  cat: CategorieDeLaMaison; modifiee: boolean; change: (fn: (c: CategorieDeLaMaison) => CategorieDeLaMaison) => void;
  enregistre: () => void; supprime: () => void; dedans: number; aLaMain: number;
}) {
  const [sur, setSur] = useState(false);
  return (
    <div className="trc-cl-critere is-propre" id={`def-cat:${cat.id}`}>
      <div className="trc-cl-critere__titre"><Input value={cat.nom} onChange={(e) => change((c) => ({ ...c, nom: e.target.value }))} aria-label="Nom de la catégorie" maxLength={60} /></div>
      <div className="trc-cl-critere__phrase">
        <label className="trc-cl-ligne">C’est <Select value={cat.type} onChange={(e) => change((c) => ({ ...c, type: e.target.value === 'marque' ? 'marque' : 'etape' }))} aria-label="Type"><option value="etape">une étape (elle passe avant les étapes du code)</option><option value="marque">une marque (elle s’ajoute)</option></Select></label>
        {cat.criteres.map((cond, i) => {
          const type = CHAMPS[cond.champ].type;
          const remplace = (fn: (x: typeof cond) => typeof cond) => change((c) => ({ ...c, criteres: c.criteres.map((x, j) => (j === i ? fn(x) : x)) }));
          return (
            <div className="trc-cl-condition" key={i}>
              <Select value={cond.champ} aria-label="Champ" onChange={(e) => { const ch = e.target.value as ChampDeCritere; const t = CHAMPS[ch].type; remplace(() => ({ champ: ch, op: t === 'num' ? '>=' : '=', valeur: t === 'num' ? 1 : (optionsDuChamp(ch)[0]?.[0] ?? '') })); }}>
                {(Object.keys(CHAMPS) as ChampDeCritere[]).map((k) => <option key={k} value={k}>{CHAMPS[k].nom}</option>)}
              </Select>
              {type === 'num' ? (
                <>
                  <Select value={cond.op} aria-label="Comparaison" onChange={(e) => remplace((x) => ({ ...x, op: e.target.value as typeof cond.op }))}><option value=">=">au moins</option><option value="<=">au plus</option><option value="=">exactement</option></Select>
                  <Nombre valeur={Number(cond.valeur) || 0} min={0} max={10000} onChange={(v) => remplace((x) => ({ ...x, valeur: v }))} label="Valeur" />
                </>
              ) : (
                <>
                  <Select value={cond.op === '≠' ? '≠' : '='} aria-label="Comparaison" onChange={(e) => remplace((x) => ({ ...x, op: e.target.value as typeof cond.op }))}><option value="=">est</option><option value="≠">n’est pas</option></Select>
                  <Select value={String(cond.valeur)} aria-label="Valeur" onChange={(e) => remplace((x) => ({ ...x, valeur: e.target.value }))}>
                    {optionsDuChamp(cond.champ).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </Select>
                </>
              )}
              <Button variant="ghost" onClick={() => change((c) => ({ ...c, criteres: c.criteres.filter((_, j) => j !== i) }))}>Retirer</Button>
            </div>
          );
        })}
        {cat.criteres.length === 0 && <p className="trc-cl-dit">Aucun critère : on y range une fiche à la main, depuis son dossier.</p>}
        <label className="trc-cl-ligne trc-cl-ligne--bloc">Qui y entre, et pourquoi, en une phrase
          <Textarea rows={2} value={cat.regle} maxLength={600} onChange={(e) => change((c) => ({ ...c, regle: e.target.value }))} />
        </label>
        <div className="trc-cl-actions">
          <Button variant="ghost" onClick={() => change((c) => ({ ...c, criteres: [...c.criteres, { champ: 'visites', op: '>=', valeur: 1 }] }))}>Ajouter un critère</Button>
          <Button onClick={enregistre} disabled={!modifiee}>Enregistrer la catégorie</Button>
          {aLaMain === 0
            ? <Button variant="ghost" onClick={() => (sur ? supprime() : setSur(true))}>{sur ? 'Confirmer la suppression' : 'Supprimer'}</Button>
            : <span className="trc-cl-dit">{aLaMain} fiche{aLaMain > 1 ? 's' : ''} rangée{aLaMain > 1 ? 's' : ''} à la main : retirez-les avant de la supprimer.</span>}
        </div>
      </div>
      <div className="trc-cl-critere__compte">{dedans}<small>fiches</small></div>
    </div>
  );
}

/* ══ Une liste ════════════════════════════════════════════════════════ */
function VueListe(o: {
  vue: Vue; fiches: FicheDuClassement[]; res: (f: FicheDuClassement) => ResultatDuClassement; etapes: Libelle[]; marques: Libelle[];
  categories: CategorieDeLaMaison[]; p: CriteresDuClassement; aujourdhui: string;
  cherche: string; setCherche: (s: string) => void; ouvert: string | null; setOuvert: (s: string | null) => void;
  estModifiee: (f: FicheDuClassement) => boolean; poseLeChoix: (id: string, ch: ChoixDuParcours) => void;
  modifieLaDefinition: (v: Vue) => void;
}) {
  const { vue, res, aujourdhui } = o;
  const definition = definitionDeLaVue(vue, o.p, o.categories);
  const carteDeLaDefinition = carteDeLaVue(vue, o.categories);
  const k = vue.slice(2);
  const [titre, regle] = ((): [string, string] => {
    if (vue === 'tout') return ['Toutes les fiches', 'La plus récemment venue d’abord. Touchez un nom pour ouvrir son dossier.'];
    if (vue.startsWith('e:')) { const cat = o.categories.find((c) => c.id === k); return [nomDans(o.etapes, k), cat ? (cat.regle || (cat.criteres.length ? '' : 'Pas encore de critères : on y range une fiche depuis son dossier.')) : 'Ses critères se lisent dans « Les critères ».']; }
    if (vue.startsWith('m:')) { const cat = o.categories.find((c) => c.id === k); return [nomDans(o.marques, k), cat?.regle ?? '']; }
    return ['', ''];
  })();
  const filtre = (f: FicheDuClassement) => {
    const r = res(f);
    if (vue === 'tout') return true;
    if (vue.startsWith('e:')) return r.etape === k;
    if (vue.startsWith('m:')) return r.marques.includes(k);
    return false;
  };
  const q = sansAccents(o.cherche.trim());
  const liste = o.fiches.filter(filtre).filter((f) => !q || sansAccents(f.nom).includes(q));
  /* L'ANNULÉE se lit par sa dernière annulation, la plus récente d'abord (le
     rendez-vous resté « confirmé » compte : il peut seul l'y faire entrer). */
  const derniereAnnulation = (f: FicheDuClassement): string => [...f.annulations, ...f.absences].sort().pop() ?? '';
  if (vue === 'e:annulee') liste.sort((a, b) => derniereAnnulation(b).localeCompare(derniereAnnulation(a)) || a.nom.localeCompare(b.nom, 'fr'));
  else liste.sort((a, b) => (a.derniere ? joursEntre(a.derniere, aujourdhui) : -1) - (b.derniere ? joursEntre(b.derniere, aujourdhui) : -1) || a.nom.localeCompare(b.nom, 'fr'));
  const apres = (f: FicheDuClassement) => {
    const der = derniereAnnulation(f);
    if (f.prochain) return `rendez-vous le ${jourDit(f.prochain)}`;
    if (f.derniere && der && f.derniere > der) return `revenue le ${jourDit(f.derniere)}`;
    return 'rien depuis';
  };
  return (
    <>
      <div className="trc-cl-tete">
        <h3>{titre} <span className="trc-cl-meta">{liste.length}</span></h3>
        {definition ? (
          <div className="trc-cl-definition">
            <p><span className="trc-cl-definition__mot">Qui y entre</span>{definition}</p>
            {carteDeLaDefinition && <Button variant="ghost" size="sm" onClick={() => o.modifieLaDefinition(vue)}>Modifier la définition</Button>}
          </div>
        ) : regle && <p>{regle}</p>}
      </div>
      <div className="trc-cl-outils"><Input type="search" value={o.cherche} onChange={(e) => o.setCherche(e.target.value)} placeholder="Chercher un nom" aria-label="Chercher un nom" /></div>
      <div className="trc-cl-liste">
        {liste.length === 0 && <div className="trc-cl-vide">{o.cherche ? 'Aucun nom ne correspond.' : 'Personne ici pour l’instant.'}</div>}
        {liste.map((f) => {
          const r = res(f);
          const meta = vue === 'e:annulee' && derniereAnnulation(f)
            ? [
              ...(f.annulations.length ? [`annulé : ${f.annulations.map(jourDit).join(', ')}`] : []),
              ...(f.absences.length ? [`resté « confirmé » : ${f.absences.map(jourDit).join(', ')}`] : []),
              apres(f),
            ]
            : [`${f.visites} visite${f.visites > 1 ? 's' : ''}`, ...(f.derniere ? [`dernière le ${jourDit(f.derniere)} (${joursEntre(f.derniere, aujourdhui)} j)`] : []), ...(f.prochain ? [`rendez-vous le ${jourDit(f.prochain)}`] : [])];
          const ouvert = o.ouvert === f.id;
          return (
            <div key={f.id}>
              <button type="button" className="trc-cl-rangee" aria-expanded={ouvert} onClick={() => o.setOuvert(ouvert ? null : f.id)}>
                <span className="trc-cl-nom">{f.nom}</span>
                <span className="trc-cl-meta">{meta.join(' · ')}</span>
                <span className="trc-cl-puces">
                  {!vue.startsWith('e:') && <span className="trc-cl-puce">{nomDans(o.etapes, r.etape)}</span>}
                  {!vue.startsWith('l:') && r.lieu !== 'cotonou' && <span className={`trc-cl-puce${r.groupe === 'diaspora' ? ' is-ok' : ''}`}>{nomDans(LIEUX, r.lieu)}</span>}
                  {o.estModifiee(f) && <span className="trc-cl-puce is-choix">choix de la Maison</span>}
                </span>
              </button>
              {ouvert && <Dossier f={f} r={r} etapes={o.etapes} aujourdhui={aujourdhui} poseLeChoix={o.poseLeChoix} marques={o.marques} />}
            </div>
          );
        })}
      </div>
    </>
  );
}

/* ══ Le dossier d'une cliente ═════════════════════════════════════════ */
function Dossier({ f, r, etapes, marques, aujourdhui, poseLeChoix }: {
  f: FicheDuClassement; r: ResultatDuClassement; etapes: Libelle[]; marques: Libelle[]; aujourdhui: string; poseLeChoix: (id: string, ch: ChoixDuParcours) => void;
}) {
  const [etape, setEtape] = useState(f.choix.etape ?? '');
  const [lieu, setLieu] = useState(f.choix.lieu ?? '');
  const [rythme, setRythme] = useState<ChoixDuParcours['rythme']>(f.choix.rythme ?? '');
  const [note, setNote] = useState(f.choix.note ?? '');
  const abo = abonnementActif(f, aujourdhui);
  const faits: [string, string][] = ([
    ['Catégorie', `${nomDans(etapes, r.etape)} · ${r.raisons.etape}`],
    ['Lieu', `${nomDans(LIEUX, r.lieu)} · ${r.raisons.lieu}`],
    ['Rythme', `${nomDans(RYTHMES, r.rythme)} · ${r.raisons.rythme}`],
    ['Visites', `${f.visites}${f.premiere ? `, du ${jourDit(f.premiere)} au ${jourDit(f.derniere)}` : ''}`],
    ['Prochain rendez-vous', jourDit(f.prochain) || 'aucun'],
    ['Formule', abo ? `${abo.formule} (active${abo.fin ? ` jusqu’au ${jourDit(abo.fin)}` : ''})` : f.abonnements.length ? `formule terminée : ${f.abonnements[f.abonnements.length - 1].formule}` : ''],
    ['Annulations', f.annulations.length ? f.annulations.map(jourDit).join(', ') : ''],
    ['Restés « confirmés »', f.absences.length ? `${f.absences.map(jourDit).join(', ')} : venue à marquer, ou absence` : ''],
    ['Numéro', f.regionNumero],
    ['Accord des nouvelles', f.accord === 'oui' ? 'a dit oui' : f.accord === 'non' ? 'a dit « Non merci »' : f.accord === 'stop' ? 'STOP' : 'jamais répondu'],
    ['Marques', r.marques.map((m) => nomDans(marques, m)).join(' · ')],
  ] as [string, string][]).filter(([, v]) => v);
  return (
    <div className="trc-cl-dossier">
      <dl className="trc-cl-faits">{faits.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
      <form className="trc-cl-form" onSubmit={(e) => { e.preventDefault(); poseLeChoix(f.id, { etape, lieu, rythme, note }); }}>
        <label>Catégorie<Select value={etape} onChange={(e) => setEtape(e.target.value)}>
          <option value="">Selon les critères : {nomDans(etapes, r.etapeAuto)}</option>
          {etapes.filter((e) => e.cle !== r.etapeAuto).map((e) => <option key={e.cle} value={e.cle}>{e.nom}</option>)}
        </Select></label>
        <label>Lieu<Select value={lieu} onChange={(e) => setLieu(e.target.value)}>
          <option value="">Selon la fiche</option>
          {LIEUX.map((l) => <option key={l.cle} value={l.cle}>{l.nom}</option>)}
        </Select></label>
        <label>Rythme<Select value={rythme ?? ''} onChange={(e) => setRythme(e.target.value as ChoixDuParcours['rythme'])}>
          <option value="">Selon ses visites</option><option value="une-par-an">Une fois par an</option><option value="deux-par-an">Deux fois par an</option>
        </Select></label>
        <label>Note pour l’équipe<Textarea rows={3} value={note} maxLength={2000} onChange={(e) => setNote(e.target.value)} placeholder="Ce qu’il faut savoir avant de lui écrire" /></label>
        <div className="trc-cl-actions">
          <Button type="submit">Enregistrer</Button>
          {(f.choix.etape || f.choix.lieu || f.choix.rythme || f.choix.note) && <Button type="button" variant="ghost" onClick={() => { setEtape(''); setLieu(''); setRythme(''); setNote(''); poseLeChoix(f.id, {}); }}>Revenir aux critères</Button>}
        </div>
        {f.choix.le && <p className="trc-cl-dit">Modifiée le {jourDit(f.choix.le)}{f.choix.par ? ` par ${f.choix.par}` : ''}.</p>}
      </form>
    </div>
  );
}
