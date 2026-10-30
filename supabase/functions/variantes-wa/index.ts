// @ts-nocheck : fichier REGROUPÉ, ne pas modifier à la main.
/* ═══════════════════════════════════════════════════════════════════
   VARIANTES-WA : vingt façons de dire le message d'un cas de la banque.

   Fichier fabriqué par `node scripts/variantes-wa-serveur.mjs` depuis
   `scripts/serveur/variantes-wa.ts` et le module pur du dépôt : on ne le
   corrige jamais ici, on corrige le dépôt et on refait le fichier.

   Appelée par le Trône (la banque de scénarios), avec la session du
   personnel. Claude écrit les variantes ; le Trône les range dans le cas.

   AUCUN SECRET ICI : SUPABASE_URL, SUPABASE_ANON_KEY, CLE_SERVICE,
   ANTHROPIC_API_KEY viennent de l'environnement (déjà posés).

   Déploiement : Supabase → Edge Functions → New function « variantes-wa »
   → coller CE FICHIER ENTIER → Deploy → « Verify JWT » DÉCOCHÉ (la porte
   est jugée ici : la session de la personne connectée, `is_staff`).
   Vérifier : son adresse répond sa version.
   ═══════════════════════════════════════════════════════════════════ */
// scripts/serveur/variantes-wa.ts
import { createClient } from "npm:@supabase/supabase-js@2";

// src/shared/ia-anonymise-pur.ts
var TELEPHONE = /(?:\+|00)?\d(?:[\s.\-]?\d){7,}/g;
var DATE_ISO = /^\d{4}-\d{2}-\d{2}$/;
var COURRIEL = /[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}/g;
function sansCoordonnees(texte) {
  return String(texte ?? "").replace(COURRIEL, "[adresse]").replace(TELEPHONE, (m) => DATE_ISO.test(m.trim()) ? m : "[numéro]");
}

// src/shared/variantes-wa-pur.ts
var VARIANTES_PAR_CAS = 20;
var APPELS_DE_VARIANTES_PAR_MOIS = 400;
var LONGUEUR_MAX = 300;
function consigneDesVariantes() {
  return [
    "Tu aides la Maison MND, maison de soin et de création de locks à Cotonou (Bénin), à éprouver son assistant WhatsApp.",
    "On te donne un message réel d’une cliente. Écris des variantes de ce message : la MÊME demande, dite autrement, comme d’autres clientes l’écriraient sur WhatsApp.",
    "Garde exactement la même intention, le même jour, la même heure, la même prestation, et rien de plus : n’ajoute aucune autre demande, aucun nom, aucun numéro, aucune adresse.",
    "Varie la forme : fautes de frappe et d’orthographe phonétique, abréviations (rdv, svp, stp, bjr, cc, pr, ds), sans accents ni majuscules, ponctuation libre, tournures du français parlé à Cotonou, un message coupé en deux lignes ; deux ou trois en anglais.",
    "Chaque variante est différente des autres et de l’original. Une variante par entrée, 300 signes au plus.",
    "Réponds uniquement par l’objet demandé."
  ].join("\n");
}
var SCHEMA_DES_VARIANTES = {
  type: "object",
  properties: {
    variantes: { type: "array", items: { type: "string" }, description: `${VARIANTES_PAR_CAS} variantes du message.` }
  },
  required: ["variantes"],
  additionalProperties: false
};
var demandeDesVariantes = (texte) => `Le message de la cliente :
« ${String(texte ?? "").trim()} »

Écris ${VARIANTES_PAR_CAS} variantes.`;
var plat = (t) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
function lectureDesVariantes(brut, original) {
  const b = brut && typeof brut === "object" ? brut : {};
  const vus = /* @__PURE__ */ new Set([plat(original)]);
  const out = [];
  for (const v of Array.isArray(b.variantes) ? b.variantes : []) {
    if (typeof v !== "string") continue;
    const t = sansCoordonnees(v).replace(/[ \t]+/g, " ").trim();
    if (!t || t.length > LONGUEUR_MAX) continue;
    const k = plat(t);
    if (!k || vus.has(k)) continue;
    vus.add(k);
    out.push(t);
    if (out.length >= VARIANTES_PAR_CAS) break;
  }
  return out;
}

