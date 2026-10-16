import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { PDFDocumentProxy } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { Button, Modal, Select, toast } from '../../../../../ds/components';
import { asset } from '../../../../../shared/asset';
import { useAuth } from '../../../../../shared/auth';
import { chargeMaSignature, chargeMonParaphe, deposeMonParaphe, signatairesDe, useSecretariat } from '../../../../../shared/secretariat';
import { deposeLesFichiers, retouche as retoucheLaLigne } from '../../../../../shared/secretariat-admin';
import type { Fichier, LigneAdministrative } from '../../../../../shared/secretariat-admin-pur';
import { TAMPONS, TAMPON_A_DATER, dateSurLeRecu, type Tampon } from '../../../../../shared/secretariat-tampons';
import {
  LARGEUR_DE_DEPART, TAILLE_DU_TEXTE, contenuDeLaCopie, dateLongueDuJour, enBase64, estUneImage, genreDeLImage, tailleApresLeCoin, tailleDite,
  cadreApresLeCoin, champDeLAnnotation, couleursDeLaZone, densiteDuDessin, estUnCache, lignesDuTexte, nombreDeChamps, zoomVoisin,
  type AnnotationLue, type ChampDuPdf, type Famille, type LigneImprimee, type MorceauDeTexte, nomDeLaCopie, pagesDeLaSelection,
  repeteSurLesPages, resteDesPages, retoucheVide, tourFinal, type GenreDePose, type PoseSurPdf, type RetoucheDesPages,
} from '../../../../../shared/pdf-signe-pur';
import { PdfProtege, ecritLaCopie, type ImageDePose } from '../../../../../shared/pdf-signe';
import { facteurDuCoin } from '../../../../../shared/secretariat-pur';
import { useBranch } from '../../../../../shared/branches';
import { ditLePartage, ouvreWhatsAppAvecLePdf } from '../../../../../shared/partage-whatsapp';
import { envoieSurWhatsApp } from '../../../../../shared/whatsapp';
import { PaveDeSignature } from './Signatures';

/* ══ SIGNER UN PDF — 15 octobre 2026 ══════════════════════════════════
   Maquette UrJJzwSH… validée et cochée. L'atelier affiche les pages du PDF
   (pdf.js), on y pose sa signature, son paraphe, un tampon, un texte, une
   date, « Lu et approuvé », une coche, sur une page, sur toutes, ou sur une
   sélection ; on peut tourner ou retirer une page DANS LA COPIE. On n'efface
   rien de ce qui est imprimé. « Garder » écrit une COPIE à côté de
   l'original (jamais à sa place), avec qui, quand et ce qu'elle porte.
   Chacun ne pose que SA signature et SON paraphe : la base ne lit que les
   siens (0116). */

export type LigneAvecFichiers = LigneAdministrative & { fichiers: Fichier[] };
export type Ouverture = { octets: Uint8Array; nom: string; ligne?: LigneAvecFichiers; source?: Fichier };
type ImageVue = { url: string; ratio: number };

const aujourdhui = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const enDataUrl = (b: Blob): Promise<string> => new Promise((ok, ko) => { const r = new FileReader(); r.onloadend = () => ok(String(r.result)); r.onerror = ko; r.readAsDataURL(b); });
const ratioDe = (url: string): Promise<number> => new Promise((ok) => { const i = new Image(); i.onload = () => ok(i.naturalWidth ? i.naturalHeight / i.naturalWidth : 1); i.onerror = () => ok(1); i.src = url; });
const octetsDe = (url: string): Uint8Array => {
  const b = atob(url.slice(url.indexOf(',') + 1));
  const o = new Uint8Array(b.length);
  for (let i = 0; i < b.length; i += 1) o[i] = b.charCodeAt(i);
  return o;
};
/** Une photo ou une capture, ramenée à 2 000 px au plus : PNG si elle en était un, JPEG sinon. */
const imageAllegee = (f: File): Promise<string | null> => new Promise((ok) => {
  const u = URL.createObjectURL(f);
  const i = new Image();
  i.onload = () => {
    const k = Math.min(1, 2000 / Math.max(i.naturalWidth, i.naturalHeight, 1));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(i.naturalWidth * k)); c.height = Math.max(1, Math.round(i.naturalHeight * k));
    const x = c.getContext('2d');
    if (!x) { URL.revokeObjectURL(u); ok(null); return; }
    const png = f.type === 'image/png';
    if (!png) { x.fillStyle = '#FFFFFF'; x.fillRect(0, 0, c.width, c.height); }
    x.drawImage(i, 0, 0, c.width, c.height);
    URL.revokeObjectURL(u);
    ok(png ? c.toDataURL('image/png') : c.toDataURL('image/jpeg', 0.88));
  };
  i.onerror = () => { URL.revokeObjectURL(u); ok(null); };
  i.src = u;
});
/** La première page d'un PDF, en image (un document à mettre dans le fichier). */
async function premierePageEnImage(f: File): Promise<string | null> {
  const [pdfjs, travailleur] = await Promise.all([
    import('pdfjs-dist/legacy/build/pdf.mjs'),
    import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'),
  ]);
  pdfjs.GlobalWorkerOptions.workerSrc = travailleur.default;
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await f.arrayBuffer()) }).promise;
  try {
    const page = await doc.getPage(1);
    const v1 = page.getViewport({ scale: 1 });
    const vue = page.getViewport({ scale: Math.min(3, 1600 / v1.width) });
    const c = document.createElement('canvas');
    c.width = Math.floor(vue.width); c.height = Math.floor(vue.height);
    const x = c.getContext('2d');
    if (!x) return null;
    x.fillStyle = '#FFFFFF'; x.fillRect(0, 0, c.width, c.height);
    await page.render({ canvasContext: x, viewport: vue }).promise;
    return c.toDataURL('image/jpeg', 0.9);
  } finally { void doc.destroy(); }
}
/** Ce que la fonction d'envoi de la Maison accepte au plus (whatsapp-envoi, TAILLE_MAX). */
const ENVOI_MAISON_MAX = 5 * 1024 * 1024;
const FAMILLE_CSS: Record<Famille, string> = { sans: 'Helvetica, Arial, sans-serif', serif: '"Times New Roman", Times, serif', mono: '"Courier New", Courier, monospace' };
const libelleDeLaLigne = (l: LigneAdministrative): string => {
  const x = l as unknown as { genre: string; numero?: string; correspondant?: string; objet?: string; titre?: string };
  return x.genre === 'courrier' ? `Courrier ${x.numero ?? ''} · ${x.correspondant ?? ''}${x.objet ? ` · ${x.objet}` : ''}` : `${x.genre === 'contrat' ? 'Contrat' : 'Démarche'} · ${x.titre ?? ''}`;
};
let compteur = 0;
const nouvelId = () => `pose-${Date.now().toString(36)}-${(compteur += 1)}`;

