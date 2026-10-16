import { getTableInfo, json, pickColumn, quoteIdentifier } from '../../_lib/auth.js';

function validPaidUntil(value) {
  if (!value) return false;
  const raw = String(value).trim();
  const expiry = Date.parse(/^\d{4}-\d{2}-\d{2}$/.test(raw) ? `${raw}T23:59:59.999Z` : raw);
  return Number.isFinite(expiry) && expiry >= Date.now();
}

export async function onRequestGet({ env }) {
  try {
    const columns = await getTableInfo(env.DB, 'schools');
    const idCol = pickColumn(columns, ['id', 'school_id']);
    const nameCol = pickColumn(columns, ['name', 'school_name', 'title']);
    const slugCol = pickColumn(columns, ['slug', 'code']);
    if (!idCol || !nameCol) return json({ error: 'School schema is not ready.' }, 500);
    const statusCol = pickColumn(columns, ['status']);
    const sql = `SELECT CAST(s.${quoteIdentifier(idCol)} AS TEXT) AS id,
      s.${quoteIdentifier(nameCol)} AS name,
      ${slugCol ? `s.${quoteIdentifier(slugCol)}` : 'NULL'} AS school_code,
      a.status AS access_status, a.paid_until AS paid_until,
      ${statusCol ? `s.${quoteIdentifier(statusCol)}` : 'NULL'} AS school_status
      FROM schools s LEFT JOIN school_access a
      ON a.school_id = CAST(s.${quoteIdentifier(idCol)} AS TEXT)
      ORDER BY s.${quoteIdentifier(nameCol)} COLLATE NOCASE`;
    const result = await env.DB.prepare(sql).all();
    const schools = (result.results || [])
      .filter((row) => String(row.access_status || row.school_status || '').toUpperCase() === 'ACTIVE' && validPaidUntil(row.paid_until))
      .map((row) => ({ id: row.id, name: row.name, school_code: row.school_code || '' }));
    return json({ ok: true, schools });
  } catch (error) {
    console.error('Public school list failed:', error);
    return json({ error: 'Could not load available schools.' }, 500);
  }
}
