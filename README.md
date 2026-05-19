# Jira Worklog Agent

Automate daily Jira worklog recording with AI-powered ticket recommendations.

## Features

- ⏰ **Daily Reminder** - Automatic notification at 17:00 on workdays
- 🤖 **AI Recommendation** - LLM analyzes your Git commits, Jira activity, and history to suggest tickets
- ⚡ **One-Click Submit** - Pre-selected tickets with smart 8-hour allocation
- 🔍 **Quick Search** - Add tickets by key or URL
- 📅 **History Tracking** - View past worklogs and patterns
- 🪲 **Bug Handling** - Create subtasks for Bug worklogs
- 🔔 **Repeated Alerts** - Reminds every 5 minutes until you log time

## Tech Stack

- **Backend**: Node.js + Express + SQLite (sql.js)
- **Frontend**: React + TypeScript + Vite + TanStack Query
- **AI**: OpenAI SDK (supports custom endpoints like DeepSeek, Azure)
- **Package**: Single Windows executable (~38MB)

## Installation

### From Release

1. Download `jira-worklog-agent.exe` from [Releases](https://github.com/xilovesyu/jira-worklog-agent/releases)
2. Configure `.env` with your Jira API token (see below)
3. Double-click to run, open `http://localhost:7301`

### From Source

```bash
# Clone repository
git clone https://github.com/xilovesyu/jira-worklog-agent.git
cd jira-worklog-agent

# Install dependencies
npm install
cd ui && npm install && cd ..

# Configure (see below)
cp .env.example .env
cp config.yaml.example config.yaml  # or use default config.yaml

# Run in dev mode
npm run dev:all
```

Open `http://localhost:7302` in browser.

## Configuration

### Environment Variables (.env)

```bash
# Jira Configuration
JIRA_SERVER=https://your-company.atlassian.net
JIRA_API_TOKEN=your-api-token

# LLM Configuration (for AI recommendations)
OPENAI_API_KEY=your-api-key
OPENAI_BASE_URL=https://api.deepseek.com  # Optional: custom endpoint
OPENAI_MODEL=deepseek-chat                  # Model name

# Server Ports
API_PORT=7301
UI_PORT=7302
```

### How to Get Jira API Token

**Jira Cloud:**
1. Go to https://id.atlassian.com/manage-profile/security/api-tokens
2. Click "Create API token"
3. Copy token to `.env`

**Jira Server/Data Center:**
1. Go to Jira → User Settings → Personal Access Tokens
2. Create new token
3. Copy token to `.env`

### Config File (config.yaml)

```yaml
timezone: "local"

jira:
  server_timezone: "America/Los_Angeles"  # Jira server timezone

scheduler:
  trigger_time: "17:00"       # Daily reminder time
  timezone: "Asia/Shanghai"
  reminder_interval: 5        # Repeat interval (minutes)
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

ai:
  automation_level: "semi"    # none, semi, full
  confidence_threshold: 85
```

## Usage

### Main Interface

1. **Select Date** - Choose the date to log work (defaults to today)
2. **Review Tickets** - AI recommends tickets based on your activity
3. **Adjust Allocation** - Modify hours per ticket if needed
4. **Submit** - One-click to log 8 hours to Jira

### Quick Actions

- **"Same as Yesterday"** - Copy yesterday's allocation
- **Search Tickets** - Add by ticket key (e.g., `PROJ-123`) or URL
- **Filters** - Filter by project, backlog area, ticket type

### AI Automation Levels

| Level | Behavior |
|-------|----------|
| **none** | AI disabled, manual selection only |
| **semi** | AI recommends, user approves before submit |
| **full** | High-confidence recommendations auto-submit |

## Build

```bash
# Build frontend + backend + package as exe
npm run build

# Build Windows installer (requires Inno Setup 6)
npm run build:installer
```

Output in `dist/`:
- `jira-worklog-agent.exe` - Single executable
- `ui/` - Frontend assets
- `config.yaml` - Config template

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/tickets` | Get recommended tickets + filters |
| GET | `/api/search?key=PROJ-123` | Search ticket by key/URL |
| POST | `/api/submit` | Submit worklog to Jira |
| GET | `/api/worklog/:date` | Get existing worklogs for date |
| GET | `/api/check/:date` | Compare local vs Jira worklogs |
| GET | `/api/history` | Worklog history list |
| GET | `/api/ai/recommendation` | AI-powered ticket suggestion |
| POST | `/api/ai/submit` | Submit AI recommendation |
| GET | `/api/ai/config` | AI automation settings |
| GET | `/api/ai/llm/status` | LLM provider status |

## Development

```bash
# Run backend with watch mode
npm run dev

# Run frontend dev server
cd ui && npm run dev

# Run both concurrently
npm run dev:all

# Run tests
npm test

# Run tests with watch
npm run test:watch
```

## Project Structure

```
jira-worklog-agent/
├── src/                    # Backend
│   ├── index.mjs           # Entry + scheduler
│   ├── jiraClient.mjs      # Jira REST API
│   ├── storage.mjs         # SQLite (sql.js)
│   ├── config.mjs          # Config loader
│   ├── routes/             # Express routes
│   └── ai/                 # LLM recommendation engine
├── ui/                     # Frontend
│   └── src/
│       ├── App.tsx         # Main component
│       ├── pages/          # LogPage, HistoryPage
│       ├── components/     # UI components
│       └── api/            # TanStack Query hooks
├── installer/              # Windows installer
├── scripts/                # Build scripts
├── config.yaml             # Default config
├── .env.example            # Environment template
└── package.json
```

## License

MIT

---

Built for developers who forget to log time. Let AI handle it.