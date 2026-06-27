import dataSourceModule from '../config/typeorm.config';
import { seedSubscriptionPlans } from '../seeds/subscription-plan.seed';

async function runSeed() {
  const dataSource = dataSourceModule.getDataSource();

  try {
    await dataSource.initialize();
    console.log('Database connection established');

    console.log('Running subscription plan seed...');
    await seedSubscriptionPlans(dataSource);
    console.log('Seed completed successfully');

    await dataSource.destroy();
    process.exit(0);
  } catch (error) {
    console.error('Error running seed:', error);
    await dataSource.destroy();
    process.exit(1);
  }
}

runSeed();
