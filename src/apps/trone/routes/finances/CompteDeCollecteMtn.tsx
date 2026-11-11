import { useEffect, useState } from 'react';
import { Button, Input } from '../../../../ds/components';
import { useStaff } from '../../../../shared/auth';
import { useBranch } from '../../../../shared/branches';
import { fmtMoney } from '../../../../shared/currency';
import { ilYaDit } from '../../../../shared/collecte-mtn-pur';
import { essaieLeCompteDeCollecte, useCompteDeCollecte, type EssaiDuCompte } from './collecte-mtn';

/* ══ LE COMPTE DE COLLECTE MTN · 11 novembre 2026 ═══════════════════════
   Maquette « Régler par MTN, QR » (AdAaYXGStQetsXHFkZzUW5), vue « Au
   Trône ». En tête de Vente & Caisse › Encaissements, pour la direction
   seule : le numéro de collecte, son solde chez MTN en direct (relu chaque
   minute tant que l'écran est ouvert, et d'un geste), l'heure de la
   dernière lecture, et l'erreur dite en clair. Le numéro vient du serveur
   (réglage MOMO_PROD_COLLECTION_NUMERO) : tant qu'il manque, « numéro à
   poser ». L'essai sans argent (jeton, solde, un numéro vérifié) se fait
   ici aussi : rien n'est demandé à personne. */

const PHRASE = { fontSize: 13, color: 'var(--indigo-100)', lineHeight: 1.5 } as const;
const PETIT = { fontSize: 12, color: 'var(--indigo-200)' } as const;

export function CompteDeCollecteMtn() {
  const moi = useStaff();
  const direction = moi?.role === 'souverain' || moi?.role === 'gerant';
  const { currency } = useBranch();
  const { lecture, luLe, enCours, relire } = useCompteDeCollecte(direction);
  const [maintenant, setMaintenant] = useState(() => Date.now());
  const [essaiOuvert, setEssaiOuvert] = useState(false);
  const [numero, setNumero] = useState('');
  const [essai, setEssai] = useState<EssaiDuCompte | null>(null);
  const [essaiEnCours, setEssaiEnCours] = useState(false);

  useEffect(() => {
    if (!direction) return;
    const t = window.setInterval(() => setMaintenant(Date.now()), 5000);
    return () => window.clearInterval(t);
  }, [direction]);

  if (!direction) return null;

  const souci = lecture?.souci ?? lecture?.erreur ?? null;
  const solde = typeof lecture?.soldeXof === 'number' ? fmtMoney(lecture.soldeXof, currency) : null;

  const essaie = async () => {
    setEssaiEnCours(true);
    const r = await essaieLeCompteDeCollecte(numero);
    setEssaiEnCours(false);
    setEssai(r);
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
    </section>
  );
}
