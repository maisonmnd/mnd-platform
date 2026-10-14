import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button, Field, Input, Modal, Segs, Textarea, toast } from '../../../../../ds/components';
import { metsAJour, nouvellePiece, pieces, signatairesDe, useSecretariat } from '../../../../../shared/secretariat';
import { dateDite } from '../../../../../shared/secretariat-pur';
import {
  aujourdhui, contactsDe, courriersDe, demarchesDe, deposeLesFichiers, echeancesDe, effaceLaLigne, envoieLeDepart, nouveauCourrier, prendsLesFichiers, retouche,
} from '../../../../../shared/secretariat-admin';
import {
  anneesCloses, dateCourte, ETATS_ARRIVE, ETATS_DEPART, estFige, MOYENS, peutEcrire, recuLeDe, tientLeSecretariat, voit,
  type Courrier as LeCourrier, type Moyen, type Qui, type Sens,
} from '../../../../../shared/secretariat-admin-pur';
import { CasePrivee, ChoixDuCompte, LesFichiers, rappel, Repliee, useNomDuCompte } from './_admin';
import { FicheDeLEcheance } from './Echeancier';

/* ══ LE COURRIER — 14 octobre 2026 (maquette TChByryY…, choix « photo et classeur ») ══
   Ce qui arrive et ce qui part, numéroté A-2026-001 et D-2026-001. Le numéro
   s'écrit au crayon sur l'original, rangé au classeur dans le même ordre.
   « Répondre » ouvre une lettre de la Maison préremplie, et prépare son
   départ. La personne à qui un courrier est confié le voit et le marque
   répondu ; le reste ne regarde que le secrétariat (0129). */

