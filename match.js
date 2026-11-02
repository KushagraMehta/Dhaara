// Turns messy YouTube video titles into Spotify searches, and scores what Spotify returns.
// Pure functions: no chrome.* or fetch, so they run under node for testing (see tests/run.mjs).

const STRONG_NOISE = new Set([
  'official', 'video', 'audio', 'lyric', 'lyrics', 'lyrical', 'visualizer', 'visualiser',
  'hd', 'hq', '4k', '8k', '1080p', '720p', 'mv', 'full', 'remastered', 'remaster', 'teaser',
  'gana', 'gaana', 'vidiyo', 'vidio', // Hindi/Punjabi for "song" and "video", as they read after transliteration
]);
const WEAK_NOISE = new Set([
  'music', 'song', 'songs', 'new', 'latest', 'out', 'now', 'the', 'with', 'and', 'version', 'explicit', 'clean', 'm', 'v',
  'pura', 'poora', 'puri', 'geet', 'bol', 'ke', 'sath', 'saath', 'ka', 'title', 'track', 'echdi', 'by', 'prod', 'produced',
  'taital', 'taraik', 'traik', 'punjabi', 'panjabi', 'hindi', 'bollywood', 'haryanvi', 'bhojpuri', 'gane', 'gaane', 'naven',
]);
const VERSION_WORDS = new Set(['remix', 'reprise', 'unplugged', 'acoustic', 'lofi', 'lo', 'fi', 'slowed', 'reverb', 'slow', 'version', 'sped', 'up', 'speed', 'nightcore', 'cover', 'mashup', 'instrumental', 'karaoke', 'bass', 'boosted', 'female', 'male', 'reimagined', 'imagined', 're', 'mahila', 'purush', 'sanskaran']);

// A version is a different recording or arrangement of the same song. Matching classes group the spellings
// that mean the same thing to a listener (lofi, slowed and reverb are one family).
const VERSION_RE = /\b(remix|reprise|unplugged|acoustic|lo-?fi|slowed|reverb|slow version|sped up|speed up|nightcore|cover|mashup|instrumental|karaoke|bass boosted|female version|male version|re-?imagined|mahila sanskaran|purush sanskaran)\b/gi;
const VERSION_CLASS = {
  remix: 'remix', reprise: 'reprise', unplugged: 'unplugged', acoustic: 'acoustic', cover: 'cover', mashup: 'mashup',
  instrumental: 'instrumental', karaoke: 'karaoke', lofi: 'lofi', 'lo-fi': 'lofi', slowed: 'lofi', reverb: 'lofi',
  'slow version': 'lofi', 'sped up': 'spedup', 'speed up': 'spedup', nightcore: 'spedup', 'bass boosted': 'bass',
  'female version': 'female', 'male version': 'male', 'mahila sanskaran': 'female', 'purush sanskaran': 'male', reimagined: 'reimagined', 're-imagined': 'reimagined',
};
const LIVE_RE = /\blive\b/i;
const FEAT_RE = /\s+\(?(?:feat|ft|featuring)\.?\s+(.+?)\)?$/i;
const CREDIT_RE = /^(film|dir(?:ected)?|prod(?:uced)?|shot|edit(?:ed)?|mixed|mastered|music|lyrics|composed|written|video|cinematography|dop)\b\.?\s*(by|:)/i;
const ALBUM_RE = /\b(ep|album|lp|mixtape|soundtrack|ost)$/i;
const LABEL_RE = /\b(music|records|recordings|entertainment|series|studios?|films?|movies|productions?|label|originals|media|digital|tunes|melodies|myusic|beats|worldwide)\b/i;
const KNOWN_LABELS_RE = /^(yrf|tips|t-series|eros now|shemaroo|venus|vyrl.*|geet mp3|desi melodies|white hill.*|speed records)$/i;
// Labels written as one word ("SonyMusicIndia", "SonyMusicIndiaVEVO", "TSeries").
const GLUED_LABEL_RE = /^(?:saregama|shemaroo|tips|yrf|yashrajfilms|tseries|ishtar[a-z]*)$|(?:music|records|vevo|entertainment|studios?|films|productions?|company)(?:india)?(?:vevo)?$/;
const LIST_SEP_RE = /,|&|\s(?:x|feat\.?|ft\.?|and)\s/i;

