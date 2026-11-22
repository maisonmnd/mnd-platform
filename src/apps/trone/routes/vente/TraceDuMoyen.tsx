import { useEffect, useMemo, useState } from 'react';
import { Button, Input, Select, toast } from '../../../../ds/components';
import { quiEncaisse, useInvoices } from '../../../../shared/finance';
import { fmtMoney } from '../../../../shared/currency';
import {
  AUTRE_BANQUE, BANQUES_DU_BENIN, ditCeQuiManque, kkiapayCouvre, peutVoirLaPhoto, refKkiapayPlausible, refKkiapayPropre, traceSuffit,
  type FamilleDeTrace, type TraceDuMoyen,
} from '../../../../shared/trace-du-moyen-pur';
import { ditLeVerdict, heureDuRecu, recusAProposer, refsDejaPrises } from '../../../../shared/tpe-kkiapay-pur';
import { useRecusDuTpe, verifieLaReference } from '../../../../shared/tpe-kkiapay';
import { adresseDeLaPhoto, deposeLaPhoto, monCompte } from '../../../../shared/traces-coffre';
import { cuivreSi, type ChequeLu } from '../../../../shared/ia-recu-pur';
import { useEstDirection } from '../_vie';
import { LireLaPhotoDuCheque } from './LireLaPhotoDuCheque';

/* ══ LES CHAMPS DE LA TRACE — 18 octobre 2026 ═══════════════════════════
   Maquette « Chèque et carte » validée : sous la tuile Chèque, la banque (une
   liste, plus « Autre banque »), le numéro, « Au nom de » facultatif, ou une
   photo du chèque ; sous la tuile Carte, le n° d'autorisation du ticket (et
   les 4 derniers chiffres, facultatifs), ou une photo du ticket. Un seul
   composant pour l'encaissement du rituel, la Caisse et « Marquer payée ». */
