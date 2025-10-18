# APL AI Scraper 2.0

APL AI Scraper 2.0 is a visual web scraping platform that combines
vision-capable models, assistant models, and Playwright automation to
provide intelligent scraping workflows.

## Quick start

### Prerequisites

- Node.js 18+
- Redis server (local or Docker)
- Supabase project (optional)
- OpenAI API key (for GPT-4V)
- Anthropic API key (for Claude)

### Installation

1. Clone the repository:

   ```bash
   git clone https://github.com/Nardo758/APL-AI-Scraper-2.0.git
   cd APL-AI-Scraper-2.0
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Configure environment:

   ```bash
   cp .env.example .env
   # Edit .env with your API keys and configuration
   ```

4. Set up the database:

   Copy the SQL from `migrations/001_initial_schema.sql` into your
   Supabase SQL editor and run it, or use your migration workflow.

5. Start Redis (local):

   ```bash
   redis-server
   ```

   or with Docker:

   ```bash
   docker run -d -p 6379:6379 redis:alpine
   ```

6. Start the application:

   ```bash
   # Development
   npm run dev

   # Production
   npm start
   ```

## Features

- Playwright-based browser automation
- GPT-4V-driven screenshot analysis (optional)
- Assistant-model planning (Claude)
- Redis/BullMQ job queue for scalable scraping
- Supabase (Postgres) backend for storage and realtime updates

## API overview

### Projects

- `POST /api/projects` — create a new project
- `GET /api/projects` — list user projects
- `GET /api/projects/:id` — get project details

### Scraping jobs

- `POST /api/jobs` — create a scraping job
- `GET /api/jobs/:id` — get job status and results
- `GET /api/projects/:id/jobs` — list project jobs

### AI services

- `POST /api/ai/discover-sites` — AI-powered site discovery
- `POST /api/ai/analyze-screenshot` — GPT-4V screenshot analysis

### Example usage

```javascript
// Create a new scraping job
const job = await fetch('/api/jobs', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    project_id: 'your-project-id',
    url: 'https://example.com',
    config: {
      extractors: [
        { name: 'title', selector: 'h1', type: 'text' },
        { name: 'products', selector: '.product-item', type: 'text', multiple: true }
      ],
      actions: [ { type: 'click', selector: '.load-more-btn', delay: 1000 } ]
    }
  })
});
```

## Configuration

Create a `.env` file with required keys (use `.env.example` as a
template):

```env
# Required
SUPABASE_URL=your_supabase_url
SUPABASE_ANON_KEY=your_supabase_key
OPENAI_API_KEY=your_openai_key
ANTHROPIC_API_KEY=your_anthropic_api_key
REDIS_URL=redis://localhost:6379

# Optional
WORKER_CONCURRENCY=3
BROWSER_HEADLESS=true
USE_STEALTH_MODE=true
```

## Continuous integration

The repository includes GitHub Actions that run tests, static
analysis, and optional integration jobs. CI produces test reports,
coverage, and static analysis artifacts.

Required (optional) secrets for full integration testing:

- `SUPABASE_URL` and `SUPABASE_ANON_KEY` for Supabase integration
- `SNYK_TOKEN` or `SONAR_TOKEN` for additional security scans

### Running CI locally (simulated)

On macOS / Linux:

```bash
./local-ci.sh stubbed
```

On Windows (PowerShell):

```powershell
# Run the consolidated local CI (stubbed tests)
npm run local-ci:windows
# or run the PowerShell helper directly
powershell -NoProfile -ExecutionPolicy Bypass -File .\local-ci.ps1 stubbed
```

### Local test helpers

```bash
# Simulate stubbed CI tests
npm run test:stubbed

# Simulate integration CI tests (requires services)
docker run -d -p 6379:6379 redis:alpine
npm run test:real
```

## License

This project is licensed under the MIT License — see `LICENSE` for
details.

## Support

- Issues: [project issues](https://github.com/Nardo758/APL-AI-Scraper-2.0/issues)
- Discussions: [project discussions](https://github.com/Nardo758/APL-AI-Scraper-2.0/discussions)

Built with ❤️ by the APL Team
