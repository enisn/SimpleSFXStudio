import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, '..')
const localEnvFiles = ['.env.local', '.env']

export function loadLocalEnv() {
  const loadedFiles = []

  for (const fileName of localEnvFiles) {
    const filePath = path.join(projectRoot, fileName)

    if (existsSync(filePath)) {
      process.loadEnvFile(filePath)
      loadedFiles.push(fileName)
    }
  }

  return loadedFiles
}
