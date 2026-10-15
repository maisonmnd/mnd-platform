import { useEffect, useMemo, useState } from 'react';
import { Button, Field, Select, Textarea, toast } from '../../../../ds/components';
import { useAppointments, type Appointment } from '../../../../shared/agenda';
import { useStaff as useMaTete } from '../../../../shared/auth';
import { useBilans } from '../../../../shared/bilans';
import { dateDite } from '../../../../shared/bilan-document';
import { useServices } from '../../../../shared/catalog';
import { useClients, type Client } from '../../../../shared/clients';
import { appelDe } from '../../../../shared/civilite';
import { lienWaMe } from '../../../../shared/conversations';
import { uid } from '../../../../shared/store';
import {
  ACCUSE_SANTE, DELAI_HEURES, NIVEAUX, NOM_ENTRE_DEUX, SOUCIS, derniereEtProchaine, echeanceDe, enRetard, fileRangee,
  niveauDe, souciDe, type CleDeSouci, type Niveau, type Signalement,
} from '../../../../shared/entre-deux-pur';
import {
  adresseDeLaPhoto, ajouteUnSignalement, poseLaReponse, retoucheLeSignalement, useReponsesEntreDeux, useSignalements,
  type ReponseEntreDeux,
} from '../../../../shared/entre-deux';
import { PageHead } from '../_ui';

/* ══ ENTRE DEUX SÉANCES, AU TRÔNE — 15 octobre 2026 ═════════════════════
   Maquette EfhgzxjA… validée. Ce que les clientes disent de leurs locks entre
   deux rendez-vous, rangé par urgence : Santé (rappel sous 24 h, aucun
   conseil écrit), À voir (la maîtresse rappelle sous 48 h), Conseil donné
   (la réponse validée est partie, on regarde dans la semaine). La maîtresse
   de la dernière séance répond. L'onglet « Les réponses » tient le texte de
   chaque souci : je l'ai écrit en brouillon, la direction le valide ; rien
   ne part aux clientes avant. */

type Vue = 'file' | 'reponses';
const TON: Record<Niveau, string> = { sante: 'var(--danger, #8E2F2F)', voir: 'var(--color-copper)', conseil: 'var(--color-sage, #2F6B4F)' };
const heure = (iso: string): string => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : `${dateDite(iso.slice(0, 10))} à ${d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`;
};

export default function EntreDeuxSeances() {
  const [vue, setVue] = useState<Vue>('file');
  const me = useMaTete();
  return (
    <>
      <PageHead
        eyebrow="Clientèle"
        title={NOM_ENTRE_DEUX}
        sub={`Ce que les clientes disent de leurs locks entre deux rendez-vous. Santé sous ${DELAI_HEURES.sante} heures, À voir sous ${DELAI_HEURES.voir} heures.`}
      />
      <div className="trc-tabs" role="tablist" style={{ marginBottom: 14 }}>
        <button type="button" role="tab" aria-selected={vue === 'file'} className={`trc-tab${vue === 'file' ? ' is-active' : ''}`} onClick={() => setVue('file')}>La file</button>
        <button type="button" role="tab" aria-selected={vue === 'reponses'} className={`trc-tab${vue === 'reponses' ? ' is-active' : ''}`} onClick={() => setVue('reponses')}>Les réponses</button>
      </div>
      {vue === 'file' ? <LaFile moi={me?.name ?? ''} /> : <LesReponses souverain={me?.role === 'souverain'} moi={me?.name ?? ''} />}
    </>
  );
}

