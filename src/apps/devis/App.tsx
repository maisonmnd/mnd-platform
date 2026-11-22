import { useCallback, useEffect, useMemo, useState } from 'react';
import { asset } from '../../shared/asset';
import { TexteFon } from '../../ds/fon';
import { SCEAU_CUIVRE } from '../../shared/le-sceau-pur';
import {
  accepteLeDevis, confirmeLaPlace, ditLeRefus, lisLeDevis, valideLeDevis, type PageDuDevis,
} from '../../shared/devis-en-direct-serveur';

/* ══ LE DEVIS EN DIRECT — la page de la cliente · 22 novembre 2026 ══════
   Maquette FCTFNSr748gq1ecEHxhDMj, lot 1. Ouverte depuis le bouton de son
   message (`payer.html?tg=d-<jeton>` → `devis.html?d=<jeton>`).
   Elle choisit UN modèle et ses options, valide, accepte, prend sa place.
   Trois boutons, à ses mots, un par page — et la page ne décide d'aucun
   montant : le total qu'elle voit bouger est la somme des prix que la
   Maison a envoyés, et c'est la fonction qui recalcule la pièce au
   « Valider » (passation mnd-passation-sceau-et-devis). */

const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const DEVISE = 'mi nyɔ́ ɖɛkpɛ, votre beauté est déjà là';

const francs = (x: number): string => `${Math.round(x).toLocaleString('fr-FR').replace(/ | /g, ' ')} F`;
const minutesDites = (t: number): string => {
  const m = Math.max(0, Math.round(t));
  const h = Math.floor(m / 60); const r = m % 60;
  if (!h) return r ? `${r} min` : '';
  return r ? `${h} h ${String(r).padStart(2, '0')}` : `${h} h`;
};
/** « samedi 19 décembre 2026 » — toujours l'année, comme la Maison l'écrit. */
function jourDit(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const j = Number(m[3]) === 1 ? '1er' : String(Number(m[3]));
  return `${JOURS[d.getDay()]} ${j} ${MOIS[Number(m[2]) - 1]} ${m[1]}`;
}
const courtDit = (iso: string): string => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return `${JOURS[d.getDay()].slice(0, 3)}. ${Number(m[3]) === 1 ? '1er' : Number(m[3])}`;
};

