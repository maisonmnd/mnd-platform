import { useEffect, useMemo, useRef, useState } from 'react';
import { OptionsPrestations, PageHead } from '../_ui';
import { Button, Input, Select, demande, toast } from '../../../../ds/components';
import { useBranch } from '../../../../shared/branches';
import { fmtMoney } from '../../../../shared/currency';
import { useServices, type Service } from '../../../../shared/catalog';
import { useStaff } from '../../../../shared/auth';
import { uid } from '../../../../shared/store';
import { useBesoins, prixDAppelDe, etatDe } from '../../../../shared/besoins';
import { useEstDirection } from '../_vie';
import {
  AUCUNE_PREUVE, PALIERS_DITS, POINTS_PERMIS, SENS_DES_POINTS, defautsDes, palierDe, qualifie,
  type Besoin, type Palier, type Preuves, type Qualification, type ReglagesDesBesoins,
} from '../../../../shared/besoins-pur';
import '../vente/vente.css';
import './besoins.css';

/* ══ BESOINS ET RÈGLES — 13 novembre 2026 (la Consultation, lot 1) ═════════
   « Et si je veux rajouter des besoins ? Comment j'attribue un besoin à un
   service ? » (Yéman). Ici : on ajoute un besoin avec les mots de la cliente,
   on lui donne ses points et ses prestations, et l'aperçu dit tout de suite
   ce qu'il fait proposer. Le même lien se pose aussi depuis le Catalogue
   (fiche technique d'une prestation) : c'est un seul lien, lu des deux côtés.

   « Essayer » rejoue le calcul de la consultation sur des besoins cochés à la
   main. « Seuils et preuves » règle les paliers. Tout s'écrit dans le
   document `mnd_besoins`, signé (qui, quand). */

