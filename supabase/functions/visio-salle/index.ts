// @ts-nocheck : fichier REGROUPÉ, ne pas modifier à la main.
/* ═══════════════════════════════════════════════════════════════════
   VISIO-SALLE : la visio gratuite de quinze minutes (la Consultation,
   lot 3). Les créneaux, la réservation, l'entrée par le lien de la
   cliente ou par la session de l'équipe, et la salle qui se ferme
   d'elle-même à la fin du créneau (Daily, `exp` + `eject_at_room_exp`).

   Fichier fabriqué par `node scripts/visio-salle-serveur.mjs` depuis
   `scripts/serveur/visio-salle.ts` et `src/shared/visio-pur.ts` : on ne
   le corrige jamais ici, on corrige le dépôt et on refait le fichier.

   AUCUN SECRET ICI : SUPABASE_URL, CLE_SERVICE (ou SUPABASE_SERVICE_ROLE_KEY)
   et DAILY_API_KEY viennent de l'environnement. Sans DAILY_API_KEY, la
   visio reste fermée et le site ne la propose pas.

   Déploiement : `node scripts/mise-en-ligne.mjs fonction visio-salle
   --commit <sha> --jwt non` (la porte est jugée ici : le jeton du lien, ou
   la session d'un membre de l'équipe). Vérifier : son adresse répond sa version.
   ═══════════════════════════════════════════════════════════════════ */
// scripts/serveur/visio-salle.ts
import { createClient } from "npm:@supabase/supabase-js@2";

// src/shared/visio-pur.ts
var DUREE_MIN = 15;
var AVANT_L_ENTREE_MIN = 5;
var DECALAGE_DE_COTONOU_MS = 60 * 6e4;
var REGLAGES_DE_DEPART = () => ({
  version: 1,
  actif: false,
  jours: [2, 3, 4, 5, 6],
  heures: ["10:00", "10:15", "10:30", "10:45"],
  horizonJours: 7,
  delaiMin: 120,
  parTelephone: 1
});
var HEURE = /^([01]\d|2[0-3]):([0-5]\d)$/;
var entier = (x, min, max, defaut) => {
  const n = Math.round(Number(x));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : defaut;
};
function reglagesSurs(x) {
  const d = REGLAGES_DE_DEPART();
  if (!x || typeof x !== "object") return d;
  const o = x;
  const jours = Array.isArray(o.jours) ? [...new Set(o.jours.map((j) => Math.round(Number(j))).filter((j) => j >= 1 && j <= 7))].sort((a, b) => a - b) : d.jours;
  const heures = Array.isArray(o.heures) ? [...new Set(o.heures.map(String).filter((h) => HEURE.test(h)))].sort() : d.heures;
  return {
    version: 1,
    actif: o.actif === true,
    jours,
    heures: heures.slice(0, 48),
    horizonJours: entier(o.horizonJours, 1, 30, d.horizonJours),
    delaiMin: entier(o.delaiMin, 0, 2880, d.delaiMin),
    parTelephone: entier(o.parTelephone, 1, 5, d.parTelephone),
    ...typeof o.modifieLe === "string" ? { modifieLe: o.modifieLe } : {},
    ...typeof o.modifiePar === "string" ? { modifiePar: o.modifiePar } : {}
  };
}
var jourDeCotonou = (ms) => new Date(ms + DECALAGE_DE_COTONOU_MS).toISOString().slice(0, 10);
var instantDeCotonou = (jour, hhmm) => new Date(Date.parse(`${jour}T${hhmm}:00.000Z`) - DECALAGE_DE_COTONOU_MS).toISOString();
var jourDeLaSemaine = (jour) => {
  const j = (/* @__PURE__ */ new Date(`${jour}T12:00:00Z`)).getUTCDay();
  return j === 0 ? 7 : j;
};
var plusDesJours = (jour, n) => new Date(Date.parse(`${jour}T12:00:00Z`) + n * 864e5).toISOString().slice(0, 10);
var finDe = (debut) => new Date(Date.parse(debut) + DUREE_MIN * 6e4).toISOString();
function creneauxOuverts(r, maintenantMs, pris) {
  const prisMs = new Set(pris.map((p) => Date.parse(p)));
  const premier = maintenantMs + r.delaiMin * 6e4;
  const aujourdhui = jourDeCotonou(maintenantMs);
  const tous = [];
  for (let i = 0; i < r.horizonJours; i += 1) {
    const jour = plusDesJours(aujourdhui, i);
    if (!r.jours.includes(jourDeLaSemaine(jour))) continue;
    for (const h of r.heures) {
      const debut = instantDeCotonou(jour, h);
      const ms = Date.parse(debut);
      if (ms < premier || prisMs.has(ms)) continue;
      tous.push({ debut, fin: finDe(debut) });
    }
  }
  return tous;
}
var creneauValide = (r, maintenantMs, pris, debut) => creneauxOuverts(r, maintenantMs, pris).some((c) => Date.parse(c.debut) === Date.parse(debut));
var FORME_DE_L_ID = /^vz-[a-z0-9]{6,24}$/;
var FORME_DU_JETON = /^[A-Za-z0-9_-]{32}$/;
var FORME_DE_LA_CONSULTATION = /^[A-Za-z0-9_-]{1,80}$/;
var cheminDeLaSalle = (id, jeton) => `/couronne/#/visio/${id}.${jeton}`;
var numeroCourt = (tel) => String(tel ?? "").replace(/\D/g, "").slice(-8);
var NIVEAUX = [
  { id: "aucune", dit: "Pas de réparation" },
  { id: "douce", dit: "Douce" },
  { id: "essentielle", dit: "Essentielle" },
  { id: "intensive", dit: "Intensive" },
  { id: "alala", dit: "ÀLÀLÀ™" }
];
var LONGUEURS = [
  { id: "courte", dit: "Courte" },
  { id: "mi-longue", dit: "Mi-longue" },
  { id: "longue", dit: "Longue" }
];
var SUITES = [
  { id: "privee", dit: "Consultation privée", pourElle: "La consultation privée, à la Maison : locks témoins faites devant vous et devis ferme." },
  { id: "devis", dit: "Devis", pourElle: "Votre devis arrive dans votre espace : il ne reste qu’à le valider." },
  { id: "soins", dit: "Soins", pourElle: "Des soins suffisent : réservez votre rituel quand vous le souhaitez." }
];
var dans = (x, l) => l.some((v) => v.id === x) ? x : void 0;
function resumeSur(x) {
  if (!x || typeof x !== "object") return null;
  const o = x;
  const r = {};
  const niveau = dans(o.niveau, NIVEAUX);
  if (niveau) r.niveau = niveau;
  const longueur = dans(o.longueur, LONGUEURS);
  if (longueur) r.longueur = longueur;
  const suite = dans(o.suite, SUITES);
  if (suite) r.suite = suite;
  const e = Math.round(Number(o.estimationXof));
  if (Number.isFinite(e) && e > 0) r.estimationXof = e;
  if (typeof o.mot === "string" && o.mot.trim()) r.mot = o.mot.trim().slice(0, 400);
  if (typeof o.par === "string") r.par = o.par.slice(0, 60);
  if (typeof o.le === "string") r.le = o.le;
  return Object.keys(r).length ? r : null;
}

