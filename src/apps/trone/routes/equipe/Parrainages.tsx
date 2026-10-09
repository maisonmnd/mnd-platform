import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { PageHead } from '../_ui';
import { asset } from '../../../../shared/asset';
import { Button, toast } from '../../../../ds/components';
import { Toggle } from './ui';
import './equipe.css';
import './ambassadrices.css';
import { useBranch } from '../../../../shared/branches';
import { useAppointments } from '../../../../shared/agenda';
import { useClients, useFamilies, aUnPrixConvenu } from '../../../../shared/clients';
import { estDependant } from '../../../../shared/accounts';
import { venuesDeLAnnee } from '../../../../shared/agenda';
import { cercleSeuilStore, foyerSeuilStore, estDuCercle, useFoyerTiers } from '../../../../shared/offers';
import { useStore, uid } from '../../../../shared/store';
import { fmtMoney } from '../../../../shared/currency';
import { useServices, useCategories, catsDansLOrdre } from '../../../../shared/catalog';
import { useDemandes } from '../../../../shared/demandes';
import { parrainageStore, useParrainage, type DemandeParrainee, type ReglageParrainage } from '../../../../shared/parrainage';
import { RANGS, nomDuRang, soinsEnAttente, REMISE_BIENVENUE_PCT, prestationsDeBienvenue, remiseDeBienvenue } from '../../../../shared/parrainage-pur';
import {
  REMISE_MAX, REMISE_PAR_DEFAUT, chiffresDuMois, classementDuMois, lignees, moisDit, venuesDe,
} from '../../../../shared/ambassade';
import { douzeLunesStore, useDouzeLunes } from '../../../../shared/douze-lunes';
import {
  PLAFOND_SANS_MAIN, SEUIL_GRAINE_MAX, SEUIL_GRAINE_MIN, codeActifDe, seuilDeLaGraine,
} from '../../../../shared/douze-lunes-pur';
import { useEstDirection } from '../_vie';
import { grainesEnAttente, jourDeLaMaison, rdvsDesLunes } from './lancement';
import { AccordDesGraines, LancementDesDouzeLunes, dateLongue } from './LancementDesDouzeLunes';

/* ══ LES AMBASSADRICES — 28 septembre 2026, revisitées le soir même ══════
   Ce que la Maison regarde tous les jours d'abord : quatre chiffres, le
   classement du mois. Puis les réglages, en LIGNES REPLIÉES qui disent leur
   valeur (« DÀNDÀN™ ou −15 % produit · 6 mois »), un seul panneau ouvert à
   la fois : on lit tout sans rien déplier, on ne déplie que ce qu'on règle.
   Styles : ambassadrices.css (la carte du système n'a pas de marge
   intérieure, d'où les chiffres collés aux bords avant ce soir).

   ── DE MAIN EN MAIN (9 octobre 2026). La carte se gagne : à sa Nᵉ visite
   depuis janvier, une cliente devient Graine (shared/douze-lunes-pur). Au
   haut de l'écran, pour la direction, le bandeau du lancement (fenêtre
   LancementDesDouzeLunes), puis l'accord des Graines quand elles sont trop
   nombreuses pour que le Trône les pose seul. Le réglage « La Graine » dit
   N. Retirés : l'écho, les bonus de rang, le défi du mois, le classement
   dans Ma Couronne (le personnel le voit toujours ici) et les marraines du
   site, dont les codes ne mènent plus à rien.

   Le calcul vit dans shared/ambassade, éprouvé par verifie-le-parrainage. */

const borne = (v: string, min: number, max: number, defaut: number) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n >= min ? Math.min(max, n) : defaut;
};

type IdReglage = 'graine' | 'cercle' | 'recompenses' | 'foyer' | 'bienvenue' | 'site';

