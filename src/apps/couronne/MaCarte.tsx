import { useState, type CSSProperties } from 'react';
import { CarteDeMarraine } from '../../ds/CarteDeMarraine';
import { carteDeMarraineEnBlob, lienDeLaCarte, lienDeLaCarteEcrit, messageDeLaCarte, type DonneesDeCarte } from '../../ds/carte-marraine';
import {
  genreEffectif, nomDuRang, prenomDuNom, rangDe, rangSuivant, soinsEnAttente, RANGS,
  type ChoixDeRecompense, type SoinOffert,
} from '../../shared/parrainage-pur';
import { clientsStore } from '../../shared/clients';
import { useClassement } from '../../shared/classement-ambassade';
import { asset } from '../../shared/asset';
import { useClient, useVisibleCatalog } from './lib';
import { t, locale } from './i18n';

/* ══ MON AMBASSADE — 28 septembre 2026 (maquette validée, « construits ») ══
   Chaque cliente est une ambassadrice. Ici : son rang dans un médaillon qui
   se remplit, la récompense qu'elle CHOISIT (un soin offert, ou une remise
   sur un produit), le défi du mois, sa lignée en arbre, ses récompenses, le
   classement si la Maison l'a allumé, et sa carte à partager.

   Ma Couronne LIT ce que le Trône écrit (code, résumé, récompenses, protégés
   par 0111). Elle n'écrit qu'une chose : son CHOIX (`choixRecompenses`),
   que le Trône reporte sur la récompense. */

const ETAT_DIT = { 'sans-rdv': 'pas encore de rendez-vous', 'a-venir': 'rendez-vous à venir', venue: 'venue', annulee: 'rendez-vous annulé' } as const;
const dateDite = (iso?: string) => {
  if (!iso) return '';
  const d = new Date(`${iso.slice(0, 10)}T12:00:00`);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString(locale(), { day: 'numeric', month: 'long', year: 'numeric' });
};

/* ── CE QUE LE TRÔNE ÉCRIT EN FRANÇAIS, DIT DANS SA LANGUE — 3 octobre 2026 ──
   La raison et le libellé d'une récompense sont des DONNÉES (shared/ambassade),
   écrites en français sur sa fiche. On ne les réécrit jamais : on reconnaît
   leurs quelques formes à l'affichage, et le reste passe tel quel. */
const MOIS_FR = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const moisTraduit = (m: string) => {
  const i = MOIS_FR.indexOf(m);
  return i < 0 ? m : new Date(2000, i, 1).toLocaleDateString(locale(), { month: 'long' });
};
const raisonDite = (r: string): string => {
  let m = /^Pour la venue de (.+)$/.exec(r);
  if (m) return t('Pour la venue de {prenom}', { prenom: m[1] });
  m = /^Écho : (.+), venue grâce à (.+)$/.exec(r);
  if (m) return t('Écho : {prenom}, venue grâce à {via}', { prenom: m[1], via: m[2] });
  m = /^Rang (.+) atteint$/.exec(r);
  if (m) return t('Rang {rang} atteint', { rang: t(m[1]) });
  m = /^Défi de (.+) relevé$/.exec(r);
  if (m) return t('Défi de {mois} relevé', { mois: moisTraduit(m[1]) });
  return r;
};
const produitDit = (x: string) => (x === 'un produit' || x === 'un produit de la Gamme' ? t(x) : x);
const libelleDit = (l: string): string => {
  const m = /^−(\d+) % sur (.+)$/.exec(l);
  if (m) return t('−{pct} % sur {produit}', { pct: m[1], produit: produitDit(m[2]) });
  return l === 'Un soin offert' || l === 'Une récompense à choisir' ? t(l) : l;
};
const INDIGO = '#1E2150';
const IVOIRE = '#F6F1E7';
const CUIVRE = '#B97A4A';
const CU_700 = 'var(--copper-700)';
const CU_300 = '#D6A06F';
const DOUX = 'var(--mc-doux)';
/* LE SOIR (3 octobre 2026) : ce qui s'écrit sur la page ou sur une carte claire
   suit le thème ; les aplats indigo (la carte, la lignée) restent indigo. */
