import fs from 'fs'
import path from 'path'
import os from 'os'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Get user data directory
function getUserDataDir() {
  const appName = 'jira-worklog-agent'
  const platform = os.platform()
  let baseDir
  if (platform === 'win32') {
    baseDir = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming')
  } else if (platform === 'darwin') {
    baseDir = path.join(os.homedir(), 'Library', 'Application Support')
  } else {
    baseDir = process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share')
  }
  return path.join(baseDir, appName)
}

// Copy file helper
function copyFile(src, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true })
  fs.copyFileSync(src, dest)
}

// Copy directory helper
function copyDir(src, dest) {
  if (!fs.existsSync(src)) return
  fs.mkdirSync(dest, { recursive: true })
  for (const item of fs.readdirSync(src)) {
    const srcPath = path.join(src, item)
    const destPath = path.join(dest, item)
    if (fs.statSync(srcPath).isDirectory()) {
      copyDir(srcPath, destPath)
    } else {
      copyFile(srcPath, destPath)
    }
  }
}

function install() {
  const targetDir = getUserDataDir()
  const distDir = path.join(__dirname, '..', 'dist')

  console.log('📦 Installing Jira Worklog Agent to:', targetDir)
  console.log('')

  // Ensure target directory exists
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true })
  }

  // Copy exe
  const exeSrc = path.join(distDir, 'jira-worklog-agent.exe')
  const exeDest = path.join(targetDir, 'jira-worklog-agent.exe')
  if (fs.existsSync(exeSrc)) {
    fs.copyFileSync(exeSrc, exeDest)
    console.log('  ✅ jira-worklog-agent.exe')
  } else {
    console.log('  ⚠️  jira-worklog-agent.exe not found in dist/')
    return
  }

  // Copy config.yaml
  const configSrc = path.join(distDir, 'config.yaml')
  const configDest = path.join(targetDir, 'config.yaml')
  if (fs.existsSync(configSrc)) {
    fs.copyFileSync(configSrc, configDest)
    console.log('  ✅ config.yaml')
  }

  // Copy .env.example as .env (if .env doesn't exist)
  const envDest = path.join(targetDir, '.env')
  if (!fs.existsSync(envDest)) {
    const envExampleSrc = path.join(distDir, '.env.example')
    if (fs.existsSync(envExampleSrc)) {
      fs.copyFileSync(envExampleSrc, envDest)
      console.log('  ✅ .env (from .env.example)')
    }
  } else {
    console.log('  ⏭️  .env exists, skipped')
  }

  // Copy notifier directory
  const notifierSrc = path.join(distDir, 'notifier')
  const notifierDest = path.join(targetDir, 'notifier')
  if (fs.existsSync(notifierSrc)) {
    copyDir(notifierSrc, notifierDest)
    console.log('  ✅ notifier/')
  }

  // Copy UI directory
  const uiSrc = path.join(distDir, 'ui')
  const uiDest = path.join(targetDir, 'ui')
  if (fs.existsSync(uiSrc)) {
    copyDir(uiSrc, uiDest)
    console.log('  ✅ ui/')
  }

  // Create data directory placeholder
  const dataDir = path.join(targetDir, 'data')
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true })
    console.log('  ✅ data/ (created)')
  }

  console.log('')
  console.log('✅ Installation complete!')
  console.log('')
  console.log('📁 Installed to:', targetDir)
  console.log('')
  console.log('Next steps:')
  console.log('  1. Edit .env: set JIRA_SERVER and JIRA_API_TOKEN')
  console.log('  2. Run: jira-worklog-agent.exe')
  console.log('  3. Open: http://localhost:7302')
}

install()