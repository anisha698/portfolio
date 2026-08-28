document.documentElement.setAttribute("data-theme", "light");

document.addEventListener("DOMContentLoaded", () => {
  const yr = document.getElementById("yr");
  if (yr) yr.textContent = new Date().getFullYear();

  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (e.isIntersecting) {
        e.target.classList.add("in");
        io.unobserve(e.target);
      }
    });
  }, { threshold: 0.12 });
  document.querySelectorAll(".reveal").forEach((el) => io.observe(el));

  const vIo = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      const v = e.target;
      const shouldAutoplay =
        v.dataset.pgAutoplay === "true" ||
        v.hasAttribute("autoplay") ||
        v.autoplay;
      if (e.isIntersecting) {
        if (shouldAutoplay) {
          v.muted = true; // required for autoplay policies
          v.play().catch(() => {});
        }
      } else if (!v.paused) {
        v.pause();
      }
    });
  }, { threshold: 0.2 });
  document.querySelectorAll("video").forEach((v) => {
    if (v.hasAttribute("autoplay") || v.dataset.pgAutoplay === "true") {
      v.muted = true;
      v.playsInline = true;
    }
    vIo.observe(v);
  });
  window.__videoIo = vIo;

  initTinParallax();
  initHomeNavIcon();
  initMobileNav();
  initHomeWorkLink();
  initPlayground();
  initCaseStudyPage();
  initResumeModal();
});

/** Case pages — intro phase, then two-column deep-dive with sticky TOC. */
function initCaseStudyPage() {
  if (!document.body.classList.contains("p-case-page")) return;

  const toc = document.querySelector(".p-case-toc");
  const navlinks = toc ? [...toc.querySelectorAll('a[href^="#"]')] : [];
  /** Pairs (link, section); skip broken TOC hrefs so spy still runs. */
  const tocPairs = [];
  for (const a of navlinks) {
    const raw = a.getAttribute("href");
    if (!raw || raw.length < 2 || raw[0] !== "#") continue;
    const id = decodeURIComponent(raw.slice(1));
    const sec = document.getElementById(id);
    if (sec) tocPairs.push({ link: a, section: sec });
  }
  const sections = tocPairs.map((p) => p.section);
  let lastSpyIdx = -1;

  const backTop = document.createElement("button");
  backTop.type = "button";
  backTop.className = "p-case-back-top";
  backTop.setAttribute("aria-label", "Back to top");
  backTop.innerHTML = '<span aria-hidden="true">↑</span> Top';
  document.body.appendChild(backTop);

  backTop.addEventListener("click", () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  });

  const caseStudyNavOffset = () => {
    const el = document.querySelector(".site-nav");
    return Math.round((el?.offsetHeight ?? 92) + 16);
  };

  const syncCaseStudyActiveLink = () => {
    if (!toc || !tocPairs.length) return;
    const navH = caseStudyNavOffset();
    const passY = navH + 4;
    let idx = 0;
    for (let i = 0; i < sections.length; i++) {
      if (sections[i].getBoundingClientRect().top <= passY) idx = i;
    }

    tocPairs.forEach((p, i) => p.link.classList.toggle("is-active", i === idx));

    if (idx !== lastSpyIdx) {
      lastSpyIdx = idx;
      const active = tocPairs[idx]?.link;
      const rail = document.querySelector(".p-case-toc-rail");
      if (active && rail) {
        const r = rail.getBoundingClientRect();
        const a = active.getBoundingClientRect();
        if (a.top < r.top + 6 || a.bottom > r.bottom - 6) {
          active.scrollIntoView({ block: "nearest", inline: "nearest" });
        }
      }
    }
  };

  let sectionObserver = null;
  const connectCaseStudySectionObserver = () => {
    sectionObserver?.disconnect();
    sectionObserver = null;
    if (!sections.length) return;
    const topPx = caseStudyNavOffset();
    const bottomPx = Math.round(window.innerHeight * 0.38);
    sectionObserver = new IntersectionObserver(
      () => {
        syncCaseStudyActiveLink();
      },
      {
        root: null,
        rootMargin: `-${topPx}px 0px -${bottomPx}px 0px`,
        threshold: [0, 0.02, 0.08, 0.15, 0.25, 0.5, 0.75, 1],
      }
    );
    sections.forEach((sec) => sectionObserver.observe(sec));
    syncCaseStudyActiveLink();
  };

  connectCaseStudySectionObserver();

  let resizeSpyTimer = null;
  window.addEventListener(
    "resize",
    () => {
      clearTimeout(resizeSpyTimer);
      resizeSpyTimer = setTimeout(() => {
        connectCaseStudySectionObserver();
      }, 120);
    },
    { passive: true }
  );

  let ticking = false;
  const onScroll = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      ticking = false;
      const y = window.scrollY;
      backTop.classList.toggle("is-visible", y > Math.max(480, window.innerHeight * 0.85));
      syncCaseStudyActiveLink();
    });
  };

  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("load", () => {
    connectCaseStudySectionObserver();
    syncCaseStudyActiveLink();
  }, { once: true });
  onScroll();

  tocPairs.forEach(({ link }) => {
    link.addEventListener("click", (e) => {
      const raw = link.getAttribute("href");
      if (!raw || !raw.startsWith("#")) return;
      const id = decodeURIComponent(raw.slice(1));
      const target = document.getElementById(id);
      if (!target) return;
      e.preventDefault();
      target.scrollIntoView({ behavior: "smooth", block: "start" });
      if (history.replaceState) {
        history.replaceState(null, "", `#${id}`);
      } else {
        location.hash = `#${id}`;
      }
      requestAnimationFrame(() => syncCaseStudyActiveLink());
    });
  });
}

