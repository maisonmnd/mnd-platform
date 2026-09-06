import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Button, Modal, toast } from '../../../ds/components';
import { useBranch } from '../../../shared/branches';
import { maisonNom, maisonVille } from '../../../shared/identite';
import { contratPdf } from '../../../shared/pdf';
import { signatureInvalide, type Contrat, type SignatureTracee } from '../../../shared/contrats';

/* ══ FAIRE SIGNER UN CONTRAT — 6 septembre 2026 ══════════════════════

   « Tout comme le contrat du droit à l'image, je dois construire les contrats
   des prestataires MND et les contrats de formation » (Yéman).

   UN SEUL ÉCRAN POUR LES TROIS. Ce qui change d'un contrat à l'autre, ce sont
   les champs à remplir et le texte ; le reste est identique — lire, signer au
   doigt, enregistrer, remettre le PDF. Trois écrans auraient divergé dès le
   deuxième, et l'un aurait fini par accepter une signature que l'autre refuse.

   LE TEXTE SE LIT EN ENTIER, À L'ÉCRAN, avant de signer. Il n'est ni replié ni
   résumé : c'est le seul endroit de la Maison où la longueur est juste. Le
   replier ferait signer un document que personne n'a ouvert, ce qui est
   précisément ce que ce module existe pour empêcher.

   RIEN NE S'ENREGISTRE SANS LES QUATRE MORCEAUX — un nom, un tracé, une date,
   une version. Le juge est dans `shared/contrats`, jamais ici. */

const COTE = { l: 640, h: 220 };

/* ══ LA SIGNATURE AU DOIGT — une seule, partagée ═════════════════════
   Elle sert au contrat comme à l'entretien annuel. Recopiée d'un écran à
   l'autre, elle aurait divergé au premier correctif : l'un accepterait un
   tracé que l'autre refuse, et deux papiers de la Maison ne vaudraient pas
   la même chose. */
export function SignatureAuDoigt(o: {
  trace: string;
  onTrace: (t: string) => void;
  /** Ce qu'on écrit au-dessus du cadre. */
  titre?: string;
  /** Ce qu'on dit quand rien n'est encore tracé. */
  invite?: string;
}) {
  const toile = useRef<HTMLCanvasElement>(null);
  const dessine = useRef(false);

  /* Un trait noir sur fond blanc. Il finit dans un PDF et sur une fiche :
     une signature stylisée serait un dessin, pas un engagement. */
  useEffect(() => {
    const el = toile.current;
    if (!el) return;
    el.width = COTE.l; el.height = COTE.h;
    const c = el.getContext('2d');
    if (!c) return;
    c.fillStyle = '#FFFFFF'; c.fillRect(0, 0, COTE.l, COTE.h);
    c.strokeStyle = '#14141B'; c.lineWidth = 3; c.lineCap = 'round'; c.lineJoin = 'round';
  }, []);

  const pointDe = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = toile.current!.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * COTE.l, y: ((e.clientY - r.top) / r.height) * COTE.h };
  };
  const bas = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const el = toile.current!; const c = el.getContext('2d')!;
    el.setPointerCapture(e.pointerId);
    dessine.current = true;
    const p = pointDe(e);
    c.beginPath(); c.moveTo(p.x, p.y); c.lineTo(p.x + 0.1, p.y); c.stroke();
  };
  const bouge = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!dessine.current) return;
    const c = toile.current!.getContext('2d')!;
    const p = pointDe(e);
    c.lineTo(p.x, p.y); c.stroke();
  };
  const haut = () => {
    if (!dessine.current) return;
    dessine.current = false;
    o.onTrace(toile.current!.toDataURL('image/png'));
  };
  const efface = () => {
    const el = toile.current; if (!el) return;
    const c = el.getContext('2d')!;
    c.fillStyle = '#FFFFFF'; c.fillRect(0, 0, COTE.l, COTE.h);
    c.strokeStyle = '#14141B'; c.lineWidth = 3; c.lineCap = 'round'; c.lineJoin = 'round';
    o.onTrace('');
  };

  return (
    <div>
      <div className="trc-microlabel">{o.titre ?? 'Sa signature · au doigt'}</div>
      <canvas
        ref={toile}
        onPointerDown={bas}
        onPointerMove={bouge}
        onPointerUp={haut}
        onPointerCancel={haut}
        style={{
          width: '100%', maxWidth: 480, aspectRatio: `${COTE.l} / ${COTE.h}`,
          border: '1px solid var(--hairline)', borderRadius: 3, background: '#fff',
          touchAction: 'none', cursor: 'crosshair', display: 'block',
        }}
      />
      <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <Button variant="ghost" style={{ flex: 'none' }} onClick={efface}>Effacer</Button>
        <span className="mnd-muted" style={{ fontSize: 11.5 }}>
          {o.trace ? 'Signée.' : (o.invite ?? 'Passez-lui l’écran.')}
        </span>
      </div>
    </div>
  );
}

