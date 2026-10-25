import { useCallback, useEffect, useState } from 'react';
import { asset } from '../../shared/asset';
import { payWithKkiapay } from '../../shared/kkiapay-widget';
import { TexteFon } from '../../ds/fon';
import { lisLeLien, regleLeLien, type PageDuLien } from '../../shared/regler-la-seance-serveur';

/* ══ RÉGLER SA SÉANCE — la page de la cliente (25 octobre 2026) ══════════
   Ouverte depuis le bouton « Régler » de son message (payer.html?tg=r-…).
   Elle ne sait que son jeton : la fonction `regler-la-seance` dit le juste
   reste, et c'est elle seule qui pose l'argent sur la pièce. Le retour du
   widget KkiaPay ne prouve rien ; la page le dit à la fonction, qui
   redemande à KkiaPay. Maquette : vue 10 du canvas du Tableau intelligent. */

const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
/** Toujours l'année sur une date que la cliente lit (règle de la Maison). */
const jourDit = (iso: string): string => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${parseInt(m[3], 10)} ${MOIS[parseInt(m[2], 10) - 1]} ${m[1]}` : iso;
};
const francs = (x: number): string => `${Math.round(x).toLocaleString('fr-FR').replace(/ | /g, ' ')} F`;
/** « la séance d'Awa », « la séance de Sena » : la page se lit aussi chez celle qui règle pour elle.
    L'élision devant une voyelle seulement (25 octobre 2026, « j'ai vu d'Yeman ») :
    « de Yéman », « de Hélène » plutôt qu'une élision fautive. */
const deLaCliente = (prenom: string): string => (!prenom ? '' : /^[aeiouàâäéèêëîïôöûü]/i.test(prenom) ? `d’${prenom}` : `de ${prenom}`);

/** Les montants du merci (sa liste du 25 octobre 2026), puis « Autre ». Aucun
    n'est choisi d'avance : le merci reste libre, et se retire d'un second toucher. */
const POURBOIRES = [500, 1000, 2000, 5000, 10000];
const POURBOIRE_MAX = 100000;
/* La devise, écrite ici : identite.ts emporterait la synchronisation de
   l'ERP dans une page de paiement ouverte sur un téléphone. Le banc
   verifie-regler-la-seance la compare à DEVISE_COMPLETE. */
const DEVISE = 'mi nyɔ́ ɖɛkpɛ, votre beauté est déjà là';

type Ecran =
  | { k: 'lecture' }
  | { k: 'erreur'; dit: string }
  | { k: 'page'; page: PageDuLien }
  | { k: 'paiement'; page: PageDuLien }
  | { k: 'reglee'; page: PageDuLien; paye?: number };

const jetonDeLAdresse = (): string => (new URLSearchParams(window.location.search).get('r') ?? '').trim();

export default function App() {
  const jeton = jetonDeLAdresse();
  const [ecran, setEcran] = useState<Ecran>({ k: 'lecture' });
  const [pourboire, setPourboire] = useState(0);
  const [autre, setAutre] = useState(false);
  const [saisie, setSaisie] = useState('');
  const [souci, setSouci] = useState('');
  const [partage, setPartage] = useState('');

  const lis = useCallback(async (essai = 0): Promise<void> => {
    if (!jeton) { setEcran({ k: 'erreur', dit: 'Ce lien est incomplet. Demandez-en un nouveau à la Maison.' }); return; }
    const r = await lisLeLien(jeton);
    if (!r.ok || !r.page) {
      setEcran({ k: 'erreur', dit: r.error === 'hors_ligne' || r.error === 'reseau' ? 'Pas de réseau pour l’instant. Réessayez dans un moment.' : 'La page ne répond pas. Réessayez dans un moment.' });
      return;
    }
    const p = r.page;
    /* Le rendez-vous vient d'être écrit au comptoir : il peut mettre quelques
       secondes à arriver. On relit trois fois avant de dire « introuvable ». */
    if ((p.etat === 'introuvable' || p.etat === 'sans-piece') && essai < 3) {
      window.setTimeout(() => { void lis(essai + 1); }, 2500);
      return;
    }
    if (p.etat === 'reglee') setEcran({ k: 'reglee', page: p });
    else if (p.etat === 'a-regler') setEcran({ k: 'page', page: p });
    else if (p.etat === 'annule') setEcran({ k: 'erreur', dit: 'Ce rendez-vous a été annulé : il n’y a rien à régler.' });
    else if (p.etat === 'sans-piece') setEcran({ k: 'erreur', dit: 'Votre facture n’est pas encore prête. Réessayez dans un instant.' });
    else setEcran({ k: 'erreur', dit: 'Ce lien n’est plus valable. Demandez-en un nouveau à la Maison.' });
  }, [jeton]);

  useEffect(() => { void lis(); }, [lis]);

  const regle = async (p: PageDuLien) => {
    setSouci('');
    setEcran({ k: 'paiement', page: p });
    const montant = p.resteXof + (p.pourboire ? pourboire : 0);
    let transactionId = '';
    try {
      transactionId = (await payWithKkiapay({ amountXof: montant, partnerId: p.reference, branchId: p.branchId })).transactionId;
    } catch (e) {
      setEcran({ k: 'page', page: p });
      setSouci(e instanceof Error ? e.message : 'Le paiement n’a pas abouti.');
      return;
    }
    const r = await regleLeLien(jeton, transactionId);
    if (r.ok) { setEcran({ k: 'reglee', page: { ...p, resteXof: 0 }, paye: montant }); return; }
    if (r.error === 'reseau' || r.error === 'hors_ligne') {
      /* L'argent est chez KkiaPay ; son filet préviendra la Maison. */
      setEcran({ k: 'reglee', page: { ...p, resteXof: 0 }, paye: montant });
      return;
    }
    setEcran({ k: 'page', page: p });
    setSouci(r.error === 'deja_reglee'
      ? 'Cette séance était déjà réglée : la Maison vous rendra ce paiement.'
      : 'Votre paiement est enregistré chez KkiaPay, la Maison le vérifie. Inutile de payer une seconde fois.');
  };

  const partager = async () => {
    const adresse = window.location.href;
    const mot = 'Peux-tu régler ma séance à la Maison MND ? Le lien :';
    try {
      if (navigator.share) { await navigator.share({ title: 'Maison MND', text: mot, url: adresse }); return; }
    } catch { /* fermé par elle : rien à dire */ return; }
    try {
      await navigator.clipboard.writeText(`${mot} ${adresse}`);
      setPartage('Lien copié : collez-le dans la conversation de votre choix.');
    } catch {
      setPartage(adresse);
    }
  };

  return (
    <main className="rg">
      <header className="rg-tete">
        <img className="rg-verrou" src={asset('assets/vectoriel/verrou-couche-indigo.svg')} alt="Maison MND" />
      </header>

      {ecran.k === 'lecture' && <p className="rg-doux rg-centre">Un instant, la Maison relit votre séance…</p>}

      {ecran.k === 'erreur' && <p className="rg-doux rg-centre">{ecran.dit}</p>}

      {(ecran.k === 'page' || ecran.k === 'paiement') && (() => {
        const p = ecran.page;
        const total = p.resteXof + (p.pourboire ? pourboire : 0);
        return (
          <section className="rg-bloc" aria-label="Régler la séance">
            <p className="rg-sur">Régler la séance</p>
            <h1 className="rg-titre">La séance {deLaCliente(p.prenom)}{p.jour ? `, ${jourDit(p.jour)}` : ''}.</h1>
            {p.maitre && <p className="rg-doux">Avec {p.maitre}.</p>}

            <div className="rg-lignes">
              {p.lignes.map((l, i) => (
                <div className="rg-ligne" key={i}><span>{l.label}</span><span>{francs(l.montantXof)}</span></div>
              ))}
              {p.recuXof > 0 && <div className="rg-ligne rg-doux"><span>Déjà reçu</span><span>− {francs(p.recuXof)}</span></div>}
              <div className="rg-ligne rg-fort"><span>Reste à régler</span><span>{francs(p.resteXof)}</span></div>
            </div>

            {p.pourboire && (
              <div className="rg-merci">
                <span className="rg-doux">Un merci pour l’équipe ?</span>
                <div className="rg-puces">
                  {POURBOIRES.map((x) => {
                    const on = !autre && pourboire === x;
                    return (
                      <button key={x} type="button" className={on ? 'rg-puce rg-puce--on' : 'rg-puce'} aria-pressed={on}
                        onClick={() => { setAutre(false); setSaisie(''); setPourboire(on ? 0 : x); }}>
                        {francs(x)}
                      </button>
                    );
                  })}
                  <button type="button" className={autre ? 'rg-puce rg-puce--on' : 'rg-puce'} aria-pressed={autre}
                    onClick={() => { const o = !autre; setAutre(o); setSaisie(''); setPourboire(0); }}>
                    Autre
                  </button>
                </div>
                {autre && (
                  <label className="rg-autre-montant">
                    <span className="rg-doux">Le montant de votre merci</span>
                    <span className="rg-champ">
                      <input inputMode="numeric" autoComplete="off" placeholder="Par exemple 3 000" value={saisie} autoFocus
                        onChange={(e) => {
                          const chiffres = e.target.value.replace(/\D/g, '').slice(0, 6);
                          const x = Math.min(POURBOIRE_MAX, Number(chiffres) || 0);
                          setSaisie(x ? x.toLocaleString('fr-FR').replace(/ | /g, ' ') : '');
                          setPourboire(x);
                        }} />
                      <span>F</span>
                    </span>
                  </label>
                )}
              </div>
            )}

            <button type="button" className="rg-regler" disabled={ecran.k === 'paiement'} onClick={() => { void regle(p); }}>
              {ecran.k === 'paiement' ? 'Paiement en cours…' : `Régler ${francs(total)}`}
            </button>
            <p className="rg-doux rg-petit rg-centre">MTN, Moov, Celtiis ou carte, par KkiaPay. Les frais de KkiaPay s’ajoutent au paiement (1,9 % Mobile Money, 4 % carte).</p>
            {souci && <p className="rg-souci" role="alert">{souci}</p>}

            {/* PLUS DE TAP & GO ICI — 25 octobre 2026 (« le Tap & Go n'est
                vraiment pas nécessaire sur cette page ») : KkiaPay prend déjà
                les trois réseaux et la carte ; deux boutons de paiement à deux
                montants faisaient douter. Tap & Go reste au comptoir. */}
            <button type="button" className="rg-autre" onClick={() => { void partager(); }}>Quelqu’un règle pour moi</button>
            <p className="rg-doux rg-petit rg-centre">Envoyez-lui ce lien : la personne voit la séance et le montant, jamais votre numéro.</p>
            {partage && <p className="rg-doux rg-petit rg-centre">{partage}</p>}
          </section>
        );
      })()}

      {ecran.k === 'reglee' && (
        <section className="rg-bloc" aria-label="Séance réglée">
          <p className="rg-sur">Régler la séance</p>
          <div className="rg-ok">
            <strong>{ecran.paye ? `Réglé, ${francs(ecran.paye)}.` : 'Déjà réglée.'}{ecran.page.prenom ? ` Merci, ${ecran.page.prenom}.` : ' Merci.'}</strong>
            <span>{ecran.paye ? 'Votre reçu arrive sur WhatsApp, la facture jointe.' : 'Il n’y a plus rien à régler pour cette séance.'}</span>
          </div>
        </section>
      )}

      <p className="rg-devise"><TexteFon texte={DEVISE} penche /></p>
    </main>
  );
}
