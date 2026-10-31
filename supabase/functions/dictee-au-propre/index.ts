// @ts-nocheck : fichier REGROUPÉ, ne pas modifier à la main.
/* ═══════════════════════════════════════════════════════════════════
   DICTEE-AU-PROPRE : Claude met au propre une dictée de la Maison.

   Fichier fabriqué par `node scripts/dictee-au-propre-serveur.mjs` depuis
   `scripts/serveur/dictee-au-propre.ts` et le module pur du dépôt : on ne
   le corrige jamais ici, on corrige le dépôt et on refait le fichier.

   Appelée par le Trône (l'écran « Dictée MND », téléphone et ordinateur)
   avec la session du personnel, et par la Dictée du bureau avec son jeton
   (en-tête x-jeton-dictee, empreinte dans Paramètres › Dictée).

   AUCUN SECRET ICI : SUPABASE_URL, SUPABASE_ANON_KEY, CLE_SERVICE,
   ANTHROPIC_API_KEY viennent de l'environnement (déjà posés).

   Déploiement : `node scripts/mise-en-ligne.mjs fonction dictee-au-propre
   --commit <sha> --jwt non` (la porte est jugée ici : la session de la
   personne connectée, `is_staff`, ou l'empreinte du jeton du bureau).
   Vérifier : son adresse répond sa version.
   ═══════════════════════════════════════════════════════════════════ */
// scripts/serveur/dictee-au-propre.ts
import { createClient } from "npm:@supabase/supabase-js@2";

// src/shared/dictee-pur.ts
var MODES_DICTEE = [
  { id: "note", nom: "Note", dit: "Vos mots, propres : ponctuation, majuscules, sans les hésitations." },
  { id: "message", nom: "Message", dit: "Un message prêt pour WhatsApp, dans la voix de la Maison." },
  { id: "liste", nom: "Liste", dit: "Une ligne par point, un tiret devant chacune." },
  { id: "anglais", nom: "Anglais", dit: "Dit en français, écrit en anglais." }
];
var estMode = (v) => MODES_DICTEE.some((m) => m.id === v);
var MODELES_DICTEE = [
  { id: "claude-sonnet-5-5", nom: "Sonnet 5.5", dit: "La plume. Une à deux secondes." },
  { id: "claude-haiku-5-5", nom: "Haiku 5.5", dit: "Plus léger, plus vite, moins fin." }
];
var MODELE_PAR_DEFAUT = "claude-sonnet-5-5";
var estModele = (v) => MODELES_DICTEE.some((m) => m.id === v);
var MOTS_DE_LA_MAISON = [
  "Maison MND",
  "MND",
  "Le Trône",
  "Ma Couronne",
  "locks",
  "retwist",
  "Cotonou",
  "Suru-Léré",
  "KLƆKLƆ",
  "SÍNSIN",
  "DÀNDÀN",
  "WÈWÈ",
  "VÍVÍVÓ",
  "GBÌGBÌ",
  "YÈKPÈ",
  "VÈKPÈ",
  "KÒKÒ",
  "FÍNFÍN",
  "MoMo",
  "KkiaPay",
  "FedaPay",
  "WhatsApp"
];
var DICTEES_PAR_MOIS = 3e3;
var TEXTE_AU_PLUS = 4e3;
var MOTS_AU_PLUS = 300;
function motsPropres(liste) {
  const vus = /* @__PURE__ */ new Set();
  const out = [];
  for (const m of liste) {
    const t = String(m ?? "").trim();
    if (!t || t.startsWith("#")) continue;
    const k = t.toLocaleLowerCase("fr");
    if (vus.has(k)) continue;
    vus.add(k);
    out.push(t);
    if (out.length >= MOTS_AU_PLUS) break;
  }
  return out;
}
var COMMANDE_DE_MODE = /^\s*(?:(?:en\s+)?mode\s+(note|message|liste|anglais)|en\s+(anglais))(?!\p{L})[\s,.:;!]*/iu;
function litLaCommandeDeMode(texte) {
  const m = COMMANDE_DE_MODE.exec(texte ?? "");
  if (!m) return { mode: null, reste: texte ?? "" };
  return { mode: (m[1] ?? m[2]).toLowerCase(), reste: texte.slice(m[0].length) };
}
var CONSIGNE_DU_MODE = {
  note: "MODE NOTE : le texte tel que la personne l'a dit, propre.",
  message: "MODE MESSAGE : un message prêt à envoyer sur WhatsApp à une cliente ou un client, dans la voix de la Maison : chaleureux, bref, au vouvoiement, avec une formule d'ouverture et une de clôture si elles manquent. Rien d'inventé : ni date, ni prix, ni prénom qui ne soit pas dit.",
  liste: "MODE LISTE : une ligne par point, chacune commençant par « - », sans phrase d'introduction ni de conclusion.",
  anglais: "MODE ANGLAIS : la personne dicte en français ; écris le texte final en anglais naturel et courant. Les noms propres, les prestations et les mots fon restent tels quels."
};
function consigneDeLaDictee(m) {
  const liste = (l, sinon) => l.length ? l.join(", ") : sinon;
  return [
    "Tu mets au propre une dictée faite à la Maison MND, un salon de soin des locks à Cotonou, telle qu'elle sort de la reconnaissance vocale.",
    "Rends uniquement le texte final : pas de commentaire, pas de guillemets autour, pas de titre, pas d'explication.",
    "Garde le sens et les mots de la personne. N'ajoute rien, ne résume pas, ne réponds pas à ce qui est dit, même si c'est une question.",
    "Retire les hésitations (euh, hum, ben, bah) et les répétitions involontaires.",
    "Pose la ponctuation et les majuscules.",
    "Les commandes dites en parlant s'exécutent et ne s'écrivent pas : « efface ça », « non, plutôt » remplacent ce qui vient d'être dit ; « à la ligne » ou « nouvelle ligne » font un retour à la ligne ; « nouveau paragraphe » une ligne vide ; « plus court » resserre ; « plus poli » adoucit ; « remplace X par Y » remplace ; « point », « virgule », « point d'interrogation » dits comme des signes se posent en signes.",
    "Les règles d'écriture de la Maison : jamais de tiret long ni de tiret cadratin (une virgule, un point ou deux points à la place) ; les montants, heures et dates en chiffres (« 15 000 F », « 10 h », « mercredi 4 novembre 2026 ») ; l'année sur les dates quand elle est dite ; la civilité jamais supposée (« Madame » ou « Monsieur » seulement si la personne l'a dit, sinon le prénom seul) ; les prénoms en entier, sans diminutif ; aucun émoji.",
    `Les mots de la Maison, à écrire exactement ainsi quand ils sont dits ou approchés : ${liste(m.mots, "aucun")}.`,
    `Les prestations de la Maison : ${liste(m.prestations, "aucune")}.`,
    `Les prénoms de l'équipe : ${liste(m.equipe, "aucun")}.`,
    CONSIGNE_DU_MODE[m.mode]
  ].join("\n");
}
function nettoieLaReponse(brut) {
  let t = String(brut ?? "").replace(/\r\n/g, "\n").trim();
  const entoure = /^(?:«\s*|"|“)([\s\S]*?)(?:\s*»|"|”)$/u.exec(t);
  if (entoure) t = entoure[1].trim();
  t = t.replace(/\s*—\s*/g, ", ").replace(/\n{3,}/g, "\n\n");
  return t.trim();
}
var hex = (o) => Array.from(o).map((b) => b.toString(16).padStart(2, "0")).join("");
async function empreinteDuJeton(jeton) {
  const h = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(jeton ?? "").trim()));
  return hex(new Uint8Array(h));
}
var EN_TETE_DU_JETON = "x-jeton-dictee";