export function ContratModal(o: {
  titre: string;
  contrat: Contrat;
  version: string;
  /** Le nom proposé au signataire. */
  signeParDefaut: string;
  /** Ce qu'on écrit au-dessus du trait de signature sur le papier. */
  qualiteSignataire?: string;
  /** Quand quelqu'un signe POUR une autre personne, elle est nommée ici. */
  pourQui?: string;
  /** Les champs propres à ce contrat, au-dessus du texte. */
  champs?: ReactNode;
  /** Le nom du fichier remis. */
  fichier: string;
  onSigne: (s: SignatureTracee) => void;
  onClose: () => void;
}) {
  const { branch } = useBranch();
  const jour = new Date().toISOString().slice(0, 10);
  const [signePar, setSignePar] = useState(o.signeParDefaut);
  const [trace, setTrace] = useState('');

  useEffect(() => { setSignePar(o.signeParDefaut); }, [o.signeParDefaut]);

  const projet: SignatureTracee = {
    at: jour, signePar, signature: trace, version: o.version, pourQui: o.pourQui,
  };
  const manque = signatureInvalide(projet, { pourAutrui: !!o.pourQui });

  const signer = async () => {
    if (manque) { toast(manque); return; }
    o.onSigne(projet);
    try {
      await contratPdf({
        houseName: maisonNom(), ville: branch.city, villeDuSiege: maisonVille(),
        titre: o.contrat.titre, sousTitre: o.contrat.sousTitre,
        entete: o.contrat.entete, articles: o.contrat.articles,
        signataire: signePar, pourEnfant: o.pourQui,
        qualiteSignataire: o.qualiteSignataire,
        jourLisible: jour.split('-').reverse().join('/'),
        signature: trace, pied: o.contrat.pied, filename: o.fichier,
      });
    } catch { toast('Contrat enregistré, mais le PDF n’a pas pu être produit.'); }
    toast('Contrat signé. Remettez-lui son exemplaire.');
    o.onClose();
  };

  return (
    <Modal title={o.titre} onClose={o.onClose} width={880}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {o.champs}

        {/* LE TEXTE SE LIT EN ENTIER, AVANT DE SIGNER. */}
        <div>
          <div className="trc-microlabel">Le document · à lire avec elle</div>
          <div style={{
            border: '1px solid var(--hairline)', borderRadius: 3, background: '#fff',
            padding: '14px 16px', maxHeight: '32vh', overflowY: 'auto', fontSize: 12.5, lineHeight: 1.65,
          }}>
            <div style={{ fontFamily: 'var(--font-serif)', fontSize: 19, color: 'var(--color-indigo)' }}>
              {o.contrat.titre}
            </div>
            {o.contrat.sousTitre && (
              <div style={{ fontSize: 11.5, color: 'var(--copper-700)', marginBottom: 8 }}>
                {o.contrat.sousTitre}
              </div>
            )}
            {o.contrat.entete.map((l) => <p key={l} style={{ margin: '0 0 6px' }}>{l}</p>)}
            {o.contrat.articles.map((a) => (
              <div key={a.n} style={{ marginTop: 10 }}>
                <div style={{ fontWeight: 500, color: 'var(--color-indigo)' }}>Article {a.n} · {a.titre}</div>
                {a.lignes.map((l, i) => (
                  <p key={i} style={{ margin: '4px 0 0', paddingLeft: l.startsWith('·') ? 12 : 0 }}>{l}</p>
                ))}
              </div>
            ))}
            <div className="mnd-muted" style={{ marginTop: 12, fontSize: 11 }}>{o.contrat.pied}</div>
          </div>
        </div>

        <div>
          <div className="trc-microlabel">Qui signe</div>
          <input
            className="mnd-input"
            value={signePar}
            onChange={(e) => setSignePar(e.target.value)}
            placeholder="Nom et prénom, en toutes lettres"
            aria-label="Le nom du signataire"
            style={{ maxWidth: 320 }}
          />
        </div>

        <SignatureAuDoigt trace={trace} onTrace={setTrace} />

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <Button variant="ghost" style={{ flex: 'none' }} onClick={o.onClose}>Annuler</Button>
          <Button variant="copper" style={{ flex: 'none' }} disabled={!!manque} onClick={() => void signer()}>
            Enregistrer et remettre le PDF
          </Button>
          {manque && <span className="mnd-muted" style={{ fontSize: 12 }}>{manque}</span>}
        </div>
      </div>
    </Modal>
  );
}
