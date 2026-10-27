/* ═══════════════════════════════════════════════════════════════════
   RAPPELS-J1 — la fonction planifiée qui rappelle la veille.

   Réveillée par le cron (voir docs/BRANCHER-ENVOIS.md), elle :
     ① lit les rendez-vous de DEMAIN (au fuseau du salon, non annulés) ;
     ② LE PUSH N'EST PLUS ICI — 14 septembre 2026. Le job horaire
        `mnd-push-rappels` fait déjà ce balayage (fenêtres 22-24 h et 2 h
        avant, journal `push_reminders`), et chacun tenait SON journal sans
        voir l'autre : une cliente abonnée aurait reçu le rappel du soir
        DEUX fois, et trois avec celui de la dernière heure. Personne n'en a
        souffert — aucun abonnement n'était actif — mais le premier
        abonnement l'aurait révélé. Ici, WhatsApp et SMS ; le push, au job ;
     ③ envoie le WhatsApp par l'API Meta SI les secrets sont posés
        (WA_TOKEN, WA_PHONE_ID, WA_TEMPLATE) — sinon elle passe, sans bruit :
        la « tournée du matin » du Trône prend le relais à la main ;
     ④ envoie le SMS SI les secrets sont posés (SMS_TWILIO_SID,
        SMS_TWILIO_TOKEN, SMS_FROM) — même règle ;
     ⑤ consigne CHAQUE tentative dans la table `envois` (0043) — une ligne
        par rendez-vous et par canal, à identifiant DÉTERMINISTE : le cron
        peut se réveiller dix fois, un rappel ne part qu'une.

   AUCUN SECRET ICI. Tout vient de l'environnement de la fonction
   (supabase secrets set …) — ce fichier vit dans un dépôt public.

   Déploiement : Supabase → Edge Functions → New function « rappels-j1 »
   → coller CE FICHIER ENTIER → Deploy. Puis poser le cron (voir le guide).
   ═══════════════════════════════════════════════════════════════════ */

import { createClient } from 'npm:@supabase/supabase-js@2';

const TZ = 'Africa/Porto-Novo'; // le fuseau du salon — pas celui du serveur

/** La version de ce fichier, rendue dans chaque réponse : dire ce qui tourne
    vraiment évite de chercher une panne dans un fichier qui n'est pas celui
    qu'on croit déployé. 10 octobre 2026 : le passage du soir ne dépose plus
    un rappel que les heures calmes retiendraient jusqu'au jour même. */
const VERSION = '2026-10-27-a · le parent qui a pris le rendez-vous';

type Rdv = {
  id: string;
  branchId?: string;
  clientId: string;
  clientName?: string;
  /** Le numéro du parent qui a pris le rendez-vous (fiche à deux numéros). */
  numeroAPrevenir?: string;
  date: string;
  time: string;
  status: string;
};

type Fiche = { id: string; name?: string; phone?: string };

/** Numéro béninois → format international sans « + » (exigé par Meta/Twilio).
    Les fiches portent le numéro comme il a été tapé : on nettoie, puis
    229… reste tel quel · 01XXXXXXXX (10 chiffres) se préfixe 229 ·
    XXXXXXXX (8 chiffres, ancien plan) se préfixe 22901. Autre forme :
    on la laisse — mieux vaut un échec consigné qu'une correction muette. */
/* LE PARENT QUI A PRIS LE RENDEZ-VOUS — 27 octobre 2026 (« la personne qui a
   pris le RDV reçoit la confirmation et le rappel », Yéman). Une fiche à deux
   numéros (papa, maman) : le rendez-vous retient celui à prévenir. Copie
   conforme de `telDuRdv` (src/shared/numero-a-prevenir-pur.ts). */
const telDuRdv = (a: { numeroAPrevenir?: string }, fiche?: { phone?: string }): string =>
  (a.numeroAPrevenir ?? '').trim() || (fiche?.phone ?? '').trim();

const numeroIntl = (brut: string | undefined): string | null => {
  const d = (brut ?? '').replace(/\D/g, '');
  if (!d) return null;
  if (d.startsWith('00229')) return d.slice(2);
  if (d.startsWith('229')) return d;
  if (d.length === 10 && d.startsWith('01')) return `229${d}`;
  if (d.length === 8) return `22901${d}`;
  return d;
};

/* ══ MADAME NAFFI — 2 octobre 2026 ═════════════════════════════════════
   La Maison écrit « Madame Naffi » : la civilité de la fiche, puis le prénom.
   Une fiche qui ne dit rien est une dame ; une fiche au masculin d'avant ce
   jour est « Monsieur ». Recopié de `src/shared/civilite.ts` (une fonction
   Edge ne lit rien du dépôt) ; `verifie-civilite` tient la copie. */
const appelDe = (d: { name?: unknown; civilite?: unknown; auMasculin?: unknown } | null | undefined, repli?: unknown): string => {
  const civ = d?.civilite === 'monsieur' || d?.civilite === 'mademoiselle' || d?.civilite === 'madame'
    ? d.civilite : d?.auMasculin === true ? 'monsieur' : '';
  const prenom = String(d?.name ?? repli ?? '').trim().split(/\s+/)[0] ?? '';
  /* La civilité inconnue ne se suppose plus (13 octobre 2026) : le prénom seul. */
  if (!civ) return prenom || 'Madame, Monsieur';
  const mot = civ === 'monsieur' ? 'Monsieur' : civ === 'mademoiselle' ? 'Mademoiselle' : 'Madame';
  return prenom ? `${mot} ${prenom}` : mot;
};

/** « 8 h 30 », « 14 h » — l'heure telle qu'on la DIT, pas telle qu'on la tape.
    « 09:00 » est un horaire de train : on l'écrit pour une machine. La cliente
    lit « neuf heures » de toute façon, autant l'écrire ainsi — et c'est déjà
    la règle des rappels du Trône (`heureLisible`, shared/rappel.ts). Recopiée
    ici parce qu'une fonction Edge ne peut rien importer du dépôt.

    UNE HEURE ABSENTE N'EST PAS MINUIT : `Number('')` vaut zéro, et « 0 h »
    annoncé à une cliente est pire qu'un blanc, elle y croit. */
