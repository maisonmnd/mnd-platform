import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button, Field, Input, Modal, Textarea, toast } from '../../../../../ds/components';
import { metsAJour, nouvellePiece, signatairesDe, useSecretariat } from '../../../../../shared/secretariat';
import { dateDite } from '../../../../../shared/secretariat-pur';
import {
  aujourdhui, contactsDe, contratsDe, deposeLesFichiers, effaceLaLigne, nouveauContrat, nouvelleEcheance, prendsLesFichiers, retouche,
} from '../../../../../shared/secretariat-admin';
import {
  ajouteJours, aRevoir, dateCourte, ETATS_CONTRAT, montantDit, PERIODICITES, RENOUVELLEMENTS, tientLeSecretariat, TYPES_CONTRAT, voit,
  type Contrat, type Devise, type Periodicite, type Qui, type TypeContrat,
} from '../../../../../shared/secretariat-admin-pur';
import { CasePrivee, LesFichiers, rappel, Repliee } from './_admin';

/* ══ CONTRATS ET ABONNEMENTS — 14 octobre 2026 ═══════════════════════
   Avec qui, depuis quand, jusqu'à quand, le préavis, le montant dans SA
   devise, la pièce signée. Le préavis et la fin montent dans l'échéancier ;
   « Résilier » ouvre le modèle de résiliation déjà en place, prérempli. */

export function LesContrats({ qui, branchId, ouvreUnDocument }: { qui: Qui; branchId: string; ouvreUnDocument: (id: string) => void }) {
  const [lignes] = useSecretariat();
  const [ouvert, setOuvert] = useState<string | null>(null);
  const [edite, setEdite] = useState<Contrat | 'neuf' | null>(null);
  const jour = aujourdhui();
  const tient = tientLeSecretariat(qui);
  const liste = useMemo(() => contratsDe(lignes).filter((c) => voit(c, qui))
    .sort((a, b) => (a.etat === 'en-cours' ? 0 : 1) - (b.etat === 'en-cours' ? 0 : 1) || a.avecQui.localeCompare(b.avecQui)), [lignes, qui]);

  const resilie = (c: Contrat) => {
    const fiche = signatairesDe(lignes).find((s) => s.userId === qui.moi);
    const p = nouvellePiece({ branchId, entite: 'mnd', modele: 'resiliation', auteurId: qui.moi, signataires: fiche ? [{ userId: fiche.userId, nom: fiche.nom, qualite: fiche.qualite }] : [] });
    const lettre = metsAJour(p, { destinataire: `${c.avecQui}\nService clientèle\nCotonou, Bénin`, objet: `Résiliation : ${c.titre}${c.debut ? `, depuis le ${dateDite(c.debut)}` : ''}` });
    toast('La lettre de résiliation est prête à relire et signer.');
    ouvreUnDocument(lettre.id);
  };
  const posePreavis = (c: Contrat) => {
    if (!c.fin) { toast('Donnez d’abord la date de fin ou de renouvellement.'); return; }
    const date = c.preavisJours ? ajouteJours(c.fin, -c.preavisJours) : c.fin;
    nouvelleEcheance({ branchId, par: qui.moi, titre: `Décider : garder ou résilier ${c.titre}`, type: 'contrat', date, recurrence: 'aucune', contratId: c.id, prive: c.prive });
    toast(`Échéance posée au ${dateCourte(date)}.`);
  };

  return (
    <div className="sad-onglet">
      <div className="sad-outils">
        <span className="sad-doux">Le bail, les fournisseurs, les logiciels, les assurances.</span>
        {tient && <Button variant="copper" onClick={() => setEdite('neuf')}>+ Nouveau contrat</Button>}
      </div>
      {liste.length === 0 && <div className="sec-vide">Aucun contrat. Le bail de la Maison, Zoho Mail, Supabase, le nom de domaine : un par ligne.</div>}
      <div className="sad-liste">
        {liste.map((c) => {
          const butee = c.fin ? (c.preavisJours ? ajouteJours(c.fin, -c.preavisJours) : c.fin) : undefined;
          const rp = aRevoir(c, jour) ? rappel(butee, jour) : {};
          const periode = [c.debut ? `depuis le ${dateCourte(c.debut)}` : '', c.fin ? `jusqu’au ${dateCourte(c.fin)}` : ''].filter(Boolean).join(', ');
          return (
            <Repliee
              key={c.id} ouverte={ouvert === c.id} surBascule={() => setOuvert(ouvert === c.id ? null : c.id)}
              num={TYPES_CONTRAT[c.type]}
              titre={`${c.avecQui} · ${c.titre}`}
              sous={[periode, c.montant !== undefined ? `${montantDit(c.montant, c.devise)} ${PERIODICITES[c.periodicite]}` : '', c.prive ? 'privé' : ''].filter(Boolean).join(' · ') || undefined}
              badge={rp.badge ? `à revoir ${rp.badge}` : ETATS_CONTRAT[c.etat]} urgent={rp.urgent} fait={c.etat !== 'en-cours'}
            >
              <dl className="sad-fiche">
                <dt>Renouvellement</dt><dd>{RENOUVELLEMENTS[c.renouvellement]}{c.preavisJours ? `, préavis de ${c.preavisJours} jours` : ''}</dd>
                {butee && c.preavisJours ? <><dt>Dernier jour pour résilier</dt><dd>{dateCourte(butee)}</dd></> : null}
                {c.note && <><dt>Note</dt><dd>{c.note}</dd></>}
              </dl>
              <LesFichiers ligne={c} peutAjouter={tient} />
              {tient && (
                <div className="sec-actions">
                  {c.etat === 'en-cours' && <Button size="sm" variant="ghost" onClick={() => posePreavis(c)}>Poser l’échéance du préavis</Button>}
                  {c.etat === 'en-cours' && <Button size="sm" variant="ghost" onClick={() => resilie(c)}>Écrire la résiliation</Button>}
                  {c.etat === 'en-cours' && <Button size="sm" variant="ghost" onClick={() => retouche(c, { etat: 'resilie' })}>Marquer résilié</Button>}
                  <Button size="sm" variant="ghost" onClick={() => setEdite(c)}>Modifier</Button>
                  {qui.direction && <Button size="sm" variant="ghost" onClick={() => { effaceLaLigne(c); toast('Contrat effacé.'); }}>Effacer</Button>}
                </div>
              )}
            </Repliee>
          );
        })}
      </div>
      {edite && <FicheDuContrat qui={qui} branchId={branchId} contrat={edite === 'neuf' ? undefined : edite} onClose={() => setEdite(null)} />}
    </div>
  );
}