function LaFile({ moi }: { moi: string }) {
  const signalements = useSignalements();
  const [clients] = useClients();
  const [appts] = useAppointments();
  const [mienne, setMienne] = useState(false);
  const [ouvert, setOuvert] = useState<string | null>(null);
  const [nouveau, setNouveau] = useState(false);
  const maintenant = new Date().toISOString();
  const parId = useMemo(() => new Map(clients.map((c) => [c.id, c])), [clients]);
  const file = fileRangee(signalements).filter((s) => !mienne || (s.maitre ?? '') === moi);
  const traites = signalements.filter((s) => s.etat === 'traite' && !s.bien && Date.parse(s.traiteLe ?? s.quand) > Date.now() - 7 * 86_400_000);
  const bien = signalements.filter((s) => s.bien && s.quand.slice(0, 7) === maintenant.slice(0, 7)).length;
  const colonnes: { cle: Niveau | 'traite'; titre: string; liste: Signalement[] }[] = [
    { cle: 'sante', titre: 'Santé', liste: file.filter((s) => niveauDe(s.soucis) === 'sante') },
    { cle: 'voir', titre: 'À voir', liste: file.filter((s) => niveauDe(s.soucis) === 'voir') },
    { cle: 'conseil', titre: 'Conseil donné', liste: file.filter((s) => niveauDe(s.soucis) === 'conseil') },
    { cle: 'traite', titre: 'Traité, 7 jours', liste: traites },
  ];
  const retard = file.filter((s) => enRetard(s, maintenant)).length;
  const choisi = signalements.find((s) => s.id === ouvert);
  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div className="trc-kpis" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
        <div className={`trc-kpi${colonnes[0].liste.length ? ' trc-kpi--live' : ''}`}><b>{colonnes[0].liste.length}</b><span>santé à rappeler</span></div>
        <div className="trc-kpi"><b>{colonnes[1].liste.length}</b><span>à voir</span></div>
        <div className={`trc-kpi${retard ? ' trc-kpi--live' : ''}`}><b>{retard}</b><span>en retard</span></div>
        <div className="trc-kpi"><b>{bien}</b><span>« tout va bien » ce mois</span></div>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13 }}><input type="checkbox" checked={mienne} onChange={(e) => setMienne(e.target.checked)} /> Mes clientes seulement</label>
        <span style={{ marginLeft: 'auto' }}><Button variant="ghost" onClick={() => setNouveau(true)}>+ Noter un souci dit au téléphone</Button></span>
      </div>
      <div className="rh-colonnes">
        {colonnes.map((col) => (
          <div key={col.cle} className="rh-colonne">
            <h4><span>{col.titre}</span><span>{col.liste.length}</span></h4>
            {col.liste.map((s) => {
              const c = parId.get(s.clientId);
              return (
                <button key={s.id} type="button" className="rh-fichette" onClick={() => setOuvert(s.id)} style={{ borderLeft: `3px solid ${col.cle === 'traite' ? 'var(--hairline)' : TON[col.cle]}` }}>
                  <b>{c?.name ?? 'Cliente'}</b>
                  <small>{s.soucis.map((k) => souciDe(k)?.dit ?? k).join(', ') || 'Un mot'}</small>
                  <small>{heure(s.quand)}{s.etat === 'ouvert' && enRetard(s, maintenant) ? ' · en retard' : ''}</small>
                </button>
              );
            })}
            {col.liste.length === 0 && <span className="sad-doux">Personne.</span>}
          </div>
        ))}
      </div>
      {choisi && <LeSouci s={choisi} client={parId.get(choisi.clientId)} appts={appts} moi={moi} onClose={() => setOuvert(null)} />}
      {nouveau && <NoterUnSouci clients={clients} moi={moi} onClose={() => setNouveau(false)} />}
      <p className="sad-doux">Les clientes qui ont Ma Couronne reçoivent la question « Comment vont vos locks ? » une semaine après la séance et une semaine avant la suivante. Les autres la recevront sur WhatsApp dès que le modèle Meta sera approuvé.</p>
    </div>
  );
}

