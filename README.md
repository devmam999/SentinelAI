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

The **frontend** (React) lets a user sign up, connect a project (GitHub repo,
Slack webhook, runbooks), and trigger/inspect incident analyses. **Supabase**
handles authentication, the projects database, and runbook file storage. The
**backend** (FastAPI) runs the AI incident pipeline.

---

## Project structure

```
SentinelAI/
├── src/                          # Frontend — React + Vite + Tailwind (dark/green theme)
│   ├── components/               # Navbar, Hero, Features, HowItWorks, auth layout, etc.
│   ├── context/
│   │   └── AuthContext.tsx       # Supabase session provider
│   ├── lib/
│   │   ├── supabase.ts           # Supabase client (auth, DB, storage)
│   │   └── api.ts                # Client for the FastAPI backend
│   ├── pages/
│   │   ├── Landing.tsx           # Marketing homepage
│   │   ├── Login.tsx / SignUp.tsx
│   │   ├── Dashboard.tsx         # List / create / manage projects
│   │   ├── AddProject.tsx        # Create & edit projects (with runbook upload)
│   │   └── ProjectDetail.tsx     # Status, integrations, live incident analysis
│   ├── App.tsx                   # Routes (public + protected)
│   └── index.css                 # Theme tokens + page animations
│
├── backend/                      # Backend — FastAPI incident-response service (runs in Docker)
│   ├── app/
│   │   ├── main.py               # App factory + router wiring
│   │   ├── config.py             # Env-driven settings
│   │   ├── models/schemas.py     # Pydantic request/response/analysis models
│   │   ├── services/
│   │   │   ├── github_service.py   # Commit / deployment / compare lookups
│   │   │   ├── slack_service.py    # Block Kit incident message + webhook post
│   │   │   ├── chroma_service.py   # Runbook vector store (Gemini embeddings)
│   │   │   ├── gemini_service.py   # Structured analysis + embeddings
│   │   │   └── incident_service.py # Orchestrates the full pipeline
│   │   └── api/routes/           # health, github, runbooks, incidents
│   ├── requirements.txt          # Python deps — the manifest the image builds from
│   ├── Dockerfile                # The app image ("everything else" package)
│   ├── docker-compose.yml        # Runs the backend + mounts ChromaDB's dedicated volume
│   └── .env.example              # Backend env template
│
├── supabase/
│   └── schema.sql                # Database — profiles, projects, RLS, runbooks storage bucket
│
├── index.html
├── package.json                  # Frontend dependencies & scripts
├── vite.config.ts
├── .env.example                  # Frontend env template
└── README.md                     # (this file)

# Not in the repo — created/managed by Docker at runtime:
#   chroma-data (named volume)   # ChromaDB's on-disk vector store, mounted at
#                                # /app/data/chroma inside the backend container.
```

> **Backend runs in Docker.** The FastAPI app (with its embedded ChromaDB
> engine and the Gemini/GitHub/Slack integrations) is packaged into a single
> Docker image, and ChromaDB's data is persisted to a **separate, dedicated
> Docker volume** (`chroma-data`) — it is never stored inside the repo or the
> image itself.

---

## Prerequisites

- **Docker** + **Docker Compose** — **required** to run the backend (see §3)
- **Node.js** 18+ and npm (frontend)
- A **Supabase** account (free tier is fine)
- A **Gemini API key** — <https://aistudio.google.com/apikey>
- A **GitHub** personal access token (repo read) and a **Slack** incoming webhook

---

## 1. Database setup (Supabase)

Supabase provides three things for this app: **authentication**, the
**projects database**, and **runbook file storage**.

1. Go to <https://supabase.com/dashboard> and create a **New project** (pick a
   region, set a database password; provisioning takes ~2 minutes).
2. Open **SQL Editor → New query**, paste the **entire** contents of
   [`supabase/schema.sql`](supabase/schema.sql), and click **Run**. The file is
   safe to re-run and is organized into numbered sections:

   | Section | What it sets up                                                        |
   | ------- | ---------------------------------------------------------------------- |
   | 1–2     | `profiles` table + Row Level Security.                                  |
   | 3       | Trigger that auto-creates a profile row on signup.                     |
   | 4       | Backfills profiles for any users who signed up earlier.               |
   | **5**   | **`projects` table** (name, GitHub repo, Slack webhook, runbooks) + RLS. |
   | **6**   | **`runbooks` private storage bucket** + per-user access policies.       |

   > Sections **5** and **6** are what power the projects + runbook-upload
   > features — make sure they run. Running the whole file end-to-end is the
   > simplest way to guarantee that.

3. Enable email auth: **Authentication → Providers → Email**.
4. Grab your credentials for the frontend `.env.local` (next step):
   - **Publishable key**: Settings → API Keys → *Publishable and secret API keys*
     tab → copy the `sb_publishable_...` default key.
   - **Project URL**: Integrations → Data API → *API URL*,
     e.g. `https://<project-ref>.supabase.co/rest/v1` (remember to remove the /rest/v1).

   > Full step-by-step (including where these moved in the new dashboard) is
   > also documented in [`.env.example`](.env.example).

