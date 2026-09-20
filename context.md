# System Context & Architecture Guide: Club Recruitment WebApp

## 1. Overview & Purpose

The **Club Recruitment Payment Validation WebApp** is a specialized recruitment and payment verification system developed for **SEDS CUSAT** (Students for the Exploration and Development of Space, CUSAT Chapter) and **IRES** (Innovation Research and Exploration of Space).

### Core Problem Solved
Managing membership and recruitment drives involves collecting student details, coordinating across multiple club wings/teams, collecting registration fees via direct bank transfer or UPI, and verifying transaction UTR (Unique Transaction Reference) numbers against banking records without fraud or manual chaos.

### Primary Capabilities
- **Obfuscated Team Links**: Applicants cannot register arbitrarily without a unique coordinator-issued team link (e.g., `/register/tech_9k2f1`).
- **Payment Verification Workflow**: Applicants transfer the required registration fee to the club's bank account, enter the 12-digit numeric UTR/UPI reference, and attach a payment screenshot.
- **Admin Management Portal**: Single-pane dashboard at `/admin` to search, filter, manually verify/unverify registrations, inspect uploaded payment screenshots, export clean CSV reports, rotate secret team invitation slugs, and manage bank account details and fee pricing.
- **Resilient Self-Contained Monorepo**: Operates with a Vite + React frontend and an Express + SQLite backend designed for seamless single-instance deployment (e.g., on Railway) with persistent disk volume support.

---

## 2. Technology Stack

| Layer | Technology | Key Details / Libraries |
|---|---|---|
| **Frontend Framework** | React 19 + Vite 8 | Single Page Application (SPA), React Router DOM v7 |
| **Styling & Design System** | Vanilla CSS | Custom design tokens, glassmorphism, Satoshi & DM Sans typography, responsive layout |
| **Backend Framework** | Node.js (18+) + Express 4 | RESTful JSON API, multipart handling |
| **Database** | SQLite via `better-sqlite3` | Local file-based, WAL mode enabled for high concurrency |
| **Session & Auth** | `express-session` + SQLite Store | Custom persistent `SqliteSessionStore` storing sessions in SQLite `sessions` table |
| **File Storage** | Multer | Uploaded payment screenshots stored in `server/data/uploads/screenshots/` (5MB limit) |
| **Shared Constants** | JSON (`shared/constants.json`) | Single source of truth for valid team keys and display labels across frontend and backend |

---

## 3. Repository & Directory Structure

```
/Users/sangeethps/form/
├── client/                     # Frontend Vite + React application
│   ├── public/                 # Static assets (logos, favicon, SVGs)
│   │   ├── seds_logo.png
│   │   ├── ires_logo.png
│   │   └── favicon.svg
│   ├── src/
│   │   ├── assets/             # Bundled image assets
│   │   ├── pages/
│   │   │   ├── Register.jsx    # Candidate registration form & bank transfer display
│   │   │   ├── Admin.jsx       # Password-protected admin dashboard
│   │   │   └── NotFound.jsx    # 404 page for invalid/expired team links
│   │   ├── App.jsx             # React Router setup (/register/:team, /admin, *)
│   │   ├── index.css           # Global stylesheet and design system
│   │   └── main.jsx            # React root entry point
│   ├── package.json
│   └── vite.config.js          # Proxies /api and /uploads to backend (port 3001)
│
├── server/                     # Backend Express server & database
│   ├── data/                   # Persistent data directory (recommended for volume mounting)
│   │   ├── registrations.db    # SQLite database file
│   │   └── uploads/
│   │       ├── screenshots/    # Uploaded applicant payment receipts
│   │       ├── qr/             # Legacy/reserved uploads
│   │       └── temp/           # Temporary processing directory
│   ├── middleware/
│   │   └── adminAuth.js        # Session authentication middleware, login & logout handlers
│   ├── routes/
│   │   ├── register.js         # Public endpoints: registration submission, fee, bank info, slug verification
│   │   └── admin.js            # Protected endpoints: CRUD registrations, CSV export, slugs, settings
│   ├── tests/                  # Automated integration and unit test suites
│   │   ├── phase1.test.js      # DB schema & initialization tests
│   │   ├── phase2.test.js      # Public registration endpoints tests
│   │   ├── phase3.test.js      # Admin CRUD & auth tests
│   │   ├── bank_settings.test.js # Bank settings API tests
│   │   └── phase7.integration.test.js # End-to-end user & admin flow test
│   ├── db.js                   # SQLite database initialization & migrations
│   ├── index.js                # Server entry point, session setup, route mounting & static serving
│   ├── package.json
│   ├── seed.js                 # Database seed script with realistic sample registrations
│   └── sessionStore.js         # Custom better-sqlite3 session store for express-session
│
├── shared/
│   └── constants.json          # Shared teams and team labels (JSON)
│
├── logos/                      # High-resolution branding assets
├── dummy_statement.csv         # Sample bank statement data for testing
├── package.json                # Root monorepo orchestration (install, build, start scripts)
├── README.md                   # Getting started & quick-reference guide
└── context.md                  # This architectural reference documentation
```

