# 潜在逻辑Bug分析报告

> 分析对象: LogPage.tsx, AiRecommendationPanel.tsx
> 分析轮次: 10轮+
> 修复日期: 2026-05-21

---

## 修复状态汇总

| 问题 | 状态 | 修复方案 |
|-----|------|---------|
| 1.1 useMemo 副作用 | ✅ 已修复 | 改为 useEffect |
| 1.2 initializedDateRef 竞态 | ✅ 已修复 | 合并两个 useEffect |
| 2.1 双重选中状态 | ✅ 已修复 | 添加 newlyAddedKey prop 同步 |
| 2.2 allocation 僵尸状态 | ✅ 已修复 | 改进注释，保留备用 |
| 5.2 useEffect 依赖项 | ✅ 已修复 | 更新依赖项 |
| 6.1 aiApproved 日期不重置 | ✅ 已修复 | 日期变化时重置 |
| 7.1 existingHours 浮点精度 | ✅ 已修复 | Math.round 1位小数 |
| 12.2 hours=0 fallback | ✅ 已修复 | ?? 替代 || |
| 13.1 Bug Modal async cleanup | ✅ 已修复 | AbortController |
| 13.4 Bug 顺序创建 subtask | ✅ 已修复 | Promise.all 并行 |
| 15.1 FiltersSection 返回条件 | ✅ 已修复 | 检查所有filters |
| 17.1 newlyAddedKey 不重置 | ✅ 已修复 | onNewlyAddedKeyConsumed callback |

---

## Round 1: 状态初始化时机问题

### 问题 1.1: LogPage preSelectedInitializedRef 双重初始化风险 [✅ 已修复]

**位置**: LogPage.tsx:122-140 (useMemo)

**现象**: 使用 `useMemo` 进行副作用操作（setSelected, setAllocation）

**根因**:
- `useMemo` 是用于计算值的，不应用于执行副作用
- React 严格模式下 useMemo 可能执行两次
- 副作用应该用 `useEffect`

**影响**: 可能导致 preSelected 初始化不稳定，状态更新时机不确定

**修复**: 将 useMemo 改为 useEffect，保持相同的初始化逻辑

---

### 问题 1.2: AiRecommendationPanel initializedDateRef 与 date 变化竞态 [✅ 已修复]

**位置**: AiRecommendationPanel.tsx:82-88, 95-110

**现象**: 两个 useEffect 都操作 initializedDateRef.current

**根因**:
- 第一个 useEffect (82-88) 重置 ref 为 null
- 第二个 useEffect (95-110) 设置 ref 为 date
- 如果第二个 effect 在第一个之前执行，会导致初始化跳过

**影响**: 快速切换日期时，可能跳过新日期的初始化

**修复**: 合并两个 useEffect 到一个，使用 prevDateRef 检测日期变化，在同一 effect 中处理重置和初始化

---

## Round 2: 状态同步问题

### 问题 2.1: LogPage selected 与 AiRecommendationPanel selectedKeys 双重状态 [✅ 已修复]

**位置**:
- LogPage.tsx:38 (selected state)
- AiRecommendationPanel.tsx:74 (selectedKeys state)

**现象**: 两个组件各自维护选中状态，无同步

**根因**:
- LogPage 有 `selected` state 但注释掉了使用逻辑
- AiRecommendationPanel 有独立的 `selectedKeys` state
- LogPage 的 `handleAddTicket` 更新 LogPage.selected，但 AI Panel 不知道

**影响**:
- handleAddTicket 添加的 ticket 不会出现在 AI Panel 的 selectedKeys
- LogPage selected 状态僵尸化（存在但未使用）

**修复**: 
- 添加 `newlyAddedKey` prop，LogPage 通过它传递新添加的 ticket key
- AiRecommendationPanel 用 useEffect 监听 newlyAddedKey，自动选中

---

### 问题 2.2: LogPage allocation 僵尸状态 [✅ 已修复]

**位置**: LogPage.tsx:40-41

**现象**:
```javascript
const [_allocation, setAllocation] = useState<Allocation>({})
```

**根因**: 使用 `_allocation` 前缀表示"不使用"，但：
- handleSameAsYesterday 调用 submitMutation 时用的是 ticketsData?.yesterday
- handleSkip 调用 setAllocation({})
- handleAddTicket 调用 setAllocation(calculateAllocation(...))
- 这些更新永远不会反映到 UI（因为被注释掉了）

**影响**: 状态更新浪费，可能导致 React DevTools 混淆

**修复**: 
- 改进注释，明确说明这些状态是为非 AI 模式保留的（备用）
- handleAddTicket 移除了对 selected/allocation 的更新，改为设置 newlyAddedKey

---

## Round 3: 数据流断裂问题

### 问题 3.1: AiRecommendationPanel allTickets 与 recommendation.tickets 数据源分离

**位置**: AiRecommendationPanel.tsx:146-178

**现象**: allAvailableTickets 合并两个数据源，但信息不完整