// ---------- Hindi and Punjabi script to Latin ----------
// Table-driven and ITRANS-like, tuned for how Hindi film titles are written in Latin (Hinglish) rather than
// for a lossless round trip: long vowels are written single (so the output reads naturally in a search box)
// and the fold step in tokens() absorbs the remaining spelling drift.
// The inherent "a" is dropped at the end of a word and, between single consonants, by the usual schwa rule.
const DEVANAGARI = {
  cons: { 'क': 'k', 'ख': 'kh', 'ग': 'g', 'घ': 'gh', 'ङ': 'n', 'च': 'ch', 'छ': 'chh', 'ज': 'j', 'झ': 'jh', 'ञ': 'n', 'ट': 't', 'ठ': 'th', 'ड': 'd', 'ढ': 'dh', 'ण': 'n', 'त': 't', 'थ': 'th', 'द': 'd', 'ध': 'dh', 'न': 'n', 'प': 'p', 'फ': 'ph', 'ब': 'b', 'भ': 'bh', 'म': 'm', 'य': 'y', 'र': 'r', 'ल': 'l', 'ळ': 'l', 'व': 'v', 'श': 'sh', 'ष': 'sh', 'स': 's', 'ह': 'h' },
  nukta: { 'क': 'q', 'ख': 'kh', 'ग': 'g', 'ज': 'z', 'ड': 'd', 'ढ': 'dh', 'फ': 'f', 'य': 'y' },
  vowels: { 'अ': 'a', 'आ': 'a', 'इ': 'i', 'ई': 'i', 'उ': 'u', 'ऊ': 'u', 'ऋ': 'ri', 'ए': 'e', 'ऐ': 'ai', 'ओ': 'o', 'औ': 'au', 'ऑ': 'o', 'ऍ': 'e' },
  matras: { 'ा': 'a', 'ि': 'i', 'ी': 'i', 'ु': 'u', 'ू': 'u', 'ृ': 'ri', 'े': 'e', 'ै': 'ai', 'ो': 'o', 'ौ': 'au', 'ॉ': 'o', 'ॅ': 'e' },
  carriers: {}, virama: '्', nuktaMark: '़', nasal: 'ंँ', visarga: 'ः', addak: '', labials: 'पफबभम', digit0: 0x966, om: 'ॐ',
};
const GURMUKHI = {
  cons: { 'ਕ': 'k', 'ਖ': 'kh', 'ਗ': 'g', 'ਘ': 'gh', 'ਙ': 'n', 'ਚ': 'ch', 'ਛ': 'chh', 'ਜ': 'j', 'ਝ': 'jh', 'ਞ': 'n', 'ਟ': 't', 'ਠ': 'th', 'ਡ': 'd', 'ਢ': 'dh', 'ਣ': 'n', 'ਤ': 't', 'ਥ': 'th', 'ਦ': 'd', 'ਧ': 'dh', 'ਨ': 'n', 'ਪ': 'p', 'ਫ': 'ph', 'ਬ': 'b', 'ਭ': 'bh', 'ਮ': 'm', 'ਯ': 'y', 'ਰ': 'r', 'ਲ': 'l', 'ਵ': 'v', 'ੜ': 'r', 'ਸ': 's', 'ਹ': 'h' },
  nukta: { 'ਸ': 'sh', 'ਖ': 'kh', 'ਗ': 'g', 'ਜ': 'z', 'ਫ': 'f', 'ਲ': 'l' },
  vowels: { 'ਆ': 'a', 'ਇ': 'i', 'ਈ': 'i', 'ਉ': 'u', 'ਊ': 'u', 'ਏ': 'e', 'ਐ': 'ai', 'ਓ': 'o', 'ਔ': 'au' },
  matras: { 'ਾ': 'a', 'ਿ': 'i', 'ੀ': 'i', 'ੁ': 'u', 'ੂ': 'u', 'ੇ': 'e', 'ੈ': 'ai', 'ੋ': 'o', 'ੌ': 'au' },
  carriers: { 'ਅ': 'a', 'ੲ': 'i', 'ੳ': 'u' }, // letters that only carry a vowel sign
  virama: '੍', nuktaMark: '਼', nasal: 'ਂੰ', visarga: 'ਃ', addak: 'ੱ', labials: 'ਪਫਬਭਮ', digit0: 0xA66, om: '',
};
const INDIC_RUN_RE = /[\u0900-\u097F\u0A01-\u0A7F\u200C\u200D]+/g;
const INDIC_RE = /[\u0900-\u097F\u0A01-\u0A7F]/;

