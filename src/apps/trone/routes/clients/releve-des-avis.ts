import { useEffect, useState } from 'react';
import { supabase } from '../../../../shared/supabase';
import type { AvisDuReleve } from '../../../../shared/avis-fiches-pur';

/* ══ LE RELEVÉ DES AVIS GOOGLE, LU PAR LE TRÔNE ══════════════════════════
   Ce que `avis-google-releve` pose dans `mnd_avis_google` deux fois par
   jour : la note, le nombre, la fiche Google, les avis du moment.

   20 octobre 2026 : sorti de VitrineSite, où il vivait seul, parce que trois
   écrans le lisent désormais : le choix des avis du site, l'onglet « Les
   avis Google » et la fiche de la cliente. Les champs ajoutés par le relevé
   2026-10-20-b (`publieLe`, `ref`, `lien`) passent tels quels. */

export type ReleveDesAvis = { note: number; nombre: number; le?: string; fiche?: string; avis: AvisDuReleve[] };

export function useReleveDesAvis(): ReleveDesAvis | null {
  const [releve, setReleve] = useState<ReleveDesAvis | null>(null);
  useEffect(() => {
    let vivant = true;
    if (!supabase) return;
    void supabase.from('documents').select('data,updated_at').eq('key', 'mnd_avis_google').maybeSingle()
      .then(({ data }) => {
        const d = (data as { data?: { note?: number; nombre?: number; avis?: AvisDuReleve[]; fiche?: string }; updated_at?: string } | null);
        const liste = Array.isArray(d?.data?.avis) ? d.data.avis.filter((a) => a && typeof a.auteur === 'string' && typeof a.texte === 'string') : [];
        /* 19 octobre 2026 : le lien de la fiche, pour « Ouvrir l'avis sur Google ». */
        const fiche = typeof d?.data?.fiche === 'string' ? d.data.fiche : undefined;
        if (vivant && d?.data && Number(d.data.note) > 0) setReleve({ note: Number(d.data.note), nombre: Number(d.data.nombre) || 0, le: d.updated_at, fiche, avis: liste });
      });
    return () => { vivant = false; };
  }, []);
  return releve;
}
