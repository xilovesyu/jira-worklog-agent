import path from 'path'
import os from 'os'

/**
 * Get user data directory for cross-platform storage
 * Windows: %APPDATA%/jira-worklog-agent/
 * macOS: ~/Library/Application Support/jira-worklog-agent/
 * Linux: ~/.local/share/jira-worklog-agent/
 */
export function getUserDataDir() {
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

/**
 * Get program directory (where exe/config/wasm are located)
 */
export function getProgramDir() {
  return process.pkg ? path.dirname(process.execPath) : process.cwd()
}