function romanizeRun(run) {
  const sc = /[\u0900-\u097F]/.test(run) ? DEVANAGARI : GURMUKHI;
  const chars = [...run.normalize('NFKD').replace(/[\u200C\u200D]/g, '')];
  const units = [];
  let cur = null;
  let double = false;
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    const code = ch.codePointAt(0);
    if (code >= sc.digit0 && code < sc.digit0 + 10) { units.push(cur = { c: String(code - sc.digit0), v: '', fixed: true }); continue; }
    if (sc.cons[ch] != null) {
      let r = sc.cons[ch];
      if (chars[i + 1] === sc.nuktaMark) { r = sc.nukta[ch] ?? r; i++; }
      if (double) { r = r[0] + r; double = false; }
      if (cur && cur.halant) {
        cur.c += r; cur.halant = false; cur.cluster = true;
        if (cur.c === 'jn') cur.c = 'gy';
      } else units.push(cur = { c: r, v: null, halant: false, cluster: false, nasal: '', visarga: false });
    } else if (sc.vowels[ch] != null) {
      // A vowel right after another vowel takes a glide in Hinglish: liye, gaye, naye.
      const glide = cur && (cur.v != null || cur.carrier || (cur.c !== '' && !cur.halant)) && /^(?:e|ai)$/.test(sc.vowels[ch]) ? 'y' : '';
      units.push(cur = { c: glide, v: sc.vowels[ch], fixed: true, nasal: '', visarga: false });
    } else if (sc.carriers[ch] != null) {
      units.push(cur = { c: '', v: null, carrier: sc.carriers[ch], nasal: '', visarga: false });
    } else if (sc.matras[ch] != null) {
      if (cur && cur.v == null && !cur.halant) cur.v = sc.matras[ch];
    } else if (ch === sc.virama) {
      if (cur) cur.halant = true;
    } else if (sc.nasal.includes(ch)) {
      if (cur) cur.nasal = chars[i + 1] && sc.labials.includes(chars[i + 1]) ? 'm' : 'n';
    } else if (ch === sc.visarga) {
      if (cur) cur.visarga = true;
    } else if (sc.addak && ch === sc.addak) {
      double = true;
    } else if (ch === sc.om) {
      units.push(cur = { c: 'om', v: '', fixed: true });
    }
  }
  const hasVowel = u => u.c === '' || u.v != null || u.carrier != null || (!u.halant && !u.drop);
  for (let i = units.length - 1; i >= 0; i--) {
    const u = units[i];
    if (u.fixed || u.c === '' || u.v != null || u.halant) continue;
    if (i === units.length - 1) { if (units.length > 1) u.drop = true; continue; }
    const prev = units[i - 1], next = units[i + 1];
    if (!prev || u.cluster || next.cluster || next.c === '' || prev.nasal || !hasVowel(prev) || !hasVowel(next)) continue;
    u.drop = true;
  }
  const word = units.map(u => {
    const v = u.fixed ? u.v : u.drop || u.halant ? '' : (u.v ?? (u.c === '' ? u.carrier : 'a'));
    return u.c + (v ?? '') + (u.nasal || '') + (u.visarga ? 'h' : '');
  }).join('');
  return word ? word[0].toUpperCase() + word.slice(1) : '';
}

function romanizeIndic(s) {
  if (!INDIC_RE.test(s)) return s;
  return s.replace(/[\u0964\u0965]/g, ' ').replace(INDIC_RUN_RE, run => romanizeRun(run));
}

// ---------- normalising and folding ----------
export function normalize(s) {
  let t = (s || '').normalize('NFKD');
  if (INDIC_RE.test(t)) t = romanizeIndic(t);
  return t
    .replace(/[̀-ͯ]/g, '')
    .replace(/(\p{Ll})(\p{Lu})/gu, '$1 $2') // KhoslaRaghu, @YoYoHoneySingh, SonyMusicIndiaVEVO
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^\p{L}\p{M}\p{N}]+/gu, ' ')
    .trim();
}

// Hindi/Punjabi transliterations vary in doubled letters: Dooron/Doron, Haaniyaan/Haniyan.
const squash = t => t.replace(/([^\d])\1+/g, '$1');

// Everyday English words whose ee/oo must not turn into i/u (feet stays apart from fit, soon from sun).
const ENGLISH_KEEP = new Set(('see seen feel feels feeling keep deep sleep sweet street three tree free green queen need needs week meet sheep ' +
  'speed teen beer cheek feet seem steel steep peel heel wheel reel deed seed weed tweet sweep cheer queer agree degree ' +
  'moon soon room good food mood cool school look book blood flood too zoo loop boom doom tool pool fool roof proof smooth groove ' +
  'loose choose shoot root boost spoon afternoon balloon cartoon tattoo bamboo noon boot hood wood stood took cook hook shook foot ' +
  'door floor poor moor ' +
  'beet greed keen reed steer deer peer jeer cheer sneer knee flee glee tweed creek creed freeze breeze sneeze squeeze teeth beef beep creep leech geek seek ' +
  'seep feed fees bees trees broom bloom gloom zoom groom loom troop stoop swoop scoop hoop droop coo boo goo moo woo wool stool spool hoof goof roost moose goose noose tooth booth').split(' '));

