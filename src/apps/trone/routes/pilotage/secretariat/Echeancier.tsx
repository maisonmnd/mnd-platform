import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button, Field, Input, Modal, Textarea, toast } from '../../../../../ds/components';
import { useSecretariat } from '../../../../../shared/secretariat';
import { aujourdhui, echeancesDe, effaceLaLigne, faitLEcheance, nouvelleEcheance, retouche } from '../../../../../shared/secretariat-admin';
import {
  ceQuiTombe, dateCourte, ecartEnJours, RECURRENCES, tientLeSecretariat, TYPES_ECHEANCE, voit,
  type Echeance, type Qui, type Recurrence, type Tombe, type TypeEcheance,
} from '../../../../../shared/secretariat-admin-pur';
import { chargeLeClasseur, papiersDe, useClasseur } from '../../../../../shared/papiers';
import { aRenouveler, titreDuPapier } from '../../../../../shared/papiers-pur';
import { leDossier } from '../../../../../shared/bourse';
import { campagneDe } from '../../../../../shared/bourse-pur';
import { CasePrivee, ChoixDuCompte, rappel, Repliee, useNomDuCompte } from './_admin';

/* ══ L'ÉCHÉANCIER — 14 octobre 2026 ══════════════════════════════════
   Les dates à tenir, au même endroit : celles qu'on pose ici (loyer, impôts,
   cotisations, renouvellements), et celles que les autres onglets portent
   déjà (réponse attendue d'un courrier, préavis d'un contrat, prochaine
   action d'une démarche, papier qui expire, dépôt de la bourse). Une
   échéance qui revient se repose d'elle-même quand on la dit faite. Les
   dates fiscales ne s'inventent pas : sans date, l'échéance reste « à dater ». */

const MOIS = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
const moisDe = (iso: string) => `${MOIS[parseInt(iso.slice(5, 7), 10) - 1]} ${iso.slice(0, 4)}`;
const VIENT: Record<string, { mot: string; onglet: string }> = {
  courrier: { mot: 'Vient du courrier', onglet: 'courrier' }, demarche: { mot: 'Vient d’une démarche', onglet: 'demarches' },
  contrat: { mot: 'Vient d’un contrat', onglet: 'contrats' }, papier: { mot: 'Vient des papiers', onglet: 'papiers' }, bourse: { mot: 'Vient de la bourse scolaire', onglet: 'bourse' },
};

type Rang = { cle: string; date?: string; titre: string; echeance?: Echeance; tombe?: Tombe & { vient: string } };

