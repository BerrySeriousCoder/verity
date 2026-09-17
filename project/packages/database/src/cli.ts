import { Pool, databaseUrl, migrate } from './index.js';

const pool = new Pool({ connectionString: databaseUrl() });
try {
  await migrate(pool);
  console.info('Database migrations applied.');
} finally {
  await pool.end();
}
