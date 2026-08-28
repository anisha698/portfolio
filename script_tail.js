async function pgMediaExists(mediaPath) {
  const url = pgMediaUrl(mediaPath);
  try {
    const res = await fetch(url, { method: "HEAD" });
    if (res.ok) return true;
    if (res.status === 405) {
      const probe = await fetch(url, { headers: { Range: "bytes=0-0" } });
      return probe.ok || probe.status === 206;
    }
    return false;
  } catch {
    return false;
  }
}

async function resolvePlaygroundCard(item) {
  const mediaPath = item?.src || item?.file;
  const isVideo = mediaPath && /\.(mp4|webm|mov)$/i.test(mediaPath);

  if (isVideo && item.controls) {
    const urn = linkedInUrnFromItem(item);
    if (urn && !(await pgMediaExists(mediaPath))) {
      return buildLinkedInEmbedCard(item, urn);
    }
    return buildPlayerVideoCard(item, mediaPath);
  }

  return buildPlaygroundCard(item);
}

function initPlayground() {
  const grid = document.getElementById("pg-grid");
  if (!grid) return;

  fetch(`playground/items.json?v=${PG_MEDIA_VERSION}`)
    .then((res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    })
    .then(async (items) => {
      if (!Array.isArray(items) || !items.length) {
        grid.textContent = "No playground items yet.";
        return;
      }
      const frag = document.createDocumentFragment();
      for (const item of items) {
        const card = await resolvePlaygroundCard(item);
        if (card) frag.appendChild(card);
      }
      grid.appendChild(frag);
      grid.querySelectorAll("video").forEach((v) => window.__videoIo?.observe(v));
      grid.querySelectorAll(".pg-work-thumb[data-pw]").forEach((thumb) => {
        const scale = thumb.dataset.scale ? +thumb.dataset.scale : 1;
        setPlaygroundDisplay(thumb, +thumb.dataset.pw, +thumb.dataset.ph, scale);
      });
      initPlaygroundResize();
    })
    .catch(() => {
      grid.textContent = "Could not load playground items.";
    });
}