function FicheDuContrat({ qui, branchId, contrat, onClose }: { qui: Qui; branchId: string; contrat?: Contrat; onClose: () => void }) {
  const [lignes] = useSecretariat();
  const contacts = contactsDe(lignes);
  const [titre, setTitre] = useState(contrat?.titre ?? '');
  const [type, setType] = useState<TypeContrat>(contrat?.type ?? 'abonnement');
  const [avecQui, setAvecQui] = useState(contrat?.avecQui ?? '');
  const [debut, setDebut] = useState(contrat?.debut ?? '');
  const [fin, setFin] = useState(contrat?.fin ?? '');
  const [renouvellement, setRenouvellement] = useState<Contrat['renouvellement']>(contrat?.renouvellement ?? 'tacite');
  const [preavis, setPreavis] = useState(contrat?.preavisJours ? String(contrat.preavisJours) : '');
  const [montant, setMontant] = useState(contrat?.montant !== undefined ? String(contrat.montant) : '');
  const [devise, setDevise] = useState<Devise>(contrat?.devise ?? 'XOF');
  const [periodicite, setPeriodicite] = useState<Periodicite>(contrat?.periodicite ?? 'mois');
  const [note, setNote] = useState(contrat?.note ?? '');
  const [prive, setPrive] = useState(!!contrat?.prive);
  const [fichiers, setFichiers] = useState<File[]>([]);
  const [envoi, setEnvoi] = useState(false);
  const garde = async () => {
    if (!titre.trim() || !avecQui.trim()) { toast('Le contrat a besoin d’un objet et d’une partie.'); return; }
    const n = parseFloat(montant.replace(/\s/g, '').replace(',', '.'));
    const p = parseInt(preavis, 10);
    const champs = {
      titre: titre.trim(), type, avecQui: avecQui.trim(), contactId: contacts.find((k) => k.nom.toLowerCase() === avecQui.trim().toLowerCase())?.id,
      debut: debut || undefined, fin: fin || undefined, renouvellement, preavisJours: Number.isFinite(p) && p > 0 ? p : undefined,
      montant: Number.isFinite(n) ? n : undefined, devise, periodicite, note: note.trim() || undefined,
    };
    if (contrat) { retouche(contrat, { ...champs, prive: prive || undefined }); onClose(); return; }
    setEnvoi(true);
    const c = nouveauContrat({ branchId, par: qui.moi, ...champs, etat: 'en-cours', prive });
    if (fichiers.length) {
      const r = await deposeLesFichiers(c.id, fichiers);
      if (r.fichiers.length) retouche(c, { fichiers: r.fichiers });
      if (r.erreur) toast(r.erreur, 7000);
    }
    setEnvoi(false);
    onClose();
  };
  return createPortal(
    <Modal title={contrat ? 'Modifier le contrat' : 'Nouveau contrat'} onClose={onClose} width={660}>
      <div className="sad-form">
        <div className="tr-grid tr-grid--2" style={{ gap: 12 }}>
          <Field label="Avec qui">
            <Input value={avecQui} onChange={(e) => setAvecQui(e.target.value)} list="sad-contacts-c" placeholder="Zoho, Supabase, le bailleur…" />
            <datalist id="sad-contacts-c">{contacts.map((k) => <option key={k.id} value={k.nom} />)}</datalist>
          </Field>
          <Field label="Objet"><Input value={titre} onChange={(e) => setTitre(e.target.value)} placeholder="Adresses @maisonmnd.com, bail de la Maison 88…" /></Field>
        </div>
        <div className="tr-grid tr-grid--2" style={{ gap: 12 }}>
          <Field label="Genre">
            <select className="mnd-input" value={type} onChange={(e) => setType(e.target.value as TypeContrat)}>
              {(Object.keys(TYPES_CONTRAT) as TypeContrat[]).map((k) => <option key={k} value={k}>{TYPES_CONTRAT[k]}</option>)}
            </select>
          </Field>
          <Field label="Renouvellement">
            <select className="mnd-input" value={renouvellement} onChange={(e) => setRenouvellement(e.target.value as Contrat['renouvellement'])}>
              {(Object.keys(RENOUVELLEMENTS) as Contrat['renouvellement'][]).map((k) => <option key={k} value={k}>{RENOUVELLEMENTS[k]}</option>)}
            </select>
          </Field>
        </div>
        <div className="tr-grid tr-grid--2" style={{ gap: 12 }}>
          <Field label="Début"><Input type="date" value={debut} onChange={(e) => setDebut(e.target.value)} /></Field>
          <Field label="Fin ou renouvellement"><Input type="date" value={fin} onChange={(e) => setFin(e.target.value)} /></Field>
        </div>
        <div className="tr-grid tr-grid--2" style={{ gap: 12 }}>
          <Field label="Préavis (jours)"><Input inputMode="numeric" value={preavis} onChange={(e) => setPreavis(e.target.value)} placeholder="30" /></Field>
          <Field label="Montant">
            <div style={{ display: 'flex', gap: 6 }}>
              <Input inputMode="decimal" value={montant} onChange={(e) => setMontant(e.target.value)} />
              <select className="mnd-input" value={devise} onChange={(e) => setDevise(e.target.value as Devise)} style={{ maxWidth: 90 }}>
                <option value="XOF">F</option><option value="USD">USD</option><option value="EUR">EUR</option>
              </select>
              <select className="mnd-input" value={periodicite} onChange={(e) => setPeriodicite(e.target.value as Periodicite)} style={{ maxWidth: 140 }}>
                {(Object.keys(PERIODICITES) as Periodicite[]).map((k) => <option key={k} value={k}>{PERIODICITES[k]}</option>)}
              </select>
            </div>
          </Field>
        </div>
        <Field label="Note"><Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} /></Field>
        {!contrat && (
          <Field label="Le contrat signé (photo ou PDF)">
            <input type="file" accept="image/*,application/pdf" multiple onChange={async (e) => {
              const r = await prendsLesFichiers(e.target.files ?? []);
              if (r.erreur) toast(r.erreur, 7000);
              setFichiers(r.fichiers);
            }} />
          </Field>
        )}
        <CasePrivee qui={qui} value={prive} onChange={setPrive} />
        <div className="sec-actions" style={{ justifyContent: 'flex-end' }}>
          <Button variant="ghost" onClick={onClose}>Fermer</Button>
          <Button variant="copper" disabled={envoi} onClick={() => void garde()}>{envoi ? 'Envoi…' : contrat ? 'Garder' : 'Enregistrer'}</Button>
        </div>
      </div>
    </Modal>,
    document.body,
  );
}
