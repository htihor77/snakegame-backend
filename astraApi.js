// // astraApi.js
// const axios = require('axios');

// const ASTRA_DB_ID = process.env.ASTRA_DB_ID;
// const ASTRA_DB_REGION = process.env.ASTRA_DB_REGION; // e.g. us-east1
// const ASTRA_TOKEN = process.env.ASTRA_TOKEN; // application token (AstraCS:... value)
// const KEYSPACE = process.env.KEYSPACE || 'snakeks';

// if (!ASTRA_DB_ID || !ASTRA_DB_REGION || !ASTRA_TOKEN) {
//   console.error('⚠️ Astra Data API env vars missing: ASTRA_DB_ID, ASTRA_DB_REGION, ASTRA_TOKEN');
//   // do not exit; caller will see errors when requests happen
// }

// const BASE = `https://${ASTRA_DB_ID}-${ASTRA_DB_REGION}.apps.astra.datastax.com/api/rest/v2/keyspaces/${KEYSPACE}`;

// const client = axios.create({
//   baseURL: BASE,
//   timeout: 10000,
//   headers: {
//     Authorization: `Bearer ${ASTRA_TOKEN}`,
//     'Content-Type': 'application/json'
//   }
// });

// /**
//  * Insert a JSON document into a collection.
//  * @param {string} collection
//  * @param {object} doc
//  */
// async function insertDocument(collection, doc) {
//   const url = `/collections/${encodeURIComponent(collection)}`;
//   const res = await client.post(url, doc);
//   return res.data;
// }

// /**
//  * Query collection documents (list).
//  * Optionally provide a "where" object to filter on server-side.
//  * Note: payload and query param support may vary by Astra version; we use 'where' query string.
//  * @param {string} collection
//  * @param {object} [opts] { where: {...}, pageSize: number }
//  */
// async function listDocuments(collection, opts = {}) {
//   const url = `/collections/${encodeURIComponent(collection)}`;
//   const params = {};
//   if (opts.where) params.where = JSON.stringify(opts.where);
//   if (opts.pageSize) params['page-size'] = opts.pageSize;
//   const res = await client.get(url, { params });
//   return res.data;
// }

// /**
//  * Delete documents by id (if collection stores an 'id' field used as _id).
//  * Astra collection documents have a generated __id; but we store custom id value in doc.id.
//  * For simplicity, we can use the "delete by where" endpoint — not all Astra versions support it; if not, skip.
//  */
// async function deleteByWhere(collection, where) {
//   const url = `/collections/${encodeURIComponent(collection)}/delete`;
//   // some Astra releases accept a POST delete with { where: {...} }
//   const res = await client.post(url, { where });
//   return res.data;
// }

// module.exports = {
//   client,
//   insertDocument,
//   listDocuments,
//   deleteByWhere,
//   BASE
// };

// astraApi.js
// Wrapper around Astra Data API - using the official SDK snippet shown in portal
const { DataAPIClient } = require("@datastax/astra-db-ts");

let dbClient = null;

/**
 * Initialize client (call once in serverless cold start).
 * Uses environment variables:
 *  - ASTRA_TOKEN        (the application token you generated, e.g. "AstraCS:....")
 *  - ASTRA_DB_ID_URL    (the full DB URL e.g. https://<id>-<region>.apps.astra.datastax.com)
 *  - ASTRA_KEYSPACE     (your keyspace name)
 */
function initAstra() {
  if (dbClient) return dbClient;

  const token = process.env.ASTRA_TOKEN;
  const dbUrl = process.env.ASTRA_DB_ID_URL; // example: https://6af12d37-bdef-...-us-east1.apps.astra.datastax.com
  const keyspace = process.env.ASTRA_KEYSPACE;

  if (!token || !dbUrl || !keyspace) {
    throw new Error("Missing ASTRA_TOKEN, ASTRA_DB_ID_URL or ASTRA_KEYSPACE env vars");
  }

  const client = new DataAPIClient(token);
  dbClient = client.db(dbUrl, { keyspace });
  return dbClient;
}

