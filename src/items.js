// Everything that can be in the satchel. Things are picked up off the ground and kept; keys open one chest each
// and are used up; things to wear go on the head, round the neck or on the back, and other visitors see them.
export const ITEMS = {
  shell: { name: 'Cockle shell', kind: 'thing', model: 'find_cockle', says: 'Ribbed, and warm from the sun.' },
  whelk: { name: 'Whelk shell', kind: 'thing', model: 'find_whelk', says: 'Hold it to your ear and it sounds like the sea, which is cheating, on an island.' },
  seaglass: { name: 'Sea glass', kind: 'thing', model: 'find_seaglass', says: 'A bottle once. The sea has spent years taking the edges off.' },
  feather: { name: 'Gull feather', kind: 'thing', model: 'find_feather', says: 'Dropped from a long way up.' },
  moonshell: { name: 'Moon shell', kind: 'thing', model: 'find_moonshell', says: 'It keeps a little of the light it was found in.' },
  conch: { name: 'Pink conch', kind: 'thing', model: 'find_conch', says: 'Rare, and it knows it.' },
  crystal: { name: 'Crystal chip', kind: 'thing', model: 'pick_crystal', says: 'It hums, very faintly, if you call near it.' },
  mushroom: { name: 'Brown-cap mushrooms', kind: 'thing', model: 'pick_mushroom', says: 'The Hermit says these are the ones you can eat. He would know.' },
  sprig: { name: 'Sprig of heather', kind: 'thing', model: 'pick_sprig', says: 'It smells of honey and wind.' },
  pearl: { name: 'A moon pearl', kind: 'thing', model: 'find_moonshell', says: 'It was in a chest that only opens after dark. It is cold, and it is never quite the same colour twice.' },
  key_cottage: { name: 'A small iron key', kind: 'key', model: 'chest_key', says: 'A cottage is stamped on the bow of it.' },
  key_islet: { name: 'A green brass key', kind: 'key', model: 'chest_key', says: 'It has been in salt water. A bell is stamped on the bow.' },
  key_summit: { name: 'A long thin key', kind: 'key', model: 'chest_key', says: 'A mountain is scratched on the bow, with a flag on top.' },
  key_lake: { name: 'A heavy black key', kind: 'key', model: 'chest_key', says: 'Three wavy lines are cut into the bow: water, under something.' },
  strawhat: { name: 'A straw hat', kind: 'wear', slot: 'head', model: 'wear_strawhat', says: 'Somebody wore this in the valley garden. It still fits somebody.' },
  flowercrown: { name: 'A crown of flowers', kind: 'wear', slot: 'head', model: 'wear_flowercrown', says: 'Fresh, though the chest was shut for years. Do not ask.' },
  featherband: { name: 'A feather for behind the ear', kind: 'wear', slot: 'head', model: 'wear_feather', says: 'From a bird nobody on this island has seen.' },
  scarf: { name: 'A blue wool scarf', kind: 'wear', slot: 'neck', model: 'wear_scarf', ring: [0x3a6bb0, 0.042], says: 'Knitted for a longer neck than yours, or a shorter one. It is hard to say.' },
  bell: { name: 'A bell collar', kind: 'wear', slot: 'neck', model: 'wear_bell', ring: [0x66422a, 0.018], says: 'So that somebody could always find you in the fog.' },
  kerchief: { name: 'A red kerchief', kind: 'wear', slot: 'neck', model: 'wear_kerchief', ring: [0xc7332a, 0.024], says: 'Spotted, and faded where the sun got at it.' },
  packlantern: { name: 'A lantern on a pole', kind: 'wear', slot: 'back', model: 'wear_lantern', says: 'The keeper carried this down to the jetty on dark mornings. It lights itself at dusk.' },
  saddlebags: { name: 'Saddlebags', kind: 'wear', slot: 'back', model: 'wear_satchel', says: 'Off the Kittiwake. There is a blanket rolled on top that still smells of tar.' },
};
export const WEAR_IDS = ['', ...Object.keys(ITEMS).filter((k) => ITEMS[k].kind === 'wear')];      // what a visitor wears is sent to the others as places in this list
export const SLOTS = ['head', 'neck', 'back'];
// What a find off the sand puts in the satchel.
export const ITEM_OF_FIND = { cockle: 'shell', whelk: 'whelk', seaglass: 'seaglass', feather: 'feather', moonshell: 'moonshell', conch: 'conch' };

