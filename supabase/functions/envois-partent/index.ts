/* ══════════════════════════════════════════════════════════════════
   ENVOIS-PARTENT — le facteur de la salle d'attente.

   « Est-ce possible d'intercepter un message qui part vers chez un client ?
   D'arrêter l'envoi à cause de l'heure tardive ou autre raison, erreur…
   Besoin de voir immédiatement les nouveaux messages qui sont prêts à partir
   dans les 5 à 10 min à venir » (Yéman, 2 octobre 2026). Maquette
   `maquette-la-salle-d-attente-des-envois.html`, validée.

   Les fonctions planifiées (confirmation-rdv, rappels-j1, avis-google) ne
   s'adressent plus à la cliente : elles DÉPOSENT leur message dans le
   journal des envois, statut « en-attente », avec son heure de départ et son
   colis. Ce facteur, réveillé CHAQUE MINUTE par le cron :
     ① dit qu'il est vivant (`documents`, clé `mnd_facteur`) : tant qu'il se
        tait plus de cinq minutes, les fonctions envoient comme avant plutôt
        que de déposer des messages que personne ne porterait ;
     ② prévient le personnel, sur le téléphone, de ce qui part dans les dix
        minutes, une fois par message ;
     ③ porte ce dont l'heure est venue, jamais pendant les heures calmes
        (20 h à 8 h par défaut) sauf si une main a dit « maintenant » ;
     ④ RELIT le rendez-vous avant de porter : annulé, déplacé, disparu ou
        passé, le message ne part pas et le journal dit pourquoi ;
     ⑤ ne porte chaque message qu'UNE fois : il le prend en main par une
        écriture conditionnelle (« en-attente » devient « en-envoi »), que deux
        réveils simultanés ne peuvent pas gagner tous les deux.

   Un message RETENU depuis le Trône n'est plus « en-attente » : le facteur ne
   le voit pas. C'est toute la règle, et elle tient en une ligne de filtre.

   LE CALCUL DES HEURES EST RECOPIÉ de `src/shared/salle-des-envois.ts` (une
   fonction Edge ne lit rien du dépôt) ; `verifie-la-salle-des-envois` tient
   les deux ensemble.

   AUCUN SECRET ICI. Tout vient de l'environnement de la fonction
   (supabase secrets set …), ce fichier vit dans un dépôt public.

   Déploiement : Supabase → Edge Functions → New function « envois-partent »
   → coller CE FICHIER ENTIER → Deploy. Puis le cron, chaque minute
   (`* * * * *`), EN PREMIER, avant de recoller les trois autres fonctions.
   ══════════════════════════════════════════════════════════════════ */

import { createClient } from 'npm:@supabase/supabase-js@2';

const VERSION = '2026-10-10-a';