function initHomeNavIcon() {
  if (document.body.classList.contains("home")) return;

  const inner = document.querySelector(".site-nav-inner");
  if (!inner || inner.querySelector(".nav-home-icon")) return;

  const link = document.createElement("a");
  link.className = "nav-home-icon nav-brand";
  link.href = "/";
  link.setAttribute("aria-label", "Anisha Rajan — Home");
  link.innerHTML = `
    <svg class="nav-brand__flower" viewBox="0 0 64 64" width="50" height="50" aria-hidden="true" focusable="false">
      <g transform="translate(32 32) scale(0.92) translate(-32 -32)">
        <g fill="currentColor">
          <ellipse cx="32" cy="19" rx="8.5" ry="11"></ellipse>
          <ellipse cx="32" cy="19" rx="8.5" ry="11" transform="rotate(72 32 32)"></ellipse>
          <ellipse cx="32" cy="19" rx="8.5" ry="11" transform="rotate(144 32 32)"></ellipse>
          <ellipse cx="32" cy="19" rx="8.5" ry="11" transform="rotate(216 32 32)"></ellipse>
          <ellipse cx="32" cy="19" rx="8.5" ry="11" transform="rotate(288 32 32)"></ellipse>
        </g>
        <circle cx="32" cy="32" r="5.5" fill="#ffffff"></circle>
      </g>
    </svg>
  `.trim();

  inner.insertBefore(link, inner.firstChild);
}

function initHomeWorkLink() {
  if (!document.body.classList.contains("home")) return;

  const workAnchors = document.querySelectorAll('a[href="#work"], a[href="/#work"]');
  workAnchors.forEach((link) => {
    link.addEventListener("click", (e) => {
      e.preventDefault();
      const work = document.getElementById("work");
      if (!work) return;
      const top = work.getBoundingClientRect().top + window.scrollY - 100;
      window.scrollTo({ top, behavior: "smooth" });
    });
  });
}

