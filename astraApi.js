// astraApi.js
// Small wrapper around Astra REST Data API (rows/table-level).
// It uses environment variables ASTRA_DB_ID, ASTRA_DB_REGION, ASTRA_DB_KEYSPACE, ASTRA_DB_TOKEN

const axios = require("axios");

const DB_ID = process.env.ASTRA_DB_ID;
const REGION = process.env.ASTRA_DB_REGION;
const KEYSPACE = process.env.ASTRA_DB_KEYSPACE;
const TOKEN = process.env.ASTRA_DB_TOKEN;

if (!DB_ID || !REGION || !KEYSPACE || !TOKEN) {
  console.warn("⚠️ Astra: missing env vars (ASTRA_DB_ID/ASTRA_DB_REGION/ASTRA_DB_KEYSPACE/ASTRA_DB_TOKEN).");
}

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
  // POST /tables/{table}/rows
  const url = `/tables/${table}/rows`;
  const payload = { columns: Object.entries(row).map(([name, value]) => ({ name, value })) };
  await client.post(url, payload);
  return true;
}

// Fetch a single row by primary key (assumes primary key column and its value are passed in object)
async function getRow(table, pkObj) {
  // The Stargate REST row-get requires primary key path: /tables/{table}/rows/{pk}
  // For composite keys or unknown primary key shape, fallback to a findRows with where
  // We'll try findRows with where filter
  const where = {};
  for (const k of Object.keys(pkObj)) where[k] = { $eq: pkObj[k] };
  const rows = await findRows(table, where);
  return (rows && rows.length) ? rows[0] : null;
}

// Find rows by where filter using the REST search: GET /tables/{table}/rows?where=...
async function findRows(table, whereObj) {
  const whereStr = encodeURIComponent(JSON.stringify(whereObj));
  const url = `/tables/${table}/rows?where=${whereStr}`;
  const r = await client.get(url);
  return r.data && r.data.rows ? r.data.rows.map(r => {
    // each row: { columns: [ { name, value } ] }
    if (r.columns) {
      const obj = {};
      r.columns.forEach(c => (obj[c.name] = c.value));
      return obj;
    }
    return r;
  }) : [];
}

// export
module.exports = {
  insertRow,
  getRow,
  findRows,
  _client: client,
};
