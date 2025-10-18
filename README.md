# APL AI Scraper 2.0

APL AI Scraper 2.0 is an AI-assisted visual web scraper. The project
combines Playwright automation with optional AI-based analysis to give
visual extraction and structured data workflows.

## Quick start

These steps get the project running locally for development.

### Prerequisites

- Node.js 18 or newer
- Redis (local or Docker)  optional
- Optional: a Supabase project for integration tests

### Installation

1. Clone the repository and change directory.

```bash
git clone https://github.com/Nardo758/APL-AI-Scraper-2.0.git
cd APL-AI-Scraper-2.0
```

1. Install dependencies.

```bash
npm install
```

1. Copy the example env file and update values.

```bash
cp .env.example .env
```

1. Start required services (if used) and run the app.

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