type Onglet = 'besoins' | 'essayer' | 'seuils';
const vide = (famille: string): Besoin => ({ id: '', famille, mots: '', points: 10, prestations: [] });
const plie = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export default function BesoinsEtRegles() {
  const { currency } = useBranch();
  const [services] = useServices();
  const moi = useStaff();
  const [r, ecris] = useBesoins();
  /* SEULE LA DIRECTION ÉCRIT LES BESOINS — 0208 (13 novembre 2026). L'écran le
     dit au lieu de laisser la base refuser sans bruit. */
  const estDirection = useEstDirection();
  const [onglet, setOnglet] = useState<Onglet>('besoins');
  const [edite, setEdite] = useState<Besoin | null>(null);
  const [famille, setFamille] = useState<string>('toutes');
  const [cherche, setCherche] = useState('');

  const vendables = useMemo(() => services.filter((s) => !s.archived), [services]);
  const parId = useMemo(() => new Map(services.map((s) => [s.id, s])), [services]);
  const prixDe = useMemo(() => prixDAppelDe(services), [services]);
  const defauts = useMemo(() => defautsDes(r, etatDe(services)), [r, services]);
  const aRelier = r.besoins.filter((b) => b.prestations.length === 0).length;
  const par = moi?.name ?? undefined;

  const nomDe = (id: string) => parId.get(id)?.name ?? 'prestation introuvable';
  const prixDit = (id: string) => {
    const p = prixDe(id);
    return p === undefined ? 'prix au comptage ou au forfait' : fmtMoney(p, currency);
  };

  const enregistre = () => {
    if (!edite) return;
    const mots = edite.mots.trim();
    if (!mots) { toast('Écrivez le besoin avec les mots de la cliente.'); return; }
    const neuf = !edite.id;
    const b: Besoin = { ...edite, mots, id: edite.id || `bs-${uid()}` };
    ecris((d) => ({ ...d, besoins: neuf ? [...d.besoins, b] : d.besoins.map((x) => (x.id === b.id ? b : x)) }), par);
    setEdite(null);
    toast(neuf ? 'Besoin ajouté.' : 'Besoin enregistré.');
  };
  const supprime = async () => {
    if (!edite?.id) return;
    const ok = await demande({
      quoi: 'Un besoin', titre: `Retirer « ${edite.mots} » ?`,
      dit: 'Il ne sera plus proposé aux clientes. Les prestations ne changent pas.',
      accepter: 'Retirer le besoin', refuser: 'Le garder',
    });
    if (!ok) return;
    const id = edite.id;
    ecris((d) => ({ ...d, besoins: d.besoins.filter((x) => x.id !== id) }), par);
    setEdite(null);
    toast('Besoin retiré.');
  };

  const visibles = r.besoins.filter((b) => {
    if (famille === 'a-relier') return b.prestations.length === 0;
    if (famille !== 'toutes' && b.famille !== famille) return false;
    if (!cherche) return true;
    const q = plie(cherche);
    return plie(b.mots).includes(q) || b.prestations.some((s) => plie(nomDe(s)).includes(q));
  });

  return (
    <div className="mnd-rise tbs">
      <PageHead
        eyebrow="Système · la consultation"
        title="Besoins et règles."
        sub="Ce que la cliente peut dire, et ce que la Maison lui propose en retour."
        actions={estDirection ? <Button onClick={() => { setOnglet('besoins'); setEdite(vide(famille !== 'toutes' && famille !== 'a-relier' ? famille : r.familles[0]?.id ?? '')); }}>+ Nouveau besoin</Button> : undefined}
      />

      <div className="trv-tabs" role="tablist">
        <button role="tab" aria-selected={onglet === 'besoins'} className={`trv-tab ${onglet === 'besoins' ? 'is-active' : ''}`} onClick={() => setOnglet('besoins')}>Les besoins <span className="trv-tab__n">{r.besoins.length}</span></button>
        <button role="tab" aria-selected={onglet === 'essayer'} className={`trv-tab ${onglet === 'essayer' ? 'is-active' : ''}`} onClick={() => setOnglet('essayer')}>Essayer</button>
        <button role="tab" aria-selected={onglet === 'seuils'} className={`trv-tab ${onglet === 'seuils' ? 'is-active' : ''}`} onClick={() => setOnglet('seuils')}>Seuils et preuves</button>
      </div>

      {!estDirection && <p className="tbs-garde">Lecture seule : seule la direction modifie les besoins, leurs points et les seuils. « Essayer » reste ouvert.</p>}

      {r.modifieLe && (
        <p className="mnd-muted tbs-signe">
          Modifié le {new Date(r.modifieLe).toLocaleString('fr-FR', { dateStyle: 'long', timeStyle: 'short' })}{r.modifiePar ? ` par ${r.modifiePar}` : ''}.
        </p>
      )}

      {onglet === 'besoins' && (
        <>
          {edite && (
            <Editeur
              b={edite} r={r} services={vendables} currency={currency} prixDe={prixDe} nomDe={nomDe} prixDit={prixDit}
              onChange={setEdite} onEnregistre={enregistre} onAnnule={() => setEdite(null)} onSupprime={edite.id ? supprime : undefined}
            />
          )}

          {defauts.length > 0 && (
            <details className="tbs-defauts">
              <summary>{defauts.length} point{defauts.length > 1 ? 's' : ''} à regarder</summary>
              <ul>{defauts.slice(0, 30).map((d, i) => <li key={i}>{d.dit}</li>)}</ul>
            </details>
          )}

          <div className="tbs-filtres">
            <button type="button" aria-pressed={famille === 'toutes'} onClick={() => setFamille('toutes')}>Toutes</button>
            {r.familles.map((f) => {
              const n = r.besoins.filter((b) => b.famille === f.id).length;
              return <button key={f.id} type="button" aria-pressed={famille === f.id} onClick={() => setFamille(f.id)}>{f.nom} <span>{n}</span></button>;
            })}
            {aRelier > 0 && <button type="button" className="is-alerte" aria-pressed={famille === 'a-relier'} onClick={() => setFamille('a-relier')}>À relier <span>{aRelier}</span></button>}
          </div>
          <input className="mnd-input tbs-cherche" type="search" placeholder="Chercher un besoin ou une prestation…" value={cherche} onChange={(e) => setCherche(e.target.value)} aria-label="Chercher un besoin" />

          <div className="tbs-liste">
            {visibles.length === 0 && <div className="tbs-vide">Aucun besoin ici. « + Nouveau besoin » en ajoute un.</div>}
            {visibles.map((b) => {
              const f = r.familles.find((x) => x.id === b.famille);
              return (
                <button key={b.id} type="button" className={`tbs-besoin${edite?.id === b.id ? ' is-ouvert' : ''}`} onClick={() => { if (estDirection) setEdite({ ...b, prestations: [...b.prestations] }); }}>
                  <span className="tbs-besoin__mots">
                    {b.mots}
                    <small>
                      {f?.nom ?? 'famille inconnue'}
                      {b.garde === 'peau' && ' · garde médicale'}
                    </small>
                  </span>
                  <span className="tbs-besoin__prest">
                    {b.prestations.length === 0
                      ? <em>aucune prestation : à relier</em>
                      : b.prestations.map((s) => <span key={s} className={`tbs-puce${parId.get(s)?.archived ? ' is-archivee' : ''}`}>{nomDe(s).split(' · ')[0]}</span>)}
                  </span>
                  <span className="tbs-points">{b.points} pts</span>
                </button>
              );
            })}
          </div>
        </>
      )}

      {onglet === 'essayer' && <Essai r={r} nomDe={nomDe} prixDit={prixDit} prixDe={prixDe} />}

      {onglet === 'seuils' && (
        <fieldset disabled={!estDirection} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
        <Seuils r={r} services={vendables} currency={currency} nomDe={nomDe} prixDe={prixDe} ecris={(fn) => ecris(fn, par)} />
        </fieldset>
      )}
    </div>
  );
}

