import { useState } from 'react';
import { Button, toast } from '../../../../../ds/components';
import { useSecretariat } from '../../../../../shared/secretariat';
import { aujourdhui, administratives, clotureLAnnee, cloturesDe, courriersDe, demarchesDe } from '../../../../../shared/secretariat-admin';
import {
  anneesDesArchives, dateCourte, DUREES_DE_CONSERVATION, ETATS_ARRIVE, ETATS_DEPART, voit, type Courrier, type Demarche, type Qui,
} from '../../../../../shared/secretariat-admin-pur';
import { useNomDuCompte } from './_admin';

/* ══ LES ARCHIVES — 14 octobre 2026 ══════════════════════════════════
   Une année se ferme (la direction) : son courrier et ses démarches
   terminées ne bougent plus, et la base le tient (0129). Le registre de
   l'année se télécharge en PDF, à ranger dans « Maison MND › 99 Archives »
   du Drive. Les durées de conservation se disent ; rien ne s'efface seul. */

const plat = (t: string) => t.replace(/ɔ/g, 'o').replace(/Ɔ/g, 'O').replace(/ɛ/g, 'e').replace(/Ɛ/g, 'E').replace(/ɖ/g, 'd').replace(/Ɖ/g, 'D');

async function registreEnPdf(annee: number, courriers: Courrier[], demarches: Demarche[]): Promise<void> {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  let y = 18;
  const page = () => { doc.addPage(); y = 18; };
  const ligne = (cols: { x: number; t: string; w: number }[], gras = false) => {
    doc.setFont('helvetica', gras ? 'bold' : 'normal');
    const lignes = cols.map((c) => doc.splitTextToSize(plat(c.t), c.w) as string[]);
    const h = Math.max(...lignes.map((l) => l.length)) * 4.2 + 1.5;
    if (y + h > 285) page();
    cols.forEach((c, i) => doc.text(lignes[i], c.x, y));
    y += h;
    doc.setDrawColor(220); doc.line(14, y - 2.5, 196, y - 2.5);
  };
  doc.setFont('helvetica', 'bold'); doc.setFontSize(15); doc.setTextColor(30, 33, 80);
  doc.text(`Maison MND · Registre du secrétariat ${annee}`, 14, y); y += 7;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(90);
  doc.text(`Édité le ${dateCourte(aujourdhui())}. ${courriers.length} courrier${courriers.length > 1 ? 's' : ''}, ${demarches.length} démarche${demarches.length > 1 ? 's' : ''} terminée${demarches.length > 1 ? 's' : ''}.`, 14, y); y += 9;
  doc.setTextColor(30); doc.setFontSize(9);
  const tete = [{ x: 14, t: 'N°', w: 24 }, { x: 39, t: 'Date', w: 22 }, { x: 62, t: 'De / À', w: 40 }, { x: 103, t: 'Objet', w: 70 }, { x: 174, t: 'État', w: 22 }];
  doc.setFontSize(12); doc.setFont('helvetica', 'bold'); doc.text('Le courrier', 14, y); y += 6; doc.setFontSize(9);
  ligne(tete, true);
  for (const c of courriers) {
    const etat = c.sens === 'arrive' ? ETATS_ARRIVE[c.etat as keyof typeof ETATS_ARRIVE] : ETATS_DEPART[c.etat as keyof typeof ETATS_DEPART];
    ligne([{ ...tete[0], t: c.numero }, { ...tete[1], t: dateCourte(c.date) }, { ...tete[2], t: c.correspondant }, { ...tete[3], t: c.objet || '' }, { ...tete[4], t: etat ?? '' }]);
  }
  if (demarches.length) {
    y += 6; if (y > 270) page();
    doc.setFontSize(12); doc.setFont('helvetica', 'bold'); doc.text('Les démarches terminées', 14, y); y += 6; doc.setFontSize(9);
    for (const d of demarches) ligne([{ x: 14, t: d.termineeLe ? dateCourte(d.termineeLe) : '', w: 24 }, { x: 39, t: d.titre, w: 90 }, { x: 131, t: d.aupres, w: 65 }]);
  }
  doc.save(`Registre du secretariat ${annee}.pdf`);
}

export function LesArchives({ qui, branchId }: { qui: Qui; branchId: string }) {
  const [lignes] = useSecretariat();
  const [aClore, setAClore] = useState<number | null>(null);
  const nomDe = useNomDuCompte();
  const jour = aujourdhui();
  const anneeEnCours = parseInt(jour.slice(0, 4), 10);
  const clotures = cloturesDe(lignes);
  const annees = anneesDesArchives(administratives(lignes), jour);
  return (
    <div className="sad-onglet">
      <div className="sad-liste">
        {annees.map((a) => {
          const courriers = courriersDe(lignes).filter((c) => c.date?.startsWith(String(a)) && voit(c, qui)).sort((x, y) => x.numero.localeCompare(y.numero));
          const demarches = demarchesDe(lignes).filter((d) => d.etat === 'terminee' && d.termineeLe?.startsWith(String(a)) && voit(d, qui));
          const close = clotures.find((c) => c.annee === a);
          const arrives = courriers.filter((c) => c.sens === 'arrive').length;
          return (
            <div key={a} className="sad-annee">
              <div className="sad-annee__tete">
                <b>{a}</b>
                <span className="sad-doux">{arrives} arrivé{arrives > 1 ? 's' : ''} · {courriers.length - arrives} parti{courriers.length - arrives > 1 ? 's' : ''} · {demarches.length} démarche{demarches.length > 1 ? 's' : ''} terminée{demarches.length > 1 ? 's' : ''}</span>
                <span className={`sad-badge${close ? ' est-fait' : ''}`}>{close ? `close le ${dateCourte(close.closeLe)}${close.closePar ? ` par ${nomDe(close.closePar)}` : ''}` : a === anneeEnCours ? 'en cours' : 'ouverte'}</span>
              </div>
              <div className="sec-actions">
                <Button size="sm" variant="ghost" onClick={() => void registreEnPdf(a, courriers, demarches).catch(() => toast('Le registre n’a pas pu se faire.'))}>Registre {a} en PDF</Button>
                {qui.direction && !close && a < anneeEnCours && (aClore === a ? (
                  <>
                    <Button size="sm" variant="copper" onClick={() => { clotureLAnnee(branchId, a, qui.moi); setAClore(null); toast(`${a} est close.`); }}>Confirmer : clore {a}</Button>
                    <Button size="sm" variant="ghost" onClick={() => setAClore(null)}>Non</Button>
                  </>
                ) : <Button size="sm" variant="ghost" onClick={() => setAClore(a)}>Clore {a}</Button>)}
              </div>
            </div>
          );
        })}
      </div>
      <section className="sad-groupe">
        <h3 className="sad-mois">Combien de temps on garde</h3>
        <div className="sad-liste">
          {DUREES_DE_CONSERVATION.map((d) => (
            <div key={d.quoi} className="sad-duree"><b>{d.duree}</b><span>{d.quoi}</span><small>{d.source}</small></div>
          ))}
        </div>
        <p className="sad-doux">Rien ne s’efface tout seul : à la fin de la durée, la direction décide. Le registre d’une année se range dans « Maison MND › 99 Archives » du Drive.</p>
      </section>
    </div>
  );
}