export function SignerUnPdf({ ouverture, onClose }: { ouverture: Ouverture; onClose: () => void }) {
  const { session } = useAuth();
  const moi = session?.user?.id ?? '';
  const [lignes] = useSecretariat();
  const monNom = signatairesDe(lignes).find((s) => s.userId === moi)?.nom ?? session?.user?.email ?? 'La Maison';
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [erreur, setErreur] = useState('');
  const [toursDOrigine, setToursDOrigine] = useState<number[]>([]);
  const [pagesRetouchees, setPagesRetouchees] = useState<RetoucheDesPages>(retoucheVide);
  const [poses, setPoses] = useState<PoseSurPdf[]>([]);
  const [choisie, setChoisie] = useState<string | null>(null);
  /* LE ZOOM : 1 = pleine largeur. Ctrl + molette zoome aussi, comme dans Acrobat. */
  const [zoom, setZoom] = useState(1);
  const centre = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = centre.current;
    if (!el) return;
    const molette = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      setZoom((z) => zoomVoisin(z, e.deltaY < 0 ? 1 : -1));
    };
    el.addEventListener('wheel', molette, { passive: false });
    return () => el.removeEventListener('wheel', molette);
  }, []);
  const [outil, setOutil] = useState<GenreDePose | null>(null);
  const [images, setImages] = useState<Record<string, ImageVue>>({});
  const [tampon, setTampon] = useState<string>('mnd-6-dentele');
  const [dateRecu, setDateRecu] = useState(aujourdhui());
  const [selection, setSelection] = useState('');
  const [paveParaphe, setPaveParaphe] = useState(false);
  const [envoi, setEnvoi] = useState(false);
  const [rangerSur, setRangerSur] = useState('');
  /* L'ENVOYER, LE PARTAGER (16 octobre 2026) : « quand je finis de signer un
     document, l'envoyer ou le partager par WhatsApp ou une app » (Yéman). Par
     la Maison (son numéro, la conversation entre dans le fil du Trône) ou par
     la feuille de partage du téléphone ou de Windows (WhatsApp, e-mail…). */
  const { branch } = useBranch();
  const [numeroWa, setNumeroWa] = useState('');
  const [partage, setPartage] = useState<'' | 'app' | 'maison'>('');
  const [fichierPret, setFichierPret] = useState<File | null>(null);
  const [gardee, setGardee] = useState(false);
  const champImage = useRef<HTMLInputElement>(null);
  const [imageAPoser, setImageAPoser] = useState<string | null>(null);
  /* LE FORMULAIRE (16 octobre 2026) : les champs du PDF, et ce qu'on y écrit. */
  const [champs, setChamps] = useState<ChampDuPdf[]>([]);
  const [valeurs, setValeurs] = useState<Record<string, string | boolean>>({});
  const surValeur = (nom: string, v: string | boolean) => setValeurs((x) => ({ ...x, [nom]: v }));
  /* UNE IMAGE (16 octobre 2026) : une photo, une capture, ou la première page
     d'un PDF ; on la choisit, puis on touche la page. */
  const prendsUneImage = async (f: File | undefined) => {
    if (!f) return;
    if (f.size > 25 * 1024 * 1024) { toast('Ce fichier dépasse 25 Mo.'); return; }
    const estPdf = f.type === 'application/pdf' || /\.pdf$/i.test(f.name);
    let url: string | null = null;
    try { url = estPdf ? await premierePageEnImage(f) : await imageAllegee(f); } catch { url = null; }
    if (!url) { toast(estPdf ? 'Ce PDF ne s’ouvre pas.' : 'Cette image ne se lit pas ici (une photo HEIC se convertit d’abord en JPEG).', 7000); return; }
    const cle = `image:${nouvelId()}`;
    const r = await ratioDe(url);
    setImages((x) => ({ ...x, [cle]: { url: url as string, ratio: r } }));
    setImageAPoser(cle);
    setOutil('image');
    toast(estPdf ? 'La première page est prête : touchez la page où la poser.' : 'Image prête : touchez la page où la poser.');
  };

  /* Le PDF, lu par pdf.js (chargé seulement ici). */
  useEffect(() => {
    let vivant = true;
    void (async () => {
      try {
        /* Le travailleur, appelé à la demande lui aussi : Vite en rend l'adresse,
           et les bancs (esbuild) ne butent pas sur un « ?url » importé d'emblée. */
        const [pdfjs, travailleur] = await Promise.all([
          import('pdfjs-dist/legacy/build/pdf.mjs'),
          import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'),
        ]);
        pdfjs.GlobalWorkerOptions.workerSrc = travailleur.default;
        const doc = await pdfjs.getDocument({ data: ouverture.octets.slice() }).promise;
        const tours: number[] = [];
        const trouves: ChampDuPdf[] = [];
        for (let i = 1; i <= doc.numPages; i += 1) {
          const pg = await doc.getPage(i);
          tours.push(pg.rotate);
          try {
            for (const a of (await pg.getAnnotations()) as AnnotationLue[]) { const c = champDeLAnnotation(a, i - 1); if (c) trouves.push(c); }
          } catch { /* une page sans annotations lisibles : rien à remplir */ }
        }
        if (vivant) { setPdf(doc); setToursDOrigine(tours); setChamps(trouves); }
      } catch (e) {
        if (vivant) setErreur(/password/i.test(String(e)) ? 'Ce PDF est protégé par un mot de passe : il ne se signe pas ici.' : 'Ce PDF ne s’ouvre pas. Est-ce bien un PDF ?');
      }
    })();
    return () => { vivant = false; };
  }, [ouverture.octets]);

  /* Ma signature et mon paraphe : les miens seulement. */
  useEffect(() => {
    void chargeMaSignature(moi).then(async (u) => { if (u) setImages((x) => ({ ...x, signature: x.signature ?? { url: u, ratio: 0 } })); if (u) { const r = await ratioDe(u); setImages((x) => ({ ...x, signature: { url: u, ratio: r } })); } });
    void chargeMonParaphe(moi).then(async (u) => { if (u) { const r = await ratioDe(u); setImages((x) => ({ ...x, paraphe: { url: u, ratio: r } })); } });
  }, [moi]);

  const chargeLeTampon = useCallback(async (t: Tampon, date?: string): Promise<string | null> => {
    const cle = date ? `recu:${date}` : `tampon:${t.cle}`;
    if (images[cle]) return cle;
    try {
      const url = await enDataUrl(await (await fetch(asset(`/assets/tampons/${t.fichier}`))).blob());
      const final = date ? (await dateSurLeRecu(url, date)) ?? url : url;
      setImages((x) => ({ ...x, [cle]: { url: final, ratio: 1 / t.ratio } }));
      return cle;
    } catch { toast('Ce tampon ne se charge pas hors ligne.'); return null; }
  }, [images]);

  const nbPages = pdf?.numPages ?? 0;
  const pose = poses.find((p) => p.id === choisie);
  const tampons = useMemo(() => [...TAMPONS.mnd, ...TAMPONS.acia].filter((t) => t.cle !== TAMPON_A_DATER), []);

  const poseIci = async (page: number, fx: number, fy: number, fond?: string) => {
    if (!outil || outil === 'remplace') return;
    if (outil === 'efface') {
      const p: PoseSurPdf = { id: nouvelId(), page, genre: 'efface', x: Math.min(0.95, Math.max(0, fx)), y: Math.min(0.97, Math.max(0, fy)), largeur: LARGEUR_DE_DEPART.efface, hauteur: 0.03, fond: fond ?? '#ffffff' };
      setPoses((x) => [...x, p]); setChoisie(p.id); setOutil(null);
      return;
    }
    let image: string | undefined;
    if (outil === 'signature') { if (!images.signature) { toast('Déposez d’abord votre signature : Secrétariat, Documents, « Ma signature ».', 6000); return; } image = 'signature'; }
    if (outil === 'paraphe') { if (!images.paraphe) { setPaveParaphe(true); return; } image = 'paraphe'; }
    if (outil === 'tampon') { const t = tampons.find((x) => x.cle === tampon); const c = t ? await chargeLeTampon(t) : null; if (!c) return; image = c; }
    if (outil === 'recu') { const t = TAMPONS.mnd.find((x) => x.cle === TAMPON_A_DATER); const c = t ? await chargeLeTampon(t, dateRecu) : null; if (!c) return; image = c; }
    if (outil === 'image') { if (!imageAPoser || !images[imageAPoser]) { champImage.current?.click(); return; } image = imageAPoser; setImageAPoser(null); }
    const texte = outil === 'date' ? dateLongueDuJour(aujourdhui()) : outil === 'lu' ? 'Lu et approuvé' : outil === 'texte' ? 'Votre texte' : undefined;
    const p: PoseSurPdf = {
      id: nouvelId(), page, genre: outil, x: Math.min(0.95, Math.max(0, fx)), y: Math.min(0.97, Math.max(0, fy)),
      largeur: LARGEUR_DE_DEPART[outil], ...(image ? { image } : {}), ...(texte ? { texte } : {}), ...(!estUneImage(outil) ? { taille: TAILLE_DU_TEXTE } : {}),
    };
    setPoses((x) => [...x, p]);
    setChoisie(p.id);
    setOutil(null);
  };
  const change = (id: string, patch: Partial<PoseSurPdf>) => setPoses((x) => x.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  /* MODIFIER LE TEXTE : la ligne touchée devient une pièce qui la couvre (de
     la couleur du papier dessous) et réécrit son texte, qu'on change. */
  const remplaceLaLigne = (page: number, l: LigneImprimee, c: { fond: string; encre: string }) => {
    const p: PoseSurPdf = {
      id: nouvelId(), page, genre: 'remplace', x: l.x, y: l.y, largeur: l.largeur, hauteur: l.hauteur,
      texte: l.texte, ancien: l.texte, taille: l.taille, famille: l.famille, fond: c.fond, encre: c.encre, encreLue: c.encre,
    };
    setPoses((x) => [...x, p]);
    setChoisie(p.id);
  };
  const surPages = (pages: number[]) => {
    if (!pose) return;
    const neuves = repeteSurLesPages(pose, pages, poses, nouvelId);
    setPoses((x) => [...x, ...neuves]);
    toast(neuves.length ? `Posé sur ${neuves.length} page${neuves.length > 1 ? 's' : ''} de plus.` : 'Déjà posé sur ces pages.');
  };

  const ecrit = async (): Promise<{ octets: Uint8Array; nom: string } | null> => {
    if (!poses.length && !Object.keys(valeurs).length && !Object.keys(pagesRetouchees.tours).length && !pagesRetouchees.retirees.length) { toast('Rien n’a été posé, rempli ni retouché.'); return null; }
    if (resteDesPages(pagesRetouchees, nbPages) < 1) { toast('Une copie garde au moins une page.'); return null; }
    const pourEcrire: Record<string, ImageDePose> = {};
    for (const [cle, im] of Object.entries(images)) {
      const octets = octetsDe(im.url);
      const type = genreDeLImage(octets);
      if (type) pourEcrire[cle] = { octets, type, ratio: im.ratio || 1 };
    }
    const illisible = poses.find((p) => p.image && !pourEcrire[p.image]);
    if (illisible) { toast('Une image posée ne se lit pas (ni PNG ni JPEG) : retirez-la, puis réessayez.', 7000); return null; }
    try {
      return { octets: await ecritLaCopie(ouverture.octets, poses, pagesRetouchees, pourEcrire, valeurs), nom: nomDeLaCopie(ouverture.nom, aujourdhui()) };
    } catch (e) {
      toast(e instanceof PdfProtege ? e.message : 'La copie n’a pas pu s’écrire. Le PDF est peut-être abîmé.', 7000);
      return null;
    }
  };
  /* Un changement rend la copie à refaire (et à garder de nouveau). */
  useEffect(() => { setFichierPret(null); setGardee(false); }, [poses, valeurs, pagesRetouchees]);
  const legende = (nom: string) => `${nom.replace(/\.pdf$/i, '')}, ci-joint.`;
  const partageParLApp = async () => {
    setPartage('app');
    try {
      let f = fichierPret;
      if (!f) {
        const c = await ecrit();
        if (!c) return;
        f = new File([new Uint8Array(c.octets)], c.nom, { type: 'application/pdf' });
        setFichierPret(f);
      }
      const mot = ditLePartage(await ouvreWhatsAppAvecLePdf({ fichier: f, numero: numeroWa.trim() || undefined, texte: legende(f.name) }));
      if (mot) toast(mot, 7000);
    } finally { setPartage(''); }
  };
  const envoieParLaMaison = async () => {
    if (!numeroWa.trim()) { toast('Le numéro WhatsApp du destinataire.'); return; }
    setPartage('maison');
    try {
      const c = await ecrit();
      if (!c) return;
      if (c.octets.length > ENVOI_MAISON_MAX) { toast(`Cette copie pèse ${(c.octets.length / 1048576).toFixed(1)} Mo : la Maison envoie 5 Mo au plus. Utilisez « WhatsApp · l’app ».`, 8000); return; }
      const piece = { nom: c.nom, type: 'application/pdf', donnees: `data:application/pdf;base64,${enBase64(c.octets)}` };
      const res = await envoieSurWhatsApp({ numero: numeroWa.trim(), texte: legende(c.nom), piece, branchId: branch.id });
      toast(res.ok ? (res.enAttente ? 'Hors ligne : le document partira au retour du réseau.' : 'Document envoyé sur WhatsApp.') : `Le document n’est pas parti : ${res.erreur}`, 7000);
    } finally { setPartage(''); }
  };
  const telecharge = async () => {
    const c = await ecrit();
    if (!c) return;
    const url = URL.createObjectURL(new Blob([new Uint8Array(c.octets)], { type: 'application/pdf' }));
    const a = document.createElement('a'); a.href = url; a.download = c.nom; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  };
  const candidates = useMemo(() => (lignes as unknown as LigneAvecFichiers[])
    .filter((l) => (l.genre === 'courrier' || l.genre === 'contrat' || l.genre === 'demarche') && Array.isArray(l.fichiers))
    .slice(0, 80), [lignes]);
  const garde = async () => {
    const id = ouverture.ligne?.id ?? rangerSur;
    const ligne = (lignes as unknown as LigneAvecFichiers[]).find((l) => l.id === id);
    if (!ligne) { toast('Sur quelle ligne ranger la copie ?'); return; }
    setEnvoi(true);
    const c = await ecrit();
    if (!c) { setEnvoi(false); return; }
    const r = await deposeLesFichiers(ligne.id, [new File([new Uint8Array(c.octets)], c.nom, { type: 'application/pdf' })], ligne.fichiers.length);
    setEnvoi(false);
    if (!r.fichiers[0]) { toast(r.erreur ?? 'La copie n’est pas partie.', 7000); return; }
    const f: Fichier = {
      ...r.fichiers[0], ...(ouverture.source ? { copieDe: ouverture.source.chemin } : {}),
      signeLe: new Date().toISOString(), signePar: monNom, contenu: contenuDeLaCopie(poses, pagesRetouchees, nbPages, Object.keys(valeurs).length),
    };
    retoucheLaLigne(ligne, { fichiers: [...ligne.fichiers, f] } as Partial<LigneAvecFichiers>);
    /* L'atelier reste ouvert : on peut l'envoyer aussitôt. */
    setGardee(true);
    toast(`Copie gardée : « ${c.nom} ». L’original est intact. Vous pouvez l’envoyer ci-dessous.`, 7000);
  };

  return createPortal(
    <Modal title={`Signer · ${ouverture.nom}`} onClose={onClose} width={1100}>
      <div className="spdf">
        {erreur && <p className="sad-doux" role="alert">{erreur}</p>}
        <aside className="spdf-outils" aria-label="Les outils">
          {champs.length > 0 && (
            <p className="spdf-aide spdf-aide--champs">
              Ce PDF est un formulaire : {nombreDeChamps(champs)} champ{nombreDeChamps(champs) > 1 ? 's' : ''} à remplir directement sur la page (les cases bleues).
            </p>
          )}
          <span className="spdf-titre">Poser</span>
          {([['signature', 'Ma signature'], ['paraphe', 'Mon paraphe'], ['tampon', 'Un tampon'], ['recu', '« Reçu le »'], ['image', 'Une image']] as [GenreDePose, string][]).map(([g, l]) => (
            <button key={g} type="button" className={`spdf-outil${outil === g ? ' est-actif' : ''}`} aria-pressed={outil === g} onClick={() => (g === 'image' ? champImage.current?.click() : setOutil(g))}>
              {l}{g === 'signature' && !images.signature ? ' (à déposer)' : g === 'paraphe' && !images.paraphe ? ' (à dessiner)' : ''}
            </button>
          ))}
          {outil === 'tampon' && <Select value={tampon} onChange={(e) => setTampon(e.target.value)} aria-label="Le tampon">{tampons.map((t) => <option key={t.cle} value={t.cle}>{t.nom}</option>)}</Select>}
          {outil === 'recu' && <input type="date" className="spdf-date" value={dateRecu} onChange={(e) => setDateRecu(e.target.value || aujourdhui())} aria-label="La date du tampon" />}
          <input ref={champImage} type="file" accept="image/png,image/jpeg,image/webp,image/gif,application/pdf,.pdf" hidden aria-label="L’image à poser"
            onChange={(e) => { void prendsUneImage(e.target.files?.[0]); e.target.value = ''; }} />
          <span className="spdf-titre">Écrire</span>
          {([['texte', 'Un texte'], ['date', 'La date du jour'], ['lu', '« Lu et approuvé »'], ['coche', 'Une coche ✓']] as [GenreDePose, string][]).map(([g, l]) => (
            <button key={g} type="button" className={`spdf-outil${outil === g ? ' est-actif' : ''}`} aria-pressed={outil === g} onClick={() => setOutil(g)}>{l}</button>
          ))}
          <span className="spdf-titre">Modifier</span>
          {([['remplace', 'Modifier le texte'], ['efface', 'Effacer une zone']] as [GenreDePose, string][]).map(([g, l]) => (
            <button key={g} type="button" className={`spdf-outil${outil === g ? ' est-actif' : ''}`} aria-pressed={outil === g} onClick={() => setOutil(outil === g ? null : g)}>{l}</button>
          ))}
          <p className="spdf-aide">{
            outil === 'remplace' ? 'Touchez une ligne imprimée (encadrée de cuivre) : elle devient modifiable. Effacez-la, écrivez la vôtre. Touchez encore « Modifier le texte » pour finir.'
              : outil === 'efface' ? 'Touchez l’endroit à effacer, puis tirez le rond cuivre pour couvrir toute la zone.'
                : outil ? 'Touchez la page à l’endroit voulu.'
                  : 'Choisissez un outil, puis touchez la page. Tirez le rond cuivre d’une pièce pour l’agrandir ou la réduire.'
          }</p>
          {pose && (
            <div className="spdf-choisie">
              <span className="spdf-titre">La pièce choisie</span>
              {(pose.genre === 'texte' || pose.genre === 'remplace') && <input className="spdf-texte" value={pose.texte ?? ''} onChange={(e) => change(pose.id, { texte: e.target.value })} aria-label="Le texte" />}
              {pose.genre === 'remplace' && pose.ancien && <span className="spdf-aide">Imprimé d’origine : « {pose.ancien} »</span>}
              {pose.genre === 'remplace' && (
                <div className="spdf-encres" role="group" aria-label="L’encre">
                  {([['Comme l’imprimé', pose.encreLue], ['Noir', '#000000'], ['Bleu nuit', '#1e2150']] as [string, string | undefined][]).filter(([, c]) => !!c).map(([l, c]) => (
                    <button key={l} type="button" className={`spdf-encre${pose.encre === c ? ' est-actif' : ''}`} aria-pressed={pose.encre === c} onClick={() => change(pose.id, { encre: c })}>
                      <span className="spdf-encre-pastille" style={{ background: c }} />{l}
                    </button>
                  ))}
                </div>
              )}
              {pose.genre !== 'efface' && <div className="spdf-deux">
                <button type="button" className="spdf-outil" onClick={() => change(pose.id, estUneImage(pose.genre) ? { largeur: Math.max(0.04, pose.largeur / 1.15) } : { taille: Math.max(6, (pose.taille ?? TAILLE_DU_TEXTE) - 1) })}>Plus petit</button>
                <button type="button" className="spdf-outil" onClick={() => change(pose.id, estUneImage(pose.genre) ? { largeur: Math.min(0.9, pose.largeur * 1.15) } : { taille: Math.min(40, (pose.taille ?? TAILLE_DU_TEXTE) + 1) })}>Plus grand</button>
              </div>}
              {pose.genre !== 'remplace' && <>
              <button type="button" className="spdf-outil" onClick={() => surPages(Array.from({ length: nbPages }, (_, i) => i))}>Sur toutes les pages</button>
              <div className="spdf-deux">
                <input className="spdf-texte" value={selection} onChange={(e) => setSelection(e.target.value)} placeholder="Pages : 1, 3-5" aria-label="Les pages" />
                <button type="button" className="spdf-outil" onClick={() => { const p = pagesDeLaSelection(selection, nbPages); if (!p.length) { toast('Écrivez des pages : 1, 3-5'); return; } surPages(p); }}>Poser</button>
              </div>
              </>}
              <button type="button" className="spdf-outil spdf-outil--rouge" onClick={() => { setPoses((x) => x.filter((p) => p.id !== pose.id)); setChoisie(null); }}>{pose.genre === 'remplace' ? 'Remettre le texte d’origine' : pose.genre === 'efface' ? 'Ne plus effacer' : 'Retirer'}</button>
            </div>
          )}
        </aside>
        <div className="spdf-centre" ref={centre}>
        <div className="spdf-loupe" role="toolbar" aria-label="Le zoom">
          <button type="button" className="spdf-outil" aria-label="Réduire la page" disabled={zoom <= 0.5} onClick={() => setZoom((z) => zoomVoisin(z, -1))}>−</button>
          <span className="spdf-loupe-taux" aria-live="polite">{Math.round(zoom * 100)} %</span>
          <button type="button" className="spdf-outil" aria-label="Agrandir la page" disabled={zoom >= 4} onClick={() => setZoom((z) => zoomVoisin(z, 1))}>+</button>
          <button type="button" className="spdf-outil" disabled={zoom === 1} onClick={() => setZoom(1)}>Pleine largeur</button>
        </div>
        <div className={`spdf-pages${zoom > 1 ? ' spdf-pages--loupe' : ''}`}>
          {!pdf && !erreur && <p className="sad-doux">Le PDF s’ouvre…</p>}
          {pdf && Array.from({ length: nbPages }, (_, i) => (
            <PageDuPdf
              key={i} pdf={pdf} index={i} tour={tourFinal(toursDOrigine[i] ?? 0, pagesRetouchees.tours[i])} retiree={pagesRetouchees.retirees.includes(i)}
              poses={poses.filter((p) => p.page === i)} images={images} choisie={choisie} outil={outil}
              surPose={poseIci} surChoix={setChoisie} surBouge={(id, x, y) => change(id, { x, y })} surTaille={change}
              champs={champs.filter((c) => c.page === i)} aDesChamps={champs.some((c) => c.page === i)} valeurs={valeurs} surValeur={surValeur}
              surRemplace={(l, c) => remplaceLaLigne(i, l, c)}
              surTourne={() => {
                /* Ce qui couvre l'imprimé est calé sur la page telle qu'on la voit : on tourne d'abord, on modifie ensuite. */
                if (poses.some((p) => p.page === i && estUnCache(p.genre))) { toast('Cette page a du texte modifié ou effacé : tournez-la avant de la modifier.', 6000); return; }
                setPagesRetouchees((r) => ({ ...r, tours: { ...r.tours, [i]: ((r.tours[i] ?? 0) + 1) % 4 } }));
              }}
              surRetire={() => setPagesRetouchees((r) => ({ ...r, retirees: r.retirees.includes(i) ? r.retirees.filter((x) => x !== i) : [...r.retirees, i] }))}
              nbPages={nbPages} zoom={zoom}
            />
          ))}
        </div>
        </div>
      </div>
      <div className="spdf-bas">
        <span className="sad-doux">{contenuDeLaCopie(poses, pagesRetouchees, nbPages, Object.keys(valeurs).length).join(' · ') || 'Rien de posé.'}</span>
        <span className="spdf-actions">
          {!ouverture.ligne && (
            <Select value={rangerSur} onChange={(e) => setRangerSur(e.target.value)} aria-label="Ranger la copie sur">
              <option value="">Ranger la copie sur…</option>
              {candidates.map((l) => <option key={l.id} value={l.id}>{libelleDeLaLigne(l)}</option>)}
            </Select>
          )}
          <Button variant="ghost" onClick={() => void telecharge()}>Télécharger la copie</Button>
          <Button variant="copper" disabled={envoi || gardee || (!ouverture.ligne && !rangerSur)} onClick={() => void garde()}>{envoi ? 'Envoi…' : gardee ? 'Copie gardée ✓' : 'Garder la copie signée'}</Button>
        </span>
        <div className="spdf-envoi">
          <span className="spdf-titre">L’envoyer</span>
          <input className="spdf-texte" type="tel" inputMode="tel" value={numeroWa} onChange={(e) => setNumeroWa(e.target.value)} placeholder="WhatsApp du destinataire : +229 01 …" aria-label="Le numéro WhatsApp du destinataire" />
          <Button variant="ghost" disabled={!!partage} onClick={() => void envoieParLaMaison()} title="Par le numéro de la Maison : la conversation entre dans le fil du Trône">{partage === 'maison' ? 'Envoi…' : 'Envoyer par la Maison'}</Button>
          <Button variant="ghost" disabled={!!partage} onClick={() => void partageParLApp()} title="Votre application : WhatsApp, e-mail… Ce qui part ainsi n’entre pas dans le fil de la Maison.">{partage === 'app' ? 'Préparation…' : 'WhatsApp · l’app'}</Button>
        </div>
      </div>
      {paveParaphe && (
        <PoserMonParaphe moi={moi} onClose={() => setPaveParaphe(false)} surDepose={async (u) => { const r = await ratioDe(u); setImages((x) => ({ ...x, paraphe: { url: u, ratio: r } })); setPaveParaphe(false); toast('Paraphe gardé : touchez la page pour le poser.'); }} />
      )}
    </Modal>,
    document.body,
  );
}

