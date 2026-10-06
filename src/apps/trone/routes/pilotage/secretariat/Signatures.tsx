import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button, Field, Input, Modal, toast } from '../../../../../ds/components';
import {
  chargeMaSignature, creeEntreprise, deposeMaSignature, enregistreMonProfil, enregistreMonSignataire, majEntreprise,
  nettoieLaSignature, profils, signatairesDe, useSecretariat,
} from '../../../../../shared/secretariat';
import { cachetAutoSvg, tamponAutoSvg } from '../../../../../shared/secretariat-tampons';
import type { Entreprise } from '../../../../../shared/secretariat-pur';

/* LES SIGNATURES DU SECRÉTARIAT — 6 octobre 2026.

   « Ma signature » : chacun dépose LA SIENNE (dessinée à l'écran, ou la
   photo d'une signature sur papier blanc, nettoyée : l'encre reste, le
   papier devient transparent). Elle va dans le compartiment privé, que
   seul son titulaire lit (0116). Sa fiche de signataire (nom, qualité)
   est visible de la direction, pour qu'on puisse l'inviter à signer.

   Une entreprise créée à l'instant reçoit la signature de SON signataire,
   dessinée ou importée de la même façon. */

/** Le pavé : on dessine, ou on importe une photo. Rend un PNG transparent. */
export function PaveDeSignature({ valeur, surChange }: { valeur: string | null; surChange: (png: string | null) => void }) {
  const pad = useRef<HTMLCanvasElement>(null);
  const fichier = useRef<HTMLInputElement>(null);
  const trace = useRef<[number, number] | null>(null);
  const aDessine = useRef(false);

  useEffect(() => {
    const c = pad.current;
    const ctx = c?.getContext('2d');
    if (!c || !ctx) return;
    /* LE TRAIT EN COURS NE S'EFFACE PAS (6 octobre : « quand on dessine au
       doigt elle s'efface automatiquement »). Chaque trait fini remonte la
       signature ; ce retour redessinait le pavé en le vidant d'abord, et le
       dessin disparaissait sous le doigt. Quand on dessine, le pavé porte
       déjà le trait : on n'y touche pas. On ne redessine que ce qui vient
       d'ailleurs (la signature gardée, une photo importée). */
    if (aDessine.current) return;
    ctx.clearRect(0, 0, c.width, c.height);
    if (valeur) {
      const img = new Image();
      img.onload = () => {
        const k = Math.min(c.width / img.width, c.height / img.height, 1);
        ctx.drawImage(img, (c.width - img.width * k) / 2, (c.height - img.height * k) / 2, img.width * k, img.height * k);
      };
      img.src = valeur;
    }
  }, [valeur]);

  const point = (e: React.PointerEvent<HTMLCanvasElement>): [number, number] => {
    const c = pad.current!;
    const r = c.getBoundingClientRect();
    return [(e.clientX - r.left) * c.width / r.width, (e.clientY - r.top) * c.height / r.height];
  };
  const ctx = () => {
    const x = pad.current!.getContext('2d')!;
    x.lineWidth = 4; x.lineCap = 'round'; x.lineJoin = 'round'; x.strokeStyle = '#1B2130';
    return x;
  };
  const rendLeTrait = () => {
    const c = pad.current;
    if (!c) return;
    /* Le trait dessiné passe par le même nettoyage qu'une photo : recadré
       sur l'encre, fond transparent. */
    const png = nettoieLaSignatureDuPave(c);
    surChange(png);
  };

  const importe = (f: File | undefined) => {
    if (!f) return;
    const url = URL.createObjectURL(f);
    const img = new Image();
    img.onload = () => {
      const png = nettoieLaSignature(img);
      URL.revokeObjectURL(url);
      if (!png) { toast('Aucun trait trouvé sur la photo : signez au stylo foncé sur papier blanc, et photographiez de jour.'); return; }
      aDessine.current = false;
      surChange(png);
    };
    img.onerror = () => { URL.revokeObjectURL(url); toast('Cette image ne s’ouvre pas.'); };
    img.src = url;
  };

  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <canvas
        ref={pad}
        width={700}
        height={220}
        aria-label="Dessinez la signature ici"
        className="sec-pave"
        onPointerDown={(e) => {
          if (!aDessine.current) { pad.current?.getContext('2d')?.clearRect(0, 0, 700, 220); aDessine.current = true; }
          trace.current = point(e);
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (!trace.current) return;
          const p = point(e);
          const x = ctx();
          x.beginPath(); x.moveTo(trace.current[0], trace.current[1]); x.lineTo(p[0], p[1]); x.stroke();
          trace.current = p;
        }}
        onPointerUp={() => { if (trace.current) rendLeTrait(); trace.current = null; }}
        onPointerCancel={() => { trace.current = null; }}
      />
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <Button variant="ghost" size="sm" onClick={() => { pad.current?.getContext('2d')?.clearRect(0, 0, 700, 220); aDessine.current = true; surChange(null); }}>Effacer</Button>
        {/* UN VRAI BOUTON, pas une étiquette (6 octobre : « le bouton
            importer photo ne marche pas »). L'étiquette vivait dans le champ
            « La signature », lui-même une étiquette qui annule tout clic
            hors d'une commande : le choix du fichier ne s'ouvrait jamais. */}
        <Button variant="ghost" size="sm" onClick={() => fichier.current?.click()}>Importer une photo</Button>
        <input
          ref={fichier}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => { importe(e.target.files?.[0]); e.target.value = ''; }}
        />
        <span className="mnd-muted" style={{ fontSize: 12 }}>Dessinez à la souris ou au doigt, ou importez la photo d’une signature au stylo foncé sur papier blanc.</span>
      </div>
    </div>
  );
}

