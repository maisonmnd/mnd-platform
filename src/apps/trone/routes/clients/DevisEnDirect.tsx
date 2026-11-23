import { useMemo, useState } from 'react';
import { Button, toast } from '../../../../ds/components';
import { useInvoices, type Invoice } from '../../../../shared/finance';
import { uid } from '../../../../shared/store';
import type { Appointment } from '../../../../shared/agenda';
import type { Service } from '../../../../shared/catalog';
import { jetonDuDevis, type ModeleDuDevis, type OptionDuDevis } from '../../../../shared/devis-en-direct';
import { settingsStore } from '../../../../shared/settings';

/* ══ LE DEVIS EN DIRECT, AU TRÔNE — 22 novembre 2026 ════════════════════
   « Le même système de connexion automatique entre le Trône et les portables
   de nos clients pour faire les devis » (Yéman). Maquette
   FCTFNSr748gq1ecEHxhDMj, lot 1. Ce panneau se tient dans la fenêtre du
   rendez-vous, à côté du règlement : le maître compose devant elle.

   CE QU'IL COMPOSE, ET RIEN D'AUTRE :
   · les MODÈLES qu'il propose (deux ou trois, avec leur prix pour SA tête —
     le calcul est celui du Trône, `prixDuService`), dont un conseillé ;
   · les OPTIONS du catalogue, à leur prix : « Proposer » la laisse choisir,
     « Inclure » la met d'office (offerte sur sa pièce) ;
   · son mot, sous le devis ;
   · la consultation déjà réglée, s'il y a lieu : elle se déduit une fois ;
   · les PLACES qu'il propose — deux ou trois moments, pas un calendrier
     entier. La cliente ne choisit que parmi elles, et la fonction le
     vérifie. (Le calendrier des disponibilités viendra quand la Maison
     aura dit, passation : « la place sans acompte se libère-t-elle ».)

   LA PIÈCE NAÎT ICI, VIDE DE LIGNES. Son prix se chiffre chez elle, au
   « Valider », par la fonction : une pièce qui porterait déjà trois modèles
   vaudrait trois fois le devis. */
const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const francs = (x: number): string => `${Math.round(x).toLocaleString('fr-FR').replace(/ | /g, ' ')} F`;
const jourDit = (iso: string): string => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return `${JOURS[d.getDay()]} ${Number(m[3]) === 1 ? '1er' : Number(m[3])} ${MOIS[Number(m[2]) - 1]} ${m[1]}`;
};
const aujourdhui = (): string => new Date().toISOString().slice(0, 10);

/** L'adresse que porte le bouton de son message (payer.html?tg=d-<jeton>). */
export const adresseDuDevis = (jeton: string): string => {
  const u = new URL(window.location.href);
  return `${u.origin}${u.pathname.replace(/[^/]*$/, '')}payer.html?tg=d-${jeton}`;
};