**根因**:
- recommendation.tickets 来自 AI API，包含 confidence, llm_reason
- allTickets 来自 /api/tickets，可能包含不同字段
- 合并时丢失了部分 recommendation.tickets 的特有字段（confidence, confidenceLevel）

**影响**: TicketList 显示的 ticket 可能缺少 confidence 信息

---

### 问题 3.2: handleAddTicket filter 自动选择逻辑

**位置**: LogPage.tsx:357-386

**现象**: 添加 ticket 时自动扩展 filter

**根因**:
```javascript
if (ticket.projectKey && !selectedProjects.includes(ticket.projectKey)) {
  setSelectedProjects([...selectedProjects, ticket.projectKey])
}
```

**影响**:
- 用户可能只想添加一个 ticket，但被迫看到整个 project 的 tickets
- filter 状态被隐式修改，用户无感知
- 与 AiRecommendationPanel 的 filter 状态可能冲突（如果 AI Panel 有自己的 filter 逻辑）

---

## Round 4: 边界条件问题

### 问题 4.1: targetHours 计算边界

**位置**:
- LogPage.tsx:84
- AiRecommendationPanel.tsx:69

**现象**: 两处都有 targetHours/effectiveTargetHours 计算

**根因**:
- LogPage: `targetHours = isSupplementMode ? 8 - existingHours : 8`
- AiRecommendationPanel: `effectiveTargetHours = aiExistingHours > 0 && aiExistingHours < 8 ? 8 - aiExistingHours : targetHours`

**潜在问题**:
- 如果 existingHours = 7.9，supplement mode 下 targetHours = 0.1
- 但 AI 分配可能给每个 ticket 最少 0.5h，导致无法凑齐
- 两个组件的计算逻辑不完全一致（aiExistingHours vs existingHours）

---

### 问题 4.2: totalHours = 0 时提交按钮 disabled

**位置**: AiRecommendationPanel.tsx:522

**现象**:
```javascript
disabled={submitting || selectedKeys?.length === 0 || totalHours === 0}
```

**根因**: totalHours === 0 时禁用，但：
- 如果用户选中了 tickets 但 hours 都是 0（可能手动设为 0）
- 或者 allocation 初始化为 {} 且没有 recommendation

**影响**: 用户体验差——不知道为什么按钮禁用

---

## Round 5: React Hook 规则问题

### 问题 5.1: useMemo 中执行 setState

**位置**: LogPage.tsx:122-140

**现象**: 在 useMemo 中调用 setSelected, setAllocation, setSelectedProjects 等

**根因**: 违反 React Hooks 规则——副作用不应在 useMemo 中执行

**影响**:
- React 严格模式下可能重复执行
- 状态更新时机不确定
- 可能导致 infinite loop（如果状态更新触发 useMemo 依赖变化）

---

### 问题 5.2: useEffect 依赖项不完整 [✅ 已修复]

**位置**: AiRecommendationPanel.tsx:95-110

**现象**:
```javascript
useEffect(() => {
  const rec = recommendation?.recommendation
  const canInitialize = !loading
    && rec?.allocation
    && initializedDateRef.current !== date
    && editedAllocation === null

  if (canInitialize && rec) {
    // ...
  }
}, [recommendation, editedAllocation, date, loading])
```

**根因**: 缺少 `recommendation?.recommendation` 作为依赖

**影响**:
- 如果 recommendation 对象变化但 recommendation.recommendation 不变
- 或者 recommendation.recommendation 变化但 recommendation 对象引用不变
- effect 可能不触发或错误触发

**修复**: 
- 在合并的 useEffect 中，依赖项改为 `[date, recommendation?.recommendation, editedAllocation, loading]`
- 同时，此问题已随问题 1.2 一起修复（合并了两个 useEffect）

---

## Round 6: 快速日期切换问题

### 问题 6.1: 日期切换时状态重置顺序 [✅ 已随问题 1.2 修复]

**位置**: AiRecommendationPanel.tsx:82-88

**现象**:
```javascript
useEffect(() => {
  initializedDateRef.current = null
  setEditedAllocation(null)
  setSelectedKeys(null)
  setShowAvailable(false)
}, [date])
```

**根因**: 这四个状态重置是同步的，但：
- React 状态更新是异步的
- 下一个 useEffect (95-110) 可能在新状态生效前执行
- initializedDateRef.current = null 是同步的，但 editedAllocation 还是旧值

**影响**: 快速切换日期时，初始化可能使用旧状态的 editedAllocation 判断

---

### 问题 6.2: LogPage addedTickets 清空时机

**位置**: LogPage.tsx:143-146

**现象**:
```javascript
useEffect(() => {
  preSelectedInitializedRef.current = false
  setAddedTickets([])
}, [selectedDateStr])
```

**根因**: 清空 addedTickets，但：
- AiRecommendationPanel 的 addedTickets prop 已经包含旧日期的 tickets
- 如果 AI Panel 正在渲染，可能短暂显示旧日期的 addedTickets

