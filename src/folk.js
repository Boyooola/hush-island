// The folk of Lantern Rock: who lives in each part of the island, what they say about it, what they remember of
// the night of the storm, and what they pass from one to the next. Words only; wide.js puts them on the island.
import { HOLLOW_TREE, WINDMILL, WRECK, SHELTER, GARDEN } from './terrain.js';

export const FOLK = [
  { id: 'forager', name: 'The Forager', short: 'Forager', sub: 'knows the woods', model: 'forager', she: true, x: -86, z: 2, tall: 1.75, size: 1.15, area: 'woods',
    night: { x: HOLLOW_TREE.x + 3.4, z: HOLLOW_TREE.z + 2.2 },
    hello: 'Mind the basket. I am the Forager. These are Whisper Woods, and everything in them is either supper or it is not. I can tell you which.',
    about: [
      'The brown caps you can eat. The red ones you can look at. I have never needed a third rule.',
      'The fireflies all go to the same tree at dusk. Follow them once. You will not need telling twice.',
      'The well at the crossroads was sweet water before the storm took its roof. The rope is long gone.',
      'North of the crossroads a path goes up to the cliffs. There is the stump of a tower up there, and a long way down.',
      'I come out at night as well. The mushrooms that glow are only worth picking in the dark.',
    ],
    nightSay: ['Quiet. They are coming in to the tree.', 'You can see the glowing ones from here. Leave some for me.'],
    hint: 'Since you carry things for people: there is a great trunk down in the woods south of the path, west of here. It fell in the storm. It is hollow underneath, and something has been sleeping there.',
    spot: 'trunk',
    storm: 'The night of the storm I was under a root with my eyes shut. But I heard the bell on the flats. It rang for a long time, not the way the tide rings it. Somebody was pulling the rope.',
    thanks: 'A letter. Nobody writes to me. He wants to know what grows where, for his map. Tell him yes.' },
  { id: 'gardener', name: 'The Gardener', short: 'Gardener', sub: 'keeps the valley beds', model: 'gardener', x: GARDEN.x + 5.5, z: GARDEN.z + 5, tall: 1.75, size: 1.15, area: 'valley',
    hello: 'Who is that? Come closer, I see about as far as my own nose. I am the Gardener. This is Stillwater. The keeper dug these beds and I keep them dug.',
    about: [
      'The valley cannot be seen from outside. The wind goes over the top of it. That is why things grow here and nowhere else.',
      'He grew onions. Rows of them. He said somebody would want onions, and then there was nobody.',
      'The water comes down the south wall and goes under the hill. Where it comes out again I could not tell you.',
      'There is a hollow behind the falls. I am not supposed to know about it. I dug half of it.',
      'Plant something in an empty bed, if you find a seed. It will be up in a day or two. I will water it when you forget.',
    ],
    nightSay: ['Night is when I do my best work. Less to squint at.', 'Mind the beds. I can hear where you are standing.'],
    hint: 'Here is a thing I only know by smell. West of the pool, at dusk and only at dusk, a ring of mushrooms comes up out of the grass. By morning it is gone. Stand in the middle of it.',
    spot: 'duskring',
    storm: 'I was underground, which is the place to be. In the morning half the garden was in the pool. And the keeper went past my door carrying oars. He did not stop. He never went anywhere without stopping.',
    thanks: 'Pickled brown caps. She remembers. Put the jar where I can find it. No, I will hold it.' },
  { id: 'shepherd', name: 'The Shepherd', short: 'Shepherd', sub: 'minds the flock', model: 'shepherd', x: -257, z: -17, tall: 2.05, size: 1.1, area: 'meadow',
    night: { x: WINDMILL.x + 6.5, z: WINDMILL.z + 6 },
    hello: 'Steady. You will scatter them. I am the Shepherd, and this is the High Meadow. Wind, grass, seven stones and a mill with no sails. It is enough.',
    about: [
      'The stones sing when the wind is right. The keeper used to whistle back at them. The sheep took no notice of either.',
      'The mill ground the lamp-seed for his oil. Four sails she had. The storm took three and I burned the fourth that winter.',
      'You can see weather coming from up here an hour before it lands. Fog comes from the west. It always comes from the west.',
      'The crag behind me is the top of the island. There is a ledge on the far side of it that the wind does not reach.',
      'Down the north-west side there is a beach that faces the evening. One of the gulls lives there now. She does not fly.',
    ],
    nightSay: ['I bring them in close after dark. Sit, if you like. The fire is for anybody.', 'Count them for me. My eyes say one short. They always say one short.'],
    hint: 'You have been useful. Go round behind the summit crag, the side away from the path. There is a ledge. On a clear day you can see your own island from it, and I think the one after.',
    spot: 'ledge',
    storm: 'I was up here with the flock all that night. The light on the point went out near dawn. And then I saw another light, a small one, low on the water. It was going west. West, mind. Not east.',
    thanks: 'Red ochre. Good. I mark the lambs with it so I know which are mine. They are all mine. I mark them anyway.' },
  { id: 'beachcomber', name: 'The Beachcomber', short: 'Beachcomber', sub: 'picks over the tide line', model: 'beachcomber', x: -80, z: 105, tall: 1.8, size: 1.15, area: 'flats',
    low: { x: WRECK.x + 6.5, z: WRECK.z - 5 },
    hello: 'Hands where I can see them. Only joking. I am the Beachcomber. These are the Tide Flats, and anything the sea leaves on them is mine until somebody offers me something better for it.',
    about: [
      'Twice a day the sea goes out and leaves me presents. Twice a day it comes back for anybody slow.',
      'She was called the Kittiwake. I have had every nail out of her that would come. The name on the stern I left.',
      'The stones go out to an islet when the water is down. Go quickly and come back quicker.',
      'West along the cliffs there is a rock with a chapel on it. There was a bridge once. I have most of the planks.',
      'The bell is for fog. The tide rings it when it feels like it. Anybody can ring it who has a reason.',
    ],
    nightSay: ['Low water after dark is the best picking. Nobody else is fool enough.', 'Mind where you put your feet. Some of it is glass.'],
    hint: 'Right. Along the south-west cliffs there is a big rock split clean in two. The wind whistles in the crack. Walk through it. Something is wedged in there that I never could reach.',
    spot: 'gap',
    storm: 'I found the bell rope cut that morning. Cut, with a knife, high up. Somebody rang that bell from the water and then cut himself loose from it. A drowned otter does not do that.',
    thanks: 'A bearing. West by north. So that is where she saw it go. I thought so. I have thought so for years.' },
  { id: 'castaway', name: 'The Castaway', short: 'Castaway', sub: 'watches the west', model: 'castaway', she: true, x: SHELTER.x + 3.4, z: SHELTER.z - 2.6, tall: 1.5, size: 1.2, area: 'farbeach',
    hello: 'You walked here. Of course you did. I am the Castaway. I came down in the storm with one good wing and I have been watching the west from this beach ever since.',
    about: [
      'This beach faces the evening. Everything that leaves this island leaves from here, in the end.',
      'There is a mast out there. That is not the Kittiwake. That is an older ship. There is a small boat of hers in the shallows, when the tide is down.',
      'The rock is warm along the cliff. There is water up there you can sit in. It is the only reason I am still polite.',
      'I light a fire when it gets dark. Not to keep warm. So that it can be seen.',
      'On a very clear evening there is something on the western edge of the sea. Low. Dark. It does not move like a cloud.',
    ],
    nightSay: ['Sit by it if you want. Do not let it go out.', 'There. Out past the mast. No. Gone again.'],
    hint: 'You have carried enough to be told. At low water, walk out along this beach to the left of the mast. There is a rowboat under the sand, ribs up. She came off the old ship. Look in her.',
    spot: 'sunken',
    storm: 'I was in the air when it hit. I saw it from above, the whole thing. The otter did not go down with his boat. He was on a spar, a broken mast, and the current had him, and it took him west. I could not follow. I had one wing.',
    thanks: 'A new wick. She did not have to. Tell her the fire will be on the beach tonight, and every night, same as hers.' },
  { id: 'pedlar', name: 'The Pedlar', short: 'Pedlar', sub: 'walks the long path', model: 'pedlar', x: 0, z: 0, tall: 2.5, size: 1.0, area: '',
    hello: 'Whoa. A customer, or near enough. I am the Pedlar. I walk from the Landing to the point and back, every day, and I carry what people will not carry themselves.',
    about: [
      'From the Landing to the lighthouse is a good long walk. I do it twice a day. You get to know the stones by name.',
      'If you want something carried, I am going that way. If you want something swapped, show me what you have.',
      'There are lanterns at the waystones. Light one and the path remembers you. It is quicker than my legs.',
      'North of the woods there are steps of black rock going out into the sea. Nobody built them. There is a nest at the far end.',
      'Everybody on this island is waiting for something. I am the only one going anywhere, and I only go back and forth.',
    ],
    nightSay: ['I walk at night too. The lantern knows the way better than I do.', 'Keep to the path after dark. I mean it.'],
    hint: 'Here is one for nothing. On the north-east cliffs, past the woods, there are columns of black rock going out to sea like a stair. Walk them. There is a nest on the last one, and it is not empty.',
    spot: 'stack',
    storm: 'I was at the Landing with my head under a blanket. What I can tell you is this. The keeper took the small boat east the next morning. He asked me which way the current ran. I told him east. I was wrong. Past the point it turns.',
    thanks: '' },
];
export const folkById = Object.fromEntries(FOLK.map((f) => [f.id, f]));

