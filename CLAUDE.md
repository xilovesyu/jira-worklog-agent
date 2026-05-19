# CLAUDE.md - Jira Worklog Agent Project Guide

## Project Overview

A desktop application that automates daily Jira worklog recording with AI-powered ticket recommendations. Built with Node.js backend and React frontend, packaged as a single Windows executable.

## Architecture

```
Backend (Node.js + Express)
├── src/
│   ├── index.mjs          # Entry point, Express server, cron scheduler
│   ├── api.mjs            # Route aggregator (imports from routes/)
│   ├── config.mjs         # YAML + .env configuration loader
│   ├── jiraClient.mjs     # Jira REST API (search, worklog, transitions)
│   ├── storage.mjs        # SQLite via sql.js (history, AI config)
│   ├── smartSelector.mjs  # Rule-based ticket recommendation
│   ├── allocator.mjs      # Time allocation algorithms
│   ├── utils.mjs          # Date/time helpers, timezone handling
│   ├── ticketParser.mjs   # Jira issue → Ticket object parsing
│   ├── paths.mjs          # Cross-platform data directory resolution
│   ├── routes/            # Modular Express routes
│   │   ├── index.mjs      # Route registration
│   │   ├── tickets.mjs    # /api/tickets, /api/search
│   │   ├── worklog.mjs    # /api/submit, /api/worklog, /api/check
│   │   ├── ai.mjs         # /api/ai/recommendation, /api/ai/config
│   │   ├── config.mjs     # /api/config
│   │   └ reminder.mjs    # /api/reminder
│   └── ai/                # LLM-powered recommendation engine
│       ├── llmEngine.mjs      # OpenAI SDK wrapper (supports custom baseURL)
│       ├── evidenceCollector.mjs  # Collect user activity evidence
│       ├── confidenceCalculator.mjs  # Pre-filter for LLM
│       ├── intelligentDecision.mjs   # LLM decision + execution

Frontend (React + Vite + TypeScript)
├── ui/src/
│   ├── App.tsx            # Main app with HashRouter
│   ├── main.tsx           # React entry point
│   ├── pages/
│   │   ├── LogPage.tsx    # Main ticket selection + submission
│   │   └── HistoryPage.tsx # Worklog history view
│   ├── components/        # UI components
│   │   ├── AiRecommendationPanel.tsx  # AI suggestion UI
│   │   ├── TicketList.tsx             # Multi-select ticket list
│   │   ├── TimeAllocator.tsx          # Hour distribution display
│   │   ├── CalendarSection.tsx        # Date picker
│   │   ├── QuickActions.tsx           # Submit/skip buttons
│   │   ├── BugWorklogModal.tsx        # Bug → subtask handling
│   │   ├── TicketSearch.tsx           # Search by key/URL
│   │   ├── FiltersSection.tsx         # Project/area filters
│   ├── api/
│   │   ├── queries.ts     # TanStack Query hooks for all APIs
│   ├── config/
│   │   ├── envConfig.ts   # VITE_* env variable reader
│   ├── types/
│   │   ├── index.ts       # TypeScript type definitions
│   └── utils/
│       ├── helpers.ts     # Date formatting, allocation calc
```

## Key Files Reference

| File | Purpose | When to modify |
|------|---------|----------------|
| `src/index.mjs` | Server startup, cron scheduler (17:00 reminder) | Change ports, scheduler timing |
| `src/jiraClient.mjs` | All Jira REST API calls | Add new Jira operations |
| `src/storage.mjs` | SQLite schema and queries | Add new tables/data storage |
| `src/config.mjs` | Config loading (YAML + .env) | Add new config options |
| `src/ai/llmEngine.mjs` | LLM client (OpenAI SDK) | Change LLM provider/model |
| `ui/src/pages/LogPage.tsx` | Main user interface | UI logic changes |
| `ui/src/api/queries.ts` | API hooks | Add new API endpoints |
| `ui/src/types/index.ts` | TypeScript types | Add/update data types |

## Configuration

### Environment Variables (.env)
```bash
JIRA_SERVER=https://your-company.atlassian.net
JIRA_API_TOKEN=your-token
OPENAI_API_KEY=your-key        # For AI recommendations
OPENAI_BASE_URL=https://api.deepseek.com  # Optional: custom LLM endpoint
OPENAI_MODEL=deepseek-chat     # Model name
API_PORT=7301
UI_PORT=7302
```