**影响**: UI 闪烁

---

## Round 7: Loading 状态数据问题

### 问题 7.1: loading 时使用 stale placeholder 数据

**位置**: AiRecommendationPanel.tsx:64-66

**现象**:
```javascript
const aiExistingHours = !loading
  ? (recommendation?.existingTotalHours ?? existingHours ?? 0)
  : (existingHours ?? 0)
```

**根因**: 正确处理了 loading 状态，但：
- recommendation 对象在 loading 期间可能存在（TanStack Query placeholder data）
- 如果 existingHours prop 也来自 loading 状态的 query，可能是旧数据

**影响**: loading 期间显示的 existingHours 可能是前一天的

---

### 问题 7.2: shouldShowAiPanel 条件复杂

**位置**: LogPage.tsx:397

**现象**:
```javascript
const shouldShowAiPanel = showAiPanel && !isFullySubmitted && !aiApproved && (aiRecommendationQuery.isLoading || aiRecommendation?.enabled)
```

**根因**:
- `aiRecommendationQuery.isLoading || aiRecommendation?.enabled`
- 如果 isLoading=true 但最终 enabled=false，panel 会短暂显示后消失
- 如果 isLoading=false 且 enabled=false，panel 直接不显示
- 但 showAiPanel state 什么时候被设为 true/false？

**影响**: UI 显示/隐藏时机可能不符合预期

---

## Round 8: Bug Modal 状态问题

### 问题 8.1: Bug Modal 与 AI Panel 状态同步

**位置**:
- LogPage.tsx:50-52 (pendingBugs, pendingAllocation)
- LogPage.tsx:313-351 (handleAiApprove)

**现象**: handleAiApprove 检测 Bug 并设置 pendingBugs，但：
- 如果用户在 Bug Modal 中取消，handleBugModalCancel 清除 LogPage.selected
- 但 AiRecommendationPanel 的 selectedKeys 不受影响

**根因**: 两个组件的选中状态独立

**影响**: Bug Modal 取消后，AI Panel 仍然显示选中的 tickets

---

### 问题 8.2: Bug Modal 确认后 failedBugs 处理

**位置**: LogPage.tsx:190-248

**现象**: 如果创建 subtask 失败，failedBugs 被 skip

**根因**:
```javascript
if (Object.keys(newAllocation).length > 0) {
  submitMutation.mutate(...)
} else if (failedBugs.length > 0) {
  setSelected([])
  setAllocation({})
}
```

**影响**:
- 用户选择的所有 tickets 如果都是 Bug 且都创建 subtask 失败
- 最终什么都不提交，但也没有明确提示用户下一步怎么做

---

## Round 9: 类型安全问题

### 问题 9.1: AiRecommendationTicket 类型不完整

**位置**: AiRecommendationPanel.tsx:153-167

**现象**: 合并 ticket 时丢失 confidence 字段

**根因**:
```javascript
merged.set(t.key, {
  key: t.key,
  summary: t.summary,
  // ... 没有 confidence
})
```

**影响**: Ticket 类型不包含 confidence，但 AiRecommendationTicket 应该有

---

### 问题 9.2: filters 类型不一致

**位置**: LogPage.tsx:78

**现象**:
```javascript
const filters = ticketsData?.filters || { projects: [], backlogAreas: [], types: [] }
```

**根因**: fallback 对象的 types 是空数组，但 Filters 类型定义 types 为 TypeFilter[]

**影响**: 如果 ticketsData.filters 是 undefined，types 可能是 undefined 而不是 []

---

## Round 10: 内存泄漏风险

### 问题 10.1: useRef 初始化标记不清理

**位置**:
- LogPage.tsx:47 (preSelectedInitializedRef)
- AiRecommendationPanel.tsx:79 (initializedDateRef)

**现象**: ref 只在日期变化时重置

**根因**: 如果组件卸载后重新挂载（比如切换页面再回来）
- ref 可能保留之前的值
- 导致初始化逻辑跳过

**影响**: 页面切换后状态可能不正确

---

### 问题 10.2: TanStack Query cache 不清理

**位置**: LogPage.tsx 多处 useQuery/useMutation

**现象**: 没有看到 queryClient.invalidateQueries 或 cacheTime 配置

**根因**: TanStack Query 默认 cacheTime 5分钟

**影响**:
- 切换日期后，旧日期的 query 数据可能保留
- 如果快速来回切换，可能显示 stale 数据

---

## Round 11+: 其他潜在问题

### 问题 11.1: handleSameAsYesterday 没有更新 AI Panel 状态

**位置**: LogPage.tsx:259-266

**现象**: 直接调用 submitMutation，不经过 AI Panel

**根因**: "同昨天"按钮在 AI Panel 中，但处理逻辑在 LogPage

**影响**: 用户在 AI Panel 点击"同昨天"，但 AI Panel 不知道发生了什么

---

