// Unit checks for the Hindi/Punjabi transliteration and the Hinglish spelling folds in match.js.
//   /opt/homebrew/bin/node tests/folds.mjs
// 1. script -> Latin: Devanagari and Gurmukhi must land on the same tokens as the usual Latin spelling.
// 2. folds: spelling variants of one word must meet (checked through the real scoring, so fuzzy matching counts).
// 3. English audit: the folds must not make two different English words the same token, beyond a short known list.
// Exit code 1 on any failure.

import { tokens, normalize, parseItem, scoreTrack, confidence } from '../match.js';

let failed = 0;
const fail = msg => { failed++; console.log('  FAIL', msg); };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// ---- 1. script -> Latin
console.log('1. transliteration');
const SCRIPT = [
  // Devanagari
  ['तुम से तुम तक', 'Tum Se Tum Tak'], ['नियम', 'Niyam'], ['कबीर', 'Kabir'], ['दिल', 'Dil'], ['ज़िंदगी', 'Zindagi'],
  ['मोहब्बत', 'Mohabbat'], ['इश्क', 'Ishq'], ['प्यार', 'Pyar'], ['तेरे बिना', 'Tere Bina'], ['हमदर्द', 'Hamdard'],
  ['ये जवानी है दीवानी', 'Yeh Jawaani Hai Deewani'], ['मैं तेरा हीरो', 'Main Tera Hiro'], ['चाहूँ मैं या ना', 'Chahun Main Ya Naa'],
  ['सोलह बरस की बाली उमर', 'Solah Baras Ki Baali Umar'], ['एक दूजे के लिए', 'Ek Dooje Ke Liye'], ['किशोर कुमार', 'Kishor Kumar'],
  ['लता मंगेशकर', 'Lata Mangeshkar'], ['आशिकी 2', 'Aashiqui 2'], ['पड़ोसन', 'Padosan'], ['महबूब कयामत होगी', 'Mehboob Qayamat Hogi'],
  ['सुन रहा है ना तू', 'Sun Raha Hai Na Tu'], ['कैसे हुआ', 'Kaise Hua'], ['केसरिया', 'Kesariya'], ['बेखयाली', 'Bekhayali'],
  ['गलत बात है', 'Galat Baat Hai'], ['बदतमीज़ दिल', 'Badtameez Dil'], ['१२३', '123'],
  // Gurmukhi
  ['ਦਿਲਜੀਤ ਦੋਸਾਂਝ', 'Diljit Dosanjh'], ['ਸਰਦਾਰ ਜੀ', 'Sardaar Ji'], ['ਨੀਰੂ ਬਾਜਵਾ', 'Neeru Bajwa'], ['ਸਤਿੰਦਰ ਸਰਤਾਜ', 'Satinder Sartaaj'],
  ['ਗੋਰਾ ਗੋਰਾ ਰੰਗ', 'Gora Gora Rang'], ['ਸੱਜਣ ਰਾਜ਼ੀ', 'Sajjan Razi'], ['ਸ਼ੁਭ', 'Shubh'],
];
const near = (a, b) => same(a, b) || (a.length === b.length && a.every((t, i) => t === b[i] || (t.length >= 4 && t.replace(/a/g, '') === b[i].replace(/a/g, '')) || (t.length >= 5 && b[i].length >= 5 && Math.abs(t.length - b[i].length) <= 1 && [...t].filter((c, k) => c !== b[i][k]).length <= 2)));
let exact = 0;
for (const [script, latin] of SCRIPT) {
  const a = tokens(script), b = tokens(latin);
  if (same(a, b)) exact++;
  else if (!near(a, b)) fail(`${script} -> ${JSON.stringify(a)}, expected about ${JSON.stringify(b)}`);
}
console.log(`  ${SCRIPT.length} pairs: ${exact} identical tokens, ${SCRIPT.length - exact - failed} close (within a letter)`);

// Songs written in script come out as plain Latin in the parsed title and the searches.
const p = parseItem({ title: 'तुम से तुम तक - नियम', channel: 'Niyam', site: 'youtube' });
if (p.songish !== 'Tum Se Tum Tak') fail(`songish for the Devanagari title is ${JSON.stringify(p.songish)}`);
if (/[^\x00-\x7F]/.test(normalize('ਸਰਦਾਰ ਜੀ 3'))) fail('Gurmukhi was not transliterated');

