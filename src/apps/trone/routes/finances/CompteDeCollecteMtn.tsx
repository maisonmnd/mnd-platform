import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Input, toast } from '../../../../ds/components';
import { useStaff } from '../../../../shared/auth';
import { useBranch } from '../../../../shared/branches';
import { fmtMoney } from '../../../../shared/currency';
import { useAppointments } from '../../../../shared/agenda';
import { jourDeCotonou, heureDeCotonou } from '../../../../shared/regler-la-seance-pur';
import {
  ETAT_DE_LA_COLLECTE_DIT, MONTANT_ESSAI_MTN, fraisDeMtn, ilYaDit, numeroMasque, peutOuvrirLaCollecte, raisonDiteALaCliente,
  reglementsMtnDuJour, type CollecteMtn,
} from '../../../../shared/collecte-mtn-pur';
import {
  basculeLaCollecte, demandeLEssai, essaieLeCompteDeCollecte, relisLesCollectes, statutDeLaCollecte, useCollectesMtn, useCompteDeCollecte,
  type EssaiDuCompte,
} from './collecte-mtn';

/* ══ LE COMPTE DE COLLECTE MTN · 11 novembre 2026 ═══════════════════════
   Maquette « Régler par MTN, QR » (AdAaYXGStQetsXHFkZzUW5), vue « Au
   Trône ». En tête de Vente & Caisse › Encaissements, pour la direction
   seule : le numéro de collecte, son solde chez MTN en direct (relu chaque
   minute tant que l'écran est ouvert, et d'un geste), l'heure de la
   dernière lecture, et l'erreur dite en clair. Le numéro vient du serveur
   (réglage MOMO_PROD_COLLECTION_NUMERO) : tant qu'il manque, « numéro à
   poser ». L'essai sans argent (jeton, solde, un numéro vérifié) se fait
   ici aussi : rien n'est demandé à personne.

   LOT B : l'essai de 100 F (une vraie demande, validée par la direction sur
   son téléphone), l'interrupteur du règlement par MTN (fermé ; il ne
   s'ouvre qu'après un essai reçu), et les règlements MTN du jour, une ligne
   chacun, qui ouvre le rendez-vous et montre la référence MTN. */

const PHRASE = { fontSize: 13, color: 'var(--indigo-100)', lineHeight: 1.5 } as const;
const PETIT = { fontSize: 12, color: 'var(--indigo-200)' } as const;
const ATTENTE_MS = 4_000;
const LECTURES = 45;

/** « 11 h 02 » d'un instant ISO, à l'heure de Cotonou. */
const heureDite = (iso?: string | null): string => {
  const ms = Date.parse(String(iso ?? ''));
  if (!Number.isFinite(ms)) return '';
  const [h, m] = heureDeCotonou(new Date(ms)).split(':');
  return `${Number(h)} h ${m}`;
};
const RAPPROCHER: Record<string, string> = {
  deja_reglee: 'la séance était déjà réglée',
  reste_change: 'le reste avait baissé',
  piece_introuvable: 'la pièce n’existe plus',
};