// Common Hinglish words that vary beyond what the letter folds catch. Keys are already folded.
const WORD_FOLD = new Map(Object.entries({
  mein: 'main', mai: 'main', mei: 'main', me: 'main', men: 'main',
  toh: 'to', yeh: 'ye', yah: 'ye', nahin: 'nahi', nai: 'nahi', nhi: 'nahi',
  kyu: 'kyun', kyon: 'kyun', ishak: 'ishk', piyar: 'pyar', aye: 'ae', ay: 'ae',
  muhabat: 'mohabat', voh: 'vo', ik: 'ek',
}));

const FOLD_CACHE = new Map();
// One spelling per Hinglish sound: ee/i, oo/u, w/v, z/j, ph/f, q/k, chh/ch, doubled letters, plus a few common words
// (mein/main/me, ishq/ishk, pyaar/pyar). Meant for Hindi, Punjabi and Urdu song words; English words fold the same
// way on both sides, so the only cost is a handful of English pairs that differ only by these letters (see tests/folds.mjs).
function foldToken(w) {
  let t = FOLD_CACHE.get(w);
  if (t !== undefined) return t;
  t = w;
  if (!ENGLISH_KEEP.has(t)) t = t.replace(/ee/g, 'i').replace(/oo/g, 'u');
  t = squash(t.replace(/qui$/, 'ki').replace(/q/g, 'k').replace(/chh/g, 'ch').replace(/ph/g, 'f').replace(/w/g, 'v').replace(/z/g, 'j'));
  t = WORD_FOLD.get(t) || t;
  if (FOLD_CACHE.size > 20000) FOLD_CACHE.clear();
  FOLD_CACHE.set(w, t);
  return t;
}

export function tokens(s) {
  return normalize(s).split(' ').filter(Boolean).map(foldToken);
}

const uniq = a => [...new Set(a)];

// Fuzzy token equality for spelling drift in Hinglish: Kishor/Kishore, Kabir/Kabira, Sachit/Sachet, Mustafa/Mushtafa.
// Only one-letter edits that are vowels (or an h or y) count, so English words that differ by a consonant
// (night/light, heart/heard) stay apart.
const SOFT = 'aeiouhy';
function lev1(a, b) {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  if (a.length === b.length) return a.slice(i + 1) === b.slice(i + 1) && 'aeiou'.includes(a[i]) && 'aeiou'.includes(b[i]);
  const [s, l] = a.length < b.length ? [a, b] : [b, a];
  return s.slice(i) === l.slice(i + 1) && SOFT.includes(l[i]);
}
// The same word with the schwa kept or dropped (samajhna/samjhna, badtameez/badatmeez) differs only by letter a.
const SKEL = new Map();
const skel = t => { let k = SKEL.get(t); if (k === undefined) { k = t.replace(/a/g, ''); if (SKEL.size > 20000) SKEL.clear(); SKEL.set(t, k); } return k; };
function eq(a, b) {
  if (a === b) return true;
  const m = Math.min(a.length, b.length);
  if (m < 4) return false;
  if (skel(a) === skel(b) && skel(a).length >= 3) return true;
  if (Math.abs(a.length - b.length) > 1 || !lev1(a, b)) return false;
  if (m >= 5) return true;
  // Four letters: a trailing h (sola/solah) or a final vowel that inflects (vale/vali, tera/tere).
  return a === b + 'h' || b === a + 'h' || (a.length === b.length && a.slice(0, -1) === b.slice(0, -1) && 'aei'.includes(a.at(-1)) && 'aei'.includes(b.at(-1)));
}
const has = (list, t) => list.some(h => eq(h, t));
function overlap(A, B) {
  const used = new Array(B.length).fill(false);
  let n = 0;
  for (const a of A) {
    const j = B.findIndex((b, i) => !used[i] && eq(a, b));
    if (j >= 0) { used[j] = true; n++; }
  }
  return n;
}
function diceTok(A, B) {
  if (!A.length || !B.length) return 0;
  return (2 * overlap(A, B)) / (A.length + B.length);
}

// Programme headers that sit in front of the song: "Coke Studio | Season 14 | Pasoori | ...".
const SERIES_RE = /^(?:coke studio(?: (?:bharat|pakistan|india|season \d+))?|nescafe basement(?: season \d+)?|mtv unplugged(?: season \d+)?|(?:season|episode|ep|vol|volume)\.? ?\d+)$/i;

// A segment is noise when every word is: "Official Video", "Latest Punjabi Songs 2024", "Pura Vidiyo Gana".
function isNoise(segment) {
  if (SERIES_RE.test(normalize(segment))) return true;
  const toks = normalize(segment).split(' ').filter(Boolean);
  if (!toks.length) return true;
  let strong = false;
  for (const t of toks) {
    if (STRONG_NOISE.has(t)) strong = true;
    else if (!WEAK_NOISE.has(t) && !/^\d{4}$/.test(t)) return false;
  }
  return strong || toks.length >= 2;
}

