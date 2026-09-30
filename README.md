# MyMall Backend - Multi-Tenant E-Commerce SaaS Platform Engine

A production-grade, enterprise-ready multi-tenant e-commerce backend platform built with **Express.js**, **TypeScript**, **Prisma ORM**, **PostgreSQL**, and **Socket.io**.

Designed for scalable multi-store retail ecosystems, supporting merchant self-onboarding, real-time omnichannel inventory synchronization across online storefronts and physical Point-of-Sale (POS) terminals, dual payment workflows (Automated Chapa Gateway & Screenshot Transfer Proofs), multi-party chat, dispute resolution, and subscription monetization with search rank visibility boosting.

> 💡 **Frontend Companion Repository**: This backend powers the modern **Next.js 14** web application located in the companion **[`mymall`](../mymall)** repository. See the [Frontend Companion App](#-frontend-companion-app-mymall) section for details on running both together.

---

## 🌟 Key Features & Capabilities

### 1. Multi-Tenancy & Merchant Onboarding
- **Store Self-Service Onboarding**: Register new merchant shops with custom slug/subdomain validation (`yourstore.mymall.com` or `/storefront/yourstore`), logo/banner media, and business metadata.
- **Strict Tenant Isolation**: All database queries are strictly scoped by `storeId` with cross-tenant access enforcement via `tenantIsolation` middleware.
- **Customizable Store Settings**: Custom business hours (JSON schema), tax rates, currency (`ETB`, `USD`), return policies, brand colors (`primaryColor`, `secondaryColor`, `accentColor`), and auto-hiding of out-of-stock products.

### 2. Authentication, OTP Verification & Password Security
- **Email OTP Verification Gate**: Mandatory 6-digit cryptographically secure OTP dispatched via Nodemailer SMTP. Registration is blocked until email verification is satisfied.
- **Password Complexity Validation**: Enforces strong passwords (minimum 8 characters, uppercase, lowercase, numeric digits, and special characters) using regex sanitization.
- **Production-Grade Forgot & Reset Password Flow**:
  - Request reset via `POST /api/v1/auth/forgot-password` (mitigates email enumeration attacks).
  - Secure 15-minute expiring 6-digit reset codes.
  - Multi-step verification `POST /api/v1/auth/verify-reset-code` and password reset `POST /api/v1/auth/reset-password`.
  - Security confirmation notification emails dispatched upon successful password update.
- **Role-Based Access Control (RBAC)**: Support for `SUPER_ADMIN`, `STORE_OWNER`, `STORE_STAFF` (`MANAGER`, `CASHIER`), and `CUSTOMER`.
- **Post-Registration Role Switching**: Seamless transition from customer accounts to merchant store owners (`POST /api/v1/auth/choose-role`).

### 3. Banking Information Details Management
- **Platform Admin Banking Details**: Super Admins configure official platform accounts (e.g., Commercial Bank of Ethiopia, Telebirr, Bank of Abyssinia) for subscription collections.
- **Store Owner Banking Details**: Merchants configure dedicated store bank and mobile money accounts (e.g., Dashen Amole, CBE Birr) for customer order payments.
- **Public Checkout Directory**: Real-time listing of active banking details presented to buyers during cart checkout.

### 4. Dual Payment Processing: Chapa Gateway & Screenshot Proofs
- **Automated Digital Payments via Chapa API**:
  - Full support for Ethiopian payment methods (Telebirr, CBE Birr, debit/ATM cards).
  - **Subscriptions**: Instant store activation upon successful checkout verification with automated PDF/invoice records.
  - **Orders**: Instant order status transition to `PAID` with stock deduction.
- **Per-Store Direct Payout Routing**: Store owners can provide their own Chapa API credentials (`chapaPublicKey`, `chapaSecretKey`, `chapaWebhookSecret`) via `PATCH /api/v1/stores/payment-keys` to receive customer payments directly into their own merchant balance.
- **Screenshot Transfer Verification Workflow**:
  - Customers and merchants can upload mobile banking transfer screenshots.
  - Admins and store owners review, approve, or reject submissions with status tracking (`PENDING_APPROVAL`, `APPROVED`, `REJECTED`).

### 5. Platform Subscription Billing & Search Boost
- **4 Flexible Billing Cycles**: `MONTHLY` (30 days), `THREE_MONTHS` (90 days), `SIX_MONTHS` (180 days), and `YEARLY` (365 days).
- **Search Rank Boost**: Higher-tier subscription packages feature an integer `searchRankBoost` factor that automatically elevates subscribed merchant stores and their items to the top of universal marketplace searches.
- **Plan Limits Enforcement**: Dynamically restricts `maxProducts` and `maxStaff` according to subscription tier.
- **Super Admin Package Editor**: Full CRUD endpoints for platform administrators to create, update, or deactivate subscription plans.
- **Automated Expiration Cron Worker**: Scheduled worker evaluates subscriptions daily, applies 3-day grace periods (`PAST_DUE`), and executes soft-lock suspensions (`SUSPENDED`).

### 6. Geolocation Permission Gate & Customer Address Book
- **Explicit Location Consent Gate**: Submitting GPS coordinates requires explicit user permission (`locationPermissionGranted: true`). Requests providing raw coordinates without permission are rejected with `HTTP 400 Bad Request`.
- **Coordinate Bounds Validation**: Strict validation of latitude (`-90` to `+90`) and longitude (`-180` to `+180`).
- **Customer Address Book (`/api/v1/addresses`)**: Users can save multiple delivery addresses with custom labels (`Home`, `Work`, `Other`), GPS pin locations, location accuracy, and instructions, with a single default address flag.
- **Checkout Location Inheritance**: Orders can simply reference a saved `addressId` to inherit delivery instructions, GPS coordinates, and verified permission status.

### 7. Multi-Level Reviews & Ratings
- **Site-Level Reviews**: Public platform ratings and testimonials with Super Admin moderation.
- **Store-Level Reviews**: Customer merchant ratings with verified purchase detection.
- **Product-Level Reviews**: 1–5 star ratings on individual product listings with aggregated score metrics and verified buyer badges.

### 8. Multi-Party Real-Time Chat & Dispute Resolution
- **Live Socket.io Messaging (`/api/v1/chat`)**:
  - Platform Admin ⟷ Store Owner
  - Store Owner ⟷ Customer
  - Customer ⟷ Platform Admin
  - Unread badge counters, image attachments, and mark-as-read tracking.
- **Dispute & Report Center (`/api/v1/disputes`)**:
  - File formal claims for damaged goods, delivery delays, or payment disagreements.
  - Automatically provisions dedicated dispute chat threads.
  - Platform Admins investigate and rule on disputes via `PATCH /api/v1/disputes/:id/resolve`.

### 9. Point-of-Sale (POS) Physical Retail Engine
- **Atomic Stock Deductions**: Deducts from the exact same inventory pool as online orders in atomic Prisma database transactions.
- **Offline-First Synchronization**: Reconciles offline sales queue with client-side `offlineId` idempotency keys to prevent duplicate transactions.
- **Thermal Receipts**: Structured JSON receipt data and printable HTML templates.
- **Cash Drawer Reconciliation**: End-of-day cash drawer balancing broken down by payment method (`CASH`, `MOBILE_MONEY`, `CARD`, `SPLIT`).

---

## 📂 Directory Structure

```
mymall_backend/
├── .dockerignore                     # Docker build exclusion rules
├── .env.example                      # Environment variables template
├── .gitignore                        # Git ignore configuration
├── Dockerfile                        # Multi-stage production container definition
├── README.md                         # Comprehensive documentation
├── docker-compose.yml                # Docker Compose orchestration (App + PostgreSQL)
├── docker-entrypoint.sh              # Container startup & migration script
├── package.json                      # Node.js dependencies & scripts
├── tsconfig.json                     # TypeScript compiler configuration
├── prisma/
│   ├── schema.prisma                 # PostgreSQL database models & relations
│   └── seed.ts                       # Rich Ethiopian demo seed script
├── uploads/                          # Local media storage directory
│   ├── branding/                     # Store logos & banners
│   ├── products/                     # Product images
│   └── screenshots/                  # Payment proof screenshots
├── src/
│   ├── @types/                       # TypeScript declaration augmentations (Express Request)
│   ├── config/                       # DB Prisma client, Multer upload engine
│   ├── controllers/                  # Route controllers
│   │   ├── address.controller.ts     # Customer address book & location permission
│   │   ├── analytics.controller.ts   # Store & platform metrics
│   │   ├── auth.controller.ts        # OTP, registration, login, forgot password
│   │   ├── billing.controller.ts     # Plans, platform bank accounts, subscriptions
│   │   ├── chat.controller.ts        # Multi-party conversations & messages
│   │   ├── dispute.controller.ts     # Dispute reporting & admin rulings
│   │   ├── order.controller.ts       # Cart checkout, proof upload, delivery validation
│   │   ├── pos.controller.ts         # POS sales, cash drawer, offline sync
│   │   ├── product.controller.ts     # Products, variants, CSV import/export
│   │   ├── review.controller.ts      # Multi-level reviews & ratings
│   │   ├── staff.controller.ts       # Staff invite tokens & store assignments
│   │   ├── store.controller.ts       # Store onboarding, settings, custom Chapa keys
│   │   └── storefront.controller.ts  # Public marketplace search, merchant storefronts
│   ├── jobs/                         # Scheduled workers
│   │   └── billingCron.ts            # Daily subscription expiration & soft-lock worker
│   ├── middleware/                   # Express middlewares
│   │   ├── auth.middleware.ts        # JWT verification, RBAC role authorization
│   │   ├── rateLimiter.ts            # Express-rate-limit security protection
│   │   ├── tenant.middleware.ts      # Tenant isolation & store scoping
│   │   └── upload.middleware.ts      # Multer file size & type validation
│   ├── routes/                       # Express router endpoints
│   ├── services/                     # Core domain business logic
│   │   ├── billingService.ts         # Quota checks & subscription cycle logic
│   │   ├── chapaService.ts           # Chapa API payment gateway client
│   │   ├── chatService.ts            # Chat conversation & messaging logic
│   │   ├── emailService.ts           # Nodemailer SMTP email dispatcher
│   │   ├── inventoryService.ts       # Atomic stock decrements & reservation
│   │   ├── otpService.ts             # 6-digit OTP generation & bcrypt hashing
│   │   ├── passwordResetService.ts   # Secure reset code generation & password update
│   │   └── searchService.ts          # Search ranking boosted by subscription tier
│   ├── sockets/                      # Real-time WebSocket engine
│   │   └── socket.ts                 # Socket.io connection rooms & broadcast helpers
│   ├── utils/                        # Utilities
│   │   ├── jwt.ts                    # JWT token signing & verification
│   │   ├── receiptGenerator.ts       # Printable HTML receipts
│   │   └── validator.ts              # Password, email, phone & GPS coordinate checks
│   ├── app.ts                        # Express application configuration
│   └── server.ts                     # Main HTTP, Socket.io & worker bootstrap
└── tests/
    └── run_tests.ts                  # Comprehensive 12-module end-to-end test suite
```

---

## 🚀 Getting Started

You can run the MyMall backend using **Docker** (recommended for production and effortless local evaluation) or **Without Docker** using your local Node.js environment.

### Prerequisites
- **Git**
- **Docker & Docker Compose** (for Option 1) OR **Node.js 18+ & PostgreSQL 14+** (for Option 2)

---

### Step 1: Clone the Repository

```bash
git clone https://github.com/DrLeroK/mymall_backend.git
cd mymall_backend
```

---

### Option 1: Running with Docker & Docker Compose (Recommended)

Docker Compose starts both the **Express Backend Application** and a dedicated **PostgreSQL Database** container, runs schema synchronizations automatically, and boots up the API server with persistent volumes.

#### 1. Set Up Environment Variables
Create your local `.env` file from the example template:
```bash
cp .env.example .env
```

Review the `.env` file. The default Docker database credentials are pre-configured:
```env
PORT=5001
POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgres
POSTGRES_DB=mymall_db
DOCKER_POSTGRES_PORT=5434
SEED_DATABASE=true
```

#### 2. Start Services
Launch the multi-container stack in detached mode:
```bash
docker compose up -d --build
```

#### 3. Verify Health & Logs
Monitor the startup sequence and automated database migrations:
```bash
docker compose logs -f app
```

Once ready, you will see:
```
==> [Docker Entrypoint] Database is connected and ready!
==> [Docker Entrypoint] Synchronizing Prisma schema to PostgreSQL...
==> [Docker Entrypoint] Running database seed (stores, plans, admin accounts)...
🚀 MyMall Backend running at http://localhost:5001
📡 Socket.io engine initialized and listening.
```

Test the health check endpoint:
```bash
curl http://localhost:5001/health
```

#### 4. Stopping Containers
```bash
# Stop containers while preserving data
docker compose down

# Stop containers and remove persistent database volumes
docker compose down -v
```

---

### Option 2: Running Without Docker (Local Setup)

If you prefer to run directly on your host machine:

#### 1. Install Dependencies
```bash
npm install
```

#### 2. Configure Environment Variables
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```

Ensure your PostgreSQL service is running locally, then update `DATABASE_URL` in `.env`:
```env
PORT=5001
DATABASE_URL="postgresql://postgres:yourpassword@localhost:5432/mymall_db?schema=public"
JWT_SECRET="your_secure_jwt_secret_key"
JWT_REFRESH_SECRET="your_secure_jwt_refresh_secret"

# Email SMTP settings (e.g., Gmail App Password)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_email@gmail.com
SMTP_PASS="your_16_char_app_password"
EMAIL_FROM="MyMall E-Commerce <noreply@mymall.com>"

# Chapa Gateway Credentials
CHAPA_BASE_URL="https://api.chapa.co/v1"
CHAPA_PUBLIC_KEY="CHAPUBK_TEST-..."
CHAPA_SECRET_KEY="CHASECK_TEST-..."
CHAPA_WEBHOOK_SECRET="your_webhook_hash"
```

#### 3. Synchronize Database & Generate Prisma Client
```bash
# Push Prisma schema to your PostgreSQL database
npm run prisma:push

# Generate Prisma Client
npm run prisma:generate
```

#### 4. Seed Demo Data (Optional)
Populate the database with sample Ethiopian stores, subscription tiers, categories, and test user accounts:
```bash
npm run seed
```

#### 5. Start the Application
- **Development Mode** (with automatic hot-reloading):
  ```bash
  npm run dev
  ```
- **Production Build & Run**:
  ```bash
  npm run build
  npm start
  ```

---

## 💻 Frontend Companion App (`mymall`)

The MyMall system includes a modern **Next.js 14** web application located in the sibling repository **[`mymall`](../mymall)**.

### Running the Frontend
1. In a new terminal window, navigate to the `mymall` directory:
   ```bash
   cd ../mymall
   ```
2. Install frontend dependencies:
   ```bash
   npm install
   ```
3. Ensure `.env.local` points to this backend server:
   ```env
   NEXT_PUBLIC_API_URL="http://localhost:5001/api/v1"
   NEXT_PUBLIC_SOCKET_URL="http://localhost:5001"
   ```
4. Start the Next.js development server:
   ```bash
   npm run dev
   ```
5. Open [http://localhost:3000](http://localhost:3000) in your browser to interact with the customer storefront, merchant dashboard, POS counter, and admin management portal!

---

## 📡 API Endpoints Reference

All API routes are prefixed with `/api/v1`.

### Authentication & Users (`/api/v1/auth`)
| Method | Endpoint | Description | Auth Required |
|---|---|---|---|
| `POST` | `/auth/send-otp` | Request 6-digit registration OTP via email | No |
| `POST` | `/auth/verify-otp` | Verify registration OTP code | No |
| `POST` | `/auth/register` | Register new account (enforces verified email & strong password) | No |
| `POST` | `/auth/login` | Authenticate user & issue JWT tokens | No |
| `POST` | `/auth/refresh-token`| Renew expired access token | No |
| `GET` | `/auth/me` | Fetch authenticated user profile | Bearer Token |
| `POST` | `/auth/choose-role` | Switch account role post-registration (e.g. `STORE_OWNER`) | Bearer Token |
| `POST` | `/auth/forgot-password`| Request password reset code via email | No |
| `POST` | `/auth/verify-reset-code`| Verify 6-digit password reset code | No |
| `POST` | `/auth/reset-password` | Complete password reset with strong password validation | No |

### Customer Address Book (`/api/v1/addresses`)
| Method | Endpoint | Description | Auth Required |
|---|---|---|---|
| `POST` | `/addresses` | Create delivery address (enforces `locationPermissionGranted: true`) | Bearer Token |
| `GET` | `/addresses` | List saved delivery addresses for user | Bearer Token |
| `GET` | `/addresses/:id` | Retrieve specific address details | Bearer Token |
| `PATCH` | `/addresses/:id` | Update address details & GPS coordinates | Bearer Token |
| `DELETE`| `/addresses/:id` | Remove saved address | Bearer Token |
| `PATCH` | `/addresses/:id/default` | Set primary default delivery address | Bearer Token |

### Stores & Merchant Management (`/api/v1/stores`)
| Method | Endpoint | Description | Auth Required |
|---|---|---|---|
| `POST` | `/stores/onboard` | Register and onboard a new merchant store | Bearer Token |
| `GET` | `/stores/me` | Get owned store details and settings | Store Owner |
| `PATCH` | `/stores/settings` | Update store hours, return policies, branding | Store Owner |
| `PATCH` | `/stores/payment-keys`| Configure store-specific Chapa credentials for direct payout | Store Owner |
| `GET` | `/stores/bank-accounts`| List store bank accounts for manual payment transfers | Store Owner |
| `POST` | `/stores/bank-accounts`| Add new store bank account | Store Owner |

### Subscriptions & Platform Billing (`/api/v1/billing`)
| Method | Endpoint | Description | Auth Required |
|---|---|---|---|
| `GET` | `/billing/plans` | List available subscription tiers (with 4 billing cycles) | Public |
| `POST` | `/billing/plans` | Create new subscription tier with `searchRankBoost` | Super Admin |
| `PATCH` | `/billing/plans/:id` | Edit subscription tier limits and pricing | Super Admin |
| `GET` | `/billing/platform-bank-accounts`| List official platform bank accounts | Public |
| `POST` | `/billing/admin/bank-accounts` | Add official platform bank account | Super Admin |
| `POST` | `/billing/subscribe` | Submit screenshot payment proof for subscription | Store Owner |
| `POST` | `/billing/chapa/initialize` | Initialize automated Chapa subscription checkout session | Store Owner |
| `GET` | `/billing/chapa/verify/:txRef` | Verify Chapa subscription payment & activate store | Store Owner |

### Online Orders (`/api/v1/orders`)
| Method | Endpoint | Description | Auth Required |
|---|---|---|---|
| `POST` | `/orders/checkout` | Place order (Delivery with GPS permission / Pickup, Chapa / Screenshot) | Public / User |
| `GET` | `/orders` | List store orders | Store Staff |
| `GET` | `/orders/:id` | Get order details | Authorized |
| `POST` | `/orders/:id/payment-proof` | Upload manual bank transfer screenshot | Customer |
| `PATCH` | `/orders/:id/verify-payment`| Approve or reject order payment proof | Store Owner |
| `GET` | `/orders/chapa/verify/:txRef` | Verify Chapa order payment and transition to `PAID` | Public |

### Real-Time Chat (`/api/v1/chat`)
| Method | Endpoint | Description | Auth Required |
|---|---|---|---|
| `GET` | `/chat/conversations` | List user's conversations (Admin, Store, Customer) | Bearer Token |
| `POST` | `/chat/conversations` | Start or retrieve conversation thread | Bearer Token |
| `GET` | `/chat/conversations/:id/messages` | Fetch message history & mark messages read | Participant |
| `POST` | `/chat/conversations/:id/messages` | Post message with optional file attachment | Participant |

### Dispute Resolution Center (`/api/v1/disputes`)
| Method | Endpoint | Description | Auth Required |
|---|---|---|---|
| `POST` | `/disputes` | File a report/dispute regarding an order or store | Customer / Owner |
| `GET` | `/disputes` | List disputes (Admin sees all, Store/Customer sees theirs) | Bearer Token |
| `GET` | `/disputes/:id` | Get dispute details and linked chat thread | Authorized |
| `PATCH` | `/disputes/:id/resolve`| Super Admin issues resolution ruling and status | Super Admin |

### Multi-Level Reviews (`/api/v1/reviews`)
| Method | Endpoint | Description | Auth Required |
|---|---|---|---|
| `POST` | `/reviews/site` | Submit platform-level review & rating | Public / User |
| `GET` | `/reviews/site` | Get approved site reviews & average rating | Public |
| `POST` | `/reviews/stores/:storeId`| Submit store-specific customer review | Customer |
| `PATCH` | `/reviews/stores/:id/moderate`| Moderate or toggle review visibility | Store Owner / Admin |

### Public Marketplace Storefront (`/api/v1/storefront`)
| Method | Endpoint | Description | Auth Required |
|---|---|---|---|
| `GET` | `/storefront/search/all` | Universal search across stores & products (boosted by rank) | Public |
| `GET` | `/storefront/:slug` | View public store profile & catalog | Public |
| `GET` | `/storefront/:slug/bank-accounts`| View store's active bank transfer accounts | Public |

---

## 🧪 Automated Testing

The repository includes a comprehensive 12-module end-to-end automated test suite that spins up an ephemeral test server, tests database interactions, real SMTP dispatch, Chapa checkout generation, location permission gates, and multi-party WebSocket rooms.

To run the full test suite:
```bash
npm test
```

### Modules Verified:
1. Super Admin & Demo Store Owner Authentication
2. Email OTP Verification Gate, Password Complexity & Forgot Password Reset Flow
3. Multi-Tenancy & Store Onboarding
4. Store Custom Chapa Direct Payment Keys Configuration
5. Staff Invitation System & Role Assignment (`CASHIER`, `MANAGER`)
6. Multi-Level Reviews (Site, Store, and Product Levels)
7. Banking Information Management (Platform Admin & Store Owner)
8. Subscription Plans (1/3/6/12 Month Tiers) & Real Chapa API Integration
9. Online Orders (Delivery with Geolocation Permission Gate & Customer Address Book)
10. Multi-Party Real-Time Chatting (Admin-Store, Store-Customer, Customer-Admin)
11. Dispute & Report Resolution Center
12. POS Physical Sales & Automated Subscription Expiration Worker

---

## 🛡️ Environment Variables Reference

| Variable | Description | Example / Default |
|---|---|---|
| `PORT` | HTTP server port | `5001` |
| `NODE_ENV` | Application environment | `development` / `production` |
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://user:pass@host:5432/db` |
| `POSTGRES_USER` | Docker PostgreSQL username | `postgres` |
| `POSTGRES_PASSWORD` | Docker PostgreSQL password | `postgres` |
| `POSTGRES_DB` | Docker PostgreSQL database name | `mymall_db` |
| `DOCKER_POSTGRES_PORT`| Host port mapped to Docker PostgreSQL | `5434` |
| `SEED_DATABASE` | Automatically seed database on Docker start | `true` / `false` |
| `JWT_SECRET` | Secret key for access token signing | `your_secure_jwt_secret` |
| `JWT_REFRESH_SECRET` | Secret key for refresh token signing | `your_secure_refresh_secret` |
| `JWT_EXPIRES_IN` | Access token lifespan | `1d` |
| `JWT_REFRESH_EXPIRES_IN`| Refresh token lifespan | `7d` |
| `SMTP_HOST` | Nodemailer SMTP server host | `smtp.gmail.com` |
| `SMTP_PORT` | SMTP port | `587` |
| `SMTP_USER` | SMTP username/email address | `user@gmail.com` |
| `SMTP_PASS` | SMTP application password | `xxxx xxxx xxxx xxxx` |
| `EMAIL_FROM` | Outgoing email sender string | `MyMall <noreply@mymall.com>` |
| `CHAPA_BASE_URL` | Chapa API base endpoint | `https://api.chapa.co/v1` |
| `CHAPA_PUBLIC_KEY` | Chapa public API key | `CHAPUBK_TEST-...` |
| `CHAPA_SECRET_KEY` | Chapa secret API key | `CHASECK_TEST-...` |
| `CHAPA_WEBHOOK_SECRET` | Chapa webhook verification hash | `your_webhook_secret` |
| `MAPBOX_ACCESS_TOKEN` | Mapbox public access token | `pk.eyJ1I...` |

---

## 📄 License

This project is licensed under the ISC License.
