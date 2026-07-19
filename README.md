# SentinelAI

**Your incidents, resolved in seconds.**

SentinelAI is an autonomous incident-response copilot. When a production alert
fires, Sentinel investigates on its own: it scans your GitHub commit history to
find the likely bad change, searches your uploaded runbooks for the right fix
using semantic search, reasons over everything with Gemini, and posts a
concise, actionable incident report straight to your Slack channel — no human
trigger, no waiting for on-call to wake up.

The Slack alert looks like this:

```
🚨 Production Incident

Likely Cause:          Deployment #418
Confidence:            87%
Most Relevant Commit:  Fix authentication middleware
Affected Services:     API Gateway, Authentication
Suggested Runbook:     Authentication Outage Recovery
Next Steps:            Rollback deployment, Restart auth service
```

---

## How it works

```
Alert ─▶ FastAPI backend
             │
             ├─▶ GitHub API      → recent commits + deployments (find the bad change)
             ├─▶ ChromaDB        → semantic search over your runbooks
             ├─▶ Gemini          → root-cause analysis + remediation plan
             └─▶ Slack Webhook   → formatted incident report in your channel
```

The **frontend** (React) lets a user sign up with a username, connect projects
(GitHub repo, Slack webhook, runbooks), manage account settings, and trigger
incident analyses. **Supabase** handles authentication, user profiles,
the projects database, and runbook file storage. The **backend** (FastAPI,
Docker) runs the AI incident pipeline and persists ChromaDB vectors on a
dedicated volume.

**Recommended production layout:** frontend on **Vercel**, backend on **Render**
(or any Docker host with a persistent volume). The backend is not a good fit for
serverless-only deploys because ChromaDB needs durable disk.

---

## Project structure

```
SentinelAI/
├── src/                          # Frontend — React + Vite + Tailwind (dark/green theme)
│   ├── components/
│   │   ├── AppHeader.tsx         # Dashboard header (username, Settings, Sign out)
│   │   ├── AuthLayout.tsx        # Sign-in / sign-up shell
│   │   ├── DeleteAccountModal.tsx
│   │   ├── DeleteProjectModal.tsx
│   │   ├── PasswordRequirements.tsx
│   │   └── …                     # Navbar, Hero, Features, HowItWorks, etc.
│   ├── context/
│   │   └── AuthContext.tsx       # Supabase session + profile provider
│   ├── lib/
│   │   ├── supabase.ts           # Supabase client (auth, DB, storage)
│   │   ├── api.ts                # Client for the FastAPI backend
│   │   ├── profile.ts            # Profile helpers + login username lookup RPCs
│   │   ├── passwordValidation.ts
│   │   └── usernameValidation.ts
│   ├── pages/
│   │   ├── Landing.tsx
│   │   ├── Login.tsx             # Username or email + password
│   │   ├── SignUp.tsx            # Username, email, password + strength meter
│   │   ├── Dashboard.tsx         # Projects list, delete with sudo confirmation
│   │   ├── Settings.tsx          # Change username / email / password, delete account
│   │   ├── AddProject.tsx        # Create & edit projects + runbook upload
│   │   └── ProjectDetail.tsx     # Live incident analysis
│   ├── App.tsx
│   └── index.css
│
├── backend/                      # FastAPI incident-response service (Docker)
│   ├── app/
│   │   ├── main.py               # App factory, CORS (localhost + FRONTEND_URL + Vercel)
│   │   ├── config.py
│   │   ├── models/schemas.py
│   │   ├── services/
│   │   │   ├── github_service.py
│   │   │   ├── slack_service.py
│   │   │   ├── chroma_service.py
│   │   │   ├── gemini_service.py
│   │   │   ├── runbook_validation_service.py  # Semantic section checks + PDF parsing
│   │   │   └── incident_service.py
│   │   └── api/routes/           # health, github, runbooks, incidents
│   ├── requirements.txt
│   ├── Dockerfile
│   ├── docker-compose.yml        # Backend + chroma-data volume
│   └── .env.example
│
├── supabase/
│   └── schema.sql                # profiles, projects, RLS, storage, auth RPCs
│
├── index.html
├── package.json
├── vite.config.ts
├── .env.example
└── README.md

# Not in the repo — created at runtime:
#   chroma-data (Docker volume)   # ChromaDB vectors at /app/data/chroma in the container
```