const nettoieLaSignatureDuPave = (c: HTMLCanvasElement): string | null => {
  /* Le pavé est transparent : on le pose sur du blanc avant le nettoyage. */
  const blanc = document.createElement('canvas');
  blanc.width = c.width; blanc.height = c.height;
  const x = blanc.getContext('2d');
  if (!x) return null;
  x.fillStyle = '#FFFFFF'; x.fillRect(0, 0, c.width, c.height); x.drawImage(c, 0, 0);
  return nettoieLaSignature(blanc);
};

/** Le titre du pavé, à l'allure d'un champ, mais PAS une étiquette : un
    `Field` est un <label> qui annule les clics hors d'une commande, et le
    pavé porte ses propres boutons et son dessin. */
function ChampDuPave({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mnd-field">
      <span className="mnd-field__label">{label}</span>
      {children}
    </div>
  );
}

/** MA SIGNATURE, et mes coordonnées pour les lettres personnelles. */
export function MaSignature({ userId, branchId, nomParDefaut, direction, onClose }: {
  userId: string; branchId: string; nomParDefaut: string; direction: boolean; onClose: () => void;
}) {
  const [lignes] = useSecretariat();
  const fiche = signatairesDe(lignes).find((s) => s.userId === userId);
  const profil = profils(lignes).find((p) => p.userId === userId);
  const [nom, setNom] = useState(fiche?.nom ?? nomParDefaut);
  const [qualite, setQualite] = useState(fiche?.qualite ?? 'Cogérant(e)');
  const [adresse, setAdresse] = useState(profil?.adresse ?? 'Cotonou, Bénin');
  const [telephone, setTelephone] = useState(profil?.telephone ?? '');
  const [png, setPng] = useState<string | null>(null);
  const [charge, setCharge] = useState(true);
  const [envoi, setEnvoi] = useState(false);

  useEffect(() => { void chargeMaSignature(userId).then((s) => { setPng(s); setCharge(false); }); }, [userId]);

  const enregistre = async () => {
    if (!nom.trim()) { toast('Votre nom, tel qu’il s’imprime sous la signature.'); return; }
    setEnvoi(true);
    let ok = true;
    if (png) ok = await deposeMaSignature(userId, png);
    enregistreMonSignataire({ branchId, userId, nom: nom.trim(), qualite: qualite.trim(), aSaSignature: !!png && ok });
    if (direction) enregistreMonProfil({ branchId, userId, nom: nom.trim(), adresse: adresse.trim(), telephone: telephone.trim() });
    setEnvoi(false);
    toast(ok ? 'Votre signature est gardée.' : 'La fiche est gardée, mais la signature n’a pas pu partir : réessayez en ligne.');
    if (ok) onClose();
  };

  return createPortal(
    <Modal title="Ma signature" onClose={onClose} width={620}>
      <div style={{ display: 'grid', gap: 14 }}>
        <p className="mnd-muted" style={{ fontSize: 13, margin: 0 }}>
          Elle est gardée dans un espace privé : vous seul(e) pouvez la lire et la poser. Chaque document signé en garde une copie, comme une page signée.
        </p>
        <div className="tr-grid tr-grid--2" style={{ gap: 12 }}>
          <Field label="Nom sous la signature"><Input value={nom} onChange={(e) => setNom(e.target.value)} /></Field>
          <Field label="Qualité"><Input value={qualite} onChange={(e) => setQualite(e.target.value)} placeholder="Cogérante, Gérant, Directeur…" /></Field>
        </div>
        <ChampDuPave label="La signature">{charge ? <span className="mnd-muted">Lecture…</span> : <PaveDeSignature valeur={png} surChange={setPng} />}</ChampDuPave>
        {direction && (
          <>
            <div className="mnd-eyebrow">Pour vos lettres personnelles</div>
            <div className="tr-grid tr-grid--2" style={{ gap: 12 }}>
              <Field label="Votre adresse"><Input value={adresse} onChange={(e) => setAdresse(e.target.value)} /></Field>
              <Field label="Votre téléphone"><Input value={telephone} onChange={(e) => setTelephone(e.target.value)} placeholder="+229 01 …" /></Field>
            </div>
          </>
        )}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <Button variant="ghost" onClick={onClose}>Fermer</Button>
          <Button variant="copper" onClick={() => void enregistre()} disabled={envoi}>{envoi ? 'Envoi…' : 'Garder ma signature'}</Button>
        </div>
      </div>
    </Modal>,
    document.body,
  );
}

