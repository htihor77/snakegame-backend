// astraApi.js
// Wrapper around Astra REST v2 Data API (keyspaces/{KEYSPACE}/{TABLE}).
// Uses env: ASTRA_DB_ID, ASTRA_DB_REGION, ASTRA_DB_KEYSPACE, ASTRA_DB_TOKEN

const axios = require("axios");

const DB_ID    = process.env.ASTRA_DB_ID;
const REGION   = process.env.ASTRA_DB_REGION;
const KEYSPACE = process.env.ASTRA_DB_KEYSPACE;
const TOKEN    = process.env.ASTRA_DB_TOKEN;

if (!DB_ID || !REGION || !KEYSPACE || !TOKEN) {
  console.warn(
    "⚠️ Astra: missing env vars (ASTRA_DB_ID / ASTRA_DB_REGION / ASTRA_DB_KEYSPACE / ASTRA_DB_TOKEN)."
  );
}

// Correct REST v2 base URL:
//   https://<DB_ID>-<REGION>.apps.astra.datastax.com/api/rest/v2/keyspaces/<KEYSPACE>
const BASE = `https://${DB_ID}-${REGION}.apps.astra.datastax.com/api/rest/v2/keyspaces/${KEYSPACE}`;

const client = axios.create({
  baseURL: BASE,
  headers: {
    "Content-Type": "application/json",
    // header name is case-insensitive, but this matches docs:
    "X-Cassandra-Token": TOKEN,
  },
  timeout: 10000,
});

/**
 * Insert a single row into a table.
 *
 * ✅ Correct REST v2 pattern:
 *   POST /api/rest/v2/keyspaces/<KEYSPACE>/<TABLE>
 *   body = { email: "...", password: "...", name: "...", created_at: "..." }
 *
 * ❌ NOT /<TABLE>/rows
 */
async function insertRow(table, row) {
  const url = `/${table}`;           // <-- no /rows
  // row is already a plain object { col1: val1, ... }
  await client.post(url, row);
  return true;
}

/**
 * Find rows using the ?where= filter.
 *
 * REST v2 GET example:
 *   GET /keyspaces/<KEYSPACE>/<TABLE>/rows?where={"email":{"$eq":"..."}}
 *
 * Response shape:
 *   { "count": 1, "data": [ { ...rowObject... } ] }
 */
async function findRows(table, whereObj) {
  const whereStr = encodeURIComponent(JSON.stringify(whereObj));
  const url = `/${table}/rows?where=${whereStr}`;

  const r = await client.get(url);

  // Astra REST v2 returns { count: N, data: [ rowObj, ... ] }
  if (r.data && Array.isArray(r.data.data)) {
    return r.data.data;
  }
  return [];
}

/**
 * Convenience: get a single row using a unique field(s)
 * e.g. getRow("users", { email: "x@y.com" })
 */
async function getRow(table, pkObj) {
  const where = {};
  for (const key of Object.keys(pkObj)) {
    // keep your $eq style, Astra supports it in where filters
    where[key] = { $eq: pkObj[key] };
  }

  const rows = await findRows(table, where);
  return rows && rows.length ? rows[0] : null;
}

module.exports = {
  insertRow,
  getRow,
  findRows,
  _client: client,
};