> **Backend runs in Docker.** The FastAPI app (ChromaDB, Gemini, GitHub, Slack)
> is packaged into one image. Vector data lives in a **separate named volume**
> (`chroma-data`), not in the repo or image.

---

## Prerequisites

- **Docker** + **Docker Compose** — required for the backend (see §3)
- **Node.js** 18+ and npm (frontend)
- A **Supabase** account (free tier is fine)
- A **Gemini API key** — <https://aistudio.google.com/apikey>
- A **GitHub** personal access token (repo read)
- A **Slack** incoming webhook — create an app at <https://api.slack.com/apps>

---

## 1. Database setup (Supabase)

Supabase provides **authentication**, **user profiles**, the **projects
database**, and **runbook file storage**.

1. Go to <https://supabase.com/dashboard> and create a **New project**.
2. Open **SQL Editor → New query**, paste the **entire** contents of
   [`supabase/schema.sql`](supabase/schema.sql), and click **Run**. The file is
   idempotent (safe to re-run) and includes:

   | Section | What it sets up |
   | ------- | ---------------- |
   | 1–2 | `profiles` table (with **username**), Row Level Security |
   | 3 | Trigger: auto-create profile on signup (reads `username` from auth metadata) |
   | 4 | Backfill profiles for existing auth users |
   | 5 | **`projects` table** + RLS |
   | 6 | **`runbooks` private storage bucket** + per-user policies |
   | RPCs | `resolve_login_email`, `is_username_available`, `update_username`, `delete_own_account` |

   **Username rules** (enforced in app + DB): max 20 characters, no spaces,
   unique case-insensitively.

3. Enable email auth: **Authentication → Providers → Email**.
4. Grab credentials for frontend `.env.local`:
   - **Publishable key**: Settings → API Keys → *Publishable and secret API keys*
   - **Project URL**: Integrations → Data API → base URL (drop `/rest/v1`)

   See [`.env.example`](.env.example) for step-by-step dashboard navigation.

---

## 2. Frontend setup

Configuration lives in **`.env.local`** at the repo root (Vite exposes `VITE_*`
variables only).

1. Create it from the template:

   ```bash
   cp .env.example .env.local
   ```

2. Fill in:

   ```env
   VITE_SUPABASE_URL=https://<project-ref>.supabase.co
   VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_xxxxxxxxxxxx
   VITE_API_URL=http://localhost:8000
   ```

3. Install and run:

   ```bash
   npm install
   npm run dev                    # http://localhost:8443
   ```

> Restart the dev server after changing `.env.local`. In production (e.g.
> Vercel), set the same three variables; point `VITE_API_URL` at your deployed
> backend URL.

### Account & UI features

