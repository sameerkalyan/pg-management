import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bull';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_INTERCEPTOR, APP_GUARD } from '@nestjs/core';
import { HealthModule } from './modules/health/health.module';
import { AuthModule } from './modules/auth/auth.module';
import { AdminModule } from './modules/admin/admin.module';
import { OrganisationsModule } from './modules/organisations/organisations.module';
import { UsersModule } from './modules/users/users.module';
import { PropertiesModule } from './modules/properties/properties.module';
import { RoomsModule } from './modules/rooms/rooms.module';
import { BedsModule } from './modules/beds/beds.module';
import { TenantsModule } from './modules/tenants/tenants.module';
import { InvoicesModule } from './modules/invoices/invoices.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { ComplaintsModule } from './modules/complaints/complaints.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { FilesModule } from './modules/files/files.module';
import { OtpModule } from './modules/otp/otp.module';
import { SmsModule } from './modules/sms/sms.module';
import { JobsModule } from './modules/jobs/jobs.module';
import { SubscriptionsModule } from './modules/subscriptions/subscriptions.module';
import { EmailModule } from './modules/email/email.module';
import { MetricsModule } from './common/metrics/prometheus.module';
import { PdfModule } from './modules/pdf/pdf.module';
import { typeormConfig } from './config/typeorm.config';
import { RedisModule } from './modules/redis/redis.module';
import { Organisation } from './entities/organisation.entity';
import { AuditLog } from './entities/audit-log.entity';
import { OrganisationStatusGuard } from './common/guards/organisation-status.guard';
import { SubscriptionGuard } from './common/guards/subscription.guard';
import { AuditInterceptor } from './common/interceptors/audit.interceptor';
import { Subscription } from './entities/subscription.entity';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: process.env.NODE_ENV === 'test'
        ? ['../.env.test', '.env.local', '.env']
        : ['.env.local', '.env'],
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => typeormConfig(configService),
      inject: [ConfigService],
    }),
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        redis: {
          host: configService.get('REDIS_HOST', 'localhost'),
          port: configService.get('REDIS_PORT', 6379),
          maxRetriesPerRequest: 3,
          retryStrategy: (times: number) => {
            const delay = Math.min(times * 50, 500);
            return delay;
          },
        },
        defaultJobOptions: {
          removeOnComplete: 10,
          removeOnFail: 10,
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 2000,
          },
          timeout: 30000, // 30 seconds job timeout
        },
        settings: {
          stalledInterval: 30000,
          maxStalledCount: 1,
        },
      }),
      inject: [ConfigService],
    }),
    ThrottlerModule.forRoot([
      {
        ttl: 60000,
        limit: 10000,
      },
    ]),
    HealthModule,
    AuthModule,
    AdminModule,
    RedisModule,
    OrganisationsModule,
    UsersModule,
    PropertiesModule,
    RoomsModule,
    BedsModule,
    TenantsModule,
    InvoicesModule,
    PaymentsModule,
    ComplaintsModule,
    DashboardModule,
    FilesModule,
    OtpModule,
    SmsModule,
    JobsModule,
    SubscriptionsModule,
    EmailModule,
    MetricsModule,
    PdfModule,
    TypeOrmModule.forFeature([Organisation, AuditLog, Subscription]),
  ],
  providers: [
    OrganisationStatusGuard,
    SubscriptionGuard,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    {
      provide: APP_GUARD,
      useClass: OrganisationStatusGuard,
    },
    {
      provide: APP_GUARD,
      useClass: SubscriptionGuard,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: AuditInterceptor,
    },
  ],
})
export class AppModule {}
