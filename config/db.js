// backend/config/db.js
import pg from 'pg';
import 'dotenv/config';

const { Pool } = pg;

// Create a new pool instance. It automatically uses the PG*
// environment variables from your .env file.
const pool = new Pool();

// Export the pool as the default export for this module.
export default pool;