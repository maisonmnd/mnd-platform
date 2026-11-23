import { readFileSync } from 'node:fs';
import path from 'node:path';

/* EN DIRECT, D UN TOUCHER, EPROUVE (23 novembre 2026).

   « Facilite l acces au reglement en direct et devis en direct, trop
   complique » (Yeman). Les deux panneaux vivaient au fond de « Encaisser ».
   Une fenetre a eux deux s ouvre maintenant depuis la ligne du rendez-vous.

   Ce banc lit le texte des ecrans : la fenetre reprend les MEMES panneaux,
   n encaisse rien, s ouvre du Tableau de bord et du Carnet, et ne s offre pas
   a qui ne voit pas les prix. Rien n est ecrit sur le disque : `--prouve`
   casse chaque regle EN MEMOIRE et attend que son controle la voie. */

const racine = path.resolve(import.meta.dirname, '..');
const lis = (f) => readFileSync(path.join(racine, f), 'utf8');
const FICHIERS = {
  fenetre: 'src/apps/trone/routes/clients/EnDirect.tsx',
  devis: 'src/apps/trone/routes/clients/DevisEnDirect.tsx',
  bord: 'src/apps/trone/routes/pilotage/Dashboard.tsx',
  style: 'src/apps/trone/routes/pilotage/tableau-de-bord.css',
  carnet: 'src/apps/trone/routes/clients/Carnet.tsx',
  encaisser: 'src/apps/trone/routes/clients/actions.tsx',
};
const sources = Object.fromEntries(Object.entries(FICHIERS).map(([k, f]) => [k, lis(f)]));

/** Le texte d'une fonction, de son nom jusqu'à la prochaine fonction de tête. */
const fonction = (texte, nom) => {
  const d = texte.indexOf(`function ${nom}(`);
  if (d < 0) return '';
  const suite = texte.slice(d + 10).search(/\n(export )?function [A-Z]/);
  return suite < 0 ? texte.slice(d) : texte.slice(d, d + 10 + suite);
};
const sans = (texte, morceau) => texte.split(morceau).join('');
const remplace = (texte, avant, apres) => texte.split(avant).join(apres);

