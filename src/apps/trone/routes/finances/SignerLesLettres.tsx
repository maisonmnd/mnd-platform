/* FAIRE SIGNER LES LETTRES DU PRÊT, À L'ÉCRAN — 21 septembre 2026.

   « Signer le PDF du prêt depuis l'écran du Trône, de manière digitale »
   (Yéman). Même geste que la décharge d'un engagement (15 septembre) : on
   passe l'écran, la personne écrit au doigt, et la trace part dans le PDF.

   DEUX TRACÉS, PAS UN. Une reconnaissance de dette veut la somme écrite DE
   LA MAIN de l'emprunteur, en lettres et en chiffres, au-dessus de sa
   signature : c'est ce qui la distingue d'un simple paraphe. On lui fait
   donc recopier la mention, puis signer. Sans la mention, le Trône laisse
   signer quand même, mais il le dit.

   CE QUI EST SIGNÉ SE RAPPELLE AVANT : le montant, la retenue, la durée. On
   ne fait pas signer un écran qui ne montre pas ce qu'il engage. */

import { useState } from 'react';
import { Button, Field, Input, Modal, toast } from '../../../../ds/components';
import { fmtMoney } from '../../../../shared/currency';
import { ToileDeSignature } from '../_signature';
import { mentionDuPret } from './lettres-du-pret-pdf';

export type TraceDeSignature = { mention?: string; trace: string; signePar: string };

export default function SignerLesLettres({ sur, onFerme, onSigne }: {
  sur: {
    nom: string;
    montantXof: number;
    montantEnLettres: string;
    mensXof: number;
    mois: number;
    partPct: number;
    devise: string;
  };
  onFerme: () => void;
  onSigne: (s: TraceDeSignature) => Promise<void>;
}) {
  const [mention, setMention] = useState('');
  const [trace, setTrace] = useState('');
  const [signePar, setSignePar] = useState(sur.nom);
  const [occupe, setOccupe] = useState(false);

  const aRecopier = mentionDuPret(sur.montantEnLettres, sur.montantXof);

  const enregistre = async () => {
    if (!trace) { toast('Faites-lui signer : la signature manque.'); return; }
    if (!signePar.trim()) { toast('Écrivez le nom de la personne qui signe.'); return; }
    setOccupe(true);
    try {
      await onSigne({ mention: mention || undefined, trace, signePar: signePar.trim() });
    } finally {
      setOccupe(false);
    }
  };

  return (
    <Modal title="Faire signer les lettres." onClose={onFerme} width={560}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* CE QUI EST SIGNÉ, SOUS SES YEUX. */}
        <div style={{ border: '1px solid var(--hairline)', borderRadius: 3, padding: '11px 13px', fontSize: 13, lineHeight: 1.6 }}>
          <b style={{ fontWeight: 500 }}>{sur.nom}</b> reconnaît avoir reçu{' '}
          <b style={{ fontWeight: 500 }}>{fmtMoney(sur.montantXof, sur.devise)}</b> à titre de prêt sans intérêt,
          remboursé par une retenue de <b style={{ fontWeight: 500 }}>{fmtMoney(sur.mensXof, sur.devise)}</b> par
          bulletin, soit {sur.partPct.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} % du salaire de base,
          pendant <b style={{ fontWeight: 500 }}>{sur.mois} mois</b>.
        </div>

        <Field label="La mention, de sa main">
          <div className="mnd-muted" style={{ fontSize: 12, lineHeight: 1.5, marginBottom: 8 }}>
            À recopier au doigt, mot pour mot : <b style={{ color: 'var(--color-indigo)' }}>« {aRecopier} »</b>
          </div>
          <ToileDeSignature onChange={setMention} invite="Passez-lui l’écran, il recopie la mention." />
        </Field>

        <Field label="Sa signature">
          <ToileDeSignature onChange={setTrace} invite="Puis il signe au doigt." />
        </Field>

        <Field label="Nom du signataire, tel qu’il figurera sous la signature">
          <Input value={signePar} onChange={(e) => setSignePar(e.target.value)} />
        </Field>

        {!mention && (
          <div className="mnd-muted" style={{ fontSize: 11.5, lineHeight: 1.55 }}>
            Sans la mention écrite de sa main, une reconnaissance de dette se conteste plus facilement.
            La Maison peut signer quand même, en connaissance de cause.
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, marginTop: 2 }}>
          <Button variant="ghost" onClick={onFerme}>Annuler</Button>
          <Button variant="copper" style={{ flex: 1 }} disabled={occupe || !trace} onClick={() => void enregistre()}>
            {occupe ? 'Un instant…' : 'Enregistrer la signature et ranger le PDF'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