export function LEcheancier({ qui, branchId, va }: { qui: Qui; branchId: string; va: (onglet: string) => void }) {
  const [lignes] = useSecretariat();
  const classeur = useClasseur();
  const [ouvert, setOuvert] = useState<string | null>(null);
  const [edite, setEdite] = useState<Echeance | 'neuve' | null>(null);
  const nomDe = useNomDuCompte();
  const jour = aujourdhui();
  useEffect(() => { if (qui.direction && classeur.charge === 'jamais') void chargeLeClasseur(); }, [qui.direction, classeur.charge]);

  const rangs = useMemo((): Rang[] => {
    const propres: Rang[] = echeancesDe(lignes).filter((e) => !e.terminee && voit(e, qui)).map((e) => ({ cle: e.id, date: e.date, titre: e.titre, echeance: e }));
    const tombees: Rang[] = ceQuiTombe(lignes as unknown as { [k: string]: unknown }[])
      .filter((t) => t.genre !== 'echeance' && voit({ genre: t.genre, prive: t.prive, traitePar: t.traitePar }, qui))
      .map((t) => ({ cle: t.cle, date: t.date, titre: t.titre, tombe: { ...t, vient: t.genre } }));
    const papiers: Rang[] = qui.direction && classeur.charge === 'pret'
      ? aRenouveler(papiersDe(classeur.lignes), jour).filter((p) => p.expireLe).map((p) => ({
        cle: `pap:${p.id}`, date: p.expireLe, titre: `Expire : ${titreDuPapier(p)}`,
        tombe: { cle: `pap:${p.id}`, genre: 'papier', id: p.id, titre: titreDuPapier(p), date: p.expireLe as string, prive: true, vient: 'papier' },
      })) : [];
    const dossier = leDossier(lignes);
    const bourse: Rang[] = qui.direction && dossier ? (() => {
      const c = campagneDe(jour, dossier.valeurs.depot);
      return ecartEnJours(jour, c.depot) >= 0 ? [{ cle: `bourse:${c.cle}`, date: c.depot, titre: `Dépôt du dossier de bourse ${c.cle}`,
        tombe: { cle: `bourse:${c.cle}`, genre: 'bourse', id: dossier.id, titre: 'Bourse', date: c.depot, prive: true, vient: 'bourse' } }] : [];
    })() : [];
    return [...propres, ...tombees, ...papiers, ...bourse].sort((a, b) => (a.date ?? '9999').localeCompare(b.date ?? '9999') || a.titre.localeCompare(b.titre));
  }, [lignes, qui, classeur, jour]);

  const groupes: { titre: string; rangs: Rang[] }[] = [];
  for (const r of rangs) {
    const titre = !r.date ? 'À dater' : r.date < jour ? 'Dépassé' : moisDe(r.date);
    const g = groupes.find((x) => x.titre === titre);
    if (g) g.rangs.push(r); else groupes.push({ titre, rangs: [r] });
  }

  const tient = tientLeSecretariat(qui);
  return (
    <div className="sad-onglet">
      <div className="sad-outils">
        <span className="sad-doux">Rappel dans « À faire » à 30 jours, à 7 jours et la veille ; notification à 7 jours et la veille.</span>
        {tient && <Button variant="copper" onClick={() => setEdite('neuve')}>+ Nouvelle échéance</Button>}
      </div>
      {groupes.length === 0 && <div className="sec-vide">Aucune date à tenir. Le loyer, les impôts, un renouvellement : chacun se pose ici une fois.</div>}
      {groupes.map((g) => (
        <section key={g.titre} className="sad-groupe">
          <h3 className={`sad-mois${g.titre === 'Dépassé' ? ' est-urgent' : ''}`}>{g.titre}</h3>
          <div className="sad-liste">
            {g.rangs.map((r) => {
              const rp = rappel(r.date, jour);
              const e = r.echeance;
              const t = r.tombe;
              return (
                <Repliee
                  key={r.cle} ouverte={ouvert === r.cle} surBascule={() => setOuvert(ouvert === r.cle ? null : r.cle)}
                  num={r.date ? dateCourte(r.date) : 'À dater'}
                  titre={r.titre}
                  sous={e ? `${TYPES_ECHEANCE[e.type]} · ${RECURRENCES[e.recurrence]}${e.traitePar ? ` · confiée à ${nomDe(e.traitePar)}` : ''}${e.prive ? ' · privé' : ''}`
                    : t ? `${VIENT[t.vient]?.mot ?? ''}${t.prive ? ' · privé' : ''}` : undefined}
                  badge={rp.badge ?? (e && !e.date ? 'date à donner' : undefined)} urgent={rp.urgent}
                >
                  {e && (
                    <>
                      {e.note && <p className="sad-note">{e.note}</p>}
                      {e.faites.length > 0 && <p className="sad-doux">Faite {e.faites.slice(-3).map((f) => `pour le ${dateCourte(f.pour)}`).join(', ')}.</p>}
                      {tient && (
                        <div className="sec-actions">
                          <Button size="sm" variant="copper" onClick={() => {
                            const suite = faitLEcheance(e, qui.moi);
                            toast(suite.terminee ? 'Échéance faite.' : `Faite ; la suivante est posée au ${dateCourte(suite.date)}.`);
                            setOuvert(null);
                          }}>C’est fait</Button>
                          <Button size="sm" variant="ghost" onClick={() => setEdite(e)}>Modifier</Button>
                          {qui.direction && <Button size="sm" variant="ghost" onClick={() => { effaceLaLigne(e); toast('Échéance effacée.'); }}>Effacer</Button>}
                        </div>
                      )}
                    </>
                  )}
                  {t && (
                    <div className="sec-actions">
                      <Button size="sm" variant="ghost" onClick={() => va(VIENT[t.vient]?.onglet ?? 'jour')}>Ouvrir</Button>
                    </div>
                  )}
                </Repliee>
              );
            })}
          </div>
        </section>
      ))}
      {edite && <FicheDeLEcheance qui={qui} branchId={branchId} echeance={edite === 'neuve' ? undefined : edite} onClose={() => setEdite(null)} />}
    </div>
  );
}

