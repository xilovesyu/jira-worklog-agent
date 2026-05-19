import OpenAI from 'openai'
import { loadConfig } from '../config.mjs'
import { logLlmCall } from '../storage.mjs'

/**
 * LLM Engine for AI time recording
 * LLM config is read from config.yaml and .env (not SQLite)
 * Supports OpenAI API with JSON mode
 * Supports custom baseURL for Azure OpenAI or self-hosted endpoints
 */

let openaiClient = null
let cachedConfig = null

/**
 * Get LLM configuration from config.yaml and .env
 */
function getLlmConfigFromYaml() {
  if (cachedConfig) return cachedConfig

  const config = loadConfig()

  cachedConfig = {
    provider: config.llm?.provider || 'openai',
    model: config.llm?.model || 'gpt-4o-mini',
    base_url: config.llm?.base_url || null,
    api_key_env: config.llm?.api_key_env || 'OPENAI_API_KEY',
    max_tokens: config.llm?.max_tokens || 1024,
    temperature: config.llm?.temperature || 0.3,
    enabled: config.llm?.enabled !== false  // Default true unless explicitly false
  }

  return cachedConfig
}

/**
 * Get or initialize the OpenAI client
 */
function getLlmClient() {
  if (openaiClient) return openaiClient

  const llmConfig = getLlmConfigFromYaml()

  console.log('🔧 Initializing LLM Client:')
  console.log(`   Provider: ${llmConfig.provider}`)
  console.log(`   Model: ${llmConfig.model}`)
  console.log(`   Base URL: ${llmConfig.base_url || 'default OpenAI'}`)

  // Get API key from environment variable
  const apiKey = process.env[llmConfig.api_key_env]

  console.log(`   API key env var: ${llmConfig.api_key_env}`)
  console.log(`   API key value: ${apiKey ? '✅ set' : '❌ missing'}`)

  if (!apiKey) {
    console.warn(`⚠️  LLM API key not found. Set environment variable ${llmConfig.api_key_env}`)
    return null
  }

  openaiClient = new OpenAI({
    apiKey,
    baseURL: llmConfig.base_url || undefined
  })

  if (llmConfig.base_url) {
    console.log(`✅ Using custom LLM endpoint: ${llmConfig.base_url}`)
  }

  return openaiClient
}

/**
 * Check if LLM is enabled and available
 */
export function isLlmAvailable() {
  const llmConfig = getLlmConfigFromYaml()

  console.log('🔍 LLM Availability Check:')
  console.log(`   enabled (config.yaml): ${llmConfig.enabled}`)
  console.log(`   api_key_env: ${llmConfig.api_key_env}`)

  if (!llmConfig.enabled) {
    console.log('   ❌ LLM is disabled in config.yaml')
    return false
  }

  const apiKey = process.env[llmConfig.api_key_env]
  console.log(`   API key in env: ${apiKey ? '✅ exists' : '❌ missing'}`)

  return !!apiKey
}

/**
 * Get LLM configuration
 */
export function getLlmConfig() {
  const llmConfig = getLlmConfigFromYaml()

  return {
    ...llmConfig,
    enabled: llmConfig.enabled && isLlmAvailable()
  }
}

/**
 * System prompt for work time recording assistant
 */
