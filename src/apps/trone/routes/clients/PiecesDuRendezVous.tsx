import { useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { Button, Field, Input, refus, toast } from '../../../../ds/components';
import { uid } from '../../../../shared/store';
import { jourAn } from '../../../../shared/calendrier';
import type { PieceEnvoyee } from '../../../../shared/avant-le-fauteuil-pur';
import {
  adresseNette, cheminDeLaPiece, deposeLaPiece, extensionDe, genreDuFichier,
  nomDuGenre, origineDite, titreDuFichier, titreDuLien,
} from '../../../../shared/pieces-des-clientes';

/* ══ CE QU'ELLE A ENVOYÉ, DANS LA FENÊTRE DU RENDEZ-VOUS · 31 octobre 2026 ═
   « Avant le fauteuil », choix 5. Dans le volet « Prix, formule, note »,
   après la Note du carnet : les pièces attachées au rendez-vous (titre,
   genre, date, Retirer), « + Un lien » (l'adresse et un titre, le domaine par
   défaut), « + Une photo ou une vidéo » (téléversée dans le coffre
   `pieces-des-clientes` ; en attendant, la pièce porte son chemin).

   LE TÉLÉVERSEMENT NE BLOQUE JAMAIS L'ENREGISTREMENT. Hors ligne, le coffre
   le dit, la fenêtre le répète (« hors ligne, la photo partira plus tard »)
   et n'attache rien : une pièce attachée sans fichier derrière serait une
   promesse vide au fauteuil. L'état des pièces vit chez la fenêtre
   (`setPieces`), qui l'écrit avec la note sur les deux chemins
   d'enregistrement ; ici on ne fait que le faire grandir ou maigrir, par
   mise à jour fonctionnelle : un dépôt qui finit après un lien ajouté ne
   doit pas effacer ce lien. */

type Props = {
  pieces: PieceEnvoyee[];
  onChange: Dispatch<SetStateAction<PieceEnvoyee[]>>;
  /** La tête du rendez-vous : vide tant qu'aucune cliente n'est choisie. */
  clientId: string;
  /** Le rendez-vous enregistré, s'il existe déjà. */
  apptId?: string;
};

export function PiecesDuRendezVous({ pieces, onChange, clientId, apptId }: Props) {
  const [lienOuvert, setLienOuvert] = useState(false);
  const [adresse, setAdresse] = useState('');
  const [titre, setTitre] = useState('');
  const [titreTouche, setTitreTouche] = useState(false);
  /** Le nom du fichier en route vers le coffre, le temps du dépôt. */
  const [enRoute, setEnRoute] = useState<string | null>(null);
  const champFichier = useRef<HTMLInputElement>(null);
  /* LE SOUS-DOSSIER DU COFFRE : le numéro du rendez-vous, ou « nouveau-… » tant
     qu'il n'en a pas. Figé à l'ouverture : deux photos du même rendez-vous
     neuf tombent dans le même dossier. */
  const dossier = useRef(apptId ?? `nouveau-${uid()}`);

  /* Le titre proposé suit l'adresse (son domaine) jusqu'au premier mot écrit
     à la main. */
  const titreMontre = titreTouche ? titre : titreDuLien(adresse);

  const gardeLeLien = () => {
    const url = adresseNette(adresse);
    if (!url) { refus('Ce n’est pas une adresse. Collez le lien tel que WhatsApp le donne.'); return; }
    const t = (titreTouche ? titre.trim() : '') || titreDuLien(url);
    onChange((prev) => [...prev, { id: uid(), kind: 'lien', titre: t, quand: new Date().toISOString(), url, origine: 'main' }]);
    setAdresse(''); setTitre(''); setTitreTouche(false); setLienOuvert(false);
  };

  const choisitLeFichier = async (f: File | undefined) => {
    if (!f) return;
    const genre = genreDuFichier(f.type, f.name);
    if (!genre) { refus('Seules une photo (JPEG, PNG, WebP, HEIC) ou une vidéo (MP4, MOV) se gardent ici.'); return; }
    if (!clientId) { refus('Choisissez d’abord la cliente : la pièce se range dans son dossier.'); return; }
    const id = uid();
    const chemin = cheminDeLaPiece(clientId, dossier.current, id, extensionDe(f.name));
    const mot = genre === 'photo' ? 'la photo' : 'la vidéo';
    setEnRoute(f.name);
    const sort = await deposeLaPiece(chemin, f);
    setEnRoute(null);
    if (sort === 'hors-ligne') { refus(`Hors ligne : ${mot} partira plus tard, quand le Trône aura retrouvé la Maison. Le rendez-vous, lui, s’enregistre.`); return; }
    if (sort === 'trop-lourd') { refus(`${mot === 'la photo' ? 'La photo' : 'La vidéo'} est trop lourde pour le coffre (60 Mo au plus).`); return; }
    if (sort === 'refuse') { refus(`Le coffre a refusé ${mot}. Réessayez dans un instant.`); return; }
    onChange((prev) => [...prev, { id, kind: genre, titre: titreDuFichier(f.name), quand: new Date().toISOString(), chemin, origine: 'main' }]);
    toast(`${mot === 'la photo' ? 'La photo' : 'La vidéo'} est dans le coffre, attachée au rendez-vous.`);
  };

  /* RETIRER ne touche pas au coffre : une pièce retirée par erreur se
     retrouve dans le dossier de la tête ; une pièce effacée du coffre, non. */
  const retire = (id: string) => onChange((prev) => prev.filter((p) => p.id !== id));

  return (
    <div className="trc-pieces-rdv">
      <span className="trc-microlabel" style={{ marginBottom: 0 }}>
        Ce qu’elle a envoyé{pieces.length > 0 ? ` · ${pieces.length} ${pieces.length > 1 ? 'pièces' : 'pièce'}` : ''}
      </span>
      {pieces.length > 0 && (
        <ul className="trc-pieces-rdv__liste">
          {pieces.map((p) => (
            <li key={p.id} className="trc-pieces-rdv__ligne">
              <IconeDuGenre kind={p.kind} />
              <span className="trc-pieces-rdv__texte">
                <b title={p.kind === 'lien' ? p.url : p.chemin}>{p.titre}</b>
                <small>{nomDuGenre(p.kind)} · {origineDite(p.origine)} · {jourAn(p.quand)}</small>
              </span>
              <button type="button" className="trc-pieces-rdv__retirer" onClick={() => retire(p.id)}>Retirer</button>
            </li>
          ))}
        </ul>
      )}
      {lienOuvert ? (
        <div className="trc-pieces-rdv__lien">
          <Field label="L’adresse du lien">
            <Input
              value={adresse}
              onChange={(e) => setAdresse(e.target.value)}
              placeholder="https://www.facebook.com/…"
              inputMode="url"
              autoFocus
            />
          </Field>
          <Field label="Son titre">
            <Input
              value={titreMontre}
              onChange={(e) => { setTitre(e.target.value); setTitreTouche(true); }}
              placeholder="Le domaine, si rien n’est écrit"
            />
          </Field>
          <div className="trc-pieces-rdv__gestes">
            <Button type="button" variant="copper" size="sm" onClick={gardeLeLien}>Garder le lien</Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => { setLienOuvert(false); setAdresse(''); setTitre(''); setTitreTouche(false); }}>Laisser</Button>
          </div>
        </div>
      ) : (
        <div className="trc-pieces-rdv__gestes">
          <button type="button" className="trc-pieces-rdv__ajout" onClick={() => setLienOuvert(true)}>+ Un lien</button>
          <button
            type="button"
            className="trc-pieces-rdv__ajout"
            disabled={!!enRoute}
            title={clientId ? 'Une photo (JPEG, PNG, WebP, HEIC) ou une vidéo (MP4, MOV)' : 'Choisissez d’abord la cliente'}
            onClick={() => champFichier.current?.click()}
          >
            + Une photo ou une vidéo
          </button>
          <input
            ref={champFichier}
            type="file"
            /* La liste du coffre (0147) ; les extensions en plus, pour un
               Windows qui ne connaît pas le type HEIC ou QuickTime. */
            accept="image/jpeg,image/png,image/webp,image/heic,.heic,video/mp4,video/quicktime,.mov"
            hidden
            onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; void choisitLeFichier(f); }}
          />
        </div>
      )}
      {enRoute && <span className="trc-pieces-rdv__attente">« {enRoute} » part vers le coffre…</span>}
    </div>
  );
}

function IconeDuGenre({ kind }: { kind: PieceEnvoyee['kind'] }) {
  if (kind === 'video') {
    return <svg viewBox="0 0 30 30" aria-hidden="true"><circle cx="15" cy="15" r="13" fill="none" stroke="currentColor" strokeWidth="2" /><path d="M12 9.5v11l9-5.5z" fill="currentColor" /></svg>;
  }
  if (kind === 'photo') {
    return <svg viewBox="0 0 30 30" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2"><rect x="4" y="6" width="22" height="18" rx="2" /><circle cx="11" cy="12.5" r="2.2" fill="currentColor" stroke="none" /><path d="M6 22l6-6 4 4 3-3 5 5" /></svg>;
  }
  return (
    <svg viewBox="0 0 30 30" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
      <path d="M12.5 17.5l5-5" />
      <path d="M14 10.5l2-2a4 4 0 0 1 5.6 5.6l-2 2" />
      <path d="M16 19.5l-2 2a4 4 0 0 1-5.6-5.6l2-2" />
    </svg>
  );
}
