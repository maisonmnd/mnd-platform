import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import qrcode from 'qrcode-generator';
import { fmtMoney } from '../../../../shared/currency';
import {
  codeUssdTapGo, compteDeLaDemande, ditLeStatut, estAuTelephone, moyenDeLaPiece, numeroMasque, numeroPourFedaPay,
  tapGoOuvert, type DemandeMndPay, type MoyenMndPay, type ReglagesMndPay,
} from '../../../../shared/mnd-pay-pur';
import { annuleLaDemande, demandeLePaiement, relisLaDemande, useDemandesMndPay, useRelecture } from '../../../../shared/mnd-pay';

/* ══ LE PANNEAU MND PAY — 16 octobre 2026 ═══════════════════════════════
   Maquette UigU1Rr5… : la caissière choisit le moyen, demande, et attend
   le vert. Le même panneau sert la Caisse et l'encaissement d'un rituel.

   ① MOBILE MONEY : la demande part sur le téléphone de la cliente, elle tape
     son code ; si l'envoi direct est refusé, le QR de la page de paiement
     s'affiche à la place, rien n'est perdu.
   ② CARTE : un QR sur l'écran du comptoir (aucun terminal relié au Bénin) ;
     la cliente le scanne et paie sur son téléphone.
   ③ LE VERT VIENT DE FEDAPAY, jamais d'un bouton : le panneau prévient son
     écran (`onPayee`) une seule fois, quand la demande passe « payée ».
   ④ TAP & GO (17 octobre 2026) : le code USSD de la Maison, montant compris,
     en grand ; la cliente le compose sur son téléphone, n'importe quel réseau,
     même sans internet. FedaPay annonce le paiement, le serveur le reconnaît
     au montant exact, et le vert vient pareil. */

const MOYENS: { id: MoyenMndPay; nom: string; sous: string }[] = [
  { id: 'mtn', nom: 'MTN MoMo', sous: 'sur son téléphone' },
  { id: 'moov', nom: 'Moov', sous: 'sur son téléphone' },
  { id: 'celtiis', nom: 'Celtiis', sous: 'sur son téléphone' },
  { id: 'carte', nom: 'Carte', sous: 'QR au comptoir' },
  { id: 'tapgo', nom: 'Code USSD', sous: 'Tap & Go, elle compose' },
];

/** Le code à composer, le montant mis en valeur : c'est lui qui reconnaît
    son paiement, il doit se lire de loin. */
