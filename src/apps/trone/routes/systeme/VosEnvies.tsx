import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { OptionsPrestations } from '../_ui';
import { Button, demande, toast } from '../../../../ds/components';
import { useBranch } from '../../../../shared/branches';
import { fmtMoney } from '../../../../shared/currency';
import { useCategories, useServices } from '../../../../shared/catalog';
import { useStaff } from '../../../../shared/auth';
import { uid, useStore } from '../../../../shared/store';
import { vitrineConfigStore } from '../../../../shared/bridges';
import { besoinsStore } from '../../../../shared/besoins';
import { useEnvies } from '../../../../shared/envies';
import { useBandSets, useModelBands } from '../../../../shared/pricing';
import { useSettings } from '../../../../shared/settings';
import { PRIX_DE_LA_CONSULTATION_PRIVEE_XOF } from '../../../../shared/estimation-pur';
import {
  GESTES_MAX, GROUPES, NOM_MAX, RAISON_HORS_LIGNE, REPONSES_D_ECART,
  ajouteUnEcart, ajouteUneEnvie, ajouteUnePaire, auDelaDUneJournee, basculeUnGroupe, basculeUnRendezVous, compteurs, etatEnLigne, insecable, nomRefuse, poseLesRituels,
  renommeUneEnvie, reponseDEcartDite, retireUnEcart, retireUneEnvie, retireUnePaire, tarifDesNaturels,
  type Envie, type Groupe, type ReglagesDesEnvies, type RendezVous, type ReponseDEcart,
} from '../../../../shared/envies-pur';

/* ══ VOS ENVIES — 17 novembre 2026 (la consultation en affiches) ══════════
   « Permets-moi de créer mes envies et de les associer en votre rituel ou la
   Maison regarde », puis « c'est plutôt 3 groupes : rituel, visio et/ou
   consultation privée », « crée des restrictions » (Yéman). Système › Besoins
   et règles › Vos envies, direction seule.

   ICI : créer, renommer, retirer une envie ; la ranger dans son groupe
   (Rituel, avec son ou ses rituels du catalogue ; Visio ; Consultation
   privée) ; les restrictions ; et les deux parcours à part (sans locks
   encore, des locks à défaire). Tout s'écrit dans le document `mnd_envies`,
   signé (qui, quand) ; le site le lit et suit, sans redéploiement.

   CE QUE L'ÉCRAN DIT TOUT DE SUITE : une envie en Rituel sans rituel
   (« rituel à choisir »), ou dont le rituel ne se réserve pas en ligne (la
   règle du serveur, `etatEnLigne`). Sur le site, elle se comporte alors comme
   une Visio : la Maison regarde d'abord. */

const DIT_DU_GROUPE: Readonly<Record<Groupe, string>> = { rituel: 'réservé de suite', visio: 'gratuite', privee: '' };
const court = (nom: string): string => nom.split(' · ')[0];

/** Un nom qui ne s'écrit sur le site qu'une fois fini : au sortir de la case, ou à Entrée. */
function Nom({ valeur, refuse, surPose }: { valeur: string; refuse: (nom: string) => 'vide' | 'pris' | null; surPose: (nom: string) => void }) {
  const [v, setV] = useState(valeur);
  useEffect(() => { setV(valeur); }, [valeur]);
  const pose = () => {
    const n = v.trim();
    if (n === valeur) { setV(valeur); return; }
    const pb = refuse(n);
    if (pb) { toast(pb === 'vide' ? 'Une envie porte un nom.' : 'Une autre envie porte déjà ce nom.'); setV(valeur); return; }
    surPose(n);
  };
  return (
    <input className="mnd-input tev-nom" value={v} maxLength={NOM_MAX} aria-label="Le nom de l’envie" autoComplete="off"
      onChange={(e) => setV(e.target.value)} onBlur={pose}
      onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
  );
}

