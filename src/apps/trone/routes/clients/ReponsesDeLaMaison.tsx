import { useMemo, useRef, useState } from 'react';
import { Badge, Button, Card, Field, Input, Select, Textarea, toast } from '../../../../ds/components';
import { useAuth } from '../../../../shared/auth';
import {
  MOTS_SANTE_LIVRES, TEXTE_DE_REPONSE_MAX, conseilDeLaMaison, fautesDeLaReponse, prixDitWa, prixDuCatalogue,
  type ReponseDeLaMaison,
} from '../../../../shared/automate-wa';
import {
  ajouteUneReponse, changeLesMotsSante, conseilStore, correctionProposee, deplaceLaReponse, modifieLaReponse, motsDUnePhrase,
  nouvelIdDeReponse, repasseEnBrouillon, retireLaReponse, useConseil, valideLaReponse, valideLesReponses, type ReponseBrute,
} from '../../../../shared/conseil-wa';
import { automatesDesFils, numeroWa, useFilsAutomate, useMessagesWa } from '../../../../shared/conversations';
import type { Besoin } from '../../../../shared/qualification';
import { useStaff } from '../../../../shared/auth';
import { SOUCIS } from '../../../../shared/entre-deux-pur';
import { useReponsesEntreDeux } from '../../../../shared/entre-deux';
import { useEstDirection } from '../_vie';
import { frShortAn, useServicesById } from './_shared';
import { UneReponse } from './EntreDeuxSeances';

/* ══ CE QUE LA MAISON RÉPOND · 14 octobre 2026 ; une seule liste le 27 ═════
   Ce que l'automate répond sur WhatsApp (maquette « Prendre RDV & Conseil
   Locks », choix n° 5). Une ligne par réponse, repliée ; une seule ouverte à
   la fois, et la barre du bas dit laquelle on règle. Le personnel prépare ;
   la direction seule valide, et rien ne part sans sa validation. Toucher au
   sens d'une réponse validée la renvoie en brouillon (`modifieLaReponse`).

   27 OCTOBRE 2026 (Assistant Maison, spec §5.2) : UNE SEULE LISTE à l'écran,
   les treize réponses du conseil WhatsApp et les huit réponses des soucis
   d'Entre deux séances, avec le compteur « n validées sur 21 ». Chaque
   écriture reste à sa place (`conseilStore` pour les treize,
   `reponsesEntreDeuxStore` pour les huit) : l'automate, le webhook et Ma
   Couronne lisent chacun la sienne ; la fusion en une table est hors lot. */

/** « n VALIDÉES SUR 21 » : les treize du conseil (validées ET sans faute,
    comme l'automate les lit) plus les huit des soucis (un texte validé). */
export function useCompteDesReponses(): { validees: number; total: number; conseil: { validees: number; total: number }; soucis: { validees: number; total: number } } {
  const [conseil] = useConseil();
  const byId = useServicesById();
  const reponsesEntreDeux = useReponsesEntreDeux();
  return useMemo(() => {
    const prix = prixDuCatalogue([...byId.values()].map((s) => ({ id: s.id, data: s as unknown as Record<string, unknown> })));
    const reponses = conseil?.reponses ?? [];
    const lue = (r: ReponseBrute): ReponseDeLaMaison | undefined => conseilDeLaMaison({ reponses: [r] }).reponses[0];
    const vConseil = reponses.filter((r) => { if (r.etat !== 'validee') return false; const x = lue(r); return !!x && fautesDeLaReponse(x, prix).length === 0; }).length;
    const vSoucis = reponsesEntreDeux.filter((r) => (r.texteValide ?? '').trim()).length;
    return {
      validees: vConseil + vSoucis,
      total: reponses.length + SOUCIS.length,
      conseil: { validees: vConseil, total: reponses.length },
      soucis: { validees: vSoucis, total: SOUCIS.length },
    };
  }, [conseil, byId, reponsesEntreDeux]);
}

const MENE: { v: '' | Besoin; l: string }[] = [
  { v: '', l: 'Le menu de la Maison' },
  { v: 'entretien', l: 'Un entretien' },
  { v: 'creation', l: 'La consultation de création' },
  { v: 'reparation', l: 'La consultation de réparation' },
  { v: 'enfant', l: 'Le parcours d’un enfant' },
];
const ilYA = (iso: string | undefined, jours: number, maintenant: number): boolean => {
  const t = Date.parse(iso ?? '');
  return Number.isFinite(t) && maintenant - t < jours * 86400000;
};

