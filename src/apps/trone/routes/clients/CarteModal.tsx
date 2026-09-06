import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Modal, toast } from '../../../../ds/components';
import { carteEnBlob, dessineLaCarte } from '../../../../ds/carte';
import { clientsStore, type Client } from '../../../../shared/clients';
import {
  CARTES_DE_LA_MAISON, MOTIFS_DE_MERCI, motDeLaCarte, nomDuFichier, objetDeLaCarte,
  prenomDe, texteDeLaCarte, type CleCarte, type CleMotif, type Genre,
} from '../../../../shared/cartes';

/* ══ LES CARTES DE LA MAISON — 6 septembre 2026 (maquette validée) ═══

   « Chaque fois qu'un client fête son anniversaire, j'aimerais qu'il reçoive
   cette carte », puis « dans le même élan, une carte de remerciement, et une
   carte pour annoncer qu'il ou elle est dans le Cercle » (Yéman).

   RIEN NE PART SANS UNE MAIN. Le Trône dessine, propose le mot, ouvre
   WhatsApp — et s'arrête là. Un message qui part sans qu'une main l'ait relu
   finit toujours par partir au mauvais moment.

   CE QU'UN LIEN NE SAIT PAS FAIRE, on le dit. `wa.me` ne porte pas de pièce
   jointe : sur téléphone, le partage natif envoie l'image directement ; sur
   l'ordinateur, on télécharge et on glisse. Prétendre le contraire ferait
   envoyer cinquante messages sans carte avant que quelqu'un s'en aperçoive. */

const chiffresDe = (t: string): string => (t ?? '').replace(/\D/g, '');

