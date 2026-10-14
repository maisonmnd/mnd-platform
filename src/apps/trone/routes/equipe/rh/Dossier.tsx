import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Button, Field, Input, Modal, Select, toast } from '../../../../../ds/components';
import { fmtMoney } from '../../../../../shared/currency';
import { useBranch } from '../../../../../shared/branches';
import {
  PARTAGEE_D_OFFICE, PIECES_ATTENDUES, SMIG_MENSUEL_XOF, TYPES_DE_PIECE, TYPES_D_ENTRETIEN, DECISIONS_DISCIPLINAIRES,
  ajouteJours, dateDite, estReliee, piecesManquantes, sousLeSmig,
  type FicheRh, type PieceDuDossier, type TypeDePiece,
} from '../../../../../shared/rh-pur';
import {
  deposeLaPiece, effaceLaLigneRh, lienDeLaPiece, nouvelleLigneRh, prendsLaPiece, retireLaPiece, retoucheRh,
  useRegistreRh, useReglagesRh,
} from '../../../../../shared/rh';
import { staffStore, type StaffMember } from '../data';
import { aujourdhuiRh, useQuiEcrit } from './_ui';

/* ══ LE DOSSIER D'UNE PERSONNE — 14 octobre 2026 ══════════════════════
   Ce que seule la direction lit (0130) : le contrat et ses dates, l'aptitude
   (apte ou non, jamais un diagnostic), le contact d'urgence, les pièces. Ce
   qui se partage avec elle (ce qu'elle a signé) se lit aussi dans son espace. */

const metsAJour = (id: string, patch: Partial<StaffMember>) =>
  staffStore.set((prev) => prev.map((m) => (m.id === id ? { ...m, ...patch } : m)));

