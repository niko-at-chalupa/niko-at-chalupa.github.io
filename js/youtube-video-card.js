/**
 * youtube-video-card.js
 * ------------------------------------------------------------------
 * Slim, animated YouTube video cards — same design system as
 * github-repo-card.js. Self-contained ES module: pulls GSAP from a
 * CDN, injects its own styles, and renders from a YouTube URL or
 * video ID. Click the thumbnail to play the video inline.
 *
 * Zero-config mode uses YouTube's public oEmbed endpoint (no API key,
 * no auth) for title/channel + YouTube's static thumbnail images.
 * That's already a full, "fancy link" style card.
 *
 * Pass an optional YouTube Data API v3 key to unlock the richer
 * version: real description, view/like counts, duration badge,
 * published date, and the channel's actual avatar.
 *
 * Usage
 * -----
 *   import { renderVideoCard, initVideoCards } from './youtube-video-card.js';
 *
 *   renderVideoCard('#slot', 'https://youtu.be/dQw4w9WgXcQ');
 *   renderVideoCard('#slot2', 'dQw4w9WgXcQ', { apiKey: 'AIza...' });
 *
 *   // Or drop placeholders and auto-scan:
 *   //   <div data-ytc="dQw4w9WgXcQ"></div>
 *   //   <div data-ytc="https://youtu.be/..." data-ytc-theme="light"></div>
 *   initVideoCards();
 *
 * Options (second arg to renderVideoCard, or data-ytc-* attributes)
 * -----
 *   theme      'dark' (default) | 'light'
 *   apiKey     optional YouTube Data API v3 key for stats/description
 *   autoplay   whether click-to-play starts playback immediately
 *              (default true — it's already a deliberate click)
 * ------------------------------------------------------------------
 */

import { gsap } from "https://cdn.jsdelivr.net/npm/gsap@3.12.5/+esm";

const OEMBED = "https://www.youtube.com/oembed";
const DATA_API = "https://www.googleapis.com/youtube/v3";
const CACHE = new Map();
const STYLE_ID = "ytc-styles";

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

/** Pull an 11-char video ID out of any common YouTube URL shape, or pass an ID straight through. */
function extractVideoId(input) {
  const trimmed = input.trim();
  if (/^[\w-]{11}$/.test(trimmed)) return trimmed;
  const patterns = [
    /(?:youtu\.be\/)([\w-]{11})/,
    /(?:youtube\.com\/watch\?v=)([\w-]{11})/,
    /(?:youtube\.com\/embed\/)([\w-]{11})/,
    /(?:youtube\.com\/shorts\/)([\w-]{11})/,
  ];
  for (const re of patterns) {
    const m = trimmed.match(re);
    if (m) return m[1];
  }
  throw new Error(`ytc: couldn't parse a video ID from "${input}"`);
}

function formatCount(n) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "m";
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, "") + "k";
  return String(n);
}

function timeAgo(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / 86_400_000);
  if (days < 1) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

/** "PT1H2M3S" -> "1:02:03", "PT12M34S" -> "12:34". */
function formatDuration(iso) {
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return null;
  const h = Number(m[1] || 0), min = Number(m[2] || 0), s = Number(m[3] || 0);
  const pad = (n) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(min)}:${pad(s)}` : `${min}:${pad(s)}`;
}

async function fetchJSON(url) {
  if (CACHE.has(url)) return CACHE.get(url);
  const res = await fetch(url);
  if (!res.ok) {
    const err = new Error(`ytc: request failed (${res.status}) for ${url}`);
    err.status = res.status;
    throw err;
  }
  const data = await res.json();
  CACHE.set(url, data);
  return data;
}

/** Resolve to whichever static thumbnail actually exists — maxres isn't generated for every video. */
function resolveThumbnail(img, videoId) {
  img.src = `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`;
  img.addEventListener(
    "error",
    () => { img.src = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`; },
    { once: true }
  );
}