function CodeTapGo({ code, montant }: { code: string; montant: string }) {
  const i = code.lastIndexOf(`*${montant}#`);
  const avant = i >= 0 ? code.slice(0, i + 1) : code;
  return (
    <div style={{ background: '#FFFFFF', border: '1px solid var(--hairline)', borderRadius: 'var(--radius-md)', padding: '12px 10px', textAlign: 'center', overflowX: 'auto' }}>
      <div aria-label={`Code à composer : ${code.split('').join(' ')}`} style={{ fontFamily: 'ui-monospace, Menlo, Consolas, monospace', fontSize: 22, letterSpacing: '.04em', color: 'var(--color-indigo)', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
        {avant}{i >= 0 && <b style={{ color: 'var(--copper-700)' }}>{montant}</b>}{i >= 0 && '#'}
      </div>
    </div>
  );
}

/** Un QR lisible : noir sur blanc, ses quatre modules de silence. */
function QrDuPaiement({ valeur, taille = 168 }: { valeur: string; taille?: number }) {
  const d = useMemo(() => {
    const qr = qrcode(0, 'M');
    qr.addData(valeur);
    qr.make();
    const n = qr.getModuleCount();
    let path = '';
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) path += `M${c} ${r}h1v1h-1z`;
    return { n, path };
  }, [valeur]);
  return (
    <svg viewBox={`-4 -4 ${d.n + 8} ${d.n + 8}`} width={taille} height={taille} role="img" aria-label="QR de la page de paiement, à scanner par la cliente" style={{ display: 'block', flex: 'none', maxWidth: '100%' }}>
      <rect x={-4} y={-4} width={d.n + 8} height={d.n + 8} fill="#FFFFFF" />
      <path d={d.path} fill="#000000" shapeRendering="crispEdges" />
    </svg>
  );
}

export function PanneauMndPay(p: {
  branchId: string;
  /** La pièce que ce paiement règle (au comptoir : l'identifiant réservé du ticket). */
  pieceId: string;
  pieceNumero?: string;
  clientId?: string;
  telephone?: string;
  montantXof: number;
  pourboireXof?: number;
  libelle: string;
  currency: string;
  reglages: ReglagesMndPay | undefined;
  onPayee: (d: DemandeMndPay) => void;
  style?: CSSProperties;
}) {
  const demandes = useDemandesMndPay(p.branchId, true);
  const moyens = MOYENS.filter((x) => x.id !== 'tapgo' || tapGoOuvert(p.reglages));
  const [moyen, setMoyen] = useState<MoyenMndPay>('mtn');
  const [tel, setTel] = useState(p.telephone ?? '');
  const [demandeId, setDemandeId] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [occupe, setOccupe] = useState(false);
  const signale = useRef<string | null>(null);

  /* Une autre cliente au comptoir : on repart de son numéro. */
  useEffect(() => { setTel(p.telephone ?? ''); }, [p.telephone]);

  const demande = demandeId ? demandes.find((d) => d.id === demandeId) : undefined;
  const enAttente = demande?.statut === 'en_attente';
  /* Tap & Go : composer le code prend plus de temps, et chaque relecture
     interroge les dernières transactions de FedaPay. */
  const tapgo = demande?.moyen === 'tapgo';
  useRelecture(demandeId, !!enAttente, tapgo ? 10_000 : 4000, tapgo);

  useEffect(() => {
    if (demande?.statut === 'payee' && signale.current !== demande.id) {
      signale.current = demande.id;
      p.onPayee(demande);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [demande?.statut, demande?.id]);

  const compte = compteDeLaDemande({ montantXof: p.montantXof, pourboireXof: p.pourboireXof, moyen, reglages: p.reglages });
  const auTel = estAuTelephone(moyen);
  const numeroLu = numeroPourFedaPay(tel);
  const sansTauxCarte = moyen === 'carte' && !(Number(p.reglages?.tauxCartePct) > 0);
  const m = (x: number) => fmtMoney(x, p.currency);

  const demander = async () => {
    if (occupe || compte.montantXof <= 0) return;
    if (auTel && !numeroLu) { setErreur('Ce numéro n’est pas lisible : dix chiffres, comme 01 97 00 00 00.'); return; }
    setOccupe(true);
    setErreur(null);
    const r = await demandeLePaiement({
      branchId: p.branchId, genre: 'comptoir', moyen, montantXof: p.montantXof, pourboireXof: p.pourboireXof,
      pieceId: p.pieceId, pieceNumero: p.pieceNumero, clientId: p.clientId,
      telephone: auTel ? tel : undefined, libelle: p.libelle, reglages: p.reglages,
    });
    setOccupe(false);
    if (!r.ok) { setErreur(r.erreur); return; }
    signale.current = null;
    setDemandeId(r.id);
  };
  const recommencer = () => { setDemandeId(null); setErreur(null); };

  const boite: CSSProperties = { border: '1px solid var(--copper-300)', borderRadius: 'var(--radius-md)', background: 'var(--copper-50)', padding: '12px 13px', display: 'grid', gap: 10, ...p.style };
  const petit: CSSProperties = { fontFamily: 'var(--font-sans)', fontSize: 12, color: 'var(--copper-700)', lineHeight: 1.5 };

  return (
    <div style={boite} data-mnd-pay="panneau">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
        <span style={{ fontFamily: 'var(--font-sans)', fontSize: 9.5, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--copper-700)' }}>MND PAY</span>
        <span style={{ ...petit, fontSize: 11 }}>confirmé par FedaPay</span>
      </div>

      {!demande && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(96px, 1fr))', gap: 6 }} role="radiogroup" aria-label="Moyen MND PAY">
            {moyens.map((x) => (
              <button key={x.id} type="button" role="radio" aria-checked={moyen === x.id}
                className={`trv-pay ${moyen === x.id ? 'is-active' : ''}`} onClick={() => setMoyen(x.id)}>
                <div className="n">{x.nom}</div>
                <div className="s">{x.sous}</div>
              </button>
            ))}
          </div>
          {auTel && (
            <label style={{ display: 'grid', gap: 4 }}>
              <span style={{ fontFamily: 'var(--font-sans)', fontSize: 9.5, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--ink-soft)' }}>Son numéro {moyen === 'mtn' ? 'MTN' : moyen === 'moov' ? 'Moov' : 'Celtiis'}</span>
              <input className="mnd-input" inputMode="tel" value={tel} onChange={(e) => setTel(e.target.value)} placeholder="01 97 00 00 00" aria-label="Numéro mobile money de la cliente" />
            </label>
          )}
          <div style={{ ...petit, color: 'var(--ink-soft)' }}>
            {m(compte.montantXof)}
            {compte.pourboireXof > 0 ? ` + pourboire ${m(compte.pourboireXof)}` : ''}
            {` + frais ${m(compte.fraisXof)}`}
            {' = '}<b style={{ color: 'var(--color-indigo)' }}>{m(compte.totalXof)}</b>
            {sansTauxCarte && <span style={{ display: 'block', color: 'var(--copper-700)' }}>Taux de la carte non posé : frais au taux du mobile money (Paramètres › MND PAY).</span>}
          </div>
          <button type="button" className="mnd-btn mnd-btn--copper" disabled={occupe || compte.montantXof <= 0 || (auTel && !numeroLu)} onClick={() => void demander()}>
            {occupe ? 'Envoi…' : auTel ? `Demander ${m(compte.totalXof)}` : moyen === 'tapgo' ? `Afficher le code · ${m(compte.totalXof)}` : `Afficher le QR · ${m(compte.totalXof)}`}
          </button>
        </>
      )}

      {demande && demande.statut === 'en_attente' && (
        <div style={{ display: 'grid', gap: 10 }} aria-live="polite">
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', ...petit }}>
            <span className="mndpay-roue" aria-hidden="true" />
            <span>
              {estAuTelephone(demande.moyen) && !demande.raison
                ? `Demande envoyée au ${numeroMasque(demande.telephone ?? tel)}. En attente de son code…`
                : demande.moyen === 'tapgo'
                  ? 'Elle compose ce code sur son téléphone et valide avec son code secret…'
                  : `Elle scanne et paie ${m(demande.totalXof)} sur son téléphone…`}
            </span>
          </div>
          {demande.moyen === 'tapgo' && (
            <>
              <CodeTapGo code={codeUssdTapGo(demande.totalXof, p.reglages)} montant={String(Math.round(demande.totalXof))} />
              <div style={{ ...petit, color: 'var(--ink-soft)' }}>
                MTN, Moov ou Celtiis, même sans internet. Le montant doit être exactement {m(demande.totalXof)} : c’est lui qui reconnaît son paiement. Le vert vient seul.
                <button type="button" className="trv-minibtn" style={{ display: 'block', marginTop: 8 }}
                  onClick={() => { void navigator.clipboard?.writeText(codeUssdTapGo(demande.totalXof, p.reglages)).catch(() => undefined); }}>
                  Copier le code
                </button>
              </div>
            </>
          )}
          {demande.url && (!estAuTelephone(demande.moyen) || !!demande.raison) && (
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', background: '#FFFFFF', border: '1px solid var(--hairline)', borderRadius: 'var(--radius-md)', padding: 10 }}>
              <QrDuPaiement valeur={demande.url} />
              <div style={{ ...petit, color: 'var(--ink-soft)', minWidth: 0, flex: '1 1 160px' }}>
                {demande.raison && <span style={{ display: 'block', color: 'var(--copper-700)', marginBottom: 6 }}>L’envoi direct n’est pas passé : faites scanner ce QR, elle choisira son moyen.</span>}
                Visa, Mastercard, débit compris, ou mobile money. Ce QR ne vaut que pour ce ticket.
                <button type="button" className="trv-minibtn" style={{ display: 'block', marginTop: 8 }}
                  onClick={() => { void navigator.clipboard?.writeText(demande.url ?? '').catch(() => undefined); }}>
                  Copier le lien
                </button>
              </div>
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" className="mnd-btn mnd-btn--ghost mnd-btn--sm" onClick={() => void relisLaDemande(demande.id, demande.moyen === 'tapgo')}>Relire</button>
            <button type="button" className="mnd-btn mnd-btn--ghost mnd-btn--sm" onClick={() => void annuleLaDemande(demande.id)}>Annuler la demande</button>
          </div>
        </div>
      )}

      {demande && demande.statut === 'payee' && (
        <div style={{ background: '#E3F0E8', border: '1px solid #9CC7AF', borderRadius: 'var(--radius-md)', padding: 10, fontFamily: 'var(--font-sans)', fontSize: 13, color: '#1F4D37' }}>
          Payé · {m(demande.totalXof)} · {moyenDeLaPiece(demande)}
        </div>
      )}

      {demande && demande.statut !== 'en_attente' && demande.statut !== 'payee' && (
        <div style={{ display: 'grid', gap: 8 }}>
          <span style={{ ...petit, color: 'var(--color-brique, #96412E)' }}>{ditLeStatut(demande)}</span>
          <button type="button" className="mnd-btn mnd-btn--ghost mnd-btn--sm" onClick={recommencer}>Recommencer</button>
        </div>
      )}

      {erreur && <span role="alert" style={{ ...petit, color: 'var(--color-brique, #96412E)' }}>{erreur}</span>}
    </div>
  );
}
