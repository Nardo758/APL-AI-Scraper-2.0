# APL AI Scraper 2.0 ðŸ¤–ðŸ•·ï¸

> **Next-Generation AI-Powered Visual Web Scraper with Advanced Automation**

APL AI Scraper 2.0 is a cutting-edge web scraping platform that combines the power of GPT-4V vision analysis, Claude AI text processing, and advanced Playwright automation to create an intelligent, visual web scraping solution.

## âœ¨ Key Features

### ðŸ§  AI-Powered Intelligence
- **GPT-4V Integration**: Analyze screenshots to automatically identify scraping targets
- **Claude AI Strategy Generation**: Generate optimal scraping strategies and code
- **Smart Site Discovery**: AI-powered website discovery based on user queries
- **Intelligent Selector Optimization**: Auto-optimize CSS selectors for reliability

### ðŸŽ¯ Advanced Scraping Engine
- **Playwright-Based**: Modern, fast, and reliable browser automation
- **Stealth Mode**: Advanced anti-detection techniques and human-like behavior
- **Multi-Format Support**: Extract text, images, links, tables, and structured data
- **Dynamic Content Handling**: JavaScript-heavy sites and SPAs supported

### ðŸ”„ Scalable Job Processing
- **Redis-Powered Queue**: BullMQ job queue with retry logic and monitoring
- **Concurrent Processing**: Multi-worker architecture for parallel scraping
- **Real-time Monitoring**: Live job status and progress tracking
- **Error Recovery**: Intelligent retry mechanisms with exponential backoff

### ðŸ’¾ Robust Data Management
- **Supabase Backend**: Scalable PostgreSQL database with real-time features
- **JSON Storage**: Flexible schema-less data storage with full-text search
- **Data Export**: Multiple export formats (JSON, CSV, Excel)
- **Version Control**: Track data changes and scraping history

## ðŸš€ Quick Start

### Prerequisites
- Node.js 18+
- Redis server
- Supabase account
- OpenAI API key (for GPT-4V)
- Anthropic API key (for Claude)

### Installation

1. **Clone the repository:**
```bash
git clone https://github.com/Nardo758/APL-AI-Scraper-2.0.git
cd APL-AI-Scraper-2.0
```

2. **Install dependencies:**
```bash
npm install
```

### Windows quick start (PowerShell)

If you're developing on Windows and prefer an automated local CI helper, we've included a PowerShell script and npm convenience scripts.

Run the consolidated local CI (stubbed tests) with:

```powershell
npm run local-ci:windows
# or run the script directly
powershell -NoProfile -ExecutionPolicy Bypass -File .\local-ci.ps1 stubbed
```
```

3. **Configure environment:**
```bash
cp .env.example .env
# Edit .env with your API keys and configuration
```

4. **Set up database:**
```bash
# Run the Supabase migration
# Copy the contents of migrations/001_initial_schema.sql
# and run it in your Supabase SQL editor
```

5. **Start Redis:**
```bash
# On Windows (if Redis is installed)
redis-server

# Or using Docker
docker run -d -p 6379:6379 redis:alpine
```

6. **Start the application:**
```bash
# Development mode
npm run dev

# Production mode
npm start
```

## ðŸ“– API Documentation

### Core Endpoints

#### Projects
- `POST /api/projects` - Create a new project
- `GET /api/projects` - List user projects
- `GET /api/projects/:id` - Get project details

#### Scraping Jobs
- `POST /api/jobs` - Create a scraping job
- `GET /api/jobs/:id` - Get job status and results
- `GET /api/projects/:id/jobs` - List project jobs

#### AI Services
- `POST /api/ai/discover-sites` - AI-powered site discovery
- `POST /api/ai/analyze-screenshot` - GPT-4V screenshot analysis

### Example Usage

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
        {
          name: 'title',
          selector: 'h1',
          type: 'text'
        },
        {
          name: 'products',
          selector: '.product-item',
          type: 'text',
          multiple: true
        }
      ],
      actions: [
        {
          type: 'click',
          selector: '.load-more-btn',
          delay: 1000
        }
      ]
    }
  })
});
```

