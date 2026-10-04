import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from '../../../../ds/components';
import { useBranch } from '../../../../shared/branches';
import { useSettings } from '../../../../shared/settings';
import { useOffers } from '../../../../shared/offers';
import { etatDeLOffre } from '../../../../shared/offres-pur';
import { useDemandes } from '../../../../shared/demandes';
import { supabase } from '../../../../shared/supabase';
import { jourCourtAn } from '../../../../shared/calendrier';

/* ══ LE SITE PUBLIC, VU DU TRÔNE — 4 octobre 2026 ═════════════════════
   « Cette page ne sert absolument à rien. Mettre le site public sur cette
   page. Que Ma Couronne soit bien distinguée du site public » (Yéman).
   Maquette « Les vitrines de la Maison », réponses au sélecteur : les
   réglages qui vivent ailleurs se MONTRENT ici avec un lien vers leur écran
   (une seule place par réglage) ; les textes et photos auront leur éditeur,
   sur une maquette à part.

   CE QUE VOIT QUI NE VOUS CONNAÎT PAS ENCORE. Rien ici ne touche Ma
   Couronne ni la tablette du comptoir. */

/** La bande de tête d'une vitrine : sa couleur, son public, son état. */
export function BandeDeVitrine({ couleur, titre, dit, children }: { couleur: string; titre: string; dit: string; children?: ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: 14, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', borderLeft: `4px solid ${couleur}`, background: 'var(--surface-card)', border: '1px solid var(--hairline)', borderLeftWidth: 4, borderLeftColor: couleur, borderRadius: '0 4px 4px 0', padding: '14px 16px', marginBottom: 16 }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontFamily: 'var(--font-serif)', fontSize: 26, color: 'var(--color-indigo)', lineHeight: 1.1 }}>{titre}</div>
        <div className="mnd-muted" style={{ fontSize: 12.5, marginTop: 4 }}>{dit}</div>
      </div>
      {children && <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{children}</div>}
    </div>
  );
}

export const Pastille = ({ ton, children }: { ton?: 'ok' | 'attente'; children: ReactNode }) => (
  <span style={{
    fontFamily: 'var(--font-sans)', fontSize: 11.5, padding: '3px 10px', borderRadius: 999, whiteSpace: 'nowrap',
    border: `1px solid ${ton === 'ok' ? 'var(--trf-success, #4A6B52)' : ton === 'attente' ? 'var(--color-copper)' : 'var(--hairline)'}`,
    color: ton === 'ok' ? 'var(--trf-success, #4A6B52)' : ton === 'attente' ? 'var(--copper-700)' : 'var(--ink-soft)',
    background: 'var(--surface-card)',
  }}>{children}</span>
);

const Bloc = ({ titre, ou, children }: { titre: string; ou?: string; children: ReactNode }) => (
  <div style={{ background: 'var(--surface-card)', border: '1px solid var(--hairline)', borderRadius: 4, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
    <div style={{ fontFamily: 'var(--font-serif)', fontSize: 20, color: 'var(--color-indigo)', lineHeight: 1.15 }}>{titre}</div>
    {ou && <div className="mnd-muted" style={{ fontSize: 11.5, lineHeight: 1.5 }}>{ou}</div>}
    {children}
  </div>
);

const Ligne = ({ gauche, sous, droite }: { gauche: ReactNode; sous?: ReactNode; droite?: ReactNode }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, borderTop: '1px solid var(--hairline)', paddingTop: 7 }}>
    <span style={{ fontSize: 13.5, minWidth: 0 }}>
      {gauche}
      {sous && <span className="mnd-muted" style={{ display: 'block', fontSize: 11.5 }}>{sous}</span>}
    </span>
    {droite}
  </div>
);

const Lien = ({ vers, children }: { vers: string; children: ReactNode }) => {
  const navigate = useNavigate();
  return <button type="button" className="trc-c360-linkbtn" onClick={() => navigate(vers)}>{children}</button>;
};

const ADRESSE_DU_SITE = 'https://maisonmnd.com/';