const controles = [
  {
    dit: 'la fenetre reprend les deux memes panneaux, pas une copie',
    ok: (s) => /import \{ DevisEnDirect \} from '\.\/DevisEnDirect';/.test(s.fenetre) && /import \{ ReglementEnDirect \} from '\.\/ReglementEnDirect';/.test(s.fenetre)
      && /<DevisEnDirect appt=\{appt\}/.test(s.fenetre) && /<ReglementEnDirect appt=\{appt\} \/>/.test(s.fenetre),
    casse: (s) => ({ ...s, fenetre: remplace(s.fenetre, '<ReglementEnDirect appt={appt} />', '<section>le règlement</section>') }),
  },
  {
    dit: 'elle porte le nom de la cliente dans son titre',
    ok: (s) => /<Modal title=\{`En direct · \$\{nom\}`\} onClose=\{onClose\}/.test(s.fenetre),
    casse: (s) => ({ ...s, fenetre: remplace(s.fenetre, 'En direct · ${nom}', 'En direct') }),
  },
  {
    dit: 'l ordre suit la seance : le reglement devant des que la note existe, le devis devant avant',
    ok: (s) => /const saNoteExiste = !!appt\.lienDeReglement;/.test(s.fenetre) && /\{saNoteExiste \? <>\{reglement\}\{devis\}<\/> : <>\{devis\}\{reglement\}<\/>\}/.test(s.fenetre),
    casse: (s) => ({ ...s, fenetre: remplace(s.fenetre, '{saNoteExiste ? <>{reglement}{devis}</> : <>{devis}{reglement}</>}', '{devis}{reglement}') }),
  },
  {
    dit: 'sans note, elle dit quand le reglement s ouvrira au lieu de rester vide',
    ok: (s) => /Il s’ouvre ici dès que la séance est terminée/.test(s.fenetre) && /const reglement = saNoteExiste \? \(/.test(s.fenetre),
    casse: (s) => ({ ...s, fenetre: sans(s.fenetre, 'Il s’ouvre ici dès que la séance est terminée') }),
  },
  {
    dit: 'le devis s y ouvre deja pour etre compose, tant que la seance n est pas terminee',
    ok: (s) => /ouvertDAbord=\{!saNoteExiste\}/.test(s.fenetre) && /ouvertDAbord\?: boolean;/.test(s.devis) && /useState\(!!ouvertDAbord\)/.test(s.devis),
    casse: (s) => ({ ...s, devis: remplace(s.devis, 'useState(!!ouvertDAbord)', 'useState(false)') }),
  },
  {
    dit: 'le rendez-vous se relit au magasin, jamais sur la copie tenue en main',
    ok: (s) => /const appt = rdvs\.find\(\(a\) => a\.id === entrant\.id\) \?\? entrant;/.test(s.fenetre),
    casse: (s) => ({ ...s, fenetre: remplace(s.fenetre, 'const appt = rdvs.find((a) => a.id === entrant.id) ?? entrant;', 'const appt = entrant;') }),
  },
  {
    dit: 'la fenetre n encaisse rien et ne termine rien',
    ok: (s) => !/from '\.\/actions'/.test(s.fenetre) && !/honoreSansEncaisser|appointmentsStore|setPieces|cashbox/i.test(s.fenetre),
    casse: (s) => ({ ...s, fenetre: `import { honoreSansEncaisser } from './actions';\n${s.fenetre}` }),
  },
  {
    dit: 'les prix du devis se calculent une fois, par le calcul du Trone',
    ok: (s) => /const tarifs = useMemo\(\s*\(\) => tarifsDuRituel\(appt, \{ client, bands, sets, cats: categories, byId, tousServices: services, produits \}\)/.test(s.fenetre)
      && /useCallback\(\(sv: Service\) => tarifs\.prixPlein\(sv\), \[tarifs\]\)/.test(s.fenetre),
    casse: (s) => ({ ...s, fenetre: remplace(s.fenetre, 'tarifs.prixPlein(sv), [tarifs]', 'sv.priceXof ?? 0, []') }),
  },
  {
    dit: 'Tableau de bord : « En direct » sur la ligne, sans ouvrir le rendez-vous derriere',
    ok: (s) => /import \{ EnDirect \} from '\.\.\/clients\/EnDirect';/.test(s.bord)
      && /className="tdb-btn tdb-btn--direct" onClick=\{\(e\) => \{ e\.stopPropagation\(\); setDirectAppt\(a\); \}\}[^>]*>\s*En direct\s*<\/button>/.test(s.bord),
    casse: (s) => ({ ...s, bord: remplace(s.bord, 'e.stopPropagation(); setDirectAppt(a);', 'setDirectAppt(a);') }),
  },
  {
    dit: 'Tableau de bord : jamais sur un rendez-vous annule, et avant le geste d etat',
    ok: (s) => {
      const g = s.bord.slice(s.bord.indexOf('<span className="tdb-gestes">'));
      const direct = g.indexOf('tdb-btn--direct'), etat = g.indexOf('tdb-btn--etat');
      return direct > 0 && etat > direct && /\{a\.status !== 'annulé' && \(\s*<button type="button" className="tdb-btn tdb-btn--direct"/.test(g);
    },
    casse: (s) => ({ ...s, bord: s.bord.replace(/\{a\.status !== 'annulé' && \((\s*<button type="button" className="tdb-btn tdb-btn--direct")/, '{($1') }),
  },
  {
    dit: 'Tableau de bord : la fenetre s ouvre sur ce rendez-vous et se referme',
    ok: (s) => /\{directAppt && <EnDirect appt=\{directAppt\} onClose=\{\(\) => setDirectAppt\(null\)\} \/>\}/.test(s.bord),
    casse: (s) => ({ ...s, bord: sans(s.bord, '{directAppt && <EnDirect appt={directAppt} onClose={() => setDirectAppt(null)} />}') }),
  },
  {
    dit: 'le lien se dessine en lien, pas en bouton plein : ni l etat ni l argent',
    ok: (s) => /\.tdb-btn--direct \{[^}]*border-color: transparent;[^}]*text-decoration: underline;/.test(s.style),
    casse: (s) => ({ ...s, style: remplace(s.style, 'border-color: transparent; color: var(--tdb-encre); padding-inline: 6px;', 'color: var(--tdb-encre); padding-inline: 6px;') }),
  },
  {
    dit: 'le tableau de l equipe, qui ne voit pas les montants, ne l offre pas',
    ok: (s) => { const t = fonction(s.bord, 'TableauDeLEquipe'); return t.length > 500 && !/EnDirect|En direct/.test(t); },
    casse: (s) => ({ ...s, bord: remplace(s.bord, 'function TableauDeLEquipe() {', 'function TableauDeLEquipe() {\n  const ouvre = <EnDirect appt={a} onClose={() => {}} />;') }),
  },
  {
    dit: 'Carnet : en tete du menu de la ligne, avant le statut',
    ok: (s) => {
      const m = s.carnet.slice(s.carnet.indexOf('<MenuFlottant ancre={menuAncre} onClose={fermeLeMenu}>'));
      const direct = m.indexOf('En direct · son devis, son règlement'), statut = m.indexOf('<div className="trc-menu__titre">Statut</div>');
      return direct > 0 && statut > direct && /<button onClick=\{\(\) => \{ setDirectAppt\(a\); setMenuFor\(null\); \}\}>En direct · son devis, son règlement<\/button>/.test(m);
    },
    casse: (s) => ({ ...s, carnet: remplace(s.carnet, 'setDirectAppt(a); setMenuFor(null); }}>En direct', 'setDirectAppt(a); }}>En direct') }),
  },
  {
    dit: 'Carnet : le jour meme seulement, jamais annule, jamais pour qui ne voit pas les prix',
    ok: (s) => /\{a\.date === todayISO\(\) && a\.status !== 'annulé' && !sansPrix && \(\s*<>\s*<button onClick=\{\(\) => \{ setDirectAppt\(a\);/.test(s.carnet)
      && /\{directAppt && !sansPrix && <EnDirect appt=\{directAppt\} onClose=\{\(\) => setDirectAppt\(null\)\} \/>\}/.test(s.carnet),
    casse: (s) => ({ ...s, carnet: s.carnet.replace(/a\.status !== 'annulé' && !sansPrix && \((\s*<>)/, "a.status !== 'annulé' && ($1") }),
  },
  {
    dit: 'la fenetre « Encaisser » garde ses deux panneaux : rien n est retire',
    ok: (s) => /<DevisEnDirect appt=\{appt\} services=\{\[\.\.\.byId\.values\(\)\]\}/.test(s.encaisser) && /<ReglementEnDirect appt=\{appt\} \/>/.test(s.encaisser),
    casse: (s) => ({ ...s, encaisser: sans(s.encaisser, '<ReglementEnDirect appt={appt} />') }),
  },
];

const prouve = process.argv.includes('--prouve');
let fautes = 0;
if (!prouve) {
  for (const c of controles) {
    const bon = c.ok(sources);
    if (!bon) fautes++;
    console.log(`${bon ? '  ok   ' : '  FAUTE '}${c.dit}`);
  }
  console.log(fautes ? `\n${fautes} FAUTE(S) sur ${controles.length}` : `\n${controles.length} controles, tout est vert`);
} else {
  for (const c of controles) {
    const casse = c.casse(sources);
    const change = Object.keys(sources).some((k) => casse[k] !== sources[k]);
    const vue = change && !c.ok(casse);
    if (!vue) fautes++;
    console.log(`${vue ? '  vue   ' : change ? '  MUETTE ' : '  SANS EFFET '}${c.dit}`);
  }
  console.log(fautes ? `\n${fautes} panne(s) non vue(s) sur ${controles.length}` : `\n--prouve ${controles.length}/${controles.length} : chaque panne est vue`);
}
process.exit(fautes ? 1 : 0);
