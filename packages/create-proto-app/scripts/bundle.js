/**
 * Copies the minimal template and construction skills into the package
 * so create-proto-app works when published to npm (outside the monorepo).
 */
import { cpSync, existsSync, mkdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const pkgRoot = resolve(__dirname, '..')
const monoRoot = resolve(pkgRoot, '..', '..')

// Bundle template
const templateSrc = resolve(monoRoot, 'examples', 'minimal')
const templateDest = resolve(pkgRoot, 'template')

if (existsSync(templateSrc)) {
  cpSync(templateSrc, templateDest, {
    recursive: true,
    filter: (src) => {
      const name = src.split('/').pop() || ''
      return !['node_modules', 'dist'].includes(name) && !name.endsWith('.tsbuildinfo')
    },
  })
  console.log('Bundled template from examples/minimal/')
}

// Bundle skills
const SKILLS = [
  'proto-tool', 'proto-widget', 'proto-entity', 'proto-workflow',
  'proto-migration', 'proto-debug', 'proto-deploy',
]
const skillsSrc = resolve(monoRoot, '.claude', 'skills')
const skillsDest = resolve(pkgRoot, 'skills')

if (existsSync(skillsSrc)) {
  for (const skill of SKILLS) {
    const src = resolve(skillsSrc, skill)
    if (existsSync(src)) {
      cpSync(src, resolve(skillsDest, skill), { recursive: true })
    }
  }
  console.log('Bundled construction skills')
}