// Chests. Each can be opened once by every visitor and always holds the same things.
//   needs: a key · when: 'night' or 'lowtide' · gives: items [id, how many], or bundle (six of what the tower wants), or a paper
export const CHESTS = {
  far: [
    { id: 'c-landing', kind: 'plain', at: 'landing', gives: [['strawhat', 1]], hint: 'Behind the tents at the Landing.' },
    { id: 'c-woods', kind: 'plain', at: 'woods', gives: [['kerchief', 1], ['mushroom', 2]], hint: 'Off the path in Whisper Woods, where a trunk has fallen.' },
    { id: 'c-meadow', kind: 'plain', at: 'meadow', bundle: true, gives: [['sprig', 2]], hint: 'On the edge of the High Meadow, looking down on the valley.' },
    { id: 'c-farbeach', kind: 'plain', at: 'farbeach', gives: [['scarf', 1]], hint: 'In the dune grass at the back of the Far Beach.' },
    { id: 'c-garden', kind: 'plain', at: 'garden', gives: [['key_islet', 1]], hint: 'Among the old garden beds in Stillwater.' },
    { id: 'c-cliff', kind: 'plain', at: 'cliff', bundle: true, gives: [['feather', 2]], hint: 'On the south cliffs, a little way from the cairn.' },
    { id: 'c-grotto', kind: 'plain', at: 'grotto', gives: [['flowercrown', 1]], hint: 'Somewhere only the water sees.' },
    { id: 'c-deadend', kind: 'plain', at: 'cave1', gives: [['key_summit', 1], ['crystal', 2]], hint: 'Under the hill, down a passage that goes nowhere.' },
    { id: 'c-gallery', kind: 'plain', at: 'cave2', gives: [['bell', 1]], hint: 'Under the hill, where the crystal grows thickest.' },
    { id: 'c-bones', kind: 'plain', at: 'bones', gives: [['key_cottage', 1]], hint: 'On the north coast, inside something that was once alive.' },
    { id: 'c-cottage', kind: 'iron', at: 'cottage', needs: 'key_cottage', gives: [['packlantern', 1]], hint: 'In the keeper\'s cottage. It is locked.' },
    { id: 'c-islet', kind: 'iron', at: 'islet', needs: 'key_islet', paper: 0, bundle: true, gives: [], hint: 'Out on the islet, by the bell. It is locked.' },
    { id: 'c-summit', kind: 'iron', at: 'summit', needs: 'key_summit', gives: [['key_lake', 1]], paper: 1, hint: 'At the top of the island. It is locked.' },
    { id: 'c-lake', kind: 'iron', at: 'lake', needs: 'key_lake', gives: [['crystal', 6]], paper: 2, hint: 'Beside the water under the hill. It is locked.' },
    { id: 'c-moon', kind: 'iron', at: 'moon', when: 'night', gives: [['pearl', 1]], hint: 'By the moon pool. The lid will not lift by day.' },
    { id: 'c-wreck', kind: 'iron', at: 'wreck', when: 'lowtide', gives: [['saddlebags', 1]], hint: 'In the mud beside the wreck. The tide keeps it most of the time.' },
  ],
  home: [
    { id: 'h-rocks', kind: 'plain', at: 'h1', gives: [['featherband', 1]], hint: 'Among the rocks at the far end of the east beach.' },
    { id: 'h-hill', kind: 'plain', at: 'h2', gives: [['seaglass', 3], ['shell', 3]], hint: 'Behind the hill, out of sight of the fire.' },
    { id: 'h-west', kind: 'plain', at: 'h3', gives: [['whelk', 2], ['feather', 1]], hint: 'Past the boat, where the west beach runs out.' },
  ],
};
// Three letters that lie in locked chests: the Ferryman's, written after the wreck.
export const LETTERS = [
  ['A letter, unsent', 'Keeper. I am ashore on the bell rock with the mast across my leg and I have watched your light go out. I do not think it was your doing. The lens went down with the boat. I am sorry about the lens.'],
  ['A letter, left on the summit', 'I climbed up here to look for you and saw your small boat going east, too far off to shout to. So you are alive. Good. I am going the other way. Somebody on the western lights will have glass. I will bring you a lens yet.'],
  ['A letter, by the water under the hill', 'The badger let me rest here. He says he will not come out again and I believe him. If anyone finds this: the keeper went east and the ferryman went west and neither of us gave up. Light the lamp. One of us will see it.'],
];