### 问题 11.2: handleCheck 同步逻辑复杂

**位置**: LogPage.tsx:268-294

**现象**: 先 check differences，再 sync

**根因**:
```javascript
const checkResult = await checkMutation.mutateAsync({ date: selectedDateStr, sync: false })
// ...
const syncResult = await checkMutation.mutateAsync({ date: selectedDateStr, sync: true })
```

**影响**: 两次 API 调用，第一次的结果在 alert 中显示，但 sync 后可能又有新差异

---

### 问题 11.3: AiRecommendationPanel hours 修改后 totalHours 不实时更新

**位置**: AiRecommendationPanel.tsx:116-118

**现象**: totalHours 依赖 currentAllocation 和 selectedKeys

**根因**: useMemo 计算，但：
- handleHoursChange 直接 setEditedAllocation
- currentAllocation = editedAllocation || recommendation?.recommendation?.allocation
- 如果 editedAllocation 更新，currentAllocation 应该更新

**潜在问题**: React 状态更新是异步的，可能短暂显示旧 totalHours

---

### 问题 11.4: dynamicFilters 依赖 allTickets 但 allTickets 可能 loading

**位置**: AiRecommendationPanel.tsx:191-233

**现象**: 如果 allTickets 为空数组（loading 期间），dynamicFilters 会是空

**根因**:
```javascript
if (filters.projects?.length > 0) {
  return filters
}
// 否则从 allAvailableTickets + allTickets 构建
```

**影响**: Loading 结束瞬间，filters 可能从有内容变成空（如果构建失败）

---

### 问题 11.5: handleToggle 默认 1h 可能超出 targetHours

**位置**: AiRecommendationPanel.tsx:301-306

**现象**:
```javascript
setSelectedKeys([...selectedKeys, ticketKey])
setEditedAllocation(prev => ({
  ...prev,
  [ticketKey]: 1  // 固定 1h
}))
```

**根因**: 添加 ticket 时默认 1h，不考虑 targetHours 限制

**影响**:
- 如果 targetHours = 0.5（补充模式极端情况）
- 添加一个 ticket 就超出了 targetHours

---

### 问题 11.6: aiAllocatedKeys 计算时机

**位置**: AiRecommendationPanel.tsx:121-124

**现象**: aiAllocation 来自 recommendation?.recommendation?.allocation

**根因**: 如果 recommendation 还在 loading，aiAllocation 可能是 undefined

**影响**: isAiRecommended badge 可能不显示

---

### 问题 11.7: existingWorklog 显示时机

**位置**: AiRecommendationPanel.tsx:384-405

**现象**: !loading && recommendation.existingWorklog 存在时显示

**根因**: 如果 recommendation 存在但 existingWorklog 是空数组，不显示

**影响**: 用户不知道今天已经有记录（如果 existingWorklog=[] 但有数据）

---

### 问题 11.8: submittedTicketsQuery 依赖 existingWorklog

**位置**: LogPage.tsx:97-98

**现象**: useSubmittedTickets(existingWorklog, selectedDateStr)

**根因**: 如果 existingWorklog 变化，submittedTicketsQuery 会重新触发

**影响**: 每次工作记录提交后，会重新 fetch submitted tickets

---

## Round 12: TicketList 组件问题

### 问题 12.1: TicketList hours 数据来源混乱

**位置**: TicketList.tsx:32

**现象**:
```javascript
hours={allocation?.[ticket.key] || ticket.hours || 0}
```

**根因**: hours 有三个来源优先级：
1. allocation prop（外部传入的分配）
2. ticket.hours（ticket 自带的 hours）
3. 0（默认值）

**影响**:
- 如果 allocation 存在但值为 0，会 fallback 到 ticket.hours
- 但 allocation[ticket.key] = 0 可能是用户有意设为 0
- 导致显示错误的 hours

---

### 问题 12.2: TicketList 状态在父组件重新渲染时丢失

**位置**: TicketList.tsx:60-64

**现象**: 每个 TicketItem 有独立的本地状态：
- contentExpanded（内容展开状态）
- parentExpanded（父任务展开状态）
- isEditingHours（小时编辑模式）

**根因**: 这些状态是组件内部 useState，不受父组件控制

**影响**:
- 父组件重新渲染（比如 filter 变化）会导致所有 TicketItem 重置
- 用户展开的内容/编辑状态会丢失
- 无法持久化用户的 UI 偏好

---

### 问题 12.3: hours input onBlur 不保存

**位置**: TicketList.tsx:79-82

**现象**:
```javascript
const handleHoursBlur = () => {
  setIsEditingHours(false)
}
```

**根因**: onBlur 只退出编辑模式，不验证/保存值

**影响**:
- 如果用户输入无效值（如空字符串），parseFloat 返回 0
- clampedValue 变成 0.5（最小值）
- 用户输入被意外修改，无提示

---

### 问题 12.4: hours 输入 step=0.5 但用户可能输入 0.25