/** La version servie du site : la date de la dernière mise en ligne. */
function useDerniereMiseEnLigne(): string | null {
  const [build, setBuild] = useState<string | null>(null);
  useEffect(() => {
    let vivant = true;
    fetch('/version.json', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { build?: string } | null) => { if (vivant && j?.build) setBuild(j.build); })
      .catch(() => { /* hors ligne : on se tait */ });
    return () => { vivant = false; };
  }, []);
  if (!build || !/^\d{12}/.test(build)) return null;
  const d = `${build.slice(0, 4)}-${build.slice(4, 6)}-${build.slice(6, 8)}`;
  return `${jourCourtAn(d)}, ${build.slice(8, 10)} h ${build.slice(10, 12)}`;
}

/** Les pages du site, lues dans son plan (sitemap.xml) : la liste suit le site. */
function usePagesDuSite(): string[] {
  const [pages, setPages] = useState<string[]>([]);
  useEffect(() => {
    let vivant = true;
    fetch('/sitemap.xml', { cache: 'no-store' })
      .then((r) => (r.ok ? r.text() : ''))
      .then((xml) => {
        if (!vivant) return;
        setPages([...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]));
      })
      .catch(() => { /* hors ligne */ });
    return () => { vivant = false; };
  }, []);
  return pages;
}

/** Les avis Google relevés pour le site. */
function useAvisGoogle(): { note: number; nombre: number; le?: string } | null {
  const [avis, setAvis] = useState<{ note: number; nombre: number; le?: string } | null>(null);
  useEffect(() => {
    let vivant = true;
    if (!supabase) return;
    void supabase.from('documents').select('data,updated_at').eq('key', 'mnd_avis_google').maybeSingle()
      .then(({ data }) => {
        const d = (data as { data?: { note?: number; nombre?: number }; updated_at?: string } | null);
        if (vivant && d?.data && Number(d.data.note) > 0) setAvis({ note: Number(d.data.note), nombre: Number(d.data.nombre) || 0, le: d.updated_at });
      });
    return () => { vivant = false; };
  }, []);
  return avis;
}