function FicheDeLEcheance({ qui, branchId, echeance, onClose }: { qui: Qui; branchId: string; echeance?: Echeance; onClose: () => void }) {
  const [titre, setTitre] = useState(echeance?.titre ?? '');
  const [type, setType] = useState<TypeEcheance>(echeance?.type ?? 'autre');
  const [date, setDate] = useState(echeance?.date ?? '');
  const [recurrence, setRecurrence] = useState<Recurrence>(echeance?.recurrence ?? 'aucune');
  const [traitePar, setTraitePar] = useState<string | undefined>(echeance?.traitePar);
  const [note, setNote] = useState(echeance?.note ?? '');
  const [prive, setPrive] = useState(!!echeance?.prive);
  const garde = () => {
    if (!titre.trim()) { toast('Que faut-il faire à cette date ?'); return; }
    const champs = { titre: titre.trim(), type, date: date || undefined, recurrence, traitePar, note: note.trim() || undefined };
    if (echeance) retouche(echeance, { ...champs, prive: prive || undefined });
    else nouvelleEcheance({ branchId, par: qui.moi, ...champs, prive });
    onClose();
  };
  return createPortal(
    <Modal title={echeance ? 'Modifier l’échéance' : 'Nouvelle échéance'} onClose={onClose} width={600}>
      <div className="sad-form">
        <Field label="Ce qu’il faut faire"><Input value={titre} onChange={(e) => setTitre(e.target.value)} placeholder="Payer le loyer, déclarer à la CNSS…" /></Field>
        <div className="tr-grid tr-grid--2" style={{ gap: 12 }}>
          <Field label="Genre">
            <select className="mnd-input" value={type} onChange={(e) => setType(e.target.value as TypeEcheance)}>
              {(Object.keys(TYPES_ECHEANCE) as TypeEcheance[]).map((k) => <option key={k} value={k}>{TYPES_ECHEANCE[k]}</option>)}
            </select>
          </Field>
          <Field label="Date (vide : à dater)"><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        </div>
        <div className="tr-grid tr-grid--2" style={{ gap: 12 }}>
          <Field label="Revient">
            <select className="mnd-input" value={recurrence} onChange={(e) => setRecurrence(e.target.value as Recurrence)}>
              {(Object.keys(RECURRENCES) as Recurrence[]).map((k) => <option key={k} value={k}>{RECURRENCES[k]}</option>)}
            </select>
          </Field>
          <Field label="Confiée à"><ChoixDuCompte value={traitePar} onChange={setTraitePar} quiTient /></Field>
        </div>
        <Field label="Note"><Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Où payer, quel montant, quelle pièce…" /></Field>
        <CasePrivee qui={qui} value={prive} onChange={setPrive} />
        <div className="sec-actions" style={{ justifyContent: 'flex-end' }}>
          <Button variant="ghost" onClick={onClose}>Fermer</Button>
          <Button variant="copper" onClick={garde}>{echeance ? 'Garder' : 'Poser l’échéance'}</Button>
        </div>
      </div>
    </Modal>,
    document.body,
  );
}