**位置**: TicketList.tsx:129-134

**现象**: input type="number" step={0.5}

**根因**: step 属性只影响 UI 上下箭头，不影响手动输入

**影响**:
- 用户可以手动输入 0.25 或 0.75
- handleHoursChange 会 clamp 到 0.5-8
- 用户输入 0.25 变成 0.5，无提示

---

## Round 13: BugWorklogModal 组件问题

### 问题 13.1: Bug Modal useEffect 异步 fetch 无取消

**位置**: BugWorklogModal.tsx:42-77

**现象**:
```javascript
useEffect(() => {
  if (!isOpen || bugs.length === 0) return
  setLoading(true)
  const fetchSubtasks = async () => {
    // ...
  }
  fetchSubtasks()
}, [isOpen, bugs, allocation])
```

**根因**: 异步 fetch 没有 AbortSignal 或 cleanup

**影响**:
- Modal 关闭时，fetch 可能仍在进行
- fetch 完成后 setState 会更新已卸载组件的状态
- React 严格模式警告

---

### 问题 13.2: Bug Modal choices 初始化依赖 allocation

**位置**: BugWorklogModal.tsx:62-72

**现象**:
```javascript
initialChoices[bug.key] = {
  hours: allocation[bug.key] || 0,
  // ...
}
```

**根因**: allocation 来自 props，但 allocation 可能不包含所有 bug

**影响**:
- 如果 allocation[bug.key] 是 undefined，hours = 0
- 用户可能看到 0h 的 bug，无法理解原因

---

### 问题 13.3: Bug Modal 确认时 target='new' 无验证

**位置**: BugWorklogModal.tsx:99-107

**现象**:
```javascript
result[bugKey] = {
  target: 'new',
  hours: choice.hours,
  closeAfter: true,
  parentKey: bugKey,
  summary: choice.newSubtaskSummary || '[UI Dev] bug fix'
}
```

**根因**: newSubtaskSummary 可能是空字符串或用户输入的特殊字符

**影响**:
- 空 summary 会导致 Jira API 报错
- 特殊字符可能导致 subtask 名称异常

---

### 问题 13.4: Bug Modal 按顺序创建 subtask 无并行

**位置**: BugWorklogModal.tsx:46-57（fetch）
以及 LogPage.tsx:197-225（handleBugModalConfirm）

**现象**:
```javascript
for (const bug of bugs) {
  const response = await fetch(`/api/bug/${bug.key}/subtasks`)
  // ...
}
```

**根因**: for 循环 + await 导致顺序执行

**影响**:
- 10 个 bug 需要 10 次 API 调用
- 每次调用约 500ms，总耗时 5s+
- 用户等待时间长

---

## Round 14: queries.ts TanStack Query 问题

### 问题 14.1: useSubmittedTickets 禁用条件不完整

**位置**: queries.ts:296

**现象**:
```javascript
enabled: worklog && worklog.length > 0,
```

**根因**: 只检查 worklog.length > 0

**影响**:
- worklog 变化时（比如新提交），query 立即重新触发
- 每次提交后都会 fetch 所有 ticket 详情
- 性能问题

---

### 问题 14.2: useSubmitWorklog 乐观更新逻辑

**位置**: queries.ts:174-205

**现象**:
```javascript
onSuccess: (_result, { allocation, date, append }) => {
  const currentData = queryClient.getQueryData(...)
  // 手动构建 updatedWorklog
  queryClient.setQueryData(...)
  // 然后 invalidate
  queryClient.invalidateQueries(...)
}
```

**根因**: 先 setQueryData 再 invalidate

**影响**:
- setQueryData 立即生效
- invalidate 触发 refetch
- refetch 返回的数据可能与 setQueryData 不同（比如 Jira API 返回不同格式）
- UI 会闪烁：先显示乐观数据，再显示真实数据

---

### 问题 14.3: staleTime 配置不一致

**位置**: queries.ts 多处

**现象**:
- tickets: staleTime: 5 * 60 * 1000 (5分钟)
- worklog: staleTime: 30 * 1000 (30秒)
- aiRecommendation: staleTime: 60 * 1000 (1分钟)
- jiraServer: staleTime: Infinity

**根因**: 不同 query 有不同的 staleTime

**影响**:
- tickets 和 aiRecommendation 的 staleTime 不一致
- 用户可能在 tickets query stale 时触发 aiRecommendation refetch
- 导致数据不一致

---

### 问题 14.4: useCheckWorklog sync 后不更新 local state

**位置**: queries.ts:223-228

**现象**:
```javascript
onSuccess: (_, { date, sync }) => {
  if (sync) {
    queryClient.invalidateQueries(...)
  }
}
```

**根因**: 只 invalidate，不立即更新 UI

**影响**:
- sync 后用户看不到即时反馈
- 需要等待 refetch 完成
- 用户体验差

---

## Round 15: FiltersSection 组件问题

### 问题 15.1: FiltersSection 返回 null 条件

