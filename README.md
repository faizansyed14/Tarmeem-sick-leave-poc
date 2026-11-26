# Tarmeem Leave Verification (POV)

Sick leave certificate verification for Tarmeem Hospital, Abu Dhabi.

Staff upload a sick leave certificate (PDF or Word). The system reads the patient name, Emirates ID, leave dates, doctor and facility, matches it against the customer register, and lets staff confirm it with the customer: a one time code is emailed through Microsoft 365, staff call the customer, and the customer reads the code back.

| Layer    | Stack |
|----------|-------|
| Backend  | Python, FastAPI, SQLAlchemy, SQLite (any SQLAlchemy URL works) |
| Frontend | Next.js 15 (App Router), React 19, Tailwind CSS 4 |
| Email    | Microsoft Graph `sendMail` (client credentials) |

## Run it

Requirements: Python 3.11 or newer, Node.js 20 or newer.

### First time setup

**Backend**

```powershell
cd backend
python -m venv .venv
.venv\Scripts\python -m pip install --upgrade pip
.venv\Scripts\pip install -r requirements.txt
if (-not (Test-Path .env)) { copy .env.example .env }   # then edit SECRET_KEY and ADMIN_PASSWORD in .env
.venv\Scripts\python scripts\make_samples.py   # optional: creates demo files in ..\samples
.venv\Scripts\python -m uvicorn app.main:app --reload --port 8000
```

**Frontend** (in a second terminal)

```powershell
cd frontend
npm install
npm run dev
```

The database (`backend/data/tarmeem.db`) and the admin account are created automatically the first time the backend starts.

### Every time after that

```powershell
# Terminal 1
cd backend
.venv\Scripts\python -m uvicorn app.main:app --reload --port 8000

# Terminal 2
cd frontend
npm run dev
```

### Production build of the frontend (optional)

```powershell
cd frontend
npm run build
npm run start
```

Open http://localhost:3000. The frontend sends `/api/*` requests on to the backend at `http://127.0.0.1:8000`. To use a different address, set `API_URL`.

**Sign in** with `ADMIN_EMAIL` and `ADMIN_PASSWORD` from `backend/.env`. The admin account is created on startup, and its password is reset to the `.env` value on every startup.

## Demo data

`samples/` holds a customer spreadsheet and four certificates. To make them again, run `backend\.venv\Scripts\python backend\scripts\make_samples.py`.

* `customers.xlsx` has 16 rows. One repeats another row's Emirates ID, one has an invalid Emirates ID, one has no email, and one uses another customer's email.
* `sick_leave_fatima.pdf`, `sick_leave_omar.pdf`, `sick_leave_aisha.docx` match on Emirates ID.
* `sick_leave_priya_name_only.pdf` has no Emirates ID, so it matches on name.

To start from an empty database, stop the backend and delete `backend/data/tarmeem.db` and `backend/uploads/`.

## Features

**Authentication**
* Step 1 is email and password.
* Step 2 is set for each user by an administrator on the Users page:
  * **Captcha** (the default, including for the admin): type the characters in a self hosted image. Single use, expires after 3 minutes.
  * **Email OTP**: a 6 digit code emailed through Microsoft 365, valid for 5 minutes.
  * **Microsoft Authenticator**: a 6 digit TOTP code. A user who has not connected the app yet scans a QR code during sign in. An admin can reset the authenticator so the user connects a new phone.
* After 5 failed attempts at either step, the account is locked for 15 minutes.
* The session is a JWT in an httpOnly, SameSite Strict cookie. Changing a password, a role or the active status ends existing sessions.
* Roles are `admin` and `user`. Admins create users (with a generated or manual password), choose each user's second step, change roles, deactivate users, reset passwords and reset authenticators.

**Customer import (admin)**
* Accepts `.xlsx` or `.csv`. Column headers are recognised automatically (for example "Emirates ID", "EID", "Customer Name", "Mobile").
* Before saving, a preview sorts each row into one of:
  * new
  * already in the register
  * in the register with changed details
  * duplicate inside the file
  * invalid
* The preview also warns about emails or phone numbers that another customer already uses.
* You choose whether to update existing customers whose details changed. Every import is kept in the history.

**Sick leave verification**
* Text is read from PDF (pypdf) or DOCX (python-docx, including tables). Fields are then picked out with patterns tuned for UAE certificates.
* Matching order:
  1. Exact Emirates ID.
  2. Fuzzy name match (RapidFuzz).
* A match is linked automatically when:
  * the Emirates ID matches, or
  * there is no Emirates ID on the certificate and one name match is clearly strong.
* Otherwise staff pick from the suggestions, search the register, or correct the extracted fields and match again.
* Verification codes:
  * 6 digits, stored only as a hash, valid for 5 minutes, 5 attempts.
  * Resend is allowed after 30 seconds, and resending cancels the earlier code.
* Status is **Not verified** by default, **Awaiting code** while a code is active, and **Verified** once the customer reads the correct code back.
* After verification, **Send sheet** emails the uploaded certificate to the address that received the code. This needs email to be set up.
* Every step is written to the audit log with the user and IP address.

## Email setup

### Gmail (SMTP)

1. Turn on **2-Step Verification** for the Google account.
2. Create an **app password** at https://myaccount.google.com/apppasswords. Google shows 16 characters.
3. Fill in `backend/.env`:
   ```
   SMTP_HOST=smtp.gmail.com
   SMTP_PORT=587
   SMTP_EMAIL=<your gmail address>
   SMTP_PASSWORD=<16 character app password>
   ```
4. Restart the backend. It reads `.env` only at startup.
5. Send a test email:
   ```powershell
   cd backend
   .venv\Scripts\python scripts\send_test_email.py <recipient>
   ```

Some networks block outgoing email ports. If the test cannot connect, try another network.

### Microsoft Graph

Used when `SMTP_EMAIL` is empty and the `GRAPH_*` values are set. The app registration needs the **Mail.Send** application permission with admin consent.

### No email configured

While `OTP_DEV_MODE=true` and neither is set up, no email is sent. Codes are printed to the backend console and shown in the UI.

## Not production ready yet

* Scanned certificates without a text layer need OCR, which is not included.
* Before going live:
  * Set `COOKIE_SECURE=true` and serve over HTTPS.
  * Replace `SECRET_KEY`.
  * Move from SQLite to SQL Server or PostgreSQL.
  * Store the captcha and import preview data in Redis if you run more than one backend process.
