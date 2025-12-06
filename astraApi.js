// astraApi.js
// Small wrapper around Astra REST Data API (rows/table-level).
// It uses environment variables ASTRA_DB_ID, ASTRA_DB_REGION, ASTRA_DB_KEYSPACE, ASTRA_DB_TOKEN
// astraApi.js
// Small wrapper around Astra REST Data API (rows/table-level).
// It uses environment variables ASTRA_DB_ID, ASTRA_DB_REGION, ASTRA_DB_KEYSPACE, ASTRA_DB_TOKEN

const axios = require("axios");

const DB_ID    = process.env.ASTRA_DB_ID;
const REGION  = process.env.ASTRA_DB_REGION;
const KEYSPACE = process.env.ASTRA_DB_KEYSPACE;
const TOKEN    = process.env.ASTRA_DB_TOKEN;

if (!DB_ID || !REGION || !KEYSPACE || !TOKEN) {
  console.warn(
    "⚠️ Astra: missing env vars (ASTRA_DB_ID / ASTRA_DB_REGION / ASTRA_DB_KEYSPACE / ASTRA_DB_TOKEN)."
  );
}

// Correct REST v2 base URL (no /tables here)
const BASE = `https://${DB_ID}-${REGION}.apps.astra.datastax.com/api/rest/v2/keyspaces/${KEYSPACE}`;

const client = axios.create({
  baseURL: BASE,
  headers: {
    "Content-Type": "application/json",
    "x-cassandra-token": TOKEN,
  },
  timeout: 10000,
});

// Insert a single row into a table
async function insertRow(table, row) {
  // Correct path: /{table}/rows
  const url = `/${table}/rows`;
  const payload = {
    columns: Object.entries(row).map(([name, value]) => ({ name, value })),
  };

  await client.post(url, payload);
  return true;
}

// Fetch a single row by "where" (email, id, etc.)
async function findRows(table, whereObj) {
  const whereStr = encodeURIComponent(JSON.stringify(whereObj));
  // Correct path: /{table}/rows?where=...
  const url = `/${table}/rows?where=${whereStr}`;

  const r = await client.get(url);

  return r.data && r.data.rows
    ? r.data.rows.map((row) => {
        // each row: { columns: [ { name, value } ] }
        if (row.columns) {
          const obj = {};
          row.columns.forEach((c) => {
            obj[c.name] = c.value;
          });
          return obj;
        }
        return row;
      })
    : [];
}

// Convenience: get a single row using a PK or unique field(s)
async function getRow(table, pkObj) {
  const where = {};
  for (const key of Object.keys(pkObj)) {
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