// scripts/serveur/visio-salle.ts
var VERSION = "2026-11-13-a";
var DAILY = "https://api.daily.co/v1";
var LIMITE = { seau: "visio", max: 6, fenetreMin: 10 };
var DAILY_MAX_MS = 8e3;
var CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS"
};
var json = (corps, status = 200) => new Response(JSON.stringify({ version: VERSION, maintenant: (/* @__PURE__ */ new Date()).toISOString(), ...corps }), { status, headers: { ...CORS, "content-type": "application/json" } });
var dis = (quoi, plus = {}) => console.log(JSON.stringify({ fonction: "visio-salle", quoi, ...plus }));
var ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
function aleatoire(n, alphabet = ALPHABET) {
  const o = new Uint8Array(n);
  crypto.getRandomValues(o);
  return [...o].map((b) => alphabet[b % alphabet.length]).join("");
}
async function empreinte(jeton) {
  const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(jeton));
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
var prenomDe = (nom) => String(nom ?? "").trim().split(/\s+/)[0]?.slice(0, 40) ?? "";
var ipDe = (req) => (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "inconnue";
async function reglages(sb) {
  const { data } = await sb.from("documents").select("data").eq("key", "mnd_visio").maybeSingle();
  return reglagesSurs(data?.data);
}
async function prisDepuis(sb, depuis) {
  const { data } = await sb.from("visios").select("debut").neq("statut", "annulée").gte("debut", depuis).limit(1e3);
  return (data ?? []).map((l) => l.debut);
}
async function permis(sb, ip) {
  const depuis = new Date(Date.now() - LIMITE.fenetreMin * 6e4).toISOString();
  const { count, error } = await sb.from("edge_rate_limits").select("*", { count: "exact", head: true }).eq("bucket", LIMITE.seau).eq("ip", ip).gte("at", depuis);
  if (error) return true;
  if ((count ?? 0) >= LIMITE.max) return false;
  await sb.from("edge_rate_limits").insert({ bucket: LIMITE.seau, ip });
  return true;
}
async function parLeJeton(sb, id, jeton) {
  if (typeof id !== "string" || typeof jeton !== "string" || !FORME_DE_L_ID.test(id) || !FORME_DU_JETON.test(jeton)) return null;
  const { data } = await sb.from("visios").select("*").eq("id", id).maybeSingle();
  const l = data;
  if (!l) return null;
  return l.jeton_hash === await empreinte(jeton) ? l : null;
}
async function delEquipe(sb, req) {
  const cle = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!cle) return null;
  const { data: lu } = await sb.auth.getUser(cle);
  const uid = lu?.user?.id;
  if (!uid) return null;
  const { data: staff } = await sb.from("staff").select("user_id").eq("user_id", uid).maybeSingle();
  return staff ? uid : null;
}
async function daily(cle, chemin, corps) {
  const ctl = new AbortController();
  const minuterie = setTimeout(() => ctl.abort(), DAILY_MAX_MS);
  try {
    const r = await fetch(`${DAILY}${chemin}`, {
      method: corps === void 0 ? "GET" : "POST",
      headers: { Authorization: `Bearer ${cle}`, "content-type": "application/json" },
      ...corps === void 0 ? {} : { body: JSON.stringify(corps) },
      signal: ctl.signal
    });
    const d = await r.json().catch(() => ({}));
    return { ok: r.ok, status: r.status, d };
  } finally {
    clearTimeout(minuterie);
  }
}
async function laSalle(sb, cle, l) {
  if (l.salle && l.salle_url) return { nom: l.salle, url: l.salle_url };
  const nom = `mnd-${l.id}`;
  const exp = Math.floor(Date.parse(l.fin) / 1e3);
  const nbf = Math.floor((Date.parse(l.debut) - AVANT_L_ENTREE_MIN * 6e4) / 1e3);
  let r = await daily(cle, "/rooms", {
    name: nom,
    privacy: "private",
    properties: { nbf, exp, eject_at_room_exp: true, max_participants: 3, enable_chat: false, lang: "fr" }
  });
  if (!r.ok) r = await daily(cle, `/rooms/${nom}`);
  const url = typeof r.d.url === "string" ? r.d.url : "";
  if (!r.ok || !url) throw new Error(`salle ${r.status}`);
  await sb.from("visios").update({ salle: nom, salle_url: url, maj_le: (/* @__PURE__ */ new Date()).toISOString() }).eq("id", l.id);
  return { nom, url };
}
async function uneEntree(cle, salle, fin, nom, maison) {
  const r = await daily(cle, "/meeting-tokens", {
    properties: { room_name: salle, exp: Math.floor(Date.parse(fin) / 1e3), eject_at_token_exp: true, user_name: nom, is_owner: maison, lang: "fr" }
  });
  const t = typeof r.d.token === "string" ? r.d.token : "";
  if (!r.ok || !t) throw new Error(`jeton ${r.status}`);
  return t;
}
async function entre(sb, cle, l, nom, maison) {
  const maintenant = Date.now();
  if (l.statut === "annulée") return json({ ok: false, motif: "annulee" });
  if (maintenant >= Date.parse(l.fin)) return json({ ok: false, motif: "fermee", resume: resumeSur(l.resume) });
  if (maintenant < Date.parse(l.debut) - AVANT_L_ENTREE_MIN * 6e4) return json({ ok: false, motif: "trop-tot", debut: l.debut, fin: l.fin });
  const salle = await laSalle(sb, cle, l);
  const jeton = await uneEntree(cle, salle.nom, l.fin, nom, maison);
  dis("entrée", { id: l.id, maison });
  return json({ ok: true, url: `${salle.url}?t=${encodeURIComponent(jeton)}`, debut: l.debut, fin: l.fin });
}
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method === "GET") return json({ ok: true, fonction: "visio-salle" });
  if (req.method !== "POST") return json({ ok: false, motif: "POST seulement" }, 405);
  const url = (Deno.env.get("SUPABASE_URL") ?? "").trim();
  const service = (Deno.env.get("CLE_SERVICE") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "").trim();
  const cle = (Deno.env.get("DAILY_API_KEY") ?? "").trim();
  if (!url || !service) return json({ ok: false, motif: "environnement" }, 500);
  const sb = createClient(url, service);
  let corps = {};
  try {
    corps = await req.json();
  } catch {
  }
  const geste = String(corps.geste ?? "");
  try {
    if (geste === "creneaux") {
      const r = await reglages(sb);
      const actif = r.actif && !!cle;
      const maintenant = Date.now();
      const creneaux = actif ? creneauxOuverts(r, maintenant, await prisDepuis(sb, new Date(maintenant).toISOString())) : [];
      return json({ ok: true, actif, cle: !!cle, creneaux });
    }
    if (geste === "reserver") {
      const r = await reglages(sb);
      if (!r.actif || !cle) return json({ ok: false, motif: "fermee" }, 409);
      const nom = String(corps.nom ?? "").trim().slice(0, 80);
      const telephone = String(corps.telephone ?? "").trim().slice(0, 30);
      const debut = String(corps.debut ?? "");
      const consultationId = typeof corps.consultationId === "string" && FORME_DE_LA_CONSULTATION.test(corps.consultationId) ? corps.consultationId : null;
      if (nom.length < 2 || numeroCourt(telephone).length < 8 || !Number.isFinite(Date.parse(debut))) return json({ ok: false, motif: "incomplet" }, 400);
      if (!await permis(sb, ipDe(req))) return json({ ok: false, motif: "rate_limited" }, 429);
      const maintenant = Date.now();
      const debutIso = new Date(Date.parse(debut)).toISOString();
      if (!creneauValide(r, maintenant, await prisDepuis(sb, new Date(maintenant).toISOString()), debutIso)) return json({ ok: false, motif: "pris" }, 409);
      const { count } = await sb.from("visios").select("*", { count: "exact", head: true }).eq("numero", numeroCourt(telephone)).eq("statut", "réservée").gte("fin", new Date(maintenant).toISOString());
      if ((count ?? 0) >= r.parTelephone) return json({ ok: false, motif: "deja" }, 409);
      const id = `vz-${aleatoire(12, "abcdefghijklmnopqrstuvwxyz0123456789")}`;
      const jeton = aleatoire(32);
      const { error } = await sb.from("visios").insert({
        id,
        consultation_id: consultationId,
        debut: debutIso,
        fin: finDe(debutIso),
        nom,
        telephone,
        numero: numeroCourt(telephone),
        jeton_hash: await empreinte(jeton),
        statut: "réservée"
      });
      if (error) return json({ ok: false, motif: /duplicate|unique/i.test(String(error.message)) ? "pris" : "ecriture" }, 409);
      if (consultationId) {
        const { data: row } = await sb.from("consultations_queue").select("id, data").eq("id", consultationId).maybeSingle();
        if (row) await sb.from("consultations_queue").update({ data: { ...row.data ?? {}, visio: { id, debut: debutIso } } }).eq("id", consultationId);
      }
      dis("réservée", { id, debut: debutIso, consultation: !!consultationId });
      return json({ ok: true, id, jeton, debut: debutIso, fin: finDe(debutIso), chemin: cheminDeLaSalle(id, jeton) });
    }
    if (geste === "etat" || geste === "entrer" || geste === "annuler") {
      const l = await parLeJeton(sb, corps.id, corps.jeton);
      if (!l) return json({ ok: false, motif: "inconnue" }, 404);
      if (geste === "etat") {
        const fermee = Date.now() >= Date.parse(l.fin);
        return json({
          ok: true,
          debut: l.debut,
          fin: l.fin,
          statut: l.statut,
          prenom: prenomDe(l.nom),
          consultationId: l.consultation_id,
          resume: fermee ? resumeSur(l.resume) : null,
          actif: !!cle
        });
      }
      if (geste === "annuler") {
        if (l.statut !== "réservée" || Date.now() >= Date.parse(l.debut)) return json({ ok: false, motif: "trop-tard" }, 409);
        await sb.from("visios").update({ statut: "annulée", maj_le: (/* @__PURE__ */ new Date()).toISOString() }).eq("id", l.id);
        dis("annulée par la cliente", { id: l.id });
        return json({ ok: true });
      }
      if (!cle) return json({ ok: false, motif: "sans-service" }, 503);
      return await entre(sb, cle, l, prenomDe(l.nom) || "Cliente", false);
    }
    if (geste === "entrer-maison") {
      if (!await delEquipe(sb, req)) return json({ ok: false, motif: "reserve-a-l-equipe" }, 403);
      if (typeof corps.id !== "string" || !FORME_DE_L_ID.test(corps.id)) return json({ ok: false, motif: "inconnue" }, 404);
      const { data } = await sb.from("visios").select("*").eq("id", corps.id).maybeSingle();
      if (!data) return json({ ok: false, motif: "inconnue" }, 404);
      if (!cle) return json({ ok: false, motif: "sans-service" }, 503);
      return await entre(sb, cle, data, "Maison MND", true);
    }
    return json({ ok: false, motif: "geste inconnu" }, 400);
  } catch (e) {
    dis("erreur", { geste, motif: String(e?.message ?? e).slice(0, 120) });
    return json({ ok: false, motif: "erreur" }, 500);
  }
});
