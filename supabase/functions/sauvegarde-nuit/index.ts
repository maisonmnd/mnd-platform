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
const JOURS_DE_GARDE = 60;

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

  /* ── ③ Le coffre se taille — les clichés trop vieux s'en vont ────── */
  const limite = new Date(Date.now() - JOURS_DE_GARDE * 86_400_000)
    .toLocaleDateString('en-CA', { timeZone: TZ });
  const { data: fichiers } = await sb.storage.from('sauvegardes').list('', { limit: 1000 });
  const perimes = (fichiers ?? [])
    .map((f) => f.name)
    .filter((n) => /^maison-\d{4}-\d{2}-\d{2}\.json$/.test(n) && n.slice(7, 17) < limite);
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