const heureLisible = (hhmm: string | undefined): string => {
  if (!/^\d{1,2}:\d{2}$/.test(hhmm ?? '')) return hhmm ?? '';
  const [h, m] = (hhmm as string).split(':');
  const minutes = Number(m);
  return Number.isFinite(minutes) && minutes > 0
    ? `${Number(h)} h ${String(minutes).padStart(2, '0')}`
    : `${Number(h)} h`;
};

/* ══ LA SALLE D'ATTENTE — 2 octobre 2026 ═══════════════════════════════
   « Est-ce possible d'intercepter un message qui part vers chez un client ?
   D'arrêter l'envoi à cause de l'heure tardive ou autre raison, erreur… »
   (Yéman). Cette fonction ne s'adresse plus à la cliente : elle DÉPOSE son
   message dans le journal des envois, statut « en-attente », avec son heure
   de départ (dix minutes de salle, jamais pendant les heures calmes) et son
   colis. Le facteur `envois-partent`, réveillé chaque minute, le porte, sauf
   si une main l'a retenu depuis le Trône.

   SI LE FACTEUR SE TAIT depuis plus de cinq minutes, on envoie comme avant :
   mieux vaut un message parti sans salle qu'un message déposé que personne ne
   porterait.

   LE CALCUL EST RECOPIÉ de `src/shared/salle-des-envois.ts` ; le harnais
   `verifie-la-salle-des-envois` tient les deux ensemble. */
const DECALAGE_DU_SALON_H = 1;
type ReglesDeLaSalle = { salleMin: number; calmeDe: number; calmeA: number };
const REGLES_PAR_DEFAUT: ReglesDeLaSalle = { salleMin: 10, calmeDe: 20, calmeA: 8 };
const FACTEUR_VIVANT_MS = 5 * 60_000;
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
function finDesHeuresCalmes(ms: number, r: ReglesDeLaSalle): number {
  const local = new Date(ms + DECALAGE_DU_SALON_H * 3_600_000);
  const fin = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(), r.calmeA, 0, 0) - DECALAGE_DU_SALON_H * 3_600_000;
  return fin > ms ? fin : fin + 86_400_000;
}
function heureDeDepart(maintenantMs: number, r: ReglesDeLaSalle): { partA: number; calme: boolean } {
  const apresLaSalle = maintenantMs + r.salleMin * 60_000;
  if (!dansLesHeuresCalmes(apresLaSalle, r)) return { partA: apresLaSalle, calme: false };
  return { partA: finDesHeuresCalmes(apresLaSalle, r), calme: true };
}
const facteurVivant = (vuLe: string | undefined | null, maintenantMs: number): boolean => {
  const t = Date.parse(vuLe ?? '');
  return Number.isFinite(t) && maintenantMs - t <= FACTEUR_VIVANT_MS && t - maintenantMs <= FACTEUR_VIVANT_MS;
};
/* ── fin du calcul recopié ── */

/** Ce qu'une ligne déposée porte en plus de son identité : quand elle part,
    à qui (le prénom, pour l'écran de la salle) et de quoi l'envoyer. */
const depot = (maintenantMs: number, r: ReglesDeLaSalle, colis: Record<string, unknown>, prenom?: string): Record<string, unknown> => {
  const { partA, calme } = heureDeDepart(maintenantMs, r);
  return {
    deposeLe: new Date(maintenantMs).toISOString(), partA: new Date(partA).toISOString(),
    ...(calme ? { calme: true } : {}), ...(prenom ? { prenom } : {}), colis,
  };
};
/** Les verdicts qui ne verrouillent pas : un raté se retente, un message
    périmé (rendez-vous déplacé pendant l'attente) peut se redéposer. */
const SE_RETENTE = new Set(['échec', 'périmé']);

/* ══ LA REPRISE PROPOSÉE, TROIS JOURS AVANT — 29 septembre 2026 ═══════════
   « And for renewal appointments even faster » (Yéman), maquette « La
   réservation en 30 secondes » validée. À la caisse, la Maison pose d'office
   le rendez-vous suivant (`repriseDe`). Trois jours avant, un WhatsApp le
   propose avec DEUX BOUTONS : « Je confirme » et « Un autre moment ». Le
   webhook lit la réponse (REPRISE_OK / REPRISE_AUTRE) et l'écrit sur le
   rendez-vous. Rien fait ? À faire garde la ligne : la Maison appelle.

   LE JUGE EST RECOPIÉ de `reprisesAProposer` (src/shared/reservation-
   express.ts), éprouvé par scripts/verifie-reservation-express : les deux
   changent ensemble.

   RIEN NE PART SANS LE MODÈLE : le secret WA_TEMPLATE_REPRISE nomme le
   modèle approuvé par Meta (docs/BRANCHER-ENVOIS.md). Absent, la fonction
   passe sans bruit, et les rappels de la veille continuent comme avant.
   Variables : {{1}} le prénom, {{2}} le moment, {{3}} les gestes ; deux
   réponses rapides, dans cet ordre : « Je confirme », « Un autre moment ». */
type Reprise = {
  id: string; branchId?: string; clientId: string; clientName?: string;
  date: string; time: string; status: string; serviceIds?: string[];
  repriseDe?: string; confirmeeParLaClienteLe?: string; autreMomentDemandeLe?: string;
  repriseProposeeLe?: string;
};

const JOURS_AVANT_LA_REPRISE = 3;

const reprisesAProposer = (appts: readonly Reprise[], dansTroisJours: string): Reprise[] =>
  appts.filter((a) => a.date === dansTroisJours && a.status === 'confirmé' && !!a.clientId && !!a.repriseDe
    && !a.confirmeeParLaClienteLe && !a.autreMomentDemandeLe);

/** « mardi 14 octobre 2026 ». Recopiée de confirmation-rdv. L'ANNÉE SE DIT
    (9 octobre 2026) : la reprise proposée trois jours avant est une date
    lue par la cliente, et la copie avait gardé la forme d'avant, sans
    l'année. verifie-calendrier lit désormais toutes les fonctions. */
const jourEnClair = (iso: string): string => {
  try {
    return new Date(`${iso}T12:00:00`).toLocaleDateString('fr-FR', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: TZ,
    });
  } catch { return iso; }
};