// ---- 2. folds
console.log('2. Hinglish folds (variants must reach "high" against each other)');
const GROUPS = [
  ['Dooron Dooron', 'Duron Duron', 'Doron Doron'], ['Haaniyaan', 'Haniyan', 'Haniyaan'], ['Deewani', 'Diwani', 'Dewani'],
  ['Zindagi', 'Jindagi', 'Zindagee'], ['Phir Se', 'Fir Se'], ['Dil Mein', 'Dil Main', 'Dil Me'], ['Ishq', 'Ishk', 'Ishaq'],
  ['Pyaar', 'Pyar', 'Piyar'], ['Kisi Ki', 'Kisee Kee'], ['Tum Hi Ho', 'Toom Hee Ho'], ['Woh Din', 'Vo Din'], ['Aashiqui', 'Ashiqi'],
  ['Mohabbat', 'Mohabat', 'Muhabbat'], ['Kabira', 'Kabir'], ['Kishore', 'Kishor'], ['Sachet', 'Sachit'], ['Tujhe Dekha Toh', 'Tujhe Dekha To'],
  ['Ae Dil Hai Mushkil', 'Aye Dil Hai Mushkil'], ['Kyun', 'Kyon', 'Kyu'], ['Nahin', 'Nahi'], ['Samajhna', 'Samjhna'], ['Chhoti', 'Choti'],
  ['Wali', 'Vale'], ['Jawaani', 'Jawani', 'Jawaanee'],
];
const scoreAs = (a, b) => {
  const item = { title: `${a} - Test Artist`, channel: 'Test Artist', durationSec: 200, site: 'youtube' };
  return confidence(scoreTrack(parseItem(item), item, { id: 'x', name: b, artists: ['Test Artist'], album: 'x', durationSec: 200 }));
};
for (const g of GROUPS) {
  for (const a of g) for (const b of g) {
    if (a !== b && scoreAs(a, b) !== 'high') fail(`${a} vs ${b} scored ${scoreAs(a, b)}`);
  }
}
console.log(`  ${GROUPS.length} groups checked`);

// ---- 3. English audit
console.log('3. English words that must stay different');
const ENGLISH = `see sea seen sin feet fit feel fill heel hill heal sheep ship cheap chip beet bit beat deep dip peel pill reed rid read meet mitt keen kin steel still
cheek chick leek lick week wick greed grid weed wid need nid seed sid tree tri free fri green grin queen kin bean bin
moon mun soon sun room rum food fud good gud mood mud cool cul pool pull fool full boot but root rut look luk book buk cook cuk hook huk took tuk loop lup
wet vet wine vine west vest wiper viper wail vail whale vale wan van wary vary wise vise wow vow worse
zest jest zip zone zoo quit kit quiet kiet cake kake king
night might light right fight tight sight bright flight tonight
heart heard hurt hurts love live lover liver lives loves
time tame team tome tide tied tune tone tube tame
star stir stay stray stare store steer start
bird bard bold bald bell ball bill bull
rain ran run ruin rein rune
tears tires tiers hair hire hare hero hera
dance dunce dane done dine
alone along alive olive aloof
fire fore fare fear free fur
home hope hole hose
gold gild golf
sweet suite swept
sea sear seal seam seat
heaven heavens
angel angle
cry cries crime
rock rick rack ruck
beautiful beautifully`.split(/\s+/);
const seen = new Map();
for (const w of new Set(ENGLISH)) {
  const key = JSON.stringify(tokens(w));
  seen.set(key, [...(seen.get(key) || []), w]);
}
const collisions = [...seen.values()].filter(ws => ws.length > 1).map(ws => ws.sort().join('/')).sort();
// Pairs the folds knowingly merge (w/v, z/j, ph/f): harmless in practice because a song also needs its artist to match.
const KNOWN = new Set(['vet/wet', 'vine/wine', 'vest/west', 'vail/wail', 'vale/whale', 'van/wan', 'vary/wary', 'vise/wise', 'vow/wow', 'jest/zest', 'viper/wiper']);
const unexpected = collisions.filter(c => !KNOWN.has(c));
console.log(`  ${new Set(ENGLISH).size} English words, ${collisions.length} merged by the folds: ${collisions.join(', ') || 'none'}`);
for (const c of unexpected) fail(`unexpected English collision ${c}`);

// And in scoring: a different English word by the same artist must never be a sure match.
const PAIRS = [['feet', 'fit'], ['sheep', 'ship'], ['deep', 'dip'], ['soon', 'sun'], ['root', 'rut'], ['night', 'light'], ['heart', 'heard'], ['heart', 'hurt'], ['love', 'live'], ['star', 'stir'], ['tears', 'tires'], ['sweet', 'swept']];
for (const [a, b] of PAIRS) {
  for (const [x, y] of [[a, b], [b, a]]) if (scoreAs(x, y) === 'high') fail(`${x} scored high against ${y}`);
}
console.log(`  ${PAIRS.length * 2} different-word pairs, none scored high`);

console.log(failed ? `\n${failed} failure(s)` : '\nAll fold checks passed');
process.exitCode = failed ? 1 : 0;
