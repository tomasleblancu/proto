#!/usr/bin/env node

import { resolve } from 'node:path'
import { existsSync } from 'node:fs'
import { copyTemplate } from './copy-template.js'
import { renamePackage } from './rename-package.js'
import { copySkills } from './copy-skills.js'
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

// Bundled template (npm publish) or monorepo template (local dev)
const bundledTemplate = resolve(import.meta.dirname, '..', 'template')
const monorepoTemplate = resolve(import.meta.dirname, '..', '..', '..', 'examples', 'minimal')
const templateDir = existsSync(bundledTemplate) ? bundledTemplate : monorepoTemplate

if (!existsSync(templateDir)) {
  console.error('Template not found. Run from the proto monorepo or install create-proto-app from npm.')
  process.exit(1)
}

// Skills: bundled or monorepo
const bundledSkills = resolve(import.meta.dirname, '..', 'skills')
const monorepoSkills = resolve(import.meta.dirname, '..', '..', '..', '.claude', 'skills')
const skillsDir = existsSync(bundledSkills) ? bundledSkills : monorepoSkills

console.log(`Creating new proto app: ${projectName}`)

copyTemplate(templateDir, targetDir)
renamePackage(targetDir, projectName)
copySkills(skillsDir, targetDir)

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