export function LeCourrierDeLaMaison({ qui, branchId, ouvreUnDocument }: { qui: Qui; branchId: string; ouvreUnDocument: (id: string) => void }) {
  const [lignes] = useSecretariat();
  const [sens, setSens] = useState<Sens>('arrive');
  const [cherche, setCherche] = useState('');
  const [ouvert, setOuvert] = useState<string | null>(null);
  const [edite, setEdite] = useState<LeCourrier | 'neuf' | null>(null);
  const [echeancePour, setEcheancePour] = useState<LeCourrier | null>(null);
  const nomDe = useNomDuCompte();
  const jour = aujourdhui();
  const tient = tientLeSecretariat(qui);
  const closes = anneesCloses(lignes as { genre: string; annee?: unknown }[]);
  const docs = pieces(lignes);
  const demarches = demarchesDe(lignes);
  const echeances = echeancesDe(lignes);
  const q = cherche.trim().toLowerCase();
  const liste = useMemo(() => courriersDe(lignes)
    .filter((c) => c.sens === sens && voit(c, qui))
    .filter((c) => !q || [c.numero, c.correspondant, c.objet, c.note].some((t) => (t ?? '').toLowerCase().includes(q)))
    .sort((a, b) => b.numero.localeCompare(a.numero)), [lignes, sens, qui, q]);

  const repond = (c: LeCourrier) => {
    const fiche = signatairesDe(lignes).find((s) => s.userId === qui.moi);
    const p = nouvellePiece({
      branchId, entite: 'mnd', modele: 'lettre', auteurId: qui.moi,
      signataires: fiche ? [{ userId: fiche.userId, nom: fiche.nom, qualite: fiche.qualite }] : [],
    });
    const lettre = metsAJour(p, {
      destinataire: `${c.correspondant}\nCotonou, Bénin`,
      objet: `Votre courrier du ${dateDite(c.date)}${c.objet ? ` : ${c.objet}` : ''}`,
    });
    nouveauCourrier({
      branchId, par: qui.moi, sens: 'depart', date: jour, correspondant: c.correspondant, contactId: c.contactId,
      objet: `Réponse : ${c.objet}`, pieceId: lettre.id, repondA: c.id, demarcheId: c.demarcheId, prive: c.prive,
    });
    retouche(c, { pieceId: lettre.id });
    toast('La réponse est prête : elle attend au départ, marquez-la envoyée quand elle part.');
    ouvreUnDocument(lettre.id);
  };

  return (
    <div className="sad-onglet">
      <div className="sad-outils">
        <Segs<Sens> options={[{ value: 'arrive', label: 'Arrivé' }, { value: 'depart', label: 'Départ' }]} value={sens} onChange={(v) => { setSens(v); setOuvert(null); }} />
        <Input value={cherche} onChange={(e) => setCherche(e.target.value)} placeholder="Chercher : numéro, Moov, impôts…" aria-label="Chercher un courrier" />
        {tient && <Button variant="copper" onClick={() => setEdite('neuf')}>+ Nouveau courrier</Button>}
      </div>
      {liste.length === 0 ? (
        <div className="sec-vide">{tient
          ? (sens === 'arrive' ? 'Aucun courrier arrivé. Une lettre reçue se photographie ici, et prend son numéro.' : 'Aucun courrier parti. Une lettre de la Maison qui part se note ici.')
          : 'Aucun courrier ne vous est confié.'}</div>
      ) : (
        <div className="sad-liste">
          {liste.map((c) => {
            const r = c.sens === 'arrive' && c.etat === 'a-traiter' ? rappel(c.reponseAvant, jour) : {};
            const etat = c.sens === 'arrive' ? ETATS_ARRIVE[c.etat as keyof typeof ETATS_ARRIVE] : ETATS_DEPART[c.etat as keyof typeof ETATS_DEPART];
            const fige = estFige(c, closes, qui.direction);
            const ecrit = peutEcrire(c, qui, false) && !fige;
            const piece = c.pieceId ? docs.find((p) => p.id === c.pieceId) : undefined;
            const sesEcheances = echeances.filter((e) => e.courrierId === c.id && voit(e, qui));
            return (
              <Repliee
                key={c.id} ouverte={ouvert === c.id} surBascule={() => setOuvert(ouvert === c.id ? null : c.id)}
                num={c.numero}
                titre={`${c.correspondant}${c.objet ? ` · ${c.objet}` : ''}`}
                sous={`${c.sens === 'arrive' ? 'Reçu' : 'Envoyé'} le ${dateCourte(c.date)}${c.traitePar ? ` · confié à ${nomDe(c.traitePar)}` : ''}${c.prive ? ' · privé' : ''}`}
                badge={r.badge ? `répondre ${r.badge}` : etat}
                urgent={r.urgent} fait={c.etat === 'classe' || c.etat === 'repondu' || c.etat === 'accuse'}
              >
                <dl className="sad-fiche">
                  {c.reponseAvant && <><dt>Réponse avant</dt><dd>{dateCourte(c.reponseAvant)}</dd></>}
                  {c.moyen && <><dt>Moyen</dt><dd>{MOYENS[c.moyen]}</dd></>}
                  {c.demarcheId && <><dt>Démarche</dt><dd>{demarches.find((d) => d.id === c.demarcheId)?.titre ?? 'une démarche'}</dd></>}
                  {piece && <><dt>Lettre</dt><dd><button type="button" className="sad-lien" onClick={() => ouvreUnDocument(piece.id)}>{piece.numero ?? `Brouillon : ${piece.titre}`}</button></dd></>}
                  {sesEcheances.length > 0 && <><dt>Échéance</dt><dd>{sesEcheances.map((e) => <div key={e.id}>{e.titre} · {e.date ? dateCourte(e.date) : 'à dater'}{e.terminee ? ' · faite' : ''}</div>)}</dd></>}
                  {c.note && <><dt>Note</dt><dd>{c.note}</dd></>}
                  {c.sens === 'arrive' && <><dt>Original</dt><dd>
                    {tient ? (
                      <label className="sad-case"><input type="checkbox" checked={!!c.auClasseur} disabled={!ecrit} onChange={(e) => retouche(c, { auClasseur: e.target.checked })} /> rangé au classeur sous {c.numero}</label>
                    ) : (c.auClasseur ? `rangé au classeur sous ${c.numero}` : 'pas encore rangé')}
                  </dd></>}
                </dl>
                <LesFichiers ligne={c} peutAjouter={tient && ecrit} />
                {fige && <p className="sad-doux">L’année {c.date.slice(0, 4)} est close : ce courrier ne bouge plus.</p>}
                <div className="sec-actions">
                  {c.sens === 'arrive' && tient && ecrit && !c.pieceId && c.etat === 'a-traiter' && <Button size="sm" variant="copper" onClick={() => repond(c)}>Répondre</Button>}
                  {c.sens === 'arrive' && ecrit && c.etat === 'a-traiter' && <Button size="sm" variant="ghost" onClick={() => retouche(c, { etat: 'repondu' })}>Marquer répondu</Button>}
                  {c.sens === 'arrive' && tient && ecrit && <Button size="sm" variant="ghost" onClick={() => setEcheancePour(c)}>Créer une échéance</Button>}
                  {c.sens === 'arrive' && tient && ecrit && c.etat !== 'classe' && <Button size="sm" variant="ghost" onClick={() => retouche(c, { etat: 'classe' })}>Classer</Button>}
                  {c.sens === 'depart' && tient && ecrit && c.etat === 'prepare' && <Button size="sm" variant="copper" onClick={() => { envoieLeDepart(c, lignes, jour); if (c.repondA) toast('Envoyé ; le courrier auquel il répond passe à « répondu ».'); }}>C’est envoyé</Button>}
                  {c.sens === 'depart' && tient && ecrit && c.etat === 'envoye' && <Button size="sm" variant="ghost" onClick={() => retouche(c, { etat: 'accuse' })}>Accusé reçu</Button>}
                  {tient && ecrit && <Button size="sm" variant="ghost" onClick={() => setEdite(c)}>Modifier</Button>}
                  {qui.direction && <Button size="sm" variant="ghost" onClick={() => { effaceLaLigne(c); setOuvert(null); toast(`${c.numero} effacé.`); }}>Effacer</Button>}
                </div>
              </Repliee>
            );
          })}
        </div>
      )}
      {echeancePour && (
        <FicheDeLEcheance
          qui={qui} branchId={branchId} onClose={() => setEcheancePour(null)}
          modele={{
            titre: `${echeancePour.correspondant}${echeancePour.objet ? ` · ${echeancePour.objet}` : ''}`,
            type: /imp[oô]t|fisc|dgi/i.test(`${echeancePour.correspondant} ${echeancePour.objet}`) ? 'impots' : /cnss/i.test(`${echeancePour.correspondant} ${echeancePour.objet}`) ? 'social' : 'autre',
            date: echeancePour.reponseAvant, traitePar: echeancePour.traitePar, prive: echeancePour.prive,
            note: `D’après le courrier ${echeancePour.numero}, reçu le ${dateCourte(echeancePour.date)}.`,
            courrierId: echeancePour.id, demarcheId: echeancePour.demarcheId,
          }}
        />
      )}
      {edite && <FicheDuCourrier qui={qui} branchId={branchId} sens={edite === 'neuf' ? sens : edite.sens} courrier={edite === 'neuf' ? undefined : edite} onClose={() => setEdite(null)} />}
    </div>
  );
}

