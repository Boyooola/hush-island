// Words that are not said on the island. Used by the game (to stop a message before it is sent, and to hide one
// that slips through) and by the island's room (which has the last word, and mutes whoever sent it).
// judge(text) returns 'mute' for slurs, sexual talk and the strongest swearing, 'soft' for milder swearing
// (the message is dropped, nobody is muted), or '' when the text is fine.
const FOLD = { 0: 'o', 1: 'i', 3: 'e', 4: 'a', 5: 's', 7: 't', '@': 'a', $: 's', '!': 'i', '+': 't' };

// Each pattern is tried against one word at a time, after the folding below. Letters may be stretched ("fuuuck").
const HARD = [
  /f+u+c+k/, /p+h+u+c+k/, /^f+c+k/, /^f+u+k+(s|a|er|ers|in|ing)?$/, /^f+v+c+k/,
  /n+i+g{2,}(e+r|a|u+h)/, /^n+i+g+a+s?$/,
  /^c+u+n+t/, /b+i+t+c+h/, /^cocks?$/, /^cocksuck/, /^d+i+c+k+(s|head|heads)?$/, /^p+u+s{2,}(y|ies)$/,
  /^(sex|sexy|sext|sexting)$/, /p+o+r+n/, /^nudes?$/, /^horny$/, /^rap(e|ed|es|ing|ist|ists)$/, /^slut/, /^whore/,
  /^fag(s|g+ot|g+ots|g+y)?$/, /^retard/, /^(kike|chink|spic|tranny|trannie|wetback|beaner|gook|paki)s?$/, /^kys$/,
  /^(cum|cumming|blowjob|handjob|boobs?|tits|titties|penis|vagina|dildo|anal|hentai|milf|wank|wanker|jizz|orgasm)s?$/, /^masturbat/,
  /^(putangina|tangina|pakyu|kantot|kantutan|puta|pokpok)$/,
];
const SOFT = [/^(bull)?s+h+i+t+(s|ty|ter|ting|head|heads)?$/, /^as{2,}hole/, /^bastards?$/, /^stfu$/, /^gago$/, /^motherf/];
// Tried against the whole message, words separated by single spaces.
const PHRASES = [/kill (yo)?ur ?sel(f|ves)/, /suck my/, /send (me )?(nudes|pics)/, /wanna (fuck|bang|smash)/, /go die/];

function words(text) {
  const s = String(text ?? '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[013457@$!+]/g, (c) => FOLD[c]);
  const raw = s.split(/[^a-z]+/).filter(Boolean), out = [];
  // Letters spelled out one at a time ("f u c k", "f.u.c.k") are read as one word.
  let run = '';
  for (const w of raw) {
    if (w.length === 1) { run += w; continue; }
    if (run) { out.push(run); run = ''; }
    out.push(w);
  }
  if (run) out.push(run);
  return out;
}
export function judge(text) {
  const list = words(text);
  if (!list.length) return '';
  // Each word alone, and each neighbouring pair run together ("fu ck").
  const tries = list.slice();
  for (let i = 0; i + 1 < list.length; i++) tries.push(list[i] + list[i + 1]);
  const line = list.join(' ');
  if (PHRASES.some((p) => p.test(line))) return 'mute';
  for (const w of list) if (HARD.some((p) => p.test(w))) return 'mute';
  for (let i = list.length; i < tries.length; i++) if (/f+u+c+k|n+i+g{2,}(e+r|a)/.test(tries[i])) return 'mute';
  for (const w of list) if (SOFT.some((p) => p.test(w))) return 'soft';
  return '';
}
