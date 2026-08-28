import { Redis } from "@upstash/redis";

const redis = Redis.fromEnv();

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).end();
  }

  try {
    const limit = Math.min(parseInt(req.query.limit || "200", 10) || 200, 500);
    const items = await redis.lrange("visitor:log", 0, limit - 1);
    const parsed = items.map((x) => {
      if (typeof x === "string") {
        try { return JSON.parse(x); } catch { return null; }
      }
      return x;
    }).filter(Boolean);

    res.setHeader("Cache-Control", "public, s-maxage=30, stale-while-revalidate=120");
    return res.status(200).json({ visitors: parsed });
  } catch (err) {
    return res.status(500).json({ error: "list_failed", message: String(err && err.message || err) });
  }
}
