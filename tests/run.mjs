// Golden-set runner for match.js. Offline: no network, no Spotify.
//   /opt/homebrew/bin/node tests/run.mjs                 summary + failures
//   /opt/homebrew/bin/node tests/run.mjs --all           list every failure (default: first 40)
//   /opt/homebrew/bin/node tests/run.mjs --tag lofi      only items with that tag
//   /opt/homebrew/bin/node tests/run.mjs --id g012       one item, with every candidate's score
//   /opt/homebrew/bin/node tests/run.mjs --file tests/holdout.json   the second set: built blind from Mixes not used for tuning (its first-run failures were then fixed generally)
//   MATCH_JS=orig/match.js /opt/homebrew/bin/node tests/run.mjs --save-baseline   write tests/baseline.json from another copy of match.js
// Exit code 1 when a decoy or a wrong song scores 'high', or an original-only match is not capped below high.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

// MATCH_JS=/path/to/other/match.js runs the same golden set against another copy (used to record the baseline).
const target = process.env.MATCH_JS ? pathToFileURL(resolve(process.env.MATCH_JS)).href : new URL('../match.js', import.meta.url).href;
const { parseItem, buildQueries, scoreTrack, confidence, matchItem, tokens } = await import(target);

const dir = fileURLToPath(new URL('.', import.meta.url));
const args = process.argv.slice(2);
const flag = f => args.includes(f);
const opt = f => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : null; };

const file = opt('--file') ? resolve(opt('--file')) : dir + 'golden.json';
const golden = JSON.parse(readFileSync(file, 'utf8'));
let items = golden.items;
if (opt('--tag')) items = items.filter(i => i.tags.includes(opt('--tag')));
if (opt('--id')) items = items.filter(i => i.id === opt('--id'));

// Same idea as match.js's token equality, kept local so the runner measures searches, not the code under test:
// words match when they differ by one letter (Kishor/Kishore) or only by the letter a (samajhna/samjhna).
const near = (a, b) => {
  if (a === b) return true;
  if (Math.min(a.length, b.length) < 4) return false;
  const k = t => t.replace(/a/g, '');
  if (k(a) === k(b)) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return a.length === b.length ? a.slice(i + 1) === b.slice(i + 1) : (a.length < b.length ? a.slice(i) === b.slice(i + 1) : b.slice(i) === a.slice(i + 1));
};

const rankOf = (parsed, item, cands) => cands
  .map(c => ({ c, score: scoreTrack(parsed, item.item, c) }))
  // Ties are judged pessimistically: a decoy that ties with the right track wins.
  .sort((a, b) => b.score - a.score || (b.c.correct ? -1 : 0) - (a.c.correct ? -1 : 0));

const pct = (a, b) => (b ? `${(100 * a / b).toFixed(1)}%` : 'n/a');
const short = (s, n = 70) => (s.length > n ? s.slice(0, n - 1) + '…' : s);
const songCore = s => (s || '').replace(/\s*[(\[][^)\]]*[)\]]/g, '').replace(/\s+-\s+.*$/, '').trim() || s;

const rows = [];
for (const it of items) {
  const parsed = parseItem(it.item);
  const queries = buildQueries(parsed);
  const ranked = rankOf(parsed, it, it.candidates);
  const top = ranked[0];
  const correct = it.candidates.find(c => c.correct) || null;
  const correctScore = correct ? ranked.find(r => r.c === correct).score : null;
  const topConf = confidence(top.score);
  const decoysHigh = ranked.filter(r => !r.c.correct && confidence(r.score) === 'high');

  // Do the searches carry the song? At least one query must hold every word of the expected song name,
  // or, when the title cut a long name short, every word of the title's own song text (three or more words).
  let queryHit = null;
  if (it.expected.song) {
    const want = tokens(songCore(it.expected.song));
    const song = tokens(parsed.songish);
    const truncated = song.length >= 3 && song.length < want.length && song.every((t, i) => near(t, want[i]));
    const covers = (qt, words) => words.length > 0 && words.every(t => qt.some(q => near(q, t)));
    queryHit = queries.some(q => { const qt = tokens(q); return covers(qt, want) || (truncated && covers(qt, song)); });
  }

  // End to end through matchItem with a crude simulated search (a candidate comes back when half the query words hit it).
  const search = async q => {
    const qt = tokens(q);
    return it.candidates.filter(c => {
      const ct = new Set(tokens([c.name, ...c.artists, c.album].join(' ')));
      return qt.length && qt.filter(t => ct.has(t)).length * 2 >= qt.length;
    }).map(({ correct, decoy, version, originalOnly, ...t }) => ({ ...t, _c: !!correct }));
  };
  const e2e = await matchItem(it.item, search);
  const e2eTop = e2e.match ? it.candidates.find(c => c.id === e2e.match.id) : null;

  rows.push({ it, parsed, queries, ranked, top, correct, correctScore, topConf, decoysHigh, queryHit, e2eTop, e2eScore: e2e.match?.score ?? null });
}