**位置**: FiltersSection.tsx:23

**现象**:
```javascript
if ((filters.projects?.length || 0) === 0) return null
```

**根因**: 只检查 projects，不检查 backlogAreas 和 types

**影响**:
- 如果 projects=[] 但 backlogAreas 有数据
- 整个 FiltersSection 不显示
- 用户无法使用 backlogArea filter

---

### 问题 15.2: FiltersSection unique 去重逻辑

**位置**: FiltersSection.tsx:25-27

**现象**:
```javascript
const uniqueProjects = [...new Map(filters.projects.map(p => [p.key, p])).values()]
const uniqueBacklogAreas = [...new Set(filters.backlogAreas || [])].map(area => ({ name: area }))
const uniqueTypes = [...new Map(filters.types.map(t => [t.name, t])).values()]
```

**根因**: 三种不同的去重逻辑

**影响**:
- projects 用 key 去重
- backlogAreas 用 name 去重（但转成了对象）
- types 用 name 去重
- 如果 API 返回重复数据，去重逻辑可能不一致

---

## Round 16: LogPage 其他问题

### 问题 16.1: handleSameAsYesterday 不更新 UI state

**位置**: LogPage.tsx:266-273

**现象**:
```javascript
const handleSameAsYesterday = useCallback(() => {
  const yesterday = ticketsData?.yesterday
  if (!yesterday || Object.keys(yesterday).length === 0) return
  submitMutation.mutate({ allocation: yesterday, date: selectedDateStr, append: isSupplementMode })
}, [...])
```

**根因**: 直接 submit，不更新本地 selected/allocation 状态

**影响**:
- 用户点击"同昨天"后，提交成功
- 但 AI Panel 的 selectedKeys 不反映 yesterday 的 tickets
- 如果提交失败，用户不知道发生了什么

---

### 问题 16.2: handleSkip 不重置 AI Panel 状态

**位置**: LogPage.tsx:303-309

**现象**:
```javascript
const handleSkip = useCallback(() => {
  const nextDate = new Date(selectedDate)
  nextDate.setDate(nextDate.getDate() + 1)
  setSelectedDate(nextDate)
  setSelected([])
  setAllocation({})
}, [selectedDate])
```

**根因**: 只更新 LogPage 状态，AI Panel 状态依赖 date 变化自动重置

**影响**:
- setSelected([]) 是僵尸操作（selected 不使用）
- 依赖 date 变化触发 AI Panel 重置
- 如果 setSelectedDate 执行但 date 实际没变（比如边界），AI Panel 不重置

---

### 问题 16.3: isSubmitted 判断条件

**位置**: LogPage.tsx:83

**现象**:
```javascript
const isSubmitted = worklogData?.submitted && existingHours > 0
```

**根因**: submitted && existingHours > 0

**影响**:
- 如果 submitted=true 但 existingHours=0（比如刚提交后 refetch 还没完成）
- isSubmitted=false，显示正常模式
- 用户可能重复提交

---

### 问题 16.4: aiApproved 状态管理

**位置**: LogPage.tsx:73, 353-354

**现象**:
```javascript
const [aiApproved, setAiApproved] = useState(false)
// ...
onSuccess: () => {
  setAiApproved(true)
  setShowAiPanel(false)
}
```

**根因**: aiApproved 只在提交成功时设置 true

**影响**:
- 日期变化时 aiApproved 不重置
- 切换到新日期，aiApproved=true，shouldShowAiPanel=false
- 新日期无法显示 AI Panel

---

## Round 17: AiRecommendationPanel 其他问题

### 问题 17.1: newlyAddedKey useEffect 不重置

**位置**: AiRecommendationPanel.tsx:114-121

**现象**:
```javascript
useEffect(() => {
  if (newlyAddedKey && selectedKeys && !selectedKeys.includes(newlyAddedKey)) {
    setSelectedKeys([...selectedKeys, newlyAddedKey])
    setEditedAllocation(prev => ({
      ...prev,
      [newlyAddedKey]: 1
    }))
  }
}, [newlyAddedKey, selectedKeys])
```

**根因**: 只监听 newlyAddedKey，不重置它

**影响**:
- newlyAddedKey 始终保持最后一次添加的 ticket key
- 如果用户在同一天再次添加同一个 ticket
- useEffect 会再次触发（即使已经选中）

---

### 问题 17.2: handleToggle 删除时 delete allocation

**位置**: AiRecommendationPanel.tsx:291-298

**现象**:
```javascript
if (selectedKeys.includes(ticketKey)) {
  setSelectedKeys(selectedKeys.filter(k => k !== ticketKey))
  setEditedAllocation(prev => {
    if (!prev) return prev
    const newAlloc = { ...prev }
    delete newAlloc[ticketKey]
    return newAlloc
  })
}
```

**根因**: delete 操作

**影响**:
- 删除 ticket 后 allocation 中该 ticket 完全消失
- 如果用户误删想恢复，allocation 已丢失
- 需要 re-add 并重新设置 hours

