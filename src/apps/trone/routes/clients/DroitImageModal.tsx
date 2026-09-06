import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Input, Modal, toast } from '../../../../ds/components';
import { useBranch } from '../../../../shared/branches';
import { clientsStore, useFamilies, type Client } from '../../../../shared/clients';
import { maisonNom, maisonRaison } from '../../../../shared/identite';
import { droitImagePdf } from '../../../../shared/pdf';
import {
  USAGES, VERSION_DU_TEXTE, MOIS_DE_VALIDITE, estMineure, pourquoiInvalide, texteDuContrat,
  type AccordImage, type CleUsage,
} from '../../../../shared/droit-image';
import { todayISO } from './_shared';

/* ══ FAIRE SIGNER LE DROIT À L'IMAGE — 6 septembre 2026 ══════════════

   « Quand la cliente accepte de montrer sa photo, où est le contrat du droit à
   l'image signé par la cliente ? » (Yéman). Nulle part : la fiche portait une
   date posée par la Maison. Une case cochée par celui qui en profite ne vaut
   rien devant un litige.

   ELLE COCHE, ELLE LIT, ELLE SIGNE, DANS CET ORDRE. Les usages d'abord, parce
   que le texte change selon ce qu'elle accorde : lui faire signer un document
   puis cocher à sa place serait exactement le geste qu'on veut empêcher.

   LE TEXTE SE LIT AVANT, EN ENTIER, à l'écran. Il n'est pas replié, il n'est
   pas résumé : c'est le seul endroit de la Maison où la longueur est juste.

   RIEN NE S'ENREGISTRE SANS LES QUATRE MORCEAUX — un usage, un nom, une
   signature, une date. Le juge est dans `shared/droit-image`, pas ici : un
   écran qui vérifierait lui-même finirait par vérifier autrement qu'un autre. */

const COTE = { l: 640, h: 220 };

