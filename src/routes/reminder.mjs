import notifier from 'node-notifier'
import path from 'path'
import { loadConfig } from '../config.mjs'
import { getUserDataDir } from '../paths.mjs'

/**
 * Register reminder routes
 */
export function registerReminderRoutes(app) {
  // POST /api/reminder/test - Test desktop notification
  app.post('/api/reminder/test', async (req, res) => {
    try {
      const config = loadConfig()
      const uiPort = config.ui?.port || 7302
      const today = new Date().toLocaleDateString('zh-CN')

      console.log(`🔔 [${new Date().toLocaleTimeString()}] 手动触发桌面通知测试`)

      // Notify path: in packaged mode, use APPDATA/notifier
      const notifyPath = process.pkg
        ? path.join(getUserDataDir(), 'notifier')
        : null

      notifier.notify({
        title: '⏰ 工作时间记录提醒',
        message: `今天是 ${today}，请记录今天的工时`,
        sound: true,
        wait: true,
        open: `http://localhost:${uiPort}`,
        customPath: notifyPath
      }, (err, response, metadata) => {
        if (err) {
          console.log('❌ notifier 错误:', err)
        } else {
          console.log('✅ notifier 响应:', response, metadata)
        }
      })

      res.json({ success: true, message: 'Desktop notification sent' })
    } catch (err) {
      console.error('Error sending notification:', err)
      res.status(500).json({ error: err.message })
    }
  })

  // POST /api/reminder/stop - Stop reminder loop
  app.post('/api/reminder/stop', async (req, res) => {
    try {
      console.log('✅ 用户已提交工时，停止提醒')
      res.json({ success: true, message: 'Reminder stopped' })
    } catch (err) {
      res.status(500).json({ error: err.message })
    }
  })
}