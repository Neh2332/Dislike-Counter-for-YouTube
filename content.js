'use strict';

const ID_RE = /^[\w-]{11}$/;
const MARK = 'data-dc'; // YouTube label we changed; value is its original text
const OWN = 'data-dc-own'; // element we added

const DISLIKE_BTN = {
  watch: [
    'ytd-watch-metadata dislike-button-view-model button',
    'ytm-slim-video-action-bar-renderer dislike-button-view-model button'
  ].join(','),
  shorts: [
    'ytd-reel-video-renderer[is-active] dislike-button-view-model button',
    'ytd-reel-video-renderer[is-active] #dislike-button button',
    'ytm-reel-player-overlay-renderer dislike-button-view-model button'
  ].join(',')
};
const DISLIKE_HOST = 'dislike-button-view-model, #dislike-button';
const LABEL = '.yt-spec-button-shape-with-label__label span, .ytSpecButtonShapeWithLabelLabel span';
const SHORTS_LIKE = 'reel-action-bar-view-model like-button-view-model, ytd-reel-video-renderer like-button-view-model';
const MOBILE_LIKE_COUNT = '.slim-video-information-like-count';

// YouTube ships both class naming schemes depending on rollout.
const ICON_ONLY = ['yt-spec-button-shape-next--icon-button', 'ytSpecButtonShapeNextIconButton'];
const ICON_TEXT = ['yt-spec-button-shape-next--icon-leading', 'ytSpecButtonShapeNextIconLeading'];
const TEXT_CLASS = 'yt-spec-button-shape-next__button-text-content ytSpecButtonShapeNextButtonTextContent';

// Thumbs-down icon, Material Design (Apache 2.0).
const ICON_PATH = 'M15 3H6c-.83 0-1.54.5-1.84 1.22l-3.02 7.05c-.09.23-.14.47-.14.73v2c0 1.1.9 2 2 2h6.31l-.95 4.57-.03.32c0 .41.17.79.44 1.06L9.83 23l6.59-6.59c.36-.36.58-.86.58-1.41V5c0-1.1-.9-2-2-2zm0 12l-4.34 4.34L12 14H3v-2l3-7h9v10zm4-12h4v12h-4z';
const SVG_NS = 'http://www.w3.org/2000/svg';

const FMT_OPTS = { notation: 'compact', maximumFractionDigits: 1 };
let fmt;
try {
  fmt = new Intl.NumberFormat(document.documentElement.lang || undefined, FMT_OPTS);
} catch {
  fmt = new Intl.NumberFormat(undefined, FMT_OPTS);
}

let currentId = null; // video the count belongs to
let text = null; // formatted count for currentId, null until loaded
let lastUrl = null;
let watchedBtn = null;
let scheduled = false;

function swapClasses(el, from, to) {
  from.forEach((cls, i) => el.classList.replace(cls, to[i]));
}

function getVideoId() {
  const url = new URL(location.href);
  const id = url.pathname.startsWith('/shorts/')
    ? url.pathname.split('/')[2]
    : url.searchParams.get('v');
  return id && ID_RE.test(id) ? id : null;
}

function make(tag, cls, parent) {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (parent) parent.append(el);
  return el;
}

function icon(size) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', size);
  svg.setAttribute('height', size);
  svg.setAttribute('fill', 'currentColor');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('d', ICON_PATH);
  svg.append(path);
  return svg;
}

function setCount(el, span) {
  if (span.textContent === text) return;
  span.textContent = text;
  el.setAttribute('aria-label', `${text} dislikes`);
}

// Desktop watch page: put the count inside YouTube's own dislike button.
function renderButton(btn) {
  // Older Shorts layouts: a label already sits under the button, reuse it.
  const label = btn.closest(DISLIKE_HOST)?.querySelector(LABEL);
  if (label) {
    if (!label.hasAttribute(MARK)) label.setAttribute(MARK, label.textContent);
    if (label.textContent !== text) label.textContent = text;
    return;
  }

  // No-op when already swapped, so this never retriggers an observer.
  swapClasses(btn, ICON_ONLY, ICON_TEXT);
  let el = btn.querySelector(`[${OWN}]`);
  if (!el) {
    el = make('div', TEXT_CLASS, btn);
    el.setAttribute(OWN, '');
  }
  if (el.textContent !== text) el.textContent = text;
}