// ---- metrics
const scored = rows.filter(r => !r.it.unsure);
const withCorrect = scored.filter(r => r.correct);
const top1 = withCorrect.filter(r => r.top.c.correct);
const expectHigh = scored.filter(r => r.it.expectHigh && r.correct);
const hitHigh = expectHigh.filter(r => r.top.c.correct && r.topConf === 'high');
const highTop = scored.filter(r => r.topConf === 'high');
const highRight = highTop.filter(r => r.top.c.correct && !r.it.maxConfidence);
const decoyHigh = rows.flatMap(r => r.decoysHigh.map(d => ({ r, d })));
const capViolations = rows.filter(r => r.it.maxConfidence && r.correct && confidence(r.correctScore) === 'high');
const noSong = scored.filter(r => !r.correct);
const noSongHigh = noSong.filter(r => r.topConf === 'high');
const unsure = rows.filter(r => r.it.unsure);
const unsureHigh = unsure.filter(r => r.topConf === 'high' && !r.top.c.correct);
const withQ = rows.filter(r => r.queryHit !== null);
const qHit = withQ.filter(r => r.queryHit);
const e2eTop1 = withCorrect.filter(r => r.e2eTop?.correct);
const e2eHigh = expectHigh.filter(r => r.e2eTop?.correct && confidence(r.e2eScore) === 'high');

const metrics = {
  items: rows.length, counted: scored.length, unsure: unsure.length,
  highPrecision: highTop.length ? highRight.length / highTop.length : 1, highReturned: highTop.length, highWrong: highTop.length - highRight.length,
  top1Recall: withCorrect.length ? top1.length / withCorrect.length : 0, top1: top1.length, top1Of: withCorrect.length,
  highRecall: expectHigh.length ? hitHigh.length / expectHigh.length : 0, highHit: hitHigh.length, highOf: expectHigh.length,
  decoysHigh: decoyHigh.length, capViolations: capViolations.length, notOnSpotifyHigh: noSongHigh.length,
  queryHit: withQ.length ? qHit.length / withQ.length : 0,
  e2eTop1: withCorrect.length ? e2eTop1.length / withCorrect.length : 0, e2eHighRecall: expectHigh.length ? e2eHigh.length / expectHigh.length : 0,
};

// ---- cross-item check: every title against the right track of every other song. None may reach 'high'.
const songKey = t => tokens(songCore(t.name)).join(' ');
const pool = rows.flatMap(r => (r.correct ? [{ id: r.it.id, t: r.correct, key: songKey(r.correct), name: r.it.expected.song }] : []));
const crossHigh = [];
let crossPairs = 0;
for (const r of rows) {
  const own = r.correct ? songKey(r.correct) : null;
  for (const p of pool) {
    if (p.id === r.it.id || p.key === own || p.key === songKey({ name: r.it.expected.song || '' })) continue;
    crossPairs++;
    const score = scoreTrack(r.parsed, r.it.item, p.t);
    if (confidence(score) === 'high') crossHigh.push({ id: r.it.id, title: r.it.item.title, wrong: `${p.t.name} / ${p.t.artists.join(', ')}`, score });
  }
}

metrics.crossHigh = crossHigh.length;

// ---- failures
const failures = [];
for (const r of rows) {
  const t = r.it;
  const why = [];
  if (r.decoysHigh.length) why.push(`DECOY HIGH: ${r.decoysHigh.map(d => `${d.c.name} / ${d.c.artists.join(', ')} (${d.score})`).join('; ')}`);
  if (r.correct && t.maxConfidence && confidence(r.correctScore) === 'high') why.push(`original-only match not capped (${r.correctScore})`);
  if (!t.unsure) {
    if (r.correct && !r.top.c.correct) why.push(`ranked ${r.top.c.name} / ${r.top.c.artists.join(', ')} (${r.top.score}) above the right track (${r.correctScore})`);
    else if (r.correct && t.expectHigh && confidence(r.correctScore) !== 'high') why.push(`right track only ${confidence(r.correctScore)} (${r.correctScore}), expected high`);
    if (!r.correct && r.topConf === 'high') why.push(`not on Spotify but ${r.top.c.name} scored high`);
    if (r.queryHit === false) why.push('no query carries the song name');
  }
  if (why.length) failures.push({ r, why });
}