const SYSTEM_PROMPT = `你是一个工作时间记录助手。你的任务是分析用户的工作证据（Git提交、Jira活动、历史记录），判断用户今天在哪些Jira ticket上工作，并推荐时间分配。

你的输出必须是JSON格式，包含：
1. matched_tickets: 匹配的ticket列表，每个包含key、confidence(0-100)、reason
2. allocation: 时间分配建议 {ticketKey: hours}
3. summary: 一句话总结用户今天的工作
4. confidence_level: 整体置信度 (high/medium/low)

## 时间判断规则（非常重要！）

每个ticket的activityDetails包含具体时间信息：
- time: 操作时间戳（如 "2026-05-15T09:06:00.000+0000"）
- date: 操作日期（如 "2026-05-15"）
- isToday: 是否是今天操作（true/false）
- actions: 操作类型列表

**重要：必须根据 isToday 判断！**
- isToday=true: 用户今天确实操作了这个ticket，优先推荐
- isToday=false: 用户之前操作过，不代表今天工作了

## Bug父任务规则（非常重要！）

**如果父任务是Bug类型，只推荐子任务，不推荐父任务本身！**

判断依据：
- typeName: 当前ticket的类型（如 "Sub-task", "Bug", "Task" 等）
- isSubtask: 是否是子任务（true/false）
- parentKey: 父任务的key（如 "PROJ-123"）
- parentTypeName: 父任务的类型（如 "Bug", "Task", "Story" 等）

规则：
1. 如果 ticket 的 parentTypeName 是 "Bug"，这个 ticket 是 Bug 的子任务
2. 如果多个 ticket 共享同一个 Bug parentKey，说明它们是同一个 Bug 的子任务
3. **Bug 父任务本身不应该被推荐** - 时间应该记录在具体的子任务上
4. 优先推荐有今天操作的子任务

示例：
- PROJ-123 是 Bug (parentTypeName="Bug")
- PROJ-124 是 PROJ-123 的子任务 (parentKey="PROJ-123", isSubtask=true)
- PROJ-125 是 PROJ-123 的子任务 (parentKey="PROJ-123", isSubtask=true)
- 应该推荐 PROJ-124 和 PROJ-125，不推荐 PROJ-123

## 优先级排序规则

### 最高优先级
1. **今天有Jira操作（isToday=true）**
   - 用户今天确实操作了ticket
   - 状态变更、评论、字段更新等
   - 置信度(80-100)

### 高优先级
2. **Assignee是当前用户 + 状态是 In Development / In Progress**
   - 正在开发中，可能今天工作
   - 但如果没有今天的操作记录，置信度降低(60-70)

### 中优先级
3. **之前工作过的 ticket（有历史记录）**
   - 用户最近几天记录过时间的 ticket
   - 可能继续工作
   - 置信度(50-70)

### 低优先级
4. **过去7天有操作但不是今天**
   - activityCount > 0 但 activityTodayCount = 0
   - 不代表今天工作，谨慎推荐
   - 置信度(30-50)

### 不选择
5. **状态是 Closed/Done 且很久没更新**
   - 已完成很久，不需要再记录

6. **Bug 类型的父任务（有子任务存在时）**
   - 时间应该记录在子任务上，不是父任务

## 证据权重调整

- **今天有Jira操作（isToday=true）**: +40分（最高权重）
- **今天有状态变更**: +30分
- **今天有评论**: +20分
- **过去有操作但不是今天**: +5分（低权重）
- **历史使用频率**: 每次+5分
- **Git commit message提到ticket key**: +30分

## 置信度阈值

- >=80: high
- >=60: medium
- >=30: low

## 已记录时间规则（非常重要！）

证据中包含 existingWorklog 和 targetHours 字段：
- existingWorklog: 已记录的ticket列表，包含 key、summary、hours
- existingTotalHours: 已记录的总工时
- targetHours: 需要推荐的工时（= 8 - existingTotalHours）

**重要规则：**
1. 推荐的总工时必须等于 targetHours（不是固定8小时）
2. 如果 targetHours = 0（已满8小时），返回空的推荐
3. **已记录过的ticket可以继续推荐**，用户可能在同一个ticket上持续工作
4. 在推荐说明中提及"您已记录X小时，还需补充Y小时"

## 时间分配建议

- 今天有操作的ticket: 优先分配较多工时（可根据targetHours调整）
- 正在开发的ticket: 1-2小时
- 历史ticket无新操作: 0.5-1小时或不分配
- **推荐的总时间必须等于 targetHours（补充到8小时）**

## 输出要求

在reasoning中说明：
- 如果推荐有今天操作的ticket，说明"用户今天在XX时间操作了此ticket"
- 如果推荐无今天操作的ticket，说明原因（如"正在开发中可能继续工作"）
- 如果有Bug的子任务被推荐，说明"这是Bug PROJ-XXX的子任务"
- 如果已有记录，说明"您已记录X小时在[KEY-1, KEY-2]，建议补充Y小时"`

/**
 * Log LLM error in a structured format
 */
function logLlmError(error, llmConfig) {
  console.log('\n❌ LLM API Error:')
  console.log(`   Type: ${error.constructor.name}`)
  console.log(`   Message: ${error.message}`)
  console.log(`   Status: ${error.status || 'N/A'}`)

  // Log response body if available
  if (error.response?.data) {
    console.log('   Response:')
    try {
      const body = typeof error.response.data === 'string'
        ? error.response.data
        : JSON.stringify(error.response.data)
      console.log(`   ${body.slice(0, 300)}${body.length > 300 ? '...' : ''}`)
    } catch {
      console.log('   (Could not parse response)')
    }
  }

  // Request ID for debugging
  const requestId = error.request_id || error.headers?.get?.('x-request-id')
  if (requestId) {
    console.log(`   Request ID: ${requestId}`)
  }

  handleLlmError(error)
}

/**
 * Call LLM with JSON mode
 * @param {string} userPrompt - User prompt with evidence data
 * @param {object} options - Optional parameters
 * @returns {object} - Parsed JSON response or null on error
 */
