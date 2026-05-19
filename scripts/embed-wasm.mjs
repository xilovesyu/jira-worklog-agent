import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.join(__dirname, '..')

// Read wasm file and create JS module with embedded binary
const wasmPath = path.join(rootDir, 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm')
const wasmBuffer = fs.readFileSync(wasmPath)
const wasmBase64 = wasmBuffer.toString('base64')

// Generate JS module that exports the wasm binary
const outputContent = `// Embedded sql.js wasm binary (auto-generated)
export const wasmBinary = Buffer.from('${wasmBase64}', 'base64');
`

const outputPath = path.join(rootDir, 'src', 'wasmEmbed.mjs')
fs.writeFileSync(outputPath, outputContent)

console.log(`✅ Embedded sql-wasm.wasm (${Math.round(wasmBuffer.length / 1024)}KB) into src/wasmEmbed.mjs`)