function initMobileNav() {
  const nav = document.querySelector(".site-nav");
  const toggle = document.querySelector(".nav-toggle");
  const menu = document.getElementById("site-nav-menu");
  if (!nav || !toggle || !menu) return;

  const closeMenu = () => {
    nav.classList.remove("is-open");
    toggle.setAttribute("aria-expanded", "false");
    toggle.setAttribute("aria-label", "Open menu");
    document.body.classList.remove("nav-open");
  };

  toggle.addEventListener("click", () => {
    const open = !nav.classList.contains("is-open");
    nav.classList.toggle("is-open", open);
    toggle.setAttribute("aria-expanded", String(open));
    toggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
    document.body.classList.toggle("nav-open", open);
  });

  menu.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", closeMenu);
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeMenu();
  });

  window.matchMedia("(min-width: 1025px)").addEventListener("change", (e) => {
    if (e.matches) closeMenu();
  });
}

function initTinParallax() {
  const stages = document.querySelectorAll(".tin-stage");
  if (!stages.length) return;

  stages.forEach((stage) => {
    const items = stage.querySelectorAll(".tin-item");
    if (!items.length) return;

    const ENTER_MS = 240;
    const LEAVE_MS = 280;
    let enterTimer = null;
    let leaveTimer = null;
    let hotItem = null;

    const setHot = (item) => {
      if (hotItem && hotItem !== item) hotItem.classList.remove("is-hot");
      hotItem = item;
      if (item) item.classList.add("is-hot");
    };

    items.forEach((item) => {
      item.addEventListener("pointerenter", () => {
        clearTimeout(leaveTimer);
        clearTimeout(enterTimer);
        enterTimer = setTimeout(() => setHot(item), ENTER_MS);
      });
      item.addEventListener("pointerleave", () => {
        clearTimeout(enterTimer);
        leaveTimer = setTimeout(() => {
          if (hotItem === item) setHot(null);
        }, LEAVE_MS);
      });
      item.addEventListener("focus", () => {
        clearTimeout(enterTimer);
        clearTimeout(leaveTimer);
        setHot(item);
      });
      item.addEventListener("blur", () => {
        if (hotItem === item) setHot(null);
      });
    });
  });
}

const PG_MEDIA_BASE = "/assets/playground/";
const PG_MEDIA_VERSION = "23";
let pgResizeBound = false;
let pgLayoutPending = false;
const PG_COL_GAP = 24;

function pgMediaUrl(path) {
  if (!path) return null;
  const base = path.includes("/") ? path : `${PG_MEDIA_BASE}${path}`;
  return `${base}?v=${PG_MEDIA_VERSION}`;
}

function appendPlaygroundMeta(card, item) {
  const tagsWrap = document.createElement("div");
  tagsWrap.className = "pg-work-tags";
  (item.tags || []).forEach((tag) => {
    const span = document.createElement("span");
    span.className = "pg-cat";
    span.textContent = tag;
    tagsWrap.appendChild(span);
  });
  card.appendChild(tagsWrap);

  if (item.url) {
    const liLink = document.createElement("a");
    liLink.className = "pg-li-view";
    liLink.href = item.url;
    liLink.target = "_blank";
    liLink.rel = "noopener noreferrer";
    liLink.textContent = "View on LinkedIn";
    card.appendChild(liLink);
  }
}