/**
 * NOTE:
 * The Astra SDK provides both Data (document) and Admin endpoints.
 * We'll use the Data REST endpoints to store JSON documents in collections:
 *  - "users" collection
 *  - "scores" collection
 *
 * We implement simple helpers to:
 *  - create collections if needed
 *  - add and query documents
 *
 * If your original setup uses CQL tables, you can keep that approach,
 * but the document API is simpler to run from serverless environments.
 */

/** Ensure a collection exists (document model). */
async function ensureCollection(collectionName) {
  const db = initAstra();
  try {
    // listCollections will succeed if the provider supports it
    const cols = await db.listCollections();
    const found = cols.data?.find(c => c.name === collectionName);
    if (!found) {
      await db.createCollection(collectionName);
    }
  } catch (err) {
    // If SDK doesn't have listCollections/createCollection on older SDKs,
    // we ignore here — create on first write will still work for many setups.
    // If you see errors, paste them here and I will adapt.
    // console.warn('ensureCollection warning', err);
  }
}

/** Insert a user doc */
async function insertUser(userObj) {
  const db = initAstra();
  await ensureCollection("users");
  // Use data API: create a document in collection "users"
  // SDK method is `db.collection('users').create({...})` or `db.createDocument`
  // Implementation depends on SDK version; try common method patterns and fallback.
  try {
    // attempt SDK v1-style (document API)
    if (db.collection) {
      return await db.collection("users").create(userObj);
    }
    // fallback generic request (some SDKs expose `createDocument`)
    if (db.createDocument) {
      return await db.createDocument("users", userObj);
    }
    // Last resort - call the Data API via SDK's low-level request
    return await db.request("POST", `/collections/users`, { body: userObj });
  } catch (err) {
    throw err;
  }
}

/** Find first user by email */
async function findUserByEmail(email) {
  const db = initAstra();
  await ensureCollection("users");
  try {
    if (db.collection) {
      const res = await db.collection("users").find({ filter: { email } });
      // different SDKs return shape differently
      if (Array.isArray(res)) return res[0] || null;
      if (res.data) return (res.data.length ? res.data[0] : null);
      return (res.documents && res.documents[0]) || null;
    }
    // fallback to list all and filter (less efficient)
    if (db.findDocuments) {
      const docs = await db.findDocuments("users", { filter: { email } });
      return docs && docs[0];
    }
    // fallback to request
    const raw = await db.request("GET", `/collections/users?filter={"email":"${email}"}`);
    if (raw && raw.data && raw.data.length) return raw.data[0];
    return null;
  } catch (err) {
    throw err;
  }
}

/** Insert score record */
async function insertScoreDoc(scoreObj) {
  const db = initAstra();
  await ensureCollection("scores");
  try {
    if (db.collection) {
      return await db.collection("scores").create(scoreObj);
    }
    if (db.createDocument) {
      return await db.createDocument("scores", scoreObj);
    }
    return await db.request("POST", `/collections/scores`, { body: scoreObj });
  } catch (err) {
    throw err;
  }
}

/** Get scores by level (returns array) */
async function getScoresByLevel(level) {
  const db = initAstra();
  await ensureCollection("scores");
  try {
    if (db.collection) {
      // find with filter by level, then return .data or raw array
      const res = await db.collection("scores").find({ filter: { level } });
      if (res?.data) return res.data;
      if (Array.isArray(res)) return res;
      if (res.documents) return res.documents;
    }
    // fallback - list all and filter
    const raw = await db.request("GET", `/collections/scores`);
    if (raw?.data) return raw.data.filter(d => d.level === level);
    return [];
  } catch (err) {
    throw err;
  }
}

module.exports = {
  initAstra,
  ensureCollection,
  insertUser,
  findUserByEmail,
  insertScoreDoc,
  getScoresByLevel
};

