const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: "postgresql://neondb_owner:npg_MR0EP6SmrxiW@ep-rough-snow-acmavzzb.sa-east-1.aws.neon.tech/neondb?sslmode=require",
});

module.exports = pool;

