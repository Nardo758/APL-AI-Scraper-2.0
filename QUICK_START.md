# 🚀 Quick Start - Testing

## For Most Development (recommended)

```powershell
# Run unit tests and fast integration tests (stubbed by default)
npm test
```

## For Full Integration Testing (with real services)

PowerShell example:

```powershell
# Set your Supabase credentials (optional)
$env:SUPABASE_URL = "https://your.supabase.co"
$env:SUPABASE_ANON_KEY = "your-anon-key"
$env:REDIS_URL = "redis://localhost:6379"

# Run integration tests against real services
npm run test:integration
```

Bash example:

```bash
SUPABASE_URL=https://your.supabase.co SUPABASE_ANON_KEY=your-anon-key REDIS_URL=redis://localhost:6379 npm run test:integration
```

## CI / Production-like Testing

Spin up external services (Redis, Supabase) and run `npm run test:real` in a CI environment. Example using docker-compose:

```bash
docker-compose up -d redis
# provide SUPABASE_URL and SUPABASE_ANON_KEY in CI environment variables
npm run test:real
```

## Notes

- Local development will use stubs automatically when credentials are not present.
- Tests are intentionally hermetic to run quickly on different developer machines and CI environments.