export function DevisEnDirect({ appt, services, prixDuService, ouvertDAbord }: {
  appt: Appointment;
  services: readonly Service[];
  prixDuService: (sv: Service) => number;
  /* La fenêtre « En direct » (23 novembre 2026) l'ouvre déjà : on y vient pour
     composer, un toucher de moins. Dans « Encaisser », il reste replié. */
  ouvertDAbord?: boolean;
}) {
  const [pieces, setPieces] = useInvoices();
  const [ouvert, setOuvert] = useState(!!ouvertDAbord);
  const [cherche, setCherche] = useState('');
  const [modeles, setModeles] = useState<ModeleDuDevis[]>([]);
  const [options, setOptions] = useState<OptionDuDevis[]>([]);
  const [conseille, setConseille] = useState('');
  const [mot, setMot] = useState('');
  const [deduction, setDeduction] = useState('');
  const [places, setPlaces] = useState<{ jour: string; heure: string }[]>([]);
  const [jour, setJour] = useState(appt.date ?? aujourdhui());
  const [heure, setHeure] = useState('10 h');

  /* Le devis déjà parti pour ce rendez-vous : on ne le recompose pas. */
  const parti = useMemo(
    () => pieces.find((p) => p.apptId === appt.id && p.kind === 'devis' && !!p.lienDuDevis) ?? null,
    [pieces, appt.id],
  );

  const prixs = useMemo(() => {
    const m = new Map<string, { xof: number; dureeMin: number }>();
    for (const sv of services) {
      if (sv.archived) continue;
      m.set(sv.id, { xof: Math.max(0, Math.round(prixDuService(sv))), dureeMin: Math.round(Number((sv as { durationMin?: number }).durationMin) || 0) });
    }
    return m;
  }, [services, prixDuService]);

  const trouvees = useMemo(() => {
    const q = cherche.trim().toLowerCase();
    return [...prixs.entries()]
      .map(([id, p]) => ({ id, nom: services.find((s) => s.id === id)?.name ?? id, ...p }))
      .filter((s) => !q || s.nom.toLowerCase().includes(q))
      .slice(0, 24);
  }, [prixs, services, cherche]);

  const enModele = (id: string, nom: string) => {
    if (modeles.some((m) => m.id === id)) return;
    const p = prixs.get(id); if (!p) return;
    setModeles((v) => [...v.slice(0, 2), { id, nom, xof: p.xof, dureeMin: p.dureeMin }]);
    if (!conseille) setConseille(id);
  };
  const enOption = (id: string, nom: string) => {
    if (options.some((o) => o.id === id)) return;
    const p = prixs.get(id); if (!p) return;
    setOptions((v) => [...v, { id, nom, xof: p.xof, dureeMin: p.dureeMin, etat: 'proposee' }]);
  };
  const retourneLOption = (id: string) => setOptions((v) => v.map((o) => (o.id === id ? { ...o, etat: o.etat === 'incluse' ? 'proposee' : 'incluse' } : o)));

  const envoyer = () => {
    if (!modeles.length) { toast('Proposez au moins un modèle : c’est ce qu’elle choisira.'); return; }
    const jeton = jetonDuDevis(crypto.getRandomValues(new Uint8Array(14)));
    const quand = new Date().toISOString();
    const offre = {
      modeleConseille: conseille || modeles[0].id,
      modeles,
      options,
      ...(mot.trim() ? { mot: mot.trim() } : {}),
      places,
      /* L'ACOMPTE (23 novembre 2026) : le taux réglé au Trône, 30 % par
         défaut. Il part avec l'offre ; la fonction le relit pour dire ce
         qu'elle doit. */
      acomptePct: Math.max(0, Math.min(100, Number(settingsStore.get().onlineDepositPct) || 0)),
      ...(Number(deduction.replace(/\D/g, '') || 0) > 0 ? { deductionXof: Number(deduction.replace(/\D/g, '')) } : {}),
    };
    const inv: Invoice = {
      id: uid(), branchId: appt.branchId, kind: 'devis',
      number: `D-${aujourdhui().replace(/-/g, '')}-${jeton.slice(0, 4).toUpperCase()}`,
      clientId: appt.clientId, clientName: appt.clientName, date: aujourdhui(),
      lines: [], globalDiscountPct: 0, theme: 'Aube', status: 'envoyée',
      apptId: appt.id, master: appt.master,
      remisLe: quand, auFauteuil: { le: quand },
      lienDuDevis: { jeton, creeLe: quand, envoyeLe: quand },
      devisDuFauteuil: offre,
    };
    setPieces((prev) => [inv, ...prev]);
    setOuvert(false);
    toast(`Devis prêt · ${francs(modeles.reduce((s, m) => Math.min(s, m.xof), Number.MAX_SAFE_INTEGER))} et plus. Son lien est prêt à copier.`);
  };

  if (parti?.lienDuDevis) {
    const lien = parti.lienDuDevis;
    const adresse = adresseDuDevis(lien.jeton);
    const etat = parti.status === 'confirmé' ? 'Place choisie' : parti.status === 'acceptée' ? 'Devis accepté' : lien.valideLe ? 'Choix validés' : lien.ouvertLe ? 'Devis ouvert' : 'Devis envoyé';
    return (
      <section aria-label="Le devis en direct" style={{ border: '1px solid var(--line, #E5D8C6)', borderRadius: 8, padding: '12px 14px', display: 'grid', gap: 8, background: 'var(--paper, #FFFDF9)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
          <span style={{ font: '500 11px Jost, system-ui, sans-serif', letterSpacing: '.18em', textTransform: 'uppercase', color: 'var(--copper, #9A6036)' }}>Le devis en direct</span>
          <span style={{ fontSize: 13 }}>{etat}</span>
        </div>
        <p style={{ margin: 0, fontSize: 13 }} className="mnd-muted">
          {lien.place ? `Place choisie : ${jourDit(lien.place.jour)}, ${lien.place.heure}.` : lien.accepteLe ? 'Le devis est accepté : elle choisit sa place sur son téléphone.' : lien.valideLe ? 'Ses choix sont arrêtés : elle lit son devis une dernière fois.' : 'Le lien est sur son WhatsApp.'}
        </p>
        {parti.choixDeLaCliente?.modele && (
          <p style={{ margin: 0, fontSize: 13 }}>Elle a retenu <b>{parti.devisDuFauteuil?.modeles.find((m) => m.id === parti.choixDeLaCliente?.modele)?.nom ?? 'un modèle'}</b>.</p>
        )}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Button size="sm" variant="ghost" onClick={() => { void navigator.clipboard.writeText(adresse).then(() => toast('Lien du devis copié : collez-le dans sa conversation.')).catch(() => toast(adresse, 9000)); }}>Copier son lien</Button>
          <a className="mnd-btn mnd-btn--ghost mnd-btn--sm" href={adresse} target="_blank" rel="noreferrer">Ouvrir comme elle</a>
        </div>
      </section>
    );
  }

  return (
    <section aria-label="Le devis en direct" style={{ border: '1px solid var(--line, #E5D8C6)', borderRadius: 8, padding: '12px 14px', display: 'grid', gap: 10, background: 'var(--paper, #FFFDF9)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
        <span style={{ font: '500 11px Jost, system-ui, sans-serif', letterSpacing: '.18em', textTransform: 'uppercase', color: 'var(--copper, #9A6036)' }}>Le devis en direct</span>
        <span style={{ fontSize: 13 }} className="mnd-muted">elle le reçoit sur son téléphone</span>
      </div>
      {!ouvert ? (
        <Button size="sm" variant="indigo" onClick={() => setOuvert(true)}>Composer son devis</Button>
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>
            <span className="mnd-muted">Chercher dans le catalogue</span>
            <input value={cherche} onChange={(e) => setCherche(e.target.value)} placeholder="DÀNDÀN, reprise, styling…"
              style={{ border: '1px solid var(--line, #E5D8C6)', borderRadius: 4, padding: '6px 9px', font: 'inherit', fontSize: 14 }} />
          </label>
          <div style={{ display: 'grid', gap: 0, maxHeight: 220, overflowY: 'auto' }}>
            {trouvees.map((sv) => (
              <div key={sv.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center', borderBottom: '1px solid var(--line, #EDE4D6)', padding: '5px 0', fontSize: 12.5 }}>
                <span>{sv.nom} <span className="mnd-muted">{francs(sv.xof)}</span></span>
                <span style={{ display: 'flex', gap: 4 }}>
                  <Button size="sm" variant="ghost" disabled={modeles.some((m) => m.id === sv.id) || modeles.length >= 3} onClick={() => enModele(sv.id, sv.nom)}>Un modèle</Button>
                  <Button size="sm" variant="ghost" disabled={options.some((o) => o.id === sv.id)} onClick={() => enOption(sv.id, sv.nom)}>Une option</Button>
                </span>
              </div>
            ))}
          </div>

          <div style={{ display: 'grid', gap: 3 }}>
            <span className="mnd-muted" style={{ fontSize: 11 }}>Les modèles qu'elle choisira</span>
            {modeles.length === 0 && <span style={{ fontSize: 12.5 }} className="mnd-muted">Aucun pour l’instant.</span>}
            {modeles.map((m) => (
              <div key={m.id} style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12.5 }}>
                <button type="button" className="mnd-link" onClick={() => { setModeles((v) => v.filter((x) => x.id !== m.id)); if (conseille === m.id) setConseille(modeles.find((x) => x.id !== m.id)?.id ?? ''); }}>Retirer</button>
                <span>{m.nom} · {francs(m.xof)}</span>
                <Button size="sm" variant={conseille === m.id ? 'indigo' : 'ghost'} onClick={() => setConseille(m.id)}>{conseille === m.id ? 'Conseillé' : 'Conseiller'}</Button>
              </div>
            ))}
          </div>

          <div style={{ display: 'grid', gap: 3 }}>
            <span className="mnd-muted" style={{ fontSize: 11 }}>Les options, du catalogue</span>
            {options.length === 0 && <span style={{ fontSize: 12.5 }} className="mnd-muted">Aucune pour l’instant.</span>}
            {options.map((o) => (
              <div key={o.id} style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12.5, flexWrap: 'wrap' }}>
                <button type="button" className="mnd-link" onClick={() => setOptions((v) => v.filter((x) => x.id !== o.id))}>Retirer</button>
                <span>{o.nom} · {francs(o.xof)}</span>
                <Button size="sm" variant={o.etat === 'incluse' ? 'indigo' : 'ghost'} onClick={() => retourneLOption(o.id)}>{o.etat === 'incluse' ? 'Comprise' : 'Proposer'}</Button>
              </div>
            ))}
          </div>

          <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>
            <span className="mnd-muted">Un mot pour elle</span>
            <input value={mot} onChange={(e) => setMot(e.target.value)} maxLength={120} placeholder="Venez les locks lavées."
              style={{ border: '1px solid var(--line, #E5D8C6)', borderRadius: 4, padding: '6px 9px', font: 'inherit', fontSize: 14 }} />
          </label>

          <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>
            <span className="mnd-muted">Sa consultation déjà réglée, en francs (facultatif)</span>
            <input inputMode="numeric" value={deduction} onChange={(e) => setDeduction(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="15 000"
              style={{ border: '1px solid var(--line, #E5D8C6)', borderRadius: 4, padding: '6px 9px', font: 'inherit', fontSize: 14, width: 140 }} />
          </label>

          <div style={{ display: 'grid', gap: 6 }}>
            <span className="mnd-muted" style={{ fontSize: 11 }}>Les places qu'elle pourra prendre</span>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
              <input type="date" value={jour} onChange={(e) => setJour(e.target.value)} style={{ border: '1px solid var(--line, #E5D8C6)', borderRadius: 4, padding: '5px 8px', font: 'inherit', fontSize: 13 }} />
              <input value={heure} onChange={(e) => setHeure(e.target.value)} placeholder="10 h" style={{ border: '1px solid var(--line, #E5D8C6)', borderRadius: 4, padding: '5px 8px', font: 'inherit', fontSize: 13, width: 70 }} />
              <Button size="sm" variant="ghost" disabled={!jour || !heure || places.length >= 6}
                onClick={() => setPlaces((v) => (v.some((p) => p.jour === jour && p.heure === heure) ? v : [...v, { jour, heure }]))}>Ajouter</Button>
            </div>
            {places.map((p) => (
              <div key={`${p.jour}-${p.heure}`} style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12.5 }}>
                <button type="button" className="mnd-link" onClick={() => setPlaces((v) => v.filter((x) => !(x.jour === p.jour && x.heure === p.heure)))}>Retirer</button>
                <span>{jourDit(p.jour)}, {p.heure}</span>
              </div>
            ))}
            {places.length === 0 && <span style={{ fontSize: 12.5 }} className="mnd-muted">Sans place, elle ne pourra pas réserver : le devis lui dira d’écrire à la Maison.</span>}
          </div>

          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <Button size="sm" variant="indigo" disabled={!modeles.length} onClick={envoyer}>Envoyer le devis</Button>
            <Button size="sm" variant="ghost" onClick={() => setOuvert(false)}>Fermer</Button>
          </div>
        </div>
      )}
    </section>
  );
}