export function CarteModal({ client, onClose }: { client: Client; onClose: () => void }) {
  const [carte, setCarte] = useState<CleCarte>('anniversaire');
  const [motif, setMotif] = useState<CleMotif>('venue');
  /* SON GENRE EST SUR SA FICHE, et il y reste : le demander à chaque envoi,
     c'est se tromper une fois sur dix, et une carte au mauvais genre ne se
     rattrape pas. Absent = féminin, le cas de presque toutes les têtes. */
  const [genre, setGenre] = useState<Genre>(client.auMasculin ? 'homme' : 'femme');
  const [prenom, setPrenom] = useState(prenomDe(client.name));
  const [occupe, setOccupe] = useState(false);
  const toile = useRef<HTMLCanvasElement>(null);

  const demande = useMemo(() => ({ carte, motif, genre, prenom }), [carte, motif, genre, prenom]);
  const contenu = useMemo(() => texteDeLaCarte(demande), [demande]);

  useEffect(() => {
    const el = toile.current;
    if (el) void dessineLaCarte(el, contenu);
  }, [contenu]);

  /* LA MAIN TRANCHE, ET LA FICHE S'EN SOUVIENT. */
  const poseLeGenre = (g: Genre) => {
    setGenre(g);
    clientsStore.set((prev) => prev.map((c) => (c.id === client.id
      ? { ...c, auMasculin: g === 'homme' ? true : undefined } : c)));
  };

  const fichier = async (): Promise<File> => {
    const blob = await carteEnBlob(contenu);
    return new File([blob], nomDuFichier(demande), { type: 'image/png' });
  };

  const telecharger = async () => {
    setOccupe(true);
    try {
      const f = await fichier();
      const url = URL.createObjectURL(f);
      const a = document.createElement('a');
      a.href = url; a.download = f.name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      toast(`${f.name} est sur votre ordinateur.`);
    } finally { setOccupe(false); }
  };

  /* LE PARTAGE NATIF N'EXISTE QUE LÀ OÙ IL EXISTE. On ne montre pas un bouton
     qui ne fera rien : au troisième essai on cesse de cliquer sur tous. */
  const peutPartager = typeof navigator !== 'undefined' && !!navigator.canShare;
  const partager = async () => {
    setOccupe(true);
    try {
      const f = await fichier();
      if (!navigator.canShare?.({ files: [f] })) { await telecharger(); return; }
      await navigator.share({ files: [f], text: motDeLaCarte(demande) });
    } catch {
      /* Un partage annulé n'est pas une erreur : la main a changé d'avis. */
    } finally { setOccupe(false); }
  };

  const tel = chiffresDe(client.phone ?? '');
  const surWhatsApp = () => {
    window.open(`https://wa.me/${tel}?text=${encodeURIComponent(motDeLaCarte(demande))}`, '_blank', 'noopener');
  };
  const parMail = () => {
    const sujet = encodeURIComponent(objetDeLaCarte(demande));
    const corps = encodeURIComponent(motDeLaCarte(demande));
    window.location.href = `mailto:${client.email ?? ''}?subject=${sujet}&body=${corps}`;
  };

  const puce = (actif: boolean): React.CSSProperties => ({
    border: `1px solid ${actif ? 'var(--color-indigo)' : 'var(--hairline)'}`,
    background: actif ? 'var(--color-indigo)' : 'var(--surface-card, #fff)',
    color: actif ? '#fff' : 'var(--ink-soft)',
    borderRadius: 3, font: 'inherit', fontSize: 11.5, padding: '8px 14px', cursor: 'pointer',
  });

  return (
    <Modal title="Sa carte" onClose={onClose} width={960}>
      <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap', alignItems: 'flex-start' }}>

        {/* ── L'APERÇU. Rien ne s'envoie avant qu'on ait vu. ── */}
        <div style={{ flex: '0 0 auto' }}>
          <canvas
            ref={toile}
            style={{
              width: 324, height: 405, display: 'block',
              border: '1px solid var(--hairline)', borderRadius: 3,
            }}
          />
        </div>

        <div style={{ flex: '1 1 340px', minWidth: 300, display: 'flex', flexDirection: 'column', gap: 16 }}>

          <div>
            <div className="trc-microlabel">La carte</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {CARTES_DE_LA_MAISON.map((c) => (
                <button key={c.cle} type="button" style={puce(c.cle === carte)} onClick={() => setCarte(c.cle)}>
                  {c.mot}
                </button>
              ))}
            </div>
          </div>

          {carte === 'merci' && (
            <div>
              <div className="trc-microlabel">Le motif</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {MOTIFS_DE_MERCI.map((m) => (
                  <button key={m.cle} type="button" style={puce(m.cle === motif)} onClick={() => setMotif(m.cle)}>
                    {m.mot}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div>
            <div className="trc-microlabel">Pour</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
              <input
                className="mnd-input"
                value={prenom}
                onChange={(e) => setPrenom(e.target.value)}
                aria-label="Le prénom écrit sur la carte"
                style={{ width: 160, padding: '8px 12px', fontSize: 13 }}
              />
              <button type="button" style={puce(genre === 'femme')} onClick={() => poseLeGenre('femme')}>Chère</button>
              <button type="button" style={puce(genre === 'homme')} onClick={() => poseLeGenre('homme')}>Cher</button>
            </div>
            <div className="mnd-muted" style={{ fontSize: 11.5, marginTop: 7, lineHeight: 1.55 }}>
              Le genre est retenu sur sa fiche, il ne se redemande plus.
            </div>
          </div>

          <div>
            <div className="trc-microlabel">L’envoyer</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <Button variant="copper" style={{ flex: 'none' }} disabled={occupe} onClick={() => void telecharger()}>
                Télécharger l’image
              </Button>
              {peutPartager && (
                <Button variant="ghost" style={{ flex: 'none' }} disabled={occupe} onClick={() => void partager()}>
                  Partager
                </Button>
              )}
              {tel && (
                <Button variant="ghost" style={{ flex: 'none' }} onClick={surWhatsApp}>WhatsApp</Button>
              )}
              {client.email && (
                <Button variant="ghost" style={{ flex: 'none' }} onClick={parMail}>E-mail</Button>
              )}
            </div>
            <div className="mnd-muted" style={{ fontSize: 11.5, marginTop: 9, lineHeight: 1.6 }}>
              {peutPartager
                ? 'Partager envoie l’image directement dans WhatsApp.'
                : 'Téléchargez l’image, puis glissez-la dans la conversation'}
              {peutPartager ? ' ' : ' : '}
              WhatsApp et E-mail ouvrent le message avec le mot déjà écrit, un lien ne sait pas
              porter une pièce jointe.
            </div>
          </div>

          <div style={{
            border: '1px solid var(--hairline)', borderRadius: 3, padding: '10px 12px',
            background: 'var(--surface-2, #FAF8F5)',
          }}>
            <div className="trc-microlabel" style={{ marginBottom: 6 }}>Le mot qui l’accompagne</div>
            <div style={{ fontSize: 12.5, lineHeight: 1.6, color: 'var(--ink)', whiteSpace: 'pre-wrap' }}>
              {motDeLaCarte(demande)}
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
}
