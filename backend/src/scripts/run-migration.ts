import 'dotenv/config';
import dataSourceModule from '../config/typeorm.config';

async function runMigration() {
  const dataSource = dataSourceModule.getDataSource();

  try {
    await dataSource.initialize();
    console.log('Database connection established');

    console.log('Running all migrations...');
    await dataSource.runMigrations();
    console.log('All migrations completed successfully');

    await dataSource.destroy();
    process.exit(0);
  } catch (error) {
    console.error('Error running migrations:', error);
    await dataSource.destroy();
    process.exit(1);
  }
}

runMigration();
