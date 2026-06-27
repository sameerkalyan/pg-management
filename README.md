# PG Management SaaS - Production MVP

A production-ready PG/Hostel Management SaaS application built with NestJS (backend) and React (frontend).

## Tech Stack

### Backend
- **Framework**: NestJS (Node.js 20+)
- **Language**: TypeScript
- **Database**: PostgreSQL 15+
- **ORM**: TypeORM
- **Cache/Queue**: Redis 7+ with BullMQ
- **Authentication**: JWT with refresh tokens
- **Payment**: Razorpay
- **SMS**: MSG91/Twilio
- **File Storage**: S3-compatible (MinIO for local dev)
- **PDF Generation**: PDFKit
- **Logging**: Winston (structured JSON)
- **Error Tracking**: Sentry

### Frontend
- **Framework**: React 18
- **Build Tool**: Vite
- **Language**: TypeScript
- **Styling**: TailwindCSS
- **State Management**: React Context API
- **HTTP Client**: Axios

## Features (PoC/MVP Scope)

### Core Features
1. **Super Admin Platform Management**
   - Approve/reject new PG Owner organisations
   - Suspend/reactivate organisations
   - View platform-wide statistics
   - Manage all organisations from single dashboard
   - Email whitelist for Super Admin access

2. **Property & Room Management**
   - Create property with floors, rooms, and beds
   - Room status tracking (vacant, occupied, partially occupied, maintenance)
   - Amenity tagging (AC, attached bathroom, WiFi, food included)

3. **Tenant Onboarding**
   - Google OAuth authentication
   - Name, photo upload, ID proof upload
   - Assign tenant to a bed
   - Digital rent agreement generation (PDF)
   - Emergency contact storage

4. **Rent & Billing**
   - Configurable rent per bed
   - Automatic monthly invoice generation (scheduled job)
   - Security deposit tracking
   - Online payment via Razorpay
   - Manual payment entry (cash/bank transfer)
   - Auto-generated PDF receipts

5. **Complaints & Maintenance**
   - Tenant raises complaint (category + description)
   - Manager assigns, updates status, closes
   - Basic SLA timer (flag overdue complaints)

6. **Admin Dashboard**
   - Occupancy overview (occupied vs vacant beds)
   - Monthly collection summary (collected, pending, overdue)
   - Tenant list with filters

7. **Tenant Portal**
   - View current dues, payment history, receipts
   - Online payment integration
   - Raise and track complaints
   - View notices/announcements

8. **Roles & Access**
   - Super Admin - platform management, organisation approval
   - Owner - full access to their organisation
   - Property Manager - assigned to specific properties
   - Accountant - payment and report access (read-only)
   - Tenant - portal only (self-service)

## Prerequisites

- Node.js 20+
- npm 9+
- PostgreSQL 15+
- Redis 7+
- Docker (optional, for local development)

## Installation

### 1. Clone the repository
```bash
git clone <repository-url>
cd PGManagement
```

### 2. Install dependencies
```bash
npm run install:all
```

### 3. Set up environment variables
Copy `.env.example` to `.env` and configure:
```bash
cp .env.example .env
```

Required environment variables (see `.env.example` for full list):
```env
# Database
POSTGRES_USER=your_database_user
POSTGRES_PASSWORD=your_secure_password
POSTGRES_DB=pg_management
DATABASE_HOST=localhost
DATABASE_PORT=5432

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=your_redis_password

# JWT
JWT_SECRET=your-secret-key-min-32-chars
JWT_REFRESH_SECRET=your-refresh-secret-key-min-32-chars
JWT_ACCESS_EXPIRATION=15m
JWT_REFRESH_EXPIRATION=7d

# Razorpay
RAZORPAY_KEY_ID=your_razorpay_key_id
RAZORPAY_KEY_SECRET=your_razorpay_key_secret
RAZORPAY_WEBHOOK_SECRET=your_razorpay_webhook_secret

# Google OAuth
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
GOOGLE_CALLBACK_URL=http://localhost:3000/auth/google/callback

# Super Admin (comma-separated emails)
SUPER_ADMIN_EMAILS=admin@pgmanager.com

# S3 Storage
S3_ENDPOINT=http://localhost:9000
S3_ACCESS_KEY=minioadmin
S3_SECRET_KEY=minioadmin
S3_BUCKET=pg-management

# Production-only (REQUIRED)
METRICS_TOKEN=your_metrics_token
MFA_ENCRYPTION_KEY=your_mfa_encryption_key_min_32_chars

# Environment
NODE_ENV=development
PORT=3000
FRONTEND_URL=http://localhost:5173
```

### 4. Start services with Docker Compose (recommended for local dev)
```bash
docker-compose up -d
```

This starts:
- PostgreSQL on port 5432
- Redis on port 6379
- MinIO (S3-compatible storage) on ports 9000 and 9001

### 5. Run database migrations
```bash
cd backend
npm run migration:run
```

### 6. Start the application

#### Development mode
```bash
# Start both backend and frontend
npm run dev

# Or start individually
npm run dev:backend  # Backend on http://localhost:3000
npm run dev:frontend # Frontend on http://localhost:5173
```

#### Production mode
```bash
npm run build
npm run start:prod
```

## API Documentation

Once the backend is running, access Swagger documentation at:
```
http://localhost:3000/api/docs
```

## Database Schema

All tables include `organisation_id` for multi-tenancy.

### Core Tables
- `organisations` - Organization/PG details
- `users` - User accounts with roles (Super Admin, Owner, Manager, Accountant, Tenant)
- `properties` - Property details
- `rooms` - Room details with floor and capacity
- `beds` - Individual beds with rent and status
- `tenants` - Tenant information with bed assignment
- `invoices` - Monthly invoices with status tracking
- `payments` - Payment records with Razorpay integration
- `complaints` - Maintenance complaints with SLA tracking
- `subscriptions` - Organisation-level subscription records
- `audit_logs` - Audit trail for sensitive operations