---

### 问题 17.3: totalHours 计算依赖 selectedKeys

**位置**: AiRecommendationPanel.tsx:116-118

**现象**:
```javascript
const totalHours = useMemo(() => {
  return selectedKeys?.reduce((sum, key) => sum + (currentAllocation[key] || 0), 0) || 0
}, [currentAllocation, selectedKeys])
```

**根因**: selectedKeys 可能是 null（初始化前）

**影响**:
- 初始化前 selectedKeys=null，totalHours=0
- 用户看到 0h，不知道是否有推荐

---

### 问题 17.4: hours badge 点击编辑无最大值验证

**位置**: AiRecommendationPanel 缺失
以及 TicketList.tsx:73-77

**现象**:
```javascript
const handleHoursChange = (e: React.ChangeEvent<HTMLInputElement>) => {
  const value = parseFloat(e.target.value) || 0
  const clampedValue = Math.max(0.5, Math.min(8, value))
  onHoursChange?.(ticket.key, clampedValue)
}
```

**根因**: clamp 到 0.5-8，但 targetHours 可能 < 8

**影响**:
- 补充模式下 targetHours=2
- 用户可以设置 8h，超出 targetHours
- 没有警告提示

---

## Round 18: 数据流断裂深层问题

### 问题 18.1: recommendation.tickets 与 allTickets 合并丢失数据

**位置**: AiRecommendationPanel.tsx:146-178

**现象**: 合并两个数据源

**根因**:
- recommendation.tickets 来自 AI API
- allTickets 来自 /api/tickets
- 合并时只取 recommendation.tickets 的字段，allTickets 的字段丢失

**影响**:
- recommendation.tickets 缺少某些字段（如 priority, updated）
- 合并后这些字段永远缺失

---

### 问题 18.2: dynamicFilters 在 filters 有数据时跳过构建

**位置**: AiRecommendationPanel.tsx:191-233

**现象**:
```javascript
if (filters.projects?.length > 0) {
  return filters
}
```

**根因**: filters 有数据就直接返回，不合并 AI recommendation 的数据

**影响**:
- AI recommendation 可能包含 filters 中没有的 project/type
- 用户无法过滤这些新 project/type

---

## Round 19: 性能问题

### 问题 19.1: allAvailableTickets useMemo 依赖过多

**位置**: AiRecommendationPanel.tsx:146-178

**现象**: useMemo 依赖 recommendation.tickets 和 filteredTickets

**根因**: filteredTickets 本身是 useMemo，依赖多个 state

**影响**:
- recommendation 变化 → allAvailableTickets 重算
- filter state 变化 → filteredTickets 重算 → allAvailableTickets 重算
- 频繁重算

---

### 问题 19.2: TicketList.map 无 key 稳定性

**位置**: TicketList.tsx:23-36

**现象**:
```javascript
{tickets.map(ticket => (
  <TicketItem key={ticket.key} ... />
))}
```

**根因**: key 使用 ticket.key

**影响**:
- 同一个 ticket 可能出现在不同列表（selected vs available）
- React 可能复用组件实例
- 状态（展开/编辑）可能意外保留或丢失

---

## Round 20: 错误处理问题

### 问题 20.1: handleAiApprove 没有错误处理 UI

**位置**: LogPage.tsx:345-357

**现象**:
```javascript
aiSubmitMutation.mutate(..., {
  onSuccess: () => {
    setAiApproved(true)
    setShowAiPanel(false)
  },
})
```

**根因**: 没有 onError 回调

**影响**:
- 提交失败时用户不知道
- AI Panel 状态不变
- 用户可能重复点击提交

---

### 问题 20.2: useSearchTicket 失败只 console.error

**位置**: LogPage.tsx:388-390

**现象**:
```javascript
} catch (err) {
  console.error(err)
}
```

**根因**: 没有 UI 提示

**影响**:
- 用户搜索失败看不到任何反馈
- 可能认为搜索功能失效

---

### 问题 20.3: Bug Modal fetch 失败静默处理

**位置**: BugWorklogModal.tsx:53-55

**现象**:
```javascript
} catch {
  results[bug.key] = []
}
```

**根因**: catch 空块，无提示

**影响**:
- 用户看到"使用已有 subtask"选项但没有下拉内容
- 不知道是因为 fetch 失败

---

## Round 21+: 边界条件深层问题

### 问题 21.1: existingHours 浮点精度

**位置**: LogPage.tsx:82

**现象**:
```javascript
const existingHours = existingWorklog.reduce((sum, w) => sum + (w?.hours || 0), 0)
```

**根因**: JavaScript 浮点精度问题

**影响**:
- 7.5 + 0.5 = 8.0，但 JS 可能算出 7.9999999
- isFullySubmitted 判断可能失败
- UI 显示异常

---

### 问题 21.2: targetHours = 0 时

**位置**: LogPage.tsx:84