async function proposeLesReprises(sb: ReturnType<typeof createClient>, salleOuverte: boolean, regles: ReglesDeLaSalle): Promise<Record<string, unknown>> {
  const MODELE = (Deno.env.get('WA_TEMPLATE_REPRISE') ?? '').trim();
  const WA_TOKEN = Deno.env.get('WA_TOKEN');
  const WA_PHONE_ID = Deno.env.get('WA_PHONE_ID');
  if (!MODELE || !WA_TOKEN || !WA_PHONE_ID) return { reprises: 'sans-modele' };

  const jour = new Date(Date.now() + JOURS_AVANT_LA_REPRISE * 86_400_000).toLocaleDateString('en-CA', { timeZone: TZ });
  const { data: lignes, error } = await sb.from('appointments').select('id, branch_id, data')
    .eq('data->>date', jour).eq('data->>status', 'confirmé');
  if (error) return { reprises: 'lecture-refusee', motif: error.message.slice(0, 120) };
  const aProposer = reprisesAProposer((lignes ?? []).map((r) => r.data as Reprise), jour);
  if (aProposer.length === 0) return { reprises: 0, jour };

  /* L'idempotence, comme les rappels : seul un échec se retente. */
  const attendus = aProposer.map((a) => `rep3-${a.id}-whatsapp`);
  const { data: dejaRows } = await sb.from('envois').select('id, data').in('id', attendus);
  const deja = new Set(
    (dejaRows ?? [])
      .filter((r) => !SE_RETENTE.has((r.data as { statut?: string } | null)?.statut ?? ''))
      .map((r) => r.id as string),
  );

  const ids = [...new Set(aProposer.map((a) => a.clientId))];
  const { data: cliRows } = await sb.from('clients').select('id, data').in('id', ids);
  const fiches = new Map<string, Fiche>(
    (cliRows ?? []).map((r) => [r.id as string, { id: r.id, ...(r.data as object) } as Fiche]),
  );
  const gestesIds = [...new Set(aProposer.flatMap((a) => a.serviceIds ?? []))];
  const { data: svcRows } = gestesIds.length
    ? await sb.from('catalog_services').select('id, data').in('id', gestesIds)
    : { data: [] as { id: string; data: { name?: string } }[] };
  const nomDe = new Map<string, string>(
    ((svcRows ?? []) as { id: string; data: { name?: string } }[]).map((r) => [r.id, r.data?.name ?? '']),
  );

  let parties = 0;
  for (const a of aProposer) {
    const idEnvoi = `rep3-${a.id}-whatsapp`;
    if (deja.has(idEnvoi)) continue;
    const fiche = fiches.get(a.clientId);
    const tel = numeroIntl(telDuRdv(a, fiche));
    const prenom = appelDe(fiche, a.clientName);
    const quand = `${jourEnClair(a.date)} à ${heureLisible(a.time)}`;
    const gestes = (a.serviceIds ?? []).map((id) => nomDe.get(id)).filter(Boolean).join(', ') || 'votre rituel';
    const maintenant = new Date().toISOString();
    let statut = 'échec';
    let detail: string | undefined;
    let waId = '';
    const composants = [
      { type: 'body', parameters: [{ type: 'text', text: prenom }, { type: 'text', text: quand }, { type: 'text', text: gestes }] },
      /* Ce que chaque bouton rapporte au webhook : le rendez-vous visé. */
      { type: 'button', sub_type: 'quick_reply', index: '0', parameters: [{ type: 'payload', payload: `REPRISE_OK:${a.id}` }] },
      { type: 'button', sub_type: 'quick_reply', index: '1', parameters: [{ type: 'payload', payload: `REPRISE_AUTRE:${a.id}` }] },
    ];
    const texteDuFil = `Bonjour ${prenom}, votre prochain rituel est prévu ${quand} : ${gestes}. [Je confirme] [Un autre moment]`;
    /* EN SALLE : le facteur portera, et inscrira la proposition sur le rendez-vous. */
    if (salleOuverte && tel) {
      await sb.from('envois').upsert({
        id: idEnvoi,
        branch_id: a.branchId ?? null,
        data: {
          id: idEnvoi, branchId: a.branchId, type: 'reprise-j3', canal: 'whatsapp',
          apptId: a.id, clientId: a.clientId, dateRdv: a.date, heure: a.time, statut: 'en-attente', quand: maintenant,
          ...depot(Date.now(), regles, {
            genre: 'whatsapp', numero: tel, modele: MODELE, parQui: 'la Maison, automatiquement', texteAuFil: texteDuFil,
            composants, rdvChampApres: 'repriseProposeeLe',
          }, prenom),
        },
      }, { onConflict: 'id' });
      parties++;
      continue;
    }
    if (!tel) {
      statut = 'sans-numero';
    } else {
      try {
        const r = await fetch(`https://graph.facebook.com/v20.0/${WA_PHONE_ID}/messages`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: `Bearer ${WA_TOKEN}` },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            to: tel,
            type: 'template',
            template: {
              name: MODELE,
              language: { code: 'fr' },
              components: composants,
            },
          }),
        });
        const rep = await r.json().catch(() => ({}));
        waId = String(rep?.messages?.[0]?.id ?? '');
        if (r.ok) { statut = 'envoyé'; if (!waId) detail = 'accepté sans identifiant Meta'; }
        else detail = String(rep?.error?.message ?? `HTTP ${r.status}`);
      } catch (e) {
        detail = String(e);
      }
    }
    await sb.from('envois').upsert({
      id: idEnvoi,
      branch_id: a.branchId ?? null,
      data: {
        id: idEnvoi, branchId: a.branchId, type: 'reprise-j3', canal: 'whatsapp',
        apptId: a.id, clientId: a.clientId, dateRdv: a.date, heure: a.time, statut,
        ...(detail ? { detail: detail.slice(0, 300) } : {}),
        ...(waId ? { waMessageId: waId } : {}),
        quand: maintenant,
      },
    }, { onConflict: 'id' });
    if (statut !== 'envoyé') continue;
    parties++;
    /* Le rendez-vous le sait : À faire dit « proposée sur WhatsApp ». */
    const ligne = (lignes ?? []).find((l) => l.id === a.id);
    if (ligne) {
      await sb.from('appointments').update({
        data: { ...(ligne.data as object), repriseProposeeLe: maintenant },
      }).eq('id', a.id);
    }
    if (waId && tel) {
      const idFil = `wa-${waId}`;
      await sb.from('messages_wa').upsert({
        id: idFil,
        branch_id: a.branchId ?? null,
        data: {
          id: idFil, waId, branchId: a.branchId, sens: 'sortant', numero: tel, clientId: a.clientId,
          texte: texteDuFil,
          type: 'text', quand: maintenant, etat: 'en-route', modele: MODELE, parQui: 'la Maison, automatiquement',
        },
      }, { onConflict: 'id' });
    }
  }
  return { reprises: parties, jour, candidates: aProposer.length };
}