// Noise words in the form tokens() produces (with -> vith), for checking folded tokens.
let FOLDED_NOISE = null;
const foldedNoise = () => FOLDED_NOISE || (FOLDED_NOISE = new Set([...STRONG_NOISE, ...WEAK_NOISE, ...VERSION_WORDS].map(foldToken)));

function containsTokens(hayTokens, needle) {
  const n = tokens(needle);
  if (!n.length) return false;
  const hay = Array.isArray(hayTokens) ? hayTokens : [...hayTokens];
  return n.every(t => has(hay, t));
}

function sameish(segment, artist) {
  if (!segment || !artist) return false;
  return containsTokens(tokens(segment), artist) || containsTokens(tokens(artist), segment);
}

// The song is almost always in the first two segments. A segment that is an artist, or a list of
// artists ("Anuv Jain X Lost Stories"), is skipped; "Sahiba Jasleen Royal" gives "Sahiba".
function pickSong(candidates, artists) {
  for (const seg of candidates) {
    const hits = artists.filter(a => sameish(seg, a));
    if (!hits.length) return seg;
    if (LIST_SEP_RE.test(seg)) continue;
    const drop = new Set(hits.flatMap(tokens));
    const rest = normalize(seg).split(' ').filter(t => t && !drop.has(foldToken(t))).join(' ');
    if (rest) return rest;
  }
  return candidates[0] || '';
}

// YouTube bylines: "KhoslaRaghu and Sony Music India", "Sony Music India and 4 more", "Niyam - Topic".
// YouTube Music bylines: "Arijit Singh, Sachin-Jigar & Amitabh Bhattacharya".
function channelArtists(channel, site) {
  const c = romanizeIndic((channel || '').normalize('NFKC')).replace(/\s*-\s*Topic$/i, '').replace(/VEVO$/i, '').replace(/\bofficial\b/gi, '').trim();
  const parts = site === 'youtube'
    ? c.split(/\s+and\s+/i)
    : c.split(/\s*,\s*|\s+&\s+|\s+and\s+|\s+x\s+/i);
  const isLabel = p => LABEL_RE.test(p) || KNOWN_LABELS_RE.test(p) || GLUED_LABEL_RE.test(p.toLowerCase().replace(/[^a-z0-9]/g, ''));
  return parts
    .map(p => p.trim())
    .filter(p => p && !/^\d+\s+more$/i.test(p) && !(site === 'youtube' && isLabel(p)));
}

// A version is the set of classes named in a text ("Slowed + Reverb" and "Lofi" are both 'lofi').
function versionsOf(text) {
  const out = new Set();
  for (const m of (text || '').match(VERSION_RE) || []) out.add(VERSION_CLASS[m.toLowerCase().replace(/\s+/g, ' ')] || m.toLowerCase());
  return out;
}

// "Tera Hone Laga Hoon - Full Video": noise sits at the edge of a segment, never in the middle of a song name.
const TAIL_NOISE_RE = /(\S)\s+(?:(?:full|official|lyric|lyrical|hd|4k|8k|hq)\s+)*(?:video|audio|song|lyrical|lyrics?|visuali[sz]er)(?:\s+(?:video|audio|song))*$/i;
const HINDI_TAIL_RE = /(\S)\s+(?:(?:pura|poora|puri)\b.*|(?:vidiyo\s+)?(?:gana|gaana)\b.*|bol\s+ke\s+sa+th\b.*)$/i;
const TITLE_TRACK_RE = /(\S)\s+(?:title|taital)\s+(?:song|track|taraik|traik)$/i;

function cleanSegment(s) {
  let t = s.replace(FEAT_RE, '').replace(/\.\.\.|…/g, ' ').replace(/^(?:lyrical|lyrics|official)\s+(?=\S+\s)/i, '').replace(/\s+/g, ' ').trim();
  for (let i = 0; i < 3; i++) {
    const before = t;
    t = t.replace(HINDI_TAIL_RE, '$1').replace(TAIL_NOISE_RE, '$1').replace(TITLE_TRACK_RE, '$1').trim();
    if (t === before) break;
  }
  return t;
}

