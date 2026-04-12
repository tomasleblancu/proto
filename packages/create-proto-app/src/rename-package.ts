import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

function patchJson(filePath: string, name: string, webSuffix: string): void {
  if (!existsSync(filePath)) return
  let content = readFileSync(filePath, 'utf-8')
  content = content.replace(/@proto-app\/minimal/g, `@proto-app/${name}`)
  content = content.replace(/@proto-app\/minimal-web/g, `@proto-app/${webSuffix}`)
  writeFileSync(filePath, content)
}

function patchYaml(filePath: string, name: string): void {
  if (!existsSync(filePath)) return
  let content = readFileSync(filePath, 'utf-8')
  content = content.replace(/name: minimal/g, `name: ${name}`)
  content = content.replace(/display_name: Minimal/g, `display_name: ${name.charAt(0).toUpperCase() + name.slice(1)}`)
  content = content.replace(/minimal-mcp/g, `${name}-mcp`)
  writeFileSync(filePath, content)
}

function patchTitle(filePath: string, name: string): void {
  if (!existsSync(filePath)) return
  let content = readFileSync(filePath, 'utf-8')
  content = content.replace(/<title>Minimal<\/title>/g, `<title>${name.charAt(0).toUpperCase() + name.slice(1)}</title>`)
  writeFileSync(filePath, content)
}

function patchMcpName(filePath: string, name: string): void {
  if (!existsSync(filePath)) return
  let content = readFileSync(filePath, 'utf-8')
  content = content.replace(/name: 'minimal'/g, `name: '${name}'`)
  content = content.replace(/displayName: 'minimal'/g, `displayName: '${name}'`)
  writeFileSync(filePath, content)
}

export function renamePackage(targetDir: string, name: string): void {
  const webSuffix = `${name}-web`

  patchJson(join(targetDir, 'package.json'), name, webSuffix)
  patchJson(join(targetDir, 'web', 'package.json'), name, webSuffix)
  patchYaml(join(targetDir, 'project.yaml'), name)
  patchTitle(join(targetDir, 'web', 'index.html'), name)
  patchMcpName(join(targetDir, 'app', 'mcp.ts'), name)
  patchMcpName(join(targetDir, 'app', 'mcp-http.ts'), name)
}