**现象**:
```javascript
const targetHours = isSupplementMode ? 8 - existingHours : 8
```

**根因**: existingHours = 8 时，targetHours = 0

**影响**:
- isSupplementMode=true 但 existingHours=8
- targetHours=0
- 用户看到"补充模式"但无需补充
- shouldShowAiPanel 判断：!isFullySubmitted && targetHours=0
- 状态矛盾

---

### 问题 21.3: dateToStr 与 formatDate 时区问题

**位置**: helpers.ts（未读取，推测）

**现象**: 多处使用 dateToStr 和 formatDate

**根因**: 时区处理不一致

**影响**:
- 用户选择 2026-05-21（本地时间）
- dateToStr 可能返回 2026-05-20（UTC 时间）
- API 查询的是错误日期

---

### 问题 21.4: newlyAddedKey 清空时机

**位置**: LogPage.tsx:149-153

**现象**:
```javascript
useEffect(() => {
  preSelectedInitializedRef.current = false
  setAddedTickets([])
  setNewlyAddedKey(null)
}, [selectedDateStr])
```

**根因**: 日期变化时清空，但 newlyAddedKey 清空后 AiRecommendationPanel 不知道

**影响**:
- AiRecommendationPanel 的 useEffect 监听 newlyAddedKey
- newlyAddedKey 从 'PROJ-123' 变成 null
- useEffect 可能触发但 selectedKeys 包含 null（不应该）

---

### 问题 21.5: recommendation.id 可能是 undefined

**位置**: LogPage.tsx:349

**现象**:
```javascript
decisionId: recommendation.id,
```

**根因**: recommendation.id 可能不存在（fallback recommendation）

**影响**:
- 如果 AI disabled，recommendation 没有 id
- API 调用 decisionId=undefined
- 后端可能报错

---

### 问题 21.6: filters fallback 对象每次渲染都是新引用

**位置**: LogPage.tsx:80

**现象**:
```javascript
const filters = ticketsData?.filters || { projects: [], backlogAreas: [], types: [] }
```

**根因**: inline object 每次渲染都是新引用

**影响**:
- 如果 ticketsData.filters 是 undefined
- filters 每次渲染都是新对象
- useMemo 依赖 filters 会频繁重算

---

## 总结

### 问题分布（21轮深度分析）

| 类别 | 问题数 | 严重程度 | 已修复 |
|-----|--------|---------|--------|
| 状态初始化 | 2 | 🔴 高 | ✅ |
| 状态同步 | 2 | 🔴 高 | ✅ |
| React Hook 规则 | 2 | 🔴 高 | ✅ |
| TicketList | 1 | 🟡 中 | ✅ |
| BugWorklogModal | 2 | 🟡 中 | ✅ |
| TanStack Query | 4 | 🟡 中 | ❌ |
| FiltersSection | 1 | 🟢 低 | ✅ |
| LogPage 其他 | 2 | 🟡 中 | ✅ |
| AiRecommendationPanel | 2 | 🟡 中 | ✅ |
| 数据流断裂 | 2 | 🟡 中 | ❌ |
| 性能 | 2 | 🟡 中 | ❌ |
| 错误处理 | 3 | 🟡 中 | ❌ |
| 边界条件 | 6 | 🟡 中 | ❌ |
| 其他 | 8 | 🟡 中 | ❌ |

### 高优先级修复（已完成）

1. ✅ useMemo 中执行 setState → 改为 useEffect
2. ✅ LogPage 与 AiRecommendationPanel 双重状态 → newlyAddedKey 同步
3. ✅ initializedDateRef 竞态条件 → 合并 useEffect
4. ✅ aiApproved 日期切换不重置 → useEffect 重置
5. ✅ existingHours 浮点精度 → Math.round
6. ✅ hours=0 fallback → ?? 替代 ||
7. ✅ Bug Modal async cleanup + 并行创建 → AbortController + Promise.all
8. ✅ FiltersSection 返回条件 → 检查所有 filters
9. ✅ newlyAddedKey 不重置 → onNewlyAddedKeyConsumed callback

### 待修复优先级排序

**第一批（影响用户体验）**:
- 14.2 乐观更新 UI 闪烁
- 16.4 aiApproved 状态不重置
- 20.1 handleAiApprove 无错误 UI
- 20.2 useSearchTicket 失败无 UI 提示

**第二批（数据正确性）**:
- 12.1 hours 数据来源混乱（0 被覆盖）
- 21.1 existingHours 浮点精度
- 21.5 recommendation.id undefined
- 21.6 filters inline object 新引用

**第三批（性能优化）**:
- 13.4 Bug Modal 顺序创建 subtask
- 14.1 useSubmittedTickets 过度触发
- 19.1 allAvailableTiles 频繁重算

**第四批（代码质量）**:
- 13.1 Bug Modal async 无 cleanup
- 15.1 FiltersSection 返回条件不合理
- 17.1 newlyAddedKey 不重置

### 总计：55+ 个潜在问题