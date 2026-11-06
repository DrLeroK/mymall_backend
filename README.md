# MyMall Backend - Multi-Tenant E-Commerce SaaS Platform Engine

A production-grade, enterprise-ready multi-tenant e-commerce backend platform built with **Express.js**, **TypeScript**, **Prisma ORM**, **PostgreSQL**, and **Socket.io**.

Designed for scalable multi-store retail ecosystems, supporting merchant self-onboarding, real-time omnichannel inventory synchronization across online storefronts and physical Point-of-Sale (POS) terminals, dual payment workflows (Automated Chapa Gateway & Screenshot Transfer Proofs), multi-party chat, dispute resolution, and subscription monetization with search rank visibility boosting.

> 💡 **Frontend Companion Repository**: This backend powers the modern **Next.js 14** web application located in the companion **[`mymall`](../mymall)** repository. See the [Frontend Companion App](#-frontend-companion-app-mymall) section for details on running both together.

---

## 🌟 Key Features & Capabilities

### 1. Multi-Tenancy, Row-Level Security (RLS) & Merchant Onboarding
- **Store Self-Service Onboarding**: Register new merchant shops with custom slug/subdomain validation (`yourstore.mymall.com` or `/storefront/yourstore`), logo/banner media, and business metadata.
- **5-Day Free Trial Auto-Provisioning**: New stores are automatically assigned a 5-day free trial on the **Starter Plan** with full POS, variant cataloging, and dashboard access.
- **Row-Level Security (RLS) & Tenant Isolation**: All database queries are strictly scoped by `storeId` with cross-tenant access enforcement via `tenantIsolation` middleware and `TenantGuardService`. Cross-tenant tampering and header spoofing (`x-store-id`) are strictly blocked with `HTTP 403 Forbidden`.
- **Customizable Store Settings**: Custom business hours (JSON schema), Ethiopian 15% VAT default tax rate, currency (`ETB`, `USD`), return policies, brand colors (`primaryColor`, `secondaryColor`, `accentColor`), and auto-hiding of out-of-stock products (`hideOutOfStock`).

### 2. Multi-Store Staff Membership & Granular RBAC
- **Multi-Store Employment (`StoreStaffMember`)**: Staff members can be employed by multiple stores concurrently, maintaining separate roles and permission sets per store.
- **Staff Roles**: Support for `SUPER_ADMIN`, `STORE_OWNER`, and store staff roles: `MANAGER`, `CASHIER`, `INVENTORY_CLERK`, and `ACCOUNTANT`.
- **Active Store Context Switching**: Staff working in multiple locations can switch their active working store context on the fly via `POST /api/v1/staff/switch-store`, receiving refreshed JWT sessions scoped to the selected store.
- **Granular Permission Overrides**: Store owners can assign custom permission arrays (e.g. `['manage_inventory', 'process_pos', 'view_reports', 'process_refunds']`) overriding base staff role defaults.
- **Secure One-Time Invite Codes**: Dispatched via email with target-email verification to prevent invite link interception or code reuse.

### 3. Authentication, OTP Verification & Password Security
- **Email OTP Verification Gate**: Mandatory 6-digit cryptographically secure OTP dispatched via Nodemailer SMTP. Registration is blocked until email verification is satisfied (`isEmailVerified = false` users blocked with `403 EMAIL_NOT_VERIFIED`).
- **Strict Password Complexity Standard**: Enforces strong passwords (minimum 8 characters, uppercase, lowercase, numeric digits, and special characters, e.g. `P@ssw0rd2026!`).
- **Production-Grade Forgot & Reset Password Flow**:
  - Request reset via `POST /api/v1/auth/forgot-password` (mitigates email enumeration attacks).
  - Secure 15-minute expiring 6-digit reset codes.
  - Multi-step verification `POST /api/v1/auth/verify-reset-code` and password reset `POST /api/v1/auth/reset-password`.
  - Security confirmation notification emails dispatched upon successful password update.
- **Post-Registration Role Switching**: Seamless transition from customer accounts to merchant store owners (`POST /api/v1/auth/choose-role`).

### 4. Product Variants & Subscription Tier Catalog Limits
- **Multi-Attribute Product Variants (`ProductVariant`)**: Full support for nested product variants (Size, Color, Material) with variant-level pricing, individual SKU/Barcode, stock quantities, and options JSON.
- **3-Tier Subscription System**:
  - **Starter**: 250 ETB/mo, max 25 products, 2 staff seats, **5-day free trial** auto-provisioned upon store onboarding.
  - **Growth**: 600 ETB/mo, max 150 products, 5 staff seats.
  - **Enterprise**: 1,500 ETB/mo, max 1,000 products, 20 staff seats.
- **Hard Quota Enforcement**: Attempts to create products or staff members beyond plan limits return `HTTP 403 Forbidden` (`PLAN_LIMIT_REACHED`).

### 5. Real-Time Syncboard Notifications & Seen Status Gate
- **Strict Audience Isolation**: Real-time Socket.io events are partitioned into dedicated rooms:
  - Super Admin alerts broadcast exclusively to `superadmin` room.
  - Store alerts broadcast exclusively to `store_{storeId}` room.
  - Customer alerts broadcast exclusively to `user_{userId}` room.
- **Single-Use Popup Modals (`/api/v1/alerts/unseen`)**: Initial login fetches unseen alerts and atomically marks them `isSeen: true` in the database, ensuring popup modals display once and never show duplicate popups on re-login or page refresh.
- **Persistent Notification Bell History (`/api/v1/alerts`)**: Complete notification history remains accessible in the topbar notification bell center.
- **Live Active Session Popups**: Logged-in users receive live modal alerts dynamically when new events occur via WebSocket `alert:new`.

### 6. Banking Information Details Management
- **Platform Admin Banking Details**: Super Admins configure official platform accounts (e.g., Commercial Bank of Ethiopia, Telebirr, Bank of Abyssinia) for subscription collections.
- **Store Owner Banking Details**: Merchants configure dedicated store bank and mobile money accounts (e.g., Dashen Amole, CBE Birr) for customer order payments.
- **Public Checkout Directory**: Real-time listing of active banking details presented to buyers during cart checkout.

### 7. Dual Payment Processing: Chapa Gateway & Screenshot Proofs
- **Automated Digital Payments via Chapa API**:
  - Full support for Ethiopian payment methods (Telebirr, CBE Birr, debit/ATM cards).
  - **Subscriptions**: Instant store activation upon successful checkout verification with automated PDF/invoice records.
  - **Orders**: Instant order status transition to `PAID` with stock deduction.
- **Per-Store Direct Payout Routing**: Store owners can provide their own Chapa API credentials (`chapaPublicKey`, `chapaSecretKey`, `chapaWebhookSecret`) via `PATCH /api/v1/stores/payment-keys` to receive customer payments directly into their own merchant balance.
- **Screenshot Transfer Verification Workflow**:
  - Customers and merchants can upload mobile banking transfer screenshots.
  - Admins and store owners review, approve, or reject submissions with status tracking (`PENDING_APPROVAL`, `APPROVED`, `REJECTED`).

### 8. Platform Subscription Billing & Search Boost
- **4 Flexible Billing Cycles**: `MONTHLY` (30 days), `THREE_MONTHS` (90 days), `SIX_MONTHS` (180 days), and `YEARLY` (365 days).
- **Search Rank Boost**: Higher-tier subscription packages feature an integer `searchRankBoost` factor that automatically elevates subscribed merchant stores and their items to the top of universal marketplace searches.
- **Super Admin Package Editor**: Full CRUD endpoints for platform administrators to create, update, or deactivate subscription plans.
- **Automated Expiration Cron Worker**: Scheduled worker evaluates subscriptions daily, applies 3-day grace periods (`PAST_DUE`), and executes soft-lock suspensions (`SUSPENDED`).

### 9. Geolocation Permission Gate & Customer Address Book
- **Explicit Location Consent Gate**: Submitting GPS coordinates requires explicit user permission (`locationPermissionGranted: true`). Requests providing raw coordinates without permission are rejected with `HTTP 400 Bad Request`.
- **Coordinate Bounds Validation**: Strict validation of latitude (`-90` to `+90`) and longitude (`-180` to `+180`).
- **Customer Address Book (`/api/v1/addresses`)**: Users can save multiple delivery addresses with custom labels (`Home`, `Work`, `Other`), GPS pin locations, location accuracy, and instructions, with a single default address flag.
- **Checkout Location Inheritance**: Orders can simply reference a saved `addressId` to inherit delivery instructions, GPS coordinates, and verified permission status.

### 10. Multi-Level Reviews & Ratings
- **Site-Level Reviews**: Public platform ratings and testimonials with Super Admin moderation.
- **Store-Level Reviews**: Customer merchant ratings with verified purchase detection.
- **Product-Level Reviews**: 1–5 star ratings on individual product listings with aggregated score metrics and verified buyer badges.

### 11. Multi-Party Real-Time Chat & Dispute Resolution
- **Live Socket.io Messaging (`/api/v1/chat`)**:
  - Platform Admin ⟷ Store Owner
  - Store Owner ⟷ Customer
  - Customer ⟷ Platform Admin
  - Unread badge counters, image attachments, and mark-as-read tracking.
- **Dispute & Report Center (`/api/v1/disputes`)**:
  - File formal claims for damaged goods, delivery delays, or payment disagreements.
  - Automatically provisions dedicated dispute chat threads.
  - Platform Admins investigate and rule on disputes via `PATCH /api/v1/disputes/:id/resolve`.

### 12. Point-of-Sale (POS) Physical Retail Engine
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
├── render.yaml                       # Render Blueprint one-click specification
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
│   ├── receipts/                     # Generated digital receipts
│   └── screenshots/                  # Payment proof screenshots
├── src/
│   ├── @types/                       # TypeScript declaration augmentations (Express Request)
│   ├── config/                       # DB Prisma client, Multer upload engine
│   ├── controllers/                  # Route controllers
│   │   ├── address.controller.ts     # Customer address book & location permission
│   │   ├── alert.controller.ts       # Notifications & unseen popup modals
│   │   ├── analytics.controller.ts   # Store & platform metrics
│   │   ├── auth.controller.ts        # OTP, registration, login, forgot password
│   │   ├── billing.controller.ts     # Plans, platform bank accounts, subscriptions
│   │   ├── chat.controller.ts        # Multi-party conversations & messages
│   │   ├── dispute.controller.ts     # Dispute reporting & admin rulings
│   │   ├── order.controller.ts       # Cart checkout, proof upload, personal orders
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
│   ├── services/                     # Core domain business logic (decoupled service layer)
│   │   ├── authService.ts            # Registration, OTP gate, password complexity & login
│   │   ├── billingService.ts         # Quota checks & subscription cycle logic (5-day trial)
│   │   ├── chapaService.ts           # Chapa API payment gateway client
│   │   ├── chatService.ts            # Chat conversation & messaging logic
│   │   ├── emailService.ts           # Nodemailer SMTP email dispatcher
│   │   ├── inventoryService.ts       # Atomic stock decrements & reservation
│   │   ├── notificationService.ts    # Room isolation & seen status lifecycle
│   │   ├── otpService.ts             # 6-digit OTP generation & bcrypt hashing
│   │   ├── passwordResetService.ts   # Secure reset code generation & password update
│   │   ├── productService.ts         # Product CRUD, variants & plan limits
│   │   ├── receiptService.ts         # Digital receipt generation & archival
│   │   ├── searchService.ts          # Search ranking boosted by subscription tier
│   │   ├── staffService.ts           # Staff invites, multi-store memberships & switching
│   │   ├── storageService.ts         # Cloudflare R2 object storage + local disk fallback
│   │   ├── storeService.ts           # Store onboarding & custom branding settings
│   │   └── tenantGuardService.ts     # Row-Level Security (RLS) & cross-tenant query guards
│   ├── sockets/                      # Real-time WebSocket engine
│   │   └── socket.ts                 # Socket.io connection rooms & broadcast helpers
│   ├── utils/                        # Utilities
│   │   ├── apiError.ts               # Standardized API error responses with HTTP status codes
│   │   ├── jwt.ts                    # JWT token signing & verification
│   │   ├── receiptGenerator.ts       # Printable HTML receipts
│   │   └── validator.ts              # Password, email, phone & GPS coordinate checks
│   ├── app.ts                        # Express application configuration
│   └── server.ts                     # Main HTTP, Socket.io & worker bootstrap
└── tests/                            # Comprehensive modular test suites (154 tests, 100% pass)
    ├── unit/                         # Independent unit test suites (55 tests)
    │   ├── billing_service.unit.test.ts
    │   ├── notification_service.unit.test.ts
    │   ├── otp_service.unit.test.ts
    │   ├── password_validation.unit.test.ts
    │   ├── product_service.unit.test.ts
    │   ├── rbac_permissions.unit.test.ts
    │   ├── store_service.unit.test.ts
    │   ├── tenant_guard.unit.test.ts
    │   └── index.ts                  # Unit test runner (`npm run test:unit`)
    ├── integration/                  # Independent integration test suites (38 tests)
    │   ├── auth.integration.test.ts
    │   ├── notification_syncboard.integration.test.ts
    │   ├── product_variants.integration.test.ts
    │   ├── staff_membership.integration.test.ts
    │   ├── store_tenant.integration.test.ts
    │   ├── tenant_isolation.integration.test.ts
    │   └── index.ts                  # Integration test runner (`npm run test:integration`)
    └── e2e/                          # Independent End-to-End API test suites (38 tests)
        ├── auth_gate.e2e.test.ts
        ├── catalog_variants_limits.e2e.test.ts
        ├── e2e_helper.ts
        ├── notifications_syncboard.e2e.test.ts
        ├── staff_invite_multistore.e2e.test.ts
        ├── store_onboarding.e2e.test.ts
        ├── tenant_security_rls.e2e.test.ts
        └── index.ts                  # E2E test runner (`npm run test:e2e`)
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
| `POST` | `/stores/onboard` | Register and onboard a new merchant store (auto-assigns 5-day trial on Starter) | Bearer Token |
| `GET` | `/stores/me` | Get owned store details and settings | Store Owner |
| `PATCH` | `/stores/settings` | Update store hours, return policies, branding & `hideOutOfStock` | Store Owner |
| `PATCH` | `/stores/payment-keys`| Configure store-specific Chapa credentials for direct payout | Store Owner |
| `GET` | `/stores/bank-accounts`| List store bank accounts for manual payment transfers | Store Owner |
| `POST` | `/stores/bank-accounts`| Add new store bank account | Store Owner |
| `GET` | `/stores/admin/all` | Super Admin cross-store governance & status monitoring | Super Admin |

### Products & Variant Inventory (`/api/v1/products`)
| Method | Endpoint | Description | Auth Required |
|---|---|---|---|
| `GET` | `/products` | List store products with nested variants & stock | Store Staff |
| `GET` | `/products/:id` | Get specific product details with full variant roster | Store Staff |
| `POST` | `/products` | Create product with nested variants (plan limits enforced) | Store Owner / Staff |
| `PATCH` | `/products/:id` | Update product attributes, pricing, stock, or variants | Store Owner / Staff |
| `DELETE`| `/products/:id` | Delete product and associated variants | Store Owner |
| `POST` | `/products/import-csv` | Bulk CSV product catalog import | Store Owner / Staff |
| `GET` | `/products/export-csv` | Export catalog items and variants to CSV | Store Owner / Staff |

### Staff Management & Multi-Store Switching (`/api/v1/staff`)
| Method | Endpoint | Description | Auth Required |
|---|---|---|---|
| `POST` | `/staff/invite` | Generate secure one-time invite code with role & custom permissions | Store Owner |
| `GET` | `/staff/invite/:code`| Preview invitation details (store name, assigned role) | Public |
| `POST` | `/staff/accept-invite`| Accept staff invitation & attach to store via `StoreStaffMember` | Bearer Token |
| `POST` | `/staff/switch-store`| Switch active store context for multi-store staff & issue fresh JWT | Bearer Token |
| `GET` | `/staff` | List active store staff members & permission rosters | Store Owner |
| `PATCH` | `/staff/:id/permissions`| Update staff role or toggle custom permission overrides | Store Owner |
| `PATCH` | `/staff/:id/toggle-status`| Instantly activate or deactivate staff login access | Store Owner |

### Syncboard Notifications & Popups (`/api/v1/alerts`)
| Method | Endpoint | Description | Auth Required |
|---|---|---|---|
| `GET` | `/alerts/unseen` | Fetch unseen popup alerts & atomically mark `isSeen = true` | Bearer Token |
| `GET` | `/alerts` | Get persistent notification bell history & unread counts | Bearer Token |
| `PATCH` | `/alerts/read-all` | Mark all alerts as read | Bearer Token |
| `PATCH` | `/alerts/:id/read` | Mark individual alert as read | Bearer Token |

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
| `GET` | `/billing/chapa/verify/:txRef` | Verify Chapa subscription payment, upgrade store tier & activate | Store Owner |
| `GET` | `/billing/history` | Get active plan, granted days, renewal days & complete upgrade/subscription history | Store Owner |
| `GET` | `/billing/invoices` | List billing invoices & payment receipts | Store Owner |

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

## 🧪 Comprehensive Automated Testing Architecture

The backend features an **independent modular testing architecture** with 20+ decoupled test files structured across 3 tiers. Run each tier independently or all together:

```bash
# Run all 3 test tiers sequentially (154 tests, 100% pass)
npm test

# Run individual tiers
npm run test:unit         # 67 isolated unit tests
npm run test:integration  # 44 integration tests with real DB
npm run test:e2e          # 43 end-to-end HTTP API tests
```

### Test Breakdown by Tier:

#### 1. Unit Tests (`tests/unit/`) — 59 Tests
- **`password_validation.unit.test.ts`** (7 tests): Length, uppercase, lowercase, numbers, special characters, and `P@ssw0rd2026!` acceptance.
- **`otp_service.unit.test.ts`** (6 tests): 6-digit numeric generation, randomness, bcrypt hashing, verification match, and tampering checks.
- **`billing_service.unit.test.ts`** (13 tests): Cycle days, prices for 1/3/6/12 months, 5-day trial period duration, plan tier upgrade identification, previous plan ID tracking, days granted computation (+90 days), and unexpired active days rollover.
- **`rbac_permissions.unit.test.ts`** (7 tests): Super Admin/Owner bypass, Cashier POS sales, custom permission overrides (`manage_inventory`), and Accountant role.
- **`store_service.unit.test.ts`** (5 tests): Slug sanitization, Ethiopian 15% VAT default, business hours JSON validation, and `hideOutOfStock`.
- **`product_service.unit.test.ts`** (7 tests): Plan limit boundaries (Starter 25, Growth 150), variant price & stock sanitization.
- **`notification_service.unit.test.ts`** (6 tests): Target room resolution (`superadmin`, `store_{id}`, `user_{id}`), `isSeen` filter lifecycle.
- **`tenant_guard.unit.test.ts`** (8 tests): Row-Level Security (RLS) filter injection, tenant ownership validation, staff permission assertion.

#### 2. Integration Tests (`tests/integration/`) — 38 Tests
- **`auth.integration.test.ts`**: Unverified user registration, strict login gate (`403 EMAIL_NOT_VERIFIED`), OTP verification, verified JWT session.
- **`store_tenant.integration.test.ts`**: Store creation auto-assigning 5-day trial on Starter tier, branding customizations, `hideOutOfStock` toggle.
- **`product_variants.integration.test.ts`**: Multi-attribute variants, variant pricing, 25-product Starter cap enforcement with 403 error.
- **`staff_membership.integration.test.ts`**: Secure one-time invite codes, `StoreStaffMember` junction records, active store context switching.
- **`notification_syncboard.integration.test.ts`**: Room routing, popup modal single-fetch `isSeen: true`, persistent bell history.
- **`tenant_isolation.integration.test.ts`**: Cross-tenant data isolation, RLS scoped filtering.

#### 3. End-to-End API Tests (`tests/e2e/`) — 38 Tests
- **`auth_gate.e2e.test.ts`**: Weak password rejection, registration, verification gate, login token issuance.
- **`store_onboarding.e2e.test.ts`**: Store onboarding, duplicate slug rejection (409), settings patching, public storefront fetch.
- **`catalog_variants_limits.e2e.test.ts`**: Variant creation, `GET /products/:id`, 26th product blocked with 403 `PLAN_LIMIT_REACHED`.
- **`staff_invite_multistore.e2e.test.ts`**: Invite dispatch, acceptance, re-use rejection (400), active store switching via `POST /staff/switch-store`.
- **`notifications_syncboard.e2e.test.ts`**: Unseen popups retrieval, duplicate modal prevention on re-login, full bell history.
- **`tenant_security_rls.e2e.test.ts`**: Cross-tenant tampering blocked (403), foreign `x-store-id` spoofing blocked (403), platform admin isolation (403).

---

## 👥 Authentic Ethiopian Demo Accounts (`prisma/seed.ts`)

The database includes realistic Ethiopian merchants (*Addis Fashion Hub*, *Ethio Tech Zone*) with rich product variants, bank details, and compliant strong passwords:

| Role | Email | Password | Store Context / Access |
|---|---|---|---|
| **Super Admin** | `admin@mymall.et` | `P@ssw0rd2026!` | Platform Governance, Banking, Verifications |
| **Store Owner** | `owner@addisfashion.et` | `P@ssw0rd2026!` | Addis Fashion Hub (Bole, Addis Ababa) |
| **Store Owner** | `owner@ethiotech.et` | `P@ssw0rd2026!` | Ethio Tech Zone (Megenagna, Addis Ababa) |
| **Cashier Staff** | `cashier@addisfashion.et` | `P@ssw0rd2026!` | Addis Fashion Hub (POS Counter) |
| **Accountant Staff** | `accountant@addisfashion.et` | `P@ssw0rd2026!` | Addis Fashion Hub (Financial Reports) |
| **Multi-Store Staff** | `staff@multiethio.et` | `P@ssw0rd2026!` | Dual Member: Addis Fashion Hub & Ethio Tech Zone |
| **Customer Shopper** | `customer@addis.et` | `P@ssw0rd2026!` | Verified Buyer Account |

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
| `CLIENT_ORIGIN` | Allowed client origin for CORS & WebSockets | `http://localhost:3000` |
| `FRONTEND_URL` | Frontend URL for payment redirect returns | `http://localhost:3000` |
| `FORCE_SEED` | Force database re-seed in development | `false` |
| `R2_ACCOUNT_ID` | Cloudflare R2 Account ID (Optional, falls back to `/uploads/`) | `576013d...` |
| `R2_ACCESS_KEY_ID` | Cloudflare R2 Access Key ID | `90c002...` |
| `R2_SECRET_ACCESS_KEY` | Cloudflare R2 Secret Access Key | `96574e...` |
| `R2_BUCKET_NAME` | Cloudflare R2 Storage Bucket Name | `mymall-storage` |
| `R2_PUBLIC_DOMAIN` | Optional custom public CDN domain for R2 | `https://pub-xxx.r2.dev` |

---

## 📧 Email SMTP Configuration (Mailpit vs Gmail SMTP)

MyMall uses SMTP for sending 6-digit registration OTP codes, staff invitations, and password reset codes. You can switch between **Mailpit** (for local development & offline testing) and **Google Gmail SMTP** (for production & live testing):

### Option A: Local Development with Mailpit (Zero Auth Required)
Mailpit is a fast, lightweight email testing tool with an embedded web UI that captures all dispatched emails without sending them to real inboxes.

1. **Start Mailpit**:
   - **Without Docker (Recommended for local dev)**:
     ```bash
     npm run mailpit
     ```
     *(Runs the pre-bundled binary in `./bin/mailpit` directly on your system without requiring Docker).*
   - **With Docker Compose**:
     ```bash
     docker compose up -d mailpit
     ```
   - **With Standalone Docker**:
     ```bash
     docker run -d --name mailpit -p 8025:8025 -p 1025:1025 axllent/mailpit:latest
     ```
2. **Configure `.env`**:
   ```env
   SMTP_HOST=localhost
   SMTP_PORT=1025
   SMTP_USER=
   SMTP_PASS=
   EMAIL_FROM="MyMall Local Dev" <noreply@mymall.local>
   ```
3. **View Incoming Emails**:
   Open **`http://localhost:8025`** in your browser. All verification codes and invitations will instantly appear in the web mailbox.

### Option B: Production / Live Testing via Google Gmail SMTP
To send real emails to customer and staff inboxes using Gmail:

1. Enable **2-Step Verification** on your Google Account: [Google Account Security](https://myaccount.google.com/security)
2. Generate an **App Password**: [App Passwords](https://myaccount.google.com/apppasswords)
   - Select App: `Mail`, Device: `Other (MyMall Backend)`
   - Copy the 16-character generated password (e.g., `abcd efgh ijkl mnop`).
3. **Configure `.env`**:
   ```env
   SMTP_HOST=smtp.gmail.com
   SMTP_PORT=587
   SMTP_USER="your_email@gmail.com"
   SMTP_PASS="your_16_char_app_password"
   EMAIL_FROM="your_email@gmail.com"
   ```


---

## ☁️ Cloud Deployment on Render (`render.yaml`)

The repository includes a production-ready **Render Blueprint** specification (`render.yaml`) modeled after the user's deployed `syncboard` configuration:

### Architecture
- **Web Service (`mymall-backend`)**:
  - Runtime: `docker` (Multi-stage build using `node:22-slim`).
  - Automatic deployment from the `main` branch.
  - Health check path at `/health`.
  - Auto-generated production JWT secrets (`generateValue: true`).
  - Auto-wired `DATABASE_URL` connected directly to the managed Render PostgreSQL service.
- **Managed Database (`mymall-postgres`)**:
  - Free-tier PostgreSQL database service on Render in the `oregon` region.

---

## ☁️ Image & Storage Architecture (Cloudflare R2 + Local Server Fallback)

MyMall features a resilient, dual-layer storage pipeline managed by `StorageService`:
- **Cloudflare R2 Object Storage (Production Recommended)**: S3-compatible cloud storage for globally CDN-cached image delivery, eliminating local disk capacity bottlenecks.
  - Required Environment Variables: `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`. Optional: `R2_PUBLIC_DOMAIN`.
- **Zero-Configuration Local Disk Storage Fallback (Automatic)**:
  - If R2 environment tokens are not provided, or if an R2 upload experiences network issues, the system **automatically and gracefully falls back to local disk storage** under `/uploads/`.
  - Subdirectories are automatically created (`uploads/products/`, `uploads/branding/`, `uploads/screenshots/`, `uploads/receipts/`, `uploads/general/`, `uploads/avatars/`).
  - Express statically serves `/uploads/`, and the Next.js frontend proxies `/backend-uploads/*` to `${backendOrigin}/uploads/*`.

---

## 🛍️ Personal Order History for Workers & Store Owners

- **Endpoint**: `GET /api/v1/orders/my-orders`
- **Purpose**: Allows store owners, cashiers, accountants, and inventory clerks to shop across the marketplace as customers using their authenticated account.
- **Isolation**: Strictly segregates their **personal customer purchases** from the store's customer orders (`GET /api/v1/orders`), enabling workers to track personal order status, download receipts, and review deliveries without altering merchant store sales metrics.

---

## 🔒 Zero-Data-Loss Seeding Protection

The database seed script (`prisma/seed.ts`) and Docker entrypoint (`docker-entrypoint.sh`) include an automated **Zero-Data-Loss Guard**:
- **Initial Deployment**: When launching the backend for the first time on a fresh database, `seed.ts` automatically provisions default subscription tiers (Starter, Growth, Enterprise), platform bank accounts, and demo accounts.
- **Redeployments & Restarts**: On any subsequent deployment, container restart, or CI run, the guard checks for existing records (`prisma.user.findFirst()` and `prisma.store.findFirst()`). If data already exists, seeding is **automatically skipped** to ensure live store catalogs, user accounts, and financial transactions are never wiped.
- **Manual Force Re-seed (Development Only)**:
  ```bash
  npx ts-node prisma/seed.ts --force
  # or
  FORCE_SEED=true npm run seed
  ```

---

## ☁️ One-Click Blueprint Deployment via Render (`render.yaml`)

The repository includes a self-contained, production-ready **Render Blueprint** specification ([`render.yaml`](render.yaml)):
- **Zero Manual Service Creation**: You do not need to create the database or web service manually in the Render UI. Connecting the repository as a **Render Blueprint** automatically provisions:
  1. **Managed PostgreSQL Database (`mymall-postgres`)**: Secure, high-performance PostgreSQL instance.
  2. **Docker Web Service (`mymall-backend`)**: Multi-stage production container built from `Dockerfile`, running health checks on `/health`.
  3. **Automated Internal Wiring**: `DATABASE_URL` is automatically wired from the database to the web service via `fromDatabase: { name: mymall-postgres, property: connectionString }`.
  4. **Cryptographic Key Generation**: Production `JWT_SECRET` and `JWT_REFRESH_SECRET` are automatically generated on launch (`generateValue: true`).
  5. **Auto-Migrations & Seeding**: Runs `prisma db push` and initial seed safely protected by the Zero-Data-Loss guard.

---

## 🤖 GitHub Actions CI/CD Pipeline & Deploy Hook

The backend includes a continuous integration and continuous deployment workflow located at [`.github/workflows/ci.yml`](.github/workflows/ci.yml):
- **Triggers**: On every push and pull request to `main` and `master`.
- **Pipeline Stages**:
  1. **Stage 1 (`typecheck`)**: Runs TypeScript build and static analysis.
  2. **Stage 2 (`test`)**: Spins up PostgreSQL service and executes all **154 tests** (67 Unit, 44 Integration, 43 E2E).
  3. **Stage 3 (`docker-check`)**: Validates multi-stage Docker build.
  4. **Stage 4 (`render-deploy`)**: Calls the Render Deploy Hook to deploy automatically upon successful tests.

---

## 📄 License

This project is licensed under the ISC License.

