# Architecture Overview

## 1. 系统架构图

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          Jira Worklog Agent                              │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌──────────────┐     ┌──────────────┐     ┌──────────────┐              │
│  │   Frontend   │     │   Backend    │     │   External   │              │
│  │   (React)    │◄───►│   (Express)  │◄───►│   (Jira API) │              │
│  └──────────────┘     └──────────────┘     └──────────────┐              │
│         │                    │                           │              │
│         │                    │                           │              │
│         ▼                    ▼                           ▼              │
│  ┌──────────────┐     ┌──────────────┐     ┌──────────────┐              │
│  │  TanStack    │     │   SQLite     │     │   LLM API    │              │
│  │  Query       │     │   (sql.js)   │     │  (DeepSeek)  │              │
│  └──────────────┘     └──────────────┘     └──────────────┘              │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

## 2. 核心数据流

### 2.1 推荐流程 (单向数据流)

```
用户选择日期
    │
    ▼
LogPage.tsx (useAiRecommendation)
    │
    ▼
API: /api/ai/recommendation?date=YYYY-MM-DD
    │
    ▼
intelligentDecision.generateAiRecommendation(date)
    │
    ├──► collectEvidence(date)         → 收集工作证据
    │         │
    │         ├──► Jira Activity (changelog)
    │         ├──► Git Commits (Phase 2)
    │         ├──► History (SQLite)
    │         └──► Existing Worklog
    │
    ├──► aggregateEvidence()           → 按ticket聚合
    │
    ├──► batchGetTicketDetails(keys)   → 批量获取详情
    │
    ├──► makeDecisionWithLlm()         → LLM决策
    │         │
    │         ├──► buildDecisionPrompt() → 构建提示词
    │         ├──► callLlm()             → 调用LLM
    │         └──► normalizeAllocation() → 标准化分配
    │
    └──► saveAiDecision()              → 存储决策
    │
    ▼
返回 AiRecommendation 对象
    │
    ▼
AiRecommendationPanel.tsx 渲染
```

### 2.2 提交流程

```
用户点击"提交"
    │
    ▼
AiRecommendationPanel.handleApprove(allocation)
    │
    ▼
API: POST /api/ai/submit
    │
    ▼
executeAiRecommendation(allocation)
    │
    ├──► jiraClient.addWorklog(key, hours, comment, date)
    │         │
    │         └──► Jira REST API: POST /issue/{key}/worklog
    │
    └──► storage.recordWorklog(key, hours, date)
    │
    ▼
返回 SubmitResponse
```

## 3. 状态机定义

### 3.1 页面状态 (LogPage)

```
┌─────────┐     ┌─────────┐     ┌─────────┐     ┌─────────┐
│  INIT   │────►│ LOADING │────►│  READY  │────►│SUBMITTED│
└─────────┘     └─────────┘     └─────────┘     └─────────┘
                      │               │               │
                      ▼               ▼               ▼
                ┌─────────┐     ┌─────────┐     ┌─────────┐
                │  ERROR  │     │ EDITING │     │COMPLETE │
                └─────────┘     └─────────┘     └─────────┘
```

状态转换条件：
- `INIT → LOADING`: 日期变化或页面加载
- `LOADING → READY`: API返回成功
- `LOADING → ERROR`: API返回失败
- `READY → EDITING`: 用户修改allocation
- `READY → SUBMITTED`: 用户点击提交
- `SUBMITTED → COMPLETE`: 提交成功且工时≥8h

### 3.2 推荐状态 (AiRecommendationPanel)

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  RECOMMENDED │────►│   MODIFIED   │────►│   APPROVED  │
└─────────────┘     └─────────────┘     └─────────────┘
       │                   │                   │
       │                   │                   │
       ▼                   ▼                   ▼
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   VIEWING   │     │   EDITING   │     │  SUBMITTING │
└─────────────┘     └─────────────┘     └─────────────┘
```

### 3.3 工时模式

```
┌─────────────┐                    ┌─────────────┐
│  NEW_RECORD │ (工时=0)            │  SUPPLEMENT │ (0<工时<8)
└─────────────┘                    └─────────────┘
       │                                   │
       │                                   │
       ▼                                   ▼
