import { Client } from 'pg';

async function initDatabase() {
  // Connect to PostgreSQL default database (postgres)
  const databaseUser = process.env.DATABASE_USER;
  const databasePassword = process.env.DATABASE_PASSWORD;

  if (!databaseUser || !databasePassword) {
    throw new Error(
      'DATABASE_USER and DATABASE_PASSWORD environment variables must be set before running init-database script',
    );
  }

  const client = new Client({
    host: process.env.DATABASE_HOST || 'localhost',
    port: parseInt(process.env.DATABASE_PORT || '5432'),
    user: databaseUser,
    password: databasePassword,
    database: 'postgres', // Connect to default database first
  });

  try {
    await client.connect();
    console.log('Connected to PostgreSQL');

    // Check if database exists
    const checkDbQuery = `SELECT 1 FROM pg_database WHERE datname = 'pg_management'`;
    const result = await client.query(checkDbQuery);

    if (result.rows.length === 0) {
      // Database doesn't exist, create it
      console.log('Creating pg_management database...');
      await client.query('CREATE DATABASE pg_management');
      console.log('Database created successfully');
    } else {
      console.log('Database pg_management already exists');
    }

    await client.end();
    process.exit(0);
  } catch (error) {
    console.error('Error initializing database:', error);
    await client.end();
    process.exit(1);
  }
}

initDatabase();
