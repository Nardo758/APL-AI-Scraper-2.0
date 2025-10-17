# Testing Strategy & Environment Setup

## 🧪 Testing Approach

This project uses a **hermetic testing strategy** that works both with and without external services.

### Local Development (Stubbed)
- No external credentials required — runs on any platform
- Fast execution — uses in-memory and module-level stubs/mocks
- Stable results — no network flakiness

### CI / Integration Testing (Real Services)
- Use real Supabase and Redis when credentials are provided
- End-to-end validation against live infra
- Recommended for release pipelines and integration verification

---

## 🔧 Environment Configuration

### For Local Testing (Recommended)

No environment variables are required; the code will automatically detect missing credentials and fall back to local stubs.

Run unit tests (fast):

```powershell
npm test
```

Run integration tests (stubbed by default):

```powershell
npm run test:integration
```


### For Integration Testing with Real Services

To run integration tests against real Supabase and Redis, set the following environment variables (example PowerShell):

```powershell
$env:SUPABASE_URL = "https://your-project.supabase.co"
$env:SUPABASE_ANON_KEY = "your-anon-key"
$env:REDIS_URL = "redis://localhost:6379"
npm run test:integration
```

On Unix shells (bash):

```bash
SUPABASE_URL=https://your-project.supabase.co SUPABASE_ANON_KEY=your-anon-key REDIS_URL=redis://localhost:6379 npm run test:integration
```

---

## 🏗 Architecture

Service stubs and mocks used during local testing:

- `services/core/supabase.js` — in-repo Supabase-like stub used when `SUPABASE_URL` is missing or invalid
- `tests/mocks/redis-mock.js` — redis/ioredis module mocks used in Jest mappings

Automatic behavior:
- Services use the real clients when credentials/environment variables are present. Otherwise they automatically fall back to in-memory or module-level stubs to keep tests hermetic.


## 🧭 Test Structure

```
tests/
├── unit/           # Fast, isolated tests
├── integration/    # Integration tests (stubbed by default, can be run with real services)
├── mocks/          # External service mocks
└── setup-*.js      # Test environment configuration files
```

---

## 🚀 Running Tests

```powershell
# Unit tests only (fastest)
npm test

# Integration tests (stubbed by default)
npm run test:integration

# All tests with coverage
npm run test:all

# Watch mode
npm run test:watch
```

---

## 🔍 Test Patterns & Guidance

Mocking external services

```javascript
// Services automatically use stubs when:
// - NODE_ENV === 'test'
// - Environment variables (SUPABASE_URL, REDIS_URL) are missing
// - The service client throws during initialization
```

Writing testable code

```javascript
// Use dependency injection for testability
class MyService {
  constructor(dependencies = {}) {
    this.redis = dependencies.redis || createRedisClient();
  }
}
```

---

If you prefer always using real services locally, export or set the environment variables above and run the `test:integration` script.
