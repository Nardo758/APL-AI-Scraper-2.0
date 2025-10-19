# APL AI Scraper 2.0

APL AI Scraper 2.0 is an AI-assisted visual web scraper. The project
combines Playwright automation with optional AI-based analysis to give
````markdown
# APL AI Scraper 2.0

APL AI Scraper 2.0 is an AI-assisted visual web scraper. The project
combines Playwright automation with optional AI-based analysis to give
visual extraction and structured data workflows.

## Quick start

These steps get the project running locally for development.

### Prerequisites

- Node.js 18 or newer
- Redis (local or Docker) — optional
- Optional: a Supabase project for integration tests

### Installation

1. Clone the repository and change directory.

```bash
git clone https://github.com/Nardo758/APL-AI-Scraper-2.0.git
cd APL-AI-Scraper-2.0
```

2. Install dependencies.

```bash
npm install
```

3. Copy the example env file and update values.

```bash
cp .env.example .env
```

4. Start required services (if used) and run the app.

```bash
# start redis if you use it (optional)
redis-server
npm run dev
```

## Configuration

Add keys to the `.env` file and keep secrets private.

```env
SUPABASE_URL=
SUPABASE_ANON_KEY=
OPENAI_API_KEY=
ANTHROPIC_API_KEY=
REDIS_URL=redis://localhost:6379
```

## Features

- Playwright browser automation
- Redis / BullMQ job queue
- Optional GPT-based screenshot analysis

## Tests

Run unit tests locally.

```bash
npm test
```

Run tests with external services stubbed.

```bash
npm run test:stubbed
```

## License

MIT


## Migration runner

This repository includes a conservative migration runner at `scripts/run-migrations.js`.

Modes supported:

- `list` (default): prints ordered migration filenames found in the `migrations/` directory.
- `dry-run` / `dr`: prints the first 1000 characters of each migration and its SHA-256 checksum.
- `apply`: applies unapplied migrations to the database when `DATABASE_URL` is set. This mode requires `--yes` to actually run.

Usage examples (PowerShell):

```powershell
# list migrations
node .\scripts\run-migrations.js list

# show migration contents + checksum
node .\scripts\run-migrations.js dry-run

# apply migrations (CAUTION: requires DATABASE_URL and explicit confirmation)
$env:DATABASE_URL = 'postgres://user:pass@host:5432/db'
node .\scripts\run-migrations.js apply --yes
```

Safety and CI recommendations:

- The runner will refuse to apply migrations unless `DATABASE_URL` is present and `--yes` is passed. This reduces accidental changes from CI or local runs.
- In CI, prefer to run `list` or `dry-run` as part of pre-deploy checks. Only run `apply` in a controlled deploy job where DB credentials are securely provided (e.g., GitHub Actions secrets) and the job is restricted to maintainer branches/tags.
- The runner stores applied migration filenames and checksums in a `migration_history` table to avoid reapplying unchanged files. If you change a migration file after it was applied, the runner will attempt to apply it again (if checksum differs) — avoid editing already-applied migrations in production; instead, add a new migration file.

If you'd like, I can add a small CI job snippet for GitHub Actions that runs `run-migrations.js dry-run` on pull requests and only runs `apply` in a protected deploy workflow.

### Example GitHub Actions snippet

Below is a compact example showing how to run a safe `dry-run` during PR checks and how a protected deploy job could run `apply` when secrets are available and the job is restricted to release tags or the `main` branch.

```yaml
# .github/workflows/migrations-check.yml (example)
name: Migrations check

on:
  pull_request:
    paths:
      - 'migrations/**'

jobs:
  dry-run:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: 18
      - name: Install dependencies
        run: npm ci
      - name: Run migrations dry-run
        run: node ./scripts/run-migrations.js dry-run

# Protected apply example (run in deploy workflow only)
# This should be in a controlled workflow with restricted permissions
# and secrets provided (DATABASE_URL). Example deploy job:

# jobs:
#   apply-migrations:
#     if: github.ref == 'refs/heads/main' || startsWith(github.ref, 'refs/tags/')
#     runs-on: ubuntu-latest
#     steps:
#       - uses: actions/checkout@v4
#       - name: Setup Node
#         uses: actions/setup-node@v4
#         with:
#           node-version: 18
#       - name: Install dependencies
#         run: npm ci
#       - name: Apply DB migrations
#         env:
#           DATABASE_URL: ${{ secrets.DATABASE_URL }}
#         run: node ./scripts/run-migrations.js apply --yes
```
```bash
# start redis if you use it (optional)
redis-server
```