export function parseItem(item) {
  const site = item.site || 'youtube';
  let title = romanizeIndic((item.title || '').normalize('NFKC'))
    .replace(/\p{Extended_Pictographic}|️|‍/gu, ' ')
    .replace(/#\S+/g, ' ')
    .replace(/@(\w+)/g, (_, h) => h.replace(/([a-z])([A-Z])/g, '$1 $2'))
    .replace(/[“”"«»]/g, '');

  // "Tum Se (Full Video): Shahid, Kriti" names the song before the colon; "Film: Song | Actors" names the film.
  const markerBeforeColon = /^[^|:]*\((?:(?:full|video|official)\s+)?(?:video|lyrical|audio|song|lyrics?|official[^)]*)\)\s*:/i.test(title.trim());

  let isLive = false;
  let version = null;
  const versions = new Set();
  const feats = [];
  title = title.replace(/[(\[{【「]([^)\]}】」]*)[)\]}】」]/g, (_, inner) => {
    if (LIVE_RE.test(inner)) isLive = true;
    for (const v of versionsOf(inner)) versions.add(v);
    const v = inner.match(new RegExp(VERSION_RE.source, 'i'));
    if (v) version = v[1].toLowerCase();
    const f = inner.match(/^(?:feat|ft|featuring|with)\.?\s+(.+)/i);
    if (f) feats.push(f[1]);
    // "Tension (Official Music Video) Advisory": what follows a video marker is a label or credit, not the song.
    return isNoise(inner) ? ' | ' : ' ';
  });
  for (const v of versionsOf(title)) versions.add(v);
  if (!version) version = title.match(new RegExp(VERSION_RE.source, 'i'))?.[1]?.toLowerCase() || null;
  if (LIVE_RE.test(title)) isLive = true;

  // Bollywood uploads often read "Film: Song | Actors | ...".
  const colonPrefix = !markerBeforeColon && /^[^|:\-–—]{2,40}:(?:\s|(?=\p{L}))/u.test(title.trim());

  let pairs = title
    .split(/\s*[|｜•·]\s*|\s+[-–—~]\s*|\s*[-–—~]\s+|\s+\/\/\s+|\s*:\s+|(?<=\p{L}):(?=\p{L})/u)
    .map(s => {
      const f = s.match(FEAT_RE);
      if (f) feats.push(f[1]);
      return { clean: cleanSegment(s), raw: s.replace(FEAT_RE, '').replace(/\s+/g, ' ').trim() };
    });
  // "Sardar Ji 3: Title Track" has a colon too, but what follows it is noise, so the song is still first.
  // "Lyrical: Kaise Hua | Kabir Singh" is the same pattern with a noise word in front, and there the song comes first.
  const filmPrefix = colonPrefix && pairs.length > 1 && !isNoise(pairs[0].clean) && !isNoise(pairs[1].clean);
  pairs = pairs.filter(p => p.clean && !isNoise(p.clean) && !CREDIT_RE.test(p.clean) && !ALBUM_RE.test(p.clean));
  const segments = pairs.map(p => p.clean);
  const rawSegments = pairs.map(p => p.raw);

  const artists = channelArtists(item.channel, site);
  // "@SaiAbhyankkar - Aasa Kooda": a handle in the title names an artist even when the channel is a label.
  for (const [, h] of (item.title || '').matchAll(/@(\w+)/g)) {
    const name = h.replace(/([a-z])([A-Z])/g, '$1 $2');
    if (!artists.some(a => sameish(name, a))) artists.push(name);
  }
  const songish = pickSong(segments.slice(filmPrefix ? 1 : 0, filmPrefix ? 3 : 2), artists);
  const fullTokens = new Set([...tokens(title), ...tokens(item.channel), ...feats.flatMap(tokens)]);

  return { site, segments, rawSegments, artists, songish, isLive, version, versions, feats, fullTokens, filmPrefix };
}

// At most three searches per video, most specific first.
export function buildQueries(parsed) {
  const { segments, artists, songish, version } = parsed;
  const qs = [];
  if (segments.length >= 2) qs.push(`${segments[0]} ${segments[1]}`);
  if (songish && artists[0]) qs.push(`${songish} ${artists[0]}`);
  if (songish) qs.push(songish);
  if (version && qs.length) qs[0] = `${qs[0]} ${version}`;

  const seen = new Set();
  return qs.map(q => (q.length > 120 ? q.slice(0, 120).replace(/\s+\S*$/, '') : q)).filter(q => {
    const key = tokens(q).sort().join(' ');
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 3);
}

// ---------- scoring ----------

// Spotify names carry extras the video title will not: 'Chann (From "Udta Teer")', 'Song - Remastered 2011'.
function coreName(name) {
  return (name || '').replace(/\s*[(\[][^)\]]*[)\]]/g, '').split(/\s+-\s+/)[0].trim() || name;
}

