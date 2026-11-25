import { useEffect, useMemo, useState } from 'react';
import { PageHead } from '../_ui';
import { Badge, Button, Card, toast } from '../../../../ds/components';
import { QrSvg } from '../../../../ds/qr';
import { fmtMoney } from '../../../../shared/currency';
import { useBranch } from '../../../../shared/branches';
import { useAppointments, type Appointment } from '../../../../shared/agenda';
import { prenomDUsage } from '../../../../shared/civilite';
import { adresseDActivation, codeDuTpeDit, etatDuTpe, jourDuTpe, type EtatDuTpe, type LigneDuTpe, type MarqueDuTpe } from '../../../../shared/tpe-de-poche-pur';
import { gesteDuTpe, useLesTpe } from '../../../../shared/tpe-de-poche';
import { useStaff } from '../equipe/data';

/* ══ LE TPE DE POCHE — l'écran de la direction (25 novembre 2026) ════════
   « Create a terminal of payment for the Trône, a TPE, and I can give the
   access to certain employees to activate it on their phone and collect
   payment from customers » (Yéman). Maquette RsVNQvgB85ZvDVjaKuMrqP, lot 1.

   Qui peut encaisser : un interrupteur par membre de l'équipe (personne au
   départ). « Activer un téléphone » montre un QR et son code, dix minutes,
   un seul téléphone ; « Couper » arrête un TPE à l'instant. En dessous, le
   journal du jour : les séances qu'un TPE a ouvertes, et ce qui est réglé.
   L'argent, lui, arrive sur les comptes de la Maison par la page « Régler »
   (caisse MTN Collection ou KkiaPay), comme le lien envoyé sur WhatsApp. */

const heureDe = (iso?: string | null): string => {
  const t = Date.parse(String(iso ?? ''));
  if (!Number.isFinite(t)) return '';
  const d = new Date(t + 3_600_000);
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
};
const jourEtHeureDe = (iso?: string | null): string => {
  const t = Date.parse(String(iso ?? ''));
  if (!Number.isFinite(t)) return '';
  return jourDuTpe(t) === jourDuTpe(Date.now()) ? heureDe(iso) : `${new Date(t + 3_600_000).toISOString().slice(8, 10)}/${new Date(t + 3_600_000).toISOString().slice(5, 7)} à ${heureDe(iso)}`;
};

const ETAT_DIT: Record<EtatDuTpe, string> = {
  sans: 'Pas de TPE',
  pret: 'Pas encore activé',
  code: 'QR affiché',
  actif: 'Actif',
  coupe: 'Coupé',
};

const RAISON_DITE: Record<string, string> = {
  refusee: 'Seule la direction peut faire ce geste.',
  'pas-autorise': 'Cochez d’abord « Peut encaisser ».',
  'mal-forme': 'Cette fiche de l’équipe n’a pas d’identifiant lisible.',
  injoignable: 'La Maison ne répond pas. Réessayez dans un instant.',
  panne: 'La Maison ne répond pas. Réessayez dans un instant.',
};
const raisonDite = (r?: string): string => RAISON_DITE[r ?? ''] ?? 'La Maison ne répond pas. Réessayez dans un instant.';

type CodeAffiche = { membreId: string; code: string; expireLe: string };

