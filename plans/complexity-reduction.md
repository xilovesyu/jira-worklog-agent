# Complexity Reduction Plan

## 问题根因

当前复杂度让 AI 需要跨 50+ 文件拼凑上下文才能理解逻辑。

## 三步降复杂度

### Step 1: 数据契约统一 (1天)

**目标**: API返回 = 前端类型，零映射

```typescript
// 统一类型定义 src/types/shared.ts
export interface Ticket {
  key: string
  summary: string
  status: string
  projectKey: string | null
  typeName: string | null
  backlogArea: string | null
  isSubtask: boolean
  hours: number  // 统一包含小时
}
```

**改动清单**:
- [ ] 创建 `src/types/shared.ts`
- [ ] 后端返回使用同一类型
- [ ] 前端移除所有手动映射

---

### Step 2: 状态机显式化 (1天)

**目标**: 用状态机替代隐式状态

```javascript
// 显式状态机 src/ai/stateMachine.mjs
export const RECOMMENDATION_STATES = {
  IDLE: 'idle',
  COLLECTING: 'collecting',
  DECIDING: 'deciding',
  COMPLETE: 'complete',
  ERROR: 'error'
}

export function transition(state, action) {
  switch (state) {
    case 'idle':
      if (action === 'START') return 'collecting'
      break
    case 'collecting':
      if (action === 'SUCCESS') return 'deciding'
      if (action === 'FAIL') return 'error'
      break
    // ...
  }
}
```

---

### Step 3: 模块职责拆分 (2天)

**目标**: storage.mjs 拆分 + intelligentDecision 扁平化

```
storage.mjs → 拆分为:
  ├── worklogStorage.mjs   (工时历史)
  ├── configStorage.mjs   (AI配置)
  ├── evidenceStorage.mjs (证据记录)
  └── llmStorage.mjs      (LLM日志)

intelligentDecision.mjs → 拼装模式:
  ├── collectEvidence()
  ├── aggregateEvidence()
  ├── fetchDetails()
  ├── makeDecision()
  └── saveResult()
```

---

## 快速生效: CLAUDE.md 增强

在 CLAUDE.md 加入显式规则:

```markdown
## AI修改规则

### 修改 storage.mjs 时
必须检查影响:
- [ ] worklog_history 表
- [ ] ai_config 表
- [ ] 函数调用方 (见依赖矩阵)

### 修改 intelligentDecision.mjs 时
必须确认:
- [ ] generateAiRecommendation 返回结构
- [ ] 前端 AiRecommendationPanel 类型
```

---

## 执行顺序

| 顺序 | 改动 | 影响 | 耗时 |
|------|------|------|------|
| 1 | CLAUDE.md 增强 | 无破坏性 | 1h |
| 2 | 数据契约统一 | 类型调整 | 1天 |
| 3 | 状态机显式化 | 调用方式 | 1天 |
| 4 | storage拆分 | 大重构 | 2天 |

建议先做 Step 1+CLAUDE.md，立即见效。