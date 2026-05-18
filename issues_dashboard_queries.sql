-- ============================================================
-- DASHBOARD QUERIES - Issues Module
-- PMIS DFW Indonesia
-- ============================================================

-- ──────────────────────────────────────────────────────────────
-- Q1. TIMELINE ISU
-- Gabungkan issues + issue_updates, filter contoh:
-- "IUU Fishing di Kepulauan Aru Jan 2024 - Sep 2025"
-- ──────────────────────────────────────────────────────────────
WITH issue_timeline AS (
  -- Baris awal: isu itu sendiri (event = 'created')
  SELECT
    i.id                         AS issue_id,
    i.title,
    i.category::text,
    i.severity::text,
    i.status::text,
    i.province,
    i.location_name,
    'created'                    AS event_type,
    i.description                AS event_text,
    i.created_at                 AS event_at,
    i.created_by                 AS actor,
    ARRAY[]::text[]              AS evidence_urls
  FROM issues i

  UNION ALL

  -- Baris update: tiap entri issue_updates
  SELECT
    iu.issue_id,
    i.title,
    i.category::text,
    i.severity::text,
    i.status::text,
    i.province,
    i.location_name,
    'update'                     AS event_type,
    iu.update_text               AS event_text,
    iu.updated_at                AS event_at,
    iu.updated_by                AS actor,
    iu.evidence_urls
  FROM issue_updates iu
  JOIN issues i ON i.id = iu.issue_id
)
SELECT *
FROM issue_timeline
WHERE
  -- Filter category
  category = 'IUU Fishing'
  -- Filter lokasi (contoh: Kepulauan Aru)
  AND location_name ILIKE '%Kepulauan Aru%'
  -- Filter rentang tanggal Jan 2024 - Sep 2025
  AND event_at BETWEEN '2024-01-01' AND '2025-09-30'
ORDER BY event_at DESC;


-- ──────────────────────────────────────────────────────────────
-- Q2. TOP 5 ISU AKTIF PER PROVINSI
-- ──────────────────────────────────────────────────────────────
WITH ranked AS (
  SELECT
    i.province,
    i.id,
    i.title,
    i.category::text,
    i.severity::text,
    i.status::text,
    i.date_occurred,
    COUNT(iu.id)                      AS update_count,
    MAX(iu.updated_at)                AS last_update_at,
    ROW_NUMBER() OVER (
      PARTITION BY i.province
      ORDER BY
        CASE i.severity
          WHEN 'critical' THEN 1
          WHEN 'high'     THEN 2
          WHEN 'medium'   THEN 3
          ELSE 4
        END,
        i.created_at DESC
    ) AS rn
  FROM issues i
  LEFT JOIN issue_updates iu ON iu.issue_id = i.id
  WHERE i.status IN ('active', 'under_investigation', 'pending_review')
  GROUP BY i.id
)
SELECT province, id, title, category, severity, status,
       date_occurred, update_count, last_update_at
FROM ranked
WHERE rn <= 5
ORDER BY province, rn;


-- ──────────────────────────────────────────────────────────────
-- Q3. ISU CRITICAL BELUM DI-UPDATE > 14 HARI
-- ──────────────────────────────────────────────────────────────
SELECT
  i.id,
  i.title,
  i.category::text,
  i.severity::text,
  i.status::text,
  i.province,
  i.location_name,
  i.created_by,
  i.created_at,
  MAX(iu.updated_at)    AS last_update_at,
  EXTRACT(DAY FROM now() - COALESCE(MAX(iu.updated_at), i.created_at))::int
                        AS days_stale
FROM issues i
LEFT JOIN issue_updates iu ON iu.issue_id = i.id
WHERE
  i.severity = 'critical'
  AND i.status NOT IN ('resolved', 'closed', 'rejected')
GROUP BY i.id
HAVING
  EXTRACT(DAY FROM now() - COALESCE(MAX(iu.updated_at), i.created_at)) > 14
ORDER BY days_stale DESC;


-- ──────────────────────────────────────────────────────────────
-- Q4. FILTER BERDASARKAN TAGS DAN CATEGORY
-- (Gunakan parameter $1 = category, $2 = tag contoh)
-- ──────────────────────────────────────────────────────────────
SELECT
  i.id,
  i.title,
  i.category::text,
  i.severity::text,
  i.status::text,
  i.province,
  i.tags,
  i.date_occurred,
  COUNT(iu.id)::int AS update_count
FROM issues i
LEFT JOIN issue_updates iu ON iu.issue_id = i.id
WHERE
  -- Filter category (kosongkan untuk semua)
  ($1::text IS NULL OR i.category::text = $1)
  -- Filter tag (GIN index dipakai di sini)
  AND ($2::text IS NULL OR i.tags @> ARRAY[$2::text])
GROUP BY i.id
ORDER BY i.created_at DESC
LIMIT 100;


-- ──────────────────────────────────────────────────────────────
-- Q5. STAT CARDS untuk Dashboard
-- ──────────────────────────────────────────────────────────────
SELECT
  COUNT(*)                                              AS total_issues,
  COUNT(*) FILTER (WHERE status = 'pending_review')     AS pending_review,
  COUNT(*) FILTER (WHERE status = 'active')             AS active,
  COUNT(*) FILTER (WHERE severity = 'critical'
                   AND status NOT IN ('resolved','closed','rejected')) AS critical_open,
  COUNT(*) FILTER (WHERE status = 'resolved')           AS resolved,
  COUNT(*) FILTER (WHERE
    EXTRACT(DAY FROM now() - updated_at) > 14
    AND severity = 'critical'
    AND status NOT IN ('resolved','closed','rejected')
  )                                                     AS critical_stale
FROM issues;