/** Un nombre entier, posé au sortir de la case : une case vidée ne s'écrit pas. */
function Entier({ valeur, label, classe, surPose }: { valeur: number; label: string; classe?: string; surPose: (n: number) => void }) {
  const [v, setV] = useState(String(valeur));
  useEffect(() => { setV(String(valeur)); }, [valeur]);
  const pose = () => {
    const n = parseInt(v.replace(/\D/g, ''), 10);
    if (!(n > 0)) { setV(String(valeur)); return; }
    if (n !== valeur) surPose(n);
  };
  return (
    <input className={`mnd-input tbs-nb${classe ? ` ${classe}` : ''}`} inputMode="numeric" value={v} aria-label={label} autoComplete="off"
      onChange={(e) => setV(e.target.value.replace(/\D/g, ''))} onBlur={pose}
      onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
  );
}

/** Visio et/ou Consultation privée : le rendez-vous d'un parcours à part. */
function Portes({ rdv, label, surBascule }: { rdv: RendezVous[]; label: string; surBascule: (g: RendezVous) => void }) {
  return (
    <span className="tev-modes" role="group" aria-label={label}>
      {GROUPES.filter((g): g is { id: RendezVous; nom: string } => g.id !== 'rituel').map((g) => (
        <button key={g.id} type="button" aria-pressed={rdv.includes(g.id)} onClick={() => surBascule(g.id)}>{g.nom}</button>
      ))}
    </span>
  );
}