// scripts/serveur/variantes-wa.ts
var VERSION = "2026-10-30-a";
var MODELES = ["claude-haiku-5-5", "claude-sonnet-5-5"];
var TARIFS = {
  "claude-haiku-5-5": { entree: 0.1, sortie: 0.5 },
  "claude-sonnet-5-5": { entree: 2, sortie: 10 }
};
var CLE_DU_COMPTE = "mnd_variantes_wa_compte";
var DELAI_CLAUDE_MS = 25e3;
var CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS"
};
var json = (corps, status = 200) => new Response(JSON.stringify(corps), { status, headers: { ...CORS, "content-type": "application/json" } });
var dis = (quoi, o = {}) => console.log(`variantes-wa · ${quoi} · ${JSON.stringify(o)}`);
var moisDeLaMaison = (ms) => new Date(ms + 36e5).toISOString().slice(0, 7);
async function appelleClaude(cle, corps) {
  const arret = new AbortController();
  const minuterie = setTimeout(() => arret.abort(), DELAI_CLAUDE_MS);
  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      signal: arret.signal,
      headers: { "content-type": "application/json", "x-api-key": cle, "anthropic-version": "2023-06-01" },
      body: JSON.stringify(corps)
    });
    const texte = await r.text();
    let lu;
    try {
      lu = JSON.parse(texte);
    } catch {
      lu = { error: { message: texte.slice(0, 200) } };
    }
    return { status: r.status, corps: lu };
  } finally {
    clearTimeout(minuterie);
  }
}
var modeleInconnu = (status, c) => (status === 404 || status === 400) && /model/i.test(String(c.error?.message ?? ""));
Deno.serve(async (req) => {
  const cleClaude = (Deno.env.get("ANTHROPIC_API_KEY") ?? "").trim();
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method === "GET") return json({ fonction: "variantes-wa", version: VERSION, claude: cleClaude ? "oui" : "non" });
  if (req.method !== "POST") return json({ ok: false, motif: "POST seulement", version: VERSION }, 405);
  const url = (Deno.env.get("SUPABASE_URL") ?? "").trim();
  const anon = (Deno.env.get("SUPABASE_ANON_KEY") ?? "").trim();
  const service = (Deno.env.get("CLE_SERVICE") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "").trim();
  const jeton = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!url || !anon || !service) return json({ ok: false, motif: "environnement", version: VERSION }, 500);
  if (!cleClaude) return json({ ok: false, motif: "cle-claude-absente", version: VERSION });
  const commeAppelant = createClient(url, anon, { global: { headers: { authorization: `Bearer ${jeton}` } } });
  const { data: estPersonnel, error: errStaff } = await commeAppelant.rpc("is_staff");
  if (errStaff || estPersonnel !== true) return json({ ok: false, motif: "reserve-au-personnel", version: VERSION }, 403);
  let d = {};
  try {
    d = await req.json();
  } catch {
    return json({ ok: false, motif: "demande-illisible", version: VERSION }, 400);
  }
  const texte = sansCoordonnees(typeof d.texte === "string" ? d.texte : "").trim().slice(0, 600);
  if (!texte) return json({ ok: false, motif: "texte", version: VERSION }, 400);
  const sb = createClient(url, service);
  const maintenant = Date.now();
  const mois = moisDeLaMaison(maintenant);
  try {
    const { data: lu } = await sb.from("documents").select("data").eq("key", CLE_DU_COMPTE).maybeSingle();
    const compte = lu?.data ?? {};
    if ((compte[mois]?.appels ?? 0) >= APPELS_DE_VARIANTES_PAR_MOIS) {
      dis("plafond du mois");
      return json({ ok: false, motif: "plafond", version: VERSION });
    }
    let rendu = null;
    let modele = MODELES[0];
    for (const m of MODELES) {
      modele = m;
      rendu = await appelleClaude(cleClaude, {
        model: m,
        max_tokens: 2500,
        system: consigneDesVariantes(),
        messages: [{ role: "user", content: demandeDesVariantes(texte) }],
        tools: [{ name: "variantes", description: "Les variantes du message.", input_schema: SCHEMA_DES_VARIANTES }],
        tool_choice: { type: "tool", name: "variantes" }
      });
      if (modeleInconnu(rendu.status, rendu.corps)) continue;
      break;
    }
    if (!rendu || rendu.status < 200 || rendu.status >= 300) {
      dis("claude refuse", { status: rendu?.status ?? 0, genre: rendu?.corps.error?.type ?? "" });
      return json({ ok: false, motif: "claude", version: VERSION });
    }
    const entree = rendu.corps.content?.find((c) => c.type === "tool_use" && c.name === "variantes")?.input;
    const variantes = lectureDesVariantes(entree, texte);
    const t = TARIFS[modele] ?? TARIFS["claude-sonnet-5-5"];
    const e = Number(rendu.corps.usage?.input_tokens ?? 0);
    const so = Number(rendu.corps.usage?.output_tokens ?? 0);
    const m0 = compte[mois] ?? {};
    await sb.from("documents").upsert({
      key: CLE_DU_COMPTE,
      data: { ...compte, [mois]: {
        appels: (m0.appels ?? 0) + 1,
        entree: (m0.entree ?? 0) + e,
        sortie: (m0.sortie ?? 0) + so,
        usd: Math.round(((m0.usd ?? 0) + (e * t.entree + so * t.sortie) / 1e6) * 1e4) / 1e4
      } }
    });
    dis("variantes", { modele, nombre: variantes.length });
    if (variantes.length === 0) return json({ ok: false, motif: "modele", version: VERSION });
    return json({ ok: true, variantes, version: VERSION });
  } catch (e) {
    dis("erreur", { motif: String(e?.message ?? e).slice(0, 120) });
    return json({ ok: false, motif: "erreur", version: VERSION });
  }
});