type VueUn = { width: number; height: number; transform: number[]; convertToViewportRectangle: (r: number[]) => number[] };
function PageDuPdf({
  pdf, index, tour, retiree, poses, images, choisie, outil, surPose, surChoix, surBouge, surTaille, surTourne, surRetire, nbPages,
  champs, aDesChamps, valeurs, surValeur, surRemplace, zoom,
}: {
  pdf: PDFDocumentProxy; index: number; tour: number; retiree: boolean; poses: PoseSurPdf[]; images: Record<string, ImageVue>;
  choisie: string | null; outil: GenreDePose | null; nbPages: number;
  surPose: (page: number, fx: number, fy: number, fond?: string) => void; surChoix: (id: string) => void; surBouge: (id: string, x: number, y: number) => void;
  surTaille: (id: string, patch: Partial<PoseSurPdf>) => void;
  surTourne: () => void; surRetire: () => void;
  champs: ChampDuPdf[]; aDesChamps: boolean; valeurs: Record<string, string | boolean>; surValeur: (nom: string, v: string | boolean) => void;
  surRemplace: (l: LigneImprimee, c: { fond: string; encre: string }) => void;
  zoom: number;
}) {
  const toile = useRef<HTMLCanvasElement>(null);
  const boite = useRef<HTMLDivElement>(null);
  const [largeurPt, setLargeurPt] = useState(0);
  const [largeurPx, setLargeurPx] = useState(0);
  const [ratio, setRatio] = useState(1.414);
  const [vueUn, setVueUn] = useState<VueUn | null>(null);
  /* La page suit la fenêtre : la taille des textes posés aussi. */
  useEffect(() => {
    const el = boite.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => setLargeurPx(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const pxParPt = largeurPt ? (largeurPx || boite.current?.clientWidth || 0) / largeurPt : 1;
  useEffect(() => {
    let vivant = true;
    let tache: { cancel: () => void } | null = null;
    void (async () => {
      const page = await pdf.getPage(index + 1);
      const vue1 = page.getViewport({ scale: 1, rotation: tour });
      const largeur = boite.current?.clientWidth || 700;
      const echelle = largeur / vue1.width;
      /* Plus on zoome, plus la page se redessine en détail, dans la limite de la mémoire. */
      const dpr = densiteDuDessin(largeur, vue1.height / vue1.width, window.devicePixelRatio || 1);
      const vue = page.getViewport({ scale: echelle * dpr, rotation: tour });
      const c = toile.current;
      if (!c || !vivant) return;
      c.width = Math.floor(vue.width); c.height = Math.floor(vue.height);
      setLargeurPt(vue1.width); setRatio(vue1.height / vue1.width); setVueUn(vue1 as unknown as VueUn);
      const ctx = c.getContext('2d', { willReadFrequently: true });
      if (!ctx) return;
      /* Un formulaire : la page se dessine SANS ses champs (2 = AnnotationMode.ENABLE_FORMS de pdf.js) ;
         les cases à remplir se posent par-dessus, et la copie les remplit. */
      const t = page.render({ canvasContext: ctx, viewport: vue, annotationMode: aDesChamps ? 2 : 1 });
      tache = t;
      await t.promise.catch(() => undefined);
    })();
    return () => { vivant = false; tache?.cancel(); };
  }, [pdf, index, tour, aDesChamps, zoom]);

  /* LES LIGNES IMPRIMÉES, lues quand « Modifier le texte » est pris. */
  const [lignes, setLignes] = useState<LigneImprimee[] | null>(null);
  useEffect(() => { setLignes(null); }, [tour]);
  const modifier = outil === 'remplace';
  useEffect(() => {
    if (!modifier || lignes) return;
    let vivant = true;
    void (async () => {
      try {
        const page = await pdf.getPage(index + 1);
        const v = page.getViewport({ scale: 1, rotation: tour });
        const contenu = await page.getTextContent();
        const familles: Record<string, string> = {};
        for (const [k, st] of Object.entries(contenu.styles ?? {})) familles[k] = String((st as { fontFamily?: string }).fontFamily ?? '');
        const morceaux = (contenu.items as unknown[]).filter((it): it is MorceauDeTexte => typeof (it as MorceauDeTexte).str === 'string');
        if (vivant) setLignes(lignesDuTexte(morceaux, v as unknown as VueUn, familles));
      } catch { if (vivant) setLignes([]); }
    })();
    return () => { vivant = false; };
  }, [modifier, lignes, pdf, index, tour]);
  /* Les couleurs du papier et de l'encre sous une zone, lues sur la page dessinée. */
  const echantillon = (z: { x: number; y: number; largeur: number; hauteur?: number }): { fond: string; encre: string } => {
    const c = toile.current;
    const ctx = c?.getContext('2d', { willReadFrequently: true });
    if (!c || !ctx) return { fond: '#ffffff', encre: '#141414' };
    const x = Math.max(0, Math.min(c.width - 1, Math.floor(z.x * c.width))), y = Math.max(0, Math.min(c.height - 1, Math.floor(z.y * c.height)));
    const l = Math.max(1, Math.min(c.width - x, Math.ceil(z.largeur * c.width))), h = Math.max(1, Math.min(c.height - y, Math.ceil((z.hauteur ?? 0.02) * c.height)));
    try { return couleursDeLaZone(ctx.getImageData(x, y, l, h).data, l, h); } catch { return { fond: '#ffffff', encre: '#141414' }; }
  };
  /* L'ENCRE D'UNE LIGNE : à l'écran, un texte de 5 points ne fait que quelques
     pixels, presque tous gris d'anticrénelage. On redessine la ligne SEULE,
     en grand (48 pixels de lettre), pour y lire sa vraie couleur. */
  const couleursDeLaLigne = async (l: LigneImprimee): Promise<{ fond: string; encre: string }> => {
    try {
      const page = await pdf.getPage(index + 1);
      const s = Math.min(12, Math.max(3, 48 / Math.max(1, l.taille)));
      const v = page.getViewport({ scale: s, rotation: tour });
      const x = Math.max(0, Math.floor(l.x * v.width)), y = Math.max(0, Math.floor(l.y * v.height));
      const w = Math.max(1, Math.min(4000, Math.ceil(l.largeur * v.width))), h = Math.max(1, Math.min(1000, Math.ceil(l.hauteur * v.height)));
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      const ctx = c.getContext('2d', { willReadFrequently: true });
      if (!ctx) return echantillon(l);
      await page.render({ canvasContext: ctx, viewport: v, transform: [1, 0, 0, 1, -x, -y], annotationMode: aDesChamps ? 2 : 1 }).promise;
      return couleursDeLaZone(ctx.getImageData(0, 0, w, h).data, w, h);
    } catch { return echantillon(l); }
  };
  /* Une zone effacée qu'on vient de glisser ou d'agrandir reprend la couleur du papier sous sa nouvelle place. */
  const [aRelire, setARelire] = useState<string | null>(null);
  useEffect(() => {
    if (!aRelire) return;
    const q = poses.find((p) => p.id === aRelire);
    setARelire(null);
    if (q && q.genre === 'efface') { const f = echantillon(q).fond; if (f !== q.fond) surTaille(q.id, { fond: f }); }
  }, [aRelire, poses]);

  const clic = (e: React.MouseEvent<HTMLDivElement>) => {
    if (retiree || !outil || outil === 'remplace' || (e.target as HTMLElement).closest('.spdf-pose, .spdf-champ, .spdf-ligne')) return;
    const r = e.currentTarget.getBoundingClientRect();
    const fx = (e.clientX - r.left) / r.width, fy = (e.clientY - r.top) / r.height;
    surPose(index, fx, fy, outil === 'efface' ? echantillon({ x: fx, y: fy, largeur: 0.25, hauteur: 0.03 }).fond : undefined);
  };
  const glisse = (p: PoseSurPdf) => (e: React.PointerEvent<HTMLElement>) => {
    e.preventDefault(); e.stopPropagation(); surChoix(p.id);
    const cadre = (e.currentTarget.parentElement as HTMLElement).getBoundingClientRect();
    const dx = e.clientX - (cadre.left + p.x * cadre.width), dy = e.clientY - (cadre.top + p.y * cadre.height);
    const bouge = (ev: PointerEvent) => surBouge(p.id, Math.min(0.97, Math.max(0, (ev.clientX - dx - cadre.left) / cadre.width)), Math.min(0.98, Math.max(0, (ev.clientY - dy - cadre.top) / cadre.height)));
    const lache = () => { if (p.genre === 'efface') setARelire(p.id); window.removeEventListener('pointermove', bouge); window.removeEventListener('pointerup', lache); };
    window.addEventListener('pointermove', bouge); window.addEventListener('pointerup', lache);
  };
  /* LE ROND CUIVRE (16 octobre 2026) : on tire le coin de la pièce choisie,
     elle grandit ou rapetisse en gardant sa forme. */
  const [enTaille, setEnTaille] = useState<string | null>(null);
  const tire = (p: PoseSurPdf) => (e: React.PointerEvent<HTMLElement>) => {
    e.preventDefault(); e.stopPropagation(); surChoix(p.id);
    const piece = (e.currentTarget.parentElement as HTMLElement).getBoundingClientRect();
    const feuille = (e.currentTarget.closest('.spdf-feuille') as HTMLElement).getBoundingClientRect();
    const x0 = e.clientX, y0 = e.clientY;
    setEnTaille(p.id);
    /* Une zone effacée suit le doigt en largeur ET en hauteur ; le reste garde sa forme. */
    const bouge = (ev: PointerEvent) => surTaille(p.id, p.genre === 'efface'
      ? cadreApresLeCoin(p, (ev.clientX - x0) / feuille.width, (ev.clientY - y0) / feuille.height)
      : tailleApresLeCoin(p, facteurDuCoin(ev.clientX - x0, ev.clientY - y0, piece.width, piece.height)));
    const lache = () => { setEnTaille(null); if (p.genre === 'efface') setARelire(p.id); window.removeEventListener('pointermove', bouge); window.removeEventListener('pointerup', lache); };
    window.addEventListener('pointermove', bouge); window.addEventListener('pointerup', lache);
  };
  const poignee = (p: PoseSurPdf) => p.id === choisie && !retiree && (
    <>
      <span className="spdf-poignee" onPointerDown={tire(p)} role="slider" aria-label="Tirer pour agrandir ou réduire" aria-valuetext={tailleDite(p)} />
      {enTaille === p.id && <span className="spdf-taille">{tailleDite(p)}</span>}
    </>
  );
  return (
    <div className="spdf-page" ref={boite} style={{ width: `${zoom * 100}%`, maxWidth: `${760 * zoom}px` }}>
      <div className="spdf-feuille" style={{ aspectRatio: `1 / ${ratio}` }} onClick={clic} data-retiree={retiree || undefined}>
        <canvas ref={toile} aria-label={`Page ${index + 1}`} />
        {/* Les champs du formulaire : on écrit, coche, choisit directement sur la page. */}
        {vueUn && !retiree && champs.map((c, k) => {
          const r = vueUn.convertToViewportRectangle(c.rect);
          const st: React.CSSProperties = {
            left: `${(Math.min(r[0], r[2]) / vueUn.width) * 100}%`, top: `${(Math.min(r[1], r[3]) / vueUn.height) * 100}%`,
            width: `${(Math.abs(r[2] - r[0]) / vueUn.width) * 100}%`, height: `${(Math.abs(r[3] - r[1]) / vueUn.height) * 100}%`,
          };
          const v = valeurs[c.nom] ?? c.valeur;
          const arrete = (e: React.SyntheticEvent) => e.stopPropagation();
          if (c.genre === 'case') return <input key={k} type="checkbox" className="spdf-champ spdf-champ--case" style={st} checked={v === true} onChange={(e) => surValeur(c.nom, e.target.checked)} onClick={arrete} aria-label={c.nom} />;
          if (c.genre === 'radio') return <input key={k} type="radio" name={`champ-${c.nom}`} className="spdf-champ spdf-champ--case" style={st} checked={!!c.exporte && v === c.exporte} onChange={() => surValeur(c.nom, c.exporte ?? '')} onClick={arrete} aria-label={`${c.nom} : ${c.exporte ?? ''}`} />;
          if (c.genre === 'liste') {
            return (
              <select key={k} className="spdf-champ" style={st} value={String(v)} onChange={(e) => surValeur(c.nom, e.target.value)} onClick={arrete} aria-label={c.nom}>
                {!(c.options ?? []).some((o) => o.valeur === String(v)) && <option value={String(v)}>{String(v)}</option>}
                {(c.options ?? []).map((o) => <option key={o.valeur} value={o.valeur}>{o.dit}</option>)}
              </select>
            );
          }
          const fs = Math.max(8, Math.min(14, (Math.abs(r[3] - r[1]) * pxParPt) * 0.62));
          return c.multiLigne
            ? <textarea key={k} className="spdf-champ" style={{ ...st, fontSize: `${fs}px` }} value={String(v ?? '')} onChange={(e) => surValeur(c.nom, e.target.value)} onClick={arrete} aria-label={c.nom} />
            : <input key={k} className="spdf-champ" style={{ ...st, fontSize: `${fs}px` }} value={String(v ?? '')} onChange={(e) => surValeur(c.nom, e.target.value)} onClick={arrete} aria-label={c.nom} />;
        })}
        {/* « Modifier le texte » : chaque ligne imprimée, encadrée, se touche. */}
        {modifier && !retiree && lignes?.filter((l) => !poses.some((p) => p.genre === 'remplace' && Math.abs(p.x - l.x) < 0.004 && Math.abs(p.y - l.y) < 0.004)).map((l, k) => (
          <button key={k} type="button" className="spdf-ligne" aria-label={`Modifier : ${l.texte}`}
            style={{ left: `${l.x * 100}%`, top: `${l.y * 100}%`, width: `${l.largeur * 100}%`, height: `${l.hauteur * 100}%` }}
            onClick={(e) => { e.stopPropagation(); void couleursDeLaLigne(l).then((c) => surRemplace(l, c)); }} />
        ))}
        {modifier && !retiree && lignes && lignes.length === 0 && (
          <span className="spdf-sans-texte">Pas de texte modifiable sur cette page (c’est une image) : « Effacer une zone », puis « Un texte ».</span>
        )}
        {poses.map((p) => {
          const style: React.CSSProperties = { left: `${p.x * 100}%`, top: `${p.y * 100}%` };
          const classe = `spdf-pose${p.id === choisie ? ' est-choisie' : ''}`;
          if (p.genre === 'remplace') {
            const st: React.CSSProperties = {
              ...style, width: `${p.largeur * 100}%`, height: `${(p.hauteur ?? 0) * 100}%`, background: p.fond, color: p.encre,
              fontSize: `${(p.taille ?? TAILLE_DU_TEXTE) * pxParPt}px`, fontFamily: FAMILLE_CSS[p.famille ?? 'sans'],
            };
            return p.id === choisie
              ? <input key={p.id} className={`${classe} spdf-pose--remplace`} style={st} value={p.texte ?? ''} autoFocus onFocus={(e) => e.currentTarget.select()}
                  onChange={(e) => surTaille(p.id, { texte: e.target.value })} onPointerDown={(e) => e.stopPropagation()} aria-label={`Le texte, à la place de « ${p.ancien ?? ''} »`} />
              : <span key={p.id} className={`${classe} spdf-pose--remplace`} style={st} onPointerDown={(e) => { e.stopPropagation(); surChoix(p.id); }}>{p.texte}</span>;
          }
          if (p.genre === 'efface') {
            return (
              <span key={p.id} className={`${classe} spdf-pose--efface`} style={{ ...style, width: `${p.largeur * 100}%`, height: `${(p.hauteur ?? 0) * 100}%`, background: p.fond }} onPointerDown={glisse(p)}>
                {poignee(p)}
              </span>
            );
          }
          if (estUneImage(p.genre)) {
            const im = p.image ? images[p.image] : undefined;
            return im ? (
              <span key={p.id} className={`${classe} spdf-pose--image`} style={{ ...style, width: `${p.largeur * 100}%` }} onPointerDown={glisse(p)}>
                <img src={im.url} alt="" draggable={false} />
                {poignee(p)}
              </span>
            ) : null;
          }
          const taille = (p.taille ?? TAILLE_DU_TEXTE) * pxParPt * (p.genre === 'coche' ? 1.3 : 1);
          return <span key={p.id} className={`${classe} spdf-pose--texte`} style={{ ...style, fontSize: `${taille}px` }} onPointerDown={glisse(p)}>{p.genre === 'coche' ? '✔' : p.texte}{poignee(p)}</span>;
        })}
        {retiree && <span className="spdf-retiree">Retirée de la copie</span>}
      </div>
      <div className="spdf-page-pied">
        <span className="sad-doux">Page {index + 1} sur {nbPages}</span>
        <button type="button" className="sad-lien" onClick={surTourne}>Tourner</button>
        <button type="button" className="sad-lien" onClick={surRetire}>{retiree ? 'Remettre la page' : 'Retirer cette page'}</button>
      </div>
    </div>
  );
}

function PoserMonParaphe({ moi, onClose, surDepose }: { moi: string; onClose: () => void; surDepose: (png: string) => void }) {
  const [png, setPng] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  return createPortal(
    <Modal title="Mon paraphe" onClose={onClose} width={520}>
      <div className="sad-form">
        <p className="sad-doux">Vos initiales, comme vous les écrivez en bas de chaque page. Gardé dans votre dossier privé, comme votre signature : vous seul le posez.</p>
        <PaveDeSignature valeur={png} surChange={setPng} />
        <div className="sec-actions" style={{ justifyContent: 'flex-end' }}>
          <Button variant="ghost" onClick={onClose}>Annuler</Button>
          <Button variant="copper" disabled={!png || envoi} onClick={async () => { if (!png) return; setEnvoi(true); const ok = await deposeMonParaphe(moi, png); setEnvoi(false); if (ok) surDepose(png); else toast('Le paraphe n’est pas parti : réessayez en ligne.'); }}>{envoi ? 'Envoi…' : 'Garder mon paraphe'}</Button>
        </div>
      </div>
    </Modal>,
    document.body,
  );
}