/* ══ LES POINTS D'ÉTAPE, SUR WHATSAPP — 17 octobre 2026 ══════════════════
   « Entre deux séances », lot 2. Une semaine après une séance honorée,
   `point_apres_seance` (« comment vont vos locks ? », Tout va bien · J'ai un
   souci) ; une semaine avant la suivante, `point_avant_seance` (« un soin,
   une coloration, une coiffure pour une occasion, ou autre chose ? »). Pour
   les seules clientes sans Ma Couronne : l'app pose déjà la question aux
   autres. Le webhook lit les réponses (POINT_BIEN, POINT_SOUCI, POINT_LISTE,
   POINT_AVANT).

   LE JUGE EST RECOPIÉ de `pointsDEtape` et `recoitLePointSurWhatsApp`
   (src/shared/entre-deux-pur.ts) ; scripts/verifie-points-d-etape confronte
   les copies aux originaux.

   RIEN NE PART SANS SON MODÈLE : WA_TEMPLATE_POINT_APRES et
   WA_TEMPLATE_POINT_AVANT nomment les modèles approuvés. Chacun se pose seul.

   LA DATE QUI JUGE EST CELLE DE LA SÉANCE, jamais une écriture : aujourd'hui
   moins sept jours, aujourd'hui plus sept jours, au fuseau du salon. Et une
   borne par passage : quarante messages au plus. */
type SeancePoint = { id: string; date: string; status: string; clientId?: string; time?: string; branchId?: string; clientName?: string; master?: string };
type FichePoint = Fiche & { authUserId?: string | null; archived?: boolean; familyId?: string };

const BORNE_DES_POINTS = 40;

// ── DEBUT pointsDEtape (copie de src/shared/entre-deux-pur.ts, éprouvée par scripts/verifie-points-d-etape)
const JOURS_APRES = 7;
const JOURS_AVANT = 7;
const jourPlus = (iso: string, j: number): string => {
  const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + j); return d.toISOString().slice(0, 10);
};
const ecartJours = (a: string, b: string): number => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000);
function pointsDEtape(seances: readonly SeancePoint[], aujourdhui: string): { cle: string; type: 'apres' | 'avant'; date: string; apptId: string; seance: string }[] {
  const derniere = seances.filter((s) => s.status === 'honoré' && s.date <= aujourdhui).sort((a, b) => b.date.localeCompare(a.date))[0];
  const prochaine = seances.filter((s) => (s.status === 'confirmé' || s.status === 'en attente') && s.date > aujourdhui).sort((a, b) => a.date.localeCompare(b.date))[0];
  const out: { cle: string; type: 'apres' | 'avant'; date: string; apptId: string; seance: string }[] = [];
  if (derniere) out.push({ cle: `pe-${derniere.id}-apres`, type: 'apres', date: jourPlus(derniere.date, JOURS_APRES), apptId: derniere.id, seance: derniere.date });
  if (prochaine && (!derniere || ecartJours(derniere.date, prochaine.date) >= JOURS_APRES + JOURS_AVANT)) {
    out.push({ cle: `pe-${prochaine.id}-avant`, type: 'avant', date: jourPlus(prochaine.date, -JOURS_AVANT), apptId: prochaine.id, seance: prochaine.date });
  }
  return out;
}
function recoitLePointSurWhatsApp(c: { id: string; authUserId?: string | null; archived?: boolean; phone?: string; familyId?: string }, familles: readonly { id: string; payerClientId?: string }[]): boolean {
  if (c.authUserId || c.archived || !String(c.phone ?? '').replace(/\D/g, '')) return false;
  const fam = c.familyId ? familles.find((f) => f.id === c.familyId) : undefined;
  return !fam?.payerClientId || fam.payerClientId === c.id;
}
// ── FIN pointsDEtape

