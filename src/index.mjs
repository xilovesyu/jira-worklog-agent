import dotenv from 'dotenv'
import path from 'path'
import fs from 'fs'
import express from 'express'
import cors from 'cors'
import cron from 'node-cron'
import notifier from 'node-notifier'
import { getUserDataDir } from './paths.mjs'

const USER_DATA_DIR = getUserDataDir()

// Ensure user data directory exists
if (!fs.existsSync(USER_DATA_DIR)) {
  fs.mkdirSync(USER_DATA_DIR, { recursive: true })
}

// Load .env from user data directory (APPDATA)
const envPath = path.join(USER_DATA_DIR, '.env')
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath })
  console.log('📦 Loaded .env from:', envPath)
} else {
  // Fallback: try current directory (dev mode)
  dotenv.config()
}

import { loadConfig, USER_DATA_DIR as CONFIG_USER_DATA_DIR, getProgramDir } from './config.mjs'
import { initDatabase, hasWorklogForToday } from './storage.mjs'
import { testConnection } from './jiraClient.mjs'
import { registerApiRoutes } from './api.mjs'

// Get base directory - works in both dev and packaged modes
const getBaseDir = () => {
  if (process.pkg) {
    return path.dirname(process.execPath)
  }
  return process.cwd()
}

const config = loadConfig()

// 重复提醒状态
let reminderInterval = null
let reminderCount = 0

// 检查是否为工作日（排除周末）
function isWorkday(date = new Date()) {
  const day = date.getDay()
  return day !== 0 && day !== 6 // 0=周日, 6=周六
}

// 发送桌面通知提醒
function sendReminder() {
  const today = new Date().toLocaleDateString('zh-CN')
  const uiPort = config.ui?.port || 7302

  reminderCount++
  console.log(`🔔 [${new Date().toLocaleTimeString()}] 发送桌面通知提醒 (第 ${reminderCount} 次)`)

  // Notify path: in packaged mode, use APPDATA/notifier
  const notifyPath = process.pkg
    ? path.join(USER_DATA_DIR, 'notifier')
    : null

  notifier.notify({
    title: '⏰ 工作时间记录提醒',
    message: `今天是 ${today}，请记录今天的工时`,
    sound: true,
    wait: true,
    open: `http://localhost:${uiPort}`,
    customPath: notifyPath
  })
}

// 停止重复提醒
function stopReminderLoop() {
  if (reminderInterval) {
    clearInterval(reminderInterval)
    reminderInterval = null
    console.log('🛑 停止重复提醒')
  }
  reminderCount = 0
}

// 启动重复提醒循环（每5分钟提醒一次，直到停止时间）
function startReminderLoop() {
  const schedulerConfig = config.scheduler || {}
  const triggerTime = schedulerConfig.trigger_time || '17:00'
  const reminderIntervalMinutes = schedulerConfig.reminder_interval || 5 // 默认5分钟

  // 计算停止时间（触发时间后1小时）
  const [hour, minute] = triggerTime.split(':').map(Number)
  const stopHour = hour + 1 // 17:00 → 18:00 停止

  stopReminderLoop() // 先清理之前的定时器
  reminderCount = 0

  // 第一次提醒
  sendReminder()

  // 设置重复提醒（每5分钟）
  reminderInterval = setInterval(async () => {
    const now = new Date()
    const currentHour = now.getHours()

    // 检查是否超过停止时间
    if (currentHour >= stopHour) {
      console.log(`⏰ 已到达停止时间 ${stopHour}:00，停止提醒`)
      stopReminderLoop()
      return
    }

    // 检查是否已有工时记录
    try {
      const hasLogged = await hasWorklogForToday()
      if (hasLogged) {
        console.log('✅ 今天已有工时记录，停止提醒')
        stopReminderLoop()
        return
      }
    } catch (err) {
      // 检查失败继续提醒
    }

    // 发送提醒
    sendReminder()
  }, reminderIntervalMinutes * 60 * 1000)

  console.log(`🔄 重复提醒已启动: 每 ${reminderIntervalMinutes} 分钟一次，直到 ${stopHour}:00`)
}