// Mobile watch page: like/dislike are icon-only and the like count sits in
// the info line ("27K likes · 338K views"), so add ours right after it.
function renderInfoLine(likeCount) {
  let el = likeCount.nextElementSibling;
  if (!el || !el.hasAttribute(OWN)) {
    el = make('span', 'slim-video-subtitle-substring');
    el.setAttribute(OWN, '');
    el.setAttribute('role', 'text');
    const inner = make('span', likeCount.firstElementChild?.className || '', el);
    const svg = icon('1em');
    svg.style.cssText = 'vertical-align:-0.125em;margin-inline-end:0.25em';
    inner.append(svg, make('span'));
    likeCount.after(el);
  }
  setCount(el, el.querySelector('svg + span'));
}

// Shorts have no dislike button, so build a read-only one that copies the
// like button's classes. That keeps it matching on desktop and mobile alike.
function buildShortsCounter(like) {
  const cls = (sel) => like.querySelector(sel)?.getAttribute('class') || '';
  const host = make('div', [...like.classList].filter((c) => !/like/i.test(c)).join(' '));
  host.setAttribute(OWN, '');
  const label = make('label', cls('label'), host);
  const btn = make('button', cls('button'), label);
  btn.type = 'button';
  btn.tabIndex = -1;
  btn.style.cursor = 'default';
  make('div', cls('button > div'), btn).append(icon('24'));
  const caption = make('div', cls('label > div:last-child') || 'ytSpecButtonShapeWithLabelLabel', label);
  make('span', cls('label > div:last-child span'), caption);
  return host;
}

// The like button of the Short currently on screen.
function visibleShortsLike() {
  for (const like of document.querySelectorAll(SHORTS_LIKE)) {
    const r = like.getBoundingClientRect();
    if (r.height && r.bottom > 0 && r.top < innerHeight) return like;
  }
  return null;
}

function renderShorts(like) {
  let el = like.nextElementSibling;
  if (!el || !el.hasAttribute(OWN)) {
    el = buildShortsCounter(like);
    like.after(el);
  }
  setCount(el.querySelector('button'), el.querySelector('label > div:last-child span'));
}

// Catches YouTube resetting the button's classes, which would hide the count.
const btnObserver = new MutationObserver(() => ensure());

function ensure() {
  if (text === null) return;
  const shorts = location.pathname.startsWith('/shorts/');

  if (!shorts) {
    const likeCount = document.querySelector(MOBILE_LIKE_COUNT);
    if (likeCount) return renderInfoLine(likeCount);
  }

  const btn = document.querySelector(shorts ? DISLIKE_BTN.shorts : DISLIKE_BTN.watch);
  if (!btn) {
    const like = shorts && visibleShortsLike();
    if (like) renderShorts(like);
    return;
  }
  renderButton(btn);
  if (btn !== watchedBtn) {
    btnObserver.disconnect();
    btnObserver.observe(btn, { attributes: true, attributeFilter: ['class'] });
    watchedBtn = btn;
  }
}

function clear() {
  btnObserver.disconnect();
  watchedBtn = null;
  for (const el of document.querySelectorAll(`[${OWN}]`)) {
    if (el.parentElement) swapClasses(el.parentElement, ICON_TEXT, ICON_ONLY);
    el.remove();
  }
  for (const el of document.querySelectorAll(`[${MARK}]`)) {
    el.textContent = el.getAttribute(MARK);
    el.removeAttribute(MARK);
  }
}

async function load(id) {
  let dislikes = null;
  try {
    dislikes = await browser.runtime.sendMessage({ id });
  } catch {}
  if (id !== currentId || typeof dislikes !== 'number') return;
  text = fmt.format(dislikes);
  ensure();
}

function checkUrl() {
  if (location.href === lastUrl) return;
  lastUrl = location.href;
  const id = getVideoId();
  if (id === currentId) return;
  currentId = id;
  text = null;
  clear();
  if (id) load(id);
}

function tick() {
  scheduled = false;
  checkUrl();
  ensure();
}

// Batch YouTube's many DOM changes into one check. A timer, not
// requestAnimationFrame, because frames pause while the page isn't painting.
function schedule() {
  if (scheduled) return;
  scheduled = true;
  setTimeout(tick, 50);
}

new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true });
for (const evt of ['yt-navigate-finish', 'yt-page-data-updated', 'state-navigateend']) {
  document.addEventListener(evt, schedule);
}
window.addEventListener('popstate', schedule);
tick();
