# Club Recruitment Payment Validation WebApp

A web application for managing club recruitment payments. Students register by paying a fee via UPI and submitting their transaction reference (UTR) number. Admins verify payments by matching UTRs against bank statements or SMS messages.

## Project Structure

```
form/
├── client/          # React + Vite frontend
│   ├── src/
│   │   ├── pages/
│   │   │   ├── Register.jsx    # Registration form
│   │   │   └── Admin.jsx       # Admin dashboard
│   │   ├── App.jsx
│   │   ├── main.jsx
│   │   └── index.css
│   └── vite.config.js
├── server/          # Express + SQLite backend
│   ├── routes/
│   │   ├── register.js     # Registration endpoints
│   │   ├── admin.js        # Admin CRUD endpoints
│   │   └── verify.js       # Statement/SMS verification
│   ├── middleware/
│   │   └── adminAuth.js    # Session-based auth
│   ├── tests/              # Test files for each phase
│   ├── uploads/            # Uploaded files (screenshots, QR)
│   ├── data/               # SQLite database
│   ├── db.js               # Database setup
│   └── index.js            # Express server
└── README.md
```

## Getting Started

### Prerequisites

- Node.js 18+ (required for native fetch in tests)
- npm

### Installation

```bash
# Install server dependencies
cd server
npm install

# Install client dependencies
cd ../client
npm install
```

### Running

```bash
# Terminal 1: Start the server
cd server
npm run dev
# Server runs on http://localhost:3001

# Terminal 2: Start the client
cd client
npm run dev
# Client runs on http://localhost:5173
```

The Vite dev server proxies all `/api` requests to the Express backend automatically.

### Default Admin Password

- **Default password**: `admin123`
- **To change**: Set the `ADMIN_PASSWORD` environment variable before starting the server:
  ```bash
  ADMIN_PASSWORD=your_secure_password node index.js
  ```
- You can also set `SESSION_SECRET` for a fixed session secret (otherwise a random one is generated each restart).

## How It Works

### Registration Flow

1. Student visits the registration page
2. Scans the QR code to pay the registration fee via UPI
3. Fills in the form with their details and the 12-digit UTR number
4. Optionally uploads a screenshot of the payment
5. Submits the form

### Admin Verification Flow

1. Admin logs in at `/admin`
2. **Option A — Bank Statement**: Upload a CSV or XLSX bank statement. The system automatically extracts UTRs and matches them against unverified registrations.
3. **Option B — SMS**: Paste a bank SMS containing a UTR. The system extracts the UTR and verifies the matching registration.
4. **Option C — Manual**: Click "Verify" next to any registration in the table.

## Finding Your UTR Number

### Google Pay (GPay)
1. Open Google Pay
2. Tap on the payment you made
3. Look for **"UPI transaction ID"** — this is a 12-digit number
4. Copy it and paste it into the registration form

### PhonePe
1. Open PhonePe → Go to **History**
2. Tap the transaction
3. Look for **"Transaction ID"** or **"UTR Number"**
4. It's a 12-digit number — copy and paste it

### Bank SMS
Your bank sends an SMS after every UPI payment. Look for:
- "UPI Ref No XXXXXXXXXXXX"
- "Ref No. XXXXXXXXXXXX"
- "UTR XXXXXXXXXXXX"

The 12-digit number is your UTR.

## Federal Bank Statement Export

To download your bank statement for auto-verification:

1. Log in to **Federal Bank Net Banking** (https://www.fednetbank.com)
2. Navigate to **Accounts → Account Statement**
3. Select your account and date range
4. Choose format: **CSV** or **Excel (.xlsx)**
5. Click **Download**
6. Upload the downloaded file in the admin dashboard under "Statement Verification"

## Running Tests

```bash
cd server

# Phase 1: Database setup
node tests/phase1.test.js

# Phase 2: Registration endpoints (server must be running)
node tests/phase2.test.js

# Phase 3: Admin endpoints (server must be running)
node tests/phase3.test.js

# Phase 4: Statement/SMS verification (server must be running)
node tests/phase4.test.js

# Phase 7: Full integration test (server must be running)
node tests/phase7.integration.test.js
```

## API Endpoints

### Public
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/register` | Submit a registration (multipart/form-data) |
| GET | `/api/settings/qr` | Get current QR code URL |

### Auth
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/admin/login` | Login with password |
| POST | `/api/admin/logout` | Logout / destroy session |

### Admin (requires session)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/admin/registrations` | List all registrations |
| PATCH | `/api/admin/registrations/:id/verify` | Mark as verified |
| PATCH | `/api/admin/registrations/:id/unverify` | Mark as unverified |
| DELETE | `/api/admin/registrations/:id` | Delete a registration |
| GET | `/api/admin/export/csv` | Download CSV export |
| POST | `/api/admin/settings/qr` | Upload QR code image |
| POST | `/api/admin/verify/statement` | Upload bank statement for auto-verify |
| POST | `/api/admin/verify/sms` | Verify from SMS text |