export default function TpeDePoche() {
  const { branch, currency } = useBranch();
  const [equipe] = useStaff();
  const [rdvs] = useAppointments();
  const { lignes, lu, erreur, relis } = useLesTpe(branch.id);
  const [code, setCode] = useState<CodeAffiche | null>(null);
  const [enCours, setEnCours] = useState<string | null>(null);
  const [maintenant, setMaintenant] = useState(() => Date.now());
  useEffect(() => {
    const m = setInterval(() => setMaintenant(Date.now()), 1_000);
    return () => clearInterval(m);
  }, []);

  const membres = useMemo(() => equipe
    .filter((m) => m.branchId === branch.id && !m.archiveeLe && m.name?.trim())
    .sort((a, b) => a.name.localeCompare(b.name, 'fr')), [equipe, branch.id]);
  const ligneDe = (membreId: string): LigneDuTpe | undefined => lignes.find((l) => l.membre_id === membreId);

  /* Le dossier servi (« /trone/ ») : tpe.html vit à côté du Trône. */
  const dossier = window.location.pathname.replace(/[^/]*$/, '');

  const fais = async (cle: string, travail: () => Promise<void>) => {
    setEnCours(cle);
    try { await travail(); } finally { setEnCours(null); relis(); }
  };
  const autorise = (m: { id: string; name: string }, oui: boolean) => fais(`a-${m.id}`, async () => {
    const r = await gesteDuTpe('autoriser', { branchId: branch.id, membreId: m.id, nom: m.name.trim(), autorise: oui });
    if (!r.ok) { toast(raisonDite(r.raison)); return; }
    if (!oui && code?.membreId === m.id) setCode(null);
    toast(oui ? `${m.name.trim()} peut encaisser. « Activer un téléphone » pour lier le sien.` : `${m.name.trim()} n’a plus de TPE.`);
  });
  const prepare = (m: { id: string; name: string }) => fais(`p-${m.id}`, async () => {
    const r = await gesteDuTpe('preparer', { branchId: branch.id, membreId: m.id });
    if (!r.ok || !r.code || !r.expireLe) { toast(raisonDite(r.raison)); return; }
    setCode({ membreId: m.id, code: r.code, expireLe: r.expireLe });
  });
  const coupe = (m: { id: string; name: string }) => fais(`c-${m.id}`, async () => {
    const r = await gesteDuTpe('couper', { branchId: branch.id, membreId: m.id });
    if (!r.ok) { toast(raisonDite(r.raison)); return; }
    toast(`Le TPE de ${m.name.trim()} est coupé. Plus rien ne s’encaisse sur son téléphone.`);
  });

  /* Le code affiché se retire dès qu'il est pris ou passé. */
  useEffect(() => {
    if (!code) return;
    const l = ligneDe(code.membreId);
    if (Date.parse(code.expireLe) <= maintenant || (l && l.appareil_empreinte && l.active_le && Date.parse(l.active_le) >= Date.parse(code.expireLe) - 10 * 60_000)) {
      if (l?.appareil_empreinte) toast(`Le téléphone de ${l.nom} est activé.`);
      setCode(null);
    }
  }, [code, lignes, maintenant]); // eslint-disable-line react-hooks/exhaustive-deps

  /* Le journal du jour : les séances qu'un TPE a ouvertes aujourd'hui. */
  const aujourdhui = jourDuTpe(maintenant);
  const journal = useMemo(() => (rdvs as Appointment[])
    .filter((a) => (a as Appointment & { branchId?: string }).branchId === branch.id)
    .map((a) => ({ a, tpe: (a.lienDeReglement as (typeof a.lienDeReglement & { tpe?: MarqueDuTpe }) | undefined)?.tpe }))
    .filter((x): x is { a: Appointment; tpe: MarqueDuTpe } => !!x.tpe && jourDuTpe(Date.parse(x.tpe.le)) === aujourdhui)
    .sort((x, y) => y.tpe.le.localeCompare(x.tpe.le)), [rdvs, branch.id, aujourdhui]);
  const regleApres = (a: Appointment, tpe: MarqueDuTpe): boolean => {
    const paye = a.lienDeReglement?.payeLe;
    return !!paye && Date.parse(paye) >= Date.parse(tpe.le) - 60_000;
  };
  const totalDuJour = journal.reduce((s, { a, tpe }) => {
    if (!regleApres(a, tpe)) return s;
    const dernier = [...(a.payments ?? [])].pop();
    return s + (Number(dernier?.amountXof) || 0);
  }, 0);

  return (
    <div className="mnd-rise" style={{ display: 'grid', gap: 16 }}>
      <PageHead
        eyebrow="Vente & Caisse"
        title="TPE de poche"
        sub="Le téléphone d’une employée devient un terminal de la Maison. Vous choisissez qui en a un ; elle l’active en scannant un QR ; elle encaisse les séances du jour. L’argent arrive sur les comptes de la Maison, jamais chez elle."
      />

      <Card>
        <div style={{ display: 'grid', gap: 12 }}>
          <h3 style={{ margin: 0, fontFamily: 'var(--font-serif)', fontWeight: 300, fontSize: 24 }}>Qui peut encaisser</h3>
          {!lu && <p style={{ margin: 0, color: 'var(--ink-soft)' }}>Lecture des TPE…</p>}
          {erreur && <p style={{ margin: 0, color: 'var(--color-alerte, #9A3B2E)' }}>Les TPE ne se lisent pas : la table n’est peut-être pas encore posée, ou ce compte n’est pas de la direction.</p>}
          {membres.length === 0 && <p style={{ margin: 0, color: 'var(--ink-soft)' }}>Aucun membre de l’équipe dans cette branche (Ressources humaines).</p>}
          {membres.map((m) => {
            const l = ligneDe(m.id);
            const etat = etatDuTpe(l, maintenant);
            const lui = code?.membreId === m.id ? code : null;
            const resteS = lui ? Math.max(0, Math.round((Date.parse(lui.expireLe) - maintenant) / 1000)) : 0;
            return (
              <div key={m.id} data-tpe-membre={m.id} style={{ border: '1px solid var(--hairline)', borderRadius: 'var(--radius-md, 3px)' }}>
                <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', padding: '10px 12px' }}>
                  <div style={{ flex: '1 1 160px', minWidth: 0, display: 'grid' }}>
                    <b style={{ fontWeight: 500 }}>{m.name}</b>
                    <span style={{ fontSize: 12.5, color: 'var(--ink-soft)' }}>{m.role}</span>
                  </div>
                  <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, cursor: 'pointer' }}>
                    <input type="checkbox" id={`tpe-${m.id}`} checked={!!l?.autorise} disabled={enCours !== null}
                      onChange={(e) => { void autorise(m, e.target.checked); }} />
                    Peut encaisser
                  </label>
                  <Badge tone={etat === 'actif' ? 'solid' : etat === 'code' ? 'copper' : undefined}>
                    {ETAT_DIT[etat]}{etat === 'actif' && l ? ` · ${l.appareil_nom ?? 'téléphone'} · depuis ${jourEtHeureDe(l.active_le)}` : ''}{etat === 'coupe' && l?.coupe_le ? ` · ${jourEtHeureDe(l.coupe_le)}` : ''}
                  </Badge>
                  {etat === 'actif' && l?.derniere_vue_le && <span style={{ fontSize: 12, color: 'var(--ink-soft)' }}>vu à {jourEtHeureDe(l.derniere_vue_le)}</span>}
                  {etat === 'actif' && (
                    <Button variant="ghost" size="sm" disabled={enCours !== null} onClick={() => { void coupe(m); }}>Couper</Button>
                  )}
                  {(etat === 'pret' || etat === 'coupe' || (etat === 'code' && !lui)) && (
                    <Button variant="copper" size="sm" disabled={enCours !== null} onClick={() => { void prepare(m); }}>
                      {etat === 'coupe' ? 'Réactiver un téléphone' : 'Activer un téléphone'}
                    </Button>
                  )}
                </div>
                {lui && (
                  <div style={{ borderTop: '1px dashed var(--hairline)', padding: 12, display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap', background: 'var(--copper-50, #FAF1E9)' }}>
                    <QrSvg valeur={adresseDActivation(window.location.origin, dossier, lui.code)} style={{ width: 150, height: 150, display: 'block', flex: 'none' }}
                      dit={`Le QR d’activation du TPE de ${m.name}`} />
                    <div style={{ flex: '1 1 200px', minWidth: 0, display: 'grid', gap: 4 }}>
                      <span style={{ fontSize: 12.5, color: 'var(--ink-soft)' }}>Code d’activation de {m.name}</span>
                      <span style={{ fontFamily: 'var(--font-serif)', fontSize: 30, letterSpacing: '.08em', lineHeight: 1 }}>{codeDuTpeDit(lui.code)}</span>
                      <span style={{ fontSize: 13.5 }}>{m.name} ouvre l’appareil photo de son téléphone et scanne ce QR, ou ouvre {window.location.origin}{dossier}tpe.html et tape le code. Valable encore {Math.floor(resteS / 60)} min {String(resteS % 60).padStart(2, '0')} s, pour un seul téléphone ; un nouveau téléphone remplace l’ancien.</span>
                      <button type="button" style={{ justifySelf: 'start', background: 'none', border: 0, padding: 0, textDecoration: 'underline', cursor: 'pointer', fontSize: 13 }} onClick={() => setCode(null)}>Fermer</button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Card>

      <Card>
        <div style={{ display: 'grid', gap: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
            <h3 style={{ margin: 0, fontFamily: 'var(--font-serif)', fontWeight: 300, fontSize: 24 }}>Encaissé aujourd’hui sur les TPE</h3>
            <span style={{ fontFamily: 'var(--font-serif)', fontSize: 26 }}>{fmtMoney(totalDuJour, currency)}</span>
          </div>
          {journal.length === 0 && <p style={{ margin: 0, color: 'var(--ink-soft)' }}>Aucune séance ouverte sur un TPE aujourd’hui.</p>}
          {journal.map(({ a, tpe }) => {
            const regle = regleApres(a, tpe);
            const dernier = regle ? [...(a.payments ?? [])].pop() : undefined;
            return (
              <div key={a.id} data-tpe-journal={a.id} style={{ display: 'grid', gridTemplateColumns: '52px minmax(0, 1fr) auto', gap: '2px 10px', alignItems: 'center', padding: '8px 0', borderTop: '1px solid var(--hairline)' }}>
                <span style={{ fontSize: 12.5, color: 'var(--ink-soft)' }}>{heureDe(tpe.le)}</span>
                <span style={{ minWidth: 0, display: 'grid' }}>
                  <b style={{ fontWeight: 500 }}>{prenomDUsage(null, a.clientName) || a.clientName}</b>
                  <span style={{ fontSize: 12, color: 'var(--ink-soft)' }}>par {tpe.nom}, sur son TPE{a.lienDeReglement?.moyen ? ` · ${a.lienDeReglement.moyen}` : ''}</span>
                </span>
                <span style={{ textAlign: 'right', display: 'grid', justifyItems: 'end', gap: 3 }}>
                  {dernier && <b style={{ fontFamily: 'var(--font-serif)', fontWeight: 400, fontSize: 19 }}>{fmtMoney(Number(dernier.amountXof) || 0, currency)}</b>}
                  <Badge tone={regle ? 'solid' : 'copper'}>{regle ? `Réglé · ${heureDe(a.lienDeReglement?.payeLe)}${dernier?.cashbox ? ` · ${dernier.cashbox}` : ''}` : 'En cours'}</Badge>
                </span>
              </div>
            );
          })}
          <p style={{ margin: 0, fontSize: 12.5, color: 'var(--ink-soft)' }}>Un TPE n’encaisse que les séances terminées au Trône. L’argent s’inscrit seul à la confirmation de MTN (caisse MTN Collection) ou de KkiaPay (caisse KkiaPay), sur la pièce de la séance.</p>
        </div>
      </Card>
    </div>
  );
}