function Reglage({ id, nom, resume, ouvert, bascule, children }: {
  id: IdReglage; nom: string; resume: string; ouvert: boolean; bascule: (id: IdReglage) => void; children: ReactNode;
}) {
  return (
    <div className={`amb-reglage${ouvert ? ' is-ouvert' : ''}`}>
      <button type="button" className="amb-reglage__ligne" aria-expanded={ouvert} aria-controls={`amb-${id}`} onClick={() => bascule(id)}>
        <span className="amb-reglage__nom">{nom}</span>
        <span className="amb-reglage__resume">{resume}</span>
        <span className="amb-reglage__chevron" aria-hidden="true"><svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M3 5.5 7 9.5 11 5.5" /></svg></span>
      </button>
      {ouvert && <div className="amb-reglage__corps" id={`amb-${id}`}>{children}</div>}
    </div>
  );
}

function Champ({ label, aide, large, children }: { label: string; aide?: string; large?: boolean; children: ReactNode }) {
  return (
    <label className={`amb-champ${large ? ' amb-champ--large' : ''}`}>
      <span className="amb-champ__label">{label}{aide && <small>{aide}</small>}</span>
      {children}
    </label>
  );
}

/** `dansLeCercle` : l'onglet « Les ambassadrices » du Cercle MND (29 septembre,
    le Cercle réuni) ; l'en-tête est celui du Cercle, et les réglages du Cercle
    (l'entrée, les sceaux du Foyer) s'ajoutent aux leurs. */
