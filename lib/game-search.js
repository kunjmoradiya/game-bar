import { db } from 'hatchable';

const SEARCH_FIELDS = "lower(COALESCE(g.name,'') || ' ' || COALESCE(g.slug,'') || ' ' || COALESCE(g.id::text,'') || ' ' || COALESCE(g.category,'') || ' ' || COALESCE(g.aliases,'') || ' ' || COALESCE(g.tags,'') || ' ' || COALESCE(g.keywords,'') || ' ' || COALESCE(g.description,'') || ' ' || COALESCE(g.developer,'') || ' ' || COALESCE(g.controls,'') || ' ' || COALESCE(g.instructions,'') || ' ' || COALESCE(g.version_label,'') || ' ' || COALESCE(g.engine_id,'') || ' ' || COALESCE(g.runtime_id,'') || ' ' || COALESCE(g.game_type,''))";
function escapeLike(value) {
  return String(value).replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_');
}

export async function searchGames({ query, admin = false, limit = 20, offset = 0, status = '' }) {
  const q = String(query || '').normalize('NFKC').trim().toLowerCase().replace(/\s+/g, ' ');
  if (q.length < 2) return { games: [], total: 0, pageSize: limit, offset, hasMore: false };
  const safeLimit = Math.max(1, Math.min(Number(limit) || 20, 50));
  const safeOffset = Math.max(0, Math.min(Number(offset) || 0, 100000));
  const pattern = '%' + escapeLike(q) + '%';
  const visibility = admin ? 'TRUE' : "g.status = 'published'";
  const statusFilter = admin && status ? ' AND g.status = $5' : '';
  const params = admin
    ? (status ? [q, pattern, safeLimit, safeOffset, status] : [q, pattern, safeLimit, safeOffset])
    : [q, pattern, safeLimit, safeOffset];
  const sql = `
    SELECT g.id, g.slug, g.name, g.category, g.description, g.status,
           g.cover_emoji, g.developer, g.aliases, g.tags, g.keywords, g.version_label, g.engine_id, g.runtime_id, g.game_type,
           g.created_at, g.updated_at,
           (SELECT a.asset_path FROM game_assets a
             WHERE a.game_id=g.id AND split_part(a.asset_path,'/',1)='__thumbnail__'
               AND split_part(a.asset_path,'/',2) LIKE 'cover.%'
             ORDER BY a.created_at DESC LIMIT 1) AS thumbnail_path,
           COUNT(*) OVER()::int AS total_count,
           CASE
             WHEN lower(g.name) = $1 THEN 1
             WHEN left(lower(g.name), length($1)) = $1 THEN 2
             WHEN strpos(' ' || lower(g.name), ' ' || $1) > 0 THEN 3
             WHEN strpos(lower(g.name), $1) > 0 THEN 4
             WHEN strpos(lower(g.aliases), $1) > 0 THEN 5
             WHEN strpos(lower(g.slug), $1) > 0 OR strpos(lower(g.id::text), $1) > 0 THEN 6
             WHEN strpos(lower(g.category), $1) > 0 OR strpos(lower(g.engine_id), $1) > 0 OR strpos(lower(g.game_type), $1) > 0 THEN 7
             WHEN strpos(lower(concat_ws(' ',g.tags,g.keywords,g.developer,g.description,g.controls,g.instructions,g.version_label)), $1) > 0 THEN 8
             ELSE 8
           END AS relevance
      FROM games g
     WHERE ${visibility}
       AND ${SEARCH_FIELDS} LIKE $2 ESCAPE E'\\\\'
       ${statusFilter}
     ORDER BY relevance ASC, g.name ASC, g.id ASC
     LIMIT $3 OFFSET $4`;
  const { rows } = await db.query(sql, params);
  const total = rows.length ? rows[0].total_count : 0;
  const games = rows.map(g => {
    const item = { ...g };
    delete item.total_count;
    delete item.relevance;
    item.thumbnail_url = item.thumbnail_path ? '/api/game-assets/' + encodeURIComponent(item.slug) + '?path=' + encodeURIComponent(item.thumbnail_path) : null;
    delete item.thumbnail_path;
    return item;
  });
  return { games, total, pageSize: safeLimit, offset: safeOffset, hasMore: safeOffset + games.length < total };
}