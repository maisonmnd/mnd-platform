/* ══ « ENVOYER MAINTENANT », AU TRÔNE — 18 novembre 2026 ══════════════════
   La règle est `shared/envoyer-maintenant-pur.ts`. Ici, le dépôt, par le
   chemin que le Trône prend déjà pour poser une ligne en salle (le merci de
   la marraine, la prochaine séance de l'abonnée) :
     · le facteur doit vivre : c'est lui seul qui porte ;
     · la ligne s'INSÈRE, jamais ne s'écrase : la clé déjà prise (le passage
       vient de la déposer, ou une autre main), rien n'est réécrit, et
       l'appelant la fait partir par le geste de la salle ; une ligne déjà
       partie ne peut pas être remise « en attente » ;
     · pas par le magasin : sa poussée réécrirait la ligne entière un instant
       plus tard (voir l'en-tête de SalleDesEnvois) ; la ligne que le serveur
       renvoie s'applique comme le direct l'apporterait ;
     · le geste s'inscrit au journal, signé de qui a touché. */
import { supabase } from '../../../../shared/supabase';
import { appliqueCommeLeDirect, repereDuDirect } from '../../../../shared/sync';
import { facteurVivant, type ReglesDeLaSalle } from '../../../../shared/salle-des-envois';
import { idDeLaLigne, type Situation } from '../../../../shared/gerard-pur';
import { identiteCourante, inscrisLesGestes } from '../../../../shared/journal';
import { gesteDuMaintenant, ligneDuMaintenant } from '../../../../shared/envoyer-maintenant-pur';
import type { CerveauDeGerard } from '../../../../shared/assistant-lecture-pur';
import { envoisStore } from '../equipe/data';

/** Ce qu'il est advenu : partie (`parti`), clé déjà prise (`deja`, la ligne
    relue est au magasin), facteur muet, ligne que le passage ne déposerait
    pas (`ferme`), ou serveur en panne. */
export type IssueDuMaintenant = 'parti' | 'deja' | 'facteur-muet' | 'ferme' | 'panne';

type LigneDuServeur = { id: string; data: unknown; updated_at?: string };

export async function envoieLaLigneMaintenant(o: {
  cerveau: CerveauDeGerard;
  situation: Situation;
  reglagesGerard: unknown;
  branchId: string;
  regles: ReglesDeLaSalle;
  /** Qui a touché : le nom de la personne au clavier. */
  qui: string;
}): Promise<{ issue: IssueDuMaintenant; id: string }> {
  const id = idDeLaLigne(o.cerveau.ctx.aujourdhui, o.situation.clientId, 'whatsapp');
  const maintenant = Date.now();
  const ligne = ligneDuMaintenant({ ...o, maintenantMs: maintenant });
  if (!ligne) return { issue: 'ferme', id };
  const sb = supabase;
  if (!sb) {
    /* Sans serveur (poste de démonstration), le magasin est la seule vérité. */
    envoisStore.set((prev) => (prev.some((e) => e.id === id) ? prev : [...prev, ligne as unknown as (typeof prev)[number]]));
    return { issue: 'parti', id };
  }
  /* LE FACTEUR VIT-IL ? Lui seul porte : muet, rien ne se dépose. */
  const { data: facteur, error: errFacteur } = await sb.from('documents').select('data').eq('key', 'mnd_facteur').maybeSingle();
  if (errFacteur) return { issue: 'panne', id };
  if (!facteurVivant((facteur?.data as { vuLe?: string } | null)?.vuLe, Date.now())) return { issue: 'facteur-muet', id };

  const avant = repereDuDirect('envois', envoisStore.get().find((e) => e.id === id) ?? null);
  const { data, error } = await sb.from('envois').insert({ id, branch_id: ligne.branchId, data: ligne }).select('id, data, updated_at');
  if (error) {
    if ((error as { code?: string }).code !== '23505') return { issue: 'panne', id };
    /* LA CLÉ DÉJÀ PRISE : on relit la ligne pour que l'écran (et le geste de la salle) la voient. */
    const avantLaRelecture = repereDuDirect('envois', envoisStore.get().find((e) => e.id === id) ?? null);
    const { data: relue, error: errRelue } = await sb.from('envois').select('id, data, updated_at').eq('id', id).limit(1);
    if (errRelue) return { issue: 'panne', id };
    const vraie = (relue ?? [])[0] as LigneDuServeur | undefined;
    if (vraie) appliqueCommeLeDirect('envois', vraie, avantLaRelecture);
    return { issue: 'deja', id };
  }
  const ecrite = (data ?? [])[0] as LigneDuServeur | undefined;
  if (ecrite) appliqueCommeLeDirect('envois', ecrite, avant);
  void inscrisLesGestes([gesteDuMaintenant(ligne, identiteCourante(), o.cerveau.nomDe(o.situation.clientId))]);
  return { issue: 'parti', id };
}
