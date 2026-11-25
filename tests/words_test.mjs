import { judge } from '../src/words.js';
const mute = ['wanna fuck?', 'FUUUCK you', 'f u c k', 'f.u.c.k', 'fu ck off', 'fvck', 'phuck', 'n1gger', 'niggas', 'nigga', 'you b!tch', 'send nudes', 'kys', 'kill yourself', 'suck my d', 'c0ck', 'p0rn hub', 'putangina mo', 'what a cunt', 'so horny', 'fuk u', 'motherfucker', 'r3tard'];
const soft = ['oh shit', 'bullshit', 'you asshole', 'stfu'];
const fine = ['hello from Scunthorpe', 'Niger is a country', 'I like grapes and cocktails', 'peacock feathers', 'analysis of the classic assassin', 'the cockatoo is loud', 'Dickens wrote that', 'fukuoka is nice', 'what a night', 'i saw a raccoon', 'pass the butter', 'sit by the fire with me', 'hi! how are you', 'is 1 fish enough', 'therapist', 'Essex and Sussex', 'shiitake', 'I am 13 and a half', 'hello', 'draped in a scarf', 'cumulus clouds', 'titanic', 'assume nothing', 'night, niger river', 'a spicy dish', 'so sexist', 'u c k'];
let bad = 0;
for (const t of mute) if (judge(t) !== 'mute') { bad++; console.log('MISSED', t, JSON.stringify(judge(t))); }
for (const t of soft) if (judge(t) !== 'soft') { bad++; console.log('SOFT?', t, JSON.stringify(judge(t))); }
for (const t of fine) if (judge(t) !== '') { bad++; console.log('WRONGLY', t, judge(t)); }
console.log(bad ? bad + ' wrong' : 'all ' + (mute.length + soft.length + fine.length) + ' judged right');