| Area | Behavior |
| ---- | -------- |
| **Sign up** | Username (required), email, password with live strength meter and requirement checklist (8+ chars, symbol, upper, lower, number) |
| **Log in** | **Username or email** + password |
| **Dashboard** | Shows **username** (not email) in the header; **Settings** + red **Sign out** |
| **Settings** | Change username (instant), email (confirmation to new address), password (new + confirm); delete account via `sudo delete [username]` modal |
| **Projects** | Create/edit with GitHub repo, Slack webhook ([get one from Slack apps](https://api.slack.com/apps)), runbooks |
| **Delete project** | In-app modal: confirm → type `sudo delete [Project Name]` |
| **Runbooks** | `.md` or `.pdf`; must include four sections (validated semantically on upload) |

---

## 3. Backend setup (Docker)

ChromaDB and native AI/HTTP dependencies run in a container so behavior is
consistent everywhere. Indexed runbooks persist in the **`chroma-data`** volume.

1. Configure `backend/.env.local`:

   ```bash
   cd backend
   cp .env.example .env.local
   ```

   ```env
   GEMINI_API_KEY=your-gemini-api-key
   GITHUB_TOKEN=your-github-pat
   SLACK_WEBHOOK_URL=https://hooks.slack.com/services/XXX/YYY/ZZZ   # optional fallback
   FRONTEND_URL=http://localhost:8443                               # production: your Vercel URL
   ```

2. Build and start:

   ```bash
   docker compose up --build      # http://localhost:8000
   ```

   - API: <http://localhost:8000>
   - Docs: <http://localhost:8000/docs>

```bash
docker compose down              # stop (keeps ChromaDB volume)
docker compose down -v           # stop and wipe indexed runbooks
```

---

## 4. Production deployment (optional)

| Service | Role | Notes |
| ------- | ---- | ----- |
| **Vercel** | Frontend SPA | Set `VITE_SUPABASE_*` and `VITE_API_URL` in project env vars |
| **Render** (or similar) | Backend Docker service | Mount/persist Chroma volume; set `GEMINI_API_KEY`, `GITHUB_TOKEN`, `FRONTEND_URL` |
| **Supabase** | Auth + DB + storage | Run `schema.sql`; enable Email provider |

On the backend, **`FRONTEND_URL`** must match your live frontend origin for
CORS. The app also allows `https://*.vercel.app` preview URLs.

---

## Environment variables reference

**Frontend** (`.env.local`)

| Variable | Required | Purpose |
| -------- | -------- | ------- |
| `VITE_SUPABASE_URL` | yes | Supabase project URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | yes | Browser-safe Supabase key |
| `VITE_API_URL` | recommended | FastAPI base URL (default `http://localhost:8000`) |

**Backend** (`backend/.env.local`)

| Variable | Required | Purpose |
| -------- | -------- | ------- |
| `GEMINI_API_KEY` | yes | Analysis + runbook embeddings |
| `GITHUB_TOKEN` | rec. | Rate limits; private repos |
| `SLACK_WEBHOOK_URL` | optional | Global fallback webhook |
| `FRONTEND_URL` | prod. | CORS allowlist for your frontend |

---

## API overview

| Method | Path | Description |
| ------ | ---- | ----------- |
| GET | `/health` | Liveness + configured integrations |
| GET | `/api/github/commits` | Recent commits for `?repo=owner/name` |
| GET | `/api/github/deployments` | Recent deployments |
| POST | `/api/runbooks/validate-file` | Upload `.md`/`.pdf`; semantic section validation |
| POST | `/api/runbooks/index-file` | Parse + index a runbook file into ChromaDB |
| POST | `/api/runbooks` | Index runbook JSON body |
| GET | `/api/runbooks/search` | Semantic search (`?q=...`) |
| POST | `/api/incidents/analyze` | Full pipeline → analysis + optional Slack post |
| POST | `/api/incidents/notify` | Post a pre-built analysis to Slack |

Interactive docs: <http://localhost:8000/docs>

### Runbook requirements (upload validation)

Each runbook must cover these four topics (checked semantically, not just by
heading text):

1. How to set up and run the service
2. How to test or verify that it works
3. What common errors or symptoms to look for
4. What action to take for each error

### Example: analyze an incident

```bash
curl -X POST http://localhost:8000/api/incidents/analyze \
  -H 'Content-Type: application/json' \
  -d '{
    "github_repo": "your-org/your-repo",
    "description": "5xx spike on the API gateway after the latest deploy",
    "slack_webhook_url": "https://hooks.slack.com/services/XXX/YYY/ZZZ",
    "deployment": "418"
  }'
```

---

## Typical workflow

1. Run `supabase/schema.sql`, configure `.env.local` files, start backend
   (`docker compose up --build`) and frontend (`npm run dev`).
2. **Sign up** with a username, email, and strong password.
3. On the dashboard, click **New Project** — add a GitHub repo, Slack webhook
   (from <https://api.slack.com/apps>), and upload runbooks (`.md` / `.pdf`).
4. Open the project and click **Analyze Incident**. Sentinel validates and
   indexes runbooks, scans commits, reasons with Gemini, shows results on the
   page, and posts to Slack when a webhook is configured.
5. Use **Settings** (header) to update username, email, or password, or delete
   your account. Delete a project from the dashboard trash icon (requires
   `sudo delete [Project Name]`).