export default function App() {
  const jeton = (new URLSearchParams(window.location.search).get('d') ?? '').trim();
  const [page, setPage] = useState<PageDuDevis | null>(null);
  const [erreur, setErreur] = useState('');
  const [occupe, setOccupe] = useState(false);
  /* Ses choix, à l'écran, avant le « Valider ». */
  const [modele, setModele] = useState('');
  const [options, setOptions] = useState<string[]>([]);
  const [jour, setJour] = useState('');
  const [heure, setHeure] = useState('');

  const applique = useCallback((r: { ok?: boolean; page?: PageDuDevis; error?: string }) => {
    if (!r.ok || !r.page) { setErreur(ditLeRefus(r.error)); return false; }
    setErreur('');
    setPage(r.page);
    return true;
  }, []);

  useEffect(() => {
    if (!jeton) { setErreur(ditLeRefus('lien')); return; }
    void lisLeDevis(jeton).then(applique);
  }, [jeton, applique]);

  /* Le modèle conseillé est proposé d'avance ; ses options déjà prises
     reviennent telles quelles si elle revient sur la page. */
  useEffect(() => {
    if (!page || page.etat !== 'devis') return;
    setModele((m) => m || page.choisi || page.modele || page.modeles.find((x) => x.conseille)?.id || page.modeles[0]?.id || '');
    setOptions((o) => (o.length ? o : (page.prises ?? [])));
  }, [page]);

  const geste = async (envoi: () => Promise<{ ok?: boolean; page?: PageDuDevis; error?: string }>) => {
    if (occupe) return;
    setOccupe(true);
    applique(await envoi());
    setOccupe(false);
  };

  /* LE TOTAL QU'ELLE VOIT BOUGER : les prix reçus, la déduction, rien
     d'autre. La fonction les recalcule au « Valider ». */
  const p = page && page.etat !== 'introuvable' ? page : null;
  const total = useMemo(() => {
    if (!p || p.etat !== 'devis') return p?.totalXof ?? 0;
    const m = p.modeles.find((x) => x.id === (modele || p.modele));
    const choisis = p.options.filter((o) => o.etat === 'incluse' || options.includes(o.id));
    const brut = (m?.xof ?? 0) + choisis.reduce((s, o) => s + o.xof, 0);
    return Math.max(0, brut - (p.deductionXof ?? 0));
  }, [p, modele, options]);

  const duree = useMemo(() => {
    if (!p) return 0;
    if (p.etat !== 'devis') return p.dureeMin;
    const m = p.modeles.find((x) => x.id === (modele || p.modele));
    const choisis = p.options.filter((o) => o.etat === 'incluse' || options.includes(o.id));
    return (m?.dureeMin ?? 0) + choisis.reduce((s, o) => s + (o.dureeMin ?? 0), 0);
  }, [p, modele, options]);

  /* Les jours proposés, groupés ; puis les heures de celui qu'elle regarde. */
  const jours = useMemo(() => {
    const vus = new Map<string, string[]>();
    for (const x of p?.places ?? []) {
      if (!vus.has(x.jour)) vus.set(x.jour, []);
      vus.get(x.jour)!.push(x.heure);
    }
    return [...vus.entries()].map(([j, hs]) => ({ jour: j, heures: hs }));
  }, [p]);

  return (
    <main className="dv">
      <header className="dv-tete">
        <img className="dv-verrou" src={asset('assets/vectoriel/verrou-couche-indigo.svg')} alt="Maison MND" />
      </header>

      {!page && !erreur && <p className="dv-doux">Un instant, la Maison prépare votre devis…</p>}
      {erreur && <p className="dv-doux" role="alert">{erreur}</p>}

      {page && (page.etat === 'introuvable' || page.etat === 'brouillon') && (
        <section className="dv-bloc">
          <p className="dv-sur">Votre devis</p>
          <h1 className="dv-titre">{page.etat === 'brouillon' ? 'Votre devis se prépare encore.' : 'Ce devis n’est plus là.'}</h1>
          <p className="dv-doux">{page.etat === 'brouillon'
            ? 'La Maison le termine devant vous. Restez sur cette page : il s’ouvrira tout seul.'
            : 'Demandez-en un nouveau à la Maison, elle vous l’enverra.'}</p>
        </section>
      )}

      {page && page.etat === 'devis' && (
        <section className="dv-bloc" aria-label="Votre devis">
          <p className="dv-sur">Votre devis</p>
          <h1 className="dv-titre">{page.prenom ? `${page.prenom}, voici votre devis.` : 'Voici votre devis.'}</h1>
          <div className="dv-couronne">
            {page.locks ? <b>{page.locks} locks · {page.calibre}</b> : null}
            {page.longueur ? <span>{page.longueur}</span> : null}
          </div>

          <div className="dv-choix">
            <span className="dv-doux">Votre modèle</span>
            {page.modeles.map((m) => {
              const pris = m.id === (modele || page.modele);
              return (
                <button key={m.id} type="button" className={pris ? 'dv-carte-choix pris' : 'dv-carte-choix'} aria-pressed={pris}
                  onClick={() => setModele(m.id)}>
                  <span className="dv-rond" aria-hidden="true" />
                  <span>{m.nom}{m.conseille ? <em> conseillé</em> : null}{m.maison ? <small>{m.maison} · {minutesDites(m.dureeMin)}</small> : <small>{minutesDites(m.dureeMin)}</small>}</span>
                  <span className="num">{francs(m.xof)}</span>
                </button>
              );
            })}
          </div>

          {page.options.length > 0 && (
            <div className="dv-choix">
              <span className="dv-doux">Les options</span>
              {page.options.map((o) => {
                const incluse = o.etat === 'incluse';
                const pris = incluse || options.includes(o.id);
                return (
                  <button key={o.id} type="button" className={pris ? 'dv-carte-choix pris' : 'dv-carte-choix'} aria-pressed={pris}
                    disabled={incluse}
                    onClick={() => setOptions((v) => (v.includes(o.id) ? v.filter((x) => x !== o.id) : [...v, o.id]))}>
                    <span className="dv-case" aria-hidden="true" />
                    <span>{o.nom}{incluse ? <em> compris</em> : null}</span>
                    <span className="num">{incluse ? 'offert' : `+ ${francs(o.xof)}`}</span>
                  </button>
                );
              })}
            </div>
          )}

          {page.mot ? <p className="dv-remarque">La Maison : {page.mot}</p> : null}

          <div className="dv-lignes">
            {(page.deductionXof ?? 0) > 0 && (
              <div className="dv-ligne"><span>Consultation déjà réglée <em>déduite</em></span><span>− {francs(page.deductionXof ?? 0)}</span></div>
            )}
            <div className="dv-ligne fort"><span>Votre devis</span><span>{francs(total)}</span></div>
            {duree > 0 && <div className="dv-ligne dv-doux"><span>Durée</span><span>{minutesDites(duree)}</span></div>}
          </div>

          <p className="dv-direct"><i aria-hidden="true" />En direct avec la Maison</p>
          <button type="button" className="dv-oui" disabled={occupe || !modele}
            onClick={() => { void geste(() => valideLeDevis(jeton, modele, options)); }}>
            Valider
          </button>
          <p className="dv-doux dv-petit dv-centre">Rien n’est payé à cette étape. Vos choix se figent, et le devis se lit une dernière fois.</p>
        </section>
      )}

      {page && page.etat === 'valide' && (
        <section className="dv-bloc" aria-label="Votre devis accepté">
          <p className="dv-sur">Votre devis</p>
          <h1 className="dv-titre">Ce que vous avez retenu.</h1>
          <div className="dv-lignes">
            {page.modeles.filter((m) => m.id === (page.choisi ?? page.modele)).map((m) => (
              <div className="dv-ligne" key={m.id}><span>{m.nom}</span><span>{francs(m.xof)}</span></div>
            ))}
            {page.options.filter((o) => o.etat === 'incluse' || (page.prises ?? []).includes(o.id)).map((o) => (
              <div className="dv-ligne" key={o.id}><span>{o.nom}{o.etat === 'incluse' ? <em>compris</em> : null}</span><span>{o.etat === 'incluse' ? 'offert' : `+ ${francs(o.xof)}`}</span></div>
            ))}
            {(page.deductionXof ?? 0) > 0 && (
              <div className="dv-ligne"><span>Consultation déjà réglée <em>déduite</em></span><span>− {francs(page.deductionXof ?? 0)}</span></div>
            )}
            <div className="dv-ligne fort"><span>Total</span><span>{francs(page.totalXof)}</span></div>
            {page.dureeMin > 0 && <div className="dv-ligne dv-doux"><span>Durée</span><span>{minutesDites(page.dureeMin)}</span></div>}
          </div>
          <button type="button" className="dv-oui" disabled={occupe} onClick={() => { void geste(() => accepteLeDevis(jeton)); }}>
            Oui, j’accepte le devis
          </button>
        </section>
      )}

      {page && page.etat === 'accepte' && (
        <section className="dv-bloc" aria-label="Votre place">
          <p className="dv-sur">Votre place</p>
          <h1 className="dv-titre">Quand venez-vous ?</h1>
          <p className="dv-doux">Les jours et les heures que la Maison vous propose pour ce rituel{dureeReelle(page) ? ` (${minutesDites(dureeReelle(page))})` : ''}.</p>
          <div className="dv-cal">
            <div className="dv-jours">
              {jours.map((j) => (
                <button key={j.jour} type="button" className={jour === j.jour ? 'dv-jour pris' : 'dv-jour'}
                  aria-pressed={jour === j.jour} onClick={() => { setJour(j.jour); setHeure(''); }}>
                  {courtDit(j.jour)}
                </button>
              ))}
            </div>
            {jour && (
              <div className="dv-heures">
                {(jours.find((j) => j.jour === jour)?.heures ?? []).map((h) => (
                  <button key={h} type="button" className={heure === h ? 'dv-heure pris' : 'dv-heure'}
                    aria-pressed={heure === h} onClick={() => setHeure(h)}>{h}</button>
                ))}
              </div>
            )}
            {jour && <p className="dv-doux dv-petit">{jourDit(jour)}{heure ? `, ${heure}` : ''}</p>}
          </div>
          <button type="button" className="dv-oui" disabled={occupe || !jour || !heure}
            onClick={() => { void geste(() => confirmeLaPlace(jeton, jour, heure)); }}>
            Oui, je confirme ma place
          </button>
        </section>
      )}

      {page && page.etat === 'place' && (
        <section className="dv-bloc dv-final" aria-label="Votre rendez-vous">
          <img className="dv-sceau" src={asset(SCEAU_CUIVRE)} alt="Le sceau cuivre de la Maison MND" />
          <h2 className="dv-merci">Merci.</h2>
          <p className="dv-signe">Maison MND</p>
          {page.place && (
            <p className="dv-doux"><b>{jourDit(page.place.jour)}, {page.place.heure}</b><br />
              {page.modeles.find((m) => m.id === (page.choisi ?? page.modele))?.nom ?? ''}
              {page.totalXof > 0 ? ` · ${francs(page.totalXof)}` : ''}
            </p>
          )}
          <p className="dv-doux dv-petit">Votre place est tenue. La Maison vous écrit pour la suite, et le rendez-vous vous arrive sur WhatsApp.</p>
        </section>
      )}

      <p className="dv-devise"><TexteFon texte={DEVISE} penche /></p>
    </main>
  );
}

/** La durée d'un devis déjà accepté (elle est dans la page, en minutes). */
function dureeReelle(p: PageDuDevis): number {
  return 'dureeMin' in p ? Number((p as { dureeMin?: number }).dureeMin) || 0 : 0;
}