// The film or album a track belongs to, from the album and from a (From "Film") suffix.
const NOT_A_FILM = new Set(['single', 'ep', 'album', 'hits', 'best', 'of', 'songs', 'originals', 'collection', 'versions', 'lofi', 'flips', 'sessions', 'various', 'artists', 'unknown']);
function filmsOf(track) {
  const out = [];
  const album = (track.album || '').replace(/\s*[(\[][^)\]]*(?:motion picture|soundtrack|original|ost|deluxe|remaster)[^)\]]*[)\]]/gi, '').replace(/\s*[(\[][^)\]]*[)\]]\s*$/, '').trim();
  if (album) out.push(album);
  const from = (track.name || '').match(/(?:from|film)\s*[:\-]?\s*["“'](.+?)["”']/i);
  if (from) out.push(from[1]);
  return out;
}

const CONNECTORS = new Set(['and', 'x', 'feat', 'ft', 'with', 'vs', 'prod', 'by']);
const GENERIC_NAME = new Set(['kumar', 'singh', 'khan', 'kaur', 'ali', 'devi', 'dev', 'sharma', 'kapoor', 'the', 'dj', 'mc', 'sir', 'bhai', 'music', 'official']);

// 1 = full name seen, 0.85 = name seen but for a last name or initial ("Arijit S", "Roop Kumar"),
// 0.5 = only a first name ("Lata"), 0 = nothing.
function artistLevel(hay, artists) {
  let best = 0;
  let firstNames = 0;
  for (const a of artists || []) {
    const at = uniq(tokens(a));
    if (!at.length) continue;
    if (at.every(t => has(hay, t))) return 1;
    const joined = at.join('');
    if (joined.length >= 6 && hay.some(t => t === joined || (t.length > joined.length && t.includes(joined)))) return 1;
    if (at.length < 2) continue;
    const lead = at.slice(0, -1);
    const last = at[at.length - 1];
    if (!lead.every(t => has(hay, t)) || !lead.some(t => t.length >= 3 && !GENERIC_NAME.has(t))) continue;
    if (lead.length >= 2 || (hay.includes(last[0]) && lead[0].length >= 3)) best = Math.max(best, 0.85);
    else if (lead[0].length >= 4) { best = Math.max(best, 0.5); firstNames++; }
  }
  // Two different artists each named by first name ("Raghav, Tanishk, Asees") is as good as a full name.
  return firstNames >= 2 ? Math.max(best, 0.85) : best;
}

// Does the track's film or album show up in the title as something other than the song itself?
function filmEvidence(parsed, track, nameToks) {
  const hay = [...parsed.fullTokens];
  for (const film of filmsOf(track)) {
    const ft = uniq(tokens(film));
    if (!ft.length || ft.every(t => NOT_A_FILM.has(t)) || diceTok(ft, nameToks) >= 0.8) continue;
    if (parsed.segments.some(s => diceTok(ft, uniq(tokens(s))) >= 0.8)) return true;
    if (ft.length >= 2 && ft.every(t => has(hay, t))) return true;
  }
  return false;
}

// How well the track's name is the song in the title, 0..1. The song sits in the first segments; a name that
// only matches a later segment (usually the film) counts for half, and a name that equals the segment the
// track's own album matches is the film's title track, not the song.
function nameScore(parsed, nameToks, nameOrdered, track, trusted) {
  if (!nameToks.length) return 0;
  const albumToks = uniq(filmsOf(track).flatMap(tokens));
  const explained = [...albumToks, ...(track.artists || []).flatMap(tokens), ...parsed.artists.flatMap(tokens), ...parsed.feats.flatMap(tokens)];
  // A year is noise; any other number (Sardar Ji 3, Aashiqui 2) is part of a name unless the album carries it too.
  const isExplained = x => /^(?:19|20)\d{2}$/.test(x) || foldedNoise().has(x) || has(explained, x);
  // For this track the song is the first of the leading segments that is not one of its own artists
  // ("Sai Abhyankkar - Aasa Kooda" when the artist is not the channel).
  const artistToks = uniq((track.artists || []).flatMap(tokens));
  const segs = parsed.segments;
  const lead = parsed.filmPrefix ? [segs[1], segs[0], segs[2]] : [segs[0], segs[1]];
  const isArtists = sg => { const t = uniq(tokens(sg)).filter(x => !CONNECTORS.has(x)); return t.length > 0 && overlap(t, artistToks) === t.length; };
  const own = lead.find(sg => sg && !isArtists(sg));
  const songToks = tokens(own ?? parsed.songish);
  const texts = [{ t: parsed.songish, w: 1 }];
  parsed.segments.forEach((s, i) => {
    const w = i < 2 || (parsed.filmPrefix && i === 2) ? 1 : 0.5;
    texts.push({ t: s, w }, { t: parsed.rawSegments?.[i] ?? s, w: w * 0.98 });
  });
  let best = 0;
  for (const { t, w } of texts) {
    const ordered = tokens(t);
    const st = uniq(ordered);
    if (!st.length) continue;
    const isSong = diceTok(st, uniq(songToks)) >= 0.99;
    if (!isSong && albumToks.length && (diceTok(st, albumToks) >= 0.8 || (st.length >= 2 && overlap(st, albumToks) === st.length))) continue;
    // Only a name whose every word is in the text counts as the song. One extra word on either side ("Tum Hi Ho
    // Baby" for "Tum Hi Ho") is a different song, so overlap alone never reaches "sure".
    const nameIn = overlap(nameToks, st) === nameToks.length;
    const textIn = overlap(st, nameToks) === st.length;
    let d = Math.min(diceTok(nameToks, st), 0.79);
    if (nameIn && textIn) d = 1;
    else if (nameIn && st.filter(x => !nameToks.some(n => eq(n, x))).every(isExplained)) d = 0.95;
    else if (textIn) {
      // Titles often cut a long Spotify name short: "Ek Ladki Ko Dekha" for "Ek Ladki Ko Dekha To Aisa Laga".
      const o = ordered.filter((x, i) => ordered.indexOf(x) === i);
      if (trusted && o.length >= 3 && o.every((x, i) => eq(x, nameOrdered[i]))) d = 0.8;
    }
    best = Math.max(best, d * w);
  }
  return best;
}

export function scoreTrack(parsed, item, track) {
  const name = coreName(track.name);
  const nameOrdered = tokens(name);
  const nameToks = uniq(nameOrdered);
  const hay = [...parsed.fullTokens];
  const level = artistLevel(hay, track.artists);
  const film = filmEvidence(parsed, track, nameToks);
  // A title that cuts the name short is only trusted when both the artist and the film check out.
  const nScore = nameScore(parsed, nameToks, nameOrdered, track, level === 1 && film);
  const artistScore = Math.max(level, film ? 0.65 : 0);
  const strong = level >= 0.85 || film;

  let score;
  if (item.durationSec && track.durationSec) {
    const d = Math.abs(item.durationSec - track.durationSec);
    const durScore = d <= 3 ? 1 : d <= 10 ? 0.8 : d <= 30 ? 0.5 : d <= 60 ? 0.2 : 0;
    score = 0.55 * nScore + 0.35 * artistScore + 0.1 * durScore;
  } else {
    score = 0.6 * nScore + 0.4 * artistScore;
  }

  const trackLive = LIVE_RE.test(track.name) || LIVE_RE.test(track.album || '');
  if (parsed.isLive !== trackLive) score -= 0.05;

  // Versions (decision 6): a slowed/lofi/remix upload wants that version first. The original may still match
  // but is only ever "check"; a different version is penalised more. With no version in the title, version
  // tracks stay penalised.
  const wanted = parsed.versions;
  const have = versionsOf(`${track.name} ${track.album || ''}`);
  const sameVersion = wanted.size > 0 && [...have].some(v => wanted.has(v));
  let cap = strong ? 1 : level > 0 ? 0.74 : 0.59;
  if (wanted.size) {
    if (sameVersion) {
      if (nScore >= 0.85) cap = Math.max(cap, 0.72); // right name and version, artist unknown: "check", but above the original
    } else if (have.size) { score -= 0.2; cap = Math.min(cap, 0.66); }
    else { score -= 0.1; cap = Math.min(cap, 0.7); }
  } else if (have.size) score -= 0.25;

  // A name that is only partly the song can never be a sure pick, whoever sings it.
  if (nScore < 0.8) cap = Math.min(cap, nScore < 0.5 ? 0.59 : 0.74);

  score = Math.min(score, cap);
  return Math.max(0, Math.min(1, Math.round(score * 100) / 100));
}

// high and check start ticked; low starts unticked so a wrong song is never added silently.
export function confidence(score) {
  if (score == null) return 'none';
  if (score >= 0.75) return 'high';
  if (score >= 0.6) return 'check';
  return 'low';
}

// search(q) -> Promise<track[]>. Stops early once a near-certain match turns up.
export async function matchItem(item, search) {
  const parsed = parseItem(item);
  const queries = buildQueries(parsed);
  const seen = new Map();
  for (const q of queries) {
    for (const t of await search(q)) {
      if (!seen.has(t.id)) seen.set(t.id, { ...t, score: scoreTrack(parsed, item, t) });
    }
    if ([...seen.values()].some(t => t.score >= 0.9)) break;
  }
  const ranked = [...seen.values()].sort((a, b) => b.score - a.score);
  return { queries, match: ranked[0] || null, alts: ranked.slice(0, 6) };
}

export function rescore(item, tracks) {
  const parsed = parseItem(item);
  return tracks.map(t => ({ ...t, score: scoreTrack(parsed, item, t) })).sort((a, b) => b.score - a.score);
}
