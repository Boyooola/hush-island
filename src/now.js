// The island's clock. Every device's own clock is a little off, and tag, the dance, the boat and the hour of the
// day all need everyone to agree what time it is. When the island lets a visitor ashore it says what time it has,
// and from then on the game goes by that rather than by the device.
let skew = 0;
export function setIslandTime(serverNow) { if (Number.isFinite(serverNow) && serverNow > 1e12) skew = serverNow - Date.now(); }
export const timeNow = () => Date.now() + skew;
export const clockSkew = () => skew;