const ENCRE = 'var(--mc-encre)';
const CARTE = 'var(--mc-blanc)';
const FILET = 'var(--hairline)';
const SERIF = 'var(--font-serif, "Cormorant Garamond", Georgia, serif)';

export function donneesDeMaCarte(client: ReturnType<typeof useClient>): DonneesDeCarte | null {
  if (!client?.codeParrain) return null;
  return {
    prenom: prenomDuNom(client.name) || client.name,
    code: client.codeParrain,
    depuis: (client.since ?? '').slice(0, 4) || String(new Date().getFullYear()),
    modele: client.carteModele ?? 'indigo',
    rang: client.parrainage?.rang,
  };
}

/** LA LIGNÉE EN ARBRE : elle au sommet, ses amies en branches, les amies de
    ses amies en feuilles (l'écho). Six branches au plus : au-delà, un nombre. */
export function Arbre({ prenom, filleules, echos }: {
  prenom: string;
  filleules: { prenom: string; etat: string }[];
  echos: { prenom: string; via: string }[];
}) {
  const branches = filleules.slice(0, 6);
  const L = 350;
  const pas = L / (branches.length + 1);
  const x = (i: number) => Math.round(pas * (i + 1));
  const H = echos.length ? 330 : 230;
  return (
    <svg viewBox={`0 0 ${L} ${H}`} role="img" aria-label={t('La lignée de {prenom} : {amies} et {echos}', {
      prenom,
      amies: filleules.length === 1 ? t('{n} amie', { n: 1 }) : t('{n} amies', { n: filleules.length }),
      echos: echos.length === 1 ? t('{n} écho', { n: 1 }) : t('{n} échos', { n: echos.length }),
    })} style={{ width: '100%', maxWidth: L, height: 'auto', display: 'block', margin: '0 auto' }}>
      {branches.map((f, i) => (
        <path key={`b${i}`} d={`M175 76 C 175 120, ${x(i)} 112, ${x(i)} 150`} fill="none" stroke={CU_300} strokeWidth={1.6} strokeLinecap="round" />
      ))}
      {branches.map((f, i) => echos.filter((e) => e.via === f.prenom).slice(0, 2).map((e, j) => {
        const ex = x(i) + (j === 0 ? -14 : 14) * (echos.filter((z) => z.via === f.prenom).length > 1 ? 1 : 0);
        return <path key={`e${i}-${j}`} d={`M${x(i)} 220 C ${x(i)} 240, ${ex} 244, ${ex} 264`} fill="none" stroke="rgba(214,160,111,.6)" strokeWidth={1.2} strokeDasharray="4 5" />;
      }))}
      <circle cx={175} cy={42} r={32} fill={CUIVRE} />
      <circle cx={175} cy={42} r={38} fill="none" stroke={CU_300} strokeWidth={1} />
      <text x={175} y={53} textAnchor="middle" fontFamily="Cormorant Garamond, Georgia, serif" fontSize={30} fill={IVOIRE}>{prenom.slice(0, 1).toUpperCase()}</text>
      {branches.map((f, i) => (
        <g key={`n${i}`}>
          <circle cx={x(i)} cy={172} r={22} fill={f.etat === 'venue' ? IVOIRE : 'none'} stroke={IVOIRE} strokeWidth={1.4} strokeDasharray={f.etat === 'venue' ? undefined : '3 4'} />
          <text x={x(i)} y={180} textAnchor="middle" fontFamily="Cormorant Garamond, Georgia, serif" fontSize={21} fill={f.etat === 'venue' ? INDIGO : IVOIRE}>{f.prenom.slice(0, 1).toUpperCase()}</text>
          <text x={x(i)} y={212} textAnchor="middle" fontSize={11} fill={IVOIRE}>{f.prenom.slice(0, 9)}</text>
        </g>
      ))}
      {branches.map((f, i) => echos.filter((e) => e.via === f.prenom).slice(0, 2).map((e, j, tous) => {
        const ex = x(i) + (tous.length > 1 ? (j === 0 ? -14 : 14) : 0);
        return (
          <g key={`f${i}-${j}`}>
            <circle cx={ex} cy={278} r={14} fill={CU_300} />
            <text x={ex} y={284} textAnchor="middle" fontFamily="Cormorant Garamond, Georgia, serif" fontSize={15} fill={INDIGO}>{e.prenom.slice(0, 1).toUpperCase()}</text>
          </g>
        );
      }))}
      {filleules.length > 6 && <text x={L - 8} y={176} textAnchor="end" fontSize={12} fill={CU_300}>+{filleules.length - 6}</text>}
    </svg>
  );
}