## ðŸ—ï¸ Architecture

### System Components

```
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”    â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”    â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚   Frontend UI   â”‚â”€â”€â”€â–ºâ”‚  Express Server  â”‚â”€â”€â”€â–ºâ”‚   Supabase DB   â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜    â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜    â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
                                â”‚
                                â–¼
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”    â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”    â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚  AI Services    â”‚â—„â”€â”€â”€â”‚   Job Queue      â”‚â”€â”€â”€â–ºâ”‚ Playwright      â”‚
â”‚ (GPT-4V/Claude) â”‚    â”‚   (BullMQ)       â”‚    â”‚ Scrapers        â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜    â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜    â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
                                â”‚
                                â–¼
                       â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
                       â”‚  Redis Queue     â”‚
                       â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
```

### Technology Stack
- **Backend**: Node.js, Express.js
- **Database**: Supabase (PostgreSQL)
- **Queue**: Redis, BullMQ
- **Scraping**: Playwright
- **AI**: OpenAI GPT-4V, Anthropic Claude
- **Authentication**: JWT, Supabase Auth

## ðŸ”§ Configuration

### Environment Variables

Key configuration options:

```env
# Required
SUPABASE_URL=your_supabase_url
SUPABASE_ANON_KEY=your_supabase_key
OPENAI_API_KEY=your_openai_key
ANTHROPIC_API_KEY=your_anthropic_key
REDIS_URL=redis://localhost:6379

# Optional
WORKER_CONCURRENCY=3
BROWSER_HEADLESS=true
USE_STEALTH_MODE=true
```

## ðŸ“„ License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## ðŸ†˜ Support

- **Issues**: [GitHub Issues](https://github.com/Nardo758/APL-AI-Scraper-2.0/issues)
- **Discussions**: [GitHub Discussions](https://github.com/Nardo758/APL-AI-Scraper-2.0/discussions)

---

**Built with â¤ï¸ by the APL Team**

## Continuous Integration

This repository includes an enhanced GitHub Actions configuration that runs a cross-platform test matrix, an integration job (with Redis service), SonarCloud analysis, and security/SARIF scans.

Artifacts and reports produced by CI (stored under the workflow run artifacts):

- test-results/junit/*.xml — JUnit-style test reports (jest-junit)
- coverage/ — Coverage reports (lcov/html)
- test-results/eslint/results.xml — ESLint checkstyle output
- reports/ — OWASP dependency-check SARIF output

Required GitHub repository secrets for the enhanced CI jobs:

- SONAR_TOKEN — SonarCloud token (if you want automatic Sonar scans)
- SNYK_TOKEN — Snyk API token (for security scans)
- SUPABASE_URL and SUPABASE_ANON_KEY — for real integration tests (optional; CI uses stubs if missing)

To run the local CI simulation (stubbed tests):

On macOS / Linux:

```bash
./local-ci.sh stubbed
```

On Windows (PowerShell):

```powershell
bash ./local-ci.sh stubbed
```


## 🚀 Continuous Integration

### Test Matrix
The CI pipeline runs tests in multiple configurations:

| Job | Platforms | Node Versions | Services |
|-----|-----------|---------------|----------|
| Stubbed Tests | Ubuntu, Windows, macOS | 18.x, 20.x | In-memory stubs |
| Integration Tests | Ubuntu | 20.x | Real Redis + Supabase* |
| Security Scan | Ubuntu | 20.x | Security audit |

*Integration tests require Supabase credentials as GitHub secrets

### GitHub Secrets Required
For full integration testing, set these repository secrets:
- `SUPABASE_URL` - Your Supabase project URL
- `SUPABASE_ANON_KEY` - Your Supabase anon key
- `SNYK_TOKEN` - (Optional) Snyk API token for security scanning

### Local CI Simulation

```bash
# Simulate stubbed CI tests
npm run test:stubbed

# Simulate integration CI tests (requires services)
docker run -d -p 6379:6379 redis:alpine
npm run test:real
```
