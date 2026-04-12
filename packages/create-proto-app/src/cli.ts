#!/usr/bin/env node

import { resolve, basename } from 'node:path'
import { existsSync } from 'node:fs'
import { copyTemplate } from './copy-template.js'
import { renamePackage } from './rename-package.js'
import { execSync } from 'node:child_process'

const projectName = process.argv[2]

if (!projectName) {
  console.error('Usage: create-proto-app <project-name>')
  process.exit(1)
}

const targetDir = resolve(process.cwd(), projectName)

if (existsSync(targetDir)) {
  console.error(`Directory "${projectName}" already exists.`)
  process.exit(1)
}

const templateDir = resolve(import.meta.dirname, '..', '..', '..', 'examples', 'minimal')

if (!existsSync(templateDir)) {
  console.error(`Template not found at ${templateDir}. Make sure you're running from the proto monorepo.`)
  process.exit(1)
}

console.log(`Creating new proto app: ${projectName}`)

copyTemplate(templateDir, targetDir)
renamePackage(targetDir, projectName)

try {
  execSync('git init && git add . && git commit -m "initial commit from create-proto-app"', {
    cwd: targetDir,
    stdio: 'pipe',
  })
  console.log('Initialized git repository.')
} catch {
  console.log('Skipped git init (git not available or failed).')
}

console.log(`
Done! Your new proto app is ready at ./${projectName}

Next steps:
  cd ${projectName}
  npm install
  cp .env.example .env
  npm run dev
`)
