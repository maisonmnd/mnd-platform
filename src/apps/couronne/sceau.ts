/* LE SCEAU DENTELÉ de Ma Couronne (6 novembre 2026) : quatorze dents sur un
   carré de 100. Le même dessin pour le chemin de sceaux et pour le pli de
   l'attention. */
export const DENTELE = (() => {
  const dents = 14;
  let d = '';
  for (let i = 0; i <= dents; i += 1) {
    const a = (i * 2 * Math.PI) / dents - Math.PI / 2;
    const x = (50 + 40 * Math.cos(a)).toFixed(2);
    const y = (50 + 40 * Math.sin(a)).toFixed(2);
    d += i === 0 ? `M${x} ${y}` : `A9.6 9.6 0 0 1 ${x} ${y}`;
  }
  return `${d}Z`;
})();