export function DossierModal({ fiche, onClose }: { fiche: StaffMember; onClose: () => void }) {
  const { branch, currency } = useBranch();
  const { moi } = useQuiEcrit();
  const registre = useRegistreRh();
  const [reglages] = useReglagesRh();
  const jour = aujourdhuiRh();
  const pieces = registre.filter((l): l is PieceDuDossier => l.genre === 'piece' && l.staffId === fiche.id);
  const histoire = registre.filter((l) => l.staffId === fiche.id && (l.genre === 'entretien' || l.genre === 'sanction' || l.genre === 'formation'));
  const manque = piecesManquantes(fiche as unknown as FicheRh, pieces);
  const essaiRegle = reglages.essaiJours?.[fiche.role];

  const [finContrat, setFinContrat] = useState(fiche.finContrat ?? '');
  const [finEssai, setFinEssai] = useState(fiche.finEssai ?? '');
  const [apte, setApte] = useState<string>(fiche.aptitude ? (fiche.aptitude.apte ? 'oui' : 'non') : '');
  const [apteLe, setApteLe] = useState(fiche.aptitude?.le ?? '');
  const [urgNom, setUrgNom] = useState(fiche.urgence?.nom ?? '');
  const [urgTel, setUrgTel] = useState(fiche.urgence?.telephone ?? '');
  const [urgLien, setUrgLien] = useState(fiche.urgence?.lien ?? '');
  const [typePiece, setTypePiece] = useState<TypeDePiece>('contrat');
  const [envoi, setEnvoi] = useState(false);

  const garde = () => {
    metsAJour(fiche.id, {
      finContrat: finContrat || undefined,
      finEssai: finEssai || undefined,
      aptitude: apte ? { apte: apte === 'oui', le: apteLe || jour } : undefined,
      urgence: urgTel.trim() ? { nom: urgNom.trim(), telephone: urgTel.trim(), lien: urgLien.trim() || undefined } : undefined,
    });
    toast('Dossier gardé.');
    onClose();
  };

  const ajoutePiece = async (f: File | undefined) => {
    if (!f) return;
    setEnvoi(true);
    const pris = await prendsLaPiece(f);
    if (pris.erreur || !pris.fichier) { toast(pris.erreur ?? 'Ce fichier ne se lit pas.', 7000); setEnvoi(false); return; }
    const partage = PARTAGEE_D_OFFICE[typePiece];
    const p = nouvelleLigneRh<PieceDuDossier>({
      genre: 'piece', branchId: fiche.branchId || branch.id, staffId: fiche.id, type: typePiece,
      titre: TYPES_DE_PIECE[typePiece], le: jour, partage, par: moi,
    });
    const r = await deposeLaPiece(fiche.id, p.id, partage, pris.fichier);
    if (r.erreur || !r.fichier) { effaceLaLigneRh(p); toast(r.erreur ?? 'La pièce n’est pas partie.', 7000); setEnvoi(false); return; }
    retoucheRh(p, { fichier: r.fichier });
    toast(partage ? 'Pièce rangée ; elle la lit dans son espace.' : 'Pièce rangée, lue de la direction seule.');
    setEnvoi(false);
  };
  const ouvre = async (p: PieceDuDossier) => {
    if (!p.fichier) return;
    const url = await lienDeLaPiece(p.fichier.chemin);
    if (url) window.open(url, '_blank', 'noopener'); else toast('Cette pièce ne s’ouvre qu’en ligne.');
  };
  const retire = async (p: PieceDuDossier) => {
    if (p.fichier) await retireLaPiece(p.fichier.chemin);
    effaceLaLigneRh(p);
    toast('Pièce retirée du dossier.');
  };

  return createPortal(
    <Modal title={`Le dossier de ${fiche.name}`} onClose={onClose} width={680}>
      <div className="sad-form">
        {!estReliee(fiche) && (
          <div className="rh-garde">Sa fiche n’a pas d’adresse de connexion : elle ne peut ni pointer ni voir son espace. Posez son adresse dans « Modifier » (compte du Trône).</div>
        )}
        {sousLeSmig(fiche.salaireXof, fiche.contractType) && (
          <div className="rh-garde">Son salaire de base ({fmtMoney(fiche.salaireXof ?? 0, currency)}) est sous le salaire minimum, {fmtMoney(SMIG_MENSUEL_XOF, currency)} par mois depuis le 1er janvier 2023.</div>
        )}
        {manque.length > 0 && (
          <p className="sad-doux">Il manque : {manque.map((m) => PIECES_ATTENDUES[m]).join(' · ')}.</p>
        )}
        <div className="tr-grid tr-grid--2" style={{ gap: 12 }}>
          <Field label={`Contrat · ${fiche.contractType ?? 'à préciser'}`}>
            <Input type="date" value={finContrat} onChange={(e) => setFinContrat(e.target.value)} aria-label="Fin du contrat" disabled={fiche.contractType !== 'CDD'} />
          </Field>
          <Field label="Fin de la période d’essai">
            <Input type="date" value={finEssai} onChange={(e) => setFinEssai(e.target.value)} />
          </Field>
        </div>
        <p className="sad-doux">
          {fiche.contractType === 'CDD' ? 'La fin du CDD se rappelle 30 jours avant. ' : 'La date de fin ne vaut que pour un CDD. '}
          {typeof essaiRegle === 'number'
            ? <>Essai réglé pour « {fiche.role} » : {essaiRegle} jours{fiche.since ? <>, soit jusqu’au {dateDite(ajouteJours(fiche.since, essaiRegle))} <button type="button" className="sad-lien" onClick={() => setFinEssai(ajouteJours(fiche.since, essaiRegle))}>le poser</button></> : null}.</>
            : <>La durée d’essai pour « {fiche.role} » n’est pas réglée : <span className="rh-a-confirmer">à confirmer avec le comptable</span> (Obligations).</>}
        </p>
        <div className="tr-grid tr-grid--2" style={{ gap: 12 }}>
          <Field label="Aptitude médicale">
            <Select value={apte} onChange={(e) => setApte(e.target.value)}>
              <option value="">Pas encore</option>
              <option value="oui">Apte</option>
              <option value="non">Pas apte</option>
            </Select>
          </Field>
          <Field label="Le"><Input type="date" value={apteLe} onChange={(e) => setApteLe(e.target.value)} disabled={!apte} /></Field>
        </div>
        <p className="sad-doux">Apte ou pas, et la date : jamais un diagnostic.</p>
        <div className="tr-grid tr-grid--3" style={{ gap: 12 }}>
          <Field label="À prévenir en cas d’urgence"><Input value={urgNom} onChange={(e) => setUrgNom(e.target.value)} placeholder="Nom" /></Field>
          <Field label="Téléphone"><Input value={urgTel} onChange={(e) => setUrgTel(e.target.value)} placeholder="01 …" /></Field>
          <Field label="Lien"><Input value={urgLien} onChange={(e) => setUrgLien(e.target.value)} placeholder="sœur, conjoint…" /></Field>
        </div>

        <div className="tre-sec-label">Les pièces</div>
        {pieces.length === 0 ? <p className="sad-doux">Aucune pièce au dossier.</p> : (
          <div className="rh-coches">
            {pieces.map((p) => (
              <div key={p.id} className="sad-ajout-ligne">
                <button type="button" className="sad-lien" onClick={() => void ouvre(p)} disabled={!p.fichier}>{p.titre}</button>
                <span className="sad-doux">{dateDite(p.le)} · {p.partage ? 'elle la lit aussi' : 'direction seule'}</span>
                <button type="button" className="sad-lien" onClick={() => retoucheRh(p, { partage: !p.partage })}>{p.partage ? 'ne plus la partager' : 'la partager'}</button>
                <button type="button" className="sad-lien" onClick={() => void retire(p)}>retirer</button>
              </div>
            ))}
          </div>
        )}
        <div className="sad-ajout-ligne">
          <Select value={typePiece} onChange={(e) => setTypePiece(e.target.value as TypeDePiece)} aria-label="Genre de pièce">
            {(Object.keys(TYPES_DE_PIECE) as TypeDePiece[]).map((t) => <option key={t} value={t}>{TYPES_DE_PIECE[t]}</option>)}
          </Select>
          <label className="sec-puce sad-ajout">
            {envoi ? 'Envoi…' : '+ Photo ou PDF'}
            <input type="file" accept="image/*,application/pdf" hidden disabled={envoi} onChange={(e) => { void ajoutePiece(e.target.files?.[0]); e.target.value = ''; }} />
          </label>
        </div>
        <p className="sad-doux">Un contrat, un règlement, une fiche de poste ou un avenant signés se partagent d’office avec elle ; une aptitude ou une pièce d’identité restent à la direction.</p>

        {histoire.length > 0 && (
          <>
            <div className="tre-sec-label">Son histoire à la Maison</div>
            <ul className="sad-etapes">
              {histoire.map((l) => (
                <li key={l.id}>
                  {l.genre === 'entretien' && <>{TYPES_D_ENTRETIEN[l.type]} · {dateDite(l.faitLe ?? l.prevuLe)}{l.faitLe ? '' : ' (prévu)'}</>}
                  {l.genre === 'sanction' && <>{l.decision ? DECISIONS_DISCIPLINAIRES[l.decision] : 'Procédure en cours'} · {dateDite(l.decideeLe ?? l.faitsLe)}</>}
                  {l.genre === 'formation' && <>Formation · {l.titre}</>}
                </li>
              ))}
            </ul>
          </>
        )}
        <div className="sec-actions" style={{ justifyContent: 'flex-end' }}>
          <Button variant="ghost" onClick={onClose}>Fermer</Button>
          <Button variant="copper" onClick={garde}>Garder</Button>
        </div>
      </div>
    </Modal>,
    document.body,
  );
}
