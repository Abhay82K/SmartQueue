require("dotenv").config();
const { Pool } = require("pg");

const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT || 5432,
    // Neon (and most cloud Postgres providers) require SSL.
    // Set DB_SSL=true in your hosting provider's env vars for that.
    ssl: process.env.DB_SSL === "true" ? { rejectUnauthorized: false } : false,
});

module.exports = pool;
