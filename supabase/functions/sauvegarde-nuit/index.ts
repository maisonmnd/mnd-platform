/* ═══════════════════════════════════════════════════════════════════
   SAUVEGARDE-NUIT — la photographie quotidienne de la Maison.

   Le 30 juillet, les formulaires de consultation ont disparu de la base et
   personne ne l'a su pendant trois semaines : l'export manuel des Paramètres
   lit ce que LE POSTE voit — quand le serveur perd une table, tous les
   postes s'alignent, et l'export d'après ne contient plus rien. Cette
   fonction photographie LE SERVEUR, chaque nuit, et range le cliché dans le
   compartiment privé `sauvegardes` (migration 0064) :

     ① elle appelle `sauvegarde_maison()` — la photographie DÉCOUVRE les
        tables, elle n'en connaît aucune par son nom : celle de demain sera
        dedans sans qu'on y pense ;
     ② elle écrit `maison-AAAA-MM-JJ.json` dans le coffre — un cliché par
        jour, réveil répété = même fichier réécrit, jamais de doublon ;
     ③ elle retire les clichés de plus de SOIXANTE jours — un coffre sans
        fond finit par coûter sans servir ; soixante nuits couvrent le plus
        long silence qu'a connu la Maison (trois semaines), trois fois.

   AUCUN SECRET ICI. Déploiement : Supabase → Edge Functions → New function
   « sauvegarde-nuit » → coller CE FICHIER ENTIER → Deploy (désactiver
   « Verify JWT »). Puis le cron : `0 2 * * *` — 2 h UTC, 3 h à Cotonou,
   la maison dort. Voir docs/BRANCHER-ENVOIS.md, étape 6.
   ═══════════════════════════════════════════════════════════════════ */

import { createClient } from 'npm:@supabase/supabase-js@2';

const TZ = 'Africa/Porto-Novo';

/* ── LA GARDE, RETAILLÉE LE 29 AOÛT 2026 ──────────────────────────────
   Soixante clichés de TOUTE la base, un par nuit : le coffre pesait soixante
   fois la Maison. Sur le plan gratuit de Supabase, qui n'accorde qu'un
   gigaoctet de fichiers, cela suffisait à faire dépasser le quota à lui seul
   — et un projet restreint, c'est Le Trône et Ma Couronne éteints.

   ON NE RACCOURCIT PAS LA MÉMOIRE, ON L'ÉCLAIRCIT. Le danger que ces clichés
   couvrent est un silence : le 30 juillet, les formulaires de consultation ont
   disparu et personne ne l'a su pendant TROIS SEMAINES. Ce qu'il faut donc
   garder, ce n'est pas soixante nuits d'affilée, c'est de la profondeur.

     · les QUATORZE dernières nuits, toutes — c'est là qu'on répare vite ;
     · au-delà, une seule par semaine, jusqu'à SOIXANTE jours — même
       profondeur qu'avant, trois fois le plus long silence connu.

   Vingt clichés au lieu de soixante : deux tiers du coffre rendus, sans
   perdre un seul jour de portée. */
const JOURS_DE_GARDE = 60;
/** Au-delà, on n'en garde qu'un par semaine. */
const NUITS_ENTIERES = 14;
/** Le jour de la semaine qu'on garde au loin (1 = lundi). */
const JOUR_GARDE = 1;

Deno.serve(async (req) => {
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const urlBase = Deno.env.get('SUPABASE_URL') ?? '';

  /* Seul le cron (armé de la clé service) déclenche : la photographie porte
     toute la Maison. */
  if (!service || (req.headers.get('authorization') ?? '') !== `Bearer ${service}`) {
    return new Response(JSON.stringify({ erreur: 'réservé au cron' }), { status: 401 });
  }

  const sb = createClient(urlBase, service);

  /* ── ① La photographie — le serveur se lit lui-même ─────────────── */
  const { data, error } = await sb.rpc('sauvegarde_maison');
  if (error) {
    return new Response(JSON.stringify({ erreur: `photographie : ${error.message}` }), { status: 500 });
  }

  /* ── ② Le dépôt au coffre — un cliché par jour ───────────────────── */
  const jour = new Date().toLocaleDateString('en-CA', { timeZone: TZ });
  const nom = `maison-${jour}.json`;
  const corps = JSON.stringify(data);
  const { error: errUp } = await sb.storage.from('sauvegardes').upload(nom, corps, {
    contentType: 'application/json',
    upsert: true,
  });
  if (errUp) {
    return new Response(JSON.stringify({ erreur: `dépôt : ${errUp.message}` }), { status: 500 });
  }

  /* ── ③ Le coffre s'éclaircit ──────────────────────────────────────
     Un cliché s'en va s'il est plus vieux que la garde, OU s'il est passé les
     quatorze nuits pleines sans être le jour de semaine qu'on garde au loin.

     LE CLICHÉ DE CETTE NUIT NE S'EFFACE JAMAIS, quel que soit le jour où l'on
     est : la règle ne s'applique qu'au PASSÉ. Sans cette borne, un déploiement
     un mardi effacerait la photographie qu'on vient tout juste de prendre. */
  const jourDe = (n: string) => n.slice(7, 17);
  const limite = new Date(Date.now() - JOURS_DE_GARDE * 86_400_000)
    .toLocaleDateString('en-CA', { timeZone: TZ });
  const seuilPlein = new Date(Date.now() - NUITS_ENTIERES * 86_400_000)
    .toLocaleDateString('en-CA', { timeZone: TZ });

  const { data: fichiers } = await sb.storage.from('sauvegardes').list('', { limit: 1000 });
  const perimes = (fichiers ?? [])
    .map((f) => f.name)
    .filter((n) => /^maison-\d{4}-\d{2}-\d{2}\.json$/.test(n))
    .filter((n) => {
      const j = jourDe(n);
      if (j === jour) return false;          // jamais celui de cette nuit
      if (j < limite) return true;           // trop vieux, tout court
      if (j >= seuilPlein) return false;     // dans les quatorze nuits pleines
      /* Entre les deux : on ne garde que le jour de semaine choisi. */
      return new Date(`${j}T12:00:00Z`).getUTCDay() !== JOUR_GARDE;
    });
  if (perimes.length > 0) await sb.storage.from('sauvegardes').remove(perimes);

  return new Response(
    JSON.stringify({
      cliche: nom,
      octets: corps.length,
      lignes: (data as { lignes?: number }).lignes ?? null,
      tables: (data as { nb_tables?: number }).nb_tables ?? null,
      retires: perimes.length,
    }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );
});