/* ── L'ÉDITEUR D'UN BESOIN ─────────────────────────────────────────────── */
function Editeur({ b, r, services, currency, prixDe, nomDe, prixDit, onChange, onEnregistre, onAnnule, onSupprime }: {
  b: Besoin; r: ReglagesDesBesoins; services: readonly Service[]; currency: string;
  prixDe: (id: string) => number | undefined; nomDe: (id: string) => string; prixDit: (id: string) => string;
  onChange: (b: Besoin) => void; onEnregistre: () => void; onAnnule: () => void; onSupprime?: () => void;
}) {
  /* L'APERÇU : ce besoin seul, sans preuve puis avec une photo. Il dit avant
     l'enregistrement si les points sont justes. */
  const essai: ReglagesDesBesoins = { ...r, besoins: [...r.besoins.filter((x) => x.id !== b.id), { ...b, id: b.id || '__apercu' }] };
  const id = b.id || '__apercu';
  const seul = qualifie(essai, [id], AUCUNE_PREUVE, prixDe);
  const photo = qualifie(essai, [id], { ...AUCUNE_PREUVE, photo: true }, prixDe);
  /* Ouvert depuis le bas de la liste, l'éditeur vient à l'œil. */
  const ref = useRef<HTMLElement>(null);
  useEffect(() => { ref.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }, [b.id]);
  return (
    <section ref={ref} className="tbs-editeur" aria-label={b.id ? 'Modifier un besoin' : 'Nouveau besoin'}>
      <div className="tbs-editeur__tete">
        <span className="tbs-lab">{b.id ? 'Modifier le besoin' : 'Nouveau besoin'}</span>
      </div>
      <label className="tbs-champ">
        <span className="tbs-lab">Les mots de la cliente</span>
        <Input autoFocus value={b.mots} placeholder="Mes locks sentent le chlore après la piscine" onChange={(e) => onChange({ ...b, mots: e.target.value })} />
      </label>
      <div className="tbs-deux">
        <label className="tbs-champ">
          <span className="tbs-lab">Famille</span>
          <Select value={b.famille} onChange={(e) => onChange({ ...b, famille: e.target.value })}>
            {r.familles.map((f) => <option key={f.id} value={f.id}>{f.nom}</option>)}
          </Select>
        </label>
        <div className="tbs-champ">
          <span className="tbs-lab">Points</span>
          <div className="tbs-points-choix" role="group" aria-label="Points du besoin">
            {POINTS_PERMIS.map((p) => (
              <button key={p} type="button" aria-pressed={b.points === p} onClick={() => onChange({ ...b, points: p })} title={SENS_DES_POINTS[p]}>{p}</button>
            ))}
          </div>
          <span className="mnd-muted tbs-aide">{SENS_DES_POINTS[b.points] ?? ''}</span>
        </div>
      </div>
      <div className="tbs-champ">
        <span className="tbs-lab">Les prestations qui y répondent</span>
        <div className="tbs-puces">
          {b.prestations.length === 0 && <span className="mnd-muted">Aucune pour l’instant.</span>}
          {b.prestations.map((s) => (
            <span key={s} className="tbs-puce tbs-puce--grande">
              {nomDe(s)} <small>{prixDit(s)}</small>
              <button type="button" aria-label={`Retirer ${nomDe(s)}`} onClick={() => onChange({ ...b, prestations: b.prestations.filter((x) => x !== s) })}>✕</button>
            </span>
          ))}
        </div>
        <select className="mnd-select tbs-ajout" value="" onChange={(e) => { const v = e.target.value; if (v) onChange({ ...b, prestations: [...b.prestations, v] }); }}>
          <option value="" disabled>+ Relier une prestation…</option>
          <OptionsPrestations services={services} exclure={(s) => b.prestations.includes(s.id)} prix devise={currency} />
        </select>
      </div>
      <label className="tbs-coche">
        <input type="checkbox" checked={b.garde === 'peau'} onChange={(e) => onChange({ ...b, garde: e.target.checked ? 'peau' : undefined })} />
        <span><b>Garde médicale</b> · plaques, psoriasis, peau à vif : écarte détox, décapant et décoloration tant que la Maison n’a pas vu le cuir chevelu.</span>
      </label>
      {b.prestations.length > 0 && (
        <div className="tbs-apercu">
          <span className="tbs-lab">Aperçu</span>
          <Apercu q={seul} nomDe={nomDe} titre="Seul, sans preuve" />
          <Apercu q={photo} nomDe={nomDe} titre="Avec une photo" />
        </div>
      )}
      <div className="tbs-actions">
        <Button onClick={onEnregistre}>{b.id ? 'Enregistrer' : 'Ajouter le besoin'}</Button>
        <Button variant="ghost" onClick={onAnnule}>Annuler</Button>
        {onSupprime && <button type="button" className="tbs-retirer" onClick={onSupprime}>Retirer ce besoin</button>}
      </div>
    </section>
  );
}

