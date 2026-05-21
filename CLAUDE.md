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

---

## AI修改规则 (Critical - 必须遵守)

> **目的**: 减少AI理解复杂度，避免跨文件连锁影响

### 修改 `storage.mjs` 时

必须检查影响:

- [ ] `worklog_history` 表 → 影响历史查询、昨日分配
- [ ] `ai_config` 表 → 影响AI自动化配置
- [ ] `ai_decision_history` 表 → 影响决策历史
- [ ] `llm_call_log` 表 → 影响成本统计
- [ ] 函数调用方 (见下方依赖矩阵)

**高风险函数**:
- `getAiConfig()` → 被 `intelligentDecision.mjs`, `routes/ai.mjs` 调用
- `saveAiDecision()` → 被 `intelligentDecision.mjs` 调用
- `recordWorklog()` → 被 `routes/worklog.mjs` 调用

### 修改 `intelligentDecision.mjs` 时

必须确认:

- [ ] `generateAiRecommendation()` 返回结构 → 前端 `AiRecommendation` 类型
- [ ] `executeAiRecommendation()` 调用 → `jiraClient.addWorklog()`
- [ ] 证据收集 → `evidenceCollector.mjs` 接口
- [ ] LLM调用 → `decisionMaker.mjs` 接口

**返回结构必须包含**:
```typescript
{
  enabled: boolean,
  tickets: AiRecommendationTicket[],  // 必须有 key, summary, status
  recommendation?: { tickets, allocation },
  explanation: string,
  confidence_level: 'high'|'medium'|'low'
}
```

### 修改 `jiraClient.mjs` 时

必须确认:

- [ ] `searchMyTickets()` JQL → 影响 `/api/tickets`
- [ ] `batchGetTicketDetails()` → 影响AI推荐
- [ ] `addWorklog()` → 影响工时提交
- [ ] 返回结构 → 前端 `Ticket` 类型匹配

### 修改前端类型时

必须同步:

- [ ] 后端返回结构 (`intelligentDecision.mjs`, `routes/*.mjs`)
- [ ] API响应结构 (`ui/src/api/queries.ts`)
- [ ] UI渲染逻辑 (`AiRecommendationPanel.tsx`, `TicketList.tsx`)

---

## 模块依赖矩阵

| 模块 | 被谁调用 | 调用谁 | 破坏性影响范围 |
|------|---------|--------|---------------|
| `storage.mjs` | routes/*, intelligentDecision | sql.js | 全系统 |
| `intelligentDecision.mjs` | routes/ai.mjs | storage, jiraClient, evidenceCollector, decisionMaker | AI推荐全链路 |
| `jiraClient.mjs` | routes/*, intelligentDecision, smartSelector | axios → Jira API | 工时提交、ticket查询 |
| `evidenceCollector.mjs` | intelligentDecision | jiraClient | AI证据收集 |
| `decisionMaker.mjs` | intelligentDecision | llmEngine | LLM决策 |
| `llmEngine.mjs` | decisionMaker | OpenAI SDK | LLM调用 |

**调用链**: `routes/ai.mjs` → `intelligentDecision` → `evidenceCollector` → `jiraClient` → Jira API

---

## 状态转换规则

### LogPage 状态机

| 当前状态 | 触发条件 | 目标状态 | 副作用 |
|---------|---------|---------|--------|
| INIT | 页面加载/日期变化 | LOADING | 重置所有本地状态 |
| LOADING | API成功 | READY | 初始化selectedKeys, editedAllocation |
| LOADING | API失败 | ERROR | 显示错误信息 |
| READY | 用户修改allocation | EDITING | 更新editedAllocation |
| READY | 用户点击提交 | SUBMITTED | 调用submit API |
| SUBMITTED | 提交成功且工时≥8h | COMPLETE | 显示成功提示 |
| SUBMITTED | 提交失败 | ERROR | 显示错误信息 |

**关键规则**:
- 日期变化时 **必须** 重置 `initializedDateRef.current = null`
- AI推荐加载时 **只初始化一次** selectedKeys/editedAllocation
- 使用 `initializedDateRef` 防止 React 严格模式下的双重调用

### AiRecommendationPanel 状态

| 状态 | 用户行为 | 下一个状态 |
|-----|---------|----------|
| RECOMMENDED | 点击ticket tag | VIEWING (展开详情) |
| RECOMMENDED | 修改hours dropdown | MODIFIED |
| MODIFIED | 点击提交 | SUBMITTING |
| SUBMITTING | 提交成功 | APPROVED |

### 工时模式判断

```javascript
const existingHours = existingWorklog.reduce((sum, w) => sum + w.hours, 0)
const targetHours = existingHours === 0 ? 8 : 8 - existingHours
// 0h → 新记录模式 (target=8)
// 0<h<8 → 补充模式 (target=8-existing)
// ≥8h → 已完成，无需操作
```

---

## 数据契约 (API → 前端)

**关键**: 后端返回结构必须与前端 TypeScript 类型完全匹配

### `/api/tickets` → `TicketsResponse`

```typescript
interface TicketsResponse {
  tickets: Ticket[]      // 可选tickets
  preSelected: string[]  // 预选keys
  allocation: Allocation // 时间分配
  yesterday: Allocation | null
  filters: Filters       // 必须包含 projects, backlogAreas, types
}
```

### `/api/ai/recommendation` → `AiRecommendation`

```typescript
interface AiRecommendation {
  enabled: boolean
  tickets: AiRecommendationTicket[]  // 必须包含 projectKey, backlogArea
  recommendation?: { tickets: string[], allocation: Allocation }
  explanation: string
  confidence_level: 'high'|'medium'|'low'
  existingWorklog?: WorklogEntry[]
  existingTotalHours?: number
}
```

**常见错误**:
- 后端返回 `project_key` 但前端类型是 `projectKey` → 字段丢失
- 后端缺少 `filters` → 前端 FiltersSection 空白