export default function Parrainages({ dansLeCercle = false }: { dansLeCercle?: boolean }) {
  const { branch, currency } = useBranch();
  const [familles] = useFamilies();
  const [seuilCercle, setSeuilCercle] = useStore(cercleSeuilStore);
  const [seuilFoyer, setSeuilFoyer] = useStore(foyerSeuilStore);
  const [sceaux, setSceaux] = useFoyerTiers();
  const [demandes] = useDemandes();
  const [rdvs] = useAppointments();
  const [clients] = useClients();
  const [services] = useServices();
  const [categories] = useCategories();
  const [reglage] = useParrainage();
  const [lunes] = useDouzeLunes();
  const direction = useEstDirection();
  const aujourdhui = new Date().toISOString().slice(0, 10);
  const [ouvert, setOuvert] = useState<IdReglage | null>(null);
  const bascule = (id: IdReglage) => setOuvert((o) => (o === id ? null : id));
  const [lancement, setLancement] = useState(false);
  /* N baissé après le lancement : la liste des Graines qu'il ferait, avant
     tout écrit (null : rien de proposé). */
  const [seuilPropose, setSeuilPropose] = useState<number | null>(null);

  const [filleule, setFilleule] = useState(reglage.cadeauFilleule);
  const [marraine, setMarraine] = useState(reglage.cadeauMarraine);
  useEffect(() => { setFilleule(reglage.cadeauFilleule); setMarraine(reglage.cadeauMarraine); }, [reglage.cadeauFilleule, reglage.cadeauMarraine]);

  const fiches = useMemo(() => clients.filter((c) => c && c.branchId === branch.id), [clients, branch.id]);
  const lus = useMemo(() => rdvs.map((a) => ({ id: a.id, status: a.status, date: a.date, clientId: a.clientId })), [rdvs]);
  const liste = demandes as DemandeParrainee[];
  const L = useMemo(
    () => lignees(fiches, liste.filter((d) => d && (!d.branchId || d.branchId === branch.id)), lus),
    [fiches, liste, lus, branch.id],
  );
  const chiffres = chiffresDuMois(fiches, L, lus, aujourdhui);
  const classement = classementDuMois(L, aujourdhui);
  const actives = [...L.values()].filter((l) => l.clientId && venuesDe(l).length > 0).length;
  const enAttente = fiches.reduce((n, c) => n + soinsEnAttente(c.soinsOfferts, aujourdhui).length, 0);
  /* LA GRAINE (9 octobre 2026). Le calcul des Graines en attente est celui
     du moteur, sur toutes les fiches et toutes les demandes de la Maison
     (un code vaut pour toute la Maison) : la liste montrée est celle qui
     s'écrit. */
  const seuilGraine = seuilDeLaGraine(lunes);
  const jour = jourDeLaMaison();
  const lusDesLunes = useMemo(() => rdvsDesLunes(rdvs), [rdvs]);
  const enAttenteDAccord = useMemo(
    () => (lunes.lanceLe ? grainesEnAttente(clients, lusDesLunes, liste, seuilGraine, jour) : []),
    [lunes.lanceLe, clients, lusDesLunes, liste, seuilGraine, jour],
  );
  const proposees = useMemo(
    () => (lunes.lanceLe && seuilPropose !== null ? grainesEnAttente(clients, lusDesLunes, liste, seuilPropose, jour) : []),
    [lunes.lanceLe, seuilPropose, clients, lusDesLunes, liste, jour],
  );
  const nbGraines = fiches.filter((c) => codeActifDe(c)).length;
  /** Relever N ne reprend rien ; le baisser après le lancement montre
      d'abord les Graines qu'il ferait. */
  const changeLeSeuil = (n: number) => {
    if (n === seuilGraine) { setSeuilPropose(null); return; }
    if (lunes.lanceLe && n < seuilGraine && grainesEnAttente(clients, lusDesLunes, liste, n, jour).length > 0) {
      setSeuilPropose(n);
      return;
    }
    douzeLunesStore.set((l) => ({ ...l, seuilGraine: n }));
    setSeuilPropose(null);
    toast('Enregistré.');
  };
  /* LES MEMBRES DU CERCLE : par leurs propres venues, ni prix convenu ni tête
     dépendante (la même règle que l'onglet Membres et Foyers). */
  const membresDuCercle = useMemo(
    () => fiches.filter((c) => !c.archived && !aUnPrixConvenu(c) && !estDependant(c, familles) && estDuCercle(venuesDeLAnnee(rdvs, c.id), seuilCercle)).length,
    [fiches, familles, rdvs, seuilCercle],
  );
  const sceauxTries = useMemo(() => [...sceaux].sort((a, b) => a.seuilXof - b.seuilXof), [sceaux]);
  const soins = useMemo(
    () => services.filter((s) => s && !(s as { archived?: boolean }).archived).sort((a, b) => a.name.localeCompare(b.name)),
    [services],
  );
  const nomDuSoin = (id?: string) => (id ? soins.find((s) => s.id === id)?.name : undefined);
  const part = chiffres.nouvelles ? Math.round((chiffres.parUneAmie / chiffres.nouvelles) * 100) : 0;
  const remise = reglage.remisePct ?? REMISE_PAR_DEFAUT;
  const validite = reglage.validiteMois ?? 6;
  /* LA REMISE DE BIENVENUE DE L'AMIE — 7 octobre 2026. Les familles
     d'entretien se cochent ici ; le site et le serveur lisent la même règle
     (`remiseDeBienvenue`). */
  const famillesBienvenue = reglage.remiseBienvenueFamilles ?? [];
  const pctBienvenue = reglage.remiseBienvenuePct ?? REMISE_BIENVENUE_PCT;
  const arbre = useMemo(() => catsDansLOrdre(categories).filter((c) => !(c as { archived?: boolean }).archived), [categories]);
  const profondeur = (id: string): number => {
    let n = 0;
    let c = categories.find((x) => x.id === id);
    while (c?.parentId && n < 6) { n += 1; c = categories.find((x) => x.id === c!.parentId); }
    return n;
  };
  const familles2 = useMemo(() => categories.map((c) => ({ id: c.id, parentId: c.parentId })), [categories]);
  const soinsBienvenue = useMemo(
    () => prestationsDeBienvenue(services as never[], familles2, famillesBienvenue),
    [services, familles2, famillesBienvenue],
  );
  const remiseActive = !!remiseDeBienvenue(reglage, services as never[], familles2);
  const basculeFamille = (id: string) => {
    const suivantes = famillesBienvenue.includes(id) ? famillesBienvenue.filter((x) => x !== id) : [...famillesBienvenue, id];
    regle({ remiseBienvenueFamilles: suivantes }, 'Enregistré.');
  };

  const regle = (patch: Partial<ReglageParrainage>, dit = 'Enregistré.') => {
    parrainageStore.set((r) => ({ ...r, ...patch }));
    toast(dit);
  };
  /* LE REMERCIEMENT WHATSAPP (9 octobre 2026) : avant le lancement, celui de
     l'ancien programme ; ensuite, celui de De main en main, dans
     `mnd_douze_lunes` (le geste éteint l'ancien, pour qu'un vieux poste
     resté ouvert n'envoie plus rien). */
  const merciAllume = lunes.lanceLe ? lunes.merciParWhatsApp === true : !!reglage.merciParWhatsApp;
  const basculeLeMerci = () => {
    const dit = merciAllume ? 'Remerciement éteint.' : 'Remerciement allumé.';
    if (lunes.lanceLe) { douzeLunesStore.set((l) => ({ ...l, merciParWhatsApp: !merciAllume })); toast(dit); }
    else regle({ merciParWhatsApp: !merciAllume }, dit);
  };
  const choixDuSoin = (valeur: string | undefined, onChange: (id: string | undefined) => void, vide = 'Aucun', etiquette = 'Le soin') => (
    <select className="mnd-input" aria-label={etiquette} value={valeur ?? ''} onChange={(e) => onChange(e.target.value || undefined)}>
      <option value="">{vide}</option>
      {soins.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
    </select>
  );
  const pourcent = (valeur: number, defaut: number, cle: 'remisePct', etiquette: string) => (
    <span className="amb-suffixe">
      <input key={`${cle}-${valeur}`} className="mnd-input" type="number" min={1} max={REMISE_MAX} defaultValue={valeur} aria-label={etiquette}
        onBlur={(e) => { const n = borne(e.target.value, 1, REMISE_MAX, defaut); if (n !== valeur) regle({ [cle]: n }); e.target.value = String(n); }} />
      <span>%</span>
    </span>
  );
  const resumes: Record<IdReglage, string> = {
    graine: `${seuilGraine} visite${seuilGraine > 1 ? 's' : ''} depuis janvier 2026 · ${lunes.lanceLe ? `${nbGraines} Graine${nbGraines > 1 ? 's' : ''}` : 'pas encore lancé'}`,
    cercle: `${seuilCercle} venues sur 12 mois · ni prix convenu, ni tête dépendante`,
    foyer: sceauxTries.length
      ? `${sceauxTries.length} sceau${sceauxTries.length > 1 ? 'x' : ''} · dès ${fmtMoney(sceauxTries[0].seuilXof, currency)} cumulés · offerts à la caisse`
      : 'Aucun sceau : la maisonnée n’a pas encore de palier',
    recompenses: `${nomDuSoin(reglage.soinMarraineServiceId) ?? 'Soin à choisir'} ou −${remise} % produit · ${validite} mois`,
    site: `${reglage.actif ? 'Parrainage ouvert' : 'Parrainage en pause'} · remerciement WhatsApp ${merciAllume ? 'allumé' : 'éteint'}`,
    bienvenue: remiseActive
      ? `−${pctBienvenue} % · ${famillesBienvenue.length} famille${famillesBienvenue.length > 1 ? 's' : ''} d’entretien · ${soinsBienvenue.length} soin${soinsBienvenue.length > 1 ? 's' : ''}`
      : 'Aucune famille cochée : pas de remise, la phrase du cadeau reste',
  };

  return (
    <div className="tr-page amb">
      {!dansLeCercle && (
        <PageHead
          eyebrow="Marketing & Fidélité"
          title="Les ambassadrices"
          sub="De main en main : la carte se gagne au fil des visites, puis chaque amie venue vaut un merci. Jamais d’argent."
        />
      )}

      {/* DE MAIN EN MAIN (9 octobre 2026) : le lancement, pour la direction. */}
      {direction && !lunes.lanceLe && (
        <section className="amb-bandeau" aria-labelledby="amb-lancement">
          <div className="amb-bandeau__texte">
            <h3 className="amb-carte__titre" id="amb-lancement">De main en main attend son lancement</h3>
            <p className="amb-muet">
              La carte se gagnera à la {seuilGraine}ᵉ visite depuis janvier 2026. Le geste éteint les anciennes cartes, range les récompenses
              de l’ancien programme (chaque fiche les garde dans son archive) et pose les premières Graines, sur la liste que vous verrez.
              {lunes.annuleLe ? ` Dernier retour en arrière : le ${dateLongue(lunes.annuleLe)}.` : ''}
            </p>
          </div>
          <Button variant="copper" onClick={() => setLancement(true)}>Lancer De main en main</Button>
        </section>
      )}
      {direction && lunes.lanceLe && (
        <div className="amb-actions">
          <span className="amb-muet">De main en main est lancé depuis le {dateLongue(lunes.lanceLe)}.</span>
          <button type="button" className="tre-chip" onClick={() => setLancement(true)}>Le lancement</button>
        </div>
      )}
      {lunes.lanceLe && enAttenteDAccord.length > PLAFOND_SANS_MAIN && (
        <section className="amb-bandeau" aria-labelledby="amb-accord">
          <div className="amb-bandeau__texte">
            <h3 className="amb-carte__titre" id="amb-accord">{enAttenteDAccord.length} Graines attendent votre accord</h3>
            <p className="amb-muet">Plus de {PLAFOND_SANS_MAIN} d’un coup : le Trône ne les pose pas seul. Relisez la liste ; la ligne dit les mercis qu’elles libèrent.</p>
          </div>
          <AccordDesGraines graines={enAttenteDAccord} seuil={seuilGraine} direction={direction} />
        </section>
      )}
      {lancement && <LancementDesDouzeLunes onClose={() => setLancement(false)} />}

      <section className="amb-chiffres" aria-label="Les chiffres du mois">
        <div className="amb-chiffre amb-chiffre--fort">
          <span className="amb-chiffre__label">Nouvelles clientes · {moisDit(aujourdhui.slice(0, 7))}</span>
          <span className="amb-chiffre__nombre">{chiffres.nouvelles}</span>
          <span className="amb-chiffre__dit">dont {chiffres.parUneAmie} venue{chiffres.parUneAmie > 1 ? 's' : ''} par une amie</span>
        </div>
        <div className="amb-chiffre">
          <span className="amb-chiffre__label">Part du bouche à oreille</span>
          <span className="amb-chiffre__nombre">{part} %</span>
          <div className="amb-jauge" aria-hidden="true"><span style={{ width: `${part}%` }} /></div>
        </div>
        <div className="amb-chiffre">
          <span className="amb-chiffre__label">Récompenses à utiliser</span>
          <span className="amb-chiffre__nombre">{enAttente}</span>
          <span className="amb-chiffre__dit">soins et remises en attente</span>
        </div>
        <div className="amb-chiffre">
          <span className="amb-chiffre__label">Membres du Cercle</span>
          <span className="amb-chiffre__nombre">{membresDuCercle}</span>
          <span className="amb-chiffre__dit">dont {actives} ambassadrice{actives > 1 ? 's' : ''} active{actives > 1 ? 's' : ''}</span>
        </div>
      </section>

      <div className="amb-grille">
        <section className="amb-carte" aria-labelledby="amb-classement">
          <div className="amb-carte__tete">
            <h3 className="amb-carte__titre" id="amb-classement">Le classement du mois</h3>
          </div>
          {classement.lignes.length === 0 ? (
            <div className="amb-vide">
              <span className="amb-vide__rond" aria-hidden="true"><img src={asset('/assets/vectoriel/pictogramme-cuivre.svg')} alt="" width={28} height={23} /></span>
              <p className="amb-muet">Personne encore. Dès qu’une amie vient grâce à une ambassadrice, elle paraît ici.</p>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="amb-table">
                <thead><tr><th>#</th><th>Ambassadrice</th><th>Rang</th><th>Ce mois</th><th>Amies</th></tr></thead>
                <tbody>
                  {classement.lignes.map((x, i) => (
                    <tr key={`${x.prenom}-${i}`}>
                      <td className="amb-table__rang">{i + 1}</td><td>{x.prenom}</td><td>{nomDuRang(x.rang)}</td><td>{x.ceMois}</td><td>{x.amies}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="amb-muet">Visible ici seulement : Ma Couronne ne montre plus de classement aux clientes.</p>
          <p className="amb-muet">Les rangs, pour les Graines seules, en amies venues :</p>
          <div className="amb-rangs" aria-label="Les rangs des Graines">
            {RANGS.map((r) => <span key={r.id} className="amb-rang">{r.nom}<b>{r.seuil}</b></span>)}
          </div>
        </section>

        <section className="amb-carte" aria-labelledby="amb-reglages">
          <div className="amb-carte__tete">
            <h3 className="amb-carte__titre" id="amb-reglages">Les réglages</h3>
          </div>
          <div className="amb-reglages">
            <Reglage id="graine" nom="La Graine" resume={resumes.graine} ouvert={ouvert === 'graine'} bascule={bascule}>
              <p className="amb-muet">
                La carte se gagne à la Maison : à sa {seuilGraine}ᵉ visite honorée depuis le 1er janvier 2026, une cliente devient Graine,
                et le Trône pose son code et sa carte. Un jour compte une fois. Relever ce nombre ne reprend rien à personne.
              </p>
              <Champ label="Visites pour la Graine" aide={direction ? 'Une visite : un jour où un rituel a été honoré' : 'Réglé par la direction'}>
                <span className="amb-suffixe">
                  <input key={`graine-${seuilGraine}-${seuilPropose ?? ''}`} className="mnd-input" type="number" min={SEUIL_GRAINE_MIN} max={SEUIL_GRAINE_MAX}
                    defaultValue={seuilPropose ?? seuilGraine} aria-label="Visites pour la Graine" disabled={!direction}
                    onBlur={(e) => { const n = borne(e.target.value, SEUIL_GRAINE_MIN, SEUIL_GRAINE_MAX, seuilGraine); e.target.value = String(n); changeLeSeuil(n); }} />
                  <span>visites</span>
                </span>
              </Champ>
              {seuilPropose !== null && (proposees.length > 0 ? (
                <>
                  <p className="amb-note">À {seuilPropose} visite{seuilPropose > 1 ? 's' : ''}, ces clientes deviennent Graine aussitôt. Rien n’est écrit avant votre accord.</p>
                  <AccordDesGraines graines={proposees} seuil={seuilGraine} nouveauSeuil={seuilPropose} direction={direction} onRenonce={() => setSeuilPropose(null)} />
                </>
              ) : (
                /* La liste s'est vidée entre-temps (le moteur, un autre poste) :
                   plus rien à accorder, le nombre s'écrit seul. */
                <div className="amb-actions">
                  <Button size="sm" variant="copper" onClick={() => changeLeSeuil(seuilPropose)}>Passer à {seuilPropose} visite{seuilPropose > 1 ? 's' : ''}</Button>
                  <Button size="sm" variant="ghost" onClick={() => setSeuilPropose(null)}>Garder {seuilGraine} visite{seuilGraine > 1 ? 's' : ''}</Button>
                </div>
              ))}
            </Reglage>

            <Reglage id="cercle" nom="L’entrée au Cercle" resume={resumes.cercle} ouvert={ouvert === 'cercle'} bascule={bascule}>
              <p className="amb-muet">On entre au Cercle par ses propres venues des douze derniers mois, et on y reste tant qu’on les garde. Un prix convenu et une tête dépendante sont reconnus autrement.</p>
              <Champ label="Venues sur 12 mois pour y être" aide="Une venue : un jour où un rituel a été honoré">
                <span className="amb-suffixe">
                  <input key={`seuil-${seuilCercle}`} className="mnd-input" type="number" min={1} max={20} defaultValue={seuilCercle} aria-label="Venue d’entrée au Cercle"
                    onBlur={(e) => { const n = borne(e.target.value, 1, 20, 3); if (n !== seuilCercle) { setSeuilCercle(n); toast('Enregistré.'); } e.target.value = String(n); }} />
                  <span>venues</span>
                </span>
              </Champ>
            </Reglage>

            <Reglage id="recompenses" nom="Les récompenses" resume={resumes.recompenses} ouvert={ouvert === 'recompenses'} bascule={bascule}>
              <p className="amb-muet">
                À chaque amie venue, sa Graine choisit l’une ou l’autre. Depuis De main en main, plus d’écho récompensé,
                plus de bonus de rang ni de défi du mois : une amie venue, un merci.
              </p>
              <Champ label="Le soin offert" aide="La caisse le passe à 100 %. Sans soin : la ligne choisie à la caisse">
                {choixDuSoin(reglage.soinMarraineServiceId, (id) => regle({ soinMarraineServiceId: id }), 'Aucun', 'Le soin offert')}
              </Champ>
              <Champ label="Ou une remise sur un produit" aide={`Jamais plus de ${REMISE_MAX} %`}>{pourcent(remise, REMISE_PAR_DEFAUT, 'remisePct', 'Remise sur un produit')}</Champ>
              <Champ label="Validité" aide="Ensuite, la récompense s’efface">
                <span className="amb-suffixe">
                  <input key={`validite-${validite}`} className="mnd-input" type="number" min={1} max={24} defaultValue={validite} aria-label="Validité en mois"
                    onBlur={(e) => { const n = borne(e.target.value, 1, 24, 6); if (n !== validite) regle({ validiteMois: n }); e.target.value = String(n); }} />
                  <span>mois</span>
                </span>
              </Champ>
            </Reglage>

            <Reglage id="foyer" nom="Les sceaux du Foyer" resume={resumes.foyer} ouvert={ouvert === 'foyer'} bascule={bascule}>
              <p className="amb-muet">La maisonnée franchit un sceau par sa dépense cumulée. Le soin se pose alors tout seul sur la fiche de celle qui règle le foyer, et la caisse l’offre.</p>
              <Champ label="Le premier palier, dit dans Ma Couronne" aide="Quand aucun sceau n’est encore défini">
                <span className="amb-suffixe">
                  <input key={`sf-${seuilFoyer}`} className="mnd-input" type="number" min={1} step={10000} defaultValue={seuilFoyer} aria-label="Palier du Foyer (F CFA)"
                    onBlur={(e) => { const n = borne(e.target.value, 1, 100000000, 300000); if (n !== seuilFoyer) { setSeuilFoyer(n); toast('Enregistré.'); } e.target.value = String(n); }} />
                  <span>F</span>
                </span>
              </Champ>
              {sceauxTries.map((t) => (
                <div key={t.id} className="amb-champ">
                  <span className="amb-suffixe">
                    <input key={`t-${t.id}-${t.seuilXof}`} className="mnd-input" type="number" min={1} step={10000} defaultValue={t.seuilXof} aria-label="Seuil du sceau (F CFA)"
                      onBlur={(e) => { const n = borne(e.target.value, 1, 100000000, t.seuilXof); if (n !== t.seuilXof) { setSceaux((prev) => prev.map((x) => (x.id === t.id ? { ...x, seuilXof: n } : x))); toast('Enregistré.'); } e.target.value = String(n); }} />
                    <span>F</span>
                  </span>
                  <span className="amb-actions" style={{ flexWrap: 'nowrap' }}>
                    {choixDuSoin(t.serviceId || undefined, (id) => { setSceaux((prev) => prev.map((x) => (x.id === t.id ? { ...x, serviceId: id ?? '' } : x))); toast('Enregistré.'); }, 'Soin à choisir', 'Soin du sceau')}
                    <button type="button" className="tre-chip" style={{ color: '#8f3b30', flex: 'none' }} onClick={() => { setSceaux((prev) => prev.filter((x) => x.id !== t.id)); toast('Sceau retiré.'); }}>Retirer</button>
                  </span>
                </div>
              ))}
              <div className="amb-actions">
                <Button size="sm" variant="ghost" onClick={() => {
                  const dernier = sceauxTries[sceauxTries.length - 1]?.seuilXof ?? 0;
                  setSceaux((prev) => [...prev, { id: `ftier-${uid()}`, seuilXof: dernier ? dernier + 200000 : seuilFoyer, serviceId: '', desc: '', g: '' }]);
                  toast('Sceau ajouté : choisissez son soin.');
                }}>+ Ajouter un sceau</Button>
              </div>
            </Reglage>

            <Reglage id="bienvenue" nom="La remise de bienvenue de l’amie" resume={resumes.bienvenue} ouvert={ouvert === 'bienvenue'} bascule={bascule}>
              <p className="amb-muet">
                L’amie qui ouvre le lien ou scanne la carte voit cette remise sur la page de réservation, prestation par prestation.
                Elle vaut à sa première visite, une seule fois, et ne se cumule pas : la meilleure remise s’applique.
                Elle remplace la phrase du cadeau de l’amie.
              </p>
              <Champ label="La remise" aide="En pour cent, 90 au plus">
                <span className="amb-suffixe">
                  <input key={`bv-${pctBienvenue}`} className="mnd-input" type="number" min={1} max={90} defaultValue={pctBienvenue} aria-label="La remise de bienvenue, en pour cent"
                    onBlur={(e) => { const n = borne(e.target.value, 1, 90, pctBienvenue); if (n !== pctBienvenue) regle({ remiseBienvenuePct: n }); e.target.value = String(n); }} />
                  <span>%</span>
                </span>
              </Champ>
              <Champ large label="Les familles d’entretien" aide={`Une famille cochée emporte ses sous-familles. Jamais un forfait ni un devis. ${soinsBienvenue.length} soin${soinsBienvenue.length > 1 ? 's' : ''} concerné${soinsBienvenue.length > 1 ? 's' : ''}.`}>
                <span className="amb-familles">
                  {arbre.map((c) => (
                    <label key={c.id} className="amb-famille" style={{ paddingLeft: profondeur(c.id) * 18 }}>
                      <input type="checkbox" checked={famillesBienvenue.includes(c.id)} onChange={() => basculeFamille(c.id)} />
                      <span>{c.fon}{c.label ? ` · ${c.label}` : ''}</span>
                    </label>
                  ))}
                </span>
              </Champ>
              {soinsBienvenue.length > 0 && (
                <p className="amb-muet">Concernés : {soinsBienvenue.map((id) => nomDuSoin(id) ?? id).join(' · ')}</p>
              )}
            </Reglage>

            <Reglage id="site" nom="Le site et les messages" resume={resumes.site} ouvert={ouvert === 'site'} bascule={bascule}>
              <div className="amb-actions">
                <Toggle on={reglage.actif} label={reglage.actif ? 'Parrainage ouvert' : 'Parrainage en pause'}
                  onToggle={() => regle({ actif: !reglage.actif }, reglage.actif ? 'Parrainage en pause : les codes des Graines n’ouvrent plus rien sur le site.' : 'Parrainage ouvert.')} />
              </div>
              <Champ large label="Le cadeau de bienvenue de l’amie" aide={remiseActive ? 'Remplacé par la remise de bienvenue tant qu’elle est réglée' : 'Dit tel quel sur le site'}>
                <input className="mnd-input" type="text" value={filleule} placeholder="un soin DÀNDÀN™ offert" onChange={(e) => setFilleule(e.target.value)} />
              </Champ>
              <Champ large label="Ce que gagne l’ambassadrice" aide="Dit tel quel sur le site">
                <input className="mnd-input" type="text" value={marraine} placeholder="un soin offert ou une remise, à son choix" onChange={(e) => setMarraine(e.target.value)} />
              </Champ>
              <div className="amb-actions">
                <Button variant="copper" size="sm" disabled={filleule.trim() === reglage.cadeauFilleule && marraine.trim() === reglage.cadeauMarraine}
                  onClick={() => regle({ cadeauFilleule: filleule.trim(), cadeauMarraine: marraine.trim() }, 'Phrases enregistrées.')}>Enregistrer les phrases</Button>
              </div>
              <div className="amb-actions">
                <Toggle on={merciAllume} label={merciAllume ? 'Remerciement allumé' : 'Remerciement éteint'} onToggle={basculeLeMerci} />
              </div>
              <p className="amb-muet">Le remerciement WhatsApp part avec sa carte à chaque amie venue depuis la Graine de sa marraine ; une amie venue avant vaut son merci, posé sans message. Allumez-le quand Meta a approuvé « parrainage_merci ».</p>
            </Reglage>
          </div>
        </section>
      </div>
    </div>
  );
}
