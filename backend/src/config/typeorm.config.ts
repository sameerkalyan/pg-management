import { ConfigService } from '@nestjs/config';
import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { DataSource, DataSourceOptions } from 'typeorm';
import { MultiTenancySubscriber } from '../common/subscribers/multi-tenancy.subscriber';
import { User } from '../entities/user.entity';
import { Organisation } from '../entities/organisation.entity';
import { Property } from '../entities/property.entity';
import { Room } from '../entities/room.entity';
import { Bed } from '../entities/bed.entity';
import { Tenant } from '../entities/tenant.entity';
import { Invoice } from '../entities/invoice.entity';
import { Payment } from '../entities/payment.entity';
import { Complaint } from '../entities/complaint.entity';
import { Subscription } from '../entities/subscription.entity';
import { SubscriptionPlan } from '../entities/subscription-plan.entity';
import { AuditLog } from '../entities/audit-log.entity';
import { FileEntity } from '../entities/file.entity';
import { EmailLog } from '../entities/email-log.entity';

const entities = [
  User,
  Organisation,
  Property,
  Room,
  Bed,
  Tenant,
  Invoice,
  Payment,
  Complaint,
  Subscription,
  SubscriptionPlan,
  AuditLog,
  FileEntity,
  EmailLog,
];

export const typeormConfig = (configService: ConfigService): TypeOrmModuleOptions => {
  const username = configService.get('DATABASE_USER');
  const password = configService.get('DATABASE_PASSWORD');

  if (!username || !password) {
    throw new Error('DATABASE_USER and DATABASE_PASSWORD must be set');
  }

  return {
    type: 'postgres',
    host: configService.get('DATABASE_HOST', 'localhost'),
    port: configService.get('DATABASE_PORT', 5432),
    username,
    password,
    database: configService.get('DATABASE_NAME', 'pg_management'),
    entities,
    migrations: [__dirname + '/../migrations/*{.ts,.js}'],
    synchronize: false,
    logging: configService.get('NODE_ENV') === 'development',
    ssl:
      configService.get('NODE_ENV') === 'production'
        ? {
            rejectUnauthorized: true,
            ca: configService.get('DATABASE_CA_CERT'),
          }
        : false,
    subscribers: [MultiTenancySubscriber],
    extra: {
      max: parseInt(configService.get('DATABASE_POOL_MAX', '20'), 10),
      min: parseInt(configService.get('DATABASE_POOL_MIN', '5'), 10),
      acquireTimeoutMillis: parseInt(
        configService.get('DATABASE_POOL_ACQUIRE_TIMEOUT', '30000'),
        10,
      ),
      idleTimeoutMillis: parseInt(configService.get('DATABASE_POOL_IDLE_TIMEOUT', '10000'), 10),
    },
  };
};

export const dataSourceOptions: DataSourceOptions = {
  type: 'postgres',
  host: process.env.DATABASE_HOST || 'localhost',
  port: parseInt(process.env.DATABASE_PORT || '5432'),
  username: process.env.DATABASE_USER,
  password: process.env.DATABASE_PASSWORD,
  database: process.env.DATABASE_NAME || 'pg_management',
  entities,
  migrations: [__dirname + '/../migrations/*{.ts,.js}'],
  synchronize: false,
  logging: false,
  subscribers: [MultiTenancySubscriber],
  ssl:
    process.env.NODE_ENV === 'production'
      ? {
          rejectUnauthorized: true,
          ca: process.env.DATABASE_CA_CERT,
        }
      : false,
};

// Validate only when DataSource is actually used (migrations), not at import time
function getDataSource(): DataSource {
  const opts = dataSourceOptions as any;
  if (!opts.username || !opts.password) {
    throw new Error('DATABASE_USER and DATABASE_PASSWORD must be set for migrations');
  }
  return new DataSource(dataSourceOptions);
}

export default { getDataSource };
