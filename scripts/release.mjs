import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.join(__dirname, '..')
const distDir = path.join(rootDir, 'dist')

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

// Copy config templates and create necessary directories
function copyReleaseFiles() {
  console.log('📦 Copying release files...')

  // Ensure dist directory exists
  if (!fs.existsSync(distDir)) {
    fs.mkdirSync(distDir, { recursive: true })
  }

  // Copy .env.example
  const envExampleSrc = path.join(rootDir, '.env.example')
  const envExampleDest = path.join(distDir, '.env.example')
  if (fs.existsSync(envExampleSrc)) {
    fs.copyFileSync(envExampleSrc, envExampleDest)
    console.log('  ✅ Copied .env.example')
  } else {
    // Create default .env.example
    const defaultEnv = `JIRA_SERVER=https://your-company.atlassian.net
JIRA_EMAIL=your@email.com
JIRA_API_TOKEN=your-api-token
API_PORT=7301
UI_PORT=7302
`
    fs.writeFileSync(envExampleDest, defaultEnv, 'utf8')
    console.log('  ✅ Created .env.example')
  }

  // Copy config.yaml template (will be auto-created on first run if missing)
  const configSrc = path.join(rootDir, 'config.yaml')
  const configDest = path.join(distDir, 'config.yaml')
  if (fs.existsSync(configSrc)) {
    fs.copyFileSync(configSrc, configDest)
    console.log('  ✅ Copied config.yaml')
  }

  // Copy node-notifier vendor files (optional - for desktop notifications)
  // These are native executables that cannot be embedded in pkg
  const notifierSrc = path.join(rootDir, 'node_modules', 'node-notifier', 'vendor')
  const notifierDest = path.join(distDir, 'notifier')
  if (fs.existsSync(notifierSrc)) {
    copyDir(notifierSrc, notifierDest)
    console.log('  ✅ Copied notifier/ (desktop notifications)')
  }

  // Note: sql-wasm.wasm is now embedded in the exe, no need to copy

  // Check for exe
  const exePath = path.join(distDir, 'jira-worklog-agent.exe')
  if (fs.existsSync(exePath)) {
    console.log('  ✅ jira-worklog-agent.exe exists')
  } else {
    console.log('  ⚠️  jira-worklog-agent.exe not found - run "npm run build:pkg" first')
  }

  console.log('')
  console.log('✅ Release files copied successfully!')
  console.log('')
  console.log('📁 Output directory:', distDir)
  console.log('')
  console.log('Required files:')
  console.log('  - jira-worklog-agent.exe (~38MB, includes UI + SQLite wasm)')
  console.log('  - config.yaml')
  console.log('  - .env (copy from .env.example)')
  console.log('  - notifier/ (desktop notifications)')
  console.log('')
  console.log('Data storage (auto-created on first run):')
  console.log('  Windows: %APPDATA%/jira-worklog-agent/data/')
  console.log('  macOS:   ~/Library/Application Support/jira-worklog-agent/data/')
  console.log('  Linux:   ~/.local/share/jira-worklog-agent/data/')
  console.log('')
  console.log('Usage:')
  console.log('  1. Copy .env.example to .env')
  console.log('  2. Edit .env: JIRA_SERVER, JIRA_API_TOKEN')
  console.log('  3. Double-click jira-worklog-agent.exe')
  console.log('  4. Open http://localhost:7302 in browser')
}

copyReleaseFiles()