async function poseLesPointsDEtape(sb: ReturnType<typeof createClient>, salleOuverte: boolean, regles: ReglesDeLaSalle): Promise<Record<string, unknown>> {
  const APRES = (Deno.env.get('WA_TEMPLATE_POINT_APRES') ?? '').trim();
  const AVANT = (Deno.env.get('WA_TEMPLATE_POINT_AVANT') ?? '').trim();
  const WA_TOKEN = Deno.env.get('WA_TOKEN');
  const WA_PHONE_ID = Deno.env.get('WA_PHONE_ID');
  if ((!APRES && !AVANT) || !WA_TOKEN || !WA_PHONE_ID) return { points: 'sans-modele' };

  const aujourdhui = new Date().toLocaleDateString('en-CA', { timeZone: TZ });
  /* Les séances qui ouvrent un point AUJOURD'HUI : honorées il y a sept jours,
     à venir dans sept jours. Le juge recopié tranche ensuite, tête par tête. */
  const candidates: SeancePoint[] = [];
  if (APRES) {
    const { data, error } = await sb.from('appointments').select('id, data')
      .eq('data->>date', jourPlus(aujourdhui, -JOURS_APRES)).eq('data->>status', 'honoré');
    if (error) return { points: 'lecture-refusee', motif: error.message.slice(0, 120) };
    candidates.push(...(data ?? []).map((r) => r.data as SeancePoint));
  }
  if (AVANT) {
    const { data, error } = await sb.from('appointments').select('id, data')
      .eq('data->>date', jourPlus(aujourdhui, JOURS_AVANT)).in('data->>status', ['confirmé', 'en attente']);
    if (error) return { points: 'lecture-refusee', motif: error.message.slice(0, 120) };
    candidates.push(...(data ?? []).map((r) => r.data as SeancePoint));
  }
  const ids = [...new Set(candidates.map((a) => a.clientId).filter((x): x is string => !!x))];
  if (ids.length === 0) return { points: 0, jour: aujourdhui };

  /* TOUTES leurs séances, par pages (une lecture plafonne à mille lignes) :
     « la dernière » et « la prochaine » se jugent sur l'histoire entière. */
  const seances: SeancePoint[] = [];
  for (let de = 0; ; de += 1000) {
    const { data, error } = await sb.from('appointments').select('id, data').in('data->>clientId', ids).range(de, de + 999);
    if (error) return { points: 'lecture-refusee', motif: error.message.slice(0, 120) };
    seances.push(...(data ?? []).map((r) => r.data as SeancePoint));
    if ((data ?? []).length < 1000) break;
  }
  const { data: cliRows } = await sb.from('clients').select('id, data').in('id', ids);
  const fiches = new Map<string, FichePoint>((cliRows ?? []).map((r) => [r.id as string, { id: r.id, ...(r.data as object) } as FichePoint]));
  const famIds = [...new Set([...fiches.values()].map((f) => f.familyId).filter((x): x is string => !!x))];
  const { data: famRows } = famIds.length ? await sb.from('families').select('id, data').in('id', famIds) : { data: [] as { id: string; data: { payerClientId?: string } }[] };
  const familles = ((famRows ?? []) as { id: string; data: { payerClientId?: string } }[]).map((r) => ({ id: r.id, payerClientId: r.data?.payerClientId }));

  type APoser = { type: 'apres' | 'avant'; seance: SeancePoint; fiche: FichePoint };
  const aPoser: APoser[] = [];
  for (const id of ids) {
    const fiche = fiches.get(id);
    if (!fiche || !recoitLePointSurWhatsApp(fiche, familles)) continue;
    for (const p of pointsDEtape(seances.filter((s) => s.clientId === id), aujourdhui)) {
      if (p.date !== aujourdhui) continue;
      if ((p.type === 'apres' && !APRES) || (p.type === 'avant' && !AVANT)) continue;
      const seance = seances.find((s) => s.id === p.apptId);
      if (seance) aPoser.push({ type: p.type, seance, fiche });
    }
  }
  if (aPoser.length === 0) return { points: 0, jour: aujourdhui, candidates: candidates.length };

  /* L'idempotence, comme les reprises : seul un échec se retente. */
  const idDe = (p: APoser) => `pe-${p.seance.id}-${p.type}-whatsapp`;
  const { data: dejaRows } = await sb.from('envois').select('id, data').in('id', aPoser.map(idDe));
  const deja = new Set(
    (dejaRows ?? [])
      .filter((r) => !SE_RETENTE.has((r.data as { statut?: string } | null)?.statut ?? ''))
      .map((r) => r.id as string),
  );

  let parties = 0;
  let bornee = false;
  for (const p of aPoser) {
    const idEnvoi = idDe(p);
    if (deja.has(idEnvoi)) continue;
    if (parties >= BORNE_DES_POINTS) { bornee = true; break; }
    const a = p.seance;
    const fiche = p.fiche;
    const tel = numeroIntl(fiche.phone);
    const prenom = appelDe(fiche, a.clientName);
    const jour = jourEnClair(a.date);
    const modele = p.type === 'apres' ? APRES : AVANT;
    const maintenant = new Date().toISOString();
    let statut = 'échec';
    let detail: string | undefined;
    let waId = '';
    /* Ce que chaque bouton rapporte au webhook : la séance visée et le geste. */
    const composants = p.type === 'apres'
      ? [
        { type: 'body', parameters: [{ type: 'text', text: prenom }, { type: 'text', text: jour }] },
        { type: 'button', sub_type: 'quick_reply', index: '0', parameters: [{ type: 'payload', payload: `POINT_BIEN:${a.id}` }] },
        { type: 'button', sub_type: 'quick_reply', index: '1', parameters: [{ type: 'payload', payload: `POINT_SOUCI:${a.id}` }] },
      ]
      : [
        { type: 'body', parameters: [{ type: 'text', text: prenom }, { type: 'text', text: jour }] },
        { type: 'button', sub_type: 'quick_reply', index: '0', parameters: [{ type: 'payload', payload: `POINT_AVANT:${a.id}:soin` }] },
        { type: 'button', sub_type: 'quick_reply', index: '1', parameters: [{ type: 'payload', payload: `POINT_AVANT:${a.id}:coloration` }] },
        { type: 'button', sub_type: 'quick_reply', index: '2', parameters: [{ type: 'payload', payload: `POINT_AVANT:${a.id}:coiffure` }] },
        { type: 'button', sub_type: 'quick_reply', index: '3', parameters: [{ type: 'payload', payload: `POINT_AVANT:${a.id}:autre` }] },
      ];
    const texteDuFil = p.type === 'apres'
      ? `Bonjour ${prenom}, une semaine après votre séance du ${jour}, comment vont vos locks ? [Tout va bien] [J'ai un souci]`
      : `Bonjour ${prenom}, votre prochaine séance est le ${jour}. Un soin, une coloration, une coiffure pour une occasion, ou autre chose ? [Un soin] [Une coloration] [Une coiffure spéciale] [Autre chose]`;
    /* LE POINT D'APRÈS NE NOMME PAS SA SÉANCE COMME RENDEZ-VOUS : le facteur
       jugerait « l'heure du rendez-vous est passée » et le jetterait. Elle
       voyage sous `seanceId`. Celui d'avant garde son rendez-vous : déplacé
       ou annulé pendant l'attente, il ne part plus. */
    const rdvDuPoint = p.type === 'avant' ? { apptId: a.id, heure: a.time } : { apptId: '' };
    /* EN SALLE : le facteur portera. */
    if (salleOuverte && tel) {
      await sb.from('envois').upsert({
        id: idEnvoi,
        branch_id: a.branchId ?? null,
        data: {
          id: idEnvoi, branchId: a.branchId, type: `point-${p.type}`, canal: 'whatsapp', ...rdvDuPoint, seanceId: a.id,
          clientId: fiche.id, dateRdv: a.date, statut: 'en-attente', quand: maintenant,
          ...depot(Date.now(), regles, {
            genre: 'whatsapp', numero: tel, modele, parQui: 'la Maison, automatiquement', texteAuFil: texteDuFil, composants,
          }, prenom),
        },
      }, { onConflict: 'id' });
      parties++;
      continue;
    }
    if (!tel) {
      statut = 'sans-numero';
    } else {
      try {
        const r = await fetch(`https://graph.facebook.com/v20.0/${WA_PHONE_ID}/messages`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: `Bearer ${WA_TOKEN}` },
          body: JSON.stringify({
            messaging_product: 'whatsapp', to: tel, type: 'template',
            template: { name: modele, language: { code: 'fr' }, components: composants },
          }),
          signal: AbortSignal.timeout(10_000),
        });
        const rep = await r.json().catch(() => ({}));
        waId = String(rep?.messages?.[0]?.id ?? '');
        if (r.ok) { statut = 'envoyé'; if (!waId) detail = 'accepté sans identifiant Meta'; }
        else detail = String(rep?.error?.message ?? `HTTP ${r.status}`);
      } catch (e) {
        detail = String(e);
      }
    }
    await sb.from('envois').upsert({
      id: idEnvoi,
      branch_id: a.branchId ?? null,
      data: {
        id: idEnvoi, branchId: a.branchId, type: `point-${p.type}`, canal: 'whatsapp', ...rdvDuPoint, seanceId: a.id,
        clientId: fiche.id, dateRdv: a.date, statut,
        ...(detail ? { detail: detail.slice(0, 300) } : {}),
        ...(waId ? { waMessageId: waId } : {}),
        quand: maintenant,
      },
    }, { onConflict: 'id' });
    if (statut !== 'envoyé') continue;
    parties++;
    if (waId && tel) {
      const idFil = `wa-${waId}`;
      await sb.from('messages_wa').upsert({
        id: idFil,
        branch_id: a.branchId ?? null,
        data: {
          id: idFil, waId, branchId: a.branchId, sens: 'sortant', numero: tel, clientId: fiche.id,
          texte: texteDuFil,
          type: 'text', quand: maintenant, etat: 'en-route', modele, parQui: 'la Maison, automatiquement',
        },
      }, { onConflict: 'id' });
    }
  }
  return { points: parties, jour: aujourdhui, aPoser: aPoser.length, ...(bornee ? { borne: BORNE_DES_POINTS } : {}) };
}