---

## 4. Shared Domain Model (Teams & Wings)

Teams are defined in [`shared/constants.json`](file:///Users/sangeethps/form/shared/constants.json) and shared between client and server:

| Team Key (`VALID_TEAMS`) | Display Name (`TEAM_LABELS`) | Description |
|---|---|---|
| `tech` | Technical | Software, firmware, web development, hardware |
| `curation` | Curation | Workshop planning, speaker outreach, curriculum |
| `outreach` | Outreach | External relations, school/college networking |
| `media` | Media | Photography, videography, graphic design |
| `production` | Production | Event production, staging, logistics execution |
| `ambience` | Ambience | Venue aesthetic, decor, creative setup |
| `event` | Event | Day-of event coordination, flow management |
| `operations` | Operations | Organizational operations, administrative support |
| `sponsorship` | Sponsorship | Corporate fundraising, sponsor outreach |
| `content` | Content | Technical writing, social copy, announcements |
| `hr` | HR | Internal member engagement, interviews, team health |
| `project` | Project | Long-term space & rocketry project tracks |

---

## 5. Database Schema & State Management

Database engine: **SQLite 3** managed via `better-sqlite3` in [`server/db.js`](file:///Users/sangeethps/form/server/db.js) with Write-Ahead Logging (`WAL`) enabled.

### Tables

#### 1. `registrations`
Stores student applications.
```sql
CREATE TABLE IF NOT EXISTS registrations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  department TEXT NOT NULL,
  year TEXT NOT NULL,
  team_selected TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  utr_number TEXT NOT NULL,
  screenshot_path TEXT,
  verified INTEGER DEFAULT 0,
  submitted_at TEXT DEFAULT (datetime('now', 'localtime')),
  flagged INTEGER DEFAULT 0,
  payment_status TEXT DEFAULT NULL
);
```

#### 2. `settings`
General key-value store for app configuration and unique team slugs.
```sql
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT
);
```
**Common Keys in `settings`:**
- `registration_fee`: String number representing the current registration fee in INR (default: `349`).
- `team_slug_<teamKey>`: Obfuscated 5-character alphanumeric token representing the active recruitment link (e.g. `team_slug_tech` = `tech_x8a2q`).
- `bank_name`: Registered bank name (e.g., `Federal Bank`).
- `account_holder`: Account holder name (e.g., `SEDS CUSAT`).
- `account_number`: 9-18 digit account number.
- `ifsc_code`: 11-character IFSC code (e.g., `FDRL0001234`).
- `branch_name`: Account branch name (e.g., `CUSAT Campus`).

#### 3. `sessions`
Persists active admin user sessions.
```sql
CREATE TABLE IF NOT EXISTS sessions (
  sid TEXT PRIMARY KEY,
  expired INTEGER NOT NULL,
  sess TEXT NOT NULL
);
```
Managed by [`server/sessionStore.js`](file:///Users/sangeethps/form/server/sessionStore.js), which auto-prunes expired sessions every 6 hours and updates on session access.

#### 4. `qr_audit_log`
Historical audit trail schema for payment configuration updates.
```sql
CREATE TABLE IF NOT EXISTS qr_audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  changed_at TEXT,
  ip_address TEXT,
  previous_filename TEXT,
  new_filename TEXT
);
```

---

## 6. Detailed Application Workflows

### 6.1 Candidate Registration Workflow (`/register/:slug`)

1. **Accessing Form**:
   - The student navigates to a team-specific link: `https://<domain>/register/<team_slug>` (e.g. `/register/tech_a8b9c`).
   - The frontend calls `GET /api/register/verify-team?slug=<slug>`.
   - If valid, the team name is locked and displayed automatically.
   - If invalid or missing, the student is redirected to the customized [`NotFound.jsx`](file:///Users/sangeethps/form/client/src/pages/NotFound.jsx) page requesting a valid link from team leads.
2. **Reviewing Bank Transfer Details**:
   - The form renders the active **Registration Fee** (fetched via `GET /api/settings/fee`).
   - If configured, an account details card displays the Bank Name, Account Holder Name, Account Number, IFSC Code, and Branch Name with one-click **Copy** buttons.
3. **Submitting Registration**:
   - Candidate inputs:
     - **Full Name** (string, required)
     - **Department** (string, required, e.g., CSE, ECE, ME)
     - **Year** (select: `1st`, `2nd`, `3rd`, `4th`)
     - **UTR / UPI Reference Number** (must be exact 12-digit numeric)
     - **Payment Screenshot** (file upload, PNG/JPG/JPEG, max 5MB, required)
   - Submitted via `multipart/form-data` to `POST /api/register`.
   - File is saved to `server/data/uploads/screenshots/<utr>_<timestamp><ext>`.
   - Upon success, the UI displays a confirmed checkmark animation state.

### 6.2 Admin Portal Workflow (`/admin`)

1. **Authentication**:
   - Admin accesses `/admin`. If unauthenticated, a clean login form is shown.
   - Submits password to `POST /api/admin/login`.
   - Verified against `ADMIN_PASSWORD` (defaults to `admin123` if not provided in environment).
   - Session stored in SQLite; cookie `connect.sid` issued with 4-hour lifespan.
2. **Dashboard Features**:
   - **Registrations Tab**:
     - Live count of total submissions.
     - Search filter: searches across candidate name, department, or UTR.
     - Status toggle: All / Verified / Pending.
     - Team dropdown filter: Filter by specific team wing or General.
     - Actions per row:
       - Toggle Verify / Unverify status (`PATCH /api/admin/registrations/:id/verify` or `/unverify`).
       - Delete registration (`DELETE /api/admin/registrations/:id`), which also unlinks and deletes the screenshot file on disk.
       - "View" button opening the uploaded screenshot in a new tab via `/uploads/screenshots/...`.
     - **Export CSV**: Triggers `GET /api/admin/export/csv` to download an escaped, formatted CSV of all candidates.
   - **Team Links Tab**:
     - Lists all 12 teams with their generated URL: `${origin}/register/${slug}`.
     - "Copy Link" button for easy sharing.
     - "Regenerate Link" button: Prompt confirmation, rotates the slug to a fresh random value in the database, immediately invalidating the previous URL.
   - **Bank Settings Tab**:
     - Change the active registration fee (₹).
     - Update bank account details (Bank Name, Account Holder, Account Number, IFSC Code, Branch Name) with format validation. Setting them empty hides the bank card on the registration page.
   - **Logout**: Clears cookie and destroys session in SQLite.

---

## 7. API Reference

### 7.1 Public Endpoints

| Method | Endpoint | Description | Payload / Query | Response |
|---|---|---|---|---|
| `POST` | `/api/register` | Submit candidate application | `multipart/form-data`: `name`, `department`, `year`, `team_selected`, `utr_number`, `screenshot` (file) | `{ "success": true, "id": 1 }` |
| `GET` | `/api/settings/fee` | Get current registration fee | None | `{ "fee": 349 }` |
| `GET` | `/api/settings/bank` | Get active bank transfer details | None | `{ "bank_name": "...", "account_holder": "...", ... }` |
| `GET` | `/api/register/verify-team` | Validate team slug from URL | Query: `?slug=<slug>` | `{ "success": true, "team": "tech", "label": "Technical" }` |

### 7.2 Admin Authentication Endpoints

| Method | Endpoint | Description | Payload | Response |
|---|---|---|---|---|
| `POST` | `/api/admin/login` | Log in to admin dashboard | JSON: `{ "password": "..." }` | `{ "success": true }` (Sets cookie) |
| `POST` | `/api/admin/logout` | Destroy active session | None | `{ "success": true }` |

### 7.3 Admin Protected Endpoints (`/api/admin/*`, requires session)

| Method | Endpoint | Description | Payload | Response |
|---|---|---|---|---|
| `GET` | `/api/admin/registrations` | Fetch all applications (sorted by `submitted_at DESC`) | None | Array of registration objects with `screenshot_url` |
| `PATCH` | `/api/admin/registrations/:id/verify` | Mark registration as verified | None | `{ "success": true }` |
| `PATCH` | `/api/admin/registrations/:id/unverify` | Revert verification status | None | `{ "success": true }` |
| `DELETE` | `/api/admin/registrations/:id` | Delete record & screenshot file | None | `{ "success": true }` |
| `GET` | `/api/admin/export/csv` | Download registrations as CSV file | None | CSV file stream (`registrations.csv`) |
| `GET` | `/api/admin/teams/slugs` | List all team slug mappings | None | Object: `{ "tech": "tech_8af21", ... }` |
| `POST` | `/api/admin/teams/slugs/regenerate` | Rotate secret slug for a team | JSON: `{ "team": "tech" }` | `{ "success": true, "slug": "tech_9kd2a" }` |
| `GET` | `/api/admin/settings/fee` | Get fee for admin panel | None | `{ "fee": 349 }` |
| `POST` | `/api/admin/settings/fee` | Update registration fee | JSON: `{ "fee": 399 }` | `{ "success": true, "fee": 399 }` |
| `PATCH` | `/api/admin/settings/bank` | Update organization bank details | JSON: `{ "bank_name": "...", "account_number": "...", ... }` | `{ "success": true, "bank_details": { ... } }` |

---

## 8. Validation Rules & Security Practices

- **UTR Validation**: Strict server and client regex check: `/^\d{12}$/` (exactly 12 numeric digits).
- **Screenshot Constraints**:
  - Max file size: **5MB** enforced via Multer.
  - Content check: image mimetypes only (`image/*`).
  - Stored outside public web root; served via restricted static handler at `/uploads/screenshots/`.
  - Filename sanitized using `<utr>_<timestamp><ext>` to prevent directory traversal or collision.
- **Bank Info Validation**:
  - Account Number: 9 to 18 digits (`/^\d{9,18}$/`).
  - IFSC Code: Standard Indian format regex (`/^[A-Z]{4}0[A-Z0-9]{6}$/`).
- **Session Protection**:
  - `httpOnly: true` (inaccessible to malicious client scripts).
  - `sameSite: 'lax'`.
  - Sessions backed by SQLite DB rather than Node memory to survive process restarts.
- **CSV Injection Prevention**:
  - Values exported to CSV escape quotes and wrap multi-line/comma-separated strings in quotes.

---

## 9. Development & Testing Guide

### Prerequisites
- **Node.js**: v18.0.0 or higher
- **npm**: v9.0.0 or higher

### Local Development Setup

```bash
# 1. Install root, client, and server dependencies
npm install --prefix server
npm install --prefix client

# 2. Start backend server (Terminal 1)
cd server
npm run dev
# Express runs on http://localhost:3001

# 3. Start frontend dev server (Terminal 2)
cd client
npm run dev
# Vite runs on http://localhost:5173 (proxies /api & /uploads to :3001)
```

### Environment Variables

| Variable | Scope | Default | Description |
|---|---|---|---|
| `PORT` | Server | `3001` | Express server port |
| `ADMIN_PASSWORD` | Server | `admin123` | Password used to log into `/admin` |
| `SESSION_SECRET` | Server | Random 32-byte hex | Session encryption key |
| `NODE_ENV` | Server | `development` | Set to `production` for static build serving |
| `VITE_BASE_URL` | Client | Browser origin | Base URL for constructing team links |

### Test Suites

The backend includes test scripts under `server/tests/`:

```bash
cd server

# Phase 1: Database creation & query tests (runs offline without server)
npm run test:phase1

# End-to-end endpoint tests (require server running on :3001)
npm run test:phase2     # Registration flow & input validations
npm run test:phase3     # Admin CRUD & auth validations
npm run test:bank       # Bank settings & IFSC validations
npm run test:phase7     # Comprehensive integration test
```

### Database Seeding
To populate realistic sample candidate data for local development:
```bash
cd server
node seed.js
```

---

## 10. Production Deployment (e.g., Railway, Render, Docker)

The root [`package.json`](file:///Users/sangeethps/form/package.json) orchestrates production builds:
```json
{
  "scripts": {
    "install-client": "npm install --prefix client --include=dev",
    "install-server": "npm install --prefix server",
    "build-client": "npm run build --prefix client",
    "postinstall": "npm run install-client && npm run install-server && npm run build-client",
    "start": "node server/index.js"
  }
}
```

1. **Build Step**: When deployed, `postinstall` automatically builds the Vite client into `client/dist`.
2. **Serving**: In `NODE_ENV=production`, Express serves the static build files from `client/dist` and routes non-API routes to `client/dist/index.html`.
3. **Persistence**: The folder `server/data/` holds both `registrations.db` and uploaded screenshots in `server/data/uploads/screenshots/`. In cloud platforms like Railway, mount a persistent volume to `/app/server/data` to ensure all registration submissions and screenshots persist indefinitely across redeployments.
