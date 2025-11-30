// astraApi.js
const axios = require('axios');

const ASTRA_DB_ID = process.env.ASTRA_DB_ID;
const ASTRA_DB_REGION = process.env.ASTRA_DB_REGION; // e.g. us-east1
const ASTRA_TOKEN = process.env.ASTRA_TOKEN; // application token (AstraCS:... value)
const KEYSPACE = process.env.KEYSPACE || 'snakeks';

if (!ASTRA_DB_ID || !ASTRA_DB_REGION || !ASTRA_TOKEN) {
  console.error('⚠️ Astra Data API env vars missing: ASTRA_DB_ID, ASTRA_DB_REGION, ASTRA_TOKEN');
  // do not exit; caller will see errors when requests happen
}

const BASE = `https://${ASTRA_DB_ID}-${ASTRA_DB_REGION}.apps.astra.datastax.com/api/rest/v2/keyspaces/${KEYSPACE}`;

const client = axios.create({
  baseURL: BASE,
  timeout: 10000,
  headers: {
    Authorization: `Bearer ${ASTRA_TOKEN}`,
    'Content-Type': 'application/json'
  }
});

/**
 * Insert a JSON document into a collection.
 * @param {string} collection
 * @param {object} doc
 */
async function insertDocument(collection, doc) {
  const url = `/collections/${encodeURIComponent(collection)}`;
  const res = await client.post(url, doc);
  return res.data;
}

/**
 * Query collection documents (list).
 * Optionally provide a "where" object to filter on server-side.
 * Note: payload and query param support may vary by Astra version; we use 'where' query string.
 * @param {string} collection
 * @param {object} [opts] { where: {...}, pageSize: number }
 */
async function listDocuments(collection, opts = {}) {
  const url = `/collections/${encodeURIComponent(collection)}`;
  const params = {};
  if (opts.where) params.where = JSON.stringify(opts.where);
  if (opts.pageSize) params['page-size'] = opts.pageSize;
  const res = await client.get(url, { params });
  return res.data;
}

/**
 * Delete documents by id (if collection stores an 'id' field used as _id).
 * Astra collection documents have a generated __id; but we store custom id value in doc.id.
 * For simplicity, we can use the "delete by where" endpoint — not all Astra versions support it; if not, skip.
 */
async function deleteByWhere(collection, where) {
  const url = `/collections/${encodeURIComponent(collection)}/delete`;
  // some Astra releases accept a POST delete with { where: {...} }
  const res = await client.post(url, { where });
  return res.data;
}

module.exports = {
  client,
  insertDocument,
  listDocuments,
  deleteByWhere,
  BASE
};
