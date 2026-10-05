import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button, Field, Input, Modal, toast } from '../../../../ds/components';
import type { Client } from '../../../../shared/clients';
import type { Appointment } from '../../../../shared/agenda';
import type { Service } from '../../../../shared/catalog';
import {
  JAUGES_SEED, RITUEL_SEED, dernierBilanDe, prochainNumeroBilan, remettreBilan, useBilans,
  type Bilan, type JaugeBilan, type TempsRituel,
} from '../../../../shared/bilans';
import {
  alertesDuTexte, natureDite, sansTiretLong,
  type BrouillonDeBilan, type NatureDuCheveu, type PropositionDuBilan,
} from '../../../../shared/bilan-assistant-pur';
import { INGREDIENTS_DU_BILAN, nomDeLIngredient } from '../../../../shared/bilan-assistant';
import { annonceLeBilan, donneesDuBilanPdf, envoieLeBilan } from '../../../../shared/bilan-document';
import { useAuth } from '../../../../shared/auth';
import { appelDe } from '../../../../shared/civilite';
import { apptLabel, frShort, todayISO } from './_shared';
import { ChampDeDate } from '../../../../ds/dates';

/* LA REMISE D'UN BILAN — le Carnet de Suivi s'écrit ICI.

   Avant, le bouton de la fiche ouvrait la papeterie : belle, pré-remplie,
   et AMNÉSIQUE. Désormais « Signer et remettre » ENREGISTRE (la cliente le
   lit sur Ma Couronne), et le PDF Maison MND part sur WhatsApp ou s'imprime.

   L'ASSISTANT PROPOSE, LE MAÎTRE SIGNE — 4 octobre 2026. Ouverte depuis la
   note de séance du rendez-vous, la fiche arrive remplie par l'assistant,
   marquée « Proposé par l'assistant · à relire ». Chaque phrase se modifie ;
   « Reformuler » et « Plus court » redemandent ; ce qui demande un jugement
   (un prix, le mot « salon », le tutoiement) est SIGNALÉ, jamais corrigé en
   silence. La marque disparaît à la signature : le bilan porte le nom du
   maître.

   SANS ASSISTANT, LE PROCHAIN BILAN SE PRÉ-REMPLIT DU PRÉCÉDENT : jauges,
   rituel, durée. La couronne s'évalue dans la continuité. */

const POINTS_VIDES = ['', '', ''];

export type Redemande = (demande: 'reformuler' | 'raccourcir', actuel: BrouillonDeBilan) => Promise<BrouillonDeBilan>;

