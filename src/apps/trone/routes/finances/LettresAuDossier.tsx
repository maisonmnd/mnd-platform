/* LES LETTRES DU PRÊT, RANGÉES AU DOSSIER — 20 septembre 2026.

   « J'aimerais sauvegarder le PDF des lettres d'engagement et partager »
   (Yéman). Maquette `public/maquette-les-lettres-au-dossier.html`, validée,
   cinq arbitrages : la direction seule ouvre, le partage est un lien d'une
   heure, le vierge et le signé se distinguent, le vierge se remplace et le
   signé jamais, et tout s'efface avec la fiche.

   LE MÊME BLOC DEUX FOIS : dans l'écran des prêts, avec le bouton qui
   fabrique le PDF ; dans la fiche du membre, en lecture seule. */

import { useCallback, useEffect, useState } from 'react';
import { Button, toast, demandeUnTexte } from '../../../../ds/components';
import {
  adresseDuCoffre, deposeLaLettreDuPret, lettresDuPretDuPersonnel,
  retireDuCoffre, type LettreRangee,
} from '../../../../shared/engagements-coffre';
import { jourLongDit } from '../../../../shared/engagements';
import { ouvreLaPiece, ChoisirUnePiece } from '../_piece';
import SignerLesLettres, { type TraceDeSignature } from './SignerLesLettres';
import { VERSION_DES_LETTRES } from './lettres-du-pret-pdf';

const cadre = {
  display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap',
  border: '1px solid var(--hairline)', borderRadius: 3, padding: '9px 12px', fontSize: 13,
} as const;

/** Ce que la signature laisse au prêt : le jour, le nom, la version du
    texte signé. Le tracé, lui, ne vit que dans le PDF du coffre. */
export type SignatureDesLettres = { at: string; signePar: string; version: string };

