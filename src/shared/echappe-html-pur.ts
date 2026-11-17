/* ÉCHAPPER LE HTML, UNE SEULE FOIS — 17 novembre 2026 (revue de l'audit du
   4 novembre).

   Les fenêtres d'impression du Trône (les cartes A5 des QR codes, la carte de
   marraine) se bâtissent par concaténation de chaîne et vivent sur la même
   origine que lui : un balisage glissé dans un champ synchronisé (nom de la
   Maison, SSID, libellés, code de marraine) s'y exécuterait. Chaque écran
   avait recopié son échappement ; les deux copies de routes/clients étaient
   identiques, caractère pour caractère. Elles lisent maintenant celle-ci.

   CINQ CARACTÈRES, l'apostrophe comprise (« &#39; ») : la valeur reste sûre
   dans un attribut entre apostrophes comme entre guillemets. Une valeur
   absente (un document synchronisé mal formé) donne une chaîne vide au lieu
   de faire tomber la fenêtre.

   DEUX ÉCHAPPEMENTS RESTENT CHEZ EUX, à dessein : `echappe` de
   shared/secretariat-tampons.ts (le SVG des tampons et des cachets) et celui
   de routes/finances/lettres-du-pret.ts (les lettres du prêt). Ils
   n'échappent que quatre caractères et laissent l'apostrophe telle quelle :
   les ranger ici changerait le texte qu'ils produisent. Leurs valeurs ne
   tombent que dans du texte ou des attributs entre guillemets, où
   l'apostrophe ne ferme rien. */
export const escHtml = (s: string | null | undefined): string =>
  String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
