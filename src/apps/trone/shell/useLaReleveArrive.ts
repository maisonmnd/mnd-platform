import { useEffect } from 'react';
import { useAuth, useMaTete } from '../../../shared/auth';
import { useBranch } from '../../../shared/branches';
import { gardeLEcriture } from '../../../shared/ecriture-automatique';
import { registreRhStore, useRegistreRh } from '../../../shared/rh';
import type { Candidature, LigneRh, Poste } from '../../../shared/rh-pur';
import {
  PROMOTION, TABLE_DE_LA_RELEVE, dossierNettoye, idDeLaCandidatureReleve, idDuPosteReleve, nomEntierDuDossier,
  parcoursPropose, titreDuPosteReleve,
} from '../../../shared/releve-pur';
import { supabase } from '../../../shared/supabase';
import { tablePrete } from '../../../shared/sync';

/* ══ LA BOÎTE DE LA RELÈVE SE VIDE DANS LE RECRUTEMENT — 15 octobre 2026 ══
   Le site de l'Académie dépose chaque dossier dans `releve_candidatures`
   (0131), que le public ne relit jamais. Quand la DIRECTION ouvre le Trône,
   chaque dossier devient une candidature du Recrutement, au poste de la
   promotion (créé au premier dossier), source « Le site », étape « Reçue ».

   L'IDENTIFIANT EST POSÉ DEPUIS CELUI DE LA BOÎTE : deux postes ouverts en
   même temps ne font pas deux candidatures, et une copie déjà faite ne se
   refait pas. LA BOÎTE NE SE VIDE QUE DE CE QUE LE SERVEUR TIENT DÉJÀ : une
   ligne n'est effacée de la boîte qu'une fois sa candidature lue dans `rh`
   au serveur. Un réseau qui coupe entre les deux laisse la ligne dans la
   boîte, et le passage suivant la reprend. Personne d'autre que la
   direction ne lit la boîte (0131) : pour les autres, ce crochet se tait. */
export function useLaReleveArrive(): void {
  const { session } = useAuth();
  const { tete } = useMaTete();
  const { branch } = useBranch();
  const registre = useRegistreRh();
  const souverain = tete?.role === 'souverain';

  useEffect(() => {
    if (!session || !souverain || !supabase || !tablePrete('rh')) return;
    const sb = supabase;
    let vivant = true;
    void (async () => {
      const { data, error } = await sb.from(TABLE_DE_LA_RELEVE).select('id, branch_id, data, created_at').order('created_at').limit(200);
      if (error || !vivant || !data?.length) return;
      const lignes = data as { id: string; branch_id: string | null; data: unknown; created_at: string }[];
      const deja = new Set(registreRhStore.get().map((l) => l.id));
      const maintenant = new Date().toISOString();
      const neuves: LigneRh[] = [];
      for (const r of lignes) {
        const id = idDeLaCandidatureReleve(r.id);
        if (deja.has(id)) continue;
        const dossier = dossierNettoye(r.data);
        if (!dossier) continue;
        const promotion = String((r.data as { promotion?: unknown })?.promotion ?? PROMOTION.cle);
        const c: Candidature = {
          id, genre: 'candidature', branchId: r.branch_id || branch.id, creeLe: maintenant, creePar: 'Le site de l’Académie',
          nom: nomEntierDuDossier(dossier), telephone: dossier.telephone, source: 'site',
          recueLe: (r.created_at || maintenant).slice(0, 10), etape: 'recue', posteId: idDuPosteReleve(),
          releve: { promotion, dossier, duree: parcoursPropose(dossier) },
        };
        neuves.push(c);
      }
      if (neuves.length > 0 && vivant) {
        const posteId = idDuPosteReleve();
        const poste: Poste = {
          id: posteId, genre: 'poste', branchId: branch.id, creeLe: maintenant, creePar: 'Le site de l’Académie',
          titre: titreDuPosteReleve(), fonction: 'Apprentie', contrat: 'apprentissage', ouvertLe: maintenant.slice(0, 10), releve: PROMOTION.cle,
        };
        gardeLEcriture('la-releve', registreRhStore).set((prev) => {
          const liste = Array.isArray(prev) ? prev : [];
          const ont = new Set(liste.map((l) => l.id));
          const ajout = neuves.filter((l) => !ont.has(l.id));
          const avecPoste = ont.has(posteId) ? ajout : [poste, ...ajout];
          return avecPoste.length ? [...avecPoste, ...liste] : liste;
        });
      }
      /* Vider la boîte de ce que le serveur tient déjà. */
      const ids = lignes.map((r) => idDeLaCandidatureReleve(r.id));
      const { data: tenues, error: e2 } = await sb.from('rh').select('id').in('id', ids);
      if (e2 || !vivant) return;
      const auServeur = new Set(((tenues ?? []) as { id: string }[]).map((x) => x.id));
      const aRetirer = lignes.filter((r) => auServeur.has(idDeLaCandidatureReleve(r.id))).map((r) => r.id);
      if (aRetirer.length > 0) await sb.from(TABLE_DE_LA_RELEVE).delete().in('id', aRetirer);
    })();
    return () => { vivant = false; };
  }, [session, souverain, branch.id, registre.length]);
}