/** UNE RÉCOMPENSE À CHOISIR : un soin, ou une remise (et son produit). */
export function Choix({ s, nomDuSoin, produits, garde }: {
  s: SoinOffert;
  nomDuSoin?: string;
  produits: { id: string; name: string }[];
  garde: (c: ChoixDeRecompense) => void;
}) {
  const [genre, setGenre] = useState<'soin' | 'remise' | ''>('');
  const [produitId, setProduitId] = useState('');
  const carte = (actif: boolean, fonce: boolean): CSSProperties => ({
    textAlign: 'left', borderRadius: 16, padding: '16px 16px', display: 'flex', gap: 14, alignItems: 'center', cursor: 'pointer', width: '100%',
    background: fonce ? INDIGO : CARTE, color: fonce ? IVOIRE : ENCRE,
    border: actif ? `3px solid ${fonce ? CU_300 : CUIVRE}` : fonce ? '3px solid transparent' : `1px solid ${FILET}`,
  });
  return (
    <div style={{ display: 'grid', gap: 10, padding: 16, borderRadius: 18, background: 'rgba(185,122,74,.1)', border: `1px solid ${CU_300}` }}>
      <span style={{ fontSize: 10.5, letterSpacing: '.24em', textTransform: 'uppercase', color: CU_700 }}>{t('Une récompense à choisir · {prenom} est venue', { prenom: s.raison.replace(/^Pour la venue de /, '') })}</span>
      <button type="button" onClick={() => setGenre('soin')} style={carte(genre === 'soin', true)}>
        <img src={asset('/assets/motifs/medaillon-seul-cuivre.png')} alt="" style={{ width: 46, height: 46, flex: 'none' }} />
        <span style={{ display: 'grid', gap: 2 }}>
          <span style={{ fontSize: 10.5, letterSpacing: '.22em', textTransform: 'uppercase', color: CU_300 }}>{t('Un soin offert')}</span>
          <span style={{ fontFamily: SERIF, fontSize: 21, lineHeight: 1.1 }}>{nomDuSoin ?? t('Le soin de la Maison')}</span>
        </span>
      </button>
      <button type="button" onClick={() => setGenre('remise')} style={carte(genre === 'remise', false)}>
        <span style={{ width: 46, height: 46, flex: 'none', borderRadius: '50%', background: CUIVRE, color: IVOIRE, display: 'grid', placeItems: 'center', fontFamily: SERIF, fontSize: 16 }}>{t('−{pct} %', { pct: s.pct ?? 20 })}</span>
        <span style={{ display: 'grid', gap: 2 }}>
          <span style={{ fontSize: 10.5, letterSpacing: '.22em', textTransform: 'uppercase', color: CU_700 }}>{t('Une remise sur un produit')}</span>
          <span style={{ fontFamily: SERIF, fontSize: 21, lineHeight: 1.1 }}>{t('Le produit de la Gamme de votre choix')}</span>
        </span>
      </button>
      {genre === 'remise' && produits.length > 0 && (
        <select value={produitId} onChange={(e) => setProduitId(e.target.value)} aria-label={t('Le produit de votre remise')}
          style={{ minHeight: 48, borderRadius: 10, border: `1px solid ${CUIVRE}`, padding: '0 12px', fontSize: 15, background: CARTE, color: ENCRE }}>
          <option value="">{t('Je choisirai à la Maison')}</option>
          {produits.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      )}
      <button type="button" disabled={!genre} onClick={() => genre && garde({ genre, ...(genre === 'remise' && produitId ? { produitId } : {}), le: new Date().toISOString() })}
        style={{ minHeight: 50, borderRadius: 999, border: 0, background: genre ? CUIVRE : 'rgba(124,76,44,.4)', color: IVOIRE, fontSize: 12.5, letterSpacing: '.2em', textTransform: 'uppercase', cursor: genre ? 'pointer' : 'default' }}>
        {t('Garder cette récompense')}
      </button>
    </div>
  );
}

/** L'AMBASSADE, SANS SON CADRE — 29 septembre 2026 : le Cercle et les
    ambassadrices réunis. L'onglet « Le Cercle » de Ma Couronne la porte ;
    l'écran superposé ci-dessous ne sert plus que lorsque cet onglet est fermé. */
export function MonAmbassade({ toast }: { toast: (m: string) => void }) {
  const client = useClient();
  const donnees = donneesDeMaCarte(client);
  const { services, products } = useVisibleCatalog();
  const [classement] = useClassement();
  const [occupe, setOccupe] = useState(false);
  const aujourdhui = new Date().toISOString().slice(0, 10);
  const resume = client?.parrainage;
  const venues = resume?.venues ?? 0;
  const rang = rangDe(venues);
  const suivant = rangSuivant(venues);
  const choix = client?.choixRecompenses ?? {};
  const attente = soinsEnAttente(client?.soinsOfferts, aujourdhui);
  const aChoisir = attente.filter((s) => genreEffectif(s, choix) === 'a-choisir');
  const nomDuService = (id?: string) => (id ? services.find((x) => x.id === id)?.name : undefined);

  const garde = (id: string, c: ChoixDeRecompense) => {
    if (!client) return;
    clientsStore.set((prev) => prev.map((x) => (x.id === client.id ? { ...x, choixRecompenses: { ...(x.choixRecompenses ?? {}), [id]: c } } : x)));
    toast(c.genre === 'soin' ? t('C’est gardé : votre soin vous attend.') : t('C’est gardé : votre remise vous attend.'));
  };

  const partage = async () => {
    if (!donnees || occupe) return;
    setOccupe(true);
    try {
      const texte = messageDeLaCarte(donnees);
      const blob = await carteDeMarraineEnBlob('deux', donnees);
      const fichier = new File([blob], `carte-de-marraine-${donnees.code}.png`, { type: 'image/png' });
      const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
      if (nav.share && nav.canShare?.({ files: [fichier] })) await nav.share({ files: [fichier], text: texte });
      else window.open(`https://wa.me/?text=${encodeURIComponent(texte)}`, '_blank', 'noopener');
    } catch { /* un partage annulé n'est pas une panne */ } finally { setOccupe(false); }
  };
  const enregistre = async () => {
    if (!donnees) return;
    try {
      const blob = await carteDeMarraineEnBlob('deux', donnees);
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `carte-de-marraine-${donnees.code}.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      toast(t('Votre carte est enregistrée.'));
    } catch { toast(t('L’image n’a pas pu être préparée.')); }
  };
  const copie = async () => {
    if (!donnees) return;
    try { await navigator.clipboard.writeText(donnees.code); toast(t('Code {code} copié.', { code: donnees.code })); } catch { toast(donnees.code); }
  };
  /* LE LIEN COURT À COLLER OÙ ELLE VEUT — 7 octobre 2026 (Instagram, un
     statut, un SMS) : `maisonmnd.com/m/?CODE`. */
  const copieLeLien = async () => {
    if (!donnees) return;
    try { await navigator.clipboard.writeText(lienDeLaCarte(donnees.code)); toast(t('Lien copié : {lien}', { lien: lienDeLaCarteEcrit(donnees.code) })); } catch { toast(lienDeLaCarteEcrit(donnees.code)); }
  };

  const bouton: CSSProperties = {
    minHeight: 48, borderRadius: 999, border: '1px solid var(--mc-bord-bouton)', background: 'transparent',
    color: ENCRE, fontSize: 11.5, letterSpacing: '.16em', textTransform: 'uppercase', cursor: 'pointer',
  };
  const etiquette: CSSProperties = { fontSize: 11, letterSpacing: '.26em', textTransform: 'uppercase', color: CU_700 };
  const circ = 2 * Math.PI * 70;
  const base = rang.seuil;
  const part = suivant ? (venues - base) / (suivant.seuil - base) : 1;
  const nuit: CSSProperties = {
    position: 'relative', overflow: 'hidden', borderRadius: 20, color: IVOIRE,
    backgroundColor: INDIGO, backgroundImage: `linear-gradient(rgba(30,33,80,.55), rgba(30,33,80,.55)), url(${asset('/assets/motifs/allover-aere-indigo-cuivre.png')})`,
    backgroundSize: 'auto, 110px', backgroundRepeat: 'repeat',
  };

  return (
      <div style={{ display: 'grid', gap: 20, alignContent: 'start' }}>
        {!donnees ? (
          <p style={{ fontSize: 14.5, lineHeight: 1.6, color: DOUX }}>{t('Votre carte se prépare à la Maison. Revenez dans un instant : elle portera votre prénom et votre code.')}</p>
        ) : (
          <>
            {/* LE RANG, dans un médaillon qui se remplit. */}
            <div style={{ ...nuit, padding: '24px 20px', display: 'grid', justifyItems: 'center', gap: 10, textAlign: 'center' }}>
              <span style={{ fontSize: 10.5, letterSpacing: '.28em', textTransform: 'uppercase', color: CU_300 }}>{t('Ambassadrice de la Maison')}</span>
              <div style={{ position: 'relative', width: 160, height: 160 }}>
                <svg viewBox="0 0 160 160" style={{ position: 'absolute', inset: 0 }} aria-hidden="true">
                  <circle cx={80} cy={80} r={70} fill="none" stroke="rgba(246,241,231,.18)" strokeWidth={7} />
                  <circle cx={80} cy={80} r={70} fill="none" stroke={CU_300} strokeWidth={7} strokeLinecap="round"
                    strokeDasharray={`${(circ * Math.max(0.02, part)).toFixed(1)} ${circ.toFixed(1)}`} transform="rotate(-90 80 80)" style={{ transition: 'stroke-dasharray .8s ease' }} />
                </svg>
                <img src={asset('/assets/motifs/medaillon-seul-cuivre.png')} alt="" style={{ position: 'absolute', left: 30, top: 30, width: 100, height: 100 }} />
              </div>
              <span style={{ fontFamily: SERIF, fontWeight: 300, fontSize: 36, lineHeight: 1 }}>{t(rang.nom)}</span>
              <span style={{ fontSize: 14, color: 'rgba(246,241,231,.86)' }}>{venues === 0 ? t('Votre première amie vous attend.') : venues > 1 ? t('{n} amies venues grâce à vous', { n: venues }) : t('{n} amie venue grâce à vous', { n: venues })}</span>
              {suivant && <span style={{ fontSize: 13, color: CU_300 }}>{t('Encore {n} pour devenir {rang}', { n: suivant.seuil - venues, rang: t(suivant.nom) })}</span>}
            </div>

            {aChoisir.map((s) => (
              <Choix key={s.id} s={s} nomDuSoin={nomDuService(s.serviceId)} produits={products.map((p) => ({ id: p.id, name: p.name }))} garde={(c) => garde(s.id, c)} />
            ))}

            {resume?.defi && (
              <div style={{ borderRadius: 16, border: '1px solid rgba(124,76,44,.35)', padding: 16, display: 'grid', gap: 10, background: CARTE }}>
                <span style={etiquette}>{t('Le défi du mois')}</span>
                <span style={{ fontFamily: SERIF, fontSize: 21, lineHeight: 1.15, color: ENCRE }}>{(() => {
                  const v = { n: resume.defi.objectif, soin: resume.defi.libelle === 'Un soin offert' ? t('Un soin offert') : resume.defi.libelle };
                  return resume.defi.objectif === 1 ? t('{n} amie venue ce mois : {soin} offert.', v) : t('{n} amies venues ce mois : {soin} offert.', v);
                })()}</span>
                <div style={{ display: 'flex', gap: 6 }}>
                  {Array.from({ length: resume.defi.objectif }, (_, i) => (
                    <span key={i} style={{ flex: 1, height: 10, borderRadius: 99, background: i < resume.defi!.fait ? CUIVRE : 'var(--mc-piste)' }} />
                  ))}
                </div>
                <span style={{ fontSize: 12.5, color: DOUX }}>{t('{fait} sur {objectif}', { fait: resume.defi.fait, objectif: resume.defi.objectif })}{resume.defi.fait >= resume.defi.objectif ? <>{' · '}{t('relevé !')}</> : null}</span>
              </div>
            )}

            {/* LA LIGNÉE */}
            <div style={{ ...nuit, padding: '20px 16px', display: 'grid', gap: 10 }}>
              <span style={{ fontSize: 11, letterSpacing: '.26em', textTransform: 'uppercase', color: CU_300 }}>{t('Votre lignée')}</span>
              {(resume?.filleules ?? []).length === 0
                ? <p style={{ margin: 0, fontSize: 14, lineHeight: 1.55, color: 'rgba(246,241,231,.86)' }}>{t('Tout part de vous. Partagez votre carte : chaque amie venue devient une branche, et les amies de vos amies vous reviennent en écho.')}</p>
                : <Arbre prenom={donnees.prenom} filleules={resume?.filleules ?? []} echos={resume?.echos ?? []} />}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <span style={{ background: IVOIRE, color: INDIGO, borderRadius: 12, padding: 10, fontSize: 12.5, lineHeight: 1.4 }}><b style={{ fontWeight: 500 }}>{t('Vos amies')}</b><br />{t('une récompense chacune')}</span>
                <span style={{ border: `1px solid ${CU_300}`, borderRadius: 12, padding: 10, fontSize: 12.5, lineHeight: 1.4 }}><b style={{ fontWeight: 500 }}>{t('Leurs amies')}</b><br />{t('un écho chacune')}</span>
              </div>
            </div>

            {/* SES RÉCOMPENSES */}
            {(client?.soinsOfferts ?? []).length > 0 && (
              <div style={{ display: 'grid', gap: 4 }}>
                <span style={etiquette}>{t('Vos récompenses')}</span>
                {(client?.soinsOfferts ?? []).map((s) => {
                  const g = genreEffectif(s, choix);
                  const expiree = !s.utiliseLe && !!s.expireLe && s.expireLe < aujourdhui;
                  const dit = g === 'a-choisir' ? t('à choisir') : g === 'remise' ? (choix[s.id]?.produitId ? t('−{pct} % sur {produit}', { pct: s.pct ?? 20, produit: products.find((p) => p.id === choix[s.id]?.produitId)?.name ?? t('un produit') }) : s.libelle.startsWith('−') ? libelleDit(s.libelle) : t('−{pct} % sur {produit}', { pct: s.pct ?? 20, produit: t('un produit') })) : (nomDuService(s.serviceId) ?? (s.libelle === 'Une récompense à choisir' ? t('Un soin offert') : libelleDit(s.libelle)));
                  return (
                    <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', padding: '11px 0', borderBottom: '1px solid var(--mc-filet-12)', opacity: s.utiliseLe || expiree ? 0.55 : 1 }}>
                      <span style={{ display: 'grid' }}><span style={{ fontSize: 14.5, color: ENCRE }}>{dit}</span><span style={{ fontSize: 12, color: DOUX }}>{raisonDite(s.raison)}{s.expireLe && !s.utiliseLe && !expiree ? <>{' · '}{t('jusqu’au {date}', { date: dateDite(s.expireLe) })}</> : null}</span></span>
                      <span style={{ fontSize: 11, padding: '4px 10px', borderRadius: 999, whiteSpace: 'nowrap', ...(s.utiliseLe ? { background: 'var(--mc-ok-fond)', color: 'var(--mc-ok-texte)' } : expiree ? { background: 'var(--mc-voile-06)', color: DOUX } : { background: 'rgba(185,122,74,.13)', color: CU_700 }) }}>
                        {s.utiliseLe ? t('utilisée') : expiree ? t('expirée') : t('à utiliser')}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}

            {/* LE CLASSEMENT, si la Maison l'a allumé */}
            {classement.lignes.length > 0 && (
              <div style={{ display: 'grid', gap: 4 }}>
                <span style={etiquette}>{t('Les ambassadrices du mois')}</span>
                {classement.lignes.slice(0, 5).map((x, i) => (
                  <div key={`${x.prenom}-${i}`} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 0', borderBottom: '1px solid var(--mc-filet-10)' }}>
                    <span style={{ fontFamily: SERIF, fontSize: 22, color: CUIVRE, width: 22 }}>{i + 1}</span>
                    <span style={{ flexGrow: 1, fontSize: 14.5, color: ENCRE }}>{x.prenom === 'Une cliente' ? t('Une cliente') : x.prenom} <span style={{ fontSize: 12, color: DOUX }}>· {t(nomDuRang(x.rang))}</span></span>
                    <span style={{ fontSize: 12.5, color: DOUX }}>{t('{n} ce mois', { n: x.ceMois })}</span>
                  </div>
                ))}
              </div>
            )}

            {/* SA CARTE */}
            <div style={{ display: 'grid', gap: 12 }}>
              <span style={etiquette}>{t('Votre carte')}</span>
              <CarteDeMarraine donnees={donnees} largeur={Math.min(350, (typeof window !== 'undefined' ? window.innerWidth : 390) - 40)} />
              <button type="button" onClick={() => void partage()} disabled={occupe}
                style={{ ...bouton, border: 0, background: CUIVRE, color: IVOIRE, minHeight: 50 }}>
                {occupe ? t('Préparation') : t('Partager sur WhatsApp')}
              </button>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <button type="button" style={bouton} onClick={() => void enregistre()}>{t('Enregistrer l’image')}</button>
                <button type="button" style={bouton} onClick={() => void copie()}>{t('Copier le code')}</button>
              </div>
              <button type="button" style={bouton} onClick={() => void copieLeLien()}>{t('Copier mon lien')}</button>
              <span style={{ fontSize: 12.5, color: DOUX, textAlign: 'center', userSelect: 'all' }}>{lienDeLaCarteEcrit(donnees.code)}</span>
            </div>

            {/* LES RANGS ET LES RÈGLES */}
            <div style={{ display: 'grid', gap: 8 }}>
              <span style={etiquette}>{t('Les rangs')}</span>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {RANGS.map((r) => (
                  <span key={r.id} style={{ fontSize: 12, padding: '6px 10px', borderRadius: 999, border: `1px solid ${r.id === rang.id ? CUIVRE : FILET}`, background: r.id === rang.id ? CUIVRE : 'transparent', color: r.id === rang.id ? IVOIRE : ENCRE }}>
                    {t(r.nom)}{r.seuil ? ` · ${r.seuil}` : ''}
                  </span>
                ))}
              </div>
              <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.55, color: DOUX }}>
                {t('Une amie compte quand elle est venue. Une récompense par amie, au choix ; un écho pour les amies de vos amies. Rien à payer, jamais d’argent : des soins et des remises, chacune avec sa date de fin.')}
              </p>
            </div>
          </>
        )}
      </div>
  );
}

export default function MaCarte({ onClose, toast }: { onClose: () => void; toast: (m: string) => void }) {
  return (
    <div className="mc-overlayscreen mc-slide" style={{ zIndex: 42 }}>
      <div className="mc-flowhead mc-flowhead--split">
        <div>
          <div className="mc-micro-eyebrow">{t('Le Cercle MND · transmettre')}</div>
          <h1 className="mc-flowhead__h1" style={{ marginTop: 4 }}>{t('Mon ambassade.')}</h1>
        </div>
        <button className="mc-x" aria-label={t('Fermer')} onClick={onClose}>✕</button>
      </div>
      <div className="mc-scroll" style={{ flex: 1, padding: '8px 20px calc(24px + env(safe-area-inset-bottom))' }}>
        <MonAmbassade toast={toast} />
      </div>
    </div>
  );
}
