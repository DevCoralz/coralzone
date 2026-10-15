// MySQL connection pool shared by every /api/auth/* function.
//
// Vercel recycles serverless instances but can also reuse a "warm" one
// between invocations — caching the pool on `globalThis` means a warm
// instance reuses its existing connections instead of opening new ones on
// every request, which is what keeps a serverless app from exhausting the
// database's max_connections under load.
import mysql from "mysql2/promise";

// DATABASE_URL is accepted either as a plain mysql:// URL or as the
// jdbc:mysql://... form (what most DB dashboards hand you by default) —
// we just strip the "jdbc:" prefix, since the remainder is already a
// standard URL. Example:
//   jdbc:mysql://user:pass@host:3306/dbname
//   -> mysql://user:pass@host:3306/dbname
function parseDatabaseUrl(raw) {
  if (!raw) {
    throw new Error(
      "DATABASE_URL is not set. Add it in Vercel → Project → Settings → Environment Variables.",
    );
  }
  const withoutJdbcPrefix = raw.startsWith("jdbc:") ? raw.slice("jdbc:".length) : raw;
  const url = new URL(withoutJdbcPrefix);

  if (!/^mysql:$/.test(url.protocol)) {
    throw new Error(`DATABASE_URL must use the mysql:// scheme, got "${url.protocol}"`);
  }

  // url.username/url.password are percent-encoded by the URL parser —
  // decode so special characters in the password (@, =, ! etc.) survive.
  return {
    host: url.hostname,
    port: url.port ? Number(url.port) : 3306,
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: decodeURIComponent(url.pathname.replace(/^\//, "")),
  };
}

function createPool() {
  const credentials = parseDatabaseUrl(process.env.DATABASE_URL);
  return mysql.createPool({
    ...credentials,
    waitForConnections: true,
    connectionLimit: 5,
    maxIdle: 5,
    idleTimeout: 60_000,
    enableKeepAlive: true,
    namedPlaceholders: false,
    dateStrings: false,
    decimalNumbers: true,
    // Most managed/VPS MySQL instances on a bare IP don't terminate TLS.
    // Set DATABASE_SSL=true in env if your host requires it.
    ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : undefined,
  });
}

const globalForDb = globalThis;

export function getPool() {
  if (!globalForDb.__coralzoneMysqlPool) {
    globalForDb.__coralzoneMysqlPool = createPool();
  }
  return globalForDb.__coralzoneMysqlPool;
}

// Every query in this codebase MUST go through this helper (or getPool()
// directly) using `?` placeholders — never string-concatenate user input
// into SQL. mysql2 sends the SQL text and the parameter values to the
// server as two separate things, so a value can never be interpreted as
// SQL syntax no matter what characters it contains. That's what actually
// stops SQL injection; see api/_lib/validate.js for the input-shape
// checks that run before a value ever reaches here.
export async function query(sql, params = []) {
  const pool = getPool();
  const [rows] = await pool.query(sql, params);
  return rows;
}

export async function withTransaction(fn) {
  const pool = getPool();
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}