function escapeHTML(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

/* ------------------------------------------------------------------ */
/* Fonts — edit these to swap typefaces. `heading` is used for the     */
/* video title, `body` for everything else in the card.                */
/* ------------------------------------------------------------------ */
const FONTS = {
  heading: "'Space Grotesk', ui-sans-serif, system-ui, sans-serif",
  body: "'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, monospace",
};

/* ------------------------------------------------------------------ */
/* Styles — injected once, scoped under .ytc-card                     */
/* Same tokens as github-repo-card.js so the two drop in side by side */
/* ------------------------------------------------------------------ */
function injectStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
  .ytc-card {
    --ytc-bg: #2a1f2e;
    --ytc-bg-hover: #332639;
    --ytc-border: #423349;
    --ytc-text: #ede7f0;
    --ytc-text-dim: #a898b0;
    --ytc-accent: #ddb9f8;
    --ytc-secondary: #c084f5;
    --ytc-avatar-bg: #1c2027;
    --ytc-on-accent: #211526;
    --ytc-radius: 12px;
    position: relative;
    width: 100%;
    max-width: 380px;
    box-sizing: border-box;
    background: var(--ytc-bg);
    border: 1px solid var(--ytc-border);
    border-radius: var(--ytc-radius);
    font-family: ${FONTS.body};
    color: var(--ytc-text);
    display: block;
    opacity: 0;
    transform: translateY(14px);
    overflow: hidden;
    transition: border-color .2s ease, background .2s ease;
  }
  .ytc-card:hover { background: var(--ytc-bg-hover); border-color: var(--ytc-secondary); }
  .ytc-card.ytc-light {
    --ytc-bg: #ffffff;
    --ytc-bg-hover: #f6f7f9;
    --ytc-border: #e3e6ea;
    --ytc-text: #1b1f24;
    --ytc-text-dim: #656d76;
    --ytc-accent: #8a4fc7;
    --ytc-secondary: #6b3fa0;
    --ytc-avatar-bg: #eef0f3;
    --ytc-on-accent: #ffffff;
  }

  .ytc-thumb-wrap {
    position: relative; width: 100%; aspect-ratio: 16 / 9;
    background: #000; overflow: hidden; cursor: pointer; display: block;
    border: none; padding: 0;
  }
  .ytc-thumb {
    width: 100%; height: 100%; object-fit: cover; display: block;
    transition: transform .3s ease;
  }
  .ytc-card:hover .ytc-thumb { transform: scale(1.03); }
  .ytc-thumb-wrap iframe { width: 100%; height: 100%; border: 0; display: block; }

  .ytc-play {
    position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
    background: linear-gradient(180deg, rgba(0,0,0,0) 55%, rgba(0,0,0,0.55) 100%);
  }
  .ytc-play-btn {
    width: 46px; height: 46px; border-radius: 50%;
    background: var(--ytc-accent); color: var(--ytc-on-accent);
    display: flex; align-items: center; justify-content: center;
    box-shadow: 0 2px 10px rgba(0,0,0,0.35);
    transition: transform .2s ease, background .2s ease;
  }
  .ytc-thumb-wrap:hover .ytc-play-btn { transform: scale(1.08); background: var(--ytc-secondary); }
  .ytc-play-btn svg { width: 16px; height: 16px; margin-left: 2px; }

  .ytc-duration {
    position: absolute; right: 8px; bottom: 8px;
    background: rgba(0,0,0,0.75); color: #fff;
    font-size: 10.5px; padding: 2px 6px; border-radius: 4px; letter-spacing: .01em;
  }

  .ytc-body { padding: 14px 16px 16px; }

  .ytc-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 10px; }
  .ytc-titleblock { min-width: 0; }
  .ytc-channel {
    font-size: 11px; color: var(--ytc-text-dim); letter-spacing: .02em;
    margin: 0 0 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .ytc-title {
    font-family: ${FONTS.heading};
    font-size: 15.5px; font-weight: 600; margin: 0; line-height: 1.3;
    color: var(--ytc-text);
    display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
  }

  .ytc-avatar-wrap { position: relative; flex: 0 0 auto; width: 36px; height: 36px; }
  .ytc-avatar {
    width: 36px; height: 36px; border-radius: 50%; object-fit: cover; display: block;
    border: 1px solid var(--ytc-border); background: var(--ytc-avatar-bg);
  }
  .ytc-avatar-fallback {
    width: 36px; height: 36px; border-radius: 50%;
    background: var(--ytc-border); color: var(--ytc-secondary);
    display: flex; align-items: center; justify-content: center;
  }
  .ytc-avatar-fallback svg { width: 15px; height: 15px; }

  .ytc-desc {
    margin: 10px 0 0; font-size: 12.5px; line-height: 1.5;
    color: var(--ytc-text-dim);
    display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
  }

  .ytc-stats {
    display: flex; align-items: center; gap: 14px;
    margin-top: 12px; font-size: 11px; color: var(--ytc-text-dim);
  }
  .ytc-stat { display: inline-flex; align-items: center; gap: 4px; }
  .ytc-stat svg { width: 12px; height: 12px; opacity: .8; }
  .ytc-stat.ytc-views { color: var(--ytc-accent); }
  .ytc-stat.ytc-views svg { opacity: 1; }
  .ytc-stat.ytc-likes { color: var(--ytc-secondary); }
  .ytc-stat.ytc-likes svg { opacity: 1; }
  .ytc-updated { margin-left: auto; }
  .ytc-watch-link {
    display: inline-flex; align-items: center; gap: 5px;
    font-size: 11px; color: var(--ytc-text-dim); text-decoration: none;
    margin-top: 12px;
  }
  .ytc-watch-link svg { width: 11px; height: 11px; }
  .ytc-watch-link:hover { color: var(--ytc-secondary); }

  .ytc-skeleton { opacity: 1 !important; transform: none !important; position: relative; }
  .ytc-skel-thumb { width: 100%; aspect-ratio: 16 / 9; background: var(--ytc-border); }
  .ytc-skel-body { min-height: 96px; }
  .ytc-loading-wrap {
    position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
  }
  .ytc-loading {
    color: var(--ytc-text-dim); font-size: 12px; letter-spacing: .02em;
  }

  .ytc-error {
    padding: 14px 16px; font-size: 12px; color: var(--ytc-text-dim);
    opacity: 1 !important; transform: none !important;
  }
  `;
  document.head.appendChild(style);
}

/* ------------------------------------------------------------------ */
/* Icons — generic glyphs, not platform brand marks                    */
/* ------------------------------------------------------------------ */
const ICON_PLAY = `<svg viewBox="0 0 16 16" fill="currentColor"><path d="M4 2.5v11l10-5.5z"/></svg>`;
const ICON_EYE = `<svg viewBox="0 0 16 16" fill="currentColor"><path d="M8 3.5C4.5 3.5 1.7 6 .7 8c1 2 3.8 4.5 7.3 4.5S14.5 10 15.5 8C14.5 6 11.7 3.5 8 3.5zm0 7.2A2.7 2.7 0 1 1 8 5.3a2.7 2.7 0 0 1 0 5.4z"/></svg>`;
const ICON_HEART = `<svg viewBox="0 0 16 16" fill="currentColor"><path d="M8 13.8s-5.8-3.4-5.8-7.4A3.2 3.2 0 0 1 8 4.6a3.2 3.2 0 0 1 5.8 1.8c0 4-5.8 7.4-5.8 7.4z"/></svg>`;
const ICON_EXTERNAL = `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M6 3H3v10h10v-3M9 3h4v4M13 3L7 9"/></svg>`;
const ICON_CHANNEL = `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><rect x="2" y="4" width="12" height="8" rx="1.5"/><path d="M6.5 6.3v3.4l3-1.7z" fill="currentColor" stroke="none"/></svg>`;

/* ------------------------------------------------------------------ */
/* Skeleton (loading) markup                                           */
/* ------------------------------------------------------------------ */
function skeletonMarkup() {
  return `
    <div class="ytc-skel-thumb"></div>
    <div class="ytc-skel-body"></div>
    <div class="ytc-loading-wrap"><span class="ytc-loading">loading...</span></div>
  `;
}

/* ------------------------------------------------------------------ */
/* Data fetching                                                       */
/* ------------------------------------------------------------------ */
async function fetchVideoData(videoId, apiKey) {
  const oembedUrl = `${OEMBED}?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${videoId}`)}&format=json`;
  const base = await fetchJSON(oembedUrl);

  const data = {
    videoId,
    title: base.title,
    channelTitle: base.author_name,
    channelUrl: base.author_url,
    description: null,
    viewCount: null,
    likeCount: null,
    duration: null,
    publishedAt: null,
    channelAvatar: null,
  };

  if (!apiKey) return data;

  try {
    const videoInfo = await fetchJSON(
      `${DATA_API}/videos?part=snippet,statistics,contentDetails&id=${videoId}&key=${apiKey}`
    );
    const item = videoInfo.items && videoInfo.items[0];
    if (item) {
      data.description = item.snippet.description || null;
      data.viewCount = item.statistics.viewCount ? Number(item.statistics.viewCount) : null;
      data.likeCount = item.statistics.likeCount ? Number(item.statistics.likeCount) : null;
      data.duration = formatDuration(item.contentDetails.duration);
      data.publishedAt = item.snippet.publishedAt;

      const channelId = item.snippet.channelId;
      if (channelId) {
        const channelInfo = await fetchJSON(
          `${DATA_API}/channels?part=snippet&id=${channelId}&key=${apiKey}`
        );
        const channel = channelInfo.items && channelInfo.items[0];
        if (channel) data.channelAvatar = channel.snippet.thumbnails.default.url;
      }
    }
  } catch {
    // Data API call failed (bad key, quota, etc). Fall back to oEmbed-only data silently.
  }

  return data;
}

/* ------------------------------------------------------------------ */
/* Card builder                                                        */
/* ------------------------------------------------------------------ */
function buildCard(data, opts) {
  const card = document.createElement("div");
  card.className = `ytc-card${opts.theme === "light" ? " ytc-light" : ""}`;

  const avatarMarkup = data.channelAvatar
    ? `<img class="ytc-avatar" src="${data.channelAvatar}" alt="${escapeHTML(data.channelTitle)}" loading="lazy" />`
    : `<span class="ytc-avatar-fallback">${ICON_CHANNEL}</span>`;

  const statsRow = (data.viewCount !== null || data.publishedAt)
    ? `
      <div class="ytc-stats">
        ${data.viewCount !== null ? `<span class="ytc-stat ytc-views">${ICON_EYE}${formatCount(data.viewCount)}</span>` : ""}
        ${data.likeCount !== null ? `<span class="ytc-stat ytc-likes">${ICON_HEART}${formatCount(data.likeCount)}</span>` : ""}
        ${data.publishedAt ? `<span class="ytc-updated">${timeAgo(data.publishedAt)}</span>` : ""}
      </div>`
    : `
      <a class="ytc-watch-link" href="https://www.youtube.com/watch?v=${data.videoId}" target="_blank" rel="noopener noreferrer">
        ${ICON_EXTERNAL} watch on youtube
      </a>`;

  const descRow = data.description
    ? `<p class="ytc-desc">${escapeHTML(data.description)}</p>`
    : "";

  card.innerHTML = `
    <button class="ytc-thumb-wrap" type="button" aria-label="Play ${escapeHTML(data.title)}">
      <img class="ytc-thumb" alt="${escapeHTML(data.title)} thumbnail" loading="lazy" />
      <span class="ytc-play"><span class="ytc-play-btn">${ICON_PLAY}</span></span>
      ${data.duration ? `<span class="ytc-duration">${data.duration}</span>` : ""}
    </button>
    <div class="ytc-body">
      <div class="ytc-head">
        <div class="ytc-titleblock">
          <p class="ytc-channel">${escapeHTML(data.channelTitle)}</p>
          <p class="ytc-title">${escapeHTML(data.title)}</p>
        </div>
        <div class="ytc-avatar-wrap">${avatarMarkup}</div>
      </div>
      ${descRow}
      ${statsRow}
    </div>
  `;

  const thumbImg = card.querySelector(".ytc-thumb");
  resolveThumbnail(thumbImg, data.videoId);

  const thumbWrap = card.querySelector(".ytc-thumb-wrap");
  thumbWrap.addEventListener("click", () => {
    const autoplay = opts.autoplay !== false ? 1 : 0;
    thumbWrap.innerHTML = `<iframe
      src="https://www.youtube-nocookie.com/embed/${data.videoId}?autoplay=${autoplay}&rel=0"
      title="${escapeHTML(data.title)}"
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
      allowfullscreen></iframe>`;
  }, { once: true });

  return card;
}

/* ------------------------------------------------------------------ */
/* Animation                                                           */
/* ------------------------------------------------------------------ */
function animateIn(card) {
  gsap.to(card, { opacity: 1, y: 0, duration: 0.55, ease: "power3.out" });

  const thumb = card.querySelector(".ytc-thumb");
  gsap.from(thumb, { opacity: 0, duration: 0.5, ease: "power2.out", delay: 0.05 });

  const bits = card.querySelectorAll(".ytc-channel, .ytc-title, .ytc-avatar-wrap, .ytc-desc, .ytc-stats, .ytc-watch-link");
  gsap.from(bits, { opacity: 0, y: 4, duration: 0.4, stagger: 0.04, delay: 0.15 });

  const hoverIn = () => gsap.to(card, { y: -3, duration: 0.25, ease: "power2.out" });
  const hoverOut = () => gsap.to(card, { y: 0, duration: 0.3, ease: "power2.out" });
  card.addEventListener("mouseenter", hoverIn);
  card.addEventListener("mouseleave", hoverOut);
}

/* ------------------------------------------------------------------ */
/* Public API                                                          */
/* ------------------------------------------------------------------ */

/**
 * Render a single video card into a container.
 * @param {string|HTMLElement} target - CSS selector or element to render into.
 * @param {string} videoUrlOrId - full YouTube URL or bare 11-char video ID.
 * @param {object} [opts]
 */
export async function renderVideoCard(target, videoUrlOrId, opts = {}) {
  injectStyles();
  const options = { theme: "dark", apiKey: null, autoplay: true, ...opts };
  const container = typeof target === "string" ? document.querySelector(target) : target;
  if (!container) throw new Error(`ytc: target "${target}" not found`);

  const skeleton = document.createElement("div");
  skeleton.className = `ytc-card ytc-skeleton${options.theme === "light" ? " ytc-light" : ""}`;
  skeleton.innerHTML = skeletonMarkup();
  container.innerHTML = "";
  container.appendChild(skeleton);

  try {
    const videoId = extractVideoId(videoUrlOrId);
    const data = await fetchVideoData(videoId, options.apiKey);
    const card = buildCard(data, options);
    container.innerHTML = "";
    container.appendChild(card);
    animateIn(card);
    return card;
  } catch (err) {
    const message = err.status === 404 ? "Video not found" : "Couldn't load video";
    container.innerHTML = `<div class="ytc-card ytc-error${options.theme === "light" ? " ytc-light" : ""}">${message}</div>`;
    throw err;
  }
}

/**
 * Scan the document for `[data-ytc]` placeholders and render each one.
 * `data-ytc="videoIdOrUrl"`, optional `data-ytc-theme`, `data-ytc-api-key`.
 */
export function initVideoCards(root = document) {
  const nodes = root.querySelectorAll("[data-ytc]");
  nodes.forEach((el) => {
    const videoRef = el.getAttribute("data-ytc");
    const theme = el.getAttribute("data-ytc-theme") || "dark";
    const apiKey = el.getAttribute("data-ytc-api-key") || null;
    renderVideoCard(el, videoRef, { theme, apiKey }).catch(() => {});
  });
}

export default { renderVideoCard, initVideoCards };