export function BilanModal({ client, honored, byId, branchId, onClose, seance, brouillon, nature, surRedemande, surRemis, parLaMain }: {
  client: Client;
  honored: Appointment[];
  byId: Map<string, Service>;
  branchId: string;
  onClose: () => void;
  /** La séance d'où l'on vient (le rendez-vous) — sinon la dernière honorée. */
  seance?: Appointment;
  /** Ce que l'assistant a rédigé : la fiche s'ouvre remplie. */
  brouillon?: BrouillonDeBilan;
  nature?: NatureDuCheveu;
  surRedemande?: Redemande;
  surRemis?: (b: Bilan) => void;
  /** Le brouillon vient de la note du maître, pas de l'assistant : aucun
      crédit, aucune marque « proposé par l'assistant ». */
  parLaMain?: boolean;
}) {
  const [bilans] = useBilans();
  const { session } = useAuth();
  const precedent = dernierBilanDe(bilans, client.id);
  const template = useMemo(
    () => seance ?? [...honored].sort((a, b) => b.date.localeCompare(a.date))[0],
    [honored, seance],
  );
  const prenom = client.name.split(' ')[0];

  const [date, setDate] = useState(template?.date ?? todayISO());
  const [prestation, setPrestation] = useState(template ? apptLabel(template, byId) : '');
  const [praticien, setPraticien] = useState(template?.master ?? precedent?.praticien ?? '');
  const [duree, setDuree] = useState(precedent?.duree ?? '');

  /* Ce que l'assistant propose, ou ce que le bilan d'avant disait. */
  const depart = (b?: BrouillonDeBilan) => ({
    jauges: (b ? b.jauges : precedent?.jauges?.length ? precedent.jauges : JAUGES_SEED).map((j) => ({ ...j })),
    points: b ? [...b.points, '', '', ''].slice(0, 3) : precedent?.points?.length ? [...precedent.points, '', ''].slice(0, 3) : POINTS_VIDES,
    rituel: (b ? b.rituel : precedent?.rituel?.length ? precedent.rituel : RITUEL_SEED).map((t) => ({ ...t, ingredients: [...(t.ingredients ?? [])] })),
  });
  const d0 = depart(brouillon);
  const [prochaineVisite, setProchaineVisite] = useState(brouillon?.prochaineVisite ?? '');
  const [jauges, setJauges] = useState<JaugeBilan[]>(d0.jauges);
  const [points, setPoints] = useState<string[]>(d0.points);
  const [rituel, setRituel] = useState<TempsRituel[]>(d0.rituel);
  const [diagnostic, setDiagnostic] = useState(brouillon?.diagnostic ?? '');
  const [sens, setSens] = useState(brouillon?.sens ?? '');
  const [solutions, setSolutions] = useState(brouillon?.solutions ?? '');
  const [propositions, setPropositions] = useState<PropositionDuBilan[]>(brouillon?.propositions ?? []);
  const [resume, setResume] = useState(brouillon?.resume ?? '');
  const [message, setMessage] = useState(brouillon?.message ?? '');
  const [alerteMedicale, setAlerteMedicale] = useState(brouillon?.alerteMedicale ?? '');
  const [parAssistant, setParAssistant] = useState(!!brouillon && !parLaMain);
  const [redemande, setRedemande] = useState<'' | 'reformuler' | 'raccourcir'>('');

  const numero = prochainNumeroBilan(bilans);
  const [remis, setRemis] = useState<Bilan | null>(null);
  const [occupe, setOccupe] = useState('');

  const setJauge = (i: number, patch: Partial<JaugeBilan>) =>
    setJauges((js) => js.map((j, k) => (k === i ? { ...j, ...patch } : j)));
  const setPoint = (i: number, v: string) => setPoints((ps) => ps.map((p, k) => (k === i ? v : p)));
  const setTemps = (i: number, patch: Partial<TempsRituel>) => setRituel((ts) => ts.map((t, k) => (k === i ? { ...t, ...patch } : t)));

  const services = useMemo(() => [...byId.values()].sort((a, b) => a.name.localeCompare(b.name)), [byId]);

  /* L'état de la fiche, dit comme l'assistant le rend : c'est ce qu'on lui
     renvoie pour « Reformuler » et « Plus court ». */
  const actuel = (): BrouillonDeBilan => ({
    diagnostic, sens, solutions, propositions, resume, message, alerteMedicale, prochaineVisite,
    rituel: rituel.map((t) => ({ nom: t.nom as BrouillonDeBilan['rituel'][number]['nom'], cadence: t.cadence, texte: t.texte, ingredients: t.ingredients ?? [] })),
    jauges, points: points.map((p) => p.trim()).filter(Boolean),
  });

  const applique = (b: BrouillonDeBilan) => {
    const d = depart(b);
    setJauges(d.jauges); setPoints(d.points); setRituel(d.rituel);
    setDiagnostic(b.diagnostic); setSens(b.sens); setSolutions(b.solutions);
    setPropositions(b.propositions); setResume(b.resume); setMessage(b.message);
    setAlerteMedicale(b.alerteMedicale); setProchaineVisite(b.prochaineVisite);
    setParAssistant(true);
  };

  const redemander = async (quoi: 'reformuler' | 'raccourcir') => {
    if (!surRedemande || redemande) return;
    setRedemande(quoi);
    try { applique(await surRedemande(quoi, actuel())); } catch (e) { toast((e as Error).message); } finally { setRedemande(''); }
  };

  const alertes = useMemo(
    () => alertesDuTexte([diagnostic, sens, solutions, resume, message, prochaineVisite, ...points,
      ...rituel.map((t) => `${t.cadence} ${t.texte}`), ...propositions.map((p) => p.quand), ...jauges.map((j) => j.note)].join('\n')),
    [diagnostic, sens, solutions, resume, message, prochaineVisite, points, rituel, propositions, jauges],
  );

  const champs = (): Omit<Bilan, 'id'> => ({
    branchId,
    clientId: client.id,
    apptId: template?.id,
    numero,
    date,
    prestation: prestation.trim() || undefined,
    praticien: praticien.trim() || undefined,
    duree: duree.trim() || undefined,
    prochaineVisite: sansTiretLong(prochaineVisite) || undefined,
    jauges,
    points: points.map((t) => sansTiretLong(t)).filter(Boolean),
    rituel: rituel.map((t) => ({ ...t, texte: sansTiretLong(t.texte), ingredients: t.ingredients?.length ? t.ingredients : undefined })),
    remisLe: todayISO(),
    ...(nature ? { nature } : {}),
    ...(diagnostic.trim() ? { diagnostic: sansTiretLong(diagnostic) } : {}),
    ...(sens.trim() ? { sens: sansTiretLong(sens) } : {}),
    ...(solutions.trim() ? { solutions: sansTiretLong(solutions) } : {}),
    ...(propositions.length ? { propositions } : {}),
    ...(resume.trim() ? { resume: sansTiretLong(resume) } : {}),
    ...(message.trim() ? { message: sansTiretLong(message) } : {}),
    ...(parAssistant ? { redigeAvecAssistant: true } : {}),
  });

  const signer = () => {
    if (occupe || remis) return;
    if (!praticien.trim()) { toast('Le bilan se signe : écrivez le nom du maître.'); return; }
    const b = remettreBilan(champs());
    setRemis(b);
    surRemis?.(b);
    void annonceLeBilan(b, client);
    toast(`Bilan ${b.numero} signé et remis, ${prenom} le lit sur Ma Couronne.`);
  };

  const pdf = async (quoi: 'apercu' | 'telecharge') => {
    setOccupe(quoi);
    try {
      const { bilanApercu, bilanPdf } = await import('../../../../shared/pdf');
      const b: Bilan = remis ?? { id: 'apercu', ...champs() };
      const d = donneesDuBilanPdf(b, client);
      if (quoi === 'apercu') await bilanApercu(d); else await bilanPdf(d);
    } catch { toast('Le PDF n’a pas pu être préparé.'); } finally { setOccupe(''); }
  };

  const whatsapp = async () => {
    if (!remis || occupe) return;
    if (!client.phone) { toast(`Aucun numéro sur la fiche de ${prenom}.`); return; }
    setOccupe('whatsapp');
    try {
      const r = await envoieLeBilan(remis, client, session?.user?.email ?? undefined);
      toast(r.ok
        ? (r.enAttente ? `Hors ligne : le bilan partira à ${prenom} au retour du réseau.` : `Bilan envoyé à ${prenom} sur WhatsApp.`)
        : `Le bilan n’est pas parti : ${r.erreur}`);
    } catch { toast('Le PDF n’a pas pu être préparé.'); } finally { setOccupe(''); }
  };

  const lb: React.CSSProperties = { fontFamily: 'var(--font-sans)', fontSize: 10, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--ink-soft)' };
  const zone: React.CSSProperties = { width: '100%', marginTop: 6, resize: 'vertical', fontFamily: 'var(--font-sans)', fontSize: 13, lineHeight: 1.5 };
  const pastille = (fond: string, encre: string): React.CSSProperties => ({ alignSelf: 'flex-start', fontSize: 11.5, padding: '3px 10px', borderRadius: 999, background: fond, color: encre });

  /* ── APRÈS LA SIGNATURE : le document part ── */
  if (remis) {
    return createPortal(
      <Modal title={`Bilan remis · ${prenom}.`} onClose={onClose} width={520}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ fontFamily: 'var(--font-serif)', fontSize: 20, color: 'var(--color-indigo)' }}>
            {remis.numero}, signé par {remis.praticien}.
          </div>
          <div className="mnd-muted" style={{ fontSize: 13, lineHeight: 1.55 }}>
            Il est au registre : {prenom} le lit dans Ma Couronne, et une notification lui a été envoyée.
            Le PDF Maison MND part maintenant sur WhatsApp, ou s'imprime.
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <Button variant="copper" onClick={whatsapp} disabled={!!occupe}>
              {occupe === 'whatsapp' ? 'Envoi…' : 'Envoyer le PDF par WhatsApp'}
            </Button>
            <Button variant="ghost" onClick={() => pdf('apercu')} disabled={!!occupe}>Imprimer</Button>
            <Button variant="ghost" onClick={() => pdf('telecharge')} disabled={!!occupe}>Télécharger le PDF</Button>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Button variant="ghost" onClick={onClose}>Fermer</Button>
          </div>
        </div>
      </Modal>,
      document.body,
    );
  }

  return createPortal(
    <Modal title={`Bilan de séance · ${prenom}.`} onClose={onClose} width={680}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        {parAssistant
          ? <span style={pastille('var(--copper-100, #F6EADF)', 'var(--copper-700)')}>Proposé par l’assistant · à relire</span>
          : (
            <div className="mnd-muted" style={{ fontSize: 12, lineHeight: 1.5 }}>
              {precedent
                ? `Pré-rempli du bilan ${precedent.numero} (${frShort(precedent.date)}), la couronne s'évalue dans la continuité.`
                : 'Premier bilan de cette couronne, les Quatre Temps partent de la voix de la maison.'}
            </div>
          )}
        <div className="mnd-muted" style={{ fontSize: 12 }}>
          Numéro : <b style={{ fontWeight: 500 }}>{numero}</b>{nature ? ` · cheveu ${natureDite(nature).toLowerCase()}` : ''}.
        </div>

        {alerteMedicale.trim() && (
          <div style={{ borderLeft: '3px solid #96412E', background: 'rgba(150,65,46,.08)', padding: '10px 12px', borderRadius: '0 6px 6px 0', fontSize: 13, lineHeight: 1.5 }}>
            <b style={{ fontWeight: 600 }}>À relire avec soin, un signe peut relever d’un médecin.</b>
            <textarea className="mnd-input" rows={2} value={alerteMedicale} onChange={(e) => setAlerteMedicale(e.target.value)} style={zone} aria-label="La recommandation médicale" />
            <div className="mnd-muted" style={{ fontSize: 11.5, marginTop: 4 }}>Cette phrase n’entre dans le bilan que si vous la recopiez dans « Ce que cela veut dire ».</div>
          </div>
        )}

        <div className="tr-grid tr-grid--2" style={{ gap: 12 }}>
          <Field label="Séance du"><ChampDeDate compact sens="arriere" value={date} onChange={setDate} ariaLabel="Le jour de la séance" /></Field>
          <Field label="Durée"><Input value={duree} onChange={(e) => setDuree(e.target.value)} /></Field>
        </div>
        <Field label="Prestation"><Input value={prestation} onChange={(e) => setPrestation(e.target.value)} /></Field>
        <div className="tr-grid tr-grid--2" style={{ gap: 12 }}>
          <Field label="Signé par (le maître)"><Input value={praticien} onChange={(e) => setPraticien(e.target.value)} /></Field>
          <Field label="Prochaine visite conseillée"><Input value={prochaineVisite} onChange={(e) => setProchaineVisite(e.target.value)} placeholder="Vers le 15 novembre 2026" /></Field>
        </div>

        <div>
          <div style={lb}>Ce que nous avons vu</div>
          <textarea className="mnd-input" rows={3} value={diagnostic} onChange={(e) => setDiagnostic(e.target.value)} style={zone} aria-label="Ce que nous avons vu" placeholder={`${appelDe(client)}, vos racines…`} />
        </div>
        <div>
          <div style={lb}>Ce que cela veut dire</div>
          <textarea className="mnd-input" rows={2} value={sens} onChange={(e) => setSens(e.target.value)} style={zone} aria-label="Ce que cela veut dire" />
        </div>

        <div>
          <div style={lb}>L'état de la couronne</div>
          {jauges.map((j, i) => (
            <div key={j.nom} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderBottom: '1px solid var(--hairline)', flexWrap: 'wrap' }}>
              <span style={{ fontFamily: 'var(--font-sans)', fontSize: 13, minWidth: 130 }}>{j.nom}</span>
              <span style={{ display: 'inline-flex', gap: 6 }}>
                {[1, 2, 3, 4, 5].map((v) => (
                  <button
                    key={v}
                    type="button"
                    aria-label={`${j.nom} : ${v} sur 5`}
                    onClick={() => setJauge(i, { valeur: v })}
                    style={{
                      width: 22, height: 22, borderRadius: '50%', cursor: 'pointer',
                      border: '1.5px solid var(--color-copper)',
                      background: v <= j.valeur ? 'var(--color-copper)' : 'transparent',
                    }}
                  />
                ))}
              </span>
              <Input value={j.note} onChange={(e) => setJauge(i, { note: e.target.value })} style={{ flex: 1, minWidth: 110, padding: '6px 10px', fontSize: 12.5 }} aria-label={`Note · ${j.nom}`} />
            </div>
          ))}
        </div>

        <div>
          <div style={lb}>Les points clés de la séance</div>
          {points.map((p, i) => (
            <textarea
              key={i}
              className="mnd-input"
              rows={2}
              value={p}
              placeholder={i === 0 ? 'Ce que la séance a fait, ce que la couronne a dit…' : 'Point suivant (facultatif)'}
              onChange={(e) => setPoint(i, e.target.value)}
              style={{ ...zone, marginTop: 8 }}
            />
          ))}
        </div>

        <div>
          <div style={lb}>Ce que la Maison propose</div>
          <textarea className="mnd-input" rows={2} value={solutions} onChange={(e) => setSolutions(e.target.value)} style={zone} aria-label="Ce que la Maison propose" />
          {propositions.map((p, i) => (
            <div key={p.serviceId} style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
              <span style={{ fontFamily: 'var(--font-serif)', fontSize: 15, color: 'var(--color-indigo)', minWidth: 160 }}>{p.nom}</span>
              <Input value={p.quand} onChange={(e) => setPropositions((ps) => ps.map((x, k) => (k === i ? { ...x, quand: e.target.value } : x)))} style={{ flex: 1, minWidth: 140, padding: '6px 10px', fontSize: 12.5 }} aria-label={`Quand · ${p.nom}`} placeholder="à votre prochaine venue" />
              <button type="button" aria-label={`Retirer ${p.nom}`} onClick={() => setPropositions((ps) => ps.filter((_, k) => k !== i))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-soft)' }}>✕</button>
            </div>
          ))}
          {propositions.length < 3 && (
            <select
              className="mnd-input"
              value=""
              onChange={(e) => {
                const s = byId.get(e.target.value);
                if (s) setPropositions((ps) => (ps.some((x) => x.serviceId === s.id) ? ps : [...ps, { serviceId: s.id, nom: s.name, quand: '' }]));
              }}
              style={{ marginTop: 8, fontSize: 12.5 }}
              aria-label="Proposer une prestation"
            >
              <option value="">+ Proposer une prestation du catalogue</option>
              {services.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          )}
          <div className="mnd-muted" style={{ fontSize: 11.5, marginTop: 5 }}>Chaque prestation proposée devient un bouton « Réserver » dans Ma Couronne.</div>
        </div>

        <div>
          <div style={lb}>Le rituel à domicile, les Quatre Temps</div>
          {rituel.map((t, i) => (
            <div key={t.nom} style={{ marginTop: 10 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontFamily: 'var(--font-serif)', fontSize: 15, color: 'var(--color-indigo)' }}>{t.nom}</span>
                <Input value={t.cadence} onChange={(e) => setTemps(i, { cadence: e.target.value })} style={{ width: 180, padding: '4px 8px', fontSize: 11.5 }} aria-label={`Cadence · ${t.nom}`} />
              </div>
              <textarea className="mnd-input" rows={2} value={t.texte} onChange={(e) => setTemps(i, { texte: e.target.value })} style={{ ...zone, marginTop: 5 }} aria-label={`Rituel · ${t.nom}`} />
              <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 5 }}>
                {INGREDIENTS_DU_BILAN.map((ing) => {
                  const on = (t.ingredients ?? []).includes(ing.slug);
                  return (
                    <button
                      key={ing.slug}
                      type="button"
                      aria-pressed={on}
                      title={ing.role}
                      onClick={() => setTemps(i, { ingredients: on ? (t.ingredients ?? []).filter((s) => s !== ing.slug) : [...(t.ingredients ?? []), ing.slug] })}
                      style={{
                        fontSize: 11, padding: '2px 9px', borderRadius: 999, cursor: 'pointer',
                        border: `1px solid ${on ? 'var(--color-copper)' : 'var(--hairline)'}`,
                        background: on ? 'var(--copper-100, #F6EADF)' : 'transparent',
                        color: on ? 'var(--copper-700)' : 'var(--ink-soft)',
                      }}
                    >
                      {nomDeLIngredient(ing.slug)}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <div>
          <div style={lb}>Le résumé, ce que Ma Couronne montre d'abord</div>
          <textarea className="mnd-input" rows={3} value={resume} onChange={(e) => setResume(e.target.value)} style={zone} aria-label="Le résumé" placeholder="Trois phrases : l'essentiel, ce qu'elle fait chez elle, ce que la Maison propose ensuite." />
        </div>
        <div>
          <div style={lb}>Le mot WhatsApp qui accompagne le PDF</div>
          <textarea className="mnd-input" rows={2} value={message} onChange={(e) => setMessage(e.target.value)} style={zone} aria-label="Le mot WhatsApp" placeholder={`Bonjour ${appelDe(client)}, voici le bilan de votre séance…`} />
        </div>

        {alertes.length > 0 && (
          <div style={{ borderLeft: '3px solid var(--color-copper)', background: 'var(--copper-100, #F6EADF)', padding: '9px 12px', borderRadius: '0 6px 6px 0', fontSize: 12.5, lineHeight: 1.55 }}>
            {alertes.map((a) => <div key={a}>{a}</div>)}
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'flex-end', alignItems: 'center' }}>
          {surRedemande && parAssistant && (
            <>
              <Button variant="ghost" onClick={() => redemander('reformuler')} disabled={!!redemande}>{redemande === 'reformuler' ? 'L’assistant reformule…' : 'Reformuler'}</Button>
              <Button variant="ghost" onClick={() => redemander('raccourcir')} disabled={!!redemande}>{redemande === 'raccourcir' ? 'L’assistant raccourcit…' : 'Plus court'}</Button>
            </>
          )}
          <Button variant="ghost" onClick={() => pdf('apercu')} disabled={!!occupe}>Aperçu du PDF</Button>
          <Button variant="copper" onClick={signer} disabled={!!redemande}>Signer et remettre</Button>
        </div>
        <div className="mnd-muted" style={{ fontSize: 11.5, lineHeight: 1.5 }}>
          « Signer et remettre » inscrit le bilan au registre, à votre nom : {prenom} le lit sur Ma Couronne et
          reçoit une notification. Le PDF part ensuite par WhatsApp, ou s'imprime. Rien ne part avant.
        </div>
      </div>
    </Modal>,
    document.body,
  );
}

/* SES BILANS REMIS — 4 octobre 2026. Un bilan signé se renvoie et
   s'imprime d'ici : le PDF est reconstruit du registre, au mot près. */
export function RegistreDesBilans({ client, onClose }: { client: Client; onClose: () => void }) {
  const [bilans] = useBilans();
  const { session } = useAuth();
  const siens = useMemo(
    () => bilans.filter((b) => b.clientId === client.id).sort((a, b) => b.remisLe.localeCompare(a.remisLe) || b.date.localeCompare(a.date)),
    [bilans, client.id],
  );
  const [occupe, setOccupe] = useState('');
  const prenom = client.name.split(' ')[0];

  const pdf = async (b: Bilan, quoi: 'apercu' | 'telecharge') => {
    setOccupe(`${b.id}-${quoi}`);
    try {
      const { bilanApercu, bilanPdf } = await import('../../../../shared/pdf');
      const d = donneesDuBilanPdf(b, client);
      if (quoi === 'apercu') await bilanApercu(d); else await bilanPdf(d);
    } catch { toast('Le PDF n’a pas pu être préparé.'); } finally { setOccupe(''); }
  };
  const whatsapp = async (b: Bilan) => {
    if (!client.phone) { toast(`Aucun numéro sur la fiche de ${prenom}.`); return; }
    setOccupe(`${b.id}-wa`);
    try {
      const r = await envoieLeBilan(b, client, session?.user?.email ?? undefined);
      toast(r.ok ? (r.enAttente ? 'Hors ligne : le bilan partira au retour du réseau.' : `Bilan ${b.numero} envoyé à ${prenom}.`) : `Le bilan n’est pas parti : ${r.erreur}`);
    } catch { toast('Le PDF n’a pas pu être préparé.'); } finally { setOccupe(''); }
  };

  return createPortal(
    <Modal title={`Ses bilans · ${prenom}.`} onClose={onClose} width={600}>
      {siens.length === 0
        ? <div className="mnd-muted" style={{ fontSize: 13 }}>Aucun bilan remis à {prenom} pour l’instant.</div>
        : (
          <div style={{ display: 'grid' }}>
            {siens.map((b) => (
              <div key={b.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '10px 0', borderBottom: '1px solid var(--hairline)' }}>
                <div>
                  <div style={{ fontFamily: 'var(--font-serif)', fontSize: 15, color: 'var(--color-indigo)' }}>{b.numero}</div>
                  <div className="mnd-muted" style={{ fontSize: 12 }}>
                    Séance du {frShort(b.date)}{b.prestation ? ` · ${b.prestation}` : ''} · signé {b.praticien ?? 'la Maison'}, remis le {frShort(b.remisLe)}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <Button size="sm" variant="ghost" disabled={!!occupe} onClick={() => whatsapp(b)}>{occupe === `${b.id}-wa` ? 'Envoi…' : 'WhatsApp'}</Button>
                  <Button size="sm" variant="ghost" disabled={!!occupe} onClick={() => pdf(b, 'apercu')}>Imprimer</Button>
                  <Button size="sm" variant="ghost" disabled={!!occupe} onClick={() => pdf(b, 'telecharge')}>PDF</Button>
                </div>
              </div>
            ))}
          </div>
        )}
    </Modal>,
    document.body,
  );
}