function LeSouci({ s, client, appts, moi, onClose }: { s: Signalement; client?: Client; appts: Appointment[]; moi: string; onClose: () => void }) {
  const [services] = useServices();
  const [bilans] = useBilans();
  const [note, setNote] = useState(s.note ?? '');
  const [photo, setPhoto] = useState<string | null>(null);
  useEffect(() => { let vivant = true; if (s.photo) void adresseDeLaPhoto(s.photo).then((u) => { if (vivant) setPhoto(u); }); return () => { vivant = false; }; }, [s.photo]);
  const niveau = niveauDe(s.soucis);
  const siens = appts.filter((a) => a.clientId === s.clientId).map((a) => ({ id: a.id, date: a.date, status: a.status, master: a.master, serviceIds: a.serviceIds }));
  const { derniere, prochaine } = derniereEtProchaine(siens, s.quand.slice(0, 10));
  const nomDe = (ids?: string[]) => (ids ?? []).map((id) => services.find((x) => x.id === id)?.name ?? '').filter(Boolean).join(', ');
  const dernierBilan = bilans.filter((b) => b.clientId === s.clientId).sort((a, b) => b.remisLe.localeCompare(a.remisLe))[0];
  const prenom = (client?.name ?? '').split(' ')[0];
  /* La civilité de sa fiche, sinon son prénom seul (règle du 13 octobre 2026). */
  const appel = client ? appelDe(client) : 'Madame, Monsieur';
  const ecrire = (texte: string) => {
    const l = lienWaMe(client?.phone, texte);
    if (l) window.open(l, '_blank', 'noopener'); else toast('Pas de numéro sur sa fiche : appelez-la.');
  };
  const clore = () => {
    retoucheLeSignalement(s, { etat: 'traite', traiteLe: new Date().toISOString(), traitePar: moi || 'La Maison', ...(note.trim() ? { note: note.trim() } : {}) });
    toast('Traité.');
    onClose();
  };
  return (
    <div className="sad-ligne" style={{ border: `1px solid ${TON[niveau]}`, borderRadius: 8, padding: 14, display: 'grid', gap: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', alignItems: 'baseline' }}>
        <b style={{ fontFamily: 'var(--font-serif)', fontSize: 20 }}>{client?.name ?? 'Cliente'} · {s.soucis.map((k) => souciDe(k)?.dit ?? k).join(', ') || 'un mot'}</b>
        <span style={{ color: TON[niveau], fontSize: 13 }}>{NIVEAUX[niveau]} · {s.etat === 'traite' ? `traité le ${dateDite((s.traiteLe ?? s.quand).slice(0, 10))}` : `avant le ${heure(echeanceDe(niveau, s.quand))}`}</span>
      </div>
      <p className="sad-doux" style={{ margin: 0 }}>
        Signalé le {heure(s.quand)}, {s.canal === 'couronne' ? 'depuis Ma Couronne' : s.canal === 'whatsapp' ? 'sur WhatsApp' : 'au téléphone'}.
        {derniere ? ` Séance d’avant : ${dateDite(derniere.date)}${nomDe((derniere as { serviceIds?: string[] }).serviceIds) ? ` (${nomDe((derniere as { serviceIds?: string[] }).serviceIds)})` : ''}${derniere.master ? `, ${derniere.master}` : ''}.` : ''}
        {prochaine ? ` Prochaine : ${dateDite(prochaine.date)}.` : ' Aucune séance à venir.'}
      </p>
      {dernierBilan && <p className="sad-doux" style={{ margin: 0 }}>Dernier bilan ({dateDite(dernierBilan.date)}) : {dernierBilan.jauges.map((j) => `${j.nom.toLowerCase()} ${j.valeur} sur 5${j.note ? `, « ${j.note} »` : ''}`).join(' ; ')}.</p>}
      {s.texte && <p style={{ margin: 0 }}>« {s.texte} »</p>}
      {photo && <img src={photo} alt={`La photo envoyée par ${prenom || 'la cliente'}`} style={{ maxWidth: 'min(100%, 360px)', borderRadius: 6 }} />}
      {s.reponse && <p className="sad-doux" style={{ margin: 0 }}>Elle a reçu tout de suite : « {s.reponse} »</p>}
      <p className="sad-doux" style={{ margin: 0 }}>Ce qui peut suivre : {s.soucis.map((k) => souciDe(k)?.suite).filter(Boolean).join(' ; ') || 'selon ce qu’elle dit'}.</p>
      <Field label="Ce que la Maison a fait"><Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Appelée, conseil donné, rendez-vous avancé…" /></Field>
      <div className="sec-actions" style={{ justifyContent: 'flex-end', flexWrap: 'wrap' }}>
        <Button variant="ghost" onClick={() => ecrire(`Bonjour ${appel}, ici la Maison MND. Nous avons bien lu ce que vous nous avez dit de vos locks. Quand pouvons-nous vous appeler ?`)}>Écrire sur WhatsApp</Button>
        <Button variant="ghost" onClick={() => ecrire(`Bonjour ${appel}, ici la Maison MND. Pour vos locks, nous vous proposons d’avancer votre rendez-vous. Choisissez l’heure qui vous va dans Ma Couronne, ou répondez-nous ici.`)}>Proposer d’avancer</Button>
        {s.etat === 'ouvert' ? <Button variant="copper" onClick={clore}>Noter et clore</Button> : <Button variant="ghost" onClick={() => { retoucheLeSignalement(s, { note: note.trim() || undefined }); onClose(); }}>Garder la note</Button>}
        <Button variant="ghost" onClick={onClose}>Fermer</Button>
      </div>
    </div>
  );
}

function NoterUnSouci({ clients, moi, onClose }: { clients: Client[]; moi: string; onClose: () => void }) {
  const [clientId, setClientId] = useState('');
  const [pris, setPris] = useState<CleDeSouci[]>([]);
  const [texte, setTexte] = useState('');
  const actives = useMemo(() => clients.filter((c) => !c.archived).sort((a, b) => a.name.localeCompare(b.name)), [clients]);
  const garde = () => {
    const c = actives.find((x) => x.id === clientId);
    if (!c) { toast('Quelle cliente ?'); return; }
    if (pris.length === 0 && !texte.trim()) { toast('Quel souci ?'); return; }
    ajouteUnSignalement({
      id: `sig-${uid()}`, branchId: c.branchId, clientId: c.id, soucis: pris.length ? pris : ['autre'],
      ...(texte.trim() ? { texte: texte.trim() } : {}), canal: 'trone', quand: new Date().toISOString(), etat: 'ouvert', maitre: moi || undefined,
    });
    toast('Noté dans la file.');
    onClose();
  };
  return (
    <div className="sad-ligne" style={{ border: '1px solid var(--hairline)', borderRadius: 8, padding: 14, display: 'grid', gap: 10 }}>
      <b>Un souci dit au téléphone, ou au comptoir</b>
      <Field label="La cliente"><Select value={clientId} onChange={(e) => setClientId(e.target.value)}><option value="">Choisir</option>{actives.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {SOUCIS.map((s) => (
          <label key={s.cle} className="sad-case"><input type="checkbox" checked={pris.includes(s.cle)} onChange={() => setPris((x) => (x.includes(s.cle) ? x.filter((y) => y !== s.cle) : [...x, s.cle]))} /> {s.dit}</label>
        ))}
      </div>
      <Field label="Ce qu’elle a dit"><Textarea rows={2} value={texte} onChange={(e) => setTexte(e.target.value)} /></Field>
      <div className="sec-actions" style={{ justifyContent: 'flex-end' }}>
        <Button variant="ghost" onClick={onClose}>Annuler</Button>
        <Button variant="copper" onClick={garde}>Noter</Button>
      </div>
    </div>
  );
}

function LesReponses({ souverain, moi }: { souverain: boolean; moi: string }) {
  const reponses = useReponsesEntreDeux();
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <p className="sad-doux" style={{ margin: 0 }}>
        La réponse qu’une cliente reçoit tout de suite, souci par souci. J’ai écrit les brouillons ; rien ne part tant que la direction ne les a pas validés.
        En Santé, aucun conseil n’est jamais envoyé : la cliente reçoit « {ACCUSE_SANTE} »
      </p>
      {SOUCIS.map((s) => <UneReponse key={s.cle} cle={s.cle} dit={s.dit} niveau={s.niveau} brouillon={s.brouillon} r={reponses.find((x) => x.id === s.cle)} souverain={souverain} moi={moi} />)}
    </div>
  );
}

function UneReponse({ cle, dit, niveau, brouillon, r, souverain, moi }: {
  cle: CleDeSouci; dit: string; niveau: Niveau; brouillon: string; r?: ReponseEntreDeux; souverain: boolean; moi: string;
}) {
  const [texte, setTexte] = useState(r?.texte ?? brouillon);
  useEffect(() => { if (r?.texte) setTexte(r.texte); }, [r?.texte]);
  const sante = niveau === 'sante';
  const valide = !!r?.texteValide && r.texteValide === texte.trim();
  const garde = (valider: boolean) => {
    const t = texte.trim();
    if (!t) { toast('Le texte est vide.'); return; }
    poseLaReponse({
      id: cle, texte: t,
      ...(valider ? { texteValide: t, valideeLe: new Date().toISOString(), validePar: moi || 'La direction' }
        : r?.texteValide ? { texteValide: r.texteValide, valideeLe: r.valideeLe, validePar: r.validePar } : {}),
    });
    toast(valider ? 'Réponse validée : elle part désormais aux clientes.' : 'Brouillon gardé.');
  };
  return (
    <div className="sad-ligne" style={{ border: '1px solid var(--hairline)', borderRadius: 8, padding: 12, display: 'grid', gap: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <b>{dit}</b>
        <span style={{ fontSize: 12.5, color: TON[niveau] }}>{NIVEAUX[niveau]} · {sante ? 'jamais de conseil écrit' : valide ? `validée le ${dateDite((r?.valideeLe ?? '').slice(0, 10))}` : r?.texteValide ? 'retouchée : à revalider' : 'brouillon, pas encore envoyé'}</span>
      </div>
      {sante
        ? <p className="sad-doux" style={{ margin: 0 }}>La cliente reçoit l’accusé de Santé, et sa maîtresse la rappelle. Le brouillon ci-dessous sert de mémo à l’équipe : « {brouillon} »</p>
        : (
          <>
            <Textarea rows={3} value={texte} onChange={(e) => setTexte(e.target.value)} disabled={!souverain} />
            {souverain ? (
              <div className="sec-actions" style={{ justifyContent: 'flex-end' }}>
                <Button variant="ghost" onClick={() => garde(false)}>Garder le brouillon</Button>
                <Button variant="copper" disabled={valide} onClick={() => garde(true)}>{valide ? 'Validée' : 'Valider la réponse'}</Button>
              </div>
            ) : <p className="sad-doux" style={{ margin: 0 }}>Seule la direction valide une réponse.</p>}
          </>
        )}
    </div>
  );
}
