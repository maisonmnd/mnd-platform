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
  LARGEUR_DE_DEPART, TAILLE_DU_TEXTE, contenuDeLaCopie, dateLongueDuJour, estUneImage, genreDeLImage, nomDeLaCopie, pagesDeLaSelection,
  repeteSurLesPages, resteDesPages, retoucheVide, tourFinal, type GenreDePose, type PoseSurPdf, type RetoucheDesPages,
} from '../../../../../shared/pdf-signe-pur';
import { PdfProtege, ecritLaCopie, type ImageDePose } from '../../../../../shared/pdf-signe';
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
  const [outil, setOutil] = useState<GenreDePose | null>(null);
  const [images, setImages] = useState<Record<string, ImageVue>>({});
  const [tampon, setTampon] = useState<string>('mnd-6-dentele');
  const [dateRecu, setDateRecu] = useState(aujourdhui());
  const [selection, setSelection] = useState('');
  const [paveParaphe, setPaveParaphe] = useState(false);
  const [envoi, setEnvoi] = useState(false);
  const [rangerSur, setRangerSur] = useState('');

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
        for (let i = 1; i <= doc.numPages; i += 1) tours.push((await doc.getPage(i)).rotate);
        if (vivant) { setPdf(doc); setToursDOrigine(tours); }
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

  const poseIci = async (page: number, fx: number, fy: number) => {
    if (!outil) return;
    let image: string | undefined;
    if (outil === 'signature') { if (!images.signature) { toast('Déposez d’abord votre signature : Secrétariat, Documents, « Ma signature ».', 6000); return; } image = 'signature'; }
    if (outil === 'paraphe') { if (!images.paraphe) { setPaveParaphe(true); return; } image = 'paraphe'; }
    if (outil === 'tampon') { const t = tampons.find((x) => x.cle === tampon); const c = t ? await chargeLeTampon(t) : null; if (!c) return; image = c; }
    if (outil === 'recu') { const t = TAMPONS.mnd.find((x) => x.cle === TAMPON_A_DATER); const c = t ? await chargeLeTampon(t, dateRecu) : null; if (!c) return; image = c; }
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
  const surPages = (pages: number[]) => {
    if (!pose) return;
    const neuves = repeteSurLesPages(pose, pages, poses, nouvelId);
    setPoses((x) => [...x, ...neuves]);
    toast(neuves.length ? `Posé sur ${neuves.length} page${neuves.length > 1 ? 's' : ''} de plus.` : 'Déjà posé sur ces pages.');
  };

  const ecrit = async (): Promise<{ octets: Uint8Array; nom: string } | null> => {
    if (!poses.length && !Object.keys(pagesRetouchees.tours).length && !pagesRetouchees.retirees.length) { toast('Rien n’a été posé ni retouché.'); return null; }
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
      return { octets: await ecritLaCopie(ouverture.octets, poses, pagesRetouchees, pourEcrire), nom: nomDeLaCopie(ouverture.nom, aujourdhui()) };
    } catch (e) {
      toast(e instanceof PdfProtege ? e.message : 'La copie n’a pas pu s’écrire. Le PDF est peut-être abîmé.', 7000);
      return null;
    }
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
      signeLe: new Date().toISOString(), signePar: monNom, contenu: contenuDeLaCopie(poses, pagesRetouchees, nbPages),
    };
    retoucheLaLigne(ligne, { fichiers: [...ligne.fichiers, f] } as Partial<LigneAvecFichiers>);
    toast(`Copie gardée : « ${c.nom} ». L’original est intact.`, 6000);
    onClose();
  };

  return createPortal(
    <Modal title={`Signer · ${ouverture.nom}`} onClose={onClose} width={1100}>
      <div className="spdf">
        {erreur && <p className="sad-doux" role="alert">{erreur}</p>}
        <aside className="spdf-outils" aria-label="Les outils">
          <span className="spdf-titre">Poser</span>
          {([['signature', 'Ma signature'], ['paraphe', 'Mon paraphe'], ['tampon', 'Un tampon'], ['recu', '« Reçu le »']] as [GenreDePose, string][]).map(([g, l]) => (
            <button key={g} type="button" className={`spdf-outil${outil === g ? ' est-actif' : ''}`} aria-pressed={outil === g} onClick={() => setOutil(g)}>
              {l}{g === 'signature' && !images.signature ? ' (à déposer)' : g === 'paraphe' && !images.paraphe ? ' (à dessiner)' : ''}
            </button>
          ))}
          {outil === 'tampon' && <Select value={tampon} onChange={(e) => setTampon(e.target.value)} aria-label="Le tampon">{tampons.map((t) => <option key={t.cle} value={t.cle}>{t.nom}</option>)}</Select>}
          {outil === 'recu' && <input type="date" className="spdf-date" value={dateRecu} onChange={(e) => setDateRecu(e.target.value || aujourdhui())} aria-label="La date du tampon" />}
          <span className="spdf-titre">Écrire</span>
          {([['texte', 'Un texte'], ['date', 'La date du jour'], ['lu', '« Lu et approuvé »'], ['coche', 'Une coche ✓']] as [GenreDePose, string][]).map(([g, l]) => (
            <button key={g} type="button" className={`spdf-outil${outil === g ? ' est-actif' : ''}`} aria-pressed={outil === g} onClick={() => setOutil(g)}>{l}</button>
          ))}
          <p className="spdf-aide">{outil ? 'Touchez la page à l’endroit voulu.' : 'Choisissez un outil, puis touchez la page.'}</p>
          {pose && (
            <div className="spdf-choisie">
              <span className="spdf-titre">La pièce choisie</span>
              {(pose.genre === 'texte') && <input className="spdf-texte" value={pose.texte ?? ''} onChange={(e) => change(pose.id, { texte: e.target.value })} aria-label="Le texte" />}
              <div className="spdf-deux">
                <button type="button" className="spdf-outil" onClick={() => change(pose.id, estUneImage(pose.genre) ? { largeur: Math.max(0.04, pose.largeur / 1.15) } : { taille: Math.max(6, (pose.taille ?? TAILLE_DU_TEXTE) - 1) })}>Plus petit</button>
                <button type="button" className="spdf-outil" onClick={() => change(pose.id, estUneImage(pose.genre) ? { largeur: Math.min(0.9, pose.largeur * 1.15) } : { taille: Math.min(40, (pose.taille ?? TAILLE_DU_TEXTE) + 1) })}>Plus grand</button>
              </div>
              <button type="button" className="spdf-outil" onClick={() => surPages(Array.from({ length: nbPages }, (_, i) => i))}>Sur toutes les pages</button>
              <div className="spdf-deux">
                <input className="spdf-texte" value={selection} onChange={(e) => setSelection(e.target.value)} placeholder="Pages : 1, 3-5" aria-label="Les pages" />
                <button type="button" className="spdf-outil" onClick={() => { const p = pagesDeLaSelection(selection, nbPages); if (!p.length) { toast('Écrivez des pages : 1, 3-5'); return; } surPages(p); }}>Poser</button>
              </div>
              <button type="button" className="spdf-outil spdf-outil--rouge" onClick={() => { setPoses((x) => x.filter((p) => p.id !== pose.id)); setChoisie(null); }}>Retirer</button>
            </div>
          )}
        </aside>
        <div className="spdf-pages">
          {!pdf && !erreur && <p className="sad-doux">Le PDF s’ouvre…</p>}
          {pdf && Array.from({ length: nbPages }, (_, i) => (
            <PageDuPdf
              key={i} pdf={pdf} index={i} tour={tourFinal(toursDOrigine[i] ?? 0, pagesRetouchees.tours[i])} retiree={pagesRetouchees.retirees.includes(i)}
              poses={poses.filter((p) => p.page === i)} images={images} choisie={choisie} outil={outil}
              surPose={poseIci} surChoix={setChoisie} surBouge={(id, x, y) => change(id, { x, y })}
              surTourne={() => setPagesRetouchees((r) => ({ ...r, tours: { ...r.tours, [i]: ((r.tours[i] ?? 0) + 1) % 4 } }))}
              surRetire={() => setPagesRetouchees((r) => ({ ...r, retirees: r.retirees.includes(i) ? r.retirees.filter((x) => x !== i) : [...r.retirees, i] }))}
              nbPages={nbPages}
            />
          ))}
        </div>
      </div>
      <div className="spdf-bas">
        <span className="sad-doux">{contenuDeLaCopie(poses, pagesRetouchees, nbPages).join(' · ') || 'Rien de posé.'}</span>
        <span className="spdf-actions">
          {!ouverture.ligne && (
            <Select value={rangerSur} onChange={(e) => setRangerSur(e.target.value)} aria-label="Ranger la copie sur">
              <option value="">Ranger la copie sur…</option>
              {candidates.map((l) => <option key={l.id} value={l.id}>{libelleDeLaLigne(l)}</option>)}
            </Select>
          )}
          <Button variant="ghost" onClick={() => void telecharge()}>Télécharger la copie</Button>
          <Button variant="copper" disabled={envoi || (!ouverture.ligne && !rangerSur)} onClick={() => void garde()}>{envoi ? 'Envoi…' : 'Garder la copie signée'}</Button>
        </span>
      </div>
      {paveParaphe && (
        <PoserMonParaphe moi={moi} onClose={() => setPaveParaphe(false)} surDepose={async (u) => { const r = await ratioDe(u); setImages((x) => ({ ...x, paraphe: { url: u, ratio: r } })); setPaveParaphe(false); toast('Paraphe gardé : touchez la page pour le poser.'); }} />
      )}
    </Modal>,
    document.body,
  );
}