/* ── LE CALCUL DES HEURES, recopié de src/shared/salle-des-envois.ts ── */
const DECALAGE_DU_SALON_H = 1;
type ReglesDeLaSalle = { salleMin: number; calmeDe: number; calmeA: number };
const REGLES_PAR_DEFAUT: ReglesDeLaSalle = { salleMin: 10, calmeDe: 20, calmeA: 8 };
function reglesDepuis(cfg: { salleMin?: unknown; calmeDe?: unknown; calmeA?: unknown } | null | undefined): ReglesDeLaSalle {
  const n = (v: unknown, min: number, max: number, defaut: number): number => {
    const x = Number(v);
    return Number.isFinite(x) && x >= min && x <= max ? Math.round(x) : defaut;
  };
  return {
    salleMin: n(cfg?.salleMin, 1, 120, REGLES_PAR_DEFAUT.salleMin),
    calmeDe: n(cfg?.calmeDe, 0, 23, REGLES_PAR_DEFAUT.calmeDe),
    calmeA: n(cfg?.calmeA, 0, 23, REGLES_PAR_DEFAUT.calmeA),
  };
}
const heureDuSalon = (ms: number): number => {
  const d = new Date(ms + DECALAGE_DU_SALON_H * 3_600_000);
  return d.getUTCHours() + d.getUTCMinutes() / 60 + d.getUTCSeconds() / 3600;
};
function dansLesHeuresCalmes(ms: number, r: ReglesDeLaSalle): boolean {
  if (r.calmeDe === r.calmeA) return false;
  const h = heureDuSalon(ms);
  return r.calmeDe < r.calmeA ? (h >= r.calmeDe && h < r.calmeA) : (h >= r.calmeDe || h < r.calmeA);
}
function pourquoiIlNePartPlus(
  e: { dateRdv?: string; heure?: string; type?: string },
  rdv: { date?: string; time?: string; status?: string } | null | undefined,
  maintenantMs: number,
): string | null {
  if (!rdv) return 'le rendez-vous n’existe plus';
  if (rdv.status === 'annulé') return 'le rendez-vous a été annulé';
  if ((rdv.date ?? '') !== (e.dateRdv ?? '') || (rdv.time ?? '') !== (e.heure ?? '')) return 'le rendez-vous a été déplacé';
  if (e.type === 'confirmation' && rdv.status !== 'confirmé') return 'le rendez-vous n’est plus confirmé';
  /* « Votre rendez-vous est demain » ne part pas le jour même : un rappel du
     soir retenu par les heures calmes arriverait au matin du rendez-vous. */
  if (e.type === 'rappel-j1' && new Date(maintenantMs + 3_600_000).toISOString().slice(0, 10) >= (rdv.date ?? '')) return 'trop tard pour un rappel de la veille';
  const h = /^\d{1,2}:\d{2}$/.test(rdv.time ?? '') ? (rdv.time as string).padStart(5, '0') : '23:59';
  const moment = Date.parse(`${rdv.date}T${h}:00+01:00`);
  if (Number.isFinite(moment) && moment <= maintenantMs) return 'l’heure du rendez-vous est passée';
  return null;
}
/* ── fin du calcul recopié ── */

/** Ce qu'il faut pour envoyer, déposé par la fonction qui a jugé. */
type Colis =
  | { genre: 'whatsapp'; numero: string; modele: string; composants: unknown[]; texteAuFil?: string; parQui?: string; rdvChampApres?: string }
  | { genre: 'push'; clientId: string; titre: string; corps: string; url?: string }
  | { genre: 'sms'; numero: string; texte: string };

type Ligne = {
  id: string;
  branch_id: string | null;
  data: {
    id: string; type?: string; canal?: string; statut?: string; branchId?: string;
    apptId?: string; clientId?: string; dateRdv?: string; heure?: string; prenom?: string;
    partA?: string; parLaMain?: boolean; annonceLe?: string; colis?: Colis;
    [k: string]: unknown;
  };
};

/** Les messages portés par réveil, au plus : une rafale de quarante rappels
    se porte en deux minutes, pas en une requête qui dépasserait son temps. */
const PAR_REVEIL = 30;
/** On prévient le personnel de ce qui part dans ce délai. */
const ANNONCE_MS = 10 * 60_000;

/* ══ UN ENVOI NE PEND PAS, UNE LIGNE PRISE NE RESTE PAS PRISE — 10 octobre 2026 ══
   Revue de nuit. Les appels à Meta, à push-notify et à Twilio partaient sans
   délai maximal : un appel qui pendait jusqu'à la limite de la fonction la
   tuait, et la ligne déjà passée « en-envoi » le restait POUR TOUJOURS (le
   facteur ne relit que « en-attente », les fonctions qui déposent ne
   retentent que « échec » et « périmé »). Chaque appel est donc borné à huit
   secondes, et chaque réveil commence par rendre « échec » (motif « envoi
   interrompu ») une ligne prise en main depuis plus de dix minutes : la
   fonction qui l'a déposée la retentera, comme un raté. */
const ENVOI_MAX_MS = 8_000;
const EN_ENVOI_PERIME_MS = 10 * 60_000;

const TYPE_DIT: Record<string, string> = {
  confirmation: 'Confirmation', 'rappel-j1': 'Rappel de la veille', 'reprise-j3': 'Reprise proposée',
  'avis-google': 'Demande d’avis', 'fin-de-paquet': 'Fin de paquet',
};

