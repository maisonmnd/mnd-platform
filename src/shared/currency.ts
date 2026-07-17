import { currencyByCode } from './geo';

/* Devises — le XOF est la base de tous les montants stockés.
   La branche (ou le tenant) impose sa devise à l'affichage : conversion + format. */

/** 1 unité de devise = N XOF (taux indicatifs, figés pour la démo). */
const RATES_TO_XOF: Record<string, number> = {
  XOF: 1,
  XAF: 1,
  EUR: 655.96,
  USD: 601,
  CAD: 441,
  GBP: 768,
  CHF: 672,
  NGN: 0.39,
  GHS: 41,
  ZAR: 33,
  MAD: 60,
  CNY: 83,
  AED: 164,
};

/** Taux INDICATIF : 1 unité de `code` = N XOF. 0 si la maison n'en a pas.
    À ne jamais appliquer tel quel à un encaissement réel — ces taux sont figés
    dans le code : ils servent à pré-remplir un champ, que le maître corrige au
    taux du jour. Le change se négocie au comptoir, pas dans une constante. */
export const rateToXof = (code: string): number => RATES_TO_XOF[code] ?? 0;

export function convertFromXof(amountXof: number, code: string): number {
  const rate = RATES_TO_XOF[code];
  if (!rate) return amountXof;
  return amountXof / rate;
}

export function toXof(amount: number, code: string): number {
  const rate = RATES_TO_XOF[code] ?? 1;
  return amount * rate;
}

/** Format maison : `180 000 F` (XOF), `1 250 €`, `$2,080`. Espace fine insécable pour les milliers. */
export function fmtMoney(amountXof: number, code = 'XOF'): string {
  const cur = currencyByCode(code);
  const symbol = cur?.symbol ?? code;
  const v = convertFromXof(amountXof, code);
  const decimals = ['XOF', 'XAF', 'NGN', 'GNF', 'RWF', 'UGX', 'JPY', 'KRW'].includes(code) || Math.abs(v) >= 1000 ? 0 : 2;
  const parts = v.toLocaleString('fr-FR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  if (code === 'USD' || code === 'CAD') return `${symbol}${v.toLocaleString('en-US', { maximumFractionDigits: decimals })}`;
  return `${parts} ${symbol}`;
}

/** Format compact pour les KPI : `14,2 M F`. */
export function fmtMoneyCompact(amountXof: number, code = 'XOF'): string {
  const cur = currencyByCode(code);
  const symbol = cur?.symbol ?? code;
  const v = convertFromXof(amountXof, code);
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return `${(v / 1_000_000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} M ${symbol}`;
  if (abs >= 10_000) return `${Math.round(v / 1000).toLocaleString('fr-FR')} k ${symbol}`;
  return fmtMoney(amountXof, code);
}
