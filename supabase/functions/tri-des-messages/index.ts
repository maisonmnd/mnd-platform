// @ts-nocheck : fichier REGROUPÉ, ne pas modifier à la main.
/* ═══════════════════════════════════════════════════════════════════
   TRI-DES-MESSAGES : le tri des démarcheurs sur WhatsApp (29 octobre 2026).
   Fichier fabriqué par `node scripts/tri-des-messages-serveur.mjs` depuis
   `scripts/serveur/tri-des-messages.ts` et les règles pures du dépôt
   (shared/tri-des-messages-pur) : on ne le corrige jamais ici, on corrige le
   dépôt et on refait le fichier.
   Appelée par whatsapp-automate au premier message d'un numéro inconnu, et
   par le Trône pour bloquer, débloquer et relire les dernières 24 heures.
   AUCUN SECRET ICI : CLE_SERVICE, SUPABASE_URL, SUPABASE_ANON_KEY,
   ANTHROPIC_API_KEY, WA_TOKEN, WA_PHONE_ID viennent de l'environnement
   (déjà posés pour les autres fonctions).
   Déploiement : Supabase → Edge Functions → Deploy a new function
   « tri-des-messages » → coller CE FICHIER ENTIER → Deploy → « Verify JWT »
   DÉCOCHÉ (les deux portes sont jugées ici). Vérifier : son adresse répond
   sa version, claude « oui » et meta « oui ».
   ═══════════════════════════════════════════════════════════════════ */
// scripts/serveur/tri-des-messages.ts
import { createClient } from "npm:@supabase/supabase-js@2";

// src/shared/tri-des-messages-pur.ts
var CLE_DU_TRI = "mnd_tri_des_messages";
var VERDICTS_DU_TRI = ["cliente", "demarchage", "proposition", "doute"];
var cleDuTri = (numero) => {
  const d = String(numero ?? "").replace(/\D/g, "");
  return d.length === 13 && d.startsWith("22901") ? `229${d.slice(5)}` : d;
};
var objet = (x) => x && typeof x === "object" && !Array.isArray(x) ? x : {};
function triLu(brut) {
  const o = objet(brut);
  return {
    bloques: objet(o.bloques),
    propositions: objet(o.propositions),
    blancs: objet(o.blancs),
    juges: objet(o.juges)
  };
}
function etatDuNumero(tri, numero) {
  const k = cleDuTri(numero);
  if (!k) return "inconnu";
  if (tri.blancs[k]) return "blanc";
  if (tri.bloques[k]) return "bloque";
  if (tri.propositions[k]) return "proposition";
  if (tri.juges[k]) return "juge";
  return "inconnu";
}
var extraitDe = (textes) => textes.map((t) => String(t ?? "").replace(/\s+/g, " ").trim()).filter(Boolean).join(" · ").slice(0, 180);
var sans = (r, k) => {
  const { [k]: _, ...reste } = r;
  return reste;
};
function avecUnBloque(tri, e) {
  const k = cleDuTri(e.numero);
  return { ...tri, bloques: { ...tri.bloques, [k]: e }, propositions: sans(tri.propositions, k), juges: sans(tri.juges, k), blancs: sans(tri.blancs, k) };
}
function avecUneProposition(tri, e) {
  const k = cleDuTri(e.numero);
  return { ...tri, propositions: { ...tri.propositions, [k]: e }, juges: sans(tri.juges, k) };
}
function avecUnJugement(tri, numero, verdict, quand) {
  return { ...tri, juges: { ...tri.juges, [cleDuTri(numero)]: { verdict, quand } } };
}
function rendu(tri, numero, quand) {
  const k = cleDuTri(numero);
  return { bloques: sans(tri.bloques, k), propositions: sans(tri.propositions, k), juges: sans(tri.juges, k), blancs: { ...tri.blancs, [k]: quand } };
}
function consigneDuTri() {
  return [
    "Tu tries le PREMIER message qu’un numéro inconnu envoie au WhatsApp de la Maison MND, une maison de soin et de création de locks (dreadlocks) à Cotonou.",
    "Tu ne réponds pas à la personne : tu dis seulement dans quelle boîte son message va.",
    "",
    "Les verdicts :",
    '- "cliente" : la personne veut un service de la Maison, pour elle ou pour un proche : un rendez-vous, un prix, une question sur ses cheveux ou ses locks, une commande, une information pratique, une réclamation. Aussi un simple bonjour, un message vide, une photo de ses cheveux, ou un message que tu ne comprends pas.',
    '- "demarchage" : la personne VEND ou PROPOSE quelque chose à la Maison qui ne concerne pas les cheveux ni le métier : publicité, marketing, réseaux sociaux, abonnés, affiches, vidéos, sites web, applications, référencement, prêts, assurances, placements, cryptomonnaie, loterie, chaîne de messages.',
    '- "proposition" : la personne propose à la Maison quelque chose qui concerne les cheveux ou le métier : produits capillaires, huiles, matériel, formation, partenariat, collaboration autour des cheveux, ou une coiffeuse qui cherche du travail.',
    '- "doute" : tu n’es pas sûr.',
    "",
    "Les règles :",
    '- Dans le doute, "doute" : un message bloqué à tort fait perdre une cliente.',
    '- Quelqu’un qui demande un service pour lui-même est "cliente", même avec un lien ou une photo.',
    "- Un lien seul ne suffit pas : il faut que la personne vende quelque chose à la Maison.",
    "- Le motif : une phrase courte en français, sans nom propre ni numéro (par exemple « services numériques : affiches, vidéos, sites web »).",
    "",
    "Réponds uniquement par l’outil demandé."
  ].join("\n");
}
var SCHEMA_DU_TRI = {
  type: "object",
  properties: {
    verdict: { type: "string", enum: [...VERDICTS_DU_TRI], description: "La boîte du message." },
    motif: { type: "string", description: "Pourquoi, en une phrase courte, sans nom propre ni numéro." }
  },
  required: ["verdict", "motif"],
  additionalProperties: false
};
function contexteDuTri(o) {
  const lignes = o.textes.map((t) => String(t ?? "").trim()).filter(Boolean).slice(0, 3).map((t) => t.slice(0, 1200));
  return [
    `Le nom que WhatsApp annonce : ${String(o.nomProfil ?? "").trim().slice(0, 80) || "aucun"}.`,
    "",
    "Son message :",
    ...lignes.map((t) => `« ${t} »`)
  ].join("\n");
}
function lectureDuTri(entree) {
  const o = objet(entree);
  const verdict = o.verdict;
  if (typeof verdict !== "string" || !VERDICTS_DU_TRI.includes(verdict)) return null;
  const motif = String(o.motif ?? "").replace(/\s+/g, " ").replace(/\s*—\s*/g, ", ").replace(/\d{6,}/g, "").trim().slice(0, 140);
  return { verdict, motif: motif || (verdict === "demarchage" ? "démarchage" : verdict === "proposition" ? "proposition" : "") };
}

