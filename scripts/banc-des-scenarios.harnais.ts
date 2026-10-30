/* LE BANC DES SCÉNARIOS · 30 octobre 2026 : la vraie banque de la Maison,
   rejouée dans l'automate du dépôt. Elle se lit dans une sauvegarde de la
   Maison (« Sauvegarder la Maison », Système › Paramètres), jamais dans le
   dépôt : les messages des clientes ne quittent pas son poste.
   Un cas validé qui ne tient plus fait échouer le banc. */
import { readFileSync } from 'node:fs';
import { conseilDeLaMaison } from '../src/shared/automate-wa';
import { banqueLue, passeLaBanque } from '../src/shared/banque-scenarios-pur';

const fichier = process.env.BANC_SAUVEGARDE ?? '';
const brut = JSON.parse(readFileSync(fichier, 'utf8')) as { keys?: Record<string, unknown>; exportedAt?: string };
const cles = brut.keys ?? {};
const banque = banqueLue(cles.mnd_scenarios_wa);
const court = (t: string): string => { const s = t.replace(/\s+/g, ' ').trim(); return s.length > 70 ? `${s.slice(0, 69)}…` : s; };

console.log(`Sauvegarde du ${String(brut.exportedAt ?? '').slice(0, 10) || 'jour inconnu'} : ${banque.cas.length} cas dans la banque.`);
if (banque.cas.length === 0) {
  console.log('La banque est vide dans cette sauvegarde : rien a rejouer.');
  process.exit(0);
}
const p = passeLaBanque(banque, conseilDeLaMaison(cles.mnd_reponses_maison));
console.log(`${p.justes} valides tiennent · ${p.casses.length} ne tiennent plus · ${p.aReprendre.length} a reprendre · ${p.reprisAValider.length} repris a revalider · ${p.proposes} a valider`);
for (const x of p.casses) console.log(`CASSE      « ${court(x.cas.texte)} » : ${x.ecarts.join(' ; ')}`);
for (const x of p.aReprendre) console.log(`A REPRENDRE « ${court(x.cas.texte)} » : ${x.ecarts.join(' ; ')}${x.cas.note ? ` · attendu : ${court(x.cas.note)}` : ''}`);
for (const c of p.reprisAValider) console.log(`A REVALIDER « ${court(c.texte)} »`);
if (p.variantesJustes + p.variantesRatees.length > 0) {
  console.log(`Variantes : ${p.variantesJustes} comprises comme l original, ${p.variantesRatees.length} a renforcer (elles ne bloquent pas).`);
  for (const v of p.variantesRatees.slice(0, 40)) console.log(`A RENFORCER « ${court(v.variante)} » (cas « ${court(v.cas.texte)} ») : ${v.ecarts.join(' ; ')}`);
}
console.log(p.casses.length === 0 ? '\nLes cas valides tiennent.' : `\n${p.casses.length} CAS VALIDE(S) NE TIENNENT PLUS : ne pas mettre en ligne.`);
process.exit(p.casses.length ? 1 : 0);
