import { useState } from 'react';
import { Button, Modal, Select, toast } from '../../../../ds/components';
import { useBranch } from '../../../../shared/branches';
import { useAuth } from '../../../../shared/auth';
import { filStore, nouveauMessage, CANAL_MAISON, A_PRENDRE, PRIORITES, type FilMessage, type FilPiece } from '../../../../shared/fil';
import { useStaff, useAnnuaire, nomDuCompte, adresseDe } from './data';

/* ═══════════════════════════════════════════════════════════════════
   DEMANDER — la porte unique, posée sur la pièce (19-20 août 2026).

   « L'autre porte : demander depuis la pièce » (maquette du Fil) : on ne
   pense pas « j'ouvre le chat », on est DEVANT un rituel, une fiche, une
   facture, et l'on veut que quelqu'un s'en occupe. La demande naît là où le
   travail se trouve et atterrit dans Le Fil, la pièce attachée — celle qui
   porte une facture se referme d'elle-même au règlement.

   UN SEUL composant pour toutes les portes : trois modales qui divergent
   finissent par dire trois choses différentes. */
export function DemanderModal({ piece, sousTitre, onClose }: {
  piece: FilPiece;
  /** La ligne qui dit de quoi on parle — « Jade K. · 17 août · VÈKPÈ… ». */
  sousTitre: string;
  onClose: () => void;
}) {
  const { branch } = useBranch();
  const { session } = useAuth();
  const [equipe] = useStaff();
  const [annuaire] = useAnnuaire();

  const monMail = (session?.user?.email ?? '').trim().toLowerCase();
  const maFiche = equipe.find((m) => adresseDe(m) === monMail);
  const monNom = nomDuCompte(annuaire, monMail, maFiche?.name?.trim() || monMail.split('@')[0] || 'La maison');

  const [qui, setQui] = useState('');
  const [quoi, setQuoi] = useState('');
  const [echeance, setEcheance] = useState('');
  const [priorite, setPriorite] = useState('');

  const nature = piece.kind === 'facture' ? 'la facture' : piece.kind === 'rituel' ? 'le rituel' : 'la fiche';
  const parDefaut = `Traiter ${nature}, ${piece.label}.`;

  const envoyer = () => {
    const aPrendre = qui === A_PRENDRE;
    const dest = aPrendre ? undefined : equipe.find((m) => m.id === qui);
    if (!aPrendre && !dest) return;
    filStore.set((prev) => [...prev, nouveauMessage({
      branchId: branch.id,
      canal: CANAL_MAISON,
      auteurMail: monMail,
      auteurNom: monNom,
      texte: quoi.trim() || parDefaut,
      piece,
      demandePour: aPrendre ? A_PRENDRE : adresseDe(dest!),
      demandePourNom: aPrendre ? 'À prendre' : dest!.name,
      echeance: echeance || undefined,
      priorite: (priorite || undefined) as FilMessage['priorite'],
      /* Une pièce d'argent marque la demande : le sans-prix ne la verra pas. */
      argent: piece.kind === 'facture' || undefined,
    })]);
    toast(aPrendre ? 'Demande posée, à prendre sur le Tableau.' : `Demande adressée à ${dest!.name}.`);
    onClose();
  };

  return (
    <Modal title="Demander qu'on s'en occupe." onClose={onClose} width={480}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ fontFamily: 'var(--font-sans)', fontSize: 12.5, lineHeight: 1.6, color: 'var(--ink-soft)' }}>
          <b style={{ color: 'var(--color-indigo)' }}>{sousTitre}</b>
          <br />
          La demande part dans <b style={{ color: 'var(--color-indigo)' }}>Le Fil</b> et sur
          le <b style={{ color: 'var(--color-indigo)' }}>Tableau</b>, la pièce attachée
          {piece.kind === 'facture' ? ', et se referme d’elle-même quand la facture sera réglée' : ''}.
        </div>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontFamily: 'var(--font-sans)', fontSize: 10, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--ink-soft)' }}>À qui</span>
          <Select value={qui} onChange={(e) => setQui(e.target.value)} style={{ fontSize: 12 }}>
            <option value="">Choisir…</option>
            <option value={A_PRENDRE}>À prendre, qui veut s’en charge</option>
            {equipe.filter((m) => m.branchId === branch.id).map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </Select>
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontFamily: 'var(--font-sans)', fontSize: 10, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--ink-soft)' }}>Ce qu'il faut faire</span>
          <textarea
            className="mnd-input"
            rows={2}
            value={quoi}
            onChange={(e) => setQuoi(e.target.value)}
            placeholder={parDefaut}
            style={{ padding: '8px 10px', fontSize: 13, resize: 'vertical' }}
          />
        </label>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1, minWidth: 140 }}>
            <span style={{ fontFamily: 'var(--font-sans)', fontSize: 10, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--ink-soft)' }}>Échéance · facultatif</span>
            <input className="mnd-input" type="date" value={echeance} onChange={(e) => setEcheance(e.target.value)} style={{ padding: '7px 10px', fontSize: 12.5 }} />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1, minWidth: 140 }}>
            <span style={{ fontFamily: 'var(--font-sans)', fontSize: 10, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--ink-soft)' }}>Priorité · facultatif</span>
            <Select value={priorite} onChange={(e) => setPriorite(e.target.value)} style={{ fontSize: 12 }}>
              <option value="">Sans priorité</option>
              {PRIORITES.map((p) => <option key={p.cle} value={p.cle}>{p.nom}</option>)}
            </Select>
          </label>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Button variant="copper" style={{ flex: 1 }} disabled={!qui} onClick={envoyer}>Demander</Button>
          <Button variant="ghost" onClick={onClose}>Annuler</Button>
        </div>
      </div>
    </Modal>
  );
}