## Testing

```bash
# Run all tests
npm test

# Run backend tests
npm run test:backend

# Run frontend tests
npm run test:frontend

# Run with coverage
npm run test:cov
```

## Deployment

### Docker Deployment

Build and run with Docker:
```bash
docker build -t pg-management-backend ./backend
docker run -p 3000:3000 --env-file .env pg-management-backend
```

For full-stack production deployment, use `docker-compose.prod.yml`:
```bash
docker-compose -f docker-compose.prod.yml up -d
```

### Cloud Deployment

The application is cloud-agnostic and can be deployed to:
- AWS (ECS, EC2, Lambda)
- Google Cloud Platform (Cloud Run, GKE)
- Azure (App Service, AKS)
- Any VPS provider

See `DEPLOYMENT.md` for detailed deployment guides.

## Architecture

- Google OAuth2 authentication with state-based token exchange
- Role-based access control (RBAC)
- Super Admin email whitelist
- Organisation-based data isolation
- Shared database schema with `organisation_id` on all tables
- All queries scoped to organisation
- Database indexes with `organisation_id` as leading column
- Subscription-based access control (SaaS billing model)

### Security
- JWT with short-lived access tokens (15 min) and refresh tokens (7 days) in httpOnly cookies
- Cookie configuration: `sameSite: 'lax'` (dev) / `'strict'` (prod), `secure` in production
- Frontend axios with `withCredentials: true` for cross-origin cookie support
- Hashed refresh tokens
- Subscription guard: active subscription required for feature endpoints (properties, rooms, tenants, invoices, etc.)
- Organisation status enforcement: REJECTED/SUSPENDED blocked at JWT strategy level; PENDING allowed for setup
- Guard execution order: Global (Throttler → OrgStatus → Subscription) → Controller (JwtAuth → Roles)
- `@SkipSubscriptionCheck()` decorator for exempt endpoints (auth, admin, subscriptions, users, organisations, health, otp)
- `@Public()` decorator for unauthenticated endpoints
- Cache invalidation on org status changes (user + org status caches cleared)
- OTP rate limiting via Redis (5-minute TTL, max 3 attempts)
- Razorpay webhook signature verification with timing-safe comparison
- Idempotent invoice generation (no duplicates on job retry)
- Helmet security headers (CSP, HSTS, X-Frame-Options)
- Metrics endpoint protected with bearer token
- MFA encryption via dedicated key (32+ chars)

### Background Jobs
- BullMQ for job queue
- Scheduled invoice generation (configurable cron + timezone)
- Idempotent job processing with distributed locks
- Webhook dead-letter queue

### Observability
- Structured JSON logging (Winston)
- Prometheus metrics endpoint (`/metrics`, token-protected)
- Sentry error tracking (configurable via `SENTRY_DSN`)
- APM tracking for:
  - Invoice generation job duration
  - Payment webhook processing time
  - API response times
- Alerts for failed jobs and webhook errors

## CI/CD Pipeline

- Lint: ESLint + Prettier
- Unit tests for business logic
- Integration tests for API endpoints
- CodeQL static analysis (JavaScript + TypeScript)
- npm audit (backend + frontend, fails on high severity)
- Trivy filesystem vulnerability scanning
- Semgrep SAST scanning
- Snyk dependency vulnerability scanning
- Gitleaks secret scanning
- Build on every PR
- Automated deployment on merge to main

## Project Structure

```
PGManagement/
├── backend/
│   ├── src/
│   │   ├── common/          # Shared utilities (guards, decorators, filters, interceptors, middleware)
│   │   ├── config/          # Configuration files
│   │   ├── entities/        # TypeORM entities
│   │   ├── migrations/      # Database migrations
│   │   ├── modules/         # Feature modules (auth, admin, properties, rooms, beds, tenants, invoices, payments, complaints, dashboard, files, otp, sms, jobs, subscriptions, email, pdf, organisations, users, health)
│   │   ├── scripts/         # Utility scripts (init-database, run-migration, run-seed)
│   │   ├── seeds/           # Seed data
│   │   ├── main.ts
│   │   └── app.module.ts
│   ├── test/
│   ├── package.json
│   ├── tsconfig.json
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── components/      # Reusable UI components
│   │   ├── pages/           # Page components
│   │   ├── services/        # API client
│   │   ├── contexts/        # React contexts (Auth)
│   │   └── main.tsx
│   ├── package.json
│   ├── vite.config.ts
│   ├── nginx.conf
│   └── Dockerfile
├── docker-compose.yml        # Development compose
├── docker-compose.prod.yml   # Production compose
├── .env.example
├── package.json
└── README.md
```

## Success Criteria

- Full PoC flow runs end-to-end without manual intervention
- Test payments via Razorpay complete within 10 seconds of webhook
- Dashboard and invoice list load within 2 seconds (50 beds max)
- All tests pass (unit + integration)
- Deployable to AWS/GCP/Azure/VPS without code changes
- Tenant can sign up via Google OAuth, pay subscription, add property, onboard tenant, generate invoice, pay, see receipt
- No hardcoded Razorpay keys or secrets

## Out of Scope (V1/V2 Features)
- Offline-first mode
- Marketplace/discovery pages
- Staff management
- WhatsApp Business API
- Mess/food management
- Visitor management
- Expense tracking or P&L
- Late fee automation
- Police verification workflows

## License

Proprietary - All rights reserved

## Support

For support, contact the development team.