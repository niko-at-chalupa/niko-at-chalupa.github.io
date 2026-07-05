/**
 * github-repo-card.js
 * ------------------------------------------------------------------
 * Slim, animated GitHub repository cards. Self-contained ES module —
 * pulls GSAP from a CDN, injects its own styles, and renders straight
 * from the GitHub REST API.
 *
 * Usage
 * -----
 *   import { renderRepoCard, initRepoCards } from './github-repo-card.js';
 *
 *   // Render one card into a container:
 *   renderRepoCard('#card-slot', 'anthropics/courses');
 *
 *   // Or drop placeholders in your HTML and auto-scan the page:
 *   //   <div data-ghrc="facebook/react"></div>
 *   //   <div data-ghrc="vuejs/core" data-ghrc-theme="light"></div>
 *   initRepoCards();
 *
 * Options (second arg to renderRepoCard, or data-ghrc-* attributes)
 * -----
 *   theme        'dark' (default) | 'light'
 *   maxLangs     number of languages to show before collapsing into
 *                "Other" (default 5)
 *   token        optional GitHub token to raise the API rate limit
 * ------------------------------------------------------------------
 */

import { gsap } from "https://cdn.jsdelivr.net/npm/gsap@3.12.5/+esm";

const API = "https://api.github.com/repos";
const CACHE = new Map();
const STYLE_ID = "ghrc-styles";

/* ------------------------------------------------------------------ */
/* Language color chips — mirrors GitHub's linguist palette for the   */
/* languages people actually see most often. Anything unlisted falls  */
/* back to a neutral graphite dot so the bar still reads cleanly.     */
/* ------------------------------------------------------------------ */
const LANG_COLORS = {
  JavaScript: "#f1e05a", TypeScript: "#3178c6", Python: "#3572A5",
  Java: "#b07219", Go: "#00ADD8", Rust: "#dea584", "C++": "#f34b7d",
  C: "#555555", "C#": "#178600", Ruby: "#701516", PHP: "#4F5D95",
  Swift: "#F05138", Kotlin: "#A97BFF", HTML: "#e34c26", CSS: "#563d7c",
  Shell: "#89e051", Vue: "#41b883", Dart: "#00B4AB", Scala: "#c22d40",
  "Jupyter Notebook": "#DA5B0B", Elixir: "#6e4a7e", Haskell: "#5e5086",
  Lua: "#000080", Perl: "#0298c3", R: "#198CE7", Zig: "#ec915c",
  "Objective-C": "#438eff", Dockerfile: "#384d54", Makefile: "#427819",
  Other: "#6e7681",
};

const langColor = (name) => LANG_COLORS[name] || LANG_COLORS.Other;

/* ------------------------------------------------------------------ */
/* Fonts — edit these to swap typefaces. `heading` is used for the     */
/* repo title, `body` for everything else in the card.                 */
/* ------------------------------------------------------------------ */
const FONTS = {
  heading: "'Space Grotesk', ui-sans-serif, system-ui, sans-serif",
  body: "'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, monospace",
};

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */
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

async function fetchJSON(url, token) {
  if (CACHE.has(url)) return CACHE.get(url);
  const res = await fetch(url, {
    headers: token ? { Authorization: `token ${token}` } : {},
  });
  if (!res.ok) {
    const err = new Error(`GitHub API ${res.status} for ${url}`);
    err.status = res.status;
    throw err;
  }
  const data = await res.json();
  CACHE.set(url, data);
  return data;
}

/** Reduce a { lang: bytes } map to a sorted, capped list with percentages. */
function computeLanguages(bytesByLang, maxLangs) {
  const total = Object.values(bytesByLang).reduce((a, b) => a + b, 0);
  if (!total) return [];
  const sorted = Object.entries(bytesByLang).sort((a, b) => b[1] - a[1]);
  const head = sorted.slice(0, maxLangs);
  const tail = sorted.slice(maxLangs);
  const list = head.map(([name, bytes]) => ({ name, pct: (bytes / total) * 100 }));
  if (tail.length) {
    const otherPct = tail.reduce((sum, [, bytes]) => sum + bytes, 0) / total * 100;
    list.push({ name: "Other", pct: otherPct });
  }
  return list;
}