export function VosEnvies({ estDirection }: { estDirection: boolean }) {
  const { currency } = useBranch();
  const [services] = useServices();
  const [cats] = useCategories();
  const [vitrine] = useStore(vitrineConfigStore);
  const [besoins] = useStore(besoinsStore);
  const [bandes] = useModelBands();
  const [jeux] = useBandSets();
  const [reglages] = useSettings();
  const moi = useStaff();
  const [r, ecris] = useEnvies();
  const par = moi?.name ?? undefined;
  const [neuve, setNeuve] = useState('');
  const [de, setDe] = useState('');
  const [avec, setAvec] = useState('');

  const vendables = useMemo(() => services.filter((s) => !s.archived), [services]);
  const parId = useMemo(() => new Map(services.map((s) => [s.id, s])), [services]);
  const nomDe = (id: string) => parId.get(id)?.name ?? 'prestation introuvable';
  /** Le sujet d'un signal : le nom court du rituel, ou « Ce rituel » quand il n'existe plus. */
  const sujet = (id: string) => (parId.get(id) ? court(nomDe(id)) : 'Ce rituel');
  const nomDeLEnvie = (id: string) => r.envies.find((e) => e.id === id)?.nom || 'envie sans nom';
  const etat = (id: string) => etatEnLigne(parId.get(id), cats, vitrine.siteMasques);
  const n = compteurs(r);
  /* Un prix ne se coupe jamais sur deux lignes. */
  const argent = (xof: number) => insecable(fmtMoney(xof, currency));
  const pose = (fn: (d: ReglagesDesEnvies) => ReglagesDesEnvies) => ecris(fn, par);

  const ajoute = (e: FormEvent) => {
    e.preventDefault();
    const pb = nomRefuse(r, neuve);
    if (pb) { toast(pb === 'vide' ? 'Écrivez le nom de l’envie, en un ou deux mots.' : 'Une envie porte déjà ce nom.'); return; }
    pose((d) => ajouteUneEnvie(d, neuve, `ev-${uid()}`));
    setNeuve('');
    toast('Envie ajoutée : choisissez son groupe et son rituel.');
  };
  const retire = async (e: Envie) => {
    const siens = Array.isArray(besoins?.besoins) ? besoins.besoins.filter((b) => b.famille === e.id).length : 0;
    const ok = await demande({
      quoi: 'Une envie', titre: `Retirer « ${e.nom || 'cette envie'} » ?`,
      dit: `Elle ne sera plus proposée sur le site, et ses restrictions tombent avec elle.${siens ? ` Ses ${siens} besoins restent dans « Les besoins », à ranger dans une autre envie.` : ''}`,
      accepter: 'Retirer l’envie', refuser: 'La garder',
    });
    if (!ok) return;
    pose((d) => retireUneEnvie(d, e.id));
    toast('Envie retirée.');
  };
  const restreint = (e: FormEvent) => {
    e.preventDefault();
    const a = de || `envie:${r.envies[0]?.id ?? ''}`;
    if (!avec) { toast('Choisissez l’envie qui ne va pas avec.'); return; }
    const id = a.slice(a.indexOf(':') + 1);
    const neuve = (d: ReglagesDesEnvies) => (a.startsWith('reponse:') ? ajouteUnEcart(d, id as ReponseDEcart, avec) : ajouteUnePaire(d, id, avec));
    if (neuve(r) === r) { toast(id === avec ? 'Choisissez deux envies différentes.' : 'Cette restriction existe déjà.'); return; }
    pose(neuve);
    setAvec('');
  };

  const libres = parId.get(r.defaire.rituel);
  const etatDesLibres = r.defaire.rituel ? etat(r.defaire.rituel) : null;
  /* Le Gbata se paie selon le nombre de locks (18 novembre 2026) : quand son
     rituel suit le modèle, sa durée aussi, et au-delà d'un nombre de locks il
     ne tient plus dans une journée : le site propose alors le rendez-vous. */
  const auDelaDesLibres = libres && libres.scalesWithModel === true
    ? auDelaDUneJournee([libres.id], services, { bandes, sets: jeux, categories: cats, suspendu: reglages.baremeSuspendu === true }, reglages.hours)
    : null;

  return (
    <div className="tev">
      <p className="mnd-muted tbs-aide">
        Créez, renommez, retirez. Rangez chaque envie dans son groupe ; Visio et Consultation privée vont ensemble ou seules, Rituel est seul. Le site suit.
      </p>
      {r.modifieLe && (
        <p className="mnd-muted tbs-signe">
          Modifié le {new Date(r.modifieLe).toLocaleString('fr-FR', { dateStyle: 'long', timeStyle: 'short' })}{r.modifiePar ? ` par ${r.modifiePar}` : ''}.
        </p>
      )}

      <div className="tev-groupes" role="group" aria-label="Les trois groupes">
        {GROUPES.map((g) => (
          <span key={g.id} className={`tev-groupe tev-groupe--${g.id}`}>
            <span>{g.nom}</span>
            <b>{n[g.id]}</b>
            <small>{g.id === 'privee' ? argent(PRIX_DE_LA_CONSULTATION_PRIVEE_XOF) : DIT_DU_GROUPE[g.id]}</small>
          </span>
        ))}
      </div>

      <fieldset disabled={!estDirection} className="tev-champs">
        <section className="tbs-carte" aria-label="Vos envies">
          {r.envies.length === 0 && <div className="tbs-vide">Aucune envie. Sur le site, la Maison regarde d’abord : visio ou consultation privée.</div>}
          {r.envies.map((e) => (
            <div className="tev-envie" key={e.id}>
              <div className="tev-envie__tete">
                <Nom valeur={e.nom} refuse={(nom) => nomRefuse(r, nom, e.id)} surPose={(nom) => pose((d) => renommeUneEnvie(d, e.id, nom))} />
                <span className="tev-modes" role="group" aria-label={`Le groupe de ${e.nom}`}>
                  {GROUPES.map((g) => (
                    <button key={g.id} type="button" aria-pressed={e.groupes.includes(g.id)} onClick={() => pose((d) => basculeUnGroupe(d, e.id, g.id))}>{g.nom}</button>
                  ))}
                </span>
                <button type="button" className="tbs-retirer" onClick={() => void retire(e)}>Retirer</button>
              </div>
              {e.groupes.includes('rituel') && (
                <div className="tev-rituels">
                  <div className="tbs-puces">
                    {e.rituels.length === 0 && <span className="tev-signal">Rituel à choisir. En attendant, le site propose la visio.</span>}
                    {e.rituels.map((s) => (
                      <span key={s} className={`tbs-puce tbs-puce--grande${parId.get(s)?.archived ? ' is-archivee' : ''}`}>
                        {nomDe(s)} <small>{parId.get(s) ? argent(parId.get(s)!.priceXof) : ''}</small>
                        <button type="button" aria-label={`Retirer ${nomDe(s)}`} onClick={() => pose((d) => poseLesRituels(d, e.id, e.rituels.filter((x) => x !== s)))}>×</button>
                      </span>
                    ))}
                  </div>
                  {e.rituels.filter((s) => etat(s) !== 'ok').map((s) => {
                    const x = etat(s);
                    return x === 'ok' ? null : <span key={s} className="tev-signal">{sujet(s)} {RAISON_HORS_LIGNE[x]} : pas de réservation en ligne. En attendant, le site propose la visio.</span>;
                  })}
                  {e.rituels.length < GESTES_MAX && (
                    <select className="mnd-select tbs-ajout" value="" aria-label={`Ajouter un rituel à ${e.nom}`}
                      onChange={(ev) => { const v = ev.target.value; if (v) pose((d) => poseLesRituels(d, e.id, [...e.rituels, v])); }}>
                      <option value="" disabled>{e.rituels.length ? '+ Un rituel de plus…' : '+ Son rituel…'}</option>
                      <OptionsPrestations services={vendables} exclure={(s) => e.rituels.includes(s.id)} prix devise={currency} />
                    </select>
                  )}
                </div>
              )}
            </div>
          ))}
          <form className="tev-ajout" onSubmit={ajoute}>
            <input className="mnd-input" value={neuve} maxLength={NOM_MAX} placeholder="Une nouvelle envie" aria-label="Le nom de la nouvelle envie" autoComplete="off" onChange={(e) => setNeuve(e.target.value)} />
            <Button size="sm" variant="ghost" type="submit">Ajouter</Button>
          </form>
        </section>

        <section className="tbs-carte">
          <span className="tbs-lab">Restrictions</span>
          <p className="mnd-muted tbs-aide">Deux envies qui ne se choisissent pas ensemble : la première touchée grise l’autre. Une réponse du début peut aussi écarter une envie : elle ne s’affiche pas.</p>
          {r.paires.map(([a, b]) => (
            <div className="tev-ligne" key={`${a}|${b}`}>
              <span><b>{nomDeLEnvie(a)}</b> <span className="mnd-muted">pas avec</span> <b>{nomDeLEnvie(b)}</b></span>
              <button type="button" className="tbs-retirer" onClick={() => pose((d) => retireUnePaire(d, a, b))}>Retirer</button>
            </div>
          ))}
          {r.ecarts.map((x) => (
            <div className="tev-ligne" key={`${x.reponse}|${x.envie}`}>
              <span><b>{reponseDEcartDite(x.reponse)}</b> <span className="mnd-muted">pas avec</span> <b>{nomDeLEnvie(x.envie)}</b></span>
              <button type="button" className="tbs-retirer" onClick={() => pose((d) => retireUnEcart(d, x.reponse, x.envie))}>Retirer</button>
            </div>
          ))}
          {r.envies.length > 0 && (
            <form className="tev-ajout" onSubmit={restreint}>
              <select className="mnd-select" aria-label="Une envie, ou une réponse du début" value={de || `envie:${r.envies[0].id}`} onChange={(e) => setDe(e.target.value)}>
                <optgroup label="Une envie">{r.envies.map((e) => <option key={e.id} value={`envie:${e.id}`}>{e.nom || 'envie sans nom'}</option>)}</optgroup>
                {/* L'état des locks (18 novembre 2026) : « Des locks en forme » écarte ce qui ne leur va pas (Créer, Réparer). */}
                <optgroup label="La première réponse, ou leur état">{REPONSES_D_ECART.map((id) => <option key={id} value={`reponse:${id}`}>{reponseDEcartDite(id)}</option>)}</optgroup>
              </select>
              <span className="mnd-muted">pas avec</span>
              <select className="mnd-select" aria-label="L’autre envie" value={avec} onChange={(e) => setAvec(e.target.value)}>
                <option value="" disabled>Une envie…</option>
                {r.envies.filter((e) => `envie:${e.id}` !== (de || `envie:${r.envies[0].id}`)).map((e) => <option key={e.id} value={e.id}>{e.nom || 'envie sans nom'}</option>)}
              </select>
              <Button size="sm" variant="ghost" type="submit">Ajouter</Button>
            </form>
          )}
        </section>

        <section className="tbs-carte">
          <span className="tbs-lab">Sans locks encore · le modèle</span>
          <p className="mnd-muted tbs-aide">Un parcours à part, sans envies : l’épaisseur, la longueur, ses cheveux ou des cheveux naturels en option, la durée. Puis la fiche de son modèle et son rendez-vous. Le prix du modèle ne se dit qu’au rendez-vous.</p>
          <div className="tev-ligne">
            <span><b>Son rendez-vous</b></span>
            <Portes rdv={r.modele.rdv} label="Le rendez-vous du modèle" surBascule={(g) => pose((d) => { const rdv = basculeUnRendezVous(d.modele.rdv, g); return rdv === d.modele.rdv ? d : { ...d, modele: { ...d.modele, rdv } }; })} />
          </div>
          <div className="tev-ligne">
            <span><b>Cheveux naturels</b> <span className="mnd-muted">en option</span></span>
            <span className="tev-tarif">
              <Entier valeur={r.modele.naturels.prixXof} label="Le prix d’un lot de cheveux naturels, en francs" surPose={(x) => pose((d) => ({ ...d, modele: { ...d.modele, naturels: { ...d.modele.naturels, prixXof: x } } }))} />
              <span className="mnd-muted">F les</span>
              <Entier valeur={r.modele.naturels.lot} classe="tev-lot" label="Le nombre de locks d’un lot" surPose={(x) => pose((d) => ({ ...d, modele: { ...d.modele, naturels: { ...d.modele.naturels, lot: x } } }))} />
              <span className="mnd-muted">locks</span>
            </span>
          </div>
          <p className="mnd-muted tbs-aide">Sur le site : « {tarifDesNaturels(argent(r.modele.naturels.prixXof), r.modele.naturels.lot)} ».</p>
        </section>

        <section className="tbs-carte">
          <span className="tbs-lab">Des locks à défaire</span>
          <p className="mnd-muted tbs-aide">Un parcours à part, sans envies : depuis quand, ses locks, comment, et ensuite.</p>
          <div className="tev-ligne">
            <span><b>Cheveux libres</b> <span className="mnd-muted">son rituel, réservé de suite</span></span>
            <select className="mnd-select tev-rituel-libre" aria-label="Le rituel de « Cheveux libres »" value={r.defaire.rituel}
              onChange={(e) => pose((d) => ({ ...d, defaire: { ...d.defaire, rituel: e.target.value } }))}>
              <option value="">Aucun rituel : le rendez-vous ci-dessous</option>
              {r.defaire.rituel && !vendables.some((s) => s.id === r.defaire.rituel) && <option value={r.defaire.rituel}>{nomDe(r.defaire.rituel)}</option>}
              <OptionsPrestations services={vendables} prix devise={currency} />
            </select>
          </div>
          {libres && (
            <p className="mnd-muted tbs-aide">
              {libres.scalesWithModel === true
                ? <>{argent(libres.priceXof)} au catalogue, suit le modèle : son prix et sa durée selon son nombre de locks, au barème de la Maison, dits « à partir de, confirmé au fauteuil ».{auDelaDesLibres !== null && <> {auDelaDesLibres > 0 ? `Au-delà de ${auDelaDesLibres} locks, il` : 'Il'} ne tient plus dans une journée : le site propose le rendez-vous ci-dessous.</>}</>
                : <>{argent(libres.priceXof)} au catalogue, pour toute tête : « suit le modèle » est éteint au Catalogue. Dit « à partir de, confirmé au fauteuil ».</>}
            </p>
          )}
          {etatDesLibres && etatDesLibres !== 'ok' && (
            <span className="tev-signal">{sujet(r.defaire.rituel)} {RAISON_HORS_LIGNE[etatDesLibres]} : pas de réservation en ligne. En attendant, « Cheveux libres » mène au rendez-vous ci-dessous.</span>
          )}
          <div className="tev-ligne">
            <span><b>Nouvelles locks</b> <span className="mnd-muted">son rendez-vous</span></span>
            <Portes rdv={r.defaire.rdv} label="Le rendez-vous avant de nouvelles locks" surBascule={(g) => pose((d) => { const rdv = basculeUnRendezVous(d.defaire.rdv, g); return rdv === d.defaire.rdv ? d : { ...d, defaire: { ...d.defaire, rdv } }; })} />
          </div>
        </section>
      </fieldset>
    </div>
  );
}
