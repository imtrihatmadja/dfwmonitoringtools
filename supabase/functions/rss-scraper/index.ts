// ============================================================
// Edge Function: rss-scraper
// PMIS DFW Indonesia - Knowledge Management Module
// Runtime: Deno (Supabase Edge Functions)
//
// SETUP INSTRUCTIONS:
// 1. Deploy: supabase functions deploy rss-scraper --no-verify-jwt
// 2. Set secret: supabase secrets set SUPABASE_SERVICE_ROLE_KEY=<your_key>
// 3. Schedule with pg_cron (run in Supabase SQL Editor):
//
//    -- Enable pg_cron extension first (Dashboard > Extensions > pg_cron)
//    SELECT cron.schedule(
//      'rss-scraper-job',
//      '0 */6 * * *',   -- every 6 hours
//      $$
//        SELECT net.http_post(
//          url := 'https://<YOUR_PROJECT_REF>.supabase.co/functions/v1/rss-scraper',
//          headers := '{"Authorization": "Bearer <ANON_KEY>", "Content-Type": "application/json"}'::jsonb,
//          body := '{}'::jsonb
//        ) AS request_id;
//      $$
//    );
//
//    -- To unschedule: SELECT cron.unschedule('rss-scraper-job');
//    -- To view jobs:  SELECT * FROM cron.job;
//    -- To view runs:  SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 20;
// ============================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Use service role to bypass RLS for automated inserts
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

// ── Helpers ──────────────────────────────────────────────────

/** Simple SHA-256 hash of a string (for deduplication) */
async function sha256(str: string): Promise<string> {
  const msgBuffer = new TextEncoder().encode(str);
  const hashBuffer = await crypto.subtle.digest("SHA-256", msgBuffer);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Parse pubDate string to ISO date string */
function parsePubDate(raw: string | null): string | null {
  if (!raw) return null;
  try {
    return new Date(raw).toISOString().split("T")[0];
  } catch {
    return null;
  }
}

/** Extract text content from XML tag */
function extractTag(xml: string, tag: string): string {
  // Handle CDATA
  const cdataRe = new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]></${tag}>`, "i");
  const cdataMatch = xml.match(cdataRe);
  if (cdataMatch) return cdataMatch[1].trim();

  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i");
  const match = xml.match(re);
  if (!match) return "";
  // Strip remaining HTML tags
  return match[1].replace(/<[^>]+>/g, "").trim();
}

/** Extract all <item> blocks from RSS XML */
function parseRssItems(xml: string): Array<{
  title: string;
  description: string;
  link: string;
  pubDate: string | null;
}> {
  const items: ReturnType<typeof parseRssItems> = [];
  // Split on <item> boundaries
  const itemBlocks = xml.split(/<item[\s>]/i);
  itemBlocks.shift(); // remove pre-item content

  for (const block of itemBlocks) {
    const endIdx = block.indexOf("</item>");
    const itemXml = endIdx !== -1 ? block.substring(0, endIdx) : block;

    const title = extractTag(itemXml, "title");
    const description = extractTag(itemXml, "description") ||
                        extractTag(itemXml, "content:encoded");
    // Prefer <link> after CDATA, fallback to <guid>
    const linkMatch = itemXml.match(/<link>([^<]+)<\/link>/i) ||
                      itemXml.match(/<guid[^>]*>([^<]+)<\/guid>/i);
    const link = linkMatch ? linkMatch[1].trim() : "";
    const pubDateRaw = extractTag(itemXml, "pubDate") ||
                       extractTag(itemXml, "dc:date") || null;

    if (title && link) {
      items.push({
        title,
        description: description.substring(0, 1000), // cap at 1000 chars
        link,
        pubDate: parsePubDate(pubDateRaw),
      });
    }
  }
  return items;
}

// ── Main handler ─────────────────────────────────────────────

serve(async (req) => {
  // Allow manual trigger via POST with optional { source_id }
  let targetSourceId: string | null = null;
  if (req.method === "POST") {
    try {
      const body = await req.json();
      targetSourceId = body?.source_id ?? null;
    } catch {
      /* ignore parse errors */
    }
  }

  // Load active RSS sources
  let query = supabase
    .from("rss_sources")
    .select("id, name, url, category")
    .eq("is_active", true);

  if (targetSourceId) {
    query = query.eq("id", targetSourceId);
  }

  const { data: sources, error: srcErr } = await query;

  if (srcErr || !sources?.length) {
    return new Response(
      JSON.stringify({ error: srcErr?.message ?? "No active sources found" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const results: Array<{
    source: string;
    fetched: number;
    inserted: number;
    skipped: number;
    errors: string[];
  }> = [];

  for (const source of sources) {
    const result = {
      source: source.name,
      fetched: 0,
      inserted: 0,
      skipped: 0,
      errors: [] as string[],
    };

    try {
      // Fetch RSS feed
      const res = await fetch(source.url, {
        headers: { "User-Agent": "PMIS-DFW-RSS-Scraper/1.0" },
        signal: AbortSignal.timeout(10_000), // 10s timeout
      });

      if (!res.ok) {
        result.errors.push(`HTTP ${res.status}`);
        results.push(result);
        continue;
      }

      const xml = await res.text();
      const items = parseRssItems(xml);
      result.fetched = items.length;

      for (const item of items) {
        // Generate dedup hash from link URL
        const hash = await sha256(item.link);

        // Check if already exists
        const { data: existing } = await supabase
          .from("issues")
          .select("id")
          .eq("source_hash", hash)
          .maybeSingle();

        if (existing) {
          result.skipped++;
          continue;
        }

        // Map RSS category to issue_category enum
        const categoryMap: Record<string, string> = {
          "IUU Fishing": "IUU Fishing",
          "HAM Pekerja": "HAM Pekerja",
          "Lingkungan": "Lingkungan",
          "Perdagangan Manusia": "Perdagangan Manusia",
          "Perburuhan": "Perburuhan",
          "Kebijakan Kelautan": "Kebijakan Kelautan",
          "Ketenagakerjaan": "Ketenagakerjaan",
        };
        const category = categoryMap[source.category] ?? "Lainnya";

        const { error: insertErr } = await supabase.from("issues").insert({
          title: item.title.substring(0, 300),
          description: item.description || null,
          category,
          severity: "medium",          // default; reviewer can adjust
          status: "pending_review",    // must be approved by staff
          source_type: "rss",
          source_link: item.link,
          source_hash: hash,
          date_occurred: item.pubDate,
          date_reported: new Date().toISOString().split("T")[0],
          tags: [source.name, category],
          created_by: "rss-scraper",
        });

        if (insertErr) {
          // Unique constraint violation = already exists via race condition
          if (insertErr.code === "23505") {
            result.skipped++;
          } else {
            result.errors.push(`Insert: ${insertErr.message}`);
          }
        } else {
          result.inserted++;
        }
      }

      // Update last_fetched timestamp
      await supabase
        .from("rss_sources")
        .update({ last_fetched: new Date().toISOString() })
        .eq("id", source.id);

    } catch (err) {
      result.errors.push(String(err));
    }

    results.push(result);
  }

  const totalInserted = results.reduce((a, r) => a + r.inserted, 0);
  const totalSkipped  = results.reduce((a, r) => a + r.skipped, 0);

  return new Response(
    JSON.stringify({
      success: true,
      summary: { total_inserted: totalInserted, total_skipped: totalSkipped },
      results,
      ran_at: new Date().toISOString(),
    }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
});
