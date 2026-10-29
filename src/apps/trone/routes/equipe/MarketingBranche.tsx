/* LE MARKETING BRANCHÉ — 21 octobre 2026.

   « Dans Marketing les boutons Campagnes, Automatisations et Audience ne sont
   pas branchés et ne sont pas reliés. Corrige » (Yéman). Maquette « Marketing
   branché » validée, choix au sélecteur : les deux canaux, une campagne
   retenue jusqu'au feu vert, les fausses automatisations rangées en idées, des
   audiences calculées, et l'accord noté seul ouvre WhatsApp.

   Les trois onglets lisent la même vérité que le reste du Trône :
   · Automatisations : ce qui part vraiment (`automatisations-reelles-pur`),
     compté dans la table `envois` ;
   · Audience : un seul juge (`audiences-pur`), le même que le registre des
     Clientes, qui s'ouvre sur l'audience par « Voir » ;
   · Campagnes : déposées dans la salle d'attente des envois, retenues, et
     portées par le facteur au feu vert (`campagnes-pur`). */
import { Fragment, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Card, Eyebrow, Field, Input, Modal, Select, Textarea, demande, toast } from '../../../../ds/components';
import { useBranch } from '../../../../shared/branches';
import { fmtMoney } from '../../../../shared/currency';
import { useSegments, addSegment, renameSegment, removeSegment, type Client } from '../../../../shared/clients';
import { useInvoices, invoiceTotal } from '../../../../shared/finance';
import { useAppointments } from '../../../../shared/agenda';
import { useStore, uid } from '../../../../shared/store';
import { settingsStore } from '../../../../shared/settings';
import { appelDe, prenomSeul } from '../../../../shared/civilite';
import { numeroWa } from '../../../../shared/conversations';
import { identiteCourante } from '../../../../shared/journal';
import { typeDit } from '../../../../shared/envois';
import {
  AUTOMATISATIONS_REELLES, GROUPES_DES_AUTOMATISATIONS, ALLUMAGE_DIT, IDEES_PAS_ENCORE_CONSTRUITES,
  compteDuMois, compteDeTout, moisDuSalon, type AutomatisationReelle,
} from '../../../../shared/automatisations-reelles-pur';
import {
  AUDIENCES_CALCULEES, aAccepteLesNouvelles, cleDuSegment, membresDeLAudience, nomDeLAudience, porteeDeLAudience,
} from '../../../../shared/audiences-pur';
import {
  ETAT_DE_LA_CAMPAGNE_DIT, ceQuiManque, etatDeLaCampagne, feuVert, lignesDuDepot, resultatDeLaCampagne, texteDuModele,
  type Campagne, type CanalDeCampagne,
} from '../../../../shared/campagnes-pur';
import {
  heuresDesRappels, quandDuRappelDeLaVeille, heuresDuPremierEnvoi, heuresDuSecondPassage, ceQueRecoitLaCliente, heuresDites,
  type HeuresDesRappels,
} from '../../../../shared/heures-des-rappels-pur';
import { reglesDepuis } from '../../../../shared/salle-des-envois';
import { automationsActiveStore, autoConfigStore, envoisStore, segmentNotesStore, useCampaigns, useEnvois, type AutoConfig, type SegmentNote } from './data';
import { useEstDirection } from '../_vie';
import { useAudiences } from './useAudiences';
import { Pill, Toggle } from './ui';

const FUSEAU = 'Africa/Porto-Novo';
/** « 21 oct. 2026 » : l'année toujours (règle des dates de la Maison). */
const leJour = (iso: string | null | undefined): string => {
  const t = Date.parse(iso ?? '');
  return Number.isFinite(t) ? new Date(t).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', timeZone: FUSEAU }) : '';
};
const leJourEtLHeure = (iso: string | null | undefined): string => {
  const t = Date.parse(iso ?? '');
  if (!Number.isFinite(t)) return '';
  const h = new Date(t).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: FUSEAU }).replace(':', ' h ');
  return `${leJour(iso)} à ${h.replace(/ h 00$/, ' h')}`;
};
const qui = (): string => identiteCourante().nom || 'Le Trône';

/* ══════════════════════════ LES AUTOMATISATIONS ══════════════════════════ */

/* LES HEURES DU RAPPEL DE LA VEILLE — 29 octobre 2026. Maquette « Heures des
   rappels » validée : le premier envoi et le second passage se choisissent
   ici, de 9 h à 19 h (à 20 h commencent les heures calmes) ; la même heure
   toute la semaine ; la Direction seule les change, les autres les lisent.
   Gardées dans `mnd_auto_config`, lues chaque heure par `rappels-j1`. */