// The Message Round: each of the eight hands the visitor something for the next. `to` is who it goes to; `thing`
// is what is carried; `gives` is said by the one who hands it over.
export const ROUND = [
  { id: 'lr-r1', from: 'keeper', to: 'forager', thing: 'the Mapmaker\'s letter', gives: 'He seals it with a blob of candle wax and a claw print. It is addressed to "The Forager, Whisper Woods, under a tree".' },
  { id: 'lr-r2', from: 'forager', to: 'gardener', thing: 'the jar of pickled mushrooms', gives: 'She wraps a jar in a dock leaf and ties it twice. It is heavier than it looks, and it sloshes.' },
  { id: 'lr-r3', from: 'gardener', to: 'hermit', thing: 'the string of onions', gives: 'He feels along a rafter and takes down a string of onions, counting them with his nose.' },
  { id: 'lr-r4', from: 'hermit', to: 'shepherd', thing: 'the pot of red ochre', gives: 'He scrapes a pot full from the wall of the hill itself and stops it with moss. Your paws are red already.' },
  { id: 'lr-r5', from: 'shepherd', to: 'heron', thing: 'the fleece', gives: 'He drops a rolled fleece across your back. It smells of sheep, and of the fire by the mill.' },
  { id: 'lr-r6', from: 'heron', to: 'castaway', thing: 'the spare wick', gives: 'She takes a coil of new wick from under her wing, where it has been kept dry.' },
  { id: 'lr-r7', from: 'castaway', to: 'beachcomber', thing: 'the Castaway\'s bearing', gives: 'She scratches a line and three words on a flat piece of driftwood with her beak: WEST BY NORTH.' },
  { id: 'lr-r8', from: 'beachcomber', to: 'keeper', thing: 'the tide table', gives: 'He pulls a roll of sailcloth out of his sack. Every tide for a year is on it, in charcoal, in a very small hand.' },
];
export const ROUND_THANKS = {
  hermit: 'Onions. The keeper\'s onions, or their grandchildren. I will not say I am pleased. I am going to eat one now.',
  heron: 'Wool, to pack the lamp glass in when it comes. He thinks of everything, that old ram. Do not tell him I said so.',
  keeper: 'The tides. All of them. Now I can draw the flats as they are and as they will be. Give me a moment. There. The whole island is on the map, and everybody on it.',
};
// What each of the three who were here already remembers of the storm (the others are in FOLK).
export const STORM_TOLD = {
  hermit: 'I painted what I knew. I did not know enough. I heard the tower go, and I heard the bell. I did not hear him call. I have always wondered who rang it.',
  heron: 'The lantern room went at the fourth hour. I was thrown clear. When I got up, the otter\'s boat was already on the mud and the bell was ringing. It rang until the tide turned. Then it stopped, all at once.',
};
export const STORM_WHO = ['forager', 'gardener', 'hermit', 'shepherd', 'heron', 'beachcomber', 'castaway', 'pedlar'];
// The places that are hard to find, and who knows of each.
export const SPOTS = [
  { id: 'trunk', name: 'Under the fallen trunk', found: 'It is dry under here, and somebody has pressed a nest into the leaves. The trunk goes on over your head like the roof of a boat.' },
  { id: 'ledge', name: 'The ledge behind the crag', found: 'The wind stops as if a door had shut. East, very small, is the island you came from. West there is only sea, and a line on the edge of it that might be a cloud.' },
  { id: 'cove', name: 'The cove under the watchtower', found: 'A floor of wet shingle, a roof of rock, and the tide mark above your head. This place only exists for an hour or two at a time.' },
  { id: 'cellar', name: 'The keeper\'s cellar', found: 'Shelves cut into the rock. Jars, a coil of rope, a row of empty hooks where oilskins hung. He left in a hurry and he left it tidy.' },
  { id: 'duskring', name: 'The ring at dusk', found: 'Pale caps in a ring as wide as a boat, glowing faintly. Inside it the grass is a different green. Nothing makes a sound.' },
  { id: 'sunken', name: 'The sunken rowboat', found: 'Her ribs stand out of the sand like fingers. There is a locker under the stern thwart that the sea has not got into.' },
  { id: 'stack', name: 'The nest on the stack', found: 'The last step is the widest. On it is a nest as big as a cartwheel, built of driftwood and rope and one oar.' },
  { id: 'gap', name: 'The Whistling Gap', found: 'The rock is split from top to bottom and the wind plays one long note through it. Halfway along, something is wedged in the crack at the height of your nose.' },
];
