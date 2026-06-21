/**
 * Normalize any Jordanian phone number variant to E.164 +962XXXXXXXXX format.
 *
 * Accepted input formats:
 *   0790520759        → +962790520759  (local with leading 0)
 *   790520759         → +962790520759  (local without leading 0)
 *   962790520759      → +962790520759  (country code, no prefix)
 *   00962790520759    → +962790520759  (international 00 prefix)
 *   +962790520759     → +962790520759  (E.164, already correct)
 *   +0788481199       → +962788481199  (+ followed by local 0 — treated as local)
 */
export function normalizePhone(raw) {
  if (!raw) return raw;

  // Strip spaces, dashes, parentheses
  let phone = String(raw).replace(/[\s\-().]/g, '');

  if (phone.startsWith('+962'))   return phone;
  if (phone.startsWith('+0'))     return '+962' + phone.slice(2);  // +0XXXXXXXXX → local
  if (phone.startsWith('00962'))  return '+962' + phone.slice(5);
  if (phone.startsWith('962'))    return '+962' + phone.slice(3);
  if (phone.startsWith('0'))      return '+962' + phone.slice(1);

  return '+962' + phone;
}