/** UNE ENTREPRISE CRÉÉE À L'INSTANT : nom, mentions, téléphone, signataire
    et sa signature ; le tampon se dessine en direct. */
export function NouvelleEntreprise({ branchId, existante, onClose, surCree }: {
  branchId: string; existante?: Entreprise; onClose: () => void; surCree: (e: Entreprise) => void;
}) {
  const [nom, setNom] = useState(existante?.nom ?? '');
  const [mentions, setMentions] = useState(existante?.mentions ?? 'Cotonou, Bénin');
  const [telephone, setTelephone] = useState(existante?.telephone ?? '');
  const [signataire, setSignataire] = useState(existante?.signataire ?? 'Le Gérant');
  const [signature, setSignature] = useState<string | null>(existante?.signature ?? null);

  const garde = () => {
    if (!nom.trim()) { toast('Le nom de l’entreprise.'); return; }
    if (existante) {
      const e = { ...existante, nom: nom.trim(), mentions: mentions.trim(), telephone: telephone.trim(), signataire: signataire.trim(), signature: signature ?? undefined };
      majEntreprise(existante, e);
      surCree(e);
    } else {
      surCree(creeEntreprise({ branchId, nom: nom.trim(), mentions: mentions.trim(), telephone: telephone.trim(), signataire: signataire.trim(), signature: signature ?? undefined }));
    }
    onClose();
  };

  return createPortal(
    <Modal title={existante ? 'L’entreprise' : 'Nouvelle entreprise'} onClose={onClose} width={700}>
      <div className="tr-cols" style={{ '--cols': 'minmax(0,1.3fr) minmax(0,0.7fr)', gap: 16, alignItems: 'start' } as React.CSSProperties}>
        <div style={{ display: 'grid', gap: 12 }}>
          <Field label="Nom de l’entreprise"><Input value={nom} onChange={(e) => setNom(e.target.value)} placeholder="Nouvelle Société SARL" /></Field>
          <Field label="RCCM, IFU, adresse, courriel"><Input value={mentions} onChange={(e) => setMentions(e.target.value)} /></Field>
          <Field label="Téléphone"><Input value={telephone} onChange={(e) => setTelephone(e.target.value)} placeholder="+229 01 …" /></Field>
          <Field label="Signataire (nom et qualité)"><Input value={signataire} onChange={(e) => setSignataire(e.target.value)} /></Field>
          <ChampDuPave label="Sa signature"><PaveDeSignature valeur={signature} surChange={setSignature} /></ChampDuPave>
        </div>
        <div style={{ display: 'grid', gap: 8, justifyItems: 'center' }}>
          <span className="mnd-eyebrow">Ses tampons, dessinés à l’instant</span>
          <div style={{ width: '100%', maxWidth: 220 }} dangerouslySetInnerHTML={{ __html: tamponAutoSvg(nom, mentions, telephone).replace('width="600" height="600"', 'width="100%"') }} />
          <div style={{ width: '100%', maxWidth: 260 }} dangerouslySetInnerHTML={{ __html: cachetAutoSvg(nom, mentions, telephone).replace('width="600" height="300"', 'width="100%"') }} />
          <span className="mnd-muted" style={{ fontSize: 12, textAlign: 'center' }}>Gardée pour la fois suivante, avec sa propre série de numéros.</span>
        </div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
        <Button variant="ghost" onClick={onClose}>Fermer</Button>
        <Button variant="copper" onClick={garde}>{existante ? 'Garder' : 'Créer l’entreprise'}</Button>
      </div>
    </Modal>,
    document.body,
  );
}