export default function ReponsesDeLaMaison({ onOuvrirLeFil }: { onOuvrirLeFil: (numero: string) => void }) {
  const [conseil] = useConseil();
  const [messages] = useMessagesWa();
  const [lignes] = useFilsAutomate();
  const byId = useServicesById();
  const { session } = useAuth();
  const direction = useEstDirection();
  const moi = useStaff();
  const reponsesEntreDeux = useReponsesEntreDeux();
  const compte = useCompteDesReponses();
  const [ouverte, setOuverte] = useState<string | null>(null);
  const [retrait, setRetrait] = useState<string | null>(null);
  const [santeOuverte, setSanteOuverte] = useState(false);
  /* VALIDER EN COCHANT (30 octobre 2026) : les brouillons cochés. */
  const [cochees, setCochees] = useState<string[]>([]);
  const zone = useRef<HTMLTextAreaElement>(null);
  const maintenant = Date.now();
  const mois = new Date().toISOString().slice(0, 7);

  const reponses = useMemo(() => [...(conseil?.reponses ?? [])].sort((a, b) => a.ordre - b.ordre), [conseil]);
  const prix = useMemo(() => prixDuCatalogue([...byId.values()].map((s) => ({ id: s.id, data: s as unknown as Record<string, unknown> }))), [byId]);
  const prixAChoisir = useMemo(() => [...byId.values()]
    .filter((s) => (prix[s.id] ?? 0) > 0)
    .sort((a, b) => a.name.localeCompare(b.name, 'fr')), [byId, prix]);
  /* La même lecture que l'automate : mots sans accents, faute pour faute. */
  const lue = (r: ReponseBrute): ReponseDeLaMaison | undefined => conseilDeLaMaison({ reponses: [r] }).reponses[0];
  const fautesDe = (r: ReponseBrute): string[] => { const x = lue(r); return x ? fautesDeLaReponse(x, prix) : ['un identifiant illisible']; };

  const envoyees = useMemo(() => {
    const n = new Map<string, number>();
    for (const m of messages) if (m.sens === 'sortant' && m.reponse && (m.quand ?? '').slice(0, 7) === mois) n.set(m.reponse, (n.get(m.reponse) ?? 0) + 1);
    return n;
  }, [messages, mois]);
  const totalDuMois = [...envoyees.values()].reduce((s, n) => s + n, 0);

  /* LES QUESTIONS RESTÉES SANS RÉPONSE : la main a passé pour « une question
     à lire » cette semaine ; on montre ce qu'elle avait écrit. */
  const sansReponse = useMemo(() => {
    const out: { numero: string; texte: string; quand: string; motif: string }[] = [];
    for (const [numero, a] of automatesDesFils(lignes)) {
      const f = a.fil;
      if (!f || f.etape !== 'main' || (f.motifMain !== 'question' && f.motifMain !== 'sante') || !ilYA(f.mainPasseeLe, 7, maintenant)) continue;
      const limite = Date.parse(f.mainPasseeLe ?? '') + 60000;
      const sienne = messages
        .filter((m) => m.sens === 'entrant' && numeroWa(m.numero) === numero && Date.parse(m.quand) <= limite)
        .sort((x, y) => y.quand.localeCompare(x.quand))[0];
      if (sienne?.texte) out.push({ numero, texte: sienne.texte, quand: sienne.quand, motif: f.motifMain });
    }
    return out.sort((x, y) => y.quand.localeCompare(x.quand)).slice(0, 12);
  }, [lignes, messages, maintenant]);

  const ecris = (f: (c: typeof conseil) => typeof conseil): void => conseilStore.set((c) => f(c));
  const modifie = (id: string, patch: Parameters<typeof modifieLaReponse>[2]): void => ecris((c) => modifieLaReponse(c, id, patch));
  const ajoute = (titre: string, mots: string[]): void => {
    const id = nouvelIdDeReponse();
    ecris((c) => ajouteUneReponse(c, { id, titre, mots, texte: '' }));
    setOuverte(id);
  };
  const insereLePrix = (r: ReponseBrute, serviceId: string): void => {
    if (!serviceId) return;
    const jeton = `{prix:${serviceId}}`;
    const el = zone.current;
    const debut = el?.selectionStart ?? r.texte.length;
    const fin = el?.selectionEnd ?? r.texte.length;
    modifie(r.id, { texte: `${r.texte.slice(0, debut)}${jeton}${r.texte.slice(fin)}` });
  };
  const apercu = (texte: string): string => texte.replace(/\{prix:([^}]{1,80})\}/g, (_t, ref: string) => {
    const p = prix[ref.trim()];
    return p ? prixDitWa(p) : '⟦prix introuvable⟧';
  });

  const validees = reponses.filter((r) => r.etat === 'validee' && fautesDe(r).length === 0).length;
  const laOuverte = reponses.find((r) => r.id === ouverte) ?? null;
  const brouillons = reponses.filter((r) => r.etat !== 'validee');
  const pretes = brouillons.filter((r) => fautesDe(r).length === 0);
  const aValider = cochees.filter((id) => pretes.some((r) => r.id === id));
  const coche = (id: string) => setCochees((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]));
  const valideLesCochees = () => {
    if (aValider.length === 0) return;
    ecris((c) => valideLesReponses(c, aValider, session?.user?.id ?? 'direction', new Date().toISOString()));
    toast(`${aValider.length} réponse${aValider.length > 1 ? 's' : ''} validée${aValider.length > 1 ? 's' : ''} : l’automate peut les envoyer.`);
    setCochees([]);
  };
  const motsSante = conseil?.motsSante?.length ? conseil.motsSante : [...MOTS_SANTE_LIVRES];

  return (
    <div style={{ display: 'grid', gap: 14, paddingBottom: laOuverte ? 70 : 0 }}>
      <Card style={{ padding: 16, display: 'grid', gap: 8 }}>
        <div className="tre-sec-label">Ce que la Maison répond</div>
        <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6 }}>
          Une seule bibliothèque : les {reponses.length} réponses du conseil WhatsApp et les {SOUCIS.length} réponses des soucis d’Entre deux séances.
          Quand une cliente pose une question que l’une de ces réponses reconnaît, l’automate l’envoie telle quelle,
          avec « Réserver » et « Une autre question ». Seules les réponses <b>validées par la direction</b> partent ; les prix se
          lisent au catalogue du jour. Le cuir chevelu qui inquiète ne reçoit jamais de conseil : la main passe à l’équipe.
        </p>
        <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', fontSize: 13.5 }} className="mnd-muted">
          <span><b style={{ color: 'var(--color-indigo)' }}>{compte.validees}</b> validée{compte.validees > 1 ? 's' : ''} sur {compte.total}</span>
          <span>conseil {validees} sur {reponses.length} · soucis {compte.soucis.validees} sur {compte.soucis.total}</span>
          <span><b style={{ color: 'var(--color-indigo)' }}>{totalDuMois}</b> envoyée{totalDuMois > 1 ? 's' : ''} ce mois</span>
          <span><b style={{ color: 'var(--color-indigo)' }}>{sansReponse.length}</b> passée{sansReponse.length > 1 ? 's' : ''} à l’équipe cette semaine</span>
        </div>
        <div><Button variant="copper" size="sm" onClick={() => ajoute('Nouvelle question', [])}>Ajouter une réponse</Button></div>
      </Card>

      {/* VALIDER EN COCHANT (30 octobre 2026, « sur un écran à cocher ») : chaque
          brouillon, ce qu'elle lira, une case ; ceux qui ne peuvent pas partir
          disent pourquoi, et leur correction proposée s'accepte d'un toucher. */}
      {direction && brouillons.length > 0 && (
        <Card className="trc-cocher" style={{ padding: 16, display: 'grid', gap: 10 }}>
          <div className="tre-sec-label">Valider en cochant · {brouillons.length} brouillon{brouillons.length > 1 ? 's' : ''}, {pretes.length} prêt{pretes.length > 1 ? 's' : ''} à partir</div>
          <ul className="trc-cocher__liste">
            {brouillons.map((r) => {
              const fautes = fautesDe(r);
              const correction = fautes.length > 0 ? correctionProposee(r, prix) : null;
              const oui = cochees.includes(r.id);
              return (
                <li key={r.id} className={`trc-cocher__ligne${oui ? ' est-cochee' : ''}`}>
                  <label className="trc-cocher__case">
                    <input type="checkbox" id={`cocher-${r.id}`} checked={oui} disabled={fautes.length > 0} onChange={() => coche(r.id)} />
                    <span className="trc-cocher__titre">{r.titre || 'Sans titre'}</span>
                  </label>
                  <p className="trc-cocher__texte">{r.texte ? apercu(r.texte) : <span className="mnd-muted">La réponse n’est pas encore écrite.</span>}</p>
                  {fautes.length > 0 && !correction && (
                    <p className="trc-cocher__faute">Ne peut pas partir : {fautes.join(' ; ')}. <button type="button" className="trc-cocher__lien" onClick={() => setOuverte(r.id)}>La corriger</button></p>
                  )}
                  {correction && (
                    <div className="trc-cocher__correction">
                      <span className="mnd-muted">{correction.pourquoi} Proposé :</span>
                      <p>{apercu(correction.texte)}</p>
                      <Button variant="ghost" size="sm" onClick={() => { modifie(r.id, { texte: correction.texte }); toast('Correction posée : la réponse peut maintenant se cocher.'); }}>Accepter la correction</Button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <Button variant="copper" size="sm" disabled={aValider.length === 0} onClick={valideLesCochees}>
              {aValider.length === 1 ? 'Valider la réponse cochée' : aValider.length > 1 ? `Valider les ${aValider.length} réponses cochées` : 'Valider les réponses cochées'}
            </Button>
            <Button variant="ghost" size="sm" disabled={pretes.length === 0} onClick={() => setCochees(pretes.map((r) => r.id))}>Cocher les {pretes.length} prêtes</Button>
            <span className="mnd-muted" style={{ fontSize: 12.5 }}>Une réponse validée part mot pour mot, avec « Réserver » et « Une autre question ».</span>
          </div>
        </Card>
      )}

      <div style={{ display: 'grid', gap: 6 }}>
        {reponses.map((r, i) => {
          const fautes = fautesDe(r);
          const ouvert = r.id === ouverte;
          const etat = r.etat === 'validee' ? (fautes.length ? 'Ne peut pas partir' : 'Validée') : r.texte ? 'Brouillon' : 'À écrire';
          return (
            <Card key={r.id} style={{ padding: 0, overflow: 'hidden', borderColor: ouvert ? 'var(--color-copper)' : undefined }}>
              <button
                type="button"
                onClick={() => setOuverte(ouvert ? null : r.id)}
                aria-expanded={ouvert}
                style={{ width: '100%', textAlign: 'left', background: 'none', border: 0, padding: '10px 14px', display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: '4px 12px', alignItems: 'baseline', cursor: 'pointer', font: 'inherit', color: 'inherit' }}
              >
                <span style={{ minWidth: 0 }}>
                  <span style={{ color: 'var(--color-indigo)' }}>{r.titre || 'Sans titre'}</span>
                  <span className="mnd-muted" style={{ fontSize: 12.5, display: 'block' }}>{r.description || r.mots.slice(0, 4).join(', ') || 'aucun mot'}</span>
                </span>
                <span style={{ display: 'flex', gap: 8, alignItems: 'center', whiteSpace: 'nowrap' }}>
                  <span className="mnd-muted" style={{ fontSize: 12.5 }}>{envoyees.get(r.id) ?? 0} ce mois</span>
                  <Badge tone={etat === 'Validée' ? 'indigo' : etat === 'Ne peut pas partir' ? 'copper' : undefined}>{etat}</Badge>
                </span>
              </button>
              {ouvert && (
                <div style={{ borderTop: '1px dashed var(--hairline)', padding: 14, display: 'grid', gap: 12 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 240px), 1fr))', gap: 10 }}>
                    <Field label={`Titre dans la liste (${r.titre.length} / 24)`}>
                      <Input value={r.titre} maxLength={40} onChange={(e) => modifie(r.id, { titre: e.target.value })} />
                    </Field>
                    <Field label={`Ligne grise (${(r.description ?? '').length} / 72)`}>
                      <Input value={r.description ?? ''} maxLength={90} onChange={(e) => modifie(r.id, { description: e.target.value || undefined })} />
                    </Field>
                  </div>
                  <Field label="Les mots qui la reconnaissent, séparés par des virgules">
                    <Input value={r.mots.join(', ')} onChange={(e) => modifie(r.id, { mots: e.target.value.split(',').map((m) => m.trim()).filter(Boolean) })} />
                  </Field>
                  <Field label={`La réponse (${r.texte.length} / ${TEXTE_DE_REPONSE_MAX})`}>
                    <textarea className="mnd-textarea" ref={zone} rows={6} value={r.texte} onChange={(e) => modifie(r.id, { texte: e.target.value })} />
                  </Field>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 240px), 1fr))', gap: 10 }}>
                    <Field label="Insérer un prix du catalogue (il suivra la carte)">
                      <Select value="" onChange={(e) => insereLePrix(r, e.target.value)}>
                        <option value="">Choisir une prestation…</option>
                        {prixAChoisir.map((s) => <option key={s.id} value={s.id}>{s.name} · {prixDitWa(prix[s.id])}</option>)}
                      </Select>
                    </Field>
                    <Field label="« Réserver » mène à">
                      <Select value={r.mene ?? ''} onChange={(e) => modifie(r.id, { mene: (e.target.value || undefined) as Besoin | undefined })}>
                        {MENE.map((m) => <option key={m.v} value={m.v}>{m.l}</option>)}
                      </Select>
                    </Field>
                  </div>
                  <div style={{ display: 'grid', gap: 6 }}>
                    <div className="tre-sec-label">Ce qu’elle lira</div>
                    <div style={{ maxWidth: 380, background: 'var(--surface, #fffdf9)', border: '1px solid var(--hairline)', borderRadius: 10, padding: '8px 10px', fontSize: 14, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
                      {r.texte ? apercu(r.texte) : <span className="mnd-muted">La réponse n’est pas encore écrite.</span>}
                      <div style={{ display: 'grid', gap: 2, marginTop: 8, borderTop: '1px solid var(--hairline)', paddingTop: 6, textAlign: 'center', color: 'var(--color-copper)', fontSize: 13.5 }}>
                        <span>Réserver</span><span>Une autre question</span><span>Parler à la Maison</span>
                      </div>
                    </div>
                  </div>
                  {fautes.length > 0 && (
                    <div style={{ fontSize: 13.5, background: 'var(--copper-50)', borderRadius: 6, padding: '8px 12px' }}>
                      <b>Elle ne peut pas partir :</b> il manque ou il faut corriger {fautes.join(' ; ')}.
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                    {direction && r.etat !== 'validee' && (
                      <Button
                        variant="copper" size="sm" disabled={fautes.length > 0}
                        onClick={() => { ecris((c) => valideLaReponse(c, r.id, session?.user?.id ?? 'direction', new Date().toISOString())); toast('Réponse validée : l’automate peut l’envoyer.'); }}
                      >Valider la réponse</Button>
                    )}
                    {direction && r.etat === 'validee' && (
                      <Button variant="ghost" size="sm" onClick={() => ecris((c) => repasseEnBrouillon(c, r.id))}>Repasser en brouillon</Button>
                    )}
                    <Button variant="ghost" size="sm" disabled={i === 0} onClick={() => ecris((c) => deplaceLaReponse(c, r.id, -1))}>Monter</Button>
                    <Button variant="ghost" size="sm" disabled={i === reponses.length - 1} onClick={() => ecris((c) => deplaceLaReponse(c, r.id, 1))}>Descendre</Button>
                    {direction && (retrait === r.id
                      ? <Button variant="ghost" size="sm" onClick={() => { ecris((c) => retireLaReponse(c, r.id)); setRetrait(null); setOuverte(null); }}>Confirmer le retrait</Button>
                      : <Button variant="ghost" size="sm" onClick={() => setRetrait(r.id)}>Retirer</Button>)}
                    <span className="mnd-muted" style={{ fontSize: 12.5 }}>
                      {r.etat === 'validee' && r.valideeLe ? `Validée le ${frShortAn(r.valideeLe.slice(0, 10))}.` : direction ? 'Brouillon : il ne part pas.' : 'Brouillon : la direction le valide.'}
                    </span>
                  </div>
                </div>
              )}
            </Card>
          );
        })}
      </div>

      {/* LES HUIT RÉPONSES DES SOUCIS (Entre deux séances), dans la même liste :
          chacune s'écrit à sa place (`poseLaReponse`), la direction seule valide. */}
      <Card style={{ padding: 16, display: 'grid', gap: 10 }}>
        <div className="tre-sec-label">Les {SOUCIS.length} réponses des soucis · {compte.soucis.validees} validée{compte.soucis.validees > 1 ? 's' : ''}</div>
        <p className="mnd-muted" style={{ margin: 0, fontSize: 13.5 }}>
          Ce qu’une cliente reçoit tout de suite quand elle dit un souci de ses locks, depuis Ma Couronne ou la liste WhatsApp. En Santé, aucun conseil n’est jamais envoyé.
        </p>
        <div style={{ display: 'grid', gap: 8 }}>
          {SOUCIS.map((s) => (
            <UneReponse key={s.cle} cle={s.cle} dit={s.dit} niveau={s.niveau} brouillon={s.brouillon}
              r={reponsesEntreDeux.find((x) => x.id === s.cle)} souverain={moi?.role === 'souverain'} moi={moi?.name ?? ''} />
          ))}
        </div>
      </Card>

      <Card style={{ padding: 0, overflow: 'hidden' }}>
        <button type="button" onClick={() => setSanteOuverte((v) => !v)} aria-expanded={santeOuverte}
          style={{ width: '100%', textAlign: 'left', background: 'none', border: 0, padding: '10px 14px', cursor: 'pointer', font: 'inherit', color: 'inherit', display: 'flex', justifyContent: 'space-between', gap: 10 }}>
          <span><span style={{ color: 'var(--color-indigo)' }}>Le cuir chevelu, jamais à distance</span>
            <span className="mnd-muted" style={{ fontSize: 12.5, display: 'block' }}>{motsSante.length} mots font passer la main, sans aucun conseil</span></span>
        </button>
        {santeOuverte && (
          <div style={{ borderTop: '1px dashed var(--hairline)', padding: 14, display: 'grid', gap: 8 }}>
            <p className="mnd-muted" style={{ margin: 0, fontSize: 13.5 }}>
              Quand elle écrit l’un de ces mots, l’automate répond que la Maison ne conseille pas de soin à distance, propose la consultation,
              nomme le médecin ou le dermatologue, et passe la main à l’équipe.
            </p>
            <Textarea rows={3} value={motsSante.join(', ')} disabled={!direction}
              onChange={(e) => ecris((c) => changeLesMotsSante(c, e.target.value.split(',')))} />
          </div>
        )}
      </Card>

      <Card style={{ padding: 14, display: 'grid', gap: 8 }}>
        <div className="tre-sec-label">Restées sans réponse cette semaine</div>
        {sansReponse.length === 0 && <p className="mnd-muted" style={{ margin: 0, fontSize: 13.5 }}>Aucune question passée à l’équipe ces sept derniers jours.</p>}
        {sansReponse.map((q) => (
          <div key={`${q.numero}-${q.quand}`} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', alignItems: 'center', borderBottom: '1px dashed var(--hairline)', paddingBottom: 6 }}>
            <span style={{ fontSize: 14, minWidth: 0 }}>« {q.texte.slice(0, 160)} »
              <span className="mnd-muted" style={{ fontSize: 12.5 }}> · {frShortAn(q.quand.slice(0, 10))}{q.motif === 'sante' ? ' · cuir chevelu' : ''}</span></span>
            <span style={{ display: 'flex', gap: 6 }}>
              <Button variant="ghost" size="sm" onClick={() => onOuvrirLeFil(q.numero)}>Ouvrir le fil</Button>
              {q.motif !== 'sante' && (
                <Button variant="copper" size="sm" onClick={() => ajoute(q.texte.replace(/\s+/g, ' ').trim().slice(0, 24), motsDUnePhrase(q.texte))}>En faire une réponse</Button>
              )}
            </span>
          </div>
        ))}
      </Card>

      {laOuverte && (
        <div style={{ position: 'sticky', bottom: 0, zIndex: 3, background: 'var(--color-indigo)', color: 'var(--ivory, #f6f1e7)', borderRadius: 8, padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 14 }}>Vous réglez : <b>{laOuverte.titre || 'Sans titre'}</b></span>
          <Button variant="ghost" size="sm" onClick={() => setOuverte(null)} style={{ color: 'inherit' }}>Fermer</Button>
        </div>
      )}
    </div>
  );
}
