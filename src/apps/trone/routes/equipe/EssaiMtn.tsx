import { useEffect, useMemo, useState } from 'react';
import { Button, Field, Input, alerte, demande, toast } from '../../../../ds/components';
import { useBranch } from '../../../../shared/branches';
import { fmtMoney } from '../../../../shared/currency';
import { useAuth, useStaff as useMaTete } from '../../../../shared/auth';
import { expensesStore, type Expense } from '../../../../shared/finance';
import { numeroDit, quandDit } from '../../../../shared/paie-du-5-pur';
import {
  CE_QUE_CLORE_UN_TEST, ETAT_DE_L_ENVOI_DIT, MONTANT_ESSAI, MONTANT_ESSAI_MAX, bilanDeLEssai, depenseDeLEssai,
  equipeDeLEssai, idDeLEssai, lePlusEnSouffrance, nomConcorde, pourquoiPasLEssai, raisonDite, type EnvoiMtn, type LectureMtn,
} from '../../../../shared/paie-par-mtn-pur';
import { useStaff } from './data';
import { asArray, jourLocalDe } from './payroll';
import { clore, lisChezMtn, renvoie, teste, useEnvoisMtn, useServeurMtn } from './paie-par-mtn';
import { ceQuiSeDitDeLEnvoi, derniersParPersonne } from './PaieParMtn';
import './paie-du-5.css';

/* ══ LE TEST DE 100 F · 5 novembre 2026, lot 2 de la paie ══════════════
   « Je commencerai plus tôt le mois prochain et je ferai un test pour voir
   comment ça marche dans le logiciel » (Yéman). Au sélecteur : offerts par
   la Maison, l'équipe salariée. Un bouton, le jour qu'elle veut avant le 5 :
   100 F (500 F au plus) vers le numéro MTN de chaque fiche, aussitôt, après
   son toucher. Chaque ligne revient avec la réponse de MTN et le nom du
   numéro chez MTN ; quand tout a répondu, la dépense « Essai de paie MTN »
   s'inscrit une fois. */

const PILL: Record<string, string> = { recu: 'p5-pill--fait', refuse: 'p5-pill--alerte' };

