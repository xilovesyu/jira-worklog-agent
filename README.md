# Jira Worklog Auto-Recorder Agent

Automatically remind you to log daily work hours on Jira tickets.

## Setup

### 1. Configure Jira API

1. Go to Jira → Settings → Personal → API Tokens
2. Create an API token
3. Copy `.env.example` to `.env` and fill in your credentials:

```bash
cp .env.example .env
```

Edit `.env`:
```
JIRA_SERVER=https://your-company.atlassian.net
JIRA_EMAIL=your@email.com
JIRA_API_TOKEN=your-api-token
```

### 2. Install Dependencies

Backend:
```bash
npm install
```

Frontend:
```bash
cd ui
npm install
```

## Usage

### MVP Manual Mode

Start backend API:
```bash
npm run dev
```

Start frontend UI:
```bash
cd ui
npm run dev
```

Open browser: http://localhost:7302

### Auto Mode (Phase 2)

Coming soon - automatic daily reminder at 17:00.

## Features

- **Smart Recommendation**: Automatically pre-selects your most-used tickets
- **Time Allocation**: Distributes 8 hours across selected tickets
- **Quick Actions**: "Same as yesterday" for quick submission
- **History Tracking**: Remembers your preferences over time

## Architecture

```
Backend (Node.js + Express)
├── src/
│   ├── index.mjs      # Entry point
│   ├── jiraClient.mjs # Jira API
│   ├── storage.mjs    # SQLite storage
│   ├── api.mjs        # REST API
│   └── ...

Frontend (React + Vite)
├── ui/src/
│   ├── App.tsx        # Main component
│   ├── components/    # TicketList, TimeAllocator, QuickActions
│   └── api/client.ts  # API client
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | /api/tickets | Get recommended tickets |
| POST | /api/submit | Submit worklog |
| GET | /api/history/yesterday | Get yesterday's allocation |
| GET | /api/status | Check if submitted today |

## License

MIT