export function ChampsDeLaTrace({ famille, valeur, onChange, branchId, etiquette, montantXof }: {
  famille: FamilleDeTrace;
  valeur: TraceDuMoyen | undefined;
  onChange: (t: TraceDuMoyen) => void;
  branchId: string;
  /** « Part 2 », pour les lecteurs d'écran quand il y a plusieurs parts. */
  etiquette?: string;
  /** Le montant de la part : le TPE KkiaPay le compare à ce que KkiaPay a reçu. */
  montantXof?: number;
}) {
  const t = valeur ?? {};
  const pose = (patch: Partial<TraceDuMoyen>) => onChange({ ...t, ...patch });
  const [envoi, setEnvoi] = useState(false);
  const [autreBanque, setAutreBanque] = useState(!!t.banque && !BANQUES_DU_BENIN.includes(t.banque));
  /* LA PHOTO REMPLIT LA BANQUE ET LE NUMÉRO (19 octobre 2026, chantier
     `recu`) : en cuivre jusqu'à ce qu'on les touche ; une banque hors liste
     passe en « Autre banque ». L'encaissement inscrit, comme avant. */
  const [lus, setLus] = useState<Set<'banque' | 'numero'>>(new Set());
  const touche = (k: 'banque' | 'numero') => setLus((s) => (s.has(k) ? new Set([...s].filter((x) => x !== k)) : s));
  const poseLaLecture = (lu: ChequeLu) => {
    const patch: Partial<TraceDuMoyen> = {};
    if (lu.banque) { patch.banque = lu.banque; setAutreBanque(lu.horsListe); }
    if (lu.numero) patch.numero = lu.numero;
    if (!Object.keys(patch).length) return;
    pose(patch);
    setLus(new Set<'banque' | 'numero'>([...(lu.banque ? ['banque' as const] : []), ...(lu.numero ? ['numero' as const] : [])]));
  };
  const suffit = traceSuffit(famille, t, montantXof);
  const titre = famille === 'cheque' ? 'La trace du chèque' : famille === 'kkiapay' ? 'Son paiement au TPE KkiaPay' : 'La trace de la carte';
  const id = (k: string) => `trace-${etiquette ? etiquette.replace(/\W+/g, '-') : 'x'}-${k}`;

  const photo = async (f: File | undefined) => {
    if (!f) return;
    setEnvoi(true);
    const r = await deposeLaPhoto(branchId, f, quiEncaisse());
    setEnvoi(false);
    if (!r.ok) { toast(r.erreur); return; }
    pose({ photo: r.photo });
  };

  return (
    <div data-trace={famille} data-trace-ok={suffit ? '1' : '0'} style={{ display: 'grid', gap: 8, background: '#FFFFFF', border: `1px solid ${suffit ? 'var(--hairline)' : 'var(--copper-300)'}`, borderRadius: 6, padding: 10 }}>
      <span style={{ fontFamily: 'var(--font-sans)', fontSize: 9.5, letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--copper-700)' }}>{titre}</span>
      {famille === 'cheque' ? (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.2fr) minmax(0, 1fr)', gap: 6 }}>
            <Select
              id={id('banque')}
              aria-label={`Banque du chèque${etiquette ? ` · ${etiquette}` : ''}`}
              value={autreBanque ? AUTRE_BANQUE : (t.banque ?? '')}
              style={cuivreSi(lus.has('banque'))}
              onChange={(e) => {
                touche('banque');
                const v = e.target.value;
                if (v === AUTRE_BANQUE) { setAutreBanque(true); pose({ banque: '' }); } else { setAutreBanque(false); pose({ banque: v }); }
              }}
            >
              <option value="">Banque…</option>
              {BANQUES_DU_BENIN.map((b) => <option key={b} value={b}>{b}</option>)}
              <option value={AUTRE_BANQUE}>{AUTRE_BANQUE}</option>
            </Select>
            <Input
              id={id('numero')}
              inputMode="numeric"
              autoComplete="off"
              placeholder="N° du chèque"
              aria-label={`Numéro du chèque${etiquette ? ` · ${etiquette}` : ''}`}
              value={t.numero ?? ''}
              style={cuivreSi(lus.has('numero'))}
              onChange={(e) => { touche('numero'); pose({ numero: e.target.value }); }}
            />
          </div>
          {autreBanque && (
            <Input id={id('autre')} autoComplete="off" placeholder="Le nom de la banque" aria-label="Le nom de la banque" value={t.banque ?? ''} style={cuivreSi(lus.has('banque'))} onChange={(e) => { touche('banque'); pose({ banque: e.target.value }); }} />
          )}
          <Input id={id('aunom')} autoComplete="off" placeholder="Au nom de (si ce n’est pas la cliente), facultatif" aria-label="Au nom de" value={t.auNomDe ?? ''} onChange={(e) => pose({ auNomDe: e.target.value })} />
        </>
      ) : famille === 'kkiapay' ? (
        <ChampsDuTpe t={t} pose={pose} branchId={branchId} montantXof={montantXof} id={id} />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.3fr) minmax(0, 1fr)', gap: 6 }}>
          <Input id={id('auto')} autoComplete="off" placeholder="N° d’autorisation du ticket" aria-label={`Numéro d’autorisation${etiquette ? ` · ${etiquette}` : ''}`} value={t.autorisation ?? ''} onChange={(e) => pose({ autorisation: e.target.value })} />
          <Input id={id('quatre')} inputMode="numeric" maxLength={4} autoComplete="off" placeholder="4 derniers chiffres" aria-label="4 derniers chiffres de la carte" value={t.quatre ?? ''} onChange={(e) => pose({ quatre: e.target.value })} />
        </div>
      )}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', fontSize: 12 }}>
        <span style={{ color: 'var(--ink-soft)', letterSpacing: '.16em', textTransform: 'uppercase', fontSize: 9.5 }}>ou</span>
        {t.photo?.chemin ? (
          <>
            <span style={{ color: '#2F6B4F' }}>{famille === 'cheque' ? 'Photo du chèque prise' : famille === 'kkiapay' ? 'Photo de l’écran du TPE prise' : 'Photo du ticket prise'}</span>
            <VoirLaPhoto chemin={t.photo.chemin} />
            {famille === 'cheque' && <LireLaPhotoDuCheque chemin={t.photo.chemin} onLu={poseLaLecture} />}
            <button type="button" className="tre-link-btn" onClick={() => pose({ photo: undefined })}>Retirer</button>
          </>
        ) : (
          <label htmlFor={id('photo')} style={{ cursor: 'pointer', border: '1px dashed var(--copper-300)', color: 'var(--copper-700)', borderRadius: 6, padding: '6px 10px' }}>
            {envoi ? 'Envoi de la photo…' : famille === 'cheque' ? 'Prendre le chèque en photo' : famille === 'kkiapay' ? 'Prendre l’écran du TPE en photo' : 'Prendre le ticket en photo'}
            <input id={id('photo')} type="file" accept="image/*" capture="environment" disabled={envoi} style={{ position: 'absolute', width: 1, height: 1, opacity: 0 }} onChange={(e) => { void photo(e.target.files?.[0]); e.target.value = ''; }} />
          </label>
        )}
      </div>
      {!suffit && <span role="status" style={{ fontSize: 12, color: 'var(--color-brique, #96412E)' }}>{ditCeQuiManque(famille)}</span>}
    </div>
  );
}