function Apercu({ q, nomDe, titre }: { q: Qualification; nomDe: (id: string) => string; titre: string }) {
  const ok = q.lignes.filter((l) => l.ok);
  const non = q.lignes.filter((l) => !l.ok);
  return (
    <p className="tbs-apercu__l">
      <b>{titre} :</b>{' '}
      {ok.length ? `propose ${ok.map((l) => nomDe(l.serviceId).split(' · ')[0]).join(', ')}.` : 'ne propose rien.'}
      {non.length > 0 && ` Attendent : ${non.map((l) => `${nomDe(l.serviceId).split(' · ')[0]} (${l.manques.join(', ')})`).join(' ; ')}.`}
    </p>
  );
}

/* ── ESSAYER : LE CALCUL DE LA CONSULTATION, À LA MAIN ───────────────── */
function Essai({ r, nomDe, prixDit, prixDe }: { r: ReglagesDesBesoins; nomDe: (id: string) => string; prixDit: (id: string) => string; prixDe: (id: string) => number | undefined }) {
  const [choisis, setChoisis] = useState<string[]>([]);
  const [preuves, setPreuves] = useState<Preuves>(AUCUNE_PREUVE);
  const [cherche, setCherche] = useState('');
  const q = qualifie(r, choisis, preuves, prixDe);
  const bascule = (id: string) => setChoisis((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]));
  const visibles = r.besoins.filter((b) => !cherche || plie(b.mots).includes(plie(cherche)));
  return (
    <div className="tbs-essai">
      <div className="tbs-essai__gauche">
        <input className="mnd-input tbs-cherche" type="search" placeholder="Chercher un besoin…" value={cherche} onChange={(e) => setCherche(e.target.value)} aria-label="Chercher un besoin à essayer" />
        <div className="tbs-liste tbs-liste--essai">
          {r.familles.map((f) => {
            const bs = visibles.filter((b) => b.famille === f.id);
            if (!bs.length) return null;
            return (
              <div key={f.id}>
                <div className="tbs-fam">{f.nom}</div>
                {bs.map((b) => (
                  <label key={b.id} className="tbs-coche tbs-coche--ligne">
                    <input type="checkbox" checked={choisis.includes(b.id)} onChange={() => bascule(b.id)} />
                    <span>{b.mots}</span>
                    <span className="tbs-points">{b.points} pts</span>
                  </label>
                ))}
              </div>
            );
          })}
        </div>
      </div>
      <div className="tbs-essai__droite">
        <div className="tbs-preuves">
          <span className="tbs-lab">Les preuves</span>
          <label className="tbs-coche"><input type="checkbox" checked={preuves.photo} onChange={(e) => setPreuves({ ...preuves, photo: e.target.checked })} /> Photos envoyées · {r.preuves.photo} points</label>
          <label className="tbs-coche"><input type="checkbox" checked={preuves.visio} onChange={(e) => setPreuves({ ...preuves, visio: e.target.checked })} /> Visio faite · {r.preuves.visio} points</label>
          <label className="tbs-coche"><input type="checkbox" checked={preuves.privee} onChange={(e) => setPreuves({ ...preuves, privee: e.target.checked })} /> Consultation privée faite · {r.preuves.privee} points</label>
        </div>
        <h3 className="tbs-titre">
          {choisis.length === 0 ? 'Cochez des besoins : les prestations qui y répondent apparaissent ici.' : `${q.proposees} prestation${q.proposees > 1 ? 's' : ''} proposée${q.proposees > 1 ? 's' : ''} sur ${q.lignes.length}`}
        </h3>
        {q.peau && <p className="tbs-garde"><b>Garde médicale.</b> La Maison ne pose pas de diagnostic médical : avis d’un dermatologue conseillé, lecture du cuir chevelu, lavage doux. Détox, décapant et décoloration sont écartés tant qu’elle n’a pas vu.</p>}
        {q.lignes.map((l) => (
          <div key={l.serviceId} className={`tbs-svc${l.ok ? ' is-ok' : ''}`}>
            <div className="tbs-svc__haut"><span className="tbs-svc__nom">{nomDe(l.serviceId)}</span><span className="mnd-muted">{prixDit(l.serviceId)}</span></div>
            <div className="tbs-svc__barre"><span style={{ width: `${Math.min(100, l.score)}%` }} />{l.seuil > 0 && <i style={{ left: `calc(${Math.min(100, l.seuil)}% - 1px)` }} />}</div>
            <div className="tbs-svc__bas">
              <span>{l.ok ? <b>Proposée</b> : <><b>Pas encore</b> · {l.manques.join(', ')}</>}</span>
              <span>palier {PALIERS_DITS[l.palier]}{l.sansSeuil ? ' · sans seuil' : ''} · {l.score} pts</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── SEUILS ET PREUVES ─────────────────────────────────────────────────── */
function Seuils({ r, services, currency, nomDe, prixDe, ecris }: {
  r: ReglagesDesBesoins; services: readonly Service[]; currency: string; nomDe: (id: string) => string;
  prixDe: (id: string) => number | undefined; ecris: (fn: (d: ReglagesDesBesoins) => ReglagesDesBesoins) => void;
}) {
  const n = (s: string) => Math.max(0, parseInt(s.replace(/[^\d]/g, ''), 10) || 0);
  const pose = (id: string, p: Palier | null) => ecris((d) => {
    const poses = { ...d.paliersPoses };
    if (p === null) delete poses[id]; else poses[id] = p;
    return { ...d, paliersPoses: poses };
  });
  const bornes = r.bornes;
  return (
    <div className="tbs-seuils">
      <section className="tbs-carte">
        <span className="tbs-lab">Les paliers et leurs seuils</span>
        <table className="tbs-table">
          <thead><tr><th>Palier</th><th>Prix</th><th>Points demandés</th><th>Et aussi</th></tr></thead>
          <tbody>
            {([0, 1, 2, 3] as Palier[]).map((p) => (
              <tr key={p}>
                <td><b>{PALIERS_DITS[p]}</b></td>
                <td>
                  {p === 0 && <>jusqu’à <input className="mnd-input tbs-nb" inputMode="numeric" value={bornes[0]} onChange={(e) => ecris((d) => ({ ...d, bornes: [n(e.target.value), d.bornes[1], d.bornes[2]] }))} /> F</>}
                  {p === 1 && <>jusqu’à <input className="mnd-input tbs-nb" inputMode="numeric" value={bornes[1]} onChange={(e) => ecris((d) => ({ ...d, bornes: [d.bornes[0], n(e.target.value), d.bornes[2]] }))} /> F</>}
                  {p === 2 && <>jusqu’à <input className="mnd-input tbs-nb" inputMode="numeric" value={bornes[2]} onChange={(e) => ecris((d) => ({ ...d, bornes: [d.bornes[0], d.bornes[1], n(e.target.value)] }))} /> F</>}
                  {p === 3 && <>au-delà de {fmtMoney(bornes[2], currency)}, ou prix inconnu</>}
                </td>
                <td><input className="mnd-input tbs-nb" inputMode="numeric" value={r.seuils[p]} onChange={(e) => ecris((d) => { const s = [...d.seuils] as ReglagesDesBesoins['seuils']; s[p] = n(e.target.value); return { ...d, seuils: s }; })} /></td>
                <td className="mnd-muted">{p === 2 ? 'une preuve : photo, visio ou consultation' : p === 3 ? 'la consultation privée faite' : '·'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="tbs-carte">
        <span className="tbs-lab">Ce que valent les preuves</span>
        <div className="tbs-trois">
          <label>Photos envoyées <input className="mnd-input tbs-nb" inputMode="numeric" value={r.preuves.photo} onChange={(e) => ecris((d) => ({ ...d, preuves: { ...d.preuves, photo: n(e.target.value) } }))} /> points</label>
          <label>Visio faite <input className="mnd-input tbs-nb" inputMode="numeric" value={r.preuves.visio} onChange={(e) => ecris((d) => ({ ...d, preuves: { ...d.preuves, visio: n(e.target.value) } }))} /> points</label>
          <label>Consultation privée <input className="mnd-input tbs-nb" inputMode="numeric" value={r.preuves.privee} onChange={(e) => ecris((d) => ({ ...d, preuves: { ...d.preuves, privee: n(e.target.value) } }))} /> points</label>
        </div>
      </section>

      <ListeDePrestations
        titre="Les prestations courantes, sans seuil de points" aide="Soins, lavages, finitions, coiffures : les points protègent les prestations lourdes, pas un soin."
        ids={r.sansSeuil} services={services} currency={currency} nomDe={nomDe}
        onChange={(ids) => ecris((d) => ({ ...d, sansSeuil: ids }))}
      />
      <ListeDePrestations
        titre="Ce que la garde médicale écarte" aide="Tant que la Maison n’a pas vu le cuir chevelu."
        ids={r.ecartesParLaPeau} services={services} currency={currency} nomDe={nomDe}
        onChange={(ids) => ecris((d) => ({ ...d, ecartesParLaPeau: ids }))}
      />

      <section className="tbs-carte">
        <span className="tbs-lab">Les paliers posés à la main</span>
        <p className="mnd-muted tbs-aide">Quand le prix ne dit pas le palier : une création au comptage, un forfait composé.</p>
        {Object.entries(r.paliersPoses).map(([id, p]) => (
          <div key={id} className="tbs-pose">
            <span>{nomDe(id)} <small className="mnd-muted">{prixDe(id) !== undefined ? fmtMoney(prixDe(id) as number, currency) : 'prix inconnu'} · sinon palier {PALIERS_DITS[palierDe({ bornes: r.bornes, paliersPoses: {} }, id, prixDe(id))]}</small></span>
            <Select value={String(p)} onChange={(e) => pose(id, Number(e.target.value) as Palier)}>
              {([0, 1, 2, 3] as Palier[]).map((x) => <option key={x} value={x}>Palier {PALIERS_DITS[x]}</option>)}
            </Select>
            <button type="button" className="tbs-retirer" onClick={() => pose(id, null)}>Retirer</button>
          </div>
        ))}
        <select className="mnd-select tbs-ajout" value="" onChange={(e) => { if (e.target.value) pose(e.target.value, 2); }}>
          <option value="" disabled>+ Poser le palier d’une prestation…</option>
          <OptionsPrestations services={services} exclure={(s) => s.id in r.paliersPoses} prix devise={currency} />
        </select>
      </section>
    </div>
  );
}

function ListeDePrestations({ titre, aide, ids, services, currency, nomDe, onChange }: {
  titre: string; aide: string; ids: string[]; services: readonly Service[]; currency: string; nomDe: (id: string) => string; onChange: (ids: string[]) => void;
}) {
  return (
    <section className="tbs-carte">
      <span className="tbs-lab">{titre}</span>
      <p className="mnd-muted tbs-aide">{aide}</p>
      <div className="tbs-puces">
        {ids.map((s) => (
          <span key={s} className="tbs-puce tbs-puce--grande">
            {nomDe(s)}
            <button type="button" aria-label={`Retirer ${nomDe(s)}`} onClick={() => onChange(ids.filter((x) => x !== s))}>✕</button>
          </span>
        ))}
      </div>
      <select className="mnd-select tbs-ajout" value="" onChange={(e) => { if (e.target.value) onChange([...ids, e.target.value]); }}>
        <option value="" disabled>+ Ajouter une prestation…</option>
        <OptionsPrestations services={services} exclure={(s) => ids.includes(s.id)} prix devise={currency} />
      </select>
    </section>
  );
}