export function DroitImageModal({ client, onClose }: { client: Client; onClose: () => void }) {
  const { branch } = useBranch();
  const [familles] = useFamilies();
  const jour = todayISO();
  const mineure = estMineure(client.birthday, jour);

  /* POUR UNE MINEURE, C'EST LE PARENT QUI SIGNE, et le Trône connaît le foyer :
     on propose son nom plutôt que de laisser saisir n'importe qui. */
  const parent = useMemo(() => {
    if (!mineure || !client.familyId) return '';
    const f = familles.find((x) => x.id === client.familyId);
    if (!f?.payerClientId) return '';
    return clientsStore.get().find((c) => c.id === f.payerClientId)?.name ?? '';
  }, [mineure, client.familyId, familles]);

  const [usages, setUsages] = useState<CleUsage[]>([]);
  const [signePar, setSignePar] = useState(mineure ? parent : client.name);
  const [trace, setTrace] = useState('');
  const toile = useRef<HTMLCanvasElement>(null);
  const dessine = useRef(false);

  useEffect(() => { if (mineure && parent && !signePar) setSignePar(parent); }, [mineure, parent, signePar]);

  /* ── LA SIGNATURE, AU DOIGT ──────────────────────────────────────
     Un trait noir sur fond blanc, rien de plus. Elle finit dans un PDF et sur
     une fiche : une signature stylisée serait un dessin, pas un engagement. */
  useEffect(() => {
    const el = toile.current;
    if (!el) return;
    el.width = COTE.l; el.height = COTE.h;
    const c = el.getContext('2d');
    if (!c) return;
    c.fillStyle = '#FFFFFF'; c.fillRect(0, 0, COTE.l, COTE.h);
    c.strokeStyle = '#14141B'; c.lineWidth = 3;
    c.lineCap = 'round'; c.lineJoin = 'round';
  }, []);

  const pointDe = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const el = toile.current!;
    const r = el.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * COTE.l, y: ((e.clientY - r.top) / r.height) * COTE.h };
  };

  const bas = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const el = toile.current!; const c = el.getContext('2d')!;
    el.setPointerCapture(e.pointerId);
    dessine.current = true;
    const p = pointDe(e);
    c.beginPath(); c.moveTo(p.x, p.y); c.lineTo(p.x + 0.1, p.y);
    c.stroke();
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
    setTrace(toile.current!.toDataURL('image/png'));
  };

  const efface = () => {
    const el = toile.current; if (!el) return;
    const c = el.getContext('2d')!;
    c.fillStyle = '#FFFFFF'; c.fillRect(0, 0, COTE.l, COTE.h);
    c.strokeStyle = '#14141B'; c.lineWidth = 3; c.lineCap = 'round'; c.lineJoin = 'round';
    setTrace('');
  };

  const contrat = useMemo(() => texteDuContrat({
    maison: maisonNom(), raison: maisonRaison(), ville: branch.city,
    tete: client.name, signataire: signePar || '…',
    pourEnfant: mineure ? client.name : undefined,
    usages, jourIso: jour,
  }), [signePar, usages, mineure, client.name, branch.city, jour]);

  const projet: Partial<AccordImage> = {
    at: jour, usages, signePar, signature: trace, version: VERSION_DU_TEXTE,
    /* LE TERME SE GRAVE ICI, au moment de la signature : changer la regle de la
       Maison ne doit jamais rallonger un consentement deja donne. */
    mois: MOIS_DE_VALIDITE,
    pourEnfant: mineure ? client.name : undefined,
  };
  const manque = pourquoiInvalide(projet, { mineure });

  const signer = async () => {
    if (manque) { toast(manque); return; }
    const accord: AccordImage = projet as AccordImage;
    clientsStore.set((prev) => prev.map((c) => (c.id === client.id
      ? { ...c, accordImage: accord, accordVitrine: undefined, accordSimulation: undefined }
      : c)));
    try {
      await droitImagePdf({
        houseName: maisonNom(), ville: branch.city,
        titre: contrat.titre, entete: contrat.entete, articles: contrat.articles,
        signataire: signePar, pourEnfant: mineure ? client.name : undefined,
        jourLisible: jour.split('-').reverse().join('/'),
        signature: trace, pied: contrat.pied,
        filename: `droit-image-${client.name.split(' ')[0].toLowerCase()}.pdf`,
      });
    } catch { toast('Accord enregistré, mais le PDF n’a pas pu être produit.'); }
    toast('Accord signé. Remettez-lui son exemplaire.');
    onClose();
  };

  const puce = (actif: boolean): React.CSSProperties => ({
    border: `1px solid ${actif ? 'var(--color-indigo)' : 'var(--hairline)'}`,
    background: actif ? 'var(--color-indigo)' : '#fff',
    color: actif ? '#fff' : 'var(--ink-soft)',
    borderRadius: 3, font: 'inherit', fontSize: 12, padding: '9px 14px', cursor: 'pointer',
    textAlign: 'left',
  });

  return (
    <Modal title="Droit à l’image" onClose={onClose} width={880}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

        <div>
          <div className="trc-microlabel">Ce qu’elle accorde · à cocher avec elle</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', gap: 6 }}>
            {USAGES.map((u) => {
              const on = usages.includes(u.cle);
              return (
                <button
                  key={u.cle}
                  type="button"
                  style={puce(on)}
                  title={u.dit}
                  onClick={() => setUsages((v) => (on ? v.filter((x) => x !== u.cle) : [...v, u.cle]))}
                >
                  {u.mot}
                </button>
              );
            })}
          </div>
          <div className="mnd-muted" style={{ fontSize: 11.5, marginTop: 7, lineHeight: 1.55 }}>
            Ce qui n’est pas coché est écrit comme interdit dans le document, pas seulement omis.
          </div>
        </div>

        {mineure && (
          <div style={{
            border: '1px solid var(--color-copper)', background: 'var(--copper-50, #FAF1E9)',
            borderRadius: 3, padding: '10px 12px', fontSize: 12.5, lineHeight: 1.6,
          }}>
            <b>{client.name} est mineure.</b> C’est son parent ou représentant légal qui signe,
            et la Maison renonce à photographier si l’enfant s’y oppose, quel que soit l’accord
            du parent.
          </div>
        )}

        <div>
          <div className="trc-microlabel">{mineure ? 'Le parent qui signe' : 'Qui signe'}</div>
          <Input
            value={signePar}
            onChange={(e) => setSignePar(e.target.value)}
            placeholder="Nom et prénom, en toutes lettres"
            aria-label="Le nom du signataire"
            style={{ maxWidth: 320 }}
          />
        </div>

        {/* LE TEXTE SE LIT EN ENTIER, À L'ÉCRAN. Le replier ferait signer un
            document que personne n'a ouvert, ce qui est précisément ce que ce
            module existe pour empêcher. */}
        <div>
          <div className="trc-microlabel">Le document · à lire avec elle</div>
          <div style={{
            border: '1px solid var(--hairline)', borderRadius: 3, background: '#fff',
            padding: '14px 16px', maxHeight: '30vh', overflowY: 'auto', fontSize: 12.5, lineHeight: 1.65,
          }}>
            <div style={{ fontFamily: 'var(--font-serif)', fontSize: 19, color: 'var(--color-indigo)', marginBottom: 8 }}>
              {contrat.titre}
            </div>
            {contrat.entete.map((l) => <p key={l} style={{ margin: '0 0 6px' }}>{l}</p>)}
            {contrat.articles.map((a) => (
              <div key={a.n} style={{ marginTop: 10 }}>
                <div style={{ fontWeight: 500, color: 'var(--color-indigo)' }}>Article {a.n} · {a.titre}</div>
                {a.lignes.map((l, i) => (
                  <p key={i} style={{ margin: '4px 0 0', paddingLeft: l.startsWith('·') ? 12 : 0 }}>{l}</p>
                ))}
              </div>
            ))}
            <div className="mnd-muted" style={{ marginTop: 12, fontSize: 11 }}>{contrat.pied}</div>
          </div>
        </div>

        <div>
          <div className="trc-microlabel">Sa signature · au doigt</div>
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
              {trace ? 'Signée.' : 'Passez-lui l’écran.'}
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <Button variant="ghost" style={{ flex: 'none' }} onClick={onClose}>Annuler</Button>
          <Button variant="copper" style={{ flex: 'none' }} disabled={!!manque} onClick={() => void signer()}>
            Enregistrer et remettre le PDF
          </Button>
          {manque && <span className="mnd-muted" style={{ fontSize: 12 }}>{manque}</span>}
        </div>
      </div>
    </Modal>
  );
}