export default function EssaiMtn() {
  const serveur = useServeurMtn();
  const { branch, currency } = useBranch();
  const [fiches] = useStaff();
  const maTete = useMaTete();
  const { session } = useAuth();
  const qui = (maTete?.name ?? '').trim() || (session?.user?.email ?? '').trim();
  const F = (n: number) => fmtMoney(n, currency);
  const [montant, setMontant] = useState(String(MONTANT_ESSAI));
  const [noms, setNoms] = useState<LectureMtn | null>(null);
  const [part, setPart] = useState(false);
  const [fermeture, setFermeture] = useState(false);
  const { envois, relis: relisLeRegistre } = useEnvoisMtn({ essais: true, actif: serveur.pret });

  const m = Number.parseInt(montant, 10);
  const equipe = useMemo(() => equipeDeLEssai(asArray(fiches).filter((f) => f.branchId === branch.id), Number.isFinite(m) ? m : 0), [fiches, branch.id, m]);
  const dernierId = envois[0]?.essai_id ?? null;
  const duDernier: EnvoiMtn[] = useMemo(() => derniersParPersonne(envois.filter((e) => e.essai_id === dernierId)), [envois, dernierId]);
  const bilan = bilanDeLEssai(duDernier);

  /* La dépense du test, une seule fois, quand tout a répondu. */
  useEffect(() => {
    if (!dernierId) return;
    const d = depenseDeLEssai({ essaiId: dernierId, branchId: branch.id, bilan, jour: jourLocalDe() });
    if (!d || asArray<Expense>(expensesStore.get()).some((x) => x.id === d.id)) return;
    expensesStore.set((prev) => [d as Expense, ...asArray<Expense>(prev)]);
    toast(`Dépense inscrite : ${d.label}, ${F(d.amountXof)}.`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dernierId, bilan.fini, bilan.recuXof, branch.id]);

  const envoyer = async () => {
    const refus = pourquoiPasLEssai(m, equipe.partent.length);
    if (refus) { alerte(refus); return; }
    if (!qui) { alerte('Le test dit qui l’envoie : ce compte n’a pas de nom. Reconnectez-vous.'); return; }
    if (!await demande({
      quoi: 'Le test de la paie MTN',
      titre: `Envoyer ${F(m)} à ${equipe.partent.length} personne${equipe.partent.length > 1 ? 's' : ''} ?`,
      dit: `Chacun reçoit ${F(m)} sur le numéro MTN de sa fiche, tout de suite. Offerts par la Maison : ${F(m * equipe.partent.length)} en dépense « Essai de paie MTN ».`,
      suite: `Envoyé par ${qui}. Le Trône lit d’abord chez MTN le nom de chaque numéro.`,
      accepter: 'Envoyer le test',
      refuser: 'Pas maintenant',
    })) return;
    setPart(true);
    try {
      const lu = await lisChezMtn(equipe.partent.map((x) => x.msisdn));
      if (lu.erreur || !lu.le) { alerte(lu.erreur ?? 'MTN n’a pas répondu : rien n’est parti.'); return; }
      const lecture: LectureMtn = { le: lu.le, soldeXof: lu.soldeXof ?? null, numeros: lu.numeros ?? {} };
      setNoms(lecture);
      const inactifs = equipe.partent.filter((x) => lecture.numeros[x.msisdn]?.actif === false);
      const partent = equipe.partent.filter((x) => lecture.numeros[x.msisdn]?.actif !== false);
      const total = partent.length * m;
      if (lecture.soldeXof != null && lecture.soldeXof < total) {
        alerte(`Le compte de paie MTN n’a que ${F(lecture.soldeXof)} : il faut ${F(total)}. Rien n’est parti.`);
        return;
      }
      if (!partent.length) { alerte('MTN dit qu’aucun de ces numéros n’a de compte MoMo actif. Rien n’est parti.'); return; }
      const r = await teste(idDeLEssai(Date.now()), partent);
      if (r.erreur) { alerte(r.erreur); return; }
      toast(`Test parti : ${r.inscrits?.length ?? 0} envoi${(r.inscrits?.length ?? 0) > 1 ? 's' : ''} de ${F(m)}.`);
      if (inactifs.length) alerte(`${inactifs.map((x) => x.nom).join(', ')} : MTN dit que le numéro n’a pas de compte MoMo actif. Pas d’envoi pour ${inactifs.length > 1 ? 'eux' : 'cette fiche'}.`, 12000);
      if (r.refuses?.length) alerte(`Le serveur a refusé ${r.refuses.length} envoi${r.refuses.length > 1 ? 's' : ''} : ${r.refuses.map((x) => x.erreur).join(' ; ')}.`, 12000);
    } finally {
      setPart(false);
      relisLeRegistre();
    }
  };

  const renvoyer = async (e: EnvoiMtn) => {
    if (!await demande({
      quoi: 'Le test de la paie MTN',
      titre: `Renvoyer ${F(e.montant_xof)} à ${e.nom} ?`,
      dit: `MTN avait refusé : ${raisonDite(e.raison)}. Le renvoi part tout de suite, avec une nouvelle référence.`,
      scelle: 'Vérifiez d’abord le numéro sur sa fiche.',
      accepter: 'Renvoyer',
      refuser: 'Ne rien faire',
    })) return;
    const fiche = asArray(fiches).find((f) => f.id === e.employee_id);
    const r = await renvoie(e.reference, fiche?.mobileMoney?.operateur === 'MTN' ? fiche.mobileMoney.numero : undefined);
    if (r.erreur) { alerte(r.erreur); return; }
    relisLeRegistre();
  };

  /* MTN SE TAIT : LE BLOC SE FERME, ET SE ROUVRE D'UN GESTE NOMMÉ — 9 novembre
     2026. Un envoi sans réponse finale comptait « en cours » pour toujours :
     aucun second test (les 500 F après un refus à 100 F) ne partait plus, et
     le bouton éteint ne disait rien. La direction clôt le test, à son nom. */
  const muet = lePlusEnSouffrance(duDernier);
  const depuis = muet ? quandDit(muet.envoye_le ?? muet.programme_le, true) : '';

  const cloreLeTest = async () => {
    if (!dernierId) return;
    if (!await demande({
      quoi: 'Le test de la paie MTN',
      titre: `Clore le test · ${bilan.enCours} envoi${bilan.enCours > 1 ? 's' : ''} sans réponse ?`,
      dit: `Ils seront marqués « annulé », au nom de ${qui || 'la direction'}, avec la date.`,
      suite: CE_QUE_CLORE_UN_TEST,
      accepter: 'Clore le test',
      refuser: 'Attendre MTN',
      dur: true,
    })) return;
    setFermeture(true);
    try {
      const r = await clore(dernierId);
      if (r.erreur) { alerte(r.erreur); return; }
      toast(`Test clos : ${r.clos ?? 0} envoi${(r.clos ?? 0) > 1 ? 's' : ''} sans réponse.`);
    } finally {
      setFermeture(false);
      relisLeRegistre();
    }
  };

  const nomDit = (e: EnvoiMtn) => {
    const nom = noms?.numeros?.[e.msisdn]?.nom;
    if (!nom) return '';
    return nomConcorde(e.nom, nom) === 'differe' ? ` · MTN dit ${nom} : à vérifier avant le 5` : ` · nom chez MTN ${nom}`;
  };

  return (
    <section className="p5" aria-label="Le test de la paie MTN">
      <div className="p5__haut">
        <span className="p5__sourcil">La paie par MTN · avant le 5</span>
        <h3 className="p5__titre">Le test de {F(MONTANT_ESSAI)}</h3>
        <p className="p5__doux">
          {F(MONTANT_ESSAI)} vers le numéro MTN de chaque fiche de l’équipe salariée, tout de suite, après votre toucher. Offerts par la Maison, en dépense « Essai de paie MTN » ; les bulletins ne bougent pas. Si MTN refuse un montant trop petit, relancez à {F(MONTANT_ESSAI_MAX)}.
        </p>
      </div>
      {!serveur.pret ? (
        <div className="p5__note"><span>{serveur.charge ? 'Le test s’allume quand les six clés MTN sont posées sur le serveur.' : 'Lecture du serveur MTN…'}</span></div>
      ) : (
        <>
          <div className="p5__soldes">
            <span><b>{equipe.partent.length}</b> fiche{equipe.partent.length > 1 ? 's' : ''} avec un numéro MTN</span>
            {equipe.sansNumero.length > 0 && <span>Sans numéro MTN : {equipe.sansNumero.join(', ')} (à taper sur leur fiche)</span>}
            {equipe.pasMtn.length > 0 && <span>Jamais par MTN : {equipe.pasMtn.map((x) => `${x.nom} (${x.operateur})`).join(', ')}</span>}
            {noms?.soldeXof != null && <span>Compte de paie MTN : {F(noms.soldeXof)}, lu le {quandDit(noms.le)}</span>}
          </div>
          <div className="p5__pied">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'end' }}>
              <Field label="Montant par personne (F)">
                <Input id="essai-mtn-montant" inputMode="numeric" value={montant} onChange={(e) => setMontant(e.target.value.replace(/\D/g, ''))} style={{ maxWidth: 120 }} />
              </Field>
              {/* LE BOUTON NE S'ÉTEINT PLUS DEVANT UNE ÉQUIPE VIDE : un bouton
                  éteint ne dit rien, et c'est exactement ce qu'on a lu comme
                  « rien ne se passe ». Le clic dit pourquoi (pourquoiPasLEssai). */}
              <Button variant="copper" disabled={part} onClick={() => void envoyer()}>
                {part ? 'Le test part…' : `Envoyer le test à ${equipe.partent.length} personne${equipe.partent.length > 1 ? 's' : ''}`}
              </Button>
            </div>
            {equipe.partent.length === 0 && !part && (
              <p className="p5__doux" style={{ marginTop: 8 }}>
                Rien ne peut partir : aucune fiche de cette branche n’a de numéro MTN. Il se tape sur la fiche
                (Équipe › Personnel), champ « Numéro mobile money (paie) », opérateur MTN.
              </p>
            )}
            {bilan.enCours > 0 && dernierId && (
              <p className="p5__doux" style={{ marginTop: 8 }}>
                {bilan.enCours} envoi{bilan.enCours > 1 ? 's' : ''} sans réponse de MTN{depuis ? ` depuis le ${depuis}` : ''}.
                Le prochain test attend qu’ils soient clos.{' '}
                <Button size="sm" variant="ghost" disabled={fermeture} onClick={() => void cloreLeTest()}>
                  {fermeture ? 'On clôt…' : 'Clore ce test'}
                </Button>
              </p>
            )}
            {duDernier.length > 0 && (
              <>
                <p className="p5__doux">
                  Dernier test : {bilan.recus} reçu{bilan.recus > 1 ? 's' : ''}, {bilan.refuses} refusé{bilan.refuses > 1 ? 's' : ''}{bilan.enCours ? `, ${bilan.enCours} en attente de MTN` : ''} · {F(bilan.recuXof)} envoyés.
                </p>
                <ul className="p5__lots">
                  {duDernier.map((e) => (
                    <li key={e.reference} style={{ display: 'grid', gap: 4 }}>
                      <span style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'baseline', justifyContent: 'space-between' }}>
                        <span><b>{e.nom}</b> · {F(e.montant_xof)} · {numeroDit(e.msisdn)}</span>
                        <span className={`p5-pill ${PILL[e.etat] ?? 'p5-pill--attente'}`}>{ETAT_DE_L_ENVOI_DIT[e.etat]}</span>
                      </span>
                      <small>{ceQuiSeDitDeLEnvoi(e)}{nomDit(e)}</small>
                      {e.etat === 'refuse' && <span><Button size="sm" variant="ghost" onClick={() => void renvoyer(e)}>Renvoyer avec votre toucher</Button></span>}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </>
      )}
    </section>
  );
}