export function CompteDeCollecteMtn({ onOuvreLeRdv }: { onOuvreLeRdv?: (rdvId: string) => void }) {
  const moi = useStaff();
  const direction = moi?.role === 'souverain' || moi?.role === 'gerant';
  const { currency } = useBranch();
  const [rdvs] = useAppointments();
  const { lecture, luLe, enCours, relire } = useCompteDeCollecte(direction);
  const [maintenant, setMaintenant] = useState(() => Date.now());
  const [essaiOuvert, setEssaiOuvert] = useState(false);
  const [numero, setNumero] = useState('');
  const [essai, setEssai] = useState<EssaiDuCompte | null>(null);
  const [essaiEnCours, setEssaiEnCours] = useState(false);
  const [centOuvert, setCentOuvert] = useState(false);
  const [numeroCent, setNumeroCent] = useState('');
  const [cent, setCent] = useState<{ etat: 'envoi' | 'attente' | 'recu' | 'refuse' | 'delai' | 'erreur'; dit?: string } | null>(null);
  const [bascule, setBascule] = useState(false);
  const vivant = useRef(true);
  useEffect(() => () => { vivant.current = false; }, []);

  const depuis = useMemo(() => new Date(Date.now() - 30 * 86_400_000).toISOString(), []);
  const { collectes, erreur: erreurDuRegistre, relis } = useCollectesMtn(direction, depuis);

  useEffect(() => {
    if (!direction) return;
    const t = window.setInterval(() => setMaintenant(Date.now()), 5000);
    return () => window.clearInterval(t);
  }, [direction]);

  if (!direction) return null;

  const souci = lecture?.souci ?? lecture?.erreur ?? null;
  const solde = typeof lecture?.soldeXof === 'number' ? fmtMoney(lecture.soldeXof, currency) : null;
  const ouverte = lecture?.reglement?.ouverte === true;
  const essaiRecu = peutOuvrirLaCollecte(collectes);
  const jour = jourDeCotonou(new Date(maintenant));
  const duJour = reglementsMtnDuJour(collectes, jour);
  const nomDuRdv = (c: CollecteMtn): string => rdvs.find((a) => a.id === c.rdv_id)?.clientName ?? 'Une cliente';

  const essaie = async () => {
    setEssaiEnCours(true);
    const r = await essaieLeCompteDeCollecte(numero);
    setEssaiEnCours(false);
    setEssai(r);
  };

  const demandeCent = async () => {
    setCent({ etat: 'envoi' });
    const r = await demandeLEssai(numeroCent, MONTANT_ESSAI_MTN);
    if (!vivant.current) return;
    if (!r.reference) { setCent({ etat: 'erreur', dit: r.erreur ?? 'La demande n’a pas pu partir.' }); return; }
    if (r.etat === 'refuse') { setCent({ etat: 'refuse', dit: r.raison }); relis(); return; }
    setCent({ etat: 'attente' });
    relis();
    for (let i = 0; i < LECTURES && vivant.current; i++) {
      await new Promise((ok) => window.setTimeout(ok, ATTENTE_MS));
      const s = await statutDeLaCollecte(r.reference);
      if (!vivant.current) return;
      if (s.etat === 'recu') { setCent({ etat: 'recu' }); relis(); relire(); return; }
      if (s.etat === 'refuse') { setCent({ etat: 'refuse', dit: s.raison }); relis(); return; }
    }
    if (vivant.current) setCent({ etat: 'delai' });
  };

  const basculer = async (ouvrir: boolean) => {
    setBascule(true);
    const r = await basculeLaCollecte(ouvrir);
    setBascule(false);
    if (r.erreur) { toast(r.erreur, 7000); return; }
    toast(r.ouverte ? 'Le règlement par MTN est ouvert aux clientes.' : 'Le règlement par MTN est fermé aux clientes.');
    relire();
  };

  const relireTout = async () => {
    const r = await relisLesCollectes();
    if (r.erreur) toast(r.erreur, 7000);
    relis();
  };

  return (
    <section className="trf-obsidian" aria-label="Compte de collecte MTN" style={{ marginBottom: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 16, flexWrap: 'wrap' }}>
        <div className="trf-obsidian__eyebrow">Compte de collecte MTN · direction seule</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, ...PETIT }} aria-live="polite">
          <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: 4, background: souci ? 'var(--copper-300)' : 'var(--copper-200)' }} />
          <span>{enCours && !luLe ? 'Lecture chez MTN…' : luLe ? `En direct · relu ${ilYaDit(maintenant - luLe)}` : 'Pas encore lu'}</span>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 24, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={PETIT}>Numéro de collecte</span>
          <span style={{ fontSize: 22, fontWeight: 600, letterSpacing: '0.04em', color: 'var(--color-ivoire)' }}>{lecture?.numero ?? 'numéro à poser'}</span>
          <span style={PETIT}>{lecture?.compte ? `${lecture.compte} · MAISON MND` : 'MAISON MND'}</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-end' }}>
          <span style={PETIT}>Solde disponible chez MTN</span>
          <span className="trf-obsidian__value" style={{ fontSize: 40 }}>{solde ?? '·'}</span>
          {luLe && <span style={PETIT}>lu à {new Date(luLe).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>}
        </div>
      </div>

      {souci && <p role="alert" style={{ margin: 0, fontSize: 13, lineHeight: 1.5, color: 'var(--copper-200)' }}>{souci}</p>}

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <Button size="sm" variant="ghost-invert" disabled={enCours} onClick={relire}>{enCours ? 'Lecture…' : 'Relire maintenant'}</Button>
        <Button size="sm" variant="ghost-invert" onClick={() => setEssaiOuvert((o) => !o)} aria-expanded={essaiOuvert}>
          {essaiOuvert ? 'Fermer l’essai' : 'Essai sans argent'}
        </Button>
        <Button size="sm" variant="ghost-invert" onClick={() => setCentOuvert((o) => !o)} aria-expanded={centOuvert}>
          {centOuvert ? 'Fermer l’essai de 100 F' : 'Essai de 100 F'}
        </Button>
        <span style={PHRASE}>Les règlements reçus sont dans les encaissements du jour.</span>
      </div>

      {essaiOuvert && (
        <div style={{ borderTop: '1px solid var(--hairline-invert)', paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <p style={{ margin: 0, ...PHRASE }}>
            Le serveur demande un jeton à MTN, relit le solde et vérifie un numéro (actif, nom du titulaire), par le relais.
            Aucun argent ne bouge, personne ne reçoit de demande.
          </p>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <Input value={numero} onChange={(e) => setNumero(e.target.value)} inputMode="tel" placeholder="Un numéro MTN, 01 …" aria-label="Numéro MTN à vérifier" style={{ maxWidth: 220 }} />
            <Button size="sm" variant="copper" disabled={essaiEnCours} onClick={() => { void essaie(); }}>{essaiEnCours ? 'Essai en cours…' : 'Faire l’essai'}</Button>
          </div>
          {essai && (
            <ul style={{ margin: 0, paddingLeft: 18, ...PHRASE }}>
              {essai.erreur && !essai.jeton && <li>{essai.souci ?? essai.erreur}</li>}
              {essai.jeton && <li>Jeton de collecte : {essai.jeton.ok ? 'reçu' : `refusé (réponse ${essai.jeton.http})`}</li>}
              {essai.solde && <li>Solde : {essai.solde.xof !== null ? fmtMoney(essai.solde.xof, currency) : `non lu (réponse ${essai.solde.http})`}</li>}
              {essai.numeroIllisible && <li>Ce numéro ne se lit pas : dix chiffres, commençant par 01.</li>}
              {essai.verifie && (
                <li>
                  {essai.verifie.dit} : {essai.verifie.actif === true ? 'actif chez MTN' : essai.verifie.actif === false ? 'inactif chez MTN' : 'MTN ne dit pas s’il est actif'}
                  {essai.verifie.nom ? `, au nom de ${essai.verifie.nom}` : ', sans nom rendu'}
                  {!essai.verifie.mtn ? ' (ce préfixe n’est pas dans la liste MTN)' : ''}
                </li>
              )}
              {essai.souci && essai.jeton && <li>{essai.souci}</li>}
            </ul>
          )}
        </div>
      )}

      {centOuvert && (
        <div style={{ borderTop: '1px solid var(--hairline-invert)', paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <p style={{ margin: 0, ...PHRASE }}>
            Une vraie demande de {fmtMoney(MONTANT_ESSAI_MTN, currency)}, envoyée à VOTRE numéro MTN : vous la validez vous-même sur votre téléphone,
            avec votre code secret. Reçue par MTN, elle permet d’ouvrir le règlement par MTN aux clientes.
          </p>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <Input value={numeroCent} onChange={(e) => setNumeroCent(e.target.value)} inputMode="tel" placeholder="Votre numéro MTN, 01 …" aria-label="Votre numéro MTN pour l’essai" style={{ maxWidth: 220 }} />
            <Button size="sm" variant="copper" disabled={cent?.etat === 'envoi' || cent?.etat === 'attente'} onClick={() => { void demandeCent(); }}>
              {cent?.etat === 'envoi' ? 'Demande en cours…' : `Me demander ${fmtMoney(MONTANT_ESSAI_MTN, currency)}`}
            </Button>
          </div>
          {cent && (
            <p style={{ margin: 0, ...PHRASE }} aria-live="polite">
              {cent.etat === 'attente' && 'Validez sur votre téléphone. Rien ne s’affiche ? Composez *880# puis « Mes approbations ».'}
              {cent.etat === 'recu' && 'Reçu par MTN : la chaîne entière marche. Vous pouvez ouvrir le règlement par MTN aux clientes.'}
              {cent.etat === 'refuse' && `Refusé : ${cent.dit ?? 'MTN n’a pas dit pourquoi'}.`}
              {cent.etat === 'delai' && 'Pas encore de réponse de MTN. Le registre se relit tout seul ; la ligne dira la suite.'}
              {cent.etat === 'erreur' && cent.dit}
            </p>
          )}
        </div>
      )}

      <div style={{ borderTop: '1px solid var(--hairline-invert)', paddingTop: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-ivoire)' }}>
            {ouverte ? 'Le règlement par MTN est ouvert aux clientes' : 'Le règlement par MTN est fermé aux clientes'}
          </span>
          <span style={PETIT}>
            {ouverte
              ? 'Le QR du comptoir et le bouton « Payer par MTN » de leur lien sont en service.'
              : essaiRecu ? 'Votre essai a été reçu par MTN : vous pouvez l’ouvrir.' : 'Il s’ouvre après votre essai de 100 F, reçu par MTN.'}
          </span>
        </div>
        {lecture?.reglement?.lu !== false && (
          <Button size="sm" variant={ouverte ? 'ghost-invert' : 'copper'} disabled={bascule || (!ouverte && !essaiRecu)} onClick={() => { void basculer(!ouverte); }}>
            {ouverte ? 'Fermer aux clientes' : 'Ouvrir aux clientes'}
          </Button>
        )}
      </div>

      <div style={{ borderTop: '1px solid var(--hairline-invert)', paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
          <span className="trf-obsidian__eyebrow">Les règlements MTN du jour</span>
          <span style={PETIT}>
            {duJour.recus} confirmé{duJour.recus > 1 ? 's' : ''} · {fmtMoney(duJour.recuXof, currency)} · frais {fmtMoney(duJour.fraisXof, currency)}
            {' · '}<button type="button" onClick={() => { void relireTout(); }} style={{ font: 'inherit', color: 'var(--copper-200)', background: 'none', border: 0, padding: 0, cursor: 'pointer', textDecoration: 'underline' }}>relire chez MTN</button>
          </span>
        </div>
        {erreurDuRegistre && <p style={{ margin: 0, fontSize: 12.5, color: 'var(--copper-200)' }}>{erreurDuRegistre}</p>}
        {!erreurDuRegistre && duJour.lignes.length === 0 && <p style={{ margin: 0, ...PETIT }}>Aucun règlement par MTN aujourd’hui.</p>}
        {duJour.lignes.map((c) => {
          const etat = c.etat === 'recu' && c.a_rapprocher
            ? `À rapprocher : ${RAPPROCHER[c.a_rapprocher] ?? c.a_rapprocher}`
            : c.etat === 'refuse' ? `${ETAT_DE_LA_COLLECTE_DIT.refuse} · ${raisonDiteALaCliente(c.raison)}` : ETAT_DE_LA_COLLECTE_DIT[c.etat];
          return (
            <button
              key={c.reference}
              type="button"
              onClick={() => { if (c.rdv_id && onOuvreLeRdv) onOuvreLeRdv(c.rdv_id); }}
              title="Ouvrir le rendez-vous"
              style={{ display: 'grid', gridTemplateColumns: '64px minmax(0, 1fr) auto', gap: 12, alignItems: 'center', textAlign: 'left', font: 'inherit', color: 'var(--color-ivoire)', background: 'transparent', border: 0, borderTop: '1px solid var(--hairline-invert)', padding: '8px 0', cursor: c.rdv_id ? 'pointer' : 'default' }}
            >
              <span style={PETIT}>{heureDite(c.repondu_le ?? c.demande_le)}</span>
              <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                <span style={{ fontSize: 14 }}>{nomDuRdv(c)}{c.pourboire_xof > 0 ? ` · dont ${fmtMoney(c.pourboire_xof, currency)} de merci` : ''}</span>
                <span style={{ ...PETIT, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {etat} · {numeroMasque(c.msisdn)} · réf. {c.reference.slice(0, 8)}{c.transaction_mtn ? ` · transaction ${c.transaction_mtn}` : ''}
                </span>
              </span>
              <span style={{ textAlign: 'right' }}>
                <span style={{ display: 'block', fontFamily: 'var(--font-serif)', fontSize: 17 }}>{fmtMoney(c.montant_xof, currency)}</span>
                {c.etat === 'recu' && <span style={PETIT}>frais {fmtMoney(Number(c.frais_xof) || fraisDeMtn(c.montant_xof), currency)}</span>}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
