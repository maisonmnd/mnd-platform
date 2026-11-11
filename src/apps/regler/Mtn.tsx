import { useCallback, useEffect, useRef, useState } from 'react';
import { asset } from '../../shared/asset';
import { TexteFon } from '../../ds/fon';
import { estUnNumeroMtn, msisdnDe } from '../../shared/collecte-mtn-pur';
import {
  ATTENTE_MTN_LECTURES, ATTENTE_MTN_MS, demandeAuComptoir, demandeParLeLien, laCollecteEstOuverte, retrouveAuComptoir, statutDeLaDemande,
  type RdvAuComptoir, type ReponseCollecte,
} from '../../shared/collecte-mtn-serveur';

/* ══ RÉGLER PAR MTN · 11 novembre 2026 ═══════════════════════════════════
   Maquette « Régler par MTN, QR » (AdAaYXGStQetsXHFkZzUW5), vue « Le
   téléphone de la cliente ». Deux portes, une même attente :
   · sur la page « Régler » de son rendez-vous (son lien), « Payer par MTN » ;
   · au comptoir, le QR fixe ouvre cette page (regler.html?comptoir) : elle
     tape son numéro MTN, la Maison retrouve SON rendez-vous du jour.
   La demande part de la Maison, au montant du serveur (le reste de sa
   pièce) ; elle valide sur son téléphone, avec son code secret ; la page
   relit MTN toutes les quatre secondes et ne dit « réglé » que sur la
   réponse de MTN. Aucun frais pour elle : la Maison garde ceux de MTN.
   Tant que la Maison n'a pas ouvert le règlement par MTN, rien ne paraît
   sur la page du lien, et le comptoir dit de régler à l'accueil. */

const francs = (x: number): string => `${Math.round(x).toLocaleString('fr-FR').replace(/ | /g, ' ')} F`;
const DEVISE = 'mi nyɔ́ ɖɛkpɛ, votre beauté est déjà là';
const MERCIS = [1000, 2000, 5000];
const MERCI_MAX = 100000;

/** Ce que la page dit d'un refus du serveur, en clair. */
const DIT: Record<string, string> = {
  fermee: 'Le règlement par MTN n’est pas encore ouvert. Réglez à l’accueil, ou par votre lien « Régler ».',
  indisponible: 'MTN ne répond pas pour l’instant. Réessayez dans un moment, ou réglez à l’accueil.',
  numero: 'Ce numéro ne se lit pas : dix chiffres, commençant par 01.',
  en_cours: 'Une demande MTN est déjà partie pour cette séance : validez-la sur votre téléphone (composez *880# si rien ne s’affiche), ou réessayez dans trois minutes.',
  deja_reglee: 'Cette séance est déjà réglée. Merci.',
  sans_piece: 'Votre montant n’est pas encore prêt : l’équipe le prépare. Réessayez dans un instant.',
  introuvable: 'Ce rendez-vous n’est plus là. Retapez votre numéro, ou demandez à l’accueil.',
  annule: 'Ce rendez-vous a été annulé : il n’y a rien à régler.',
  trop: 'Beaucoup de demandes d’un coup. Réessayez dans un instant.',
  reseau: 'Pas de réseau pour l’instant. Réessayez dans un moment.',
  hors_ligne: 'Pas de réseau pour l’instant. Réessayez dans un moment.',
};
const ditLErreur = (e?: string): string => DIT[e ?? ''] ?? 'La demande n’a pas pu partir. Réessayez, ou réglez à l’accueil.';

type Demande =
  | { k: 'repos' }
  | { k: 'envoi' }
  | { k: 'attente'; reference: string; montantXof: number }
  | { k: 'recu'; montantXof: number; honore: boolean }
  | { k: 'refuse'; raison: string }
  | { k: 'delai'; montantXof: number }
  | { k: 'erreur'; dit: string };

/** LA DEMANDE ET SON ATTENTE : la page relit MTN (par la fonction) toutes
    les quatre secondes, trois minutes au plus. */