Deno.serve(async (req) => {
  /* ══ LA CLÉ SERVICE, NOUVELLE FAMILLE — 7 septembre 2026 ═══════════
     Depuis la rotation des clés (fuite du 2 août), le projet vit sur les
     clés « sb_… » : la legacy service_role (eyJ…) injectée par la
     plateforme ne prouve plus rien, et cette garde répondait 401 chaque
     soir, en silence. La Maison pose le secret de fonction CLE_SERVICE
     (la clé secrète sb_secret_…) ; la même valeur vit au Vault
     (« service_role_key »), c'est elle que `appelle_fonction_edge`
     envoie. Sans CLE_SERVICE posée, l'ancien monde continue tel quel. */
  const service = (Deno.env.get('CLE_SERVICE') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '').trim();
  const urlBase = Deno.env.get('SUPABASE_URL') ?? '';

  /* Seul le cron (armé de la clé service) a le droit de réveiller l'envoi :
     cette fonction lit des téléphones et écrit au journal. */
  const cleRecue = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
  if (!service || cleRecue !== service) {
    /* LES LONGUEURS SEULES, JAMAIS LES VALEURS : elles suffisent à situer la
       panne (sb_secret ≈ 40-50 signes · legacy eyJ… ≈ 200 et plus · 0 = rien
       de posé de ce côté-là). */
    return new Response(
      JSON.stringify({ erreur: 'réservé au cron', attendueLg: service.length, recueLg: cleRecue.length }),
      { status: 401 },
    );
  }

  const sb = createClient(urlBase, service);

  /* ── Demain, au fuseau du salon ─────────────────────────────────── */
  const demain = new Date(Date.now() + 86_400_000).toLocaleDateString('en-CA', { timeZone: TZ });

  /* ── La voix de la Maison (son nom) ──────────────────────────────
     L'itinéraire vivait ici pour le push ; il est parti avec lui, au job
     horaire, qui le lit de son côté. */
  const { data: docs } = await sb.from('documents').select('key, data')
    .in('key', ['mnd_house_identity', 'mnd_auto_config', 'mnd_facteur']);
  const nomMaison: string =
    (docs?.find((d) => d.key === 'mnd_house_identity')?.data?.nom ?? '').trim() || 'Maison MND';

  /* ── Les reprises de dans trois jours, d'abord : elles ne dépendent pas
     des rendez-vous de demain, et un soir sans rappel ne doit pas les taire. */
  /* LA SALLE EST OUVERTE si le facteur a donné signe de vie dans les cinq minutes. */
  const regles = reglesDepuis(docs?.find((d) => d.key === 'mnd_auto_config')?.data as Record<string, unknown> | undefined);
  const salleOuverte = facteurVivant((docs?.find((d) => d.key === 'mnd_facteur')?.data as { vuLe?: string } | undefined)?.vuLe, Date.now());

  const reprises = await proposeLesReprises(sb, salleOuverte, regles).catch((e) => ({ reprises: 'echec', motif: String(e).slice(0, 120) }));
  /* Les points d'étape d'Entre deux séances (17 octobre 2026) : ils ne
     dépendent pas non plus des rendez-vous de demain. */
  const points = await poseLesPointsDEtape(sb, salleOuverte, regles).catch((e) => ({ points: 'echec', motifPoints: String(e).slice(0, 120) }));

  /* ══ LE PASSAGE DU SOIR ET LES HEURES CALMES — 10 octobre 2026 (revue de nuit) ══
     Le second passage tourne à 21 h. Déposé à cette heure, un rappel attend la
     fin des heures calmes (8 h), c'est-à-dire LE MATIN DU RENDEZ-VOUS, et le
     facteur le déclare alors « trop tard pour un rappel de la veille » : salle
     ouverte, aucun rappel du soir ne partait plus. La règle de la Maison est
     que rien ne part la nuit ; on ne la contourne pas. On ne dépose donc pas
     ce qui partirait le jour même : le journal le dit « pas envoyé », avec son
     motif, pour que la Maison voie la cliente à appeler. Envoyer quand même à
     21 h serait une règle nouvelle, qui revient à la direction. */
  const partiraitLeJourMeme = salleOuverte
    && new Date(heureDeDepart(Date.now(), regles).partA + DECALAGE_DU_SALON_H * 3_600_000).toISOString().slice(0, 10) >= demain;

  /* ── Les rendez-vous de demain, non annulés ─────────────────────── */
  const { data: apptRows, error: errA } = await sb.from('appointments')
    .select('id, branch_id, data')
    .eq('data->>date', demain)
    .neq('data->>status', 'annulé');
  if (errA) return new Response(JSON.stringify({ erreur: errA.message }), { status: 500 });

  const rdvs: Rdv[] = (apptRows ?? []).map((r) => r.data as Rdv);
  if (rdvs.length === 0) {
    return new Response(JSON.stringify({ version: VERSION, jour: demain, rdv: 0, ...reprises, ...points }), { status: 200 });
  }

  /* ── Les fiches (nom + téléphone), en une lecture ───────────────── */
  const ids = [...new Set(rdvs.map((a) => a.clientId).filter(Boolean))];
  const { data: cliRows } = await sb.from('clients').select('id, data').in('id', ids);
  const fiches = new Map<string, Fiche>(
    (cliRows ?? []).map((r) => [r.id as string, { id: r.id, ...(r.data as object) } as Fiche]),
  );

  /* ── Le journal du jour — l'idempotence ─────────────────────────── */
  /* ══ UN RATÉ SE RETENTE, UN ENVOI RÉUSSI JAMAIS — 11 septembre 2026 ══
     Le journal servait de verrou SANS REGARDER LE VERDICT : une tentative
     échouée bloquait le rappel pour toujours, exactement comme un envoi
     réussi. Vu le soir où les modèles étaient encore en revue — les trois
     clientes du lendemain seraient restées sans WhatsApp alors que
     l'approbation allait tomber dans la nuit. Une coupure réseau d'un soir
     aurait fait le même dégât, en silence.

     Seuls les verdicts DÉFINITIFS verrouillent : « envoyé » (c'est parti,
     le refaire écrirait deux fois à la même tête) et « sans-abonnement »
     (elle n'a pas l'appli, réessayer chaque heure ne la lui installera
     pas). Un « échec » laisse la porte ouverte, et c'est tout le sens du
     SECOND PASSAGE DU SOIR ajouté le 11 septembre : le premier tourne en
     fin d'après-midi, le second en fin de soirée, et il rattrape à la fois
     les rendez-vous posés dans l'intervalle et les envois qui ont cassé.
     DEUX PASSAGES NE FONT PAS UNE RAFALE : un envoi réussi et un
     « sans-abonnement » verrouillent définitivement, donc personne ne
     reçoit deux fois le même message, et un canal en panne est retenté
     deux fois par jour, pas davantage. */
  const { data: dejaRows } = await sb.from('envois').select('id, data').eq('data->>dateRdv', demain);
  const deja = new Set(
    (dejaRows ?? [])
      .filter((r) => !SE_RETENTE.has((r.data as { statut?: string } | null)?.statut ?? ''))
      .map((r) => r.id as string),
  );

  /* ── Les canaux configurés ──────────────────────────────────────── */
  const WA_TOKEN = Deno.env.get('WA_TOKEN');
  const WA_PHONE_ID = Deno.env.get('WA_PHONE_ID');
  const WA_TEMPLATE = Deno.env.get('WA_TEMPLATE') ?? 'rappel_rdv';
  const SMS_SID = Deno.env.get('SMS_TWILIO_SID');
  const SMS_TOKEN = Deno.env.get('SMS_TWILIO_TOKEN');
  const SMS_FROM = Deno.env.get('SMS_FROM');

  const aInserer: { id: string; branch_id: string | null; data: Record<string, unknown> }[] = [];
  /* ══ L'IDENTIFIANT META SE GARDE — 11 septembre 2026 ═══════════════
     Le journal écrivait « envoyé » dès que Meta ACCEPTAIT la requête, et
     s'arrêtait là : un message jamais remis se lisait comme parti. Meta
     rappelle pourtant, minutes plus tard, ce qu'il est devenu — mais son
     accusé ne porte que l'identifiant DU MESSAGE, et nous ne le gardions
     nulle part. Impossible de rapprocher, donc impossible de savoir.
     `waMessageId` est le fil qui relie l'envoi à son accusé. */
  const consigne = (canal: string, a: Rdv, statut: string, detail?: string, waMessageId?: string, plus?: Record<string, unknown>) => {
    aInserer.push({
      id: `env-${a.id}-${canal}`,
      branch_id: a.branchId ?? null,
      data: {
        id: `env-${a.id}-${canal}`, branchId: a.branchId, type: 'rappel-j1', canal,
        apptId: a.id, clientId: a.clientId, dateRdv: a.date, heure: a.time,
        statut, ...(detail ? { detail: detail.slice(0, 300) } : {}),
        ...(waMessageId ? { waMessageId } : {}),
        quand: new Date().toISOString(),
        ...(plus ?? {}),
      },
    });
  };

  /* ══ LE RAPPEL PARAÎT DANS LE FIL — 11 septembre 2026 ══════════════
     Sans cela, on répondrait à côté : une cliente écrit « je peux décaler ? »
     et le maître ne voit pas qu'un rappel est parti vers elle une heure plus
     tôt. Le fil doit porter TOUT ce qui s'est dit, y compris ce que la Maison
     a écrit toute seule. Identifiant déduit de celui de Meta, pour que
     l'accusé du webhook retrouve sa ligne. */
  const auFil: { id: string; branch_id: string | null; data: Record<string, unknown> }[] = [];
  const consigneAuFil = (a: Rdv, numero: string, waId: string, texte: string, modele: string) => {
    const id = `wa-${waId}`;
    auFil.push({
      id,
      branch_id: a.branchId ?? null,
      data: {
        id, waId, branchId: a.branchId, sens: 'sortant', numero, clientId: a.clientId,
        texte, type: 'text', quand: new Date().toISOString(), etat: 'en-route',
        modele, parQui: 'la Maison, automatiquement',
      },
    });
  };

  let nWa = 0, nSms = 0, nDeposes = 0;

  for (const a of rdvs) {
    const fiche = fiches.get(a.clientId);
    const prenom = appelDe(fiche, a.clientName);

    /* ② WHATSAPP — seulement si la Maison a posé ses clés Meta.
       Le modèle approuvé attend deux variables : {{1}} le prénom,
       {{2}} l'heure (voir docs/BRANCHER-ENVOIS.md). */
    const tel = numeroIntl(telDuRdv(a, fiche));
    if (partiraitLeJourMeme) {
      const motif = 'heures calmes : déposé ce soir, il partirait le jour même du rendez-vous';
      if (WA_TOKEN && WA_PHONE_ID && tel && !deja.has(`env-${a.id}-whatsapp`)) consigne('whatsapp', a, 'périmé', motif);
      if (SMS_SID && SMS_TOKEN && SMS_FROM && tel && !deja.has(`env-${a.id}-sms`)) consigne('sms', a, 'périmé', motif);
      continue;
    }
    if (salleOuverte && WA_TOKEN && WA_PHONE_ID && tel && !deja.has(`env-${a.id}-whatsapp`)) {
      consigne('whatsapp', a, 'en-attente', undefined, undefined, depot(Date.now(), regles, {
        genre: 'whatsapp', numero: tel, modele: WA_TEMPLATE, parQui: 'la Maison, automatiquement',
        texteAuFil: `${prenom}, votre rendez-vous est demain à ${heureLisible(a.time)}.`,
        composants: [{ type: 'body', parameters: [{ type: 'text', text: prenom }, { type: 'text', text: heureLisible(a.time) }] }],
      }, prenom));
      nDeposes++;
    } else if (WA_TOKEN && WA_PHONE_ID && tel && !deja.has(`env-${a.id}-whatsapp`)) {
      try {
        const r = await fetch(`https://graph.facebook.com/v20.0/${WA_PHONE_ID}/messages`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: `Bearer ${WA_TOKEN}` },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            to: tel,
            type: 'template',
            template: {
              name: WA_TEMPLATE,
              language: { code: 'fr' },
              components: [{
                type: 'body',
                parameters: [{ type: 'text', text: prenom }, { type: 'text', text: heureLisible(a.time) }],
              }],
            },
          }),
        });
        const rep = await r.json().catch(() => ({}));
        const waId = String(rep?.messages?.[0]?.id ?? '');
        if (r.ok && waId) {
          consigne('whatsapp', a, 'envoyé', undefined, waId);
          consigneAuFil(
            a, tel, waId,
            `${prenom}, votre rendez-vous est demain à ${heureLisible(a.time)}.`,
            WA_TEMPLATE,
          );
          nWa++;
        } else if (r.ok) {
          /* ACCEPTÉ SANS IDENTIFIANT : Meta a dit oui mais ne nomme pas le
             message. On ne saura jamais ce qu'il devient — mieux vaut le dire
             au journal que de laisser croire à un suivi qu'on n'a pas. */
          consigne('whatsapp', a, 'envoyé', 'accepté sans identifiant Meta');
          nWa++;
        } else {
          consigne('whatsapp', a, 'échec', String(rep?.error?.message ?? `HTTP ${r.status}`));
        }
      } catch (e) {
        consigne('whatsapp', a, 'échec', String(e));
      }
    }

    /* ③ SMS — seulement si la Maison a posé ses clés (forme Twilio ;
       autre fournisseur = adapter ce bloc, le reste ne bouge pas). */
    if (salleOuverte && SMS_SID && SMS_TOKEN && SMS_FROM && tel && !deja.has(`env-${a.id}-sms`)) {
      consigne('sms', a, 'en-attente', undefined, undefined, depot(Date.now(), regles, {
        genre: 'sms', numero: tel,
        texte: `${nomMaison}, rappel : votre rendez-vous est demain à ${heureLisible(a.time)}. Merci de nous prévenir en cas d'empêchement.`,
      }, prenom));
      nDeposes++;
    } else if (SMS_SID && SMS_TOKEN && SMS_FROM && tel && !deja.has(`env-${a.id}-sms`)) {
      try {
        const corps = new URLSearchParams({
          From: SMS_FROM,
          To: `+${tel}`,
          Body: `${nomMaison}, rappel : votre rendez-vous est demain à ${heureLisible(a.time)}. Merci de nous prévenir en cas d'empêchement.`,
        });
        const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${SMS_SID}/Messages.json`, {
          method: 'POST',
          headers: {
            'content-type': 'application/x-www-form-urlencoded',
            authorization: `Basic ${btoa(`${SMS_SID}:${SMS_TOKEN}`)}`,
          },
          body: corps.toString(),
        });
        if (r.ok) { consigne('sms', a, 'envoyé'); nSms++; }
        else consigne('sms', a, 'échec', await r.text());
      } catch (e) {
        consigne('sms', a, 'échec', String(e));
      }
    }
  }

  /* ── Le journal s'écrit en un geste (upsert : re-réveil sans doublon) ── */
  if (aInserer.length > 0) {
    const { error: errE } = await sb.from('envois').upsert(aInserer, { onConflict: 'id' });
    if (errE) return new Response(JSON.stringify({ version: VERSION, erreur: errE.message }), { status: 500 });
  }

  /* LE FIL, S'IL Y A QUELQUE CHOSE À Y METTRE. Une table absente ne doit pas
     faire tomber la tournée : le rappel est parti, c'est l'essentiel, et une
     erreur d'écriture au fil se lit au journal des fonctions. */
  if (auFil.length > 0) {
    const { error } = await sb.from('messages_wa').upsert(auFil, { onConflict: 'id' });
    if (error) console.error('rappels-j1: fil', error.message);
  }

  return new Response(
    JSON.stringify({ version: VERSION, jour: demain, rdv: rdvs.length, push: 'au job mnd-push-rappels', salle: salleOuverte, partiraitLeJourMeme, deposes: nDeposes, whatsapp: nWa, sms: nSms, ...reprises, ...points }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );
});
