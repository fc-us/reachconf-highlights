#!/usr/bin/env node
// Fetches all oEmbed data for Twitter + TikTok and writes embed-cache.json
// Run: node prebuild.js

const fs = require('fs');

// Read URLs directly from index.html to stay in sync
function extractUrls(html, varName) {
  const regex = new RegExp('const ' + varName + ' = \\[([\\s\\S]*?)\\];');
  const match = html.match(regex);
  if (!match) return [];
  return [...match[1].matchAll(/'(https:\/\/[^']+)'/g)].map(m => m[1]);
}

const html = fs.readFileSync('index.html', 'utf8');
const OFFICIAL_TWITTER_URLS = extractUrls(html, 'OFFICIAL_TWITTER_URLS');
const TWITTER_URLS = extractUrls(html, 'TWITTER_URLS');
const TIKTOK_URLS = extractUrls(html, 'TIKTOK_URLS');

async function fetchTwitterEmbed(url) {
  const res = await fetch('https://publish.twitter.com/oembed?url=' + encodeURIComponent(url) + '&omit_script=true&theme=dark');
  if (!res.ok) throw new Error('Twitter oEmbed ' + res.status);
  const data = await res.json();
  return { platform: 'twitter', title: '', channel: data.author_name || 'Unknown', html: data.html, url };
}

async function fetchTikTokEmbed(url) {
  const res = await fetch('https://www.tiktok.com/oembed?url=' + encodeURIComponent(url));
  if (!res.ok) throw new Error('TikTok oEmbed ' + res.status);
  const data = await res.json();
  return { platform: 'tiktok', title: data.title || 'TikTok Video', channel: data.author_name || 'Unknown', thumbnail: data.thumbnail_url, html: data.html, url };
}

async function fetchBatched(urls, fetcher, batchSize, delayMs) {
  const results = {};
  let ok = 0, fail = 0;
  for (let i = 0; i < urls.length; i += batchSize) {
    const batch = urls.slice(i, i + batchSize);
    const settled = await Promise.allSettled(batch.map(fetcher));
    settled.forEach((r, idx) => {
      if (r.status === 'fulfilled') { results[batch[idx]] = r.value; ok++; }
      else { console.warn('  Failed:', batch[idx], r.reason?.message); fail++; }
    });
    if (i + batchSize < urls.length) await new Promise(r => setTimeout(r, delayMs));
    process.stdout.write('  ' + (ok + fail) + '/' + urls.length + ' (' + fail + ' failed)\r');
  }
  console.log();
  return results;
}

async function main() {
  const allTwitter = [...new Set([...OFFICIAL_TWITTER_URLS, ...TWITTER_URLS])];
  console.log('Fetching ' + allTwitter.length + ' Twitter embeds...');
  const twitter = await fetchBatched(allTwitter, fetchTwitterEmbed, 10, 300);

  console.log('Fetching ' + TIKTOK_URLS.length + ' TikTok embeds...');
  const tiktok = await fetchBatched(TIKTOK_URLS, fetchTikTokEmbed, 5, 200);

  const cache = { twitter, tiktok, generated: new Date().toISOString() };
  fs.writeFileSync('embed-cache.json', JSON.stringify(cache));

  console.log('Done. Cached ' + Object.keys(twitter).length + ' tweets + ' + Object.keys(tiktok).length + ' TikToks');
}

main().catch(err => { console.error(err); process.exit(1); });