// ---- report
const L = [];
L.push(`Golden set: ${rows.length} items (${scored.length} counted, ${unsure.length} unsure and scored for decoys only), ${rows.reduce((n, r) => n + r.it.candidates.length, 0)} candidates`);
L.push('');
L.push(`High precision      ${pct(highRight.length, highTop.length).padStart(7)}   (${highRight.length}/${highTop.length} top picks scored high and were the right track)`);
L.push(`Top-1 recall        ${pct(top1.length, withCorrect.length).padStart(7)}   (${top1.length}/${withCorrect.length} right track ranked first)`);
L.push(`High recall         ${pct(hitHigh.length, expectHigh.length).padStart(7)}   (${hitHigh.length}/${expectHigh.length} right track ranked first and scored high)`);
L.push(`Decoys scoring high ${String(decoyHigh.length).padStart(7)}   (must be 0)`);
L.push(`Cross-item high     ${String(crossHigh.length).padStart(7)}   (each title vs the right track of ${pool.length - 1} other songs, ${crossPairs} pairs; must be 0)`);
L.push(`Original-only high  ${String(capViolations.length).padStart(7)}   (original of a slowed/lofi upload scored high; must be 0)`);
L.push(`Not-on-Spotify high ${String(noSongHigh.length).padStart(7)}   (must be 0)`);
L.push(`Query carries song  ${pct(qHit.length, withQ.length).padStart(7)}   (${qHit.length}/${withQ.length})`);
L.push(`End to end (sim.)   top-1 ${pct(e2eTop1.length, withCorrect.length)}, high recall ${pct(e2eHigh.length, expectHigh.length)}`);
for (const c of crossHigh.slice(0, 10)) L.push(`  cross-item high: ${c.id} ${short(c.title, 50)} -> ${c.wrong} (${c.score})`);
if (unsureHigh.length) L.push(`Unsure items whose top pick scored high on a different track: ${unsureHigh.length} (check by eye)`);

L.push('');
L.push('By tag                  n   top-1   high-recall   high-precision');
const tags = [...new Set(rows.flatMap(r => r.it.tags))].sort();
for (const tag of tags) {
  const rs = scored.filter(r => r.it.tags.includes(tag));
  if (!rs.length) continue;
  const wc = rs.filter(r => r.correct), t1 = wc.filter(r => r.top.c.correct);
  const eh = rs.filter(r => r.it.expectHigh && r.correct), hh = eh.filter(r => r.top.c.correct && r.topConf === 'high');
  const ht = rs.filter(r => r.topConf === 'high'), hr = ht.filter(r => r.top.c.correct && !r.it.maxConfidence);
  L.push(`${tag.padEnd(20)} ${String(rs.length).padStart(3)}  ${pct(t1.length, wc.length).padStart(7)}  ${pct(hh.length, eh.length).padStart(7)}      ${pct(hr.length, ht.length).padStart(7)}`);
}

if (!opt('--file') && existsSync(dir + 'baseline.json') && !flag('--save-baseline')) {
  const b = JSON.parse(readFileSync(dir + 'baseline.json', 'utf8')).metrics;
  const d = (k, pctv = true) => pctv ? `${(100 * b[k]).toFixed(1)}% -> ${(100 * metrics[k]).toFixed(1)}%` : `${b[k]} -> ${metrics[k]}`;
  L.push('');
  L.push(`Baseline (tests/baseline.json): high precision ${d('highPrecision')}, top-1 ${d('top1Recall')}, high recall ${d('highRecall')}, decoys high ${d('decoysHigh', false)}, query ${d('queryHit')}`);
}

if (opt('--id')) {
  for (const r of rows) {
    L.push('', `${r.it.id} ${r.it.item.title} | ${r.it.item.channel} | ${r.it.item.durationSec}s (${r.it.item.site})`);
    L.push(`  parsed: song=${JSON.stringify(r.parsed.songish)} artists=${JSON.stringify(r.parsed.artists)} version=${r.parsed.version} segments=${JSON.stringify(r.parsed.segments)}`);
    L.push(`  queries: ${JSON.stringify(r.queries)}`);
    for (const x of r.ranked) L.push(`  ${x.score.toFixed(2)} ${confidence(x.score).padEnd(5)} ${x.c.correct ? 'RIGHT' : (x.c.decoy || 'decoy').padEnd(5)}  ${x.c.name} / ${x.c.artists.join(', ')} / ${x.c.album} / ${x.c.durationSec}s`);
  }
} else {
  const cap = flag('--all') ? failures.length : 40;
  L.push('', `Failures: ${failures.length}${failures.length > cap ? ` (showing ${cap}, use --all)` : ''}`);
  for (const { r, why } of failures.slice(0, cap)) {
    L.push(`- ${r.it.id} [${r.it.tags.join(',') || '-'}] ${short(r.it.item.title, 90)} | ${short(r.it.item.channel || '', 30)}`);
    L.push(`    expected: ${r.it.expected.song} / ${r.it.expected.artist}${r.it.expected.version ? ` (${r.it.expected.version})` : ''}${r.it.unsure ? ' [unsure]' : ''}`);
    L.push(`    parsed song=${JSON.stringify(r.parsed.songish)} artists=${JSON.stringify(r.parsed.artists.slice(0, 3))}  queries=${JSON.stringify(r.queries)}`);
    for (const w of why) L.push(`    ${w}`);
  }
}
console.log(L.join('\n'));

if (flag('--save-baseline') && !opt('--file')) {
  writeFileSync(dir + 'baseline.json', JSON.stringify({ savedAt: new Date().toISOString().slice(0, 10), metrics, failingIds: failures.map(f => f.r.it.id) }, null, 1));
  console.log('\nSaved tests/baseline.json');
}
process.exitCode = decoyHigh.length || crossHigh.length || capViolations.length || noSongHigh.length || metrics.highWrong ? 1 : 0;
