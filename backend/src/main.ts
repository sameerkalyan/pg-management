import { NestFactory, Reflector } from '@nestjs/core';
import { ValidationPipe, Logger, ClassSerializerInterceptor } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import helmet from 'helmet';
import * as compression from 'compression';
import * as cookieParser from 'cookie-parser';
import * as Sentry from '@sentry/node';
import { AppModule } from './app.module';
import { LoggerService } from './common/logger/logger.service';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { ResponseTimeMiddleware } from './common/middleware/response-time.middleware';
import { RequestIdMiddleware } from './common/middleware/request-id.middleware';
import { AuditInterceptor } from './common/interceptors/audit.interceptor';
import * as express from 'express';

async function bootstrap() {
  // Validate required environment variables
  const requiredEnvVars = [
    'DATABASE_HOST',
    'DATABASE_PASSWORD',
    'JWT_SECRET',
    'JWT_REFRESH_SECRET',
    'RAZORPAY_KEY_ID',
    'RAZORPAY_KEY_SECRET',
    'REDIS_HOST',
  ];

  const missingEnvVars = requiredEnvVars.filter((envVar) => !process.env[envVar]);
  if (missingEnvVars.length > 0) {
    throw new Error(`Missing required environment variables: ${missingEnvVars.join(', ')}`);
  }

  // Validate RAZORPAY_WEBHOOK_SECRET is set
  if (!process.env.RAZORPAY_WEBHOOK_SECRET) {
    throw new Error('Missing required environment variable: RAZORPAY_WEBHOOK_SECRET');
  }

  // Validate CORS origin in production
  const corsOrigin = process.env.CORS_ORIGIN || 'http://localhost:5173';
  if (process.env.NODE_ENV === 'production' && (!corsOrigin || corsOrigin === '*')) {
    throw new Error('CORS_ORIGIN must be explicitly set in production');
  }

  // Initialize Sentry
  if (process.env.SENTRY_DSN) {
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      environment: process.env.NODE_ENV || 'development',
      tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
      profilesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
    });
  } else if (process.env.NODE_ENV === 'production') {
    const bootstrapLogger = new Logger('Bootstrap');
    bootstrapLogger.warn(
      'SENTRY_DSN is not set in production. Error tracking is disabled. Configure Sentry to enable production error monitoring.',
    );
  }

  const app = await NestFactory.create(AppModule, {
    logger: new LoggerService(),
  });

  app.enableCors({
    origin: corsOrigin,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-mfa-code'],
  });

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'"],
          scriptSrc: ["'self'"],
          imgSrc: ["'self'", 'data:', 'https:'],
          connectSrc: ["'self'"],
          fontSrc: ["'self'"],
          objectSrc: ["'none'"],
          mediaSrc: ["'self'"],
          frameSrc: ["'none'"],
        },
      },
      crossOriginEmbedderPolicy: false, // Allow embedding for SPA compatibility
      crossOriginOpenerPolicy: { policy: 'same-origin' },
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      dnsPrefetchControl: { allow: false },
      frameguard: { action: 'deny' },
      hidePoweredBy: true,
      hsts:
        process.env.NODE_ENV === 'production'
          ? { maxAge: 31536000, includeSubDomains: true, preload: true }
          : false,
      ieNoOpen: true,
      noSniff: true,
      originAgentCluster: true,
      permittedCrossDomainPolicies: { permittedPolicies: 'none' },
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
      xssFilter: true,
    }),
  );

  app.use(compression());
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ limit: '1mb', extended: true }));
  app.use(cookieParser());

  // Protect metrics endpoint from unauthorized access
  app.use('/metrics', (req, res, next) => {
    const metricsToken = req.headers['x-metrics-token'];
    const expectedToken = process.env.METRICS_TOKEN;
    if (!expectedToken || metricsToken !== expectedToken) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    next();
  });

  // Request timeout middleware (30 seconds max)
  app.use((req, res, next) => {
    res.setTimeout(30000, () => {
      res.status(408).json({ message: 'Request timeout' });
    });
    next();
  });
  const responseTimeMiddleware = new ResponseTimeMiddleware();
  app.use(responseTimeMiddleware.use.bind(responseTimeMiddleware));
  const requestIdMiddleware = new RequestIdMiddleware();
  app.use(requestIdMiddleware.use.bind(requestIdMiddleware));

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.useGlobalInterceptors(new ClassSerializerInterceptor(app.get(Reflector)));

  app.useGlobalFilters(new HttpExceptionFilter());

  const config = new DocumentBuilder()
    .setTitle('PG Management API')
    .setDescription('PG/Hostel Management SaaS API Documentation')
    .setVersion('1.0')
    .addBearerAuth()
    .addTag('auth', 'Authentication endpoints')
    .addTag('organisations', 'Organisation management')
    .addTag('users', 'User management')
    .addTag('properties', 'Property management')
    .addTag('rooms', 'Room management')
    .addTag('beds', 'Bed management')
    .addTag('tenants', 'Tenant management')
    .addTag('invoices', 'Invoice management')
    .addTag('payments', 'Payment processing')
    .addTag('complaints', 'Complaint management')
    .addTag('dashboard', 'Dashboard analytics')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  if (process.env.NODE_ENV !== 'production') {
    SwaggerModule.setup('api/docs', app, document);
  }

  // Graceful shutdown handler
  const logger = new Logger('Bootstrap');

  const gracefulShutdown = async (signal: string) => {
    logger.log(`Received ${signal}, starting graceful shutdown...`);

    // Stop accepting new connections and drain in-flight requests
    await app.close();
    logger.log('Graceful shutdown completed');
    process.exit(0);
  };

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  const port = process.env.PORT || 3000;
  await app.listen(port);
  logger.log(`Application is running on: http://localhost:${port}`);
  logger.log(`API Documentation: http://localhost:${port}/api/docs`);
}

bootstrap();