// scripts/serveur/tri-des-messages.ts
var VERSION = "2026-10-29-a";
var MODELES = ["claude-haiku-5-5", "claude-sonnet-5-5"];
var TARIFS = {
  "claude-haiku-5-5": { entree: 1, sortie: 5 },
  "claude-sonnet-5-5": { entree: 3, sortie: 15 }
};
var CLE_DU_COMPTE = "mnd_tri_compte";
var DELAI_CLAUDE_MS = 15e3;
var DELAI_META_MS = 1e4;
var PASSE_MAX = 20;
var json = (corps, status = 200) => new Response(JSON.stringify(corps), { status, headers: { "content-type": "application/json" } });
var dis = (quoi, o = {}) => console.log(`tri-des-messages · ${quoi} · ${JSON.stringify(o)}`);
var jourDeLaMaison = (ms) => new Date(ms + 36e5).toISOString().slice(0, 10);
async function juge(cle, sb, o) {
  const corps = {
    max_tokens: 200,
    system: consigneDuTri(),
    messages: [{ role: "user", content: contexteDuTri(o) }],
    tools: [{ name: "trie", description: "La boîte du message, et pourquoi.", input_schema: SCHEMA_DU_TRI }],
    tool_choice: { type: "tool", name: "trie" }
  };
  for (const modele of MODELES) {
    let status = 0;
    let lu = {};
    try {
      const r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        signal: AbortSignal.timeout(DELAI_CLAUDE_MS),
        headers: { "content-type": "application/json", "x-api-key": cle, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({ model: modele, ...corps })
      });
      status = r.status;
      const texte = await r.text();
      try {
        lu = JSON.parse(texte);
      } catch {
        lu = { error: { message: texte.slice(0, 200) } };
      }
    } catch (e) {
      dis("claude injoignable", { motif: String(e?.message ?? e).slice(0, 80) });
      return null;
    }
    if ((status === 404 || status === 400) && /model/i.test(String(lu.error?.message ?? ""))) continue;
    if (status < 200 || status >= 300) {
      dis("claude refuse", { status });
      return null;
    }
    await compteLAppel(sb, modele, lu.usage);
    return lectureDuTri(lu.content?.find((c) => c.type === "tool_use" && c.name === "trie")?.input);
  }
  return null;
}
async function compteLAppel(sb, modele, usage) {
  try {
    const mois = jourDeLaMaison(Date.now()).slice(0, 7);
    const { data } = await sb.from("documents").select("data").eq("key", CLE_DU_COMPTE).maybeSingle();
    const avant = data?.data ?? {};
    const t = TARIFS[modele] ?? TARIFS["claude-sonnet-5-5"];
    const e = Number(usage?.input_tokens ?? 0);
    const so = Number(usage?.output_tokens ?? 0);
    const m = avant[mois] ?? {};
    await sb.from("documents").upsert({ key: CLE_DU_COMPTE, data: { ...avant, [mois]: {
      appels: (m.appels ?? 0) + 1,
      entree: (m.entree ?? 0) + e,
      sortie: (m.sortie ?? 0) + so,
      usd: Math.round(((m.usd ?? 0) + (e * t.entree + so * t.sortie) / 1e6) * 1e4) / 1e4
    } } });
  } catch (e) {
    dis("compte non ecrit", { motif: String(e?.message ?? e).slice(0, 80) });
  }
}
async function bloqueChezMeta(methode, numero) {
  const jeton = (Deno.env.get("WA_TOKEN") ?? "").trim();
  const tel = (Deno.env.get("WA_PHONE_ID") ?? "").trim();
  if (!jeton || !tel) {
    dis("cles Meta absentes");
    return false;
  }
  try {
    const r = await fetch(`https://graph.facebook.com/v20.0/${tel}/block_users`, {
      method: methode,
      signal: AbortSignal.timeout(DELAI_META_MS),
      headers: { authorization: `Bearer ${jeton}`, "content-type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", block_users: [{ user: numero }] })
    });
    const rep = await r.json().catch(() => ({}));
    const ok = r.ok && !rep?.error;
    if (!ok) dis(methode === "POST" ? "meta refuse le blocage" : "meta refuse le deblocage", { status: r.status, code: rep?.error?.code ?? null });
    return ok;
  } catch (e) {
    dis("meta injoignable", { motif: String(e?.message ?? e).slice(0, 80) });
    return false;
  }
}
async function litLeTri(sb) {
  const { data, error } = await sb.from("documents").select("data").eq("key", CLE_DU_TRI).maybeSingle();
  if (error) throw new Error(`registre illisible : ${error.message}`);
  return triLu(data?.data);
}
async function ecritLeTri(sb, tri) {
  const { error } = await sb.from("documents").upsert({ key: CLE_DU_TRI, data: tri });
  if (error) throw new Error(`registre non ecrit : ${error.message}`);
}
async function estConnu(sb, numero) {
  const { data: fiches, error } = await sb.rpc("fiches_du_numero", { n: numero });
  if (error || !Array.isArray(fiches)) return null;
  if (fiches.some((f) => typeof f?.id === "string" && f.id)) return true;
  const { data: sortants, error: e2 } = await sb.from("messages_wa").select("id").eq("data->>numero", numero).eq("data->>sens", "sortant").limit(1);
  if (e2) return null;
  return (sortants ?? []).length > 0;
}
async function previensDUneProposition(base, service, e) {
  try {
    await fetch(`${base}/functions/v1/push-notify`, {
      method: "POST",
      signal: AbortSignal.timeout(DELAI_META_MS),
      headers: { "content-type": "application/json", authorization: `Bearer ${service}` },
      body: JSON.stringify({
        mode: "staff",
        title: "Maison MND · une proposition",
        body: `${e.nom || "Un numéro inconnu"} : ${e.motif}`.slice(0, 160),
        url: "/trone/#/gerard?vue=conversations&filtre=propositions"
      })
    });
  } catch (err) {
    dis("notification non partie", { motif: String(err?.message ?? err).slice(0, 80) });
  }
}
async function pourLAutomate(sb, cleClaude, base, service, d) {
  const numero = String(d.numero ?? "");
  if (!/^\d{8,15}$/.test(numero)) return json({ ok: false, motif: "numero", version: VERSION }, 400);
  const textes = (Array.isArray(d.textes) ? d.textes : []).map((t) => String(t ?? "")).filter((t) => t.trim()).slice(0, 3);
  const nom = String(d.nomProfil ?? "").trim().slice(0, 80);
  let tri = await litLeTri(sb);
  const etat = etatDuNumero(tri, numero);
  if (etat === "bloque" || etat === "proposition") return json({ ok: true, verdict: etat, version: VERSION });
  if (etat === "blanc" || etat === "juge") return json({ ok: true, verdict: "passe", version: VERSION });
  if (textes.length === 0) return json({ ok: true, verdict: "passe", version: VERSION });
  const connu = await estConnu(sb, numero);
  if (connu !== false) return json({ ok: true, verdict: connu ? "connue" : "passe", version: VERSION });
  if (!cleClaude) return json({ ok: true, verdict: "passe", motif: "cle-claude-absente", version: VERSION });
  const lu = await juge(cleClaude, sb, { textes, nomProfil: nom });
  if (!lu) return json({ ok: true, verdict: "passe", motif: "claude", version: VERSION });
  const quand = (/* @__PURE__ */ new Date()).toISOString();
  const entree = { numero, quand, motif: lu.motif, extrait: extraitDe(textes), ...nom ? { nom } : {}, par: "claude" };
  tri = await litLeTri(sb);
  if (lu.verdict === "demarchage") {
    const pose = await bloqueChezMeta("POST", numero);
    await ecritLeTri(sb, avecUnBloque(tri, { ...entree, meta: pose ? "bloque" : "echec" }));
    dis("bloque", { meta: pose });
    return json({ ok: true, verdict: "bloque", version: VERSION });
  }
  if (lu.verdict === "proposition") {
    await ecritLeTri(sb, avecUneProposition(tri, entree));
    await previensDUneProposition(base, service, entree);
    dis("proposition");
    return json({ ok: true, verdict: "proposition", version: VERSION });
  }
  await ecritLeTri(sb, avecUnJugement(tri, numero, lu.verdict, quand));
  dis("juge", { verdict: lu.verdict });
  return json({ ok: true, verdict: lu.verdict, version: VERSION });
}
async function pourLeTrone(sb, cleClaude, d) {
  const quand = (/* @__PURE__ */ new Date()).toISOString();
  if (d.geste === "bloquer") {
    const numeros = (Array.isArray(d.numeros) ? d.numeros : [d.numero]).map((n) => String(n ?? "").replace(/\D/g, "")).filter((n) => /^\d{8,15}$/.test(n)).slice(0, 30);
    if (numeros.length === 0) return json({ ok: false, motif: "numero", version: VERSION }, 400);
    const faits = [];
    for (const numero of numeros) {
      const connu = await estConnu(sb, numero);
      if (connu !== false) {
        faits.push({ numero, meta: false });
        continue;
      }
      const pose = await bloqueChezMeta("POST", numero);
      const tri = await litLeTri(sb);
      const avant = tri.propositions[cleDuTri(numero)];
      await ecritLeTri(sb, avecUnBloque(tri, {
        numero,
        quand,
        motif: avant?.motif ?? "bloqué à la main",
        extrait: avant?.extrait ?? "",
        ...avant?.nom ? { nom: avant.nom } : {},
        par: "direction",
        meta: pose ? "bloque" : "echec"
      }));
      faits.push({ numero, meta: pose });
    }
    const refuses = faits.filter((f) => !f.meta).length;
    return json({ ok: true, bloques: faits.filter((f) => f.meta).length, refuses, version: VERSION });
  }
  if (d.geste === "debloquer" || d.geste === "cliente") {
    const numero = String(d.numero ?? "").replace(/\D/g, "");
    if (!/^\d{8,15}$/.test(numero)) return json({ ok: false, motif: "numero", version: VERSION }, 400);
    const tri = await litLeTri(sb);
    const etaitBloque = etatDuNumero(tri, numero) === "bloque";
    const meta = etaitBloque ? await bloqueChezMeta("DELETE", numero) : true;
    await ecritLeTri(sb, rendu(tri, numero, quand));
    return json({ ok: true, meta, version: VERSION });
  }
  if (d.geste === "passe") {
    if (!cleClaude) return json({ ok: false, motif: "cle-claude-absente", version: VERSION });
    const depuis = new Date(Date.now() - 864e5).toISOString();
    const { data, error } = await sb.from("messages_wa").select("id, data").eq("data->>sens", "entrant").gte("data->>quand", depuis).limit(1e3);
    if (error) return json({ ok: false, motif: "messages", version: VERSION }, 500);
    const tri = await litLeTri(sb);
    const parNumero = /* @__PURE__ */ new Map();
    for (const l of data ?? []) {
      const n = String(l.data?.numero ?? "");
      if (!/^\d{8,15}$/.test(n) || etatDuNumero(tri, n) !== "inconnu") continue;
      const x = parNumero.get(n) ?? { textes: [], nom: "" };
      if (l.data.texte) x.textes.push(String(l.data.texte));
      if (!x.nom && l.data.nomProfil) x.nom = String(l.data.nomProfil);
      parNumero.set(n, x);
    }
    const proposes = [];
    let lus = 0;
    for (const [numero, x] of parNumero) {
      if (lus >= PASSE_MAX) break;
      if (x.textes.length === 0) continue;
      const connu = await estConnu(sb, numero);
      if (connu !== false) continue;
      lus += 1;
      const lu = await juge(cleClaude, sb, { textes: x.textes.slice(0, 3), nomProfil: x.nom });
      if (lu && (lu.verdict === "demarchage" || lu.verdict === "proposition")) {
        proposes.push({ numero, nom: x.nom, extrait: extraitDe(x.textes.slice(0, 3)), verdict: lu.verdict, motif: lu.motif });
      }
    }
    return json({ ok: true, lus, proposes, version: VERSION });
  }
  return json({ ok: false, motif: "geste", version: VERSION }, 400);
}
Deno.serve(async (req) => {
  const cleClaude = (Deno.env.get("ANTHROPIC_API_KEY") ?? "").trim();
  const meta = !!(Deno.env.get("WA_TOKEN") ?? "").trim() && !!(Deno.env.get("WA_PHONE_ID") ?? "").trim();
  const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "authorization, x-client-info, apikey, content-type", "access-control-allow-methods": "POST, GET, OPTIONS" };
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const avecCors = (r) => {
    for (const [k, v] of Object.entries(cors)) r.headers.set(k, v);
    return r;
  };
  if (req.method === "GET") return avecCors(json({ fonction: "tri-des-messages", version: VERSION, claude: cleClaude ? "oui" : "non", meta: meta ? "oui" : "non" }));
  const base = (Deno.env.get("SUPABASE_URL") ?? "").replace(/\/$/, "");
  const service = (Deno.env.get("CLE_SERVICE") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "").trim();
  const anon = (Deno.env.get("SUPABASE_ANON_KEY") ?? "").trim();
  if (!base || !service) return avecCors(json({ ok: false, motif: "configuration", version: VERSION }, 500));
  let d;
  try {
    d = await req.json();
  } catch {
    return avecCors(json({ ok: false, motif: "demande-illisible", version: VERSION }, 400));
  }
  const sb = createClient(base, service);
  const jeton = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  try {
    if (jeton && jeton === service) return avecCors(await pourLAutomate(sb, cleClaude, base, service, d));
    if (!jeton || !anon) return avecCors(json({ ok: false, motif: "porte", version: VERSION }, 401));
    const commeAppelant = createClient(base, anon, { global: { headers: { authorization: `Bearer ${jeton}` } } });
    const { data: estPersonnel, error } = await commeAppelant.rpc("is_staff");
    if (error || estPersonnel !== true) return avecCors(json({ ok: false, motif: "reserve-au-personnel", version: VERSION }, 403));
    return avecCors(await pourLeTrone(sb, cleClaude, d));
  } catch (e) {
    dis("erreur", { motif: String(e?.message ?? e).slice(0, 160) });
    return avecCors(json({ ok: false, motif: "erreur", version: VERSION }, 500));
  }
});