export function VitrineSite({ catalogue }: { catalogue: ReactNode }) {
  const { branch } = useBranch();
  const [reglages] = useSettings();
  const [offres] = useOffers();
  const [demandes] = useDemandes();
  const miseEnLigne = useDerniereMiseEnLigne();
  const pages = usePagesDuSite();
  const avis = useAvisGoogle();
  const [toutesLesPages, setToutesLesPages] = useState(false);

  const nouvelles = demandes.filter((d) => (!d.branchId || d.branchId === branch.id) && d.statut === 'nouvelle' && !d.archiveeLe).length;
  /* Ce que le site montre : les offres actives dans leur saison, datées ou
     mises en vitrine sans date (la même règle que l'îlot des offres). */
  const offresDuSite = useMemo(() => offres
    .filter((o) => o.branchId === branch.id)
    .map((o) => {
      const etat = etatDeLOffre(o);
      const montrable = !!(o.du || o.au || o.vitrine);
      const dit = !montrable ? 'pas sur le site : ni dates, ni vitrine'
        : etat === 'cours' ? (o.au ? `sur le site jusqu’au ${jourCourtAn(o.au)}` : 'sur le site, sans date de fin')
          : etat === 'venir' ? `sur le site à partir du ${jourCourtAn(o.du ?? '')}`
            : etat === 'passee' ? 'terminée' : 'éteinte';
      return { o, dit, enLigne: montrable && (etat === 'cours' || etat === 'venir') };
    })
    .sort((a, b) => Number(b.enLigne) - Number(a.enLigne)), [offres, branch.id]);

  const ouverts = reglages.hours.filter((h) => !h.closed);
  const horaires = ouverts.length
    ? `${ouverts.length} jours ouverts · ${ouverts[0].open}–${ouverts[0].close}${ouverts.some((h) => h.open !== ouverts[0].open || h.close !== ouverts[0].close) ? ' (selon les jours)' : ''}`
    : 'aucun jour ouvert';
  const plafond = reglages.maxRdvParJourMaison;

  const copier = async () => {
    try { await navigator.clipboard.writeText(ADRESSE_DU_SITE); toast('Adresse du site copiée.'); }
    catch { toast(ADRESSE_DU_SITE); }
  };

  return (
    <>
      <BandeDeVitrine couleur="var(--color-copper)" titre="maisonmnd.com" dit="Ce que voit qui ne vous connaît pas encore. Rien ici ne touche Ma Couronne ni la tablette du comptoir.">
        <Pastille ton="ok">En ligne</Pastille>
        {miseEnLigne && <Pastille>Dernière mise en ligne : {miseEnLigne}</Pastille>}
        {nouvelles > 0 && <Pastille ton="attente">{nouvelles} demande{nouvelles > 1 ? 's' : ''} à traiter</Pastille>}
        <a className="mnd-btn mnd-btn--ghost" href={ADRESSE_DU_SITE} target="_blank" rel="noreferrer">Voir le site</a>
      </BandeDeVitrine>

      <div className="tr-grid tr-grid--2" style={{ gap: 14, alignItems: 'start', marginBottom: 22 }}>
        <Bloc titre="Les offres sur le site" ou="Les mêmes offres que le Marketing. Une offre paraît sur le site si elle est active et datée, ou mise en vitrine sans date.">
          {offresDuSite.length === 0 && <span className="mnd-muted" style={{ fontSize: 12.5 }}>Aucune offre pour cette branche.</span>}
          {offresDuSite.slice(0, 8).map(({ o, dit, enLigne }) => (
            <Ligne key={o.id} gauche={o.title} sous={dit} droite={<Pastille ton={enLigne ? 'ok' : undefined}>{enLigne ? 'en ligne' : 'absente'}</Pastille>} />
          ))}
          <Lien vers="/marketing">Créer ou modifier une offre, au Marketing →</Lien>
        </Bloc>

        <Bloc titre="La réservation en ligne" ou="Ce qui règle les heures proposées sur le site. Chaque réglage garde son écran ; ce bloc les montre.">
          <Ligne gauche="Horaires et fermetures" sous={horaires} droite={<Lien vers="/parametres">Modifier</Lien>} />
          <Ligne gauche="Rendez-vous par jour au plus" sous="le même plafond que Ma Couronne" droite={<span>{plafond ?? 'sans plafond'}</span>} />
          <Ligne gauche="Prix au calibre" sous="Le Juste Prix" droite={<Lien vers="/juste-prix">{reglages.baremeSuspendu ? 'Suspendu' : 'Actif'} →</Lien>} />
          <Ligne gauche="Prestations proposées" sous="la liste plus bas, sur cette page" droite={<span />} />
        </Bloc>

        <Bloc titre="Ce qui revient du site">
          <Ligne gauche="Demandes et rendez-vous posés" sous={nouvelles > 0 ? `${nouvelles} nouvelle${nouvelles > 1 ? 's' : ''}` : 'rien en attente'} droite={<Lien vers="/demandes">Les demandes →</Lien>} />
          <Ligne gauche="Avis Google" sous={avis ? `${avis.note.toLocaleString('fr-FR')} · ${avis.nombre} avis${avis.le ? ` · relevé le ${jourCourtAn(avis.le.slice(0, 10))}` : ''}` : 'pas encore relevés'} droite={<span />} />
          <Ligne gauche="Cartes cadeaux payées en ligne" sous="KkiaPay" droite={<Lien vers="/cartes-cadeaux">Les cartes →</Lien>} />
        </Bloc>

        <Bloc titre="Les pages du site" ou="Lues dans le plan du site. L’éditeur des textes et des photos viendra ici, après sa maquette.">
          {pages.length === 0 && <span className="mnd-muted" style={{ fontSize: 12.5 }}>Le plan du site n’a pas pu être lu (hors ligne ?).</span>}
          {(toutesLesPages ? pages : pages.slice(0, 6)).map((u) => (
            <Ligne key={u} gauche={<a href={u} target="_blank" rel="noreferrer" style={{ color: 'var(--color-indigo)' }}>{u.replace(/^https?:\/\/[^/]+/, '') || '/'}</a>} />
          ))}
          {pages.length > 6 && (
            <button type="button" className="trc-c360-linkbtn" onClick={() => setToutesLesPages((v) => !v)}>
              {toutesLesPages ? 'Moins' : `Les ${pages.length} pages`}
            </button>
          )}
        </Bloc>

        <Bloc titre="Le lien et le QR du site">
          <Ligne gauche={ADRESSE_DU_SITE} droite={<button type="button" className="trc-c360-linkbtn" onClick={() => void copier()}>Copier</button>} />
          <Lien vers="/qr-codes">Le QR du site →</Lien>
        </Bloc>
      </div>

      {catalogue}
    </>
  );
}