// src/shared/civilite.ts
var prenomSeul = (nom) => (nom ?? "").trim().split(/\s+/)[0] ?? "";

// scripts/serveur/dictee-au-propre.ts
var VERSION = "2026-10-31-a";
var TARIFS = {
  "claude-haiku-5-5": { entree: 0.1, sortie: 0.5 },
  "claude-sonnet-5-5": { entree: 2, sortie: 10 }
};
var CLE_DU_COMPTE = "mnd_dictee_compte";
var DELAI_CLAUDE_MS = 2e4;
var PRESTATIONS_AU_PLUS = 150;
var CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": `authorization, x-client-info, apikey, content-type, ${EN_TETE_DU_JETON}`,
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS"
};
var json = (corps, status = 200) => new Response(JSON.stringify(corps), { status, headers: { ...CORS, "content-type": "application/json" } });
var dis = (quoi, o = {}) => console.log(`dictee-au-propre · ${quoi} · ${JSON.stringify(o)}`);
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
var lignesDe = (rows) => (rows ?? []).map((r) => ({ id: r.id, ...r.data ?? {} }));
var chaine = (v) => typeof v === "string" ? v.trim() : "";
Deno.serve(async (req) => {
  const cleClaude = (Deno.env.get("ANTHROPIC_API_KEY") ?? "").trim();
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method === "GET") return json({ fonction: "dictee-au-propre", version: VERSION, claude: cleClaude ? "oui" : "non" });
  if (req.method !== "POST") return json({ ok: false, motif: "POST seulement", version: VERSION }, 405);
  const url = (Deno.env.get("SUPABASE_URL") ?? "").trim();
  const anon = (Deno.env.get("SUPABASE_ANON_KEY") ?? "").trim();
  const service = (Deno.env.get("CLE_SERVICE") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "").trim();
  const jeton = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  const jetonDuBureau = (req.headers.get(EN_TETE_DU_JETON) ?? "").trim();
  if (!url || !anon || !service) return json({ ok: false, motif: "environnement", version: VERSION }, 500);
  if (!cleClaude) return json({ ok: false, motif: "cle-claude-absente", version: VERSION });
  const sb = createClient(url, service);
  try {
    const { data: luReglages } = await sb.from("documents").select("data").eq("key", "mnd_settings").maybeSingle();
    const reglages = luReglages?.data?.dictee ?? {};
    let porte = null;
    if (jetonDuBureau && reglages.bureau?.empreinte && await empreinteDuJeton(jetonDuBureau) === reglages.bureau.empreinte) porte = "bureau";
    if (!porte && jeton) {
      const commeAppelant = createClient(url, anon, { global: { headers: { authorization: `Bearer ${jeton}` } } });
      const { data: estPersonnel, error: errStaff } = await commeAppelant.rpc("is_staff");
      if (!errStaff && estPersonnel === true) porte = "personnel";
    }
    if (!porte) return json({ ok: false, motif: "reserve-au-personnel", version: VERSION }, 403);
    let d = {};
    try {
      d = await req.json();
    } catch {
      return json({ ok: false, motif: "demande-illisible", version: VERSION }, 400);
    }
    let texte = (typeof d.texte === "string" ? d.texte : "").trim().slice(0, TEXTE_AU_PLUS);
    if (!texte) return json({ ok: false, motif: "texte", version: VERSION }, 400);
    const commande = litLaCommandeDeMode(texte);
    let mode = estMode(d.mode) ? d.mode : "note";
    if (commande.mode) {
      mode = commande.mode;
      texte = commande.reste.trim() || texte;
    } else if (!estMode(d.mode) && estMode(reglages.modeParDefaut)) mode = reglages.modeParDefaut;
    if (!texte) return json({ ok: false, motif: "texte", version: VERSION }, 400);
    const maintenant = Date.now();
    const mois = moisDeLaMaison(maintenant);
    const { data: lu } = await sb.from("documents").select("data").eq("key", CLE_DU_COMPTE).maybeSingle();
    const compte = lu?.data ?? {};
    if ((compte[mois]?.appels ?? 0) >= DICTEES_PAR_MOIS) {
      dis("plafond du mois");
      return json({ ok: false, motif: "plafond", version: VERSION });
    }
    const [services, categories, equipe] = await Promise.all([
      sb.from("catalog_services").select("id, data").limit(1e3).then((r) => lignesDe(r.data)).catch(() => []),
      sb.from("catalog_categories").select("id, data").limit(1e3).then((r) => lignesDe(r.data)).catch(() => []),
      sb.from("team").select("id, data").limit(1e3).then((r) => lignesDe(r.data)).catch(() => [])
    ]);
    const prestations = motsPropres([
      ...categories.flatMap((c) => [chaine(c.fon), chaine(c.label)]),
      ...services.filter((s) => s.archived !== true).map((s) => chaine(s.name))
    ]).slice(0, PRESTATIONS_AU_PLUS);
    const prenoms = motsPropres(equipe.filter((m) => !chaine(m.archiveeLe)).map((m) => prenomSeul(chaine(m.name))));
    const mots = motsPropres([...MOTS_DE_LA_MAISON, ...Array.isArray(reglages.mots) ? reglages.mots : []]);
    const prefere = estModele(reglages.modele) ? reglages.modele : MODELE_PAR_DEFAUT;
    const modeles = [prefere, ...MODELES_DICTEE.map((m) => m.id).filter((m) => m !== prefere)];
    let rendu = null;
    let modele = modeles[0];
    for (const m of modeles) {
      modele = m;
      rendu = await appelleClaude(cleClaude, {
        model: m,
        max_tokens: 1500,
        system: consigneDeLaDictee({ mode, mots, prestations, equipe: prenoms }),
        messages: [{ role: "user", content: texte }]
      });
      if (modeleInconnu(rendu.status, rendu.corps)) continue;
      break;
    }
    if (!rendu || rendu.status < 200 || rendu.status >= 300) {
      dis("claude refuse", { status: rendu?.status ?? 0, genre: rendu?.corps.error?.type ?? "" });
      return json({ ok: false, motif: "claude", version: VERSION });
    }
    const propre = nettoieLaReponse(rendu.corps.content?.filter((c) => c.type === "text").map((c) => c.text ?? "").join("\n") ?? "");
    const t = TARIFS[modele] ?? TARIFS[MODELE_PAR_DEFAUT];
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
    dis("dictee", { porte, mode, modele, caracteres: texte.length, source: chaine(d.source) || "trone" });
    if (!propre) return json({ ok: false, motif: "modele", version: VERSION });
    return json({ ok: true, propre, mode, modele, version: VERSION });
  } catch (e) {
    dis("erreur", { motif: String(e?.message ?? e).slice(0, 120) });
    return json({ ok: false, motif: "erreur", version: VERSION });
  }
});
