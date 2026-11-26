// Sights and stamps. Every island has a few sights. Reaching one puts a postcard in the journal: a picture taken
// there and then (whatever the hour and the weather, with your animal in it and whoever stood beside you), and a
// postmark with the place and the date. Nobody else's card looks like yours.
export const SIGHTS = {
  home: [
    { id: 'hill', name: 'The hilltop', hint: 'Climb the hill behind the fire.' },
    { id: 'dock', name: 'The end of the dock', hint: 'Walk out to the very end of the dock.' },
    { id: 'campfire', name: 'The campfire hour', hint: 'Be at the fire during a campfire hour.' },
    { id: 'sea', name: 'Out at sea', hint: 'Sail out on the boat.' },
  ],
  far: [
    { id: 'stillwater', name: 'Stillwater', hint: 'There is a valley in the middle of the island that cannot be seen from outside.' },
    { id: 'hollowtree', name: 'The hollow tree', hint: 'The fireflies in Whisper Woods are all going somewhere.' },
    { id: 'underhill', name: 'Under Hollow Hill', hint: 'A path from the woods ends at a hole in the hill.' },
    { id: 'paintings', name: 'The painted stones', hint: 'There is something on the stones in the dark of Hollow Hill. You would need a light.' },
    { id: 'deeppool', name: 'The pool under the hill', hint: 'The round room in Hollow Hill has a door that no paw can move.' },
    { id: 'stones', name: 'The standing stones', hint: 'On the High Meadow the wind plays something on the stones. It might be played back.' },
    { id: 'summit', name: 'The top of the island', hint: 'There is a crag above the High Meadow, and something on top of it.' },
    { id: 'tower', name: 'The broken tower', hint: 'It can be seen from almost anywhere on the island. Walk to it.' },
    { id: 'cottage', name: 'The keeper\'s cottage', hint: 'Whoever kept the light lived close by it.' },
    { id: 'wreck', name: 'The wreck on the flats', hint: 'Something lies out on the mud south of the woods. Go when the tide is out.' },
    { id: 'islet', name: 'The islet', hint: 'Stones lead out to sea from the Tide Flats. They are only dry for a while.' },
    { id: 'farbeach', name: 'The Far Beach', hint: 'Behind the hills in the north-west there is a cove that faces the evening.' },
    { id: 'spring', name: 'The hot spring', hint: 'Somewhere along the cliff from the Far Beach, the rock is warm.' },
    { id: 'moonpool', name: 'The moon pool', hint: 'In the north-east, where no path goes, there is a pool that is only worth finding after dark.' },
    { id: 'whale', name: 'The whale', hint: 'Something very large came ashore on the north coast, a long time ago.' },
    { id: 'seat', name: 'The seat that faces home', hint: 'Somebody cut a chair into a boulder on the south-east cliff. Sit where they sat.' },
    { id: 'waycairn', name: 'The wayfarers\' cairn', hint: 'On the south cliffs there is a pile of stones that is not finished.' },
    { id: 'grotto', name: 'Behind the falls', hint: 'Something is hidden where the water comes down.' },
  ],
};
export const ISLE_NAME = { home: 'Hush Island', far: 'Lantern Rock' };
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const stampDate = (at) => { const d = new Date(at); return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`; };
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
// A postmark: two rings, the island's name round the top, the place round the bottom, the date across the middle,
// and the wavy lines a franking machine leaves beside it. Drawn as a picture so that it can sit over a postcard.
export function postmark(isle, place, at, n = 0) {
  const ink = isle === 'far' ? '#1f6f72' : '#a2401c', id = 'pm' + Math.random().toString(36).slice(2, 8);
  const waves = [0, 1, 2, 3].map((i) => `<path d="M118 ${34 + i * 12} q9 -7 18 0 t18 0 t18 0 t18 0" fill="none" stroke="${ink}" stroke-width="2.4" stroke-linecap="round"/>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 196 112" class="postmark" style="transform: rotate(${[-9, 6, -4, 11, -13, 4][n % 6]}deg)" aria-hidden="true">
    <defs><path id="${id}a" d="M16 56 a40 40 0 0 1 80 0"/><path id="${id}b" d="M10 56 a46 46 0 0 0 92 0"/></defs>
    <circle cx="56" cy="56" r="52" fill="none" stroke="${ink}" stroke-width="3"/><circle cx="56" cy="56" r="33" fill="none" stroke="${ink}" stroke-width="1.6"/>
    <text font-family="Georgia, serif" font-size="11.5" font-weight="700" fill="${ink}" letter-spacing="1.5"><textPath href="#${id}a" startOffset="50%" text-anchor="middle">${esc(ISLE_NAME[isle] || isle).toUpperCase()}</textPath></text>
    <text font-family="Georgia, serif" font-size="9.5" font-weight="700" fill="${ink}" letter-spacing="0.6"><textPath href="#${id}b" startOffset="50%" text-anchor="middle">${esc(place).toUpperCase()}</textPath></text>
    <text x="56" y="53" text-anchor="middle" font-family="Georgia, serif" font-size="12" font-weight="700" fill="${ink}">${esc(stampDate(at).split(' ').slice(0, 2).join(' ').toUpperCase())}</text>
    <text x="56" y="67" text-anchor="middle" font-family="Georgia, serif" font-size="11" fill="${ink}">${new Date(at).getFullYear()}</text>
    ${waves}</svg>`;
}
