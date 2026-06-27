import { DataSource } from 'typeorm';
import { SubscriptionPlan } from '../entities/subscription-plan.entity';

export async function seedSubscriptionPlans(dataSource: DataSource) {
  const planRepository = dataSource.getRepository(SubscriptionPlan);

  const plans = [
    {
      id: 'BASIC_MONTHLY',
      name: 'Basic Monthly',
      description:
        'Manage unlimited properties, unlimited tenants, invoice generation, payment tracking, complaint management, dashboard analytics, email support, mobile access',
      amountPaise: 500000, // ₹5,000 in paise
      durationMonths: 1,
      isActive: true,
    },
    {
      id: 'BASIC_YEARLY',
      name: 'Basic Yearly',
      description:
        'All Basic features with 2 months free. Manage unlimited properties, unlimited tenants, invoice generation, payment tracking, complaint management, dashboard analytics, email support, mobile access',
      amountPaise: 5000000, // ₹50,000 in paise (10 months price for 12 months)
      durationMonths: 12,
      isActive: true,
    },
    {
      id: 'PRO_MONTHLY',
      name: 'Pro Monthly',
      description:
        'All Basic features plus priority support, advanced analytics, custom reports, bulk operations, API access, multi-user management, automated reminders',
      amountPaise: 1000000, // ₹10,000 in paise
      durationMonths: 1,
      isActive: true,
    },
    {
      id: 'PRO_YEARLY',
      name: 'Pro Yearly',
      description:
        'All Pro features with 2 months free. Priority support, advanced analytics, custom reports, bulk operations, API access, multi-user management, automated reminders',
      amountPaise: 10000000, // ₹100,000 in paise (10 months price for 12 months)
      durationMonths: 12,
      isActive: true,
    },
  ];

  let seededCount = 0;
  let skippedCount = 0;

  for (const planData of plans) {
    const existingPlan = await planRepository.findOne({
      where: { id: planData.id },
    });

    if (existingPlan) {
      console.log(`Plan ${planData.id} already exists, skipping`);
      skippedCount++;
      continue;
    }

    const plan = planRepository.create(planData);
    await planRepository.save(plan);
    console.log(`Plan ${planData.id} seeded successfully`);
    seededCount++;
  }

  console.log(
    `Subscription plan seeding complete: ${seededCount} added, ${skippedCount} skipped`,
  );
}