function ReglageDesHeuresDesRappels({ autoCfg, setAutoCfg, onFermer }: {
  autoCfg: AutoConfig; setAutoCfg: (c: AutoConfig) => void; onFermer: () => void;
}) {
  const navigate = useNavigate();
  const direction = useEstDirection();
  const enPlace = heuresDesRappels(autoCfg);
  const [brouillon, setBrouillon] = useState<HeuresDesRappels>(enPlace);
  const salleMin = reglesDepuis(autoCfg).salleMin;
  const dit = ceQueRecoitLaCliente(brouillon, salleMin);
  const change = brouillon.premier !== enPlace.premier || brouillon.second !== enPlace.second;
  const choisisLePremier = (premier: number) =>
    setBrouillon((b) => ({ premier, second: b.second !== null && b.second > premier ? b.second : null }));
  const enregistre = () => {
    setAutoCfg({ ...autoCfg, rappelPremier: brouillon.premier, rappelSecond: brouillon.second ?? 0 });
    toast(`Heures des rappels enregistrées : la veille, ${heuresDites(brouillon)}.`);
  };
  const seconds = heuresDuSecondPassage(brouillon.premier);
  return (
    <div style={{ margin: '0 20px 14px', border: '1px solid var(--hairline)', borderRadius: 4, padding: '16px 18px', background: 'var(--color-sable)', display: 'grid', gap: 14 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
        <Field label="Premier envoi, la veille">
          <Select value={String(brouillon.premier)} disabled={!direction} onChange={(e) => choisisLePremier(Number(e.target.value))}>
            {heuresDuPremierEnvoi().map((h) => <option key={h} value={h}>{h} h</option>)}
          </Select>
        </Field>
        <Field label="Second passage, la veille">
          <Select value={String(brouillon.second ?? 0)} disabled={!direction} onChange={(e) => setBrouillon((b) => ({ ...b, second: Number(e.target.value) || null }))}>
            <option value={0}>Aucun</option>
            {seconds.map((h) => <option key={h} value={h}>{h} h</option>)}
          </Select>
        </Field>
      </div>
      <p className="mnd-muted" style={{ fontSize: 12, margin: 0, lineHeight: 1.6 }}>
        De 9 h à 19 h : à 20 h commencent les heures calmes, rien ne part avant 8 h. Le second passage rattrape les rendez-vous posés après le premier envoi, et un envoi qui a échoué. Un rappel déjà parti ne repart jamais.
      </p>
      <div style={{ display: 'grid', gap: 4 }}>
        <p style={{ margin: 0, fontSize: 14, color: 'var(--color-indigo)' }}>{dit.veille}</p>
        <p style={{ margin: 0, fontSize: 14, color: brouillon.second !== null ? 'var(--color-indigo)' : 'var(--copper-700)' }}>{dit.tardif}</p>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
        {direction ? (
          <>
            <Button onClick={enregistre} disabled={!change}>Enregistrer</Button>
            {change && <Button variant="ghost" onClick={() => setBrouillon(enPlace)}>Annuler</Button>}
          </>
        ) : (
          <span className="mnd-muted" style={{ fontSize: 12.5 }}>Seule la Direction change ces heures.</span>
        )}
        <button type="button" onClick={() => navigate('/conversations?envois=1&type=rappel-j1')} style={{ background: 'none', border: 'none', padding: 0, color: 'var(--copper-700)', fontSize: 12.5, cursor: 'pointer' }}>Les rappels partis ›</button>
        <button type="button" onClick={onFermer} style={{ background: 'none', border: 'none', padding: 0, color: 'var(--ink-soft)', fontSize: 12.5, cursor: 'pointer', marginLeft: 'auto' }}>Fermer</button>
      </div>
    </div>
  );
}

export function OngletAutomatisations() {
  const { branch } = useBranch();
  const navigate = useNavigate();
  const [envois] = useEnvois();
  const [autoActive, setAutoActive] = useStore(automationsActiveStore);
  const [autoCfg, setAutoCfg] = useStore(autoConfigStore);
  const [settings] = useStore(settingsStore);
  const [heuresOuvertes, setHeuresOuvertes] = useState(false);
  const heuresEnPlace = heuresDesRappels(autoCfg);
  const mois = moisDuSalon(new Date().toISOString());
  const total = useMemo(() => compteDeTout(envois, mois, branch.id), [envois, mois, branch.id]);
  const remisPct = total.partis > 0 ? Math.round((total.remis / total.partis) * 100) : null;

  /** L'état d'un vrai interrupteur qui vit ailleurs, lu là où il vit. */
  const etatDuReglage = (a: AutomatisationReelle): string => {
    if (a.id === 'avis-google') return autoCfg.avisAuto === true ? 'allumé, sans la main' : 'éteint : préparée au comptoir';
    if (a.id === 'relance-facture') {
      const r = settings.relances;
      return r?.actives ? `allumées${r.depuis ? ` depuis le ${leJour(`${r.depuis}T12:00:00Z`)}` : ''}` : 'éteintes';
    }
    if (a.id === 'automate-wa') {
      const mode = (autoCfg as { automateWa?: { mode?: string } }).automateWa?.mode ?? 'essai';
      return mode === 'ouvert' ? 'ouvert à toutes' : mode === 'eteint' ? 'éteint' : 'en essai';
    }
    return 'réglé là-bas';
  };

  const comptoirAllume = autoActive['avis-premiere-venue'] !== false;

  return (
    <div>
      <p className="mnd-muted" style={{ fontSize: 13, maxWidth: 760, lineHeight: 1.6, margin: '0 0 16px' }}>
        Ce qui part <span style={{ color: 'var(--color-indigo)' }}>vraiment</span>, tout seul, aujourd’hui. Chaque ligne compte ses envois du mois dans le journal des envois.
        Un interrupteur n’apparaît que là où un vrai interrupteur existe ; les autres s’allument avec leur modèle WhatsApp et s’arrêtent d’eux-mêmes s’il manque.
      </p>

      <div className="tr-grid tr-grid--3" style={{ marginBottom: 16 }}>
        <Card filet="copper" style={{ padding: 16 }}>
          <div className="mnd-stat__label">Partis ce mois</div>
          <div className="mnd-stat__value" style={{ fontSize: 28 }}>{total.partis}</div>
        </Card>
        <Card filet="indigo" style={{ padding: 16 }}>
          <div className="mnd-stat__label">Remis sur le téléphone</div>
          <div className="mnd-stat__value" style={{ fontSize: 28 }}>{remisPct === null ? '—' : `${remisPct} %`}</div>
        </Card>
        <Card filet="indigo" style={{ padding: 16 }}>
          <div className="mnd-stat__label">À regarder</div>
          <div className="mnd-stat__value" style={{ fontSize: 28 }}>{total.aRegarder}</div>
          {total.aRegarder > 0 && (
            <button type="button" className="tre-lien" onClick={() => navigate('/conversations?envois=1')} style={{ background: 'none', border: 'none', padding: 0, color: 'var(--copper-700)', fontSize: 12, cursor: 'pointer' }}>
              Voir pourquoi ›
            </button>
          )}
        </Card>
      </div>

      <Card style={{ overflow: 'hidden' }}>
        {GROUPES_DES_AUTOMATISATIONS.map((g) => (
          <div key={g.k}>
            <div className="mnd-eyebrow" style={{ fontSize: 10, color: 'var(--copper-700)', padding: '14px 20px 6px' }}>{g.dit}</div>
            {AUTOMATISATIONS_REELLES.filter((a) => a.groupe === g.k).map((a) => {
              const c = a.types.length ? compteDuMois(envois, a.types, mois, branch.id) : null;
              return (
                <Fragment key={a.id}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', padding: '13px 20px', borderTop: '1px solid var(--hairline)' }}>
                  <span style={{ fontSize: 12.5, background: 'var(--color-sable)', borderRadius: 2, padding: '7px 11px', flex: '0 1 220px' }}>{a.id === 'rappel-j1' ? quandDuRappelDeLaVeille(heuresEnPlace) : a.quand}</span>
                  <span style={{ flex: '1 1 220px', minWidth: 0 }}>
                    <span style={{ fontSize: 13, color: 'var(--color-indigo)' }}>{a.quoi}</span>
                    {a.modeles.length > 0 && (
                      <span className="mnd-muted" style={{ display: 'block', fontSize: 11, fontFamily: 'ui-monospace, Consolas, monospace' }}>{a.modeles.join(' · ')}</span>
                    )}
                  </span>
                  <span className="mnd-muted" style={{ fontSize: 11.5, flex: '0 0 150px', textAlign: 'right' }}>
                    {c ? (c.partis > 0 ? `${c.partis} ce mois${c.dernier ? ` · dernier le ${leJour(c.dernier)}` : ''}` : '0 ce mois') : a.pasCompte}
                  </span>
                  <span style={{ flex: '0 0 170px', display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 8, fontSize: 12 }}>
                    {a.allumage === 'ici' ? (
                      <Toggle
                        on={comptoirAllume}
                        onToggle={() => setAutoActive((prev) => ({ ...prev, [a.id]: !comptoirAllume }))}
                        label={autoCfg.avisAuto === true ? 'proposée (l’avis part déjà sans la main)' : 'proposée'}
                      />
                    ) : a.allumage === 'reglage' ? (
                      <Pill tone="muted">{etatDuReglage(a)}</Pill>
                    ) : (
                      <span style={{ color: 'var(--color-vert, #2F6B4F)' }}>● {ALLUMAGE_DIT[a.allumage]}</span>
                    )}
                  </span>
                  <span style={{ flex: '0 0 90px', textAlign: 'right' }}>
                    {a.id === 'rappel-j1' ? (
                      <button type="button" onClick={() => setHeuresOuvertes((o) => !o)} aria-expanded={heuresOuvertes} title="Les heures du rappel de la veille" style={{ background: 'none', border: 'none', padding: 0, color: 'var(--copper-700)', fontSize: 12.5, cursor: 'pointer' }}>{heuresOuvertes ? 'Fermer' : 'Réglages ›'}</button>
                    ) : a.reglage ? (
                      <button type="button" onClick={() => navigate(a.reglage!.vers)} title={a.reglage.dit} style={{ background: 'none', border: 'none', padding: 0, color: 'var(--copper-700)', fontSize: 12.5, cursor: 'pointer' }}>Réglages ›</button>
                    ) : a.types.length ? (
                      <button type="button" onClick={() => navigate(`/conversations?envois=1&type=${encodeURIComponent(a.types[0])}`)} title={`Le journal : ${typeDit(a.types[0])}`} style={{ background: 'none', border: 'none', padding: 0, color: 'var(--copper-700)', fontSize: 12.5, cursor: 'pointer' }}>Les envois ›</button>
                    ) : null}
                  </span>
                </div>
                {a.id === 'rappel-j1' && heuresOuvertes && (
                  <ReglageDesHeuresDesRappels autoCfg={autoCfg} setAutoCfg={setAutoCfg} onFermer={() => setHeuresOuvertes(false)} />
                )}
                </Fragment>
              );
            })}
          </div>
        ))}
      </Card>

      <div style={{ marginTop: 18, border: '1px dashed var(--hairline)', borderRadius: 4, padding: '16px 20px' }}>
        <div className="mnd-eyebrow" style={{ fontSize: 10, color: 'var(--ink-soft)' }}>Idées pas encore construites · rien ne part</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
          {IDEES_PAS_ENCORE_CONSTRUITES.map((i) => (
            <span key={i} className="mnd-muted" style={{ fontSize: 12.5, border: '1px solid var(--hairline)', borderRadius: 999, padding: '6px 12px' }}>{i}</span>
          ))}
        </div>
        <p className="mnd-muted" style={{ fontSize: 12, margin: '10px 0 0' }}>
          Elles étaient affichées avec un interrupteur qui ne commandait rien. Chacune se construit le jour où vous la demandez.
        </p>
      </div>

      <Card style={{ marginTop: 18, padding: '22px 24px' }}>
        <Eyebrow>Liens insérés dans les messages</Eyebrow>
        <p className="mnd-muted" style={{ fontSize: 12, marginTop: 3, maxWidth: 640, lineHeight: 1.6 }}>
          Le lien MoMo, l’itinéraire et le lien d’avis Google sont insérés tels quels dans les messages automatiques, rappels, relances, invitations. Ils se règlent aussi dans Paramètres → Automatisations.
        </p>
        <div className="tr-grid tr-grid--2" style={{ marginTop: 16 }}>
          <Field label="Lien de paiement MoMo">
            <Input value={autoCfg.momoLink} onChange={(e) => setAutoCfg({ ...autoCfg, momoLink: e.target.value })} />
          </Field>
          <Field label="Lien Google Maps · itinéraire">
            <Input value={autoCfg.mapsLink} onChange={(e) => setAutoCfg({ ...autoCfg, mapsLink: e.target.value })} />
          </Field>
          <Field label="Lien Google Avis">
            <Input value={autoCfg.reviewLink} onChange={(e) => setAutoCfg({ ...autoCfg, reviewLink: e.target.value })} />
          </Field>
          <Field label="Itinéraire · texte libre">
            <Textarea rows={2} value={autoCfg.itineraire} onChange={(e) => setAutoCfg({ ...autoCfg, itineraire: e.target.value })} />
          </Field>
        </div>
      </Card>
    </div>
  );
}

/* ══════════════════════════════ L'AUDIENCE ══════════════════════════════ */

export function OngletAudience({ abonnes, onEcrire }: { abonnes: ReadonlySet<string>; onEcrire: (cle: string) => void }) {
  const { currency } = useBranch();
  const navigate = useNavigate();
  const { base, ctx } = useAudiences();
  const [invoices] = useInvoices();
  const [segmentList] = useSegments();
  const [segNotes, setSegNotes] = useStore(segmentNotesStore);
  const [segEdit, setSegEdit] = useState<string | null>(null);
  const [segEditVal, setSegEditVal] = useState('');
  const [newSeg, setNewSeg] = useState('');

  /* Valeur moyenne réelle : factures payées des têtes du segment. « — » tant
     qu'aucune n'a payé, la Maison n'invente pas un panier. */
  const payeParTete = useMemo(() => {
    const m = new Map<string, number>();
    for (const i of invoices) {
      if (i.kind !== 'facture' || i.status !== 'payée' || !i.clientId) continue;
      m.set(i.clientId, (m.get(i.clientId) ?? 0) + invoiceTotal(i));
    }
    return m;
  }, [invoices]);

  const lignesDesSegments = useMemo(() => {
    /* Un segment orphelin (porté par des fiches, absent de la liste) se
       montre quand même : le taire reviendrait à cacher des clientes. */
    const portes = new Set(base.flatMap((c) => c.segments ?? []));
    const orphelins = [...portes].filter((s) => !segmentList.includes(s));
    return [...segmentList, ...orphelins].map((seg) => {
      const membres = membresDeLAudience(cleDuSegment(seg), base, ctx);
      const p = porteeDeLAudience(membres, abonnes);
      const paye = membres.reduce((s, c) => s + (payeParTete.get(c.id) ?? 0), 0);
      return { seg, orphelin: !segmentList.includes(seg), n: membres.length, valeur: membres.length ? Math.round(paye / membres.length) : 0, whatsapp: p.whatsapp.length, notification: p.notification.length };
    }).sort((a, b) => b.n - a.n || a.seg.localeCompare(b.seg, 'fr'));
  }, [base, ctx, segmentList, abonnes, payeParTete]);

  const calculees = useMemo(() => AUDIENCES_CALCULEES.map((a) => {
    const membres = membresDeLAudience(a.cle, base, ctx);
    const p = porteeDeLAudience(membres, abonnes);
    return { ...a, n: membres.length, whatsapp: p.whatsapp.length, notification: p.notification.length };
  }), [base, ctx, abonnes]);

  const setNote = (seg: string, patch: SegmentNote) => setSegNotes((prev) => ({ ...prev, [seg]: { ...(prev[seg] ?? {}), ...patch } }));
  const commitSegRename = (from: string) => {
    const to = segEditVal.trim();
    /* Renomme la liste ET les fiches taguées ; les notes suivent le nom. */
    if (to && to !== from) {
      renameSegment(from, to);
      setSegNotes((prev) => {
        const note = prev[from];
        if (!note) return prev;
        const { [from]: _drop, ...rest } = prev;
        return { ...rest, [to]: note };
      });
    }
    setSegEdit(null);
    setSegEditVal('');
  };
  const dropSegment = async (name: string, size: number) => {
    const msg = size > 0
      ? `Retirer « ${name} » ? ${size} fiche${size > 1 ? 's' : ''} le porte${size > 1 ? 'nt' : ''} : le tag sera retiré de ces fiches.`
      : `Retirer le segment « ${name} » ?`;
    if (!await demande({ quoi: 'Segment de la Maison', titre: `Retirer le segment « ${name} » ?`, dit: msg, accepter: 'Retirer le segment', refuser: 'Garder le segment', dur: true })) return;
    removeSegment(name, true);
    setSegNotes((prev) => {
      const { [name]: _drop, ...rest } = prev;
      return rest;
    });
  };
  const addNewSeg = () => { addSegment(newSeg); setNewSeg(''); };
  const voir = (cle: string) => navigate(`/customers?audience=${encodeURIComponent(cle)}`);

  const gestes = (cle: string, n: number) => (
    <span style={{ display: 'inline-flex', gap: 12, alignItems: 'center', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
      <button type="button" onClick={() => voir(cle)} style={{ background: 'none', border: 'none', padding: 0, color: 'var(--copper-700)', fontSize: 12.5, cursor: 'pointer', whiteSpace: 'nowrap' }}>{n === 1 ? 'Voir la tête ›' : `Voir les ${n} ›`}</button>
      <Button size="sm" onClick={() => onEcrire(cle)}>Écrire</Button>
    </span>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <p className="mnd-muted" style={{ fontSize: 13, maxWidth: 760, lineHeight: 1.6, margin: 0 }}>
        Une audience est une liste de gens à qui l’on écrit. « Voir » ouvre ses têtes au registre des Clientes, « Écrire » ouvre Offres et remises de l’Assistant Maison. Les clientes de passage n’en font pas partie.
      </p>

      <Card style={{ overflow: 'hidden' }}>
        <div className="mnd-eyebrow" style={{ fontSize: 10, color: 'var(--copper-700)', padding: '14px 18px 6px' }}>Les segments · posés à la main sur les fiches</div>
        <div className="mnd-scroll-x">
          <table className="tre-table">
            <thead>
              <tr><th>Segment</th><th>Têtes</th><th>Valeur moy.</th><th>Accord WhatsApp</th><th>Notifications</th><th>Propension</th><th>Moment idéal</th><th /><th /></tr>
            </thead>
            <tbody>
              {lignesDesSegments.length === 0 && (
                <tr><td colSpan={9} className="mnd-muted" style={{ textAlign: 'center', padding: 28 }}>Aucun segment, nommez le premier ci-dessous.</td></tr>
              )}
              {lignesDesSegments.map((a) => {
                const note = segNotes[a.seg] ?? {};
                return (
                  <tr key={a.seg}>
                    <td>
                      {segEdit === a.seg ? (
                        <Input
                          autoFocus
                          value={segEditVal}
                          onChange={(e) => setSegEditVal(e.target.value)}
                          onBlur={() => commitSegRename(a.seg)}
                          onKeyDown={(e) => { if (e.key === 'Enter') commitSegRename(a.seg); if (e.key === 'Escape') setSegEdit(null); }}
                          style={{ maxWidth: 190 }}
                        />
                      ) : (
                        <button type="button" className="tre-segname" title="Renommer, les fiches taguées suivent" onClick={() => { setSegEdit(a.seg); setSegEditVal(a.seg); }}>
                          {a.seg}
                          {a.orphelin && <span className="tre-orphan" title="Porté par des fiches mais absent de la liste">hors liste</span>}
                        </button>
                      )}
                    </td>
                    <td>{a.n}</td>
                    <td className={a.valeur > 0 ? 'num' : 'num mnd-muted'}>{a.valeur > 0 ? fmtMoney(a.valeur, currency) : '—'}</td>
                    <td>{a.n ? a.whatsapp : '—'}</td>
                    <td>{a.n ? a.notification : '—'}</td>
                    <td><Input value={note.propension ?? ''} placeholder="—" onChange={(e) => setNote(a.seg, { propension: e.target.value })} style={{ maxWidth: 150 }} /></td>
                    <td><Input value={note.moment ?? ''} placeholder="—" onChange={(e) => setNote(a.seg, { moment: e.target.value })} style={{ maxWidth: 150 }} /></td>
                    <td style={{ textAlign: 'right' }}>{a.n > 0 ? gestes(cleDuSegment(a.seg), a.n) : <span className="mnd-muted" style={{ fontSize: 12 }}>aucune tête</span>}</td>
                    <td style={{ textAlign: 'right' }}>
                      <button type="button" className="tre-segdel" title="Retirer ce segment" aria-label={`Retirer le segment ${a.seg}`} onClick={() => dropSegment(a.seg, a.n)}>✕</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '12px 18px', borderTop: '1px solid var(--hairline)', flexWrap: 'wrap' }}>
          <Input value={newSeg} placeholder="Nommer un segment" onChange={(e) => setNewSeg(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') addNewSeg(); }} style={{ maxWidth: 260 }} />
          <Button variant="ghost" onClick={addNewSeg}>+ Segment</Button>
          <span className="mnd-muted" style={{ fontSize: 11, marginLeft: 'auto' }}>Têtes, valeur et accords viennent du vécu · propension et moment sont la parole des maîtres.</span>
        </div>
      </Card>

      <Card style={{ overflow: 'hidden' }}>
        <div className="mnd-eyebrow" style={{ fontSize: 10, color: 'var(--copper-700)', padding: '14px 18px 6px' }}>Audiences calculées · toujours à jour, sans rien poser</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
          {calculees.map((a) => (
            <div key={a.cle} style={{ padding: '14px 18px', borderTop: '1px solid var(--hairline)', display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={{ fontFamily: 'var(--font-serif)', fontSize: 19, color: 'var(--color-indigo)' }}>{a.nom}</span>
              <span className="mnd-muted" style={{ fontSize: 12 }}>{a.dit}</span>
              <span style={{ fontSize: 13 }}>{a.n} tête{a.n > 1 ? 's' : ''} · {a.whatsapp} d’accord · {a.notification} avec les notifications</span>
              {a.n > 0 ? gestes(a.cle, a.n) : <span className="mnd-muted" style={{ fontSize: 12 }}>personne aujourd’hui</span>}
            </div>
          ))}
        </div>
      </Card>

      <Card style={{ padding: '16px 20px' }}>
        <Eyebrow>L’accord pour les nouvelles de la Maison</Eyebrow>
        <p style={{ fontSize: 13, lineHeight: 1.6, margin: '6px 0 0', maxWidth: 820 }}>
          WhatsApp n’autorise une campagne qu’aux personnes qui l’ont accepté : sans accord noté, la tête ne reçoit aucune campagne WhatsApp, jamais. L’accord se coche sur sa fiche (« Nouvelles de la Maison »), daté.
          Les rappels, confirmations et reçus, eux, n’en dépendent pas. Les notifications ne partent qu’aux têtes qui les ont allumées sur Ma Couronne.
        </p>
      </Card>
    </div>
  );
}

/* ══════════════════════════════ LES CAMPAGNES ══════════════════════════════ */

const demainDixHeures = (): string => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(10, 0, 0, 0);
  return d.toISOString();
};
/** ISO → « AAAA-MM-JJTHH:mm » à l'heure de l'appareil, pour l'entrée datetime-local. */
const versChampLocal = (iso: string): string => {
  const d = new Date(Date.parse(iso) || Date.now());
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

export function campagneNeuve(branchId: string, audience: string): Campagne {
  return { id: `cp-${uid()}`, branchId, nom: '', audience, canaux: ['whatsapp', 'notification'], partA: demainDixHeures(), statut: 'brouillon', creeLe: new Date().toISOString(), creePar: qui() };
}

export function OngletCampagnes({ abonnes, brouillon, onBrouillon }: {
  abonnes: ReadonlySet<string>;
  /** La campagne ouverte dans la fenêtre (null : fermée). */
  brouillon: Campagne | null;
  onBrouillon: (c: Campagne | null) => void;
}) {
  const { branch } = useBranch();
  const navigate = useNavigate();
  const [campagnes, setCampagnes] = useCampaigns();
  const [envois] = useEnvois();
  const [rdvs] = useAppointments();
  const { base, ctx } = useAudiences();

  const lignesPar = useMemo(() => {
    const m = new Map<string, typeof envois>();
    for (const e of envois) {
      const cid = (e as { campagneId?: string }).campagneId;
      if (e?.type !== 'campagne' || !cid) continue;
      m.set(cid, [...(m.get(cid) ?? []), e]);
    }
    return m;
  }, [envois]);

  const liste = useMemo(
    () => campagnes.filter((c) => c && c.branchId === branch.id && typeof c.audience === 'string').sort((a, b) => (b.creeLe ?? '').localeCompare(a.creeLe ?? '')),
    [campagnes, branch.id],
  );

  const accordeAujourdhui = (clientId: string) => {
    const t = base.find((c) => c.id === clientId);
    return !!t && aAccepteLesNouvelles(t);
  };

  const donnerLeFeuVert = async (c: Campagne) => {
    const lignes = lignesPar.get(c.id) ?? [];
    const retenues = lignes.filter((l) => l.statut === 'retenu');
    if (retenues.length === 0) return;
    const parWa = retenues.filter((l) => l.canal === 'whatsapp').length;
    if (!await demande({
      quoi: 'Campagne',
      titre: `Laisser partir « ${c.nom} » ?`,
      dit: `${retenues.length} message${retenues.length > 1 ? 's' : ''} ${retenues.length > 1 ? 'partiront' : 'partira'} ${Date.parse(c.partA) > Date.now() ? `le ${leJourEtLHeure(c.partA)}` : 'dès maintenant'}, jamais entre 20 h et 8 h.${parWa ? ` Meta facture chaque message WhatsApp remis (${parWa}).` : ''}`,
      scelle: 'Un message parti ne se rappelle pas.',
      accepter: 'Donner le feu vert',
      refuser: 'Garder retenue',
    })) return;
    const maintenant = new Date().toISOString();
    const relachees = new Map(feuVert(retenues, accordeAujourdhui, maintenant, qui()).map((l) => [l.id, l]));
    envoisStore.set((prev) => prev.map((e) => relachees.get(e.id) ?? e));
    setCampagnes((prev) => prev.map((x) => (x.id === c.id ? { ...x, feuVertLe: maintenant, feuVertPar: qui() } : x)));
    const ecartees = [...relachees.values()].filter((l) => l.statut === 'écarté').length;
    toast(`Feu vert donné : ${relachees.size - ecartees} message${relachees.size - ecartees > 1 ? 's' : ''} en route${ecartees ? `, ${ecartees} écarté${ecartees > 1 ? 's' : ''} (accord retiré)` : ''}.`);
  };

  return (
    <div>
      <p className="mnd-muted" style={{ fontSize: 13, maxWidth: 820, lineHeight: 1.6, margin: '0 0 16px' }}>
        Une campagne part par la <span style={{ color: 'var(--color-indigo)' }}>salle d’attente des envois</span> : elle y reste retenue jusqu’à votre feu vert, ne part jamais entre 20 h et 8 h,
        et chaque message se retrouve dans Conversations › Envois automatiques. Le résultat se compte en rendez-vous pris et honorés dans les 14 jours.
      </p>
      <Card style={{ overflow: 'hidden' }}>
        <div className="mnd-scroll-x">
          <table className="tre-table">
            <thead>
              <tr><th>Campagne</th><th>À qui</th><th>Par où</th><th>État</th><th>Partis · remis · lus</th><th>Rendez-vous sous 14 jours</th><th /></tr>
            </thead>
            <tbody>
              {liste.length === 0 && (
                <tr><td colSpan={7} className="mnd-muted" style={{ textAlign: 'center', padding: 32 }}>Aucune campagne. « + Campagne », ou « Écrire » depuis l’Audience.</td></tr>
              )}
              {liste.map((c) => {
                const lignes = lignesPar.get(c.id) ?? [];
                const etat = etatDeLaCampagne(c, lignes);
                const r = resultatDeLaCampagne(lignes, rdvs);
                return (
                  <tr key={c.id}>
                    <td>
                      <span style={{ fontFamily: 'var(--font-serif)', fontSize: 17, color: 'var(--color-indigo)' }}>{c.nom || 'Sans nom'}</span>
                      <div className="mnd-muted" style={{ fontSize: 11.5 }}>
                        {r.depart ? `partie le ${leJourEtLHeure(r.depart)}` : etat === 'retenue' ? `partirait le ${leJourEtLHeure(c.partA)}` : `créée le ${leJour(c.creeLe)}`}
                      </div>
                    </td>
                    <td className="mnd-muted">{nomDeLAudience(c.audience)}{lignes.length ? ` · ${lignes.length} message${lignes.length > 1 ? 's' : ''}` : ''}</td>
                    <td>{c.canaux.map((k) => <Pill key={k} tone="muted">{k === 'whatsapp' ? 'WhatsApp' : 'Ma Couronne'}</Pill>)}</td>
                    <td><Pill tone={etat === 'partie' ? 'ok' : etat === 'retenue' ? 'warn' : 'muted'}>{ETAT_DE_LA_CAMPAGNE_DIT[etat]}</Pill></td>
                    <td className="num">{r.depart ? `${r.partis} · ${r.remis} · ${r.lus}` : '—'}</td>
                    <td className="num">{r.depart ? `${r.rdvPris} pris · ${r.rdvHonores} honorés` : '—'}</td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      {etat === 'brouillon' && <Button size="sm" variant="ghost" onClick={() => onBrouillon(c)}>Reprendre</Button>}
                      {etat === 'retenue' && <Button size="sm" onClick={() => void donnerLeFeuVert(c)}>Donner le feu vert</Button>}
                      {(etat === 'en-route' || etat === 'partie' || etat === 'ecartee') && (
                        <button type="button" onClick={() => navigate('/conversations?envois=1&type=campagne')} style={{ background: 'none', border: 'none', padding: 0, color: 'var(--copper-700)', fontSize: 12.5, cursor: 'pointer' }}>Les envois ›</button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {brouillon && (
        <FenetreDeLaCampagne
          initiale={brouillon}
          base={base}
          ctx={ctx}
          abonnes={abonnes}
          onClose={() => onBrouillon(null)}
          onGarde={(c) => {
            setCampagnes((prev) => (prev.some((x) => x.id === c.id) ? prev.map((x) => (x.id === c.id ? c : x)) : [...prev, c]));
            onBrouillon(null);
          }}
        />
      )}
    </div>
  );
}

function FenetreDeLaCampagne({ initiale, base, ctx, abonnes, onClose, onGarde }: {
  initiale: Campagne;
  base: Client[];
  ctx: ReturnType<typeof useAudiences>['ctx'];
  abonnes: ReadonlySet<string>;
  onClose: () => void;
  onGarde: (c: Campagne) => void;
}) {
  const [c, setC] = useState<Campagne>(initiale);
  const [segmentList] = useSegments();
  const pose = (patch: Partial<Campagne>) => setC((x) => ({ ...x, ...patch }));

  const membres = useMemo(() => membresDeLAudience(c.audience, base, ctx), [c.audience, base, ctx]);
  const outils = useMemo(() => ({
    maintenantIso: new Date().toISOString(),
    qui: qui(),
    appel: (t: Client) => appelDe(t),
    prenom: (t: Client) => prenomSeul(t.name),
    numero: (t: Client) => numeroWa(t.phone),
    abonnesAuxNotifications: abonnes,
  }), [abonnes]);
  const lignes = useMemo(() => lignesDuDepot(c, membres, outils), [c, membres, outils]);
  const p = porteeDeLAudience(membres, abonnes);
  const parWa = lignes.filter((l) => l.canal === 'whatsapp').length;
  const parNotif = lignes.length - parWa;
  const manque = ceQuiManque(c, lignes.length);
  const exemple = membres.find((t) => aAccepteLesNouvelles(t)) ?? membres[0];

  const basculeCanal = (k: CanalDeCampagne) =>
    pose({ canaux: c.canaux.includes(k) ? c.canaux.filter((x) => x !== k) : [...c.canaux, k] });

  const deposer = async () => {
    if (manque.length) return;
    if (!await demande({
      quoi: 'Campagne',
      titre: `Déposer « ${c.nom} » dans la salle d’attente ?`,
      dit: `${lignes.length} message${lignes.length > 1 ? 's' : ''} (${parWa} WhatsApp, ${parNotif} notification${parNotif > 1 ? 's' : ''}) attendront retenus. Rien ne part avant votre feu vert.`,
      accepter: 'Déposer, retenue',
      refuser: 'Revenir',
    })) return;
    const maintenant = new Date().toISOString();
    const depot = lignesDuDepot(c, membres, { ...outils, maintenantIso: maintenant });
    const ids = new Set(depot.map((l) => l.id));
    envoisStore.set((prev) => [...prev.filter((e) => !ids.has(e.id)), ...depot]);
    onGarde({ ...c, statut: 'deposee', deposeeLe: maintenant, deposeePar: qui() });
    toast(`${depot.length} message${depot.length > 1 ? 's' : ''} déposé${depot.length > 1 ? 's' : ''}, retenu${depot.length > 1 ? 's' : ''}. Donnez le feu vert depuis la liste.`);
  };

  return (
    <Modal title={initiale.nom ? 'La campagne.' : 'Nouvelle campagne.'} onClose={onClose} width={620}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Field label="Nom de la campagne · pour la Maison, la cliente ne le voit pas">
          <Input value={c.nom} placeholder="L’entretien d’octobre" onChange={(e) => pose({ nom: e.target.value })} />
        </Field>

        <Field label="1 · À qui">
          <Select value={c.audience} onChange={(e) => pose({ audience: e.target.value })}>
            <optgroup label="Les segments">
              {segmentList.map((s) => <option key={s} value={cleDuSegment(s)}>{s}</option>)}
            </optgroup>
            <optgroup label="Audiences calculées">
              {AUDIENCES_CALCULEES.map((a) => <option key={a.cle} value={a.cle}>{a.nom}</option>)}
            </optgroup>
          </Select>
        </Field>
        <div className="mnd-muted" style={{ fontSize: 12.5, lineHeight: 1.6, marginTop: -8 }}>
          {membres.length} tête{membres.length > 1 ? 's' : ''} · {p.whatsapp.length} d’accord sur WhatsApp · {p.notification.length} avec les notifications · {p.sansAccord.length} sans accord noté
        </div>

        <div>
          <div className="mnd-field__label" style={{ marginBottom: 6 }}>2 · Par où · une tête reçoit un seul message, WhatsApp d’abord</div>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            <Toggle on={c.canaux.includes('whatsapp')} onToggle={() => basculeCanal('whatsapp')} label="WhatsApp · modèle « marketing » approuvé, facturé par Meta" />
            <Toggle on={c.canaux.includes('notification')} onToggle={() => basculeCanal('notification')} label="Ma Couronne · notification, gratuite" />
          </div>
        </div>

        {c.canaux.includes('whatsapp') && (
          <>
            <Field label="3 · Le modèle WhatsApp approuvé chez Meta · son nom exact">
              <Input value={c.modele ?? ''} placeholder="nouvelles_de_la_maison" onChange={(e) => pose({ modele: e.target.value.trim() })} style={{ fontFamily: 'ui-monospace, Consolas, monospace' }} />
            </Field>
            <Field label="Son texte, recopié tel qu’approuvé · {{1}} reçoit la civilité et le prénom">
              <Textarea rows={3} value={c.apercu ?? ''} placeholder="Bonjour {{1}}, la Maison MND…" onChange={(e) => pose({ apercu: e.target.value })} />
            </Field>
            {c.apercu && exemple && (
              <div style={{ background: '#E7F1E3', borderRadius: '8px 8px 8px 2px', padding: '10px 12px', fontSize: 13, lineHeight: 1.5 }}>
                {texteDuModele(c.apercu, appelDe(exemple))}
              </div>
            )}
          </>
        )}
        {c.canaux.includes('notification') && (
          <div className="tr-grid tr-grid--2">
            <Field label="Notification · titre">
              <Input value={c.titre ?? ''} placeholder="Maison MND" onChange={(e) => pose({ titre: e.target.value })} />
            </Field>
            <Field label="Notification · texte">
              <Input value={c.corps ?? ''} onChange={(e) => pose({ corps: e.target.value })} />
            </Field>
          </div>
        )}

        <Field label="4 · Quand · jamais entre 20 h et 8 h, et rien ne part sans votre feu vert">
          <Input type="datetime-local" value={versChampLocal(c.partA)} onChange={(e) => { const t = Date.parse(e.target.value); if (Number.isFinite(t)) pose({ partA: new Date(t).toISOString() }); }} />
        </Field>

        {manque.length > 0 && (
          <div className="mnd-muted" style={{ fontSize: 12.5, color: 'var(--copper-700)' }}>Il manque : {manque.join(' · ')}.</div>
        )}

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          <Button variant="ghost" onClick={() => onGarde({ ...c, statut: 'brouillon' })} disabled={!c.nom.trim()}>Garder en brouillon</Button>
          <Button onClick={() => void deposer()} disabled={manque.length > 0}>
            Déposer, retenue · {lignes.length} message{lignes.length > 1 ? 's' : ''}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