export async function callLlm(userPrompt, options = {}) {
  const client = getLlmClient()
  if (!client) {
    console.warn('⚠️  LLM client not available, will use fallback')
    return null
  }

  const llmConfig = getLlmConfig()
  const callType = options.callType || 'decision'

  // Log request summary (single point)
  console.log(`\n🤖 LLM Request: ${llmConfig.model} | ${callType} | ${userPrompt.length} chars`)

  try {
    const startTime = Date.now()

    const response = await client.chat.completions.create({
      model: llmConfig.model,
      max_tokens: llmConfig.max_tokens,
      temperature: llmConfig.temperature,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt }
      ]
    })

    const elapsed = Date.now() - startTime
    console.log(`   ✅ Response in ${elapsed}ms`)

    // Extract usage stats
    const usage = response.usage
    const inputTokens = usage.prompt_tokens || 0
    const outputTokens = usage.completion_tokens || 0

    // Calculate cost (GPT-4o-mini pricing: $0.15/M input, $0.60/M output)
    const inputCost = inputTokens * 0.15 / 1000000
    const outputCost = outputTokens * 0.60 / 1000000
    const totalCost = inputCost + outputCost

    console.log(`   📊 Tokens: ${inputTokens} in + ${outputTokens} out | Cost: $${totalCost.toFixed(6)}`)

    // Log for tracking
    logLlmCall({
      call_type: callType,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      cost_usd: totalCost,
      cached: false,
      model: llmConfig.model
    })

    // Parse response
    const content = response.choices[0]?.message?.content
    if (content) {
      const parsed = JSON.parse(content)
      console.log(`   📝 Response preview: ${JSON.stringify(parsed).slice(0, 100)}...`)
      return parsed
    }

    return null
  } catch (error) {
    logLlmError(error, llmConfig)
    return null
  }
}

/**
 * Parse JSON from LLM response (fallback for non-JSON mode)
 * OpenAI JSON mode returns valid JSON directly, but this is kept for safety
 */
export function parseLlmResponse(responseText) {
  try {
    return JSON.parse(responseText)
  } catch {
    // Try extracting JSON from markdown code block
    const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)```/)
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[1].trim())
      } catch {
        console.warn('⚠️  Failed to parse JSON from code block')
      }
    }

    // Try finding JSON object in text
    const objectMatch = responseText.match(/\{[\s\S]*\}/)
    if (objectMatch) {
      try {
        return JSON.parse(objectMatch[0])
      } catch {
        console.warn('⚠️  Failed to parse JSON object from text')
      }
    }

    console.warn('⚠️  Could not parse LLM response as JSON')
    return null
  }
}

/**
 * Handle LLM API errors
 */
function handleLlmError(error) {
  if (error.status === 401 || error.code === 'invalid_api_key') {
    console.error('❌ OpenAI API key is invalid')
  } else if (error.status === 429 || error.code === 'rate_limit_exceeded') {
    console.error('❌ OpenAI API rate limit exceeded')
  } else if (error.code === 'insufficient_quota') {
    console.error('❌ OpenAI API quota exceeded')
  } else {
    console.error('❌ OpenAI API error:', error.message || error.code)
  }
}

/**
 * Build prompt for commit analysis
 */
export function buildCommitAnalysisPrompt(commits, candidates) {
  const commitsJson = JSON.stringify(commits, null, 2)
  const candidatesJson = JSON.stringify(candidates.map(c => ({
    key: c.key,
    summary: c.summary
  })), null, 2)

  return `分析以下git commits，判断用户今天可能在哪些Jira ticket上工作。

Commits:
${commitsJson}

候选tickets:
${candidatesJson}

请输出JSON格式的分析结果。`
}

/**
 * Build prompt for activity analysis
 */
export function buildActivityAnalysisPrompt(ticketKey, activities) {
  const activitiesJson = JSON.stringify(activities, null, 2)

  return `分析用户在ticket ${ticketKey}上的活动记录，评估工作量。

活动记录:
${activitiesJson}

请输出JSON格式:
{
  "work_intensity": "low|medium|high",
  "estimated_hours": number,
  "work_summary": "一句话描述"
}`
}

/**
 * Build prompt for final decision
 */
export function buildDecisionPrompt(evidence) {
  const evidenceJson = JSON.stringify(evidence, null, 2)
  const targetHours = evidence.targetHours || 8

  return `综合以下证据，推荐今日worklog记录。

**重要：推荐的总工时必须等于 ${targetHours} 小时（补充到8小时）**

证据汇总:
${evidenceJson}

请输出JSON格式:
{
  "recommendation": {
    "tickets": ["KEY-1", "KEY-2"],
    "allocation": {"KEY-1": hours, "KEY-2": hours},
    "total_hours": ${targetHours}
  },
  "reasoning": {"KEY-1": "推荐原因...", "KEY-2": "..."},
  "explanation": "给用户的自然语言推荐说明（中文）",
  "confidence_level": "high|medium|low"
}`
}

/**
 * Get LLM status for API endpoint
 */
export function getLlmStatus() {
  const available = isLlmAvailable()
  const config = getLlmConfig()

  return {
    available,
    provider: config.provider,
    model: config.model,
    base_url: config.base_url,
    enabled: config.enabled
  }
}