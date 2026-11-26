import { readFileSync } from 'node:fs';
import path from 'node:path';
import { transform } from 'esbuild';

/* LES JOURS DE LA SEMAINE AU TABLEAU DE BORD, EPROUVES (25 novembre 2026).

   « Permets-moi de retourner a la journee d hier, et les autres jours de la
   semaine sur le tableau de bord » (Yeman). La carte « Aujourd hui » se lit
   jour par jour : sept pastilles du lundi au dimanche, une fleche de chaque
   cote pour changer de semaine. Ses lignes, son pied et le premier chiffre
   du bandeau suivent le jour regarde ; « A traiter », le mois et les impayes
   restent a maintenant.

   Ce banc tient deux choses :
     - la regle (tableau-de-bord-pur.ts), JOUEE : la semaine, les mots du
       jour, le geste d une ligne selon son jour ;
     - la lettre de l ecran (Dashboard.tsx, tableau-de-bord.css), LUE.
   Rien n est ecrit sur le disque : `--prouve` casse chaque regle EN MEMOIRE
   (la regle est recompilee depuis son texte) et attend que son controle la
   voie. */

const racine = path.resolve(import.meta.dirname, '..');
const lis = (f) => readFileSync(path.join(racine, f), 'utf8').replace(/\r\n/g, '\n');
const FICHIERS = {
  pur: 'src/apps/trone/routes/pilotage/tableau-de-bord-pur.ts',
  bord: 'src/apps/trone/routes/pilotage/Dashboard.tsx',
  style: 'src/apps/trone/routes/pilotage/tableau-de-bord.css',
};
const sources = Object.fromEntries(Object.entries(FICHIERS).map(([k, f]) => [k, lis(f)]));