/* ------------------------------------------------------------------ */
/* Styles — injected once, scoped under .ghrc-card                    */
/* ------------------------------------------------------------------ */
function injectStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
  .ghrc-card {
    --ghrc-bg: #2a1f2e;
    --ghrc-bg-hover: #332639;
    --ghrc-border: #423349;
    --ghrc-text: #ede7f0;
    --ghrc-text-dim: #a898b0;
    --ghrc-accent: #ddb9f8;
    --ghrc-secondary: #c084f5;
    --ghrc-avatar-bg: #1c2027;
    --ghrc-radius: 12px;
    position: relative;
    width: 100%;
    max-width: 380px;
    box-sizing: border-box;
    background: var(--ghrc-bg);
    border: 1px solid var(--ghrc-border);
    border-radius: var(--ghrc-radius);
    padding: 16px 18px;
    font-family: ${FONTS.body};
    color: var(--ghrc-text);
    text-decoration: none;
    display: block;
    opacity: 0;
    transform: translateY(14px);
    overflow: hidden;
    transition: border-color .2s ease, background .2s ease;
  }
  .ghrc-card:hover { background: var(--ghrc-bg-hover); border-color: var(--ghrc-secondary); }
  .ghrc-card.ghrc-light {
    --ghrc-bg: #ffffff;
    --ghrc-bg-hover: #f6f7f9;
    --ghrc-border: #e3e6ea;
    --ghrc-text: #1b1f24;
    --ghrc-text-dim: #656d76;
    --ghrc-accent: #8a4fc7;
    --ghrc-secondary: #6b3fa0;
    --ghrc-avatar-bg: #eef0f3;
  }

  .ghrc-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 10px; }
  .ghrc-titleblock { min-width: 0; }
  .ghrc-owner {
    font-size: 11px; color: var(--ghrc-text-dim); letter-spacing: .02em;
    margin: 0 0 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .ghrc-title {
    font-family: ${FONTS.heading};
    font-size: 17px; font-weight: 600; margin: 0; line-height: 1.25;
    color: var(--ghrc-text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }

  .ghrc-avatar-wrap { position: relative; flex: 0 0 auto; width: 40px; height: 40px; }
  .ghrc-avatar {
    width: 40px; height: 40px; border-radius: 50%;
    object-fit: cover; display: block;
    border: 1px solid var(--ghrc-border);
    background: var(--ghrc-avatar-bg);
  }
  .ghrc-badge {
    position: absolute; right: -3px; bottom: -3px;
    width: 17px; height: 17px; border-radius: 50%;
    background: var(--ghrc-bg); border: 1px solid var(--ghrc-border);
    display: flex; align-items: center; justify-content: center;
    color: var(--ghrc-secondary);
  }
  .ghrc-badge svg { width: 9px; height: 9px; }

  .ghrc-desc {
    margin: 10px 0 14px; font-size: 12.5px; line-height: 1.5;
    color: var(--ghrc-text-dim);
    display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .ghrc-langs-labels {
    display: flex; flex-wrap: wrap; gap: 4px 12px;
    font-size: 10.5px; color: var(--ghrc-text-dim); margin-bottom: 6px;
  }
  .ghrc-lang-chip { display: inline-flex; align-items: center; gap: 5px; white-space: nowrap; }
  .ghrc-dot { width: 7px; height: 7px; border-radius: 50%; flex: 0 0 auto; }
  .ghrc-lang-pct { opacity: .7; }

  .ghrc-bar {
    display: flex; width: 100%; height: 6px; border-radius: 4px;
    overflow: hidden; background: var(--ghrc-border);
  }
  .ghrc-seg { height: 100%; width: 0%; }

  .ghrc-stats {
    display: flex; align-items: center; gap: 14px;
    margin-top: 12px; font-size: 11px; color: var(--ghrc-text-dim);
  }
  .ghrc-stat { display: inline-flex; align-items: center; gap: 4px; }
  .ghrc-stat svg { width: 12px; height: 12px; opacity: .8; }
  .ghrc-stat.ghrc-stars { color: var(--ghrc-accent); }
  .ghrc-stat.ghrc-stars svg { opacity: 1; }
  .ghrc-stat.ghrc-fork { color: var(--ghrc-secondary); }
  .ghrc-stat.ghrc-fork svg { opacity: 1; }
  .ghrc-updated { margin-left: auto; }

  .ghrc-skeleton {
    opacity: 1 !important; transform: none !important;
    display: flex; align-items: center; justify-content: center;
    min-height: 196px;
  }
  .ghrc-loading {
    color: var(--ghrc-text-dim); font-size: 12px; letter-spacing: .02em;
  }

  .ghrc-error {
    font-size: 12px; color: var(--ghrc-text-dim); opacity: 1 !important;
    transform: none !important;
  }
  `;
  document.head.appendChild(style);
}

/* ------------------------------------------------------------------ */
/* Small inline icons (generic, license-free — not brand marks)        */
/* ------------------------------------------------------------------ */
const ICON_FORK = `<svg viewBox="0 0 16 16" fill="currentColor"><path d="M5 3a1.5 1.5 0 1 1-.001 3.001A1.5 1.5 0 0 1 5 3zm6 0a1.5 1.5 0 1 1-.001 3.001A1.5 1.5 0 0 1 11 3zM8 11a1.5 1.5 0 1 1-.001 3.001A1.5 1.5 0 0 1 8 11zM5 6.5v1A2.5 2.5 0 0 0 7.5 10h1A2.5 2.5 0 0 0 11 7.5v-1"/></svg>`;
const ICON_STAR = `<svg viewBox="0 0 16 16" fill="currentColor"><path d="M8 .5l2.24 4.78 5.26.62-3.86 3.65.98 5.2L8 12.3l-4.62 2.45.98-5.2L.5 5.9l5.26-.62z"/></svg>`;
const ICON_BADGE = `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><circle cx="4.5" cy="4.5" r="1.6"/><circle cx="4.5" cy="11.5" r="1.6"/><circle cx="11.5" cy="4.5" r="1.6"/><path d="M4.5 6.1v3.8M4.5 9.9c0-2.2 1.8-3.4 3.5-3.4h3.5"/></svg>`;

/* ------------------------------------------------------------------ */
/* Skeleton (loading) markup                                           */
/* ------------------------------------------------------------------ */
function skeletonMarkup() {
  return `<span class="ghrc-loading">loading...</span>`;
}

/* ------------------------------------------------------------------ */
/* Card builder                                                        */
/* ------------------------------------------------------------------ */
function buildCard(repo, langs, opts) {
  const card = document.createElement("a");
  card.className = `ghrc-card${opts.theme === "light" ? " ghrc-light" : ""}`;
  card.href = repo.html_url;
  card.target = "_blank";
  card.rel = "noopener noreferrer";

  const langLabels = langs
    .map(
      (l) => `
      <span class="ghrc-lang-chip">
        <span class="ghrc-dot" style="background:${langColor(l.name)}"></span>
        ${l.name} <span class="ghrc-lang-pct">${l.pct.toFixed(1)}%</span>
      </span>`
    )
    .join("");

  const langSegs = langs
    .map((l) => `<span class="ghrc-seg" data-pct="${l.pct}" style="background:${langColor(l.name)}"></span>`)
    .join("");

  card.innerHTML = `
    <div class="ghrc-head">
      <div class="ghrc-titleblock">
        <p class="ghrc-owner">${repo.owner.login}</p>
        <p class="ghrc-title">${repo.name}</p>
      </div>
      <div class="ghrc-avatar-wrap">
        <img class="ghrc-avatar" src="${repo.owner.avatar_url}&s=80" alt="${repo.owner.login} avatar" loading="lazy" />
        <span class="ghrc-badge">${ICON_BADGE}</span>
      </div>
    </div>

    <p class="ghrc-desc">${repo.description ? escapeHTML(repo.description) : "No description provided."}</p>

    ${langs.length ? `
      <div class="ghrc-langs-labels">${langLabels}</div>
      <div class="ghrc-bar">${langSegs}</div>
    ` : ""}

    <div class="ghrc-stats">
      <span class="ghrc-stat ghrc-stars">${ICON_STAR}${formatCount(repo.stargazers_count)}</span>
      <span class="ghrc-stat ghrc-fork">${ICON_FORK}${formatCount(repo.forks_count)}</span>
      <span class="ghrc-stat ghrc-updated">updated ${timeAgo(repo.pushed_at)}</span>
    </div>
  `;
  return card;
}

function escapeHTML(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

/* ------------------------------------------------------------------ */
/* Animation                                                            */
/* ------------------------------------------------------------------ */
function animateIn(card) {
  gsap.to(card, { opacity: 1, y: 0, duration: 0.55, ease: "power3.out" });

  const segs = card.querySelectorAll(".ghrc-seg");
  gsap.to(segs, {
    width: (i, el) => `${el.dataset.pct}%`,
    duration: 0.7,
    ease: "power2.out",
    stagger: 0.06,
    delay: 0.15,
  });

  const chips = card.querySelectorAll(".ghrc-lang-chip");
  gsap.from(chips, { opacity: 0, y: 4, duration: 0.4, stagger: 0.04, delay: 0.15 });

  const hoverIn = () => gsap.to(card, { y: -3, duration: 0.25, ease: "power2.out" });
  const hoverOut = () => gsap.to(card, { y: 0, duration: 0.3, ease: "power2.out" });
  card.addEventListener("mouseenter", hoverIn);
  card.addEventListener("mouseleave", hoverOut);
}

/* ------------------------------------------------------------------ */
/* Public API                                                          */
/* ------------------------------------------------------------------ */

/**
 * Render a single repo card into a container.
 * @param {string|HTMLElement} target - CSS selector or element to render into.
 * @param {string} repoSlug - "owner/repo".
 * @param {object} [opts]
 */
export async function renderRepoCard(target, repoSlug, opts = {}) {
  injectStyles();
  const options = { theme: "dark", maxLangs: 5, token: null, ...opts };
  const container = typeof target === "string" ? document.querySelector(target) : target;
  if (!container) throw new Error(`ghrc: target "${target}" not found`);

  const skeleton = document.createElement("div");
  skeleton.className = `ghrc-card ghrc-skeleton${options.theme === "light" ? " ghrc-light" : ""}`;
  skeleton.innerHTML = skeletonMarkup();
  container.innerHTML = "";
  container.appendChild(skeleton);

  try {
    const [repo, langBytes] = await Promise.all([
      fetchJSON(`${API}/${repoSlug}`, options.token),
      fetchJSON(`${API}/${repoSlug}/languages`, options.token),
    ]);
    const langs = computeLanguages(langBytes, options.maxLangs);
    const card = buildCard(repo, langs, options);
    container.innerHTML = "";
    container.appendChild(card);
    animateIn(card);
    return card;
  } catch (err) {
    const message =
      err.status === 404 ? `Repo "${repoSlug}" not found` :
      err.status === 403 ? "GitHub API rate limit hit" :
      "Couldn't load repo";
    container.innerHTML = `<div class="ghrc-card ghrc-error${options.theme === "light" ? " ghrc-light" : ""}">${message}</div>`;
    throw err;
  }
}

/**
 * Scan the document for `[data-ghrc]` placeholders and render each one.
 * `data-ghrc="owner/repo"`, optional `data-ghrc-theme`, `data-ghrc-max-langs`.
 */
export function initRepoCards(root = document) {
  const nodes = root.querySelectorAll("[data-ghrc]");
  nodes.forEach((el) => {
    const repoSlug = el.getAttribute("data-ghrc");
    const theme = el.getAttribute("data-ghrc-theme") || "dark";
    const maxLangs = Number(el.getAttribute("data-ghrc-max-langs")) || 5;
    renderRepoCard(el, repoSlug, { theme, maxLangs }).catch(() => {});
  });
}

export default { renderRepoCard, initRepoCards };