---

## 2. Frontend setup

The frontend reads its configuration from a **`.env.local`** file at the repo
root (Vite only exposes variables prefixed with `VITE_`).

1. Create it from the template:

   ```bash
   # from the repo root
   cp .env.example .env.local
   ```

2. Fill in the three values (from the Supabase step above + your backend URL):

   ```env
   # .env.local
   VITE_SUPABASE_URL=https://<project-ref>.supabase.co
   VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_xxxxxxxxxxxx
   VITE_API_URL=http://localhost:8000        # base URL of the FastAPI backend
   ```

3. Install dependencies and start the dev server:

   ```bash
   npm install
   npm run dev                    # http://localhost:8443
   ```

> `.env.local` is gitignored, so your credentials are never committed. If you
> change it while the dev server is running, **restart `npm run dev`** so Vite
> picks up the new values. In production, set `VITE_API_URL` to your deployed
> backend URL.

---

## 3. Backend setup (Docker)

**Docker is required to run the backend — always.** ChromaDB and the AI/HTTP
libraries pull in native dependencies whose builds differ across operating
systems and CPUs, so the backend runs inside a container to guarantee it behaves
identically on every machine (yours, a teammate's, or a server). The setup has
two parts:

- **The app package** — the FastAPI backend, plus its embedded ChromaDB engine
  and the Gemini / GitHub / Slack integrations, is built into a **single Docker
  image** from `requirements.txt`.
- **A dedicated volume for ChromaDB data** — the runbook vector store is
  persisted to a **separate, Docker-managed named volume** (`chroma-data`),
  mounted into the container at `/app/data/chroma`. This keeps indexed runbooks
  intact across rebuilds/restarts and separate from the app image.

### Steps

1. Configure the backend. All config lives in `backend/.env.local`:

   ```bash
   cd backend
   cp .env.example .env.local
   ```

   ```env
   # backend/.env.local
   GEMINI_API_KEY=your-gemini-api-key
   GITHUB_TOKEN=your-github-pat                 # recommended (avoids rate limits)
   SLACK_WEBHOOK_URL=https://hooks.slack.com/services/XXX/YYY/ZZZ   # optional fallback
   ```

2. Build and start it (from `backend/`):

   ```bash
   docker compose up --build      # serves on http://localhost:8000
   ```

   - API: <http://localhost:8000>
   - Interactive docs: <http://localhost:8000/docs>

The `chroma-data` volume is created automatically on first run and reused
afterward. Useful commands:

```bash
docker volume ls                 # list volumes (look for "backend_chroma-data")
docker compose down              # stop the backend (KEEPS the ChromaDB volume/data)
docker compose down -v           # stop AND delete the ChromaDB volume (wipes runbooks)
```

When deploying, set the frontend's `VITE_API_URL` to your public backend URL.

---

## Environment variables reference

**Frontend** (`.env.local`)

| Variable                        | Required    | Purpose                                                             |
| ------------------------------- | ----------- | ------------------------------------------------------------------ |
| `VITE_SUPABASE_URL`             | yes         | Supabase project URL.                                              |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | yes         | Supabase publishable (browser-safe) key.                          |
| `VITE_API_URL`                  | recommended | Base URL of the FastAPI backend. Defaults to `http://localhost:8000` if unset — set it for any non-local backend. |

**Backend** (`backend/.env.local`)

| Variable            | Required | Purpose                                          |
| ------------------- | -------- | ------------------------------------------------ |
| `GEMINI_API_KEY`    | yes      | Powers analysis **and** runbook embeddings.      |
| `GITHUB_TOKEN`      | rec.     | Avoids rate limits; required for private repos.   |
| `SLACK_WEBHOOK_URL` | optional | Global fallback webhook (per-project overrides).  |

---

## API overview

| Method | Path                      | Description                                   |
| ------ | ------------------------- | --------------------------------------------- |
| GET    | `/health`                 | Liveness + which integrations are configured. |
| GET    | `/api/github/commits`     | Recent commits for `?repo=owner/name`.        |
| GET    | `/api/github/deployments` | Recent deployments for a repo.                |
| POST   | `/api/runbooks`           | Index a runbook for semantic search.          |
| GET    | `/api/runbooks/search`    | Semantic search runbooks (`?q=...`).          |
| POST   | `/api/incidents/analyze`  | Full pipeline → analysis + Slack post.        |
| POST   | `/api/incidents/notify`   | Post a pre-built analysis to Slack.           |

Interactive docs are served at <http://localhost:8000/docs> when the backend is
running.

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

This runs the full pipeline and (when a webhook is provided) posts the
`🚨 Production Incident` report shown at the top of this README to Slack.

---

## Typical workflow

1. Start the backend (`docker compose up --build`) and the frontend (`npm run dev`).
2. Sign up, then click **New Project** and connect a GitHub repo, a Slack
   webhook, and upload runbooks (`.md` / `.pdf`).
3. Open the project and click **Analyze Incident** (optionally describe the
   alert). Sentinel indexes your markdown runbooks, scans commits, reasons with
   Gemini, renders the incident on the page, and posts the report to Slack.
