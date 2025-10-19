# 🪟 Windows Development Guide

## Quick Start for Windows

### Prerequisites

- **Node.js** 18+ ([https://nodejs.org/](https://nodejs.org/))
- **Git** ([https://git-scm.com/](https://git-scm.com/))
- **Git Bash** or **WSL** (recommended for running bash scripts like `local-ci.sh`)
- **Docker Desktop** (optional, for Redis integration tests)
- **PowerShell 5.1+** (built into Windows)

## Running Tests on Windows

### Option 1: PowerShell (Recommended)

Open a PowerShell terminal in the repository root and run:

```powershell
# Run stubbed tests (no external dependencies)
# Recommended: run the Windows helper script in the scripts/ folder
.
\scripts\local-ci-windows.ps1

# Run integration tests (requires Redis)
.
\scripts\local-ci-windows.ps1 integration

# Run all tests
.
\scripts\local-ci-windows.ps1 all

# Show report summary only
.
\scripts\local-ci-windows.ps1 report

# Alternatively you can run via npm (convenience)
npm run local-ci:windows
```

> Notes:
>
> - The PowerShell script runs `npm ci`, ESLint with checkstyle formatter to `test-results/eslint/results.xml`, and Jest with `jest-junit` producing JUnit XML in `test-results/junit` and coverage in `coverage/`.

### Option 2: Git Bash / WSL

If you prefer bash, use `local-ci.sh`:

```bash
# Make bash script executable
chmod +x local-ci.sh

# Run stubbed tests
./local-ci.sh

# Run integration tests
./local-ci.sh integration
```

### Option 3: Direct npm commands

You can also run the npm scripts directly:

```powershell
# Unit tests only
npm test

# Integration tests
npm run test:integration

# All tests with coverage
npm run test:all

# Tests with JUnit reporting
npm run test:junit
```

## Running Integration Tests with Redis (Docker)

If you don't have Redis installed locally you can run it with Docker Desktop:

```powershell
# Start Redis in Docker on default port
docker run -d -p 6379:6379 --name local-redis redis:alpine

# Stop and remove when done
docker stop local-redis; docker rm local-redis
```

Then run the integration mode:

```powershell
.
\local-ci.ps1 integration
```

## Troubleshooting

- If ESLint or Jest report missing packages after a fresh clone, run `npm install` first to generate/update the lockfile.
- If you see native module errors (e.g. missing `sharp`), the local scripts are designed to fallback to in-repo stubs. CI integration jobs install system dependencies before running tests.
- If `local-ci.ps1` fails with permission errors, ensure PowerShell execution policy allows running local scripts: run PowerShell as administrator and execute `Set-ExecutionPolicy RemoteSigned -Scope CurrentUser`.

## Contributing

- Follow the repository linting rules (`npm run lint`) and use `npm run lint:fix` to auto-fix simple issues.
- Add unit tests under `tests/unit` and integration tests under `tests/integration`.

---

If you'd like, I can also add a short PowerShell alias or task in `package.json` to run `local-ci.ps1` from `npm run local-ci` for convenience.