/* LA FICHE D'UN COURRIER : neuf ou à modifier. Le numéro se donne seul, et
   ne change plus ensuite (il est écrit sur l'original). */
function FicheDuCourrier({ qui, branchId, sens, courrier, onClose }: { qui: Qui; branchId: string; sens: Sens; courrier?: LeCourrier; onClose: () => void }) {
  const [lignes] = useSecretariat();
  const contacts = contactsDe(lignes);
  const demarches = demarchesDe(lignes).filter((d) => d.etat === 'en-cours' || d.etat === 'en-attente' || d.id === courrier?.demarcheId);
  const [date, setDate] = useState(courrier?.date ?? aujourdhui());
  const [correspondant, setCorrespondant] = useState(courrier?.correspondant ?? '');
  const [objet, setObjet] = useState(courrier?.objet ?? '');
  const [traitePar, setTraitePar] = useState<string | undefined>(courrier?.traitePar);
  const [reponseAvant, setReponseAvant] = useState(courrier?.reponseAvant ?? '');
  const [moyen, setMoyen] = useState<Moyen | ''>(courrier?.moyen ?? '');
  const [demarcheId, setDemarcheId] = useState(courrier?.demarcheId ?? '');
  const [note, setNote] = useState(courrier?.note ?? '');
  const [prive, setPrive] = useState(!!courrier?.prive);
  const [fichiers, setFichiers] = useState<File[]>([]);
  const [envoi, setEnvoi] = useState(false);

  const garde = async () => {
    if (!correspondant.trim()) { toast(sens === 'arrive' ? 'De qui vient ce courrier ?' : 'À qui part ce courrier ?'); return; }
    const contactId = contacts.find((k) => k.nom.toLowerCase() === correspondant.trim().toLowerCase())?.id;
    const champs = {
      date, correspondant: correspondant.trim(), contactId, objet: objet.trim(), traitePar,
      reponseAvant: sens === 'arrive' && reponseAvant ? reponseAvant : undefined,
      moyen: sens === 'depart' && moyen ? moyen : undefined,
      demarcheId: demarcheId || undefined, note: note.trim() || undefined,
    };
    if (courrier) { retouche(courrier, { ...champs, prive: prive || undefined }); onClose(); return; }
    setEnvoi(true);
    const c = nouveauCourrier({ branchId, par: qui.moi, sens, ...champs, prive });
    if (fichiers.length) {
      const r = await deposeLesFichiers(c.id, fichiers, 0, recuLeDe(c));
      if (r.fichiers.length) retouche(c, { fichiers: r.fichiers });
      if (r.erreur) toast(r.erreur, 7000);
    }
    toast(`${c.numero} enregistré.${sens === 'arrive' ? ` Écrivez ${c.numero} au crayon sur l’original.` : ''}`, 6000);
    setEnvoi(false);
    onClose();
  };

  return createPortal(
    <Modal title={courrier ? `Modifier ${courrier.numero}` : sens === 'arrive' ? 'Nouveau courrier arrivé' : 'Nouveau courrier au départ'} onClose={onClose} width={640}>
      <div className="sad-form">
        <div className="tr-grid tr-grid--2" style={{ gap: 12 }}>
          <Field label={sens === 'arrive' ? 'Reçu le' : 'Envoyé le'}><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
          <Field label={sens === 'arrive' ? 'De' : 'À'}>
            <Input value={correspondant} onChange={(e) => setCorrespondant(e.target.value)} list="sad-contacts" placeholder="Moov Africa, centre des impôts…" />
            <datalist id="sad-contacts">{contacts.map((k) => <option key={k.id} value={k.nom} />)}</datalist>
          </Field>
        </div>
        <Field label="Objet"><Input value={objet} onChange={(e) => setObjet(e.target.value)} placeholder="Avis, facture, relance…" /></Field>
        <div className="tr-grid tr-grid--2" style={{ gap: 12 }}>
          <Field label="Confié à"><ChoixDuCompte value={traitePar} onChange={setTraitePar} /></Field>
          {sens === 'arrive' ? (
            <Field label="Réponse avant (facultatif)"><Input type="date" value={reponseAvant} onChange={(e) => setReponseAvant(e.target.value)} /></Field>
          ) : (
            <Field label="Moyen">
              <select className="mnd-input" value={moyen} onChange={(e) => setMoyen(e.target.value as Moyen | '')}>
                <option value="">Pas encore dit</option>
                {(Object.keys(MOYENS) as Moyen[]).map((m) => <option key={m} value={m}>{MOYENS[m]}</option>)}
              </select>
            </Field>
          )}
        </div>
        <Field label="Démarche (facultatif)">
          <select className="mnd-input" value={demarcheId} onChange={(e) => setDemarcheId(e.target.value)}>
            <option value="">Aucune</option>
            {demarches.map((d) => <option key={d.id} value={d.id}>{d.titre}</option>)}
          </select>
        </Field>
        <Field label="Note"><Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} /></Field>
        {!courrier && (
          <Field label="Photo ou PDF du courrier">
            <input type="file" accept="image/*,application/pdf" multiple onChange={async (e) => {
              const r = await prendsLesFichiers(e.target.files ?? []);
              if (r.erreur) toast(r.erreur, 7000);
              setFichiers(r.fichiers);
            }} />
            {sens === 'arrive' && <p className="sad-doux" style={{ margin: '6px 0 0' }}>Chaque photo reçoit le tampon « REÇU LE », daté du jour d’arrivée. Un PDF garde sa forme.</p>}
          </Field>
        )}
        <CasePrivee qui={qui} value={prive} onChange={setPrive} />
        <div className="sec-actions" style={{ justifyContent: 'flex-end' }}>
          <Button variant="ghost" onClick={onClose}>Fermer</Button>
          <Button variant="copper" disabled={envoi} onClick={() => void garde()}>{envoi ? 'Envoi…' : courrier ? 'Garder' : 'Enregistrer'}</Button>
        </div>
      </div>
    </Modal>,
    document.body,
  );
}