/** La regle, compilee depuis son TEXTE : une panne en memoire se joue vraiment. */
const compiles = new Map();
const regle = async (texte) => {
  if (!compiles.has(texte)) {
    const { code } = await transform(texte, { loader: 'ts', format: 'esm' });
    compiles.set(texte, await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`));
  }
  return compiles.get(texte);
};
const pareil = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const remplace = (texte, avant, apres) => texte.split(avant).join(apres);
const sans = (texte, morceau) => texte.split(morceau).join('');
/** Le texte d'une fonction, de son nom jusqu'a la prochaine fonction de tete. */
const fonction = (texte, nom) => {
  const d = texte.indexOf(`function ${nom}(`);
  if (d < 0) return '';
  const suite = texte.slice(d + 10).search(/\n(export )?function [A-Z]/);
  return suite < 0 ? texte.slice(d) : texte.slice(d, d + 10 + suite);
};
/** La carte du jour, de sa section jusqu'a « A traiter ». */
const carte = (bord) => {
  const d = bord.indexOf('data-tdb="aujourdhui"');
  const f = bord.indexOf('data-tdb="a-traiter"');
  return d > 0 && f > d ? bord.slice(d, f) : '';
};

/* Le mercredi 25 novembre 2026 : le jour ou elle l a demande. */
const AUJ = '2026-11-25';
const SEMAINE = ['2026-11-23', '2026-11-24', '2026-11-25', '2026-11-26', '2026-11-27', '2026-11-28', '2026-11-29'];

const controles = [
  /* ── LA REGLE, JOUEE ─────────────────────────────────────────────── */
  {
    dit: 'la semaine va du lundi au dimanche, que l on parte d un mercredi, d un lundi ou d un dimanche',
    ok: async (s) => { const p = await regle(s.pur); return pareil(p.semaineDe(AUJ), SEMAINE) && pareil(p.semaineDe('2026-11-23'), SEMAINE) && pareil(p.semaineDe('2026-11-29'), SEMAINE); },
    casse: (s) => ({ ...s, pur: remplace(s.pur, 'const depuisLundi = (new Date(`${j}T12:00:00Z`).getUTCDay() + 6) % 7;', 'const depuisLundi = new Date(`${j}T12:00:00Z`).getUTCDay();') }),
  },
  {
    dit: 'une semaine passe le mois et l annee sans perdre un jour',
    ok: async (s) => { const p = await regle(s.pur); return pareil(p.semaineDe('2027-01-01'), ['2026-12-28', '2026-12-29', '2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02', '2027-01-03']); },
    casse: (s) => ({ ...s, pur: remplace(s.pur, 'return Array.from({ length: 7 }, (_, i) => decaleJour(j, i - depuisLundi));', 'return Array.from({ length: 7 }, (_, i) => `${j.slice(0, 8)}${String(Number(j.slice(8, 10)) + i - depuisLundi).padStart(2, \'0\')}`);') }),
  },
  {
    dit: 'une semaine plus tot, le meme jour de la semaine',
    ok: async (s) => { const p = await regle(s.pur); return p.decaleJour(AUJ, -7) === '2026-11-18' && p.decaleJour('2026-11-03', -7) === '2026-10-27' && p.decaleJour(AUJ, 7) === '2026-12-02'; },
    casse: (s) => ({ ...s, pur: remplace(s.pur, 'd.setUTCDate(d.getUTCDate() + n);', 'd.setUTCDate(d.getUTCDate() + Math.sign(n) * 6);') }),
  },
  {
    dit: 'la pastille dit « Mar » et « 24 », et « 1 » le premier du mois',
    ok: async (s) => { const p = await regle(s.pur); return pareil(p.pastilleDuJour('2026-11-24'), { nom: 'Mar', numero: '24' }) && pareil(p.pastilleDuJour('2026-12-01'), { nom: 'Mar', numero: '1' }) && pareil(p.pastilleDuJour('2026-11-29'), { nom: 'Dim', numero: '29' }); },
    casse: (s) => ({ ...s, pur: remplace(s.pur, 'numero: String(Number(j.slice(8, 10))) };', 'numero: j.slice(8, 10) };') }),
  },
  {
    dit: 'hier se dit « hier », demain « demain », aujourd hui « aujourd’hui »',
    ok: async (s) => { const p = await regle(s.pur); return pareil([p.leJourDit('2026-11-24', AUJ), p.leJourDit('2026-11-26', AUJ), p.leJourDit(AUJ, AUJ)], ['hier', 'demain', 'aujourd’hui']); },
    casse: (s) => ({ ...s, pur: remplace(s.pur, "if (j === decaleJour(a, -1)) return 'hier';", "if (j === decaleJour(a, -2)) return 'hier';") }),
  },
  {
    dit: 'un autre jour se dit en toutes lettres, « 1er » compris, l annee seulement si elle change',
    ok: async (s) => { const p = await regle(s.pur); return pareil([p.leJourDit('2026-11-17', AUJ), p.leJourDit('2026-12-01', AUJ), p.leJourDit('2026-12-31', '2027-01-05')], ['mardi 17 novembre', 'mardi 1er décembre', 'jeudi 31 décembre 2026']); },
    casse: (s) => ({ ...s, pur: remplace(s.pur, 'return `${JOURS_LONGS[new Date(`${j}T12:00:00Z`).getUTCDay()]} ${n === 1 ? \'1er\' : n} ${MOIS_LONGS[Number(j.slice(5, 7)) - 1]}${annee}`;', 'return `${JOURS_LONGS[new Date(`${j}T12:00:00Z`).getUTCDay()]} ${n} ${MOIS_LONGS[Number(j.slice(5, 7)) - 1]}`;') }),
  },
  {
    dit: 'le titre de la carte prend sa majuscule : « Hier », « Mardi 17 novembre »',
    ok: async (s) => { const p = await regle(s.pur); return pareil([p.quandDit('2026-11-24', AUJ), p.quandDit('2026-11-17', AUJ), p.quandDit(AUJ, AUJ)], ['Hier', 'Mardi 17 novembre', 'Aujourd’hui']); },
    casse: (s) => ({ ...s, pur: remplace(s.pur, 'const t = leJourDit(iso, aujourdhui);\n  return t.charAt(0).toUpperCase() + t.slice(1);', 'const t = leJourDit(iso, aujourdhui);\n  return t;') }),
  },
  {
    dit: 'l etiquette du chiffre reste courte : « hier », sinon « mar. 17 nov. »',
    ok: async (s) => { const p = await regle(s.pur); return pareil([p.leJourCourt('2026-11-24', AUJ), p.leJourCourt('2026-11-17', AUJ), p.leJourCourt('2026-12-01', AUJ), p.leJourCourt(AUJ, AUJ)], ['hier', 'mar. 17 nov.', 'mar. 1er déc.', 'aujourd’hui']); },
    casse: (s) => ({ ...s, pur: remplace(s.pur, 'if (j === a || j === decaleJour(a, -1) || j === decaleJour(a, 1)) return leJourDit(j, a);', 'if (j === a) return leJourDit(j, a);') }),
  },
  {
    dit: 'le geste d une ligne : « Terminer » le jour meme, « Honorer » un jour passe, « Confirmer » tant qu elle attend',
    ok: async (s) => { const p = await regle(s.pur); return pareil([p.gesteDeLaLigne('confirmé', AUJ, AUJ), p.gesteDeLaLigne('confirmé', '2026-11-24', AUJ), p.gesteDeLaLigne('en attente', '2026-11-24', AUJ), p.gesteDeLaLigne('en attente', AUJ, AUJ), p.gesteDeLaLigne('en attente', '2026-11-27', AUJ)], ['Terminer', 'Honorer', 'Confirmer', 'Confirmer', 'Confirmer']); },
    casse: (s) => ({ ...s, pur: remplace(s.pur, "return j === a ? 'Terminer' : 'Honorer';", "return 'Terminer';") }),
  },
  {
    dit: 'on n honore pas demain : aucun geste d etat sur un rendez-vous a venir deja confirme',
    ok: async (s) => { const p = await regle(s.pur); return p.gesteDeLaLigne('confirmé', '2026-11-26', AUJ) === null && p.gesteDeLaLigne('confirmé', '2026-12-02', AUJ) === null; },
    casse: (s) => ({ ...s, pur: sans(s.pur, '  if (j > a) return null;\n') }),
  },
  {
    dit: 'ni sur une ligne honoree (c est l argent qui se propose) ni sur une annulee',
    ok: async (s) => { const p = await regle(s.pur); return [AUJ, '2026-11-24', '2026-11-26'].every((d) => p.gesteDeLaLigne('honoré', d, AUJ) === null && p.gesteDeLaLigne('annulé', d, AUJ) === null); },
    casse: (s) => ({ ...s, pur: remplace(s.pur, "if (statut === 'honoré' || statut === 'annulé') return null;", "if (statut === 'annulé') return null;") }),
  },

  /* ── LA LETTRE DE L ECRAN ────────────────────────────────────────── */
  {
    dit: 'le tableau s ouvre sur aujourd hui, et un jour choisi egal a aujourd hui ne se retient pas',
    ok: (s) => /const \[jourChoisi, setJourChoisi\] = useState<string \| null>\(null\);/.test(s.bord) && s.bord.includes('const jourVu = jourChoisi ?? today;')
      && s.bord.includes('const regardeUnJour = (iso: string) => setJourChoisi(iso === today ? null : iso);'),
    casse: (s) => ({ ...s, bord: remplace(s.bord, 'const jourVu = jourChoisi ?? today;', 'const jourVu = jourChoisi ?? addDaysISO(today, -1);') }),
  },
  {
    dit: 'les lignes sont celles du jour regarde, sans les annulees, dans l ordre des heures',
    ok: (s) => /const jourRows = useMemo\(\s*\(\) => \(jourVu === today \? todayRows : appts\s*\.filter\(\(a\) => a\.date === jourVu && a\.status !== 'annulé'\)\s*\.sort\(\(a, b\) => timeToMin\(a\.time\) - timeToMin\(b\.time\)\)\),/.test(s.bord)
      /* Depuis le 26 novembre 2026, la carte dessine `lignesDuTableau` : ces
         lignes-là, et les essais du même jour quand « Montrer les essais » est
         cochée (banc verifie-essai). */
      && /\{lignesDuTableau\.map\(\(a\) => \{/.test(carte(s.bord)) && !/todayRows/.test(carte(s.bord))
      && /\? \[\.\.\.jourRows, \.\.\.essaisVivants\.filter\(\(a\) => a\.date === jourVu\)\]/.test(s.bord) && /: jourRows\), \[montrerLesEssais, jourRows, essaisVivants, jourVu\]\);/.test(s.bord),
    casse: (s) => ({ ...s, bord: remplace(s.bord, '? [...jourRows, ...essaisVivants', '? [...todayRows, ...essaisVivants') }),
  },
  {
    dit: 'le pied de la carte compte ce jour-la : l attendu, l encaisse, les fauteuils',
    ok: (s) => /const jourDuChiffre = chiffreAttenduDuJour\(jourRows\.map\(\(a\) => \(\{[^}]*\}\)\), jourVu\);/.test(s.bord)
      && /const plages = jourRows\.map\(/.test(s.bord) && /\}, \[jourRows, byId, branch\.seats\]\);/.test(s.bord)
      && s.bord.includes('title: `Attendu ${leJourDit(jourVu, today)}`,') && /rows: jourRows\.map\(/.test(s.bord),
    casse: (s) => ({ ...s, bord: s.bord.replace(/(chiffreAttenduDuJour\(jourRows\.map\(\(a\) => \(\{[^}]*\}\)\)), jourVu\);/, '$1, today);') }),
  },
  {
    dit: 'la carte porte le nom du jour, et « Revenir a aujourd hui » des qu on l a quitte',
    ok: (s) => carte(s.bord).includes('<h2 id="tdb-t-jour">{quandDit(jourVu, today)}</h2>')
      && /\{jourVu !== today && \(\s*<button type="button" className="tdb-lien" onClick=\{\(\) => setJourChoisi\(null\)\}>Revenir à aujourd’hui<\/button>\s*\)\}/.test(carte(s.bord)),
    casse: (s) => ({ ...s, bord: remplace(s.bord, '<h2 id="tdb-t-jour">{quandDit(jourVu, today)}</h2>', '<h2 id="tdb-t-jour">Aujourd’hui</h2>') }),
  },
  {
    dit: 'sept pastilles, celles de la semaine du jour regarde ; chacune dit son jour et ses rendez-vous',
    ok: (s) => {
      const c = carte(s.bord);
      return /return semaineDe\(jourVu\)\.map\(\(iso\) => \(\{ iso, n: parJour\.get\(iso\) \?\? 0 \}\)\);/.test(s.bord)
        && /<nav className="tdb-jours" aria-label="Les jours de la semaine"/.test(c) && /\{semaineVue\.map\(\(j\) => \{/.test(c)
        && /aria-pressed=\{j\.iso === jourVu\}/.test(c) && /onClick=\{\(\) => regardeUnJour\(j\.iso\)\}/.test(c)
        && c.includes("const dit = `${quandDit(j.iso, today)} · ${nombreDe(j.n, 'rendez-vous', 'rendez-vous')}`;") && /aria-label=\{dit\}/.test(c);
    },
    casse: (s) => ({ ...s, bord: remplace(s.bord, 'onClick={() => regardeUnJour(j.iso)}', 'onClick={() => undefined}') }),
  },
  {
    dit: 'les pastilles ne comptent pas les rendez-vous annules',
    ok: (s) => s.bord.includes("for (const a of appts) if (a.status !== 'annulé') parJour.set(a.date, (parJour.get(a.date) ?? 0) + 1);"),
    casse: (s) => ({ ...s, bord: remplace(s.bord, "for (const a of appts) if (a.status !== 'annulé') parJour.set(", 'for (const a of appts) parJour.set(') }),
  },
  {
    dit: 'une fleche de chaque cote : la semaine d avant, la semaine d apres, sur le meme jour',
    ok: (s) => {
      const c = carte(s.bord);
      const avant = c.indexOf('regardeUnJour(decaleJour(jourVu, -7))'), pastilles = c.indexOf('{semaineVue.map('), apres = c.indexOf('regardeUnJour(decaleJour(jourVu, 7))');
      return avant > 0 && pastilles > avant && apres > pastilles && c.includes('aria-label="La semaine d’avant"') && c.includes('aria-label="La semaine d’après"');
    },
    casse: (s) => ({ ...s, bord: remplace(s.bord, 'regardeUnJour(decaleJour(jourVu, 7))', 'regardeUnJour(decaleJour(jourVu, 1))') }),
  },
  {
    dit: 'le premier chiffre suit le jour : son nom, l argent du registre ce jour-la, et il ouvre ce jour-la',
    ok: (s) => s.bord.includes("{ k: 'jour', l: `Encaissé ${leJourCourt(jourVu, today)}`, v: fmt(jourVu === today ? encaisseAujourdhui : encaisseDuJourVu), c: nombreDe(jourRows.length, 'rendez-vous', 'rendez-vous'), go: () => openDay(jourVu) },")
      && /const encaisseDuJourVu = useMemo\(\s*\(\) => revenuDuJour\(registre, jourVu\)\.reduce\(\(s, r\) => s \+ r\.amountXof, 0\),\s*\[registre, jourVu\],/.test(s.bord),
    casse: (s) => ({ ...s, bord: remplace(s.bord, 'go: () => openDay(jourVu) },', 'go: () => openDay(today) },') }),
  },
  {
    dit: 'le reste ne voyage pas : la date du titre, la journee de Grenat, le mois, les clientes actives restent a aujourd hui',
    ok: (s) => s.bord.includes('<h1 className="tdb-tete__titre">{dateDuTitre(today)}</h1>') && s.bord.includes('const journee = useClotureDuJour(today);')
      && s.bord.includes('actives: clientesActives(appts, today, 90),') && s.bord.includes('sept: septJours(appts, today, estFermeLe),')
      && s.bord.includes('if (todayRows.length > 0) return 0;') && !/useClotureDuJour\(jourVu\)|clientesActives\(appts, jourVu|dateDuTitre\(jourVu\)/.test(s.bord),
    casse: (s) => ({ ...s, bord: remplace(s.bord, 'const journee = useClotureDuJour(today);', 'const journee = useClotureDuJour(jourVu);') }),
  },
  {
    dit: 'le geste d etat vient de la regle ; l argent ne se propose qu une fois la ligne honoree',
    ok: (s) => {
      const c = carte(s.bord);
      return c.includes('const geste = gesteDeLaLigne(a.status, a.date, today);') && /\{geste \? \(\s*<button type="button" className="tdb-btn tdb-btn--etat"/.test(c)
        && /\{geste\}\s*<\/button>/.test(c) && /\) : a\.status === 'honoré' && u\.resteXof > 0 \? \(/.test(c) && !/a\.date === todayISO\(\) \? 'Terminer' : 'Honorer'/.test(c);
    },
    casse: (s) => ({ ...s, bord: remplace(s.bord, 'const geste = gesteDeLaLigne(a.status, a.date, today);', "const geste = a.status === 'honoré' ? null : a.status === 'en attente' ? 'Confirmer' : a.date === todayISO() ? 'Terminer' : 'Honorer';") }),
  },
  {
    dit: '« En direct » un autre jour que le sien : seulement si sa note existe, comme sur la fiche',
    ok: (s) => /\{a\.status !== 'annulé' && \(a\.date === today \|\| !!a\.lienDeReglement\) && \(\s*<button type="button" className="tdb-btn tdb-btn--direct"/.test(carte(s.bord)),
    casse: (s) => ({ ...s, bord: remplace(s.bord, "{a.status !== 'annulé' && (a.date === today || !!a.lienDeReglement) && (", "{a.status !== 'annulé' && (") }),
  },
  {
    dit: 'un jour passe sans rendez-vous ne se dit pas « Carnet libre »',
    ok: (s) => carte(s.bord).includes("{jourVu < today ? 'Aucun rendez-vous ce jour-là' : 'Carnet libre'}") && /\{lignesDuTableau\.length === 0 && \(/.test(carte(s.bord)),
    casse: (s) => ({ ...s, bord: remplace(s.bord, "{jourVu < today ? 'Aucun rendez-vous ce jour-là' : 'Carnet libre'}", 'Carnet libre') }),
  },
  {
    dit: 'le tableau de l equipe garde sa journee : pas de pastilles',
    ok: (s) => { const t = fonction(s.bord, 'TableauDeLEquipe'); return t.length > 500 && !/tdb-jours|jourVu|semaineVue/.test(t); },
    casse: (s) => ({ ...s, bord: remplace(s.bord, 'function TableauDeLEquipe() {', 'function TableauDeLEquipe() {\n  const jourVu = todayISO();') }),
  },
  {
    dit: 'la rangee tient sur une ligne : deux fleches et sept colonnes egales, qui peuvent se serrer',
    ok: (s) => /\.tdb-jours \{[^}]*display: grid;[^}]*grid-template-columns: 30px repeat\(7, minmax\(0, 1fr\)\) 30px;/.test(s.style) && /\.tdb-jour \{[^}]*min-width: 0;/.test(s.style),
    casse: (s) => ({ ...s, style: remplace(s.style, 'grid-template-columns: 30px repeat(7, minmax(0, 1fr)) 30px;', 'grid-template-columns: 30px repeat(7, 96px) 30px;') }),
  },
  {
    dit: 'le jour regarde porte un filet de cuivre, aujourd hui garde son nom en cuivre ; aucun arrondi de plus de 4 px',
    ok: (s) => {
      const bloc = s.style.slice(s.style.indexOf('.tdb-carte__liens'), s.style.indexOf("/* ── 3a. Aujourd'hui ── */"));
      return /\.tdb-jour\.est-vu \{[^}]*border-bottom-color: var\(--tdb-cuivre\);/.test(bloc) && /\.tdb-jour\.est-aujourdhui \.tdb-jour__nom \{ color: var\(--tdb-cuivre\); \}/.test(bloc)
        && bloc.length > 400 && ![...bloc.matchAll(/border-radius:\s*(\d+)/g)].some((m) => Number(m[1]) > 4);
    },
    casse: (s) => ({ ...s, style: remplace(s.style, '.tdb-jour.est-vu { background: var(--tdb-papier); border-bottom-color: var(--tdb-cuivre); }', '.tdb-jour.est-vu { background: var(--tdb-papier); border-radius: 12px; }') }),
  },
  {
    dit: 'les pastilles et les fleches se voient au clavier',
    ok: (s) => /\.tdb-jour:focus-visible, \.tdb-jours__fleche:focus-visible \{ outline: 2px solid var\(--color-copper\);/.test(s.style),
    casse: (s) => ({ ...s, style: sans(s.style, '.tdb-jour:focus-visible, .tdb-jours__fleche:focus-visible { outline: 2px solid var(--color-copper); outline-offset: -2px; }') }),
  },
];

const prouve = process.argv.includes('--prouve');
let fautes = 0;
if (!prouve) {
  for (const c of controles) {
    const bon = await c.ok(sources);
    if (!bon) fautes++;
    console.log(`${bon ? '  ok   ' : '  FAUTE '}${c.dit}`);
  }
  console.log(fautes ? `\n${fautes} FAUTE(S) sur ${controles.length}` : `\n${controles.length} controles, tout est vert`);
} else {
  for (const c of controles) {
    const casse = c.casse(sources);
    const change = Object.keys(sources).some((k) => casse[k] !== sources[k]);
    let vue = false;
    /* Une regle cassee au point de ne plus se compiler ou de lever est vue, elle aussi. */
    try { vue = change && !(await c.ok(casse)); } catch { vue = change; }
    if (!vue) fautes++;
    console.log(`${vue ? '  vue   ' : change ? '  MUETTE ' : '  SANS EFFET '}${c.dit}`);
  }
  console.log(fautes ? `\n${fautes} panne(s) non vue(s) sur ${controles.length}` : `\n--prouve ${controles.length}/${controles.length} : chaque panne est vue`);
}
process.exit(fautes ? 1 : 0);