function PageDuPdf({ pdf, index, tour, retiree, poses, images, choisie, outil, surPose, surChoix, surBouge, surTourne, surRetire, nbPages }: {
  pdf: PDFDocumentProxy; index: number; tour: number; retiree: boolean; poses: PoseSurPdf[]; images: Record<string, ImageVue>;
  choisie: string | null; outil: GenreDePose | null; nbPages: number;
  surPose: (page: number, fx: number, fy: number) => void; surChoix: (id: string) => void; surBouge: (id: string, x: number, y: number) => void;
  surTourne: () => void; surRetire: () => void;
}) {
  const toile = useRef<HTMLCanvasElement>(null);
  const boite = useRef<HTMLDivElement>(null);
  const [largeurPt, setLargeurPt] = useState(0);
  const [largeurPx, setLargeurPx] = useState(0);
  const [ratio, setRatio] = useState(1.414);
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
      const largeur = Math.min(boite.current?.clientWidth || 700, 760);
      const echelle = largeur / vue1.width;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const vue = page.getViewport({ scale: echelle * dpr, rotation: tour });
      const c = toile.current;
      if (!c || !vivant) return;
      c.width = Math.floor(vue.width); c.height = Math.floor(vue.height);
      setLargeurPt(vue1.width); setRatio(vue1.height / vue1.width);
      const ctx = c.getContext('2d');
      if (!ctx) return;
      const t = page.render({ canvasContext: ctx, viewport: vue });
      tache = t;
      await t.promise.catch(() => undefined);
    })();
    return () => { vivant = false; tache?.cancel(); };
  }, [pdf, index, tour]);

  const clic = (e: React.MouseEvent<HTMLDivElement>) => {
    if (retiree || !outil || (e.target as HTMLElement).closest('.spdf-pose')) return;
    const r = e.currentTarget.getBoundingClientRect();
    surPose(index, (e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
  };
  const glisse = (p: PoseSurPdf) => (e: React.PointerEvent<HTMLElement>) => {
    e.preventDefault(); e.stopPropagation(); surChoix(p.id);
    const cadre = (e.currentTarget.parentElement as HTMLElement).getBoundingClientRect();
    const dx = e.clientX - (cadre.left + p.x * cadre.width), dy = e.clientY - (cadre.top + p.y * cadre.height);
    const bouge = (ev: PointerEvent) => surBouge(p.id, Math.min(0.97, Math.max(0, (ev.clientX - dx - cadre.left) / cadre.width)), Math.min(0.98, Math.max(0, (ev.clientY - dy - cadre.top) / cadre.height)));
    const lache = () => { window.removeEventListener('pointermove', bouge); window.removeEventListener('pointerup', lache); };
    window.addEventListener('pointermove', bouge); window.addEventListener('pointerup', lache);
  };
  return (
    <div className="spdf-page" ref={boite}>
      <div className="spdf-feuille" style={{ aspectRatio: `1 / ${ratio}` }} onClick={clic} data-retiree={retiree || undefined}>
        <canvas ref={toile} aria-label={`Page ${index + 1}`} />
        {poses.map((p) => {
          const style: React.CSSProperties = { left: `${p.x * 100}%`, top: `${p.y * 100}%` };
          const classe = `spdf-pose${p.id === choisie ? ' est-choisie' : ''}`;
          if (estUneImage(p.genre)) {
            const im = p.image ? images[p.image] : undefined;
            return im ? <img key={p.id} src={im.url} alt="" draggable={false} className={classe} style={{ ...style, width: `${p.largeur * 100}%` }} onPointerDown={glisse(p)} /> : null;
          }
          const taille = (p.taille ?? TAILLE_DU_TEXTE) * pxParPt * (p.genre === 'coche' ? 1.3 : 1);
          return <span key={p.id} className={`${classe} spdf-pose--texte`} style={{ ...style, fontSize: `${taille}px` }} onPointerDown={glisse(p)}>{p.genre === 'coche' ? '✔' : p.texte}</span>;
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