// 启动定时任务调度器
function startScheduler() {
  const schedulerConfig = config.scheduler || {}

  if (!schedulerConfig.enabled) {
    console.log('📅 定时提醒已禁用 (scheduler.enabled = false)')
    return
  }

  const triggerTime = schedulerConfig.trigger_time || '17:00'
  const timezone = schedulerConfig.timezone || 'Asia/Shanghai'

  // 解析触发时间 "17:00" → cron 格式 "0 17 * * *"
  const [hour, minute] = triggerTime.split(':').map(Number)
  const cronExpression = `${minute} ${hour} * * 1-5` // 1-5 = 周一到周五

  console.log(`📅 定时提醒已启用: 每天 ${triggerTime} (${timezone})，重复提醒直到 ${hour + 1}:00`)

  cron.schedule(cronExpression, async () => {
    if (!isWorkday()) {
      console.log('📅 今天是周末，跳过提醒')
      return
    }

    // 检查今天是否已有记录
    try {
      const hasLogged = await hasWorklogForToday()
      if (hasLogged) {
        console.log('✅ 今天已有工时记录，跳过提醒')
        return
      }
    } catch (err) {
      // 检查失败不影响提醒
    }

    // 启动重复提醒循环
    startReminderLoop()
  }, {
    timezone,
    scheduled: true
  })
}

async function main() {
  console.log('🚀 Starting Jira Worklog Agent...')

  // Initialize database (async with sql.js)
  await initDatabase()
  console.log('✅ Database initialized')

  // Test Jira connection
  try {
    await testConnection()
    console.log('✅ Jira connection successful')
  } catch (err) {
    console.warn('⚠️  Jira connection failed:', err.message)
    console.warn('   Please check your .env configuration')
  }

  // Start scheduler
  startScheduler()

  // Start Express API
  const app = express()
  app.use(cors())
  app.use(express.json())

  // Register API routes
  registerApiRoutes(app)

  // ========== Static UI Serving ==========
  // CRITICAL: Development vs Production mode distinction
  //
  // Development (process.pkg is undefined):
  //   - Port 7301: API ONLY (no static UI)
  //   - Port 7302: Vite dev server with hot reload (run separately: cd ui && npm run dev)
  //
  // Production (process.pkg is defined - bundled exe):
  //   - Port 7301: API + Static UI (single port for everything)
  //
  const port = config.api?.port || 7301
  const uiPort = config.ui?.port || 7302
  // Production mode: either bundled (process.pkg) or explicitly set via env
  const isProduction = !!process.pkg || process.env.PRODUCTION_MODE === 'true'

  if (isProduction) {
    // ========== PRODUCTION MODE ==========
    // Serve static UI from the same port as API (single-port deployment)
    const uiDistPath = path.join(USER_DATA_DIR, 'ui')

    if (fs.existsSync(uiDistPath)) {
      app.use(express.static(uiDistPath))
      console.log(`✅ UI static files served from: ${uiDistPath}`)

      // SPA fallback - all non-API routes return index.html
      app.get('*', (req, res, next) => {
        if (req.path.startsWith('/api')) return next()
        try {
          const indexPath = path.join(uiDistPath, 'index.html')
          res.sendFile(indexPath)
        } catch (err) {
          res.status(404).send('UI not found')
        }
      })
    } else {
      console.log('⚠️  UI files not found. Please ensure ui/ directory exists.')
    }

    app.listen(port, () => {
      console.log(`✅ Server running at http://localhost:${port}`)
      console.log(`📍 Open UI: http://localhost:${port}`)
    })
  } else {
    // ========== DEVELOPMENT MODE ==========
    // API server only on port 7301
    // Frontend dev server (Vite) runs separately on port 7302
    //
    // DO NOT serve static UI here - it conflicts with Vite and causes confusion
    // If you want to test production build locally, use: npm run build && npm run start:prod

    // API 404 handler for development
    app.use((req, res) => {
      if (!req.path.startsWith('/api')) {
        res.status(404).json({
          error: 'API endpoint not found',
          hint: 'In dev mode, UI runs on Vite. Access http://localhost:' + uiPort
        })
      }
    })

    app.listen(port, () => {
      console.log(`✅ API server running at http://localhost:${port}`)
      console.log('')
      console.log('🔧 Development Mode')
      console.log('   API endpoint:   http://localhost:' + port)
      console.log('   Frontend (Vite): http://localhost:' + uiPort)
      console.log('')
      console.log('   To start Vite:  cd ui && npm run dev')
      console.log('   To test prod:   npm run build && npm run start:prod')
    })
  }
}

main().catch(err => {
  console.error('❌ Failed to start:', err)
  process.exit(1)
})