targetHours = 8                     targetHours = 8 - existingHours
```

## 4. 模块职责矩阵

| 模块 | 单一职责 | 输入 | 输出 | 依赖 |
|------|---------|------|------|------|
| `storage.mjs` | 数据持久化 | SQL操作 | 查询结果 | sql.js |
| `jiraClient.mjs` | Jira API交互 | IssueKey/Date | Ticket/Worklog | axios |
| `llmEngine.mjs` | LLM调用 | Prompt | JSON响应 | openai |
| `evidenceCollector.mjs` | 证据收集 | Date | Evidence对象 | jiraClient, storage |
| `decisionMaker.mjs` | LLM决策 | EvidenceSummary | Decision | llmEngine |
| `intelligentDecision.mjs` | 决策编排 | Date | Recommendation | 所有模块 |

## 5. 数据契约

### 5.1 API响应 → 前端类型映射

```
API: /api/ai/recommendation
├── AiRecommendation
│   ├── enabled: boolean
│   ├── tickets: AiRecommendationTicket[]  → 前端直接使用
│   ├── recommendation: { tickets, allocation }
│   ├── explanation: string
│   ├── confidence_level: 'high'|'medium'|'low'
│   ├── existingWorklog: WorklogEntry[]     → 用于补充模式判断
│   └── existingTotalHours: number         → 计算targetHours
```

### 5.2 关键类型定义

```typescript
// 核心类型 - 所有模块共用
interface Ticket {
  key: string              // Jira issue key (PROJ-123)
  summary: string          // Ticket标题
  status: string           // 当前状态
  projectKey?: string      // 项目key
  typeName?: string        // 类型(Bug/Task等)
  isSubtask?: boolean      // 是否子任务
}

interface Allocation {
  [ticketKey: string]: number  // ticket → hours映射
}

interface Evidence {
  activity: ActivityMap      // Jira活动
  commits: Commit[]          // Git提交
  history: History[]         // 使用历史
  existingWorklog: Worklog[] // 已记录工时
}
```

## 6. 关键约束与规则

### 6.1 时间分配规则
- 总工时必须等于 targetHours (补充模式: 8-existing, 否则: 8)
- 单个ticket最少0.5h，最多8h
- Bug父任务不直接记录工时 → 记录在子任务

### 6.2 状态初始化规则
- 日期变化时，必须重置所有本地状态
- AI推荐加载时，只初始化一次(selectedKeys, editedAllocation)
- 使用 `initializedDateRef` 防止竞态条件

### 6.3 过滤规则
- filters作用于"可选tickets"区域，不影响"已选择tags"
- 搜索添加的ticket自动匹配其project/type/backlogArea

## 7. 文件组织

```
src/
├── index.mjs           # 入口 + Express配置
├── config.mjs          # 配置加载
├── storage.mjs         # SQLite操作 (核心)
├── jiraClient.mjs      # Jira API (核心)
├── ai/
│   ├── intelligentDecision.mjs  # 决策编排 (核心)
│   ├── llmEngine.mjs           # LLM调用
│   ├── decisionMaker.mjs       # 决策生成
│   ├── evidenceCollector.mjs   # 证据收集
│   └── confidenceCalculator.mjs # 置信度计算
├── routes/
│   ├── ai.mjs          # AI相关API
│   ├── tickets.mjs     # Ticket API
│   └── worklog.mjs     # Worklog API
└── utils.mjs           # 通用工具
```

## 8. 修改指南

### 8.1 添加新功能时
1. 硖定数据流起点和终点
2. 检查是否影响 storage.mjs (最易引发连锁影响)
3. 更新前端类型定义
4. 添加状态机转换条件

### 8.2 修改现有功能时
1. 检查模块依赖矩阵 (见上文)
2. 确认状态依赖链
3. 检查数据契约是否一致

### 8.3 调试问题时
1. 从 API 响应开始追踪
2. 检查状态初始化时机
3. 验证类型映射是否正确