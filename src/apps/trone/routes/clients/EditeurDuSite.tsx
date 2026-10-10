import { useEffect, useMemo, useRef, useState } from 'react';
import { demande, toast } from '../../../../ds/components';
import { supabase } from '../../../../shared/supabase';
import { identiteCourante } from '../../../../shared/journal';
import { ACCUEIL, PAGES } from '../../../revelateur/contenu';
import {
  PAGE_ACCUEIL, PAGE_PROTEGEE, bloquants, champsDeLaPage, gardesDuTexte, publie, resteDuBrouillon,
  type Champ, type RetouchesDePage,
} from '../../../../shared/site-retouches';
import {
  brouillonDuSiteStore, changementsEnAttente, publieDuSiteStore, useBrouillonDuSite, usePublieDuSite,
} from '../../../../shared/site-retouches-store';
import { useEstDirection } from '../_vie';

/* ══ L'ÉDITEUR DU SITE — 4 octobre 2026 ════════════════════════════════
   Maquette « L'éditeur du site », réponses au sélecteur : un clic publie et
   le site se refabrique sur le serveur ; les textes et photos des pages
   existantes ; Brice et Yéman seuls publient ; « Notre histoire » protégée.

   ÉCRIRE NE PUBLIE RIEN. Chaque frappe va au brouillon (un document du
   personnel) ; « Publier » le verse dans ce qui est publié, puis demande au
   serveur de refabriquer le site. L'aperçu suit la frappe. */

type PageListee = { chemin: string; nom: string; contenu: unknown };
const LES_PAGES: PageListee[] = [
  { chemin: PAGE_ACCUEIL, nom: 'Accueil', contenu: ACCUEIL },
  ...PAGES.map((p) => ({ chemin: p.chemin, nom: (p as { court?: string }).court ?? p.h1 ?? p.chemin, contenu: p })),
];

