// Campfire hour: twice a day, twelve hours apart, the island has a set time for gathering at the fire, so that
// while it is small a visitor can know when others will be there instead of landing on an empty beach.
// The hours are fixed on the world's clock and told in UTC, the same words for everyone, with how long is left.
export const CAMPFIRE_UTC = [1, 13];          // 01:00 and 13:00 UTC
export const CAMPFIRE_MS = 3600000;           // each lasts an hour
const DAY = 86400000;
// What the campfire is doing at a moment: on (with the id of this hour and when it ends) or not, and the next start.
export function campfireAt(now) {
  const d0 = Math.floor(now / DAY) * DAY;
  let id = 0, next = Infinity;
  for (const off of [-1, 0, 1]) for (const h of CAMPFIRE_UTC) {
    const s = d0 + off * DAY + h * 3600000;
    if (now >= s && now < s + CAMPFIRE_MS) id = s;
    if (s > now && s < next) next = s;
  }
  return { on: id > 0, id, ends: id ? id + CAMPFIRE_MS : 0, next, hour: id ? new Date(id).getUTCHours() : -1 };
}
export const clockTime = (ms) => { const d = new Date(ms); return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')} UTC`; };
export function inWords(ms) {
  const m = Math.max(0, Math.round(ms / 60000));
  if (m < 1) return 'a moment';
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60), r = m % 60;
  return r ? `${h} h ${r} min` : `${h} h`;
}
// The two hours in words: "01:00 and 13:00 UTC".
export const bothTimes = () => CAMPFIRE_UTC.map((h) => `${String(h).padStart(2, '0')}:00`).join(' and ') + ' UTC';
