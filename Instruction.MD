# Running ELECTROHACK 2.0 Inventory Locally

This project now uses **PostgreSQL** (migrated from MongoDB). These are the exact steps used to get it running on this machine (Windows, no admin rights available). PostgreSQL's official installer needs admin privileges, so it's run here as a portable, no-service instance instead.

## 1. Install npm dependencies

```bash
cd E:/inventory.electrohack2.0
npm install
```

## 2. Get PostgreSQL running

### Already set up on this machine

PostgreSQL was extracted (not installed) to avoid needing admin rights, and the data directory already exists. To start it again after a reboot:

```bash
"/c/Users/aryan/postgres/pgsql/bin/pg_ctl.exe" -D "C:\Users\aryan\postgres-data" -l "C:\Users\aryan\postgres-data\server.log" start
```

To stop it:

```bash
"/c/Users/aryan/postgres/pgsql/bin/pg_ctl.exe" -D "C:\Users\aryan\postgres-data" stop
```

It listens on `postgresql://postgres:postgres@localhost:5432`. The app database is `electrohack` (already created).

### Setting this up from scratch elsewhere

If you're on a machine with admin rights, it's simpler to just install PostgreSQL normally (via the [official installer](https://www.postgresql.org/download/windows/) or `winget install PostgreSQL.PostgreSQL.17`) and let it run as a Windows service.

If you *don't* have admin rights (like here), use the portable binaries zip instead:

```powershell
# Download the portable binaries (no installer, no admin rights needed)
curl -L -o postgres.zip https://get.enterprisedb.com/postgresql/postgresql-17.6-1-windows-x64-binaries.zip

# Extract it — use `unzip` if available, NOT PowerShell's Expand-Archive
# (Expand-Archive is extremely slow on archives with many small files;
#  it can take 10x+ longer than `unzip` for this ~330MB / ~30k-file archive)
unzip -q postgres.zip -d "C:\Users\<you>\postgres"

# Initialize the data directory (UTF8 encoding, trust auth for local dev)
"C:\Users\<you>\postgres\pgsql\bin\initdb.exe" -D "C:\Users\<you>\postgres-data" -U postgres -A trust -E UTF8 --locale=C

# Start the server
"C:\Users\<you>\postgres\pgsql\bin\pg_ctl.exe" -D "C:\Users\<you>\postgres-data" -l "C:\Users\<you>\postgres-data\server.log" start

# Create the app database
"C:\Users\<you>\postgres\pgsql\bin\createdb.exe" -U postgres -h localhost electrohack
```

Note: `get.enterprisedb.com` can be slow/unstable — if the download resets partway through, resume it with `curl -C -` instead of restarting from zero.

## 3. Configure environment variables

Create a `.env` file in the project root (already done on this machine):

```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/electrohack
GEMINI_API_KEY=your_api_key_here
PORT=3000
NODE_ENV=development
```

## 4. Start the backend

```bash
cd E:/inventory.electrohack2.0
node server.js
```

You should see `✅ Connected to PostgreSQL` and `🚀 Server running on port 3000`. On first run it automatically creates the `components`, `teams`, `requests`, and `request_items` tables and seeds a few starter components — no manual migration step needed. Health check: `http://localhost:3000/api/health`.

## 5. Start the frontend

In a separate terminal:

```bash
cd E:/inventory.electrohack2.0
npm run dev
```

Vite serves the app at `http://localhost:5173`.

## 6. Use the app

- Frontend: http://localhost:5173
- Backend API: http://localhost:3000/api

Run all three (`pg_ctl` / postgres, `node server.js`, `npm run dev`) at the same time, each in its own terminal/background process.

## Data model notes (Mongo → Postgres migration)

- All IDs are now Postgres `UUID`s (via `gen_random_uuid()`, from the `pgcrypto` extension) instead of Mongo `ObjectId`s — still plain strings from the frontend's perspective, so no frontend changes were needed.
- The embedded `items` array on each request (previously a Mongoose subdocument array) is now a normalized `request_items` table with a foreign key to `requests` and `components`.
- The API request/response shapes are unchanged — `server.js` maps snake_case SQL columns back to the same camelCase JSON fields the frontend already expects.