export default function LettresAuDossier({
  staffId, pretId, estDirection, fabriqueLePdf, jour, aSigner, onSignee,
}: {
  /** La fiche du membre, une fois enregistrée. */
  staffId: string | null;
  /** Le prêt, quand le bloc vit dans l'écran des prêts. Absent : toutes ses lettres. */
  pretId?: string;
  estDirection: boolean;
  /** Fabrique le PDF des deux lettres, signé ou non ; absent, le bloc ne
      fait que lire. */
  fabriqueLePdf?: (signature?: { mention?: string; trace: string; signePar: string; jourDit: string }) => Promise<Blob>;
  /** Le jour du prêt (ISO), pour nommer le fichier et dater la signature. */
  jour?: string;
  /** Ce qui s'affiche dans la fenêtre de signature. Absent : pas de signature
      à l'écran (le bloc ne fait que ranger et partager). */
  aSigner?: {
    nom: string; montantXof: number; montantEnLettres: string;
    mensXof: number; mois: number; partPct: number; devise: string; jourDit: string;
  };
  /** Appelé quand les lettres viennent d'être signées : le prêt garde la
      trace (le jour, le nom, la version), jamais l'image. */
  onSignee?: (s: SignatureDesLettres) => void;
}) {
  const [rangees, setRangees] = useState<LettreRangee[] | null | 'lecture'>('lecture');
  const [occupe, setOccupe] = useState(false);
  const [aEffacer, setAEffacer] = useState<string | null>(null);
  const [signeOuvert, setSigneOuvert] = useState(false);

  const relis = useCallback(async () => {
    if (!staffId) return;
    const lues = await lettresDuPretDuPersonnel(staffId);
    setRangees(lues === null ? null : (pretId ? lues.filter((l) => l.pretId === pretId) : lues));
  }, [staffId, pretId]);

  useEffect(() => {
    if (!estDirection || !staffId) { setRangees([]); return; }
    let vivant = true;
    setRangees('lecture');
    void lettresDuPretDuPersonnel(staffId).then((lues) => {
      if (!vivant) return;
      setRangees(lues === null ? null : (pretId ? lues.filter((l) => l.pretId === pretId) : lues));
    });
    return () => { vivant = false; };
  }, [staffId, pretId, estDirection]);

  const liste = Array.isArray(rangees) ? rangees : [];

  /* LA LETTRE VIERGE SE REMPLACE : le montant change, la retenue aussi, et
     deux vierges dans un dossier ne disent plus laquelle on fait signer. */
  const range = async () => {
    if (!staffId || !pretId || !fabriqueLePdf) return;
    setOccupe(true);
    try {
      const pdf = await fabriqueLePdf();
      const anciennes = liste.filter((l) => l.etat === 'vierge').map((l) => l.chemin);
      const nom = `lettres-du-pret-${(jour ?? '').slice(0, 10) || 'du-jour'}.pdf`;
      const pose = await deposeLaLettreDuPret(staffId, pretId, 'vierge', pdf, nom);
      if (!pose) { toast('Les lettres n’ont pas pu être rangées.'); return; }
      if (anciennes.length > 0) await retireDuCoffre(anciennes);
      await relis();
      toast('Les lettres sont rangées au dossier du membre.');
    } catch (e) {
      console.warn('[mnd-prets] PDF des lettres :', e);
      toast('Le PDF n’a pas pu être fabriqué.');
    } finally {
      setOccupe(false);
    }
  };

  /* SIGNER À L'ÉCRAN — 21 septembre 2026. Le PDF naît AVEC la signature, la
     mention de sa main et le tampon de la Maison, et se range comme une
     copie signée : elle ne se remplacera jamais. */
  const signeALEcran = async (t: TraceDeSignature) => {
    if (!staffId || !pretId || !fabriqueLePdf || !aSigner) return;
    setOccupe(true);
    try {
      const pdf = await fabriqueLePdf({ ...t, jourDit: aSigner.jourDit });
      const nom = `lettres-signees-${(jour ?? '').slice(0, 10) || 'du-jour'}.pdf`;
      const pose = await deposeLaLettreDuPret(staffId, pretId, 'signee', pdf, nom);
      if (!pose) { toast('Les lettres signées n’ont pas pu être rangées.'); return; }
      setSigneOuvert(false);
      await relis();
      onSignee?.({ at: (jour ?? '').slice(0, 10), signePar: t.signePar, version: VERSION_DES_LETTRES });
      toast('Lettres signées et rangées au dossier. Elles ne se remplacent pas.');
    } catch (e) {
      console.warn('[mnd-prets] signature des lettres :', e);
      toast('La signature n’a pas pu être enregistrée.');
    } finally {
      setOccupe(false);
    }
  };

  /* LA COPIE SIGNÉE NE REMPLACE RIEN : elle s'ajoute, et c'est elle qui vaut
     preuve. On n'écrase jamais une signature. */
  const deposeSignee = async (f: File) => {
    if (!staffId || !pretId) return;
    setOccupe(true);
    const pose = await deposeLaLettreDuPret(staffId, pretId, 'signee', f, f.name);
    setOccupe(false);
    if (!pose) { toast('La copie signée n’a pas pu être déposée.'); return; }
    await relis();
    toast('Copie signée déposée. Elle ne se remplace pas.');
  };

  /* PARTAGER, C'EST UN LIEN D'UNE HEURE. Un lien qui traîne dans une
     conversation ne rouvre pas un salaire six mois plus tard. */
  const partage = async (l: LettreRangee) => {
    const url = await adresseDuCoffre(l.chemin);
    if (!url) { toast('Le lien n’a pas pu être demandé. Vos droits ne le permettent peut-être pas.'); return; }
    try {
      await navigator.clipboard.writeText(url);
      toast('Lien copié. Il vaut une heure, puis il ne s’ouvre plus.');
    } catch {
      /* LE PRESSE-PAPIER REFUSE quand l'écriture ne suit aucun GESTE de
         l'utilisateur. La fenêtre de la Maison propose le lien écrit et
         sélectionné, et son bouton réessaie : ce clic-là EST un geste. */
      const reponse = await demandeUnTexte({
        quoi: 'Le presse-papier a refusé',
        titre: 'Copiez ce lien à la main.',
        dit: 'Votre navigateur n’a pas laissé la Maison écrire dans le presse-papier. Le lien est prêt et sélectionné.',
        suite: 'Il vaut une heure, puis il ne s’ouvre plus.',
        etiquette: 'À recopier',
        valeur: url,
        accepter: 'Copier',
        refuser: 'Fermer',
        facultatif: true,
      });
      if (reponse === null) return;
      navigator.clipboard.writeText(url)
        .then(() => toast('Lien copié. Il vaut une heure.'))
        .catch(() => toast('Le presse-papier refuse toujours : sélectionnez le lien et copiez-le.'));
    }
  };

  const efface = async (l: LettreRangee) => {
    if (aEffacer !== l.chemin) { setAEffacer(l.chemin); return; }
    setAEffacer(null);
    setOccupe(true);
    const ok = await retireDuCoffre([l.chemin]);
    setOccupe(false);
    if (!ok) { toast('La lettre n’a pas pu être effacée du coffre.'); return; }
    await relis();
    toast('Lettre effacée du coffre.');
  };

  if (!estDirection) {
    return <div className="mnd-muted" style={{ fontSize: 12.5 }}>Les lettres du prêt sont réservées à la direction.</div>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
      {signeOuvert && aSigner && (
        <SignerLesLettres
          sur={aSigner}
          onFerme={() => setSigneOuvert(false)}
          onSigne={(t) => signeALEcran(t)}
        />
      )}
      {fabriqueLePdf && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <Button variant="copper" size="sm" disabled={!staffId || !pretId || occupe} onClick={() => void range()}>
            {occupe ? 'Un instant…' : 'Ranger au dossier · PDF'}
          </Button>
          {aSigner && (
            <Button variant="indigo" size="sm" disabled={!staffId || !pretId || occupe} onClick={() => setSigneOuvert(true)}>
              Faire signer à l’écran
            </Button>
          )}
          <ChoisirUnePiece
            libelle="Déposer la copie signée"
            disabled={!staffId || !pretId || occupe}
            onFichier={(f) => void deposeSignee(f)}
          />
          {!pretId && <span className="mnd-muted" style={{ fontSize: 11.5 }}>Enregistrez d’abord le prêt.</span>}
        </div>
      )}

      {rangees === 'lecture' ? (
        <div className="mnd-muted" style={{ fontSize: 12.5 }}>Lecture du coffre…</div>
      ) : rangees === null ? (
        <div className="mnd-muted" style={{ fontSize: 12.5 }}>Le coffre n’a pas répondu. Rouvrez l’écran dans un instant.</div>
      ) : liste.length === 0 ? (
        <div className="mnd-muted" style={{ fontSize: 12.5 }}>Aucune lettre rangée.</div>
      ) : (
        liste.map((l) => (
          <div key={l.chemin} style={cadre}>
            <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>
              <b style={{ fontWeight: 500 }}>{l.etat === 'signee' ? 'Copie signée' : 'Lettres à signer'}</b>
              <span className="mnd-muted" style={{ display: 'block', fontSize: 11 }}>
                {l.nom}{l.deposeLe ? ` · rangée le ${jourLongDit(l.deposeLe)}` : ''}
              </span>
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <Button variant="ghost" size="sm" onClick={() => void ouvreLaPiece(l.chemin)}>Ouvrir</Button>
              <Button variant="ghost" size="sm" onClick={() => void partage(l)}>Partager</Button>
              <button type="button" className="tre-link-btn" disabled={occupe} onClick={() => void efface(l)}>
                {aEffacer === l.chemin ? 'Confirmer l’effacement' : 'Effacer'}
              </button>
            </span>
          </div>
        ))
      )}
    </div>
  );
}