Deno.serve(async (req) => {
  const service = (Deno.env.get('CLE_SERVICE') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '').trim();
  const urlBase = Deno.env.get('SUPABASE_URL') ?? '';
  /* Seul le cron (armé de la clé service) réveille le facteur : il lit des
     téléphones et écrit au journal. */
  const cleRecue = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
  if (!service || cleRecue !== service) {
    return new Response(
      JSON.stringify({ erreur: 'réservé au cron', attendueLg: service.length, recueLg: cleRecue.length }),
      { status: 401 },
    );
  }
  const sb = createClient(urlBase, service);
  const maintenantMs = Date.now();
  const maintenant = new Date(maintenantMs).toISOString();

  /* ① JE SUIS VIVANT. Les fonctions qui déposent lisent cette ligne. */
  await sb.from('documents').upsert({ key: 'mnd_facteur', data: { vuLe: maintenant, version: VERSION } });

  const { data: docs } = await sb.from('documents').select('key, data').in('key', ['mnd_auto_config', 'mnd_house_identity']);
  const regles = reglesDepuis(docs?.find((d) => d.key === 'mnd_auto_config')?.data as Record<string, unknown> | undefined);
  const nomMaison: string =
    ((docs?.find((d) => d.key === 'mnd_house_identity')?.data as { nom?: string } | undefined)?.nom ?? '').trim() || 'Maison MND';

  /* LES LIGNES PRISES ET JAMAIS RENDUES. L'heure de prise (`prisLe`) date la
     main ; une ligne prise avant ce jour n'en a pas, son dépôt en tient lieu.
     L'écriture ne passe que si la ligne est toujours « en-envoi ». */
  let interrompus = 0;
  const { data: prises } = await sb.from('envois').select('id, data')
    .eq('data->>statut', 'en-envoi').limit(100);
  for (const p of (prises ?? []) as { id: string; data: Record<string, unknown> }[]) {
    const depuis = Date.parse(String(p.data?.prisLe ?? p.data?.quand ?? p.data?.deposeLe ?? ''));
    if (Number.isFinite(depuis) && maintenantMs - depuis < EN_ENVOI_PERIME_MS) continue;
    const { data: rendue } = await sb.from('envois')
      .update({ data: { ...p.data, statut: 'échec', detail: 'envoi interrompu', quand: maintenant } })
      .eq('id', p.id).eq('data->>statut', 'en-envoi').select('id');
    if ((rendue ?? []).length > 0) interrompus++;
  }

  const { data: rows, error } = await sb.from('envois').select('id, branch_id, data')
    .eq('data->>statut', 'en-attente').limit(300);
  if (error) return new Response(JSON.stringify({ version: VERSION, erreur: error.message }), { status: 500 });
  const enSalle = (rows ?? []) as Ligne[];
  if (enSalle.length === 0) {
    return new Response(JSON.stringify({ version: VERSION, enSalle: 0, partis: 0, interrompus }), { headers: { 'content-type': 'application/json' } });
  }

  const partAde = (l: Ligne): number => Date.parse(l.data.partA ?? '');

  /* ② LE TÉLÉPHONE DU PERSONNEL, une fois par message, pour ce qui part
     dans les dix minutes. Un message né la nuit s'annonce donc au matin, dix
     minutes avant huit heures, et ne réveille personne à minuit. */
  const aAnnoncer = enSalle.filter((l) => !l.data.annonceLe && Number.isFinite(partAde(l)) && partAde(l) - maintenantMs <= ANNONCE_MS);
  let annonces = 0;
  if (aAnnoncer.length > 0) {
    const premier = aAnnoncer[0].data;
    const un = `${TYPE_DIT[premier.type ?? ''] ?? 'Message'}${premier.prenom ? ` · ${premier.prenom}` : ''}`;
    const corps = aAnnoncer.length === 1
      ? `${un}. Ouvrez la salle pour le retenir.`
      : `${un}, et ${aAnnoncer.length - 1} autre${aAnnoncer.length > 2 ? 's' : ''}. Ouvrez la salle pour retenir.`;
    try {
      await fetch(`${urlBase}/functions/v1/push-notify`, {
        method: 'POST',
        signal: AbortSignal.timeout(ENVOI_MAX_MS),
        headers: { 'content-type': 'application/json', authorization: `Bearer ${service}` },
        body: JSON.stringify({
          mode: 'staff',
          title: `${nomMaison} · ${aAnnoncer.length} message${aAnnoncer.length > 1 ? 's' : ''} ${aAnnoncer.length > 1 ? 'vont' : 'va'} partir`,
          body: corps,
          url: '/trone/#/conversations?envois=1',
        }),
      });
    } catch (e) {
      console.error('envois-partent: annonce', String(e));
    }
    for (const l of aAnnoncer) {
      /* Seulement s'il attend encore : une main a pu le retenir entre-temps. */
      const { data: marque } = await sb.from('envois')
        .update({ data: { ...l.data, annonceLe: maintenant } })
        .eq('id', l.id).eq('data->>statut', 'en-attente').select('id');
      if ((marque ?? []).length > 0) { l.data.annonceLe = maintenant; annonces++; }
    }
  }

  /* ③ CE DONT L'HEURE EST VENUE. */
  const calme = dansLesHeuresCalmes(maintenantMs, regles);
  const aPorter = enSalle
    .filter((l) => Number.isFinite(partAde(l)) && partAde(l) <= maintenantMs && (!calme || l.data.parLaMain === true))
    .sort((a, b) => partAde(a) - partAde(b))
    .slice(0, PAR_REVEIL);

  const WA_TOKEN = Deno.env.get('WA_TOKEN');
  const WA_PHONE_ID = Deno.env.get('WA_PHONE_ID');
  const SMS_SID = Deno.env.get('SMS_TWILIO_SID');
  const SMS_TOKEN = Deno.env.get('SMS_TWILIO_TOKEN');
  const SMS_FROM = Deno.env.get('SMS_FROM');

  let partis = 0, perimes = 0, echecs = 0, dejaPris = 0;

  for (const l of aPorter) {
    /* ⑤ JE LE PRENDS EN MAIN, et moi seul : l'écriture ne passe que s'il est
       encore « en-attente ». Retenu ou déjà pris une seconde plus tôt, elle ne
       touche aucune ligne et je passe au suivant. */
    const { data: pris } = await sb.from('envois')
      .update({ data: { ...l.data, prisLe: maintenant, statut: 'en-envoi' } })
      .eq('id', l.id).eq('data->>statut', 'en-attente').select('id');
    if ((pris ?? []).length === 0) { dejaPris++; continue; }

    const { colis, partA: _p, parLaMain: _m, calme: _c, ...base } = l.data as Ligne['data'] & { calme?: boolean };
    const ecris = async (plus: Record<string, unknown>) => {
      await sb.from('envois').update({ data: { ...base, ...plus, quand: new Date().toISOString() } }).eq('id', l.id);
    };

    /* ④ RELU AVANT DE PARTIR. */
    if (l.data.apptId) {
      const { data: rdvRow } = await sb.from('appointments').select('id, data').eq('id', l.data.apptId).maybeSingle();
      const motif = pourquoiIlNePartPlus(l.data, (rdvRow?.data ?? null) as { date?: string; time?: string; status?: string } | null, Date.now());
      if (motif) { await ecris({ statut: 'périmé', detail: motif }); perimes++; continue; }
    }
    if (!colis) { await ecris({ statut: 'échec', detail: 'déposé sans colis' }); echecs++; continue; }

    try {
      if (colis.genre === 'whatsapp') {
        if (!WA_TOKEN || !WA_PHONE_ID) { await ecris({ statut: 'échec', detail: 'clés Meta absentes' }); echecs++; continue; }
        const r = await fetch(`https://graph.facebook.com/v20.0/${WA_PHONE_ID}/messages`, {
          method: 'POST',
          signal: AbortSignal.timeout(ENVOI_MAX_MS),
          headers: { 'content-type': 'application/json', authorization: `Bearer ${WA_TOKEN}` },
          body: JSON.stringify({
            messaging_product: 'whatsapp', to: colis.numero, type: 'template',
            template: { name: colis.modele, language: { code: 'fr' }, components: colis.composants },
          }),
        });
        const rep = await r.json().catch(() => ({})) as { messages?: { id?: string }[]; error?: { code?: number; message?: string } };
        const waId = String(rep?.messages?.[0]?.id ?? '');
        if (!r.ok) {
          await ecris({ statut: 'échec', detail: String(rep?.error?.message ?? `HTTP ${r.status}`).slice(0, 300), ...(Number(rep?.error?.code) ? { codeMeta: Number(rep?.error?.code) } : {}) });
          echecs++;
          continue;
        }
        await ecris({ statut: 'envoyé', ...(waId ? { waMessageId: waId } : { detail: 'accepté sans identifiant Meta' }) });
        partis++;
        if (waId && colis.texteAuFil) {
          const idFil = `wa-${waId}`;
          const { error: errFil } = await sb.from('messages_wa').upsert({
            id: idFil,
            branch_id: l.branch_id,
            data: {
              id: idFil, waId, branchId: l.data.branchId, sens: 'sortant', numero: colis.numero, clientId: l.data.clientId,
              texte: colis.texteAuFil, type: 'text', quand: new Date().toISOString(), etat: 'en-route',
              modele: colis.modele, parQui: colis.parQui ?? 'Le Trône',
            },
          }, { onConflict: 'id' });
          if (errFil) console.error('envois-partent: fil', errFil.message);
        }
        /* Ce que le rendez-vous doit savoir une fois le message parti (la
           reprise proposée s'y inscrit, « À faire » la lit). */
        if (colis.rdvChampApres && l.data.apptId) {
          const { data: rdvRow } = await sb.from('appointments').select('id, data').eq('id', l.data.apptId).maybeSingle();
          if (rdvRow) {
            await sb.from('appointments').update({ data: { ...(rdvRow.data as object), [colis.rdvChampApres]: new Date().toISOString() } }).eq('id', l.data.apptId);
          }
        }
      } else if (colis.genre === 'push') {
        const r = await fetch(`${urlBase}/functions/v1/push-notify`, {
          method: 'POST',
          signal: AbortSignal.timeout(ENVOI_MAX_MS),
          headers: { 'content-type': 'application/json', authorization: `Bearer ${service}` },
          body: JSON.stringify({ mode: 'to-client', clientId: colis.clientId, title: colis.titre, body: colis.corps, url: colis.url ?? '/couronne/' }),
        });
        const sent = ((await r.json().catch(() => ({}))) as { sent?: number }).sent ?? 0;
        await ecris({ statut: sent > 0 ? 'envoyé' : 'sans-abonnement' });
        if (sent > 0) partis++;
      } else if (colis.genre === 'sms') {
        if (!SMS_SID || !SMS_TOKEN || !SMS_FROM) { await ecris({ statut: 'échec', detail: 'clés SMS absentes' }); echecs++; continue; }
        const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${SMS_SID}/Messages.json`, {
          method: 'POST',
          signal: AbortSignal.timeout(ENVOI_MAX_MS),
          headers: { 'content-type': 'application/x-www-form-urlencoded', authorization: `Basic ${btoa(`${SMS_SID}:${SMS_TOKEN}`)}` },
          body: new URLSearchParams({ From: SMS_FROM, To: `+${colis.numero}`, Body: colis.texte }).toString(),
        });
        if (r.ok) { await ecris({ statut: 'envoyé' }); partis++; }
        else { await ecris({ statut: 'échec', detail: (await r.text()).slice(0, 300) }); echecs++; }
      } else {
        await ecris({ statut: 'échec', detail: 'colis de genre inconnu' });
        echecs++;
      }
    } catch (e) {
      await ecris({ statut: 'échec', detail: String(e).slice(0, 300) });
      echecs++;
    }
  }

  return new Response(
    JSON.stringify({ version: VERSION, enSalle: enSalle.length, heuresCalmes: calme, annonces, partis, perimes, echecs, dejaPris, interrompus }),
    { headers: { 'content-type': 'application/json' } },
  );
});