function buildPlaygroundCard(item) {
  const mediaPath = item?.src || item?.file;
  if (!mediaPath) return null;

  const card = item.url
    ? document.createElement("a")
    : document.createElement("article");
  card.className = item.url
    ? "pg-work-card pg-work-card--link"
    : "pg-work-card";
  if (item.url) {
    card.href = item.url;
    card.target = "_blank";
    card.rel = "noopener noreferrer";
  }

  const thumb = document.createElement("div");
  thumb.className = "pg-work-thumb";
  if (item.scale) thumb.dataset.scale = String(item.scale);

  const src = pgMediaUrl(mediaPath);
  const isVideo = /\.(mp4|webm|mov)$/i.test(mediaPath);
  const alt =
    item.alt ||
    mediaPath.replace(/\.[^.]+$/, "").replace(/.*\//, "").replace(/[-_]/g, " ");
  const scale = item.scale ? +item.scale : 1;

  if (isVideo) {
    const video = document.createElement("video");
    video.src = src;
    video.muted = true;
    video.loop = true;
    video.playsInline = true;
    video.preload = "metadata";
    video.setAttribute("aria-label", alt);
    video.dataset.pgAutoplay = "true";
    if (item.poster) video.poster = pgMediaUrl(item.poster);
    video.addEventListener("loadedmetadata", () => {
      setPlaygroundDisplay(thumb, video.videoWidth, video.videoHeight, scale);
    });
    thumb.appendChild(video);
  } else {
    const img = document.createElement("img");
    img.src = src;
    img.alt = alt;
    img.loading = "lazy";
    img.decoding = "async";
    img.addEventListener("load", () => {
      setPlaygroundDisplay(thumb, img.naturalWidth, img.naturalHeight, scale);
    });
    thumb.appendChild(img);
  }

  card.appendChild(thumb);
  appendPlaygroundMeta(card, item);
  return card;
}

function pgColCount() {
  if (window.matchMedia("(max-width: 760px)").matches) return 1;
  if (window.matchMedia("(max-width: 900px)").matches) return 2;
  return 3;
}

/** Collect cards in document order, unwrapping any prior masonry columns. */
function pgCollectCards(grid) {
  const cards = [];
  Array.from(grid.children).forEach((child) => {
    if (child.classList?.contains("pg-masonry-col")) {
      Array.from(child.querySelectorAll(":scope > .pg-work-card")).forEach((c) =>
        cards.push(c)
      );
    } else if (child.classList?.contains("pg-work-card")) {
      cards.push(child);
    }
  });
  return cards;
}

/** Pinterest pack: place each card into the currently shortest column. */
function layoutPlaygroundMasonry(grid) {
  if (!grid) return;
  const cards = pgCollectCards(grid);
  if (!cards.length) return;

  const n = pgColCount();
  grid.replaceChildren();

  const cols = [];
  const heights = [];
  for (let i = 0; i < n; i++) {
    const col = document.createElement("div");
    col.className = "pg-masonry-col";
    grid.appendChild(col);
    cols.push(col);
    heights.push(0);
  }

  cards.forEach((card) => {
    let i = 0;
    for (let c = 1; c < n; c++) {
      if (heights[c] < heights[i]) i = c;
    }
    cols[i].appendChild(card);
    const h = card.offsetHeight || 0;
    heights[i] += (heights[i] > 0 ? PG_COL_GAP : 0) + h;
  });
}

function layoutAllPlaygroundGrids() {
  document.querySelectorAll(".pg-grid").forEach(layoutPlaygroundMasonry);
}

function schedulePlaygroundLayout() {
  if (pgLayoutPending) return;
  pgLayoutPending = true;
  requestAnimationFrame(() => {
    pgLayoutPending = false;
    layoutAllPlaygroundGrids();
  });
}

/** Size thumbs to full column width; keep native aspect ratio. */
function setPlaygroundDisplay(thumb, w, h, scale = 1) {
  if (!w || !h) return;
  thumb.dataset.pw = String(w);
  thumb.dataset.ph = String(h);
  if (scale !== 1) thumb.dataset.scale = String(scale);
  thumb.style.aspectRatio = `${w} / ${h}`;

  const card = thumb.closest(".pg-work-card");
  card?.classList.remove("pg-work-card--wide");
  // Always fill the masonry column — no full-span rows, no inset “gaps”
  thumb.style.maxWidth = "100%";
  thumb.style.width = "100%";
  thumb.classList.remove("pg-work-thumb--capped");
  if (scale < 1) {
    card?.classList.add("pg-work-card--scaled");
  } else {
    card?.classList.remove("pg-work-card--scaled");
  }

  schedulePlaygroundLayout();
}

function initPlaygroundResize() {
  if (pgResizeBound) return;
  pgResizeBound = true;
  let t;
  window.addEventListener("resize", () => {
    if (!document.querySelector(".pg-grid")) return;
    clearTimeout(t);
    t = setTimeout(() => {
      layoutAllPlaygroundGrids();
    }, 120);
  });
}

function populatePlaygroundGrid(gridId, manifestPath, emptyMessage) {
  const grid = document.getElementById(gridId);
  if (!grid) return Promise.resolve();

  return fetch(`${manifestPath}?v=${PG_MEDIA_VERSION}`)
    .then((res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    })
    .then((items) => {
      if (!Array.isArray(items) || !items.length) {
        grid.textContent = emptyMessage;
        return;
      }
      const frag = document.createDocumentFragment();
      const loadWait = [];
      items.forEach((item) => {
        const card = buildPlaygroundCard(item);
        if (!card) return;
        frag.appendChild(card);
        const media = card.querySelector("img, video");
        if (!media) return;
        loadWait.push(
          new Promise((resolve) => {
            if (media.tagName === "IMG") {
              if (media.complete && media.naturalWidth) resolve();
              else {
                media.addEventListener("load", resolve, { once: true });
                media.addEventListener("error", resolve, { once: true });
              }
            } else {
              if (media.readyState >= 1 && media.videoWidth) resolve();
              else {
                media.addEventListener("loadedmetadata", resolve, { once: true });
                media.addEventListener("error", resolve, { once: true });
              }
            }
          })
        );
      });
      grid.appendChild(frag);
      grid.querySelectorAll("video").forEach((v) => window.__videoIo?.observe(v));
      layoutPlaygroundMasonry(grid);
      return Promise.all(loadWait).then(() => layoutPlaygroundMasonry(grid));
    })
    .catch(() => {
      grid.textContent = "Could not load playground items.";
    });
}

function initPlaygroundArchivedAccordion() {
  const archived = document.querySelector(".pg-archived");
  if (!archived) return;
  archived.addEventListener("toggle", () => {
    if (!archived.open) return;
    // Relayout after open — grid was display:none while collapsed, so heights were 0.
    requestAnimationFrame(() => layoutPlaygroundMasonry(document.getElementById("pg-archived-grid")));
  });
}

function initPlayground() {
  initPlaygroundArchivedAccordion();

  const hasDynamic =
    document.getElementById("pg-grid") || document.getElementById("pg-archived-grid");

  if (hasDynamic) {
    Promise.all([
      populatePlaygroundGrid("pg-grid", "/playground/items.json", "No playground items yet."),
      populatePlaygroundGrid("pg-archived-grid", "/playground/archived.json", "No archived items yet."),
    ]).then(() => {
      layoutAllPlaygroundGrids();
      initPlaygroundResize();
    });
    return;
  }

  // Static HTML grids (e.g. graphic design) — size thumbs to native ratios, then pack.
  if (!document.querySelector(".pg-grid")) return;
  initStaticPlaygroundGrids();
}

/** Layout pre-rendered .pg-grid cards (not loaded from playground JSON). */
function initStaticPlaygroundGrids() {
  const imgs = document.querySelectorAll(".pg-grid .pg-work-thumb img");
  let pending = 0;

  const doneOne = () => {
    pending = Math.max(0, pending - 1);
    if (pending === 0) {
      layoutAllPlaygroundGrids();
      initPlaygroundResize();
    }
  };

  imgs.forEach((img) => {
    const thumb = img.closest(".pg-work-thumb");
    const apply = () => {
      if (thumb && img.naturalWidth && img.naturalHeight) {
        setPlaygroundDisplay(thumb, img.naturalWidth, img.naturalHeight);
      }
      doneOne();
    };
    pending += 1;
    if (img.complete && img.naturalWidth) apply();
    else {
      img.addEventListener("load", apply, { once: true });
      img.addEventListener("error", doneOne, { once: true });
    }
  });

  if (pending === 0) {
    layoutAllPlaygroundGrids();
    initPlaygroundResize();
  }
}

const RESUME_PDF_URL = "/assets/Anisha_Rajan_Resume.pdf";
const RESUME_HTML_URL = "/assets/resume.html?v=3";

function initResumeModal() {
  const nav = document.querySelector(".site-nav-links");
  if (!nav || nav.querySelector("[data-resume-open]")) return;

  const linkedIn = nav.querySelector('.nav-icon[aria-label="LinkedIn"]');
  if (!linkedIn) return;

  const openBtn = document.createElement("button");
  openBtn.type = "button";
  openBtn.className = "nav-icon";
  openBtn.setAttribute("data-resume-open", "");
  openBtn.setAttribute("aria-label", "Resume");
  openBtn.innerHTML = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke" aria-hidden="true">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
      <polyline points="14 2 14 8 20 8"></polyline>
      <line x1="8" y1="13" x2="16" y2="13"></line>
      <line x1="8" y1="17" x2="16" y2="17"></line>
      <line x1="8" y1="9" x2="10" y2="9"></line>
    </svg>
  `.trim();
  nav.insertBefore(openBtn, linkedIn);

  if (document.getElementById("resume-modal")) return;

  const modal = document.createElement("div");
  modal.id = "resume-modal";
  modal.className = "resume-modal";
  modal.hidden = true;
  modal.innerHTML = `
    <div class="resume-modal__backdrop" data-resume-close tabindex="-1"></div>
    <div class="resume-modal__panel" role="dialog" aria-modal="true" aria-labelledby="resume-modal-title">
      <header class="resume-modal__header">
        <h2 id="resume-modal-title" class="resume-modal__title">Resume</h2>
        <div class="resume-modal__actions">
          <a class="resume-modal__download" href="${RESUME_PDF_URL}" download="Anisha_Rajan_Resume.pdf">Download PDF</a>
          <button type="button" class="resume-modal__close" data-resume-close aria-label="Close resume">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
      </header>
      <div class="resume-modal__body">
        <div class="resume-modal__content" data-resume-content>
          <p class="resume-modal__status">Loading resume&hellip;</p>
        </div>
      </div>
    </div>
  `.trim();
  document.body.appendChild(modal);

  const panel = modal.querySelector(".resume-modal__panel");
  const body = modal.querySelector(".resume-modal__body");
  const content = modal.querySelector("[data-resume-content]");
  const closeEls = modal.querySelectorAll("[data-resume-close]");
  let lastFocus = null;
  let loaded = false;

  const loadResume = () => {
    if (loaded) return;
    loaded = true;
    fetch(RESUME_HTML_URL)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.text();
      })
      .then((html) => {
        content.innerHTML = html;
      })
      .catch(() => {
        loaded = false;
        content.innerHTML = `<p class="resume-modal__status">Couldn&rsquo;t load the resume. <a href="${RESUME_PDF_URL}" target="_blank" rel="noopener">Open the PDF</a> instead.</p>`;
      });
  };

  const getFocusable = () =>
    [...panel.querySelectorAll("a[href], button:not([disabled])")].filter((el) => {
      if (el.hasAttribute("disabled")) return false;
      return el.getClientRects().length > 0;
    });

  const onKeyDown = (e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      close();
      return;
    }
    if (e.key !== "Tab" || modal.hidden) return;
    const focusable = getFocusable();
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  const open = () => {
    if (!modal.hidden) return;
    lastFocus = document.activeElement;
    modal.hidden = false;
    loadResume();
    if (body) body.scrollTop = 0;
    document.body.classList.add("resume-modal-open");
    document.querySelector(".site-nav")?.classList.remove("is-open");
    document.body.classList.remove("nav-open");
    const toggle = document.querySelector(".nav-toggle");
    if (toggle) {
      toggle.setAttribute("aria-expanded", "false");
      toggle.setAttribute("aria-label", "Open menu");
    }
    document.addEventListener("keydown", onKeyDown);
    requestAnimationFrame(() => {
      panel.querySelector(".resume-modal__close")?.focus();
    });
  };

  const close = () => {
    if (modal.hidden) return;
    modal.hidden = true;
    document.body.classList.remove("resume-modal-open");
    document.removeEventListener("keydown", onKeyDown);
    if (lastFocus && typeof lastFocus.focus === "function") lastFocus.focus();
  };

  openBtn.addEventListener("click", open);
  closeEls.forEach((el) => el.addEventListener("click", close));
}