function useDemandeMtn(): { d: Demande; lance: (envoi: () => Promise<ReponseCollecte>) => Promise<void>; remet: () => void } {
  const [d, setD] = useState<Demande>({ k: 'repos' });
  const vivant = useRef(true);
  useEffect(() => () => { vivant.current = false; }, []);
  const suis = useCallback(async (reference: string, montantXof: number) => {
    for (let i = 0; i < ATTENTE_MTN_LECTURES && vivant.current; i++) {
      await new Promise((r) => window.setTimeout(r, ATTENTE_MTN_MS));
      const s = await statutDeLaDemande(reference);
      if (!vivant.current) return;
      if (s.etat === 'recu') { setD({ k: 'recu', montantXof: s.montantXof ?? montantXof, honore: s.honore === true }); return; }
      if (s.etat === 'refuse') { setD({ k: 'refuse', raison: s.raison ?? 'MTN n’a pas dit pourquoi' }); return; }
    }
    if (vivant.current) setD({ k: 'delai', montantXof });
  }, []);
  const lance = useCallback(async (envoi: () => Promise<ReponseCollecte>) => {
    setD({ k: 'envoi' });
    const r = await envoi();
    if (!vivant.current) return;
    if (!r.ok || !r.reference) { setD({ k: 'erreur', dit: ditLErreur(r.erreur) }); return; }
    if (r.etat === 'refuse') { setD({ k: 'refuse', raison: r.raison ?? 'MTN n’a pas dit pourquoi' }); return; }
    if (r.etat === 'recu') { setD({ k: 'recu', montantXof: r.montantXof ?? 0, honore: r.honore === true }); return; }
    setD({ k: 'attente', reference: r.reference, montantXof: r.montantXof ?? 0 });
    void suis(r.reference, r.montantXof ?? 0);
  }, [suis]);
  return { d, lance, remet: () => setD({ k: 'repos' }) };
}

/** « Validez sur votre téléphone » : ce qu'elle voit pendant que MTN attend son code. */
function Attente({ montantXof }: { montantXof: number }) {
  return (
    <div className="rg-mtn-attente" aria-live="polite">
      <span className="rg-anneau" aria-hidden="true" />
      <p className="rg-mtn-titre">Validez sur votre téléphone</p>
      <p className="rg-doux">MTN vous envoie une demande de {francs(montantXof)} pour la Maison MND. Tapez votre code secret pour l’accepter.</p>
      <p className="rg-doux rg-petit">Rien ne s’affiche ? Composez *880# puis « Mes approbations ».</p>
    </div>
  );
}

/** Le champ du numéro MTN, et ce qu'il dit d'un numéro d'un autre réseau. */
function ChampDuNumero({ valeur, onChange, autoFocus }: { valeur: string; onChange: (v: string) => void; autoFocus?: boolean }) {
  const lu = msisdnDe(valeur);
  return (
    <label className="rg-autre-montant">
      <span className="rg-doux">Votre numéro MTN</span>
      <span className="rg-champ">
        <input inputMode="tel" autoComplete="tel" placeholder="01 …" value={valeur} autoFocus={autoFocus}
          onChange={(e) => onChange(e.target.value.replace(/[^\d+ ]/g, '').slice(0, 20))} />
      </span>
      {lu && !estUnNumeroMtn(lu) && <span className="rg-doux rg-petit">Ce numéro n’est pas chez MTN : Moov, Celtiis ou carte se règlent par KkiaPay.</span>}
    </label>
  );
}

/* ══ SUR LA PAGE DU LIEN ══════════════════════════════════════════════ */

/** « PAYER PAR MTN » sur la page « Régler » d'un rendez-vous : seulement
    une séance avec sa pièce (ni le foyer, ni le règlement d'avance, qui
    restent à KkiaPay), et seulement quand la Maison l'a ouvert. */
export function PayerParMtn({ jeton, totalXof, pourboireXof, onOccupe, onRegle }: {
  jeton: string; totalXof: number; pourboireXof: number;
  onOccupe: (occupe: boolean) => void; onRegle: (payeXof: number, honore: boolean) => void;
}) {
  const [ouverte, setOuverte] = useState(false);
  const [numero, setNumero] = useState('');
  const { d, lance, remet } = useDemandeMtn();
  useEffect(() => { let v = true; void laCollecteEstOuverte().then((o) => { if (v) setOuverte(o); }); return () => { v = false; }; }, []);
  const occupe = d.k === 'envoi' || d.k === 'attente';
  useEffect(() => { onOccupe(occupe); }, [occupe, onOccupe]);
  const dit = useRef(false);
  useEffect(() => {
    if (d.k !== 'recu' || dit.current) return;
    dit.current = true;
    onRegle(d.montantXof, d.honore);
  }, [d, onRegle]);
  if (!ouverte) return null;
  const lu = msisdnDe(numero);

  if (d.k === 'attente') return <Attente montantXof={d.montantXof} />;
  return (
    <div className="rg-mtn">
      <p className="rg-mtn-titre">Payer par MTN</p>
      <p className="rg-doux rg-petit">La demande arrive sur votre téléphone. Aucun frais pour vous.</p>
      <ChampDuNumero valeur={numero} onChange={setNumero} />
      <button type="button" className="rg-regler" disabled={!lu || !estUnNumeroMtn(lu) || d.k === 'envoi'}
        onClick={() => { void lance(() => demandeParLeLien(jeton, lu ?? '', pourboireXof)); }}>
        {d.k === 'envoi' ? 'Demande en cours…' : `Recevoir la demande MTN · ${francs(totalXof)}`}
      </button>
      {d.k === 'erreur' && <p className="rg-souci" role="alert">{d.dit}</p>}
      {d.k === 'refuse' && <p className="rg-souci" role="alert">MTN dit que la demande n’a pas abouti : {d.raison}. Vous pouvez recommencer, ou régler autrement.</p>}
      {d.k === 'delai' && (
        <p className="rg-souci" role="alert">Pas encore de réponse de MTN. Si vous avez validé, la Maison le verra ; sinon, recommencez. <button type="button" className="rg-lien" onClick={remet}>Recommencer</button></p>
      )}
      <p className="rg-ou" aria-hidden="true">ou</p>
    </div>
  );
}

