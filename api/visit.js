import { Redis } from "@upstash/redis";
import { put } from "@vercel/blob";

const DESIGN = [
  "Pixel","Vector","Bezier","Hex","Grid","Pica","Kerning","Glyph","Spline","Anchor",
  "Stroke","Mask","Layer","Node","Curve","Arc","Spiral","Render","Shader","Sprite",
  "Atlas","Canvas","Tile","Bevel","Halftone","Dither","Bitmap","Swatch","Mono","Serif",
  "Slab","Bold","Italic","Frame","Mesh","Knot","Tint","Hue","Gradient","Path",
  "Raster","Outline","Bloom","Glow","Palette","Ligature","Tracking","Leading","Polygon","Hexagon"
];

const ANIMALS = [
  "Heron","Cat","Otter","Moth","Fox","Owl","Hare","Lynx","Stag","Wolf",
  "Bee","Crow","Raven","Sparrow","Finch","Wren","Robin","Jay","Hawk","Falcon",
  "Eagle","Swan","Loon","Tern","Puffin","Crane","Pelican","Flamingo","Kingfisher","Hummingbird",
  "Swallow","Lark","Thrush","Magpie","Nuthatch","Tit","Phoebe","Bunting","Cardinal","Goldfinch"
];

const redis = Redis.fromEnv();

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).end();
  }

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
    const { signature, initials } = body;

    const n = await redis.incr("visitor:count");

    // Pick a unique design-term + animal combo (server-side dedup)
    let name = null;
    for (let i = 0; i < 60; i++) {
      const candidate = `${DESIGN[Math.floor(Math.random() * DESIGN.length)]} ${ANIMALS[Math.floor(Math.random() * ANIMALS.length)]}`;
      const added = await redis.sadd("visitor:names", candidate);
      if (added === 1) { name = candidate; break; }
    }
    if (!name) {
      // pool exhausted — fall back to numbered suffix
      const base = `${DESIGN[Math.floor(Math.random() * DESIGN.length)]} ${ANIMALS[Math.floor(Math.random() * ANIMALS.length)]}`;
      name = `${base} ${n}`;
    }

    // Optional signature upload
    let signatureUrl = null;
    if (signature && typeof signature === "string" && signature.startsWith("data:image/")) {
      try {
        const base64 = signature.split(",")[1];
        const buf = Buffer.from(base64, "base64");
        const padded = String(n).padStart(4, "0");
        const blob = await put(`signatures/${padded}.png`, buf, {
          access: "public",
          contentType: "image/png",
          addRandomSuffix: false
        });
        signatureUrl = blob.url;
      } catch (e) {
        // ignore upload error; still log the visit
        signatureUrl = null;
      }
    }

    const record = {
      n,
      name,
      initials: (initials || "").toString().slice(0, 6),
      signatureUrl,
      date: new Date().toISOString()
    };

    await redis.lpush("visitor:log", JSON.stringify(record));
    await redis.ltrim("visitor:log", 0, 4999);

    return res.status(200).json(record);
  } catch (err) {
    return res.status(500).json({ error: "visit_failed", message: String(err && err.message || err) });
  }
}