const srcPhoto = (v: string) => (/^https?:\/\//.test(v) ? v : `/assets/photos/site/${v}`);
const slug = (chemin: string) => chemin.replace(/^\/|\/$/g, '').replace(/[^a-z0-9-]/gi, '-') || 'accueil';

/** La version servie du site, pour savoir quand une publication est en ligne. */
const versionServie = async (): Promise<string | null> => {
  try {
    const r = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' });
    return r.ok ? ((await r.json()) as { build?: string }).build ?? null : null;
  } catch { return null; }
};

export function EditeurDuSite({ onClose }: { onClose: () => void }) {
  const estDirection = useEstDirection();
  const [brouillon] = useBrouillonDuSite();
  const [publieDoc] = usePublieDuSite();
  const [chemin, setChemin] = useState<string>(LES_PAGES[1]?.chemin ?? PAGE_ACCUEIL);
  const [histoireOuverte, setHistoireOuverte] = useState(false);
  const [accord, setAccord] = useState(false);
  const [envoi, setEnvoi] = useState<'' | 'photo' | 'publication'>('');
  const [suivi, setSuivi] = useState<string>('');
  const minuteur = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearInterval(minuteur.current), []);

  const page = LES_PAGES.find((p) => p.chemin === chemin) ?? LES_PAGES[0];
  const champs = useMemo(() => champsDeLaPage(page.contenu), [page]);
  const brouillonPage: RetouchesDePage = brouillon.pages?.[chemin] ?? {};
  const publiePage: RetouchesDePage = publieDoc.pages?.[chemin] ?? {};
  const enAttente = changementsEnAttente(brouillon);
  const bloque = bloquants(brouillon.pages ?? {});

  /** Ce que le site montrera pour un champ : le brouillon, sinon le publié, sinon l'origine. */
  const valeurDe = (c: Champ): string => {
    const b = brouillonPage[c.cle];
    if (b !== undefined) return b === '' ? c.valeur : b;
    return publiePage[c.cle] ?? c.valeur;
  };
  const enLigneDe = (c: Champ): string => publiePage[c.cle] ?? c.valeur;

  const autoriseLaPage = async (): Promise<boolean> => {
    if (chemin !== PAGE_PROTEGEE || histoireOuverte) return true;
    const ok = await demande({
      quoi: 'Notre histoire',
      titre: 'Modifier « Notre histoire » ?',
      dit: 'C’est votre récit. On le coupe, on ne le reformule pas.',
      accepter: 'Je modifie le récit',
      refuser: 'Ne pas toucher',
    });
    if (ok) setHistoireOuverte(true);
    return ok;
  };

  const ecris = (c: Champ, v: string) => {
    brouillonDuSiteStore.set((b) => {
      const pages = { ...(b.pages ?? {}) };
      const r = { ...(pages[chemin] ?? {}) };
      if (v === enLigneDe(c)) delete r[c.cle]; else r[c.cle] = v;
      if (Object.keys(r).length) pages[chemin] = r; else delete pages[chemin];
      return { ...b, pages };
    });
  };
  /** Revenir au texte d'origine (celui de contenu.ts). */
  const origine = (c: Champ) => {
    brouillonDuSiteStore.set((b) => {
      const pages = { ...(b.pages ?? {}) };
      const r = { ...(pages[chemin] ?? {}) };
      if (publiePage[c.cle] !== undefined) r[c.cle] = ''; else delete r[c.cle];
      if (Object.keys(r).length) pages[chemin] = r; else delete pages[chemin];
      return { ...b, pages };
    });
  };

  const deposeLaPhoto = async (c: Champ, fichier: File | undefined) => {
    if (!fichier || !supabase) return;
    if (!accord) { toast('Cochez d’abord l’accord de la personne photographiée.'); return; }
    if (!(await autoriseLaPage())) return;
    setEnvoi('photo');
    const ext = (fichier.name.split('.').pop() || 'jpg').toLowerCase();
    const nom = `pages/${slug(chemin)}-${Date.now().toString(36)}.${ext}`;
    const { error } = await supabase.storage.from('site').upload(nom, fichier, { contentType: fichier.type, upsert: false });
    setEnvoi('');
    if (error) { toast(`La photo n’est pas partie : ${error.message}`); return; }
    const url = supabase.storage.from('site').getPublicUrl(nom).data.publicUrl;
    ecris(c, url);
    brouillonDuSiteStore.set((b) => ({
      ...b,
      photos: [...(b.photos ?? []), { photo: url, page: chemin, accordLe: new Date().toISOString().slice(0, 10), par: identiteCourante().nom }],
    }));
    setAccord(false);
    toast('Photo déposée dans le brouillon. Elle part avec la prochaine publication.');
  };

  /** Demande au serveur de refabriquer le site, puis guette la nouvelle version. */
  const refabrique = async () => {
    const avant = await versionServie();
    const r = supabase ? await supabase.functions.invoke('site-publier', { body: {} }) : { error: new Error('hors ligne') };
    if (r.error) {
      setSuivi('Publié dans le Trône. Le serveur ne répond pas encore (la clé GitHub n’est peut-être pas posée) : le site prendra vos textes à la prochaine mise en ligne.');
      return;
    }
    setSuivi('Le site se refabrique sur le serveur, quelques minutes…');
    let tours = 0;
    window.clearInterval(minuteur.current);
    minuteur.current = window.setInterval(async () => {
      tours += 1;
      const v = await versionServie();
      if (v && v !== avant) {
        window.clearInterval(minuteur.current);
        setSuivi(`En ligne · servi (version ${v}).`);
        toast('Le site est en ligne avec vos textes.');
      } else if (tours > 40) {
        window.clearInterval(minuteur.current);
        setSuivi('Toujours en cours après 13 minutes : regardez plus tard, ou dites-le moi.');
      }
    }, 20000);
  };

  const publier = async () => {
    if (!estDirection) return;
    if (bloque.length) { toast(bloque[0].dit); return; }
    if (!await demande({
      quoi: 'Le site public',
      titre: `Publier ${enAttente} modification${enAttente > 1 ? 's' : ''} ?`,
      dit: 'Le site se refabrique avec elles et sera en ligne dans quelques minutes.',
      suite: 'La publication d’avant reste à un clic, si vous voulez revenir.',
      accepter: 'Publier',
      refuser: 'Pas encore',
    })) return;
    /* LE BROUILLON TEL QU'IL EST APRÈS LA CONFIRMATION (10 octobre 2026),
       pas celui du rendu : un autre poste a pu y écrire pendant qu'elle était
       ouverte. Il se rejuge, part entier, et seul ce qui est parti s'en
       retire (`resteDuBrouillon`), jamais le brouillon d'un bloc. */
    const parti = brouillonDuSiteStore.get();
    const bloqueAuDepart = bloquants(parti.pages ?? {});
    if (bloqueAuDepart.length) { toast(bloqueAuDepart[0].dit); return; }
    setEnvoi('publication');
    publieDuSiteStore.set((p) => publie(p, parti.pages ?? {}, new Date().toISOString(), identiteCourante().nom, parti.photos ?? []));
    brouillonDuSiteStore.set((b) => resteDuBrouillon(b, parti));
    setEnvoi('');
    await refabrique();
  };

  const revenirAvant = async () => {
    const prec = publieDoc.precedent;
    if (!estDirection || !prec) return;
    if (!await demande({
      quoi: 'Le site public',
      titre: 'Revenir à la publication d’avant ?',
      dit: 'Le site reprend les textes et photos de la publication précédente.',
      accepter: 'Revenir en arrière',
      refuser: 'Garder',
      dur: true,
    })) return;
    publieDuSiteStore.set({ ...prec, le: new Date().toISOString() });
    await refabrique();
  };

  const toutDefaire = async () => {
    if (!await demande({ quoi: 'Le site public', titre: 'Défaire tout le brouillon ?', dit: 'Le site en ligne ne bouge pas.', accepter: 'Défaire', refuser: 'Garder' })) return;
    brouillonDuSiteStore.set({ pages: {} });
  };

  const apercu = (cle: string) => { const c = champs.find((x) => x.cle === cle); return c ? valeurDe(c) : ''; };

  return (
    <div style={{ border: '1px solid var(--hairline)', borderRadius: 6, overflow: 'hidden', marginBottom: 22, background: 'var(--surface-card)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', background: 'var(--color-indigo)', color: 'var(--color-ivoire)', padding: '10px 14px' }}>
        <span style={{ fontFamily: 'var(--font-serif)', fontSize: 19 }}>L’éditeur du site</span>
        <span style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, border: '1px solid currentColor', borderRadius: 999, padding: '3px 10px' }}>
            {enAttente ? `${enAttente} modification${enAttente > 1 ? 's' : ''} en brouillon` : 'Tout est en ligne'}
          </span>
          {enAttente > 0 && <button className="mnd-btn mnd-btn--ghost" style={{ color: 'var(--color-ivoire)', borderColor: 'var(--hairline-invert)' }} onClick={() => void toutDefaire()}>Défaire</button>}
          {estDirection && publieDoc.precedent && <button className="mnd-btn mnd-btn--ghost" style={{ color: 'var(--color-ivoire)', borderColor: 'var(--hairline-invert)' }} onClick={() => void revenirAvant()}>Publication d’avant</button>}
          {estDirection
            ? <button className="mnd-btn" style={{ background: 'var(--color-copper)', borderColor: 'var(--color-copper)' }} disabled={!enAttente || envoi !== ''} onClick={() => void publier()}>Publier</button>
            : <span style={{ fontSize: 12 }}>Brice et Yéman publient</span>}
          <button className="mnd-btn mnd-btn--ghost" style={{ color: 'var(--color-ivoire)', borderColor: 'var(--hairline-invert)' }} onClick={onClose}>Fermer</button>
        </span>
      </div>
      {suivi && <div style={{ padding: '8px 14px', fontSize: 12.5, background: 'var(--copper-50, #f9efe7)', color: 'var(--copper-700)' }}>{suivi}</div>}
      {bloque.length > 0 && <div style={{ padding: '8px 14px', fontSize: 12.5, background: 'var(--copper-50, #f9efe7)', color: 'var(--trv-error, #8E3B26)' }}>Ne peut pas partir : {bloque.map((b) => `${b.page} · ${b.dit}`).join(' ; ')}</div>}

      <div className="tr-cols" style={{ '--cols': '200px minmax(0,1fr) minmax(0,1fr)', gap: 0, alignItems: 'start' } as React.CSSProperties}>
        <nav aria-label="Pages du site" style={{ borderRight: '1px solid var(--hairline)', maxHeight: 640, overflowY: 'auto', padding: '8px 0' }}>
          {LES_PAGES.map((p) => {
            const n = Object.keys(brouillon.pages?.[p.chemin] ?? {}).length;
            return (
              <button
                key={p.chemin}
                type="button"
                aria-current={p.chemin === chemin ? 'page' : undefined}
                onClick={() => { setChemin(p.chemin); setAccord(false); }}
                style={{
                  display: 'flex', justifyContent: 'space-between', gap: 6, width: '100%', textAlign: 'left', border: 0, cursor: 'pointer',
                  padding: '7px 14px', fontFamily: 'var(--font-sans)', fontSize: 13,
                  background: p.chemin === chemin ? 'var(--copper-50, #f9efe7)' : 'transparent',
                  color: p.chemin === chemin ? 'var(--copper-700)' : 'var(--ink)',
                }}
              >
                <span>{p.nom}{p.chemin === PAGE_PROTEGEE ? ' · protégée' : ''}</span>
                {n > 0 && <span style={{ color: 'var(--color-copper)' }}>● {n}</span>}
              </button>
            );
          })}
        </nav>

        <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 12, maxHeight: 640, overflowY: 'auto', borderRight: '1px solid var(--hairline)' }}>
          <div className="mnd-muted" style={{ fontSize: 12 }}>
            {page.chemin} · {champs.length} champs. Les mots entre &lt;b&gt; et &lt;/b&gt; s’écrivent en gras sur le site.
          </div>
          {champs.map((c) => {
            const v = valeurDe(c);
            const modifie = brouillonPage[c.cle] !== undefined;
            const retouche = publiePage[c.cle] !== undefined || (modifie && brouillonPage[c.cle] !== '');
            const gardes = gardesDuTexte(v, chemin, c);
            return (
              <div key={c.cle} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <label style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 12.5 }}>
                  <span>{c.libelle}{modifie ? ' · en brouillon' : ''}</span>
                  {c.max && <span className="mnd-muted" style={{ fontVariantNumeric: 'tabular-nums' }}>{v.length} / {c.max}</span>}
                </label>
                {c.genre === 'photo' ? (
                  <div style={{ display: 'grid', gridTemplateColumns: '96px 1fr', gap: 10, alignItems: 'start' }}>
                    <img src={srcPhoto(v)} alt="" style={{ width: 96, aspectRatio: '4 / 5', objectFit: 'cover', borderRadius: 3, background: 'var(--hairline)' }} />
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <label style={{ display: 'flex', gap: 8, fontSize: 12, alignItems: 'flex-start' }}>
                        <input type="checkbox" checked={accord} onChange={(e) => setAccord(e.target.checked)} style={{ marginTop: 3 }} />
                        <span>La personne photographiée a donné son accord pour le site (obligatoire ; noté au registre).</span>
                      </label>
                      <label className="mnd-btn mnd-btn--ghost" style={{ alignSelf: 'flex-start', cursor: accord ? 'pointer' : 'not-allowed', opacity: accord ? 1 : 0.5 }}>
                        {envoi === 'photo' ? 'Envoi…' : 'Remplacer la photo'}
                        <input type="file" accept="image/jpeg,image/png,image/webp" hidden disabled={!accord || envoi !== ''} onChange={(e) => void deposeLaPhoto(c, e.target.files?.[0])} />
                      </label>
                      <span className="mnd-muted" style={{ fontSize: 11 }}>En paysage pour une photo de partage ; 5 Mo au plus.</span>
                    </div>
                  </div>
                ) : c.genre === 'court' ? (
                  <input className="mnd-input" value={v} onFocus={() => void autoriseLaPage()} onChange={(e) => { if (chemin !== PAGE_PROTEGEE || histoireOuverte) ecris(c, e.target.value); }} style={modifie ? { borderColor: 'var(--color-copper)' } : undefined} />
                ) : (
                  <textarea className="mnd-input" rows={Math.min(8, Math.max(2, Math.ceil(v.length / 70)))} value={v} onFocus={() => void autoriseLaPage()} onChange={(e) => { if (chemin !== PAGE_PROTEGEE || histoireOuverte) ecris(c, e.target.value); }} style={{ resize: 'vertical', ...(modifie ? { borderColor: 'var(--color-copper)' } : {}) }} />
                )}
                {gardes.map((g) => (
                  <span key={g.dit} style={{ fontSize: 11.5, color: g.niveau === 'bloque' ? 'var(--trv-error, #8E3B26)' : 'var(--copper-700)' }}>{g.niveau === 'bloque' ? 'Bloque : ' : ''}{g.dit}</span>
                ))}
                {retouche && (
                  <button type="button" className="trc-c360-linkbtn trc-c360-linkbtn--muted" style={{ alignSelf: 'flex-start' }} onClick={() => origine(c)}>Revenir au texte d’origine</button>
                )}
              </div>
            );
          })}
        </div>

        <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }} aria-live="polite">
          <span className="trc-microlabel" style={{ margin: 0 }}>Dans Google</span>
          <div style={{ border: '1px solid var(--hairline)', borderRadius: 4, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ fontSize: 12, color: 'var(--trf-success, #4A6B52)' }}>maisonmnd.com{page.chemin === '/' ? '' : ` › ${page.chemin.replace(/\//g, ' ').trim()}`}</span>
            <span style={{ fontSize: 16, color: '#4554B8' }}>{apercu('titre') || apercu('h1')}</span>
            <span className="mnd-muted" style={{ fontSize: 12.5 }}>{apercu('description')}</span>
          </div>
          <span className="trc-microlabel" style={{ margin: 0 }}>Sur le site</span>
          <div style={{ background: 'var(--color-indigo)', color: 'var(--color-ivoire)', borderRadius: 4, padding: '18px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {apercu('sur') && <span style={{ fontSize: 10.5, letterSpacing: '.2em', textTransform: 'uppercase', color: 'var(--copper-200, #e6b98f)' }}>{apercu('sur')}</span>}
            <span style={{ fontFamily: 'var(--font-serif)', fontSize: 26, lineHeight: 1.1 }}>{apercu('h1') || apercu('titre')}</span>
            {apercu('ligne') && <span style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 15, color: 'var(--indigo-100, #c9c4de)' }}>{apercu('ligne')}</span>}
            {apercu('cta.texte') && <span style={{ alignSelf: 'flex-start', background: 'var(--color-copper)', fontSize: 11.5, letterSpacing: '.1em', textTransform: 'uppercase', padding: '8px 12px', borderRadius: 2 }}>{apercu('cta.texte')}</span>}
            {apercu('cta.note') && <span style={{ fontSize: 12, color: 'var(--indigo-100, #c9c4de)' }}>{apercu('cta.note')}</span>}
          </div>
          {publieDoc.le && <span className="mnd-muted" style={{ fontSize: 11.5 }}>Dernière publication : {new Date(publieDoc.le).toLocaleString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}{publieDoc.par ? `, par ${publieDoc.par}` : ''}.</span>}
        </div>
      </div>
    </div>
  );
}