/* ══ AU COMPTOIR, PAR LE QR ═══════════════════════════════════════════ */

export function Comptoir() {
  const [ouverte, setOuverte] = useState<boolean | null>(null);
  const [numero, setNumero] = useState('');
  const [cherche, setCherche] = useState(false);
  const [trouves, setTrouves] = useState<RdvAuComptoir[] | null>(null);
  const [souci, setSouci] = useState('');
  const [choisi, setChoisi] = useState<RdvAuComptoir | null>(null);
  const [merci, setMerci] = useState(0);
  const [autre, setAutre] = useState(false);
  const [saisie, setSaisie] = useState('');
  const { d, lance, remet } = useDemandeMtn();

  useEffect(() => { let v = true; void laCollecteEstOuverte().then((o) => { if (v) setOuverte(o); }); return () => { v = false; }; }, []);
  const lu = msisdnDe(numero);

  const retrouve = async () => {
    if (!lu) { setSouci(DIT.numero); return; }
    setSouci(''); setCherche(true);
    const r = await retrouveAuComptoir(lu);
    setCherche(false);
    if (r.ouverte === false) { setOuverte(false); return; }
    if (!r.ok) { setSouci(ditLErreur(r.erreur)); return; }
    const liste = r.rdvs ?? [];
    setTrouves(liste);
    if (liste.length === 1) setChoisi(liste[0]);
    if (!liste.length) setSouci('Aucun rendez-vous aujourd’hui avec ce numéro. Tapez le numéro donné à la Maison, ou demandez à l’accueil.');
  };
  const recommence = () => { remet(); setChoisi(null); setTrouves(null); setMerci(0); setAutre(false); setSaisie(''); setSouci(''); };

  const total = choisi ? choisi.resteXof + (choisi.pourboire ? merci : 0) : 0;

  return (
    <main className="rg">
      <header className="rg-tete">
        <img className="rg-verrou" src={asset('assets/vectoriel/verrou-couche-indigo.svg')} alt="Maison MND" />
      </header>

      {ouverte === null && <p className="rg-doux rg-centre">Un instant…</p>}

      {ouverte === false && (
        <section className="rg-bloc" aria-label="Régler par MTN">
          <p className="rg-sur">Régler mon rituel</p>
          <p className="rg-doux">Le règlement par MTN ouvre bientôt. Réglez à l’accueil, ou par le lien « Régler » reçu sur WhatsApp.</p>
        </section>
      )}

      {ouverte && d.k === 'attente' && <section className="rg-bloc" aria-label="Validez sur votre téléphone"><Attente montantXof={d.montantXof} /></section>}

      {ouverte && d.k === 'recu' && (
        <section className="rg-bloc" aria-label="Séance réglée">
          <p className="rg-sur">Régler mon rituel</p>
          <div className="rg-mtn-ok">
            <strong>{choisi ? `Merci ${choisi.prenom.replace(/\s+\p{L}\.$/u, '')}, c’est réglé.` : 'Merci, c’est réglé.'}</strong>
            <span>{francs(d.montantXof)} reçus par MTN. Votre reçu arrive sur WhatsApp.</span>
            {d.honore && <span>Vous pouvez partir : la Maison est prévenue.</span>}
          </div>
        </section>
      )}

      {ouverte && d.k !== 'attente' && d.k !== 'recu' && !choisi && (
        <section className="rg-bloc" aria-label="Retrouver mon rendez-vous">
          <p className="rg-sur">Régler mon rituel</p>
          <h1 className="rg-titre">Tapez votre numéro MTN : la Maison retrouve votre rendez-vous du jour.</h1>
          <ChampDuNumero valeur={numero} onChange={(v) => { setNumero(v); setTrouves(null); setSouci(''); }} autoFocus />
          <button type="button" className="rg-regler" disabled={!lu || cherche} onClick={() => { void retrouve(); }}>
            {cherche ? 'Recherche…' : 'Retrouver mon rendez-vous'}
          </button>
          {trouves && trouves.length > 1 && (
            <div className="rg-lignes">
              {trouves.map((t) => (
                <button key={t.n} type="button" className="rg-ligne rg-choix" onClick={() => setChoisi(t)}>
                  <span>{t.prenom}</span><span>{t.etat === 'a-regler' ? francs(t.resteXof) : t.etat === 'reglee' ? 'réglé' : 'en préparation'}</span>
                </button>
              ))}
            </div>
          )}
          {souci && <p className="rg-souci" role="alert">{souci}</p>}
          <p className="rg-doux rg-petit">Moov, Celtiis ou carte : réglez à l’accueil, ou par le lien « Régler » reçu sur WhatsApp.</p>
        </section>
      )}

      {ouverte && d.k !== 'attente' && d.k !== 'recu' && choisi && (
        <section className="rg-bloc" aria-label="Votre séance">
          <p className="rg-sur">Régler mon rituel</p>
          <h1 className="rg-titre">Bonjour {choisi.prenom}.</h1>
          {choisi.etat === 'reglee' && <p className="rg-doux">Votre séance est déjà réglée. Merci.</p>}
          {choisi.etat === 'sans-piece' && <p className="rg-doux">Votre montant n’est pas encore prêt : l’équipe le prépare. Réessayez dans un instant.</p>}
          {choisi.etat === 'a-regler' && (
            <>
              <div className="rg-lignes">
                <div className="rg-ligne rg-fort"><span>Reste à régler</span><span>{francs(choisi.resteXof)}</span></div>
              </div>
              {choisi.pourboire && (
                <div className="rg-merci">
                  <span className="rg-doux">Un merci pour l’équipe ?</span>
                  <div className="rg-puces">
                    {MERCIS.map((x) => {
                      const on = !autre && merci === x;
                      return (
                        <button key={x} type="button" className={on ? 'rg-puce rg-puce--on' : 'rg-puce'} aria-pressed={on}
                          onClick={() => { setAutre(false); setSaisie(''); setMerci(on ? 0 : x); }}>
                          {francs(x)}
                        </button>
                      );
                    })}
                    <button type="button" className={autre ? 'rg-puce rg-puce--on' : 'rg-puce'} aria-pressed={autre}
                      onClick={() => { const o = !autre; setAutre(o); setSaisie(''); setMerci(0); }}>
                      Autre
                    </button>
                  </div>
                  {autre && (
                    <label className="rg-autre-montant">
                      <span className="rg-doux">Le montant de votre merci</span>
                      <span className="rg-champ">
                        <input inputMode="numeric" autoComplete="off" placeholder="Par exemple 3 000" value={saisie} autoFocus
                          onChange={(e) => {
                            const x = Math.min(MERCI_MAX, Number(e.target.value.replace(/\D/g, '').slice(0, 6)) || 0);
                            setSaisie(x ? x.toLocaleString('fr-FR').replace(/ | /g, ' ') : '');
                            setMerci(x);
                          }} />
                        <span>F</span>
                      </span>
                    </label>
                  )}
                </div>
              )}
              <div className="rg-lignes">
                <div className="rg-ligne rg-fort"><span>Total demandé par MTN</span><span>{francs(total)}</span></div>
              </div>
              <p className="rg-doux rg-petit">Aucun frais pour vous.</p>
              <button type="button" className="rg-regler" disabled={d.k === 'envoi' || !lu}
                onClick={() => { void lance(() => demandeAuComptoir(lu ?? '', choisi.n, choisi.pourboire ? merci : 0)); }}>
                {d.k === 'envoi' ? 'Demande en cours…' : 'Recevoir la demande MTN'}
              </button>
            </>
          )}
          {d.k === 'erreur' && <p className="rg-souci" role="alert">{d.dit}</p>}
          {d.k === 'refuse' && <p className="rg-souci" role="alert">MTN dit que la demande n’a pas abouti : {d.raison}. Vous pouvez recommencer, ou régler à l’accueil.</p>}
          {d.k === 'delai' && <p className="rg-souci" role="alert">Pas encore de réponse de MTN. Si vous avez validé, la Maison le verra ; sinon, recommencez.</p>}
          <button type="button" className="rg-autre" onClick={recommence}>Ce n’est pas moi, recommencer</button>
        </section>
      )}

      <p className="rg-devise"><TexteFon texte={DEVISE} penche /></p>
    </main>
  );
}
