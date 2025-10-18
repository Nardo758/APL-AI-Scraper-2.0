# APL AI Scraper 2.0

A small README with steps to run the project locally for development.

## Quick start

Prerequisites:

- Node.js 18+
- Redis (local or Docker)
- Optional: Supabase project

Install:

1. Clone the repository and change directory.

   ```bash
   git clone https://github.com/Nardo758/APL-AI-Scraper-2.0.git
   cd APL-AI-Scraper-2.0
   ```

2. Install dependencies.

   ```bash
   npm install
   ```

3. Copy the env example and edit.

   ```bash
   cp .env.example .env
   ```

4. Start Redis.

   ```bash
   redis-server
   ```

5. Start the app in development.

   ```bash
   npm run dev
   ```

## Features

- Playwright browser automation
- Redis / BullMQ job queue
- Optional GPT-4V screenshot analysis

## Configuration

Add keys to `.env` as needed.

```env
SUPABASE_URL=
SUPABASE_ANON_KEY=
OPENAI_API_KEY=
ANTHROPIC_API_KEY=
REDIS_URL=redis://localhost:6379
```

## Tests

Run unit tests:

```bash
npm test
```

## License

MIT