### YAML Config (config.yaml)
```yaml
timezone: "local"              # Date operations timezone
jira:
  server_timezone: "America/Los_Angeles"  # Jira server TZ for worklog
scheduler:
  trigger_time: "17:00"        # Daily reminder time
  timezone: "Asia/Shanghai"
  reminder_interval: 5         # Repeat interval (minutes)
  enabled: true
worklog:
  default_hours: 8
  preselect_count: 3
llm:
  provider: "openai"
  api_key_env: "OPENAI_API_KEY"
  max_tokens: 1024
  temperature: 0.3
  enabled: true
```

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/tickets` | GET | Get recommended tickets + filters |
| `/api/search` | GET | Search ticket by key/URL |
| `/api/submit` | POST | Submit worklog to Jira |
| `/api/worklog/:date` | GET | Get existing worklogs for date |
| `/api/check/:date` | GET | Compare local vs Jira worklogs |
| `/api/history/yesterday` | GET | Yesterday's allocation |
| `/api/history` | GET | Worklog history list |
| `/api/ai/recommendation` | GET | AI-powered ticket suggestion |
| `/api/ai/submit` | POST | Submit AI recommendation |
| `/api/ai/config` | GET/POST | AI automation settings |
| `/api/ai/llm/status` | GET | LLM provider status |
| `/api/ai/llm/cost` | GET | LLM usage statistics |
| `/api/reminder` | POST | Trigger/skip reminder |

## Database Schema (SQLite)

### Tables
- `worklog_history` - Submitted worklogs (issue_key, date, hours)
- `recent_tickets` - Frequently used tickets cache
- `allocation_history` - Time allocation records
- `ai_config` - AI automation settings
- `ai_decision_history` - LLM decisions with reasoning
- `llm_call_log` - API call tracking for cost

## Development Commands

```bash
# Backend development
npm run dev              # Start with --watch
npm start                # Start normally

# Frontend development
cd ui && npm run dev     # Vite dev server on port 7302

# Both together
npm run dev:all          # Concurrent backend + frontend

# Testing
npm test                 # Run vitest
npm run test:watch       # Watch mode

# Production build
npm run build            # Full build: UI → bundle → exe
npm run build:installer  # Build + Windows installer
```

## Key Implementation Patterns

### Jira API Integration (`src/jiraClient.mjs`)
- Uses axios with Bearer token auth
- JQL queries for ticket search
- Changelog extraction for user activity analysis
- Worklog CRUD operations

### Time Allocation (`src/allocator.mjs`, `ui/src/utils/helpers.ts`)
- Distributes hours evenly across selected tickets
- Handles floating point rounding (total = exactly 8h)
- Supports historical ratio-based allocation

### AI Recommendation (`src/ai/intelligentDecision.mjs`)
- Collects evidence: Git commits, Jira activity, history
- LLM analyzes and recommends tickets with explanation
- Confidence levels: high/medium/low
- Auto-submit for high confidence (configurable)

### Frontend State Management
- TanStack Query for API data caching
- Local state for selections
- URL params for date selection

## Common Modification Tasks

### Add new Jira field to track
1. Update JQL fields in `jiraClient.mjs` searchMyTickets()
2. Add field to `ticketParser.mjs` parseTicket()
3. Add to TypeScript type in `ui/src/types/index.ts`
4. Display in UI components if needed

### Add new API endpoint
1. Create route in `src/routes/*.mjs`
2. Register in `src/routes/index.mjs`
3. Add query hook in `ui/src/api/queries.ts`
4. Use in React component

### Change LLM provider
1. Update `.env` with new API key and base URL
2. Update `config.yaml` llm.provider and model
3. No code changes needed (OpenAI SDK compatible)

### Modify reminder behavior
1. Edit `src/index.mjs` scheduler config
2. Change trigger time in `config.yaml`

## Testing

Tests are in `tests/unit/` and `tests/integration/`:
- Unit tests: allocator, smartSelector, ticketParser, utils
- Integration tests: jiraClient, routes, storage

Run with `npm test` or `vitest`.

## Build Process

1. `npm run build:ui` - Build React frontend → `dist/ui/`
2. `npm run build:embed-wasm` - Embed SQLite wasm into JS
3. `npm run build:bundle` - esbuild bundle Node.js code
4. `npm run build:pkg` - pkg creates single exe (~38MB)
5. `npm run build:copy-to-dist` - Copy config templates

Output: `dist/jira-worklog-agent.exe` + `dist/ui/` + `dist/config.yaml`

## Notes

- Uses sql.js (SQLite in JS) for embedded database, no native dependency
- Data stored in `%APPDATA%/jira-worklog-agent/data/` on Windows
- Timezone handling is critical for worklog date matching
- Jira Server timezone may differ from local timezone