/* ══ LE TPE KKIAPAY — 22 novembre 2026, « les deux voies » (Yéman) ═════════
   Voie 1 : les paiements que KkiaPay a signalés ces trois dernières heures,
   le bon montant en tête : « C'est son paiement ». Voie 2 : la référence du
   reçu, demandée à KkiaPay. Ni ticket, ni n° d'autorisation, ni 4 chiffres. */
function ChampsDuTpe({ t, pose, branchId, montantXof, id }: {
  t: TraceDuMoyen;
  pose: (patch: Partial<TraceDuMoyen>) => void;
  branchId: string;
  montantXof?: number;
  id: (k: string) => string;
}) {
  const { recus, lu } = useRecusDuTpe(true);
  const [pieces] = useInvoices();
  const pris = useMemo(() => refsDejaPrises(pieces), [pieces]);
  const k = t.kkiapay;
  const propositions = recusAProposer(recus, { maintenantMs: Date.now(), dejaPris: pris, montantXof, branchId }).slice(0, 4);
  const [saisie, setSaisie] = useState(k && !k.choisi ? k.ref : '');
  const [enCours, setEnCours] = useState(false);
  const [message, setMessage] = useState('');
  const couvre = kkiapayCouvre(k, montantXof);

  const verifie = async () => {
    const ref = refKkiapayPropre(saisie);
    if (!refKkiapayPlausible(ref)) { setMessage(ditLeVerdict({ ok: false, raison: 'mal-formee' })); return; }
    if (pris.has(ref)) { pose({ kkiapay: undefined }); setMessage('Cette référence règle déjà une autre pièce.'); return; }
    setEnCours(true); setMessage('');
    const v = await verifieLaReference(ref, branchId);
    setEnCours(false);
    if (v.ok) {
      pose({ kkiapay: { ref, montantXof: v.montantXof, fraisXof: v.fraisXof, ...(v.source ? { source: v.source } : {}), verifieeLe: new Date().toISOString() } });
    } else if (v.raison === 'injoignable') {
      pose({ kkiapay: { ref, injoignable: true } });
      setMessage(ditLeVerdict(v));
    } else {
      pose({ kkiapay: undefined });
      setMessage(ditLeVerdict(v));
    }
  };

  if (k?.verifieeLe) {
    return (
      <div data-tpe-kkiapay="verifie" style={{ display: 'grid', gap: 4, fontSize: 13 }}>
        <span>
          <b style={{ color: '#2F6B4F', fontWeight: 600 }}>{k.choisi ? 'Son paiement, reçu de KkiaPay' : 'Vérifié par KkiaPay'}</b>
          {' · réf. '}{k.ref}
          {Number(k.montantXof) > 0 && <>{' · '}{fmtMoney(Number(k.montantXof), 'XOF')} pour la Maison</>}
          {Number(k.fraisXof) > 0 && <>{' (+ '}{fmtMoney(Number(k.fraisXof), 'XOF')} de frais payés par elle)</>}
        </span>
        {couvre === false && (
          <span role="alert" style={{ color: 'var(--color-brique, #96412E)' }}>
            KkiaPay a reçu {fmtMoney(Number(k.montantXof), 'XOF')} : la part dit {fmtMoney(Number(montantXof), 'XOF')}. Ramenez la part à ce montant, ou choisissez un autre paiement.
          </span>
        )}
        <span><button type="button" className="tre-link-btn" onClick={() => { pose({ kkiapay: undefined }); setMessage(''); }}>Changer</button></span>
      </div>
    );
  }

  return (
    <div data-tpe-kkiapay="a-choisir" style={{ display: 'grid', gap: 8, fontSize: 13 }}>
      {lu && (propositions.length > 0 ? (
        <div style={{ display: 'grid', gap: 6 }} aria-label="Les paiements reçus de KkiaPay">
          {propositions.map((r) => (
            <div key={r.ref} data-recu-du-tpe={r.ref} style={{ display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', border: `1px solid ${r.juste ? 'var(--copper-300)' : 'var(--hairline)'}`, borderRadius: 4, padding: '6px 10px' }}>
              <span>
                {heureDuRecu(r.at)}{' · '}<b style={{ color: 'var(--color-indigo)', fontWeight: 600 }}>{fmtMoney(r.montantXof, 'XOF')}</b>
                {r.fraisXof > 0 && <>{' (+ '}{fmtMoney(r.fraisXof, 'XOF')} de frais)</>}
                {r.juste && <span style={{ color: 'var(--ink-soft)' }}>{' · le montant de la part'}</span>}
              </span>
              <Button size="sm" variant={r.juste ? 'copper' : 'ghost'} onClick={() => {
                pose({ kkiapay: { ref: r.ref, montantXof: r.montantXof, fraisXof: r.fraisXof, ...(r.source ? { source: r.source } : {}), verifieeLe: new Date().toISOString(), choisi: true } });
                setMessage('');
              }}>C’est son paiement</Button>
            </div>
          ))}
        </div>
      ) : (
        <span style={{ color: 'var(--ink-soft)' }}>Aucun paiement signalé par KkiaPay ces trois dernières heures. Il paraît ici quand KkiaPay le signale ; sinon, la référence du reçu.</span>
      ))}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 6 }}>
        <Input
          id={id('kkiapay')}
          autoComplete="off"
          placeholder="Référence KkiaPay du reçu"
          aria-label="Référence KkiaPay du reçu"
          value={saisie}
          onChange={(e) => { setSaisie(e.target.value); setMessage(''); if (k) pose({ kkiapay: undefined }); }}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void verifie(); } }}
        />
        <Button size="sm" variant="ghost" disabled={enCours || !saisie.trim()} onClick={() => void verifie()}>{enCours ? 'KkiaPay…' : 'Vérifier'}</Button>
      </div>
      {k?.injoignable && <span style={{ color: 'var(--ink-soft)' }}>Référence {k.ref} gardée, à pointer le soir.</span>}
      {message && !k?.injoignable && <span role="status" style={{ color: 'var(--color-brique, #96412E)' }}>{message}</span>}
    </div>
  );
}

/** « Voir la photo » : à la direction et à qui l'a prise ; la base refuse les autres. */
export function VoirLaPhoto({ chemin }: { chemin: string }) {
  const estDirection = useEstDirection();
  const [compte, setCompte] = useState<string | undefined>();
  useEffect(() => { void monCompte().then(setCompte); }, []);
  if (!peutVoirLaPhoto(chemin, { estDirection, compte })) return null;
  return (
    <button
      type="button"
      className="tre-link-btn"
      onClick={async () => {
        const url = await adresseDeLaPhoto(chemin);
        if (!url) { toast('La photo ne s’ouvre pas : le coffre la réserve à la direction et à qui l’a prise.'); return; }
        window.open(url, '_blank', 'noopener');
      }}
    >
      Voir la photo
    </button>
  );
}
