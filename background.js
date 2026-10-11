'use strict';

const API = 'https://returnyoutubedislikeapi.com/votes?videoId=';
const ID_RE = /^[\w-]{11}$/;
const TTL = 5 * 60 * 1000;
const MAX_ENTRIES = 50;

// In-memory only. Cleared whenever the browser unloads the background page.
const cache = new Map();

async function request(id) {
  const res = await fetch(API + id, {
    credentials: 'omit',
    referrerPolicy: 'no-referrer',
    cache: 'no-store',
    signal: AbortSignal.timeout(8000)
  });
  if (!res.ok) throw new Error(res.status);
  const { dislikes } = await res.json();
  if (!Number.isFinite(dislikes) || dislikes < 0) throw new Error('bad data');
  return dislikes;
}

function getDislikes(id) {
  const hit = cache.get(id);
  if (hit && Date.now() - hit.time < TTL) return hit.promise;

  const promise = request(id).catch(() => {
    cache.delete(id);
    return null;
  });
  cache.delete(id);
  cache.set(id, { promise, time: Date.now() });
  if (cache.size > MAX_ENTRIES) cache.delete(cache.keys().next().value);
  return promise;
}

browser.runtime.onMessage.addListener((msg) => {
  const id = msg && msg.id;
  if (typeof id === 'string' && ID_RE.test(id)) return getDislikes(id);
});
