import { readFileSync, existsSync } from 'node:fs'
import type { ChatRequest } from '@tleblancureta/proto/shared'
import { config, resolveAppPath } from './config.js'
import type { Skill } from './registry.js'

/**
 * Build tool map from skills, resolving one level of `depends`.
 */
function getSkillToolsMap(skills: Skill[]): Record<string, string[]> {
  const raw: Record<string, string[]> = {}
  const deps: Record<string, string[]> = {}
  for (const s of skills) {
    if (!s.mcp_tools?.length) continue
    raw[s.name] = s.mcp_tools
    deps[s.name] = s.depends || []
  }
  const out: Record<string, string[]> = {}
  for (const [name, tools] of Object.entries(raw)) {
    const all = [...tools]
    for (const d of deps[name] || []) {
      for (const t of raw[d] || []) {
        if (!all.includes(t)) all.push(t)
      }
    }
    out[name] = all
  }
  return out
}

export function buildSystemPrompt(request: ChatRequest, allSkills: Skill[] = []): string {
  const parts: string[] = []

  // Channel-specific base prompt
  const promptKey = request.channel === 'whatsapp' ? 'whatsapp' : 'default'
  const promptFile = config.prompts[promptKey] || config.prompts.default
  const promptPath = resolveAppPath(promptFile)

  if (existsSync(promptPath)) {
    parts.push(readFileSync(promptPath, 'utf-8'))
  }

  // Current date/time
  const now = new Date()
  const tz = config.timezone
  const formatter = new Intl.DateTimeFormat('es-CL', {
    timeZone: tz,
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
  parts.push(`\n## Fecha y hora actual\n\n- ${formatter.format(now)} (${tz})`)

  // Company context
  if (request.company_context) {
    let ctx = request.company_context
    if (request.user_id && request.user_id !== 'web-user') {
      ctx += `\n- Email del usuario: ${request.user_id}`
    }
    parts.push(`\n## Empresa activa\n\n${ctx}`)
  }

  // Skills
  let skills = request.enabled_skills
  const channelExcluded = config.channel_excluded_skills[request.channel]
  if (skills.length && channelExcluded) {
    skills = skills.filter(s => !channelExcluded.has(s))
  }

  if (skills.length) {
    parts.push(
      `\n## Skills habilitados\n\n` +
      `Tienes ${skills.length} skills disponibles: ${skills.join(', ')}. ` +
      `Usa el Skill tool para invocarlos cuando sean relevantes.`
    )

    // Tool restrictions
    const allSkillTools = getSkillToolsMap(allSkills)
    const enabledSet = new Set(skills)
    const allowed: string[] = []
    const denied: string[] = []

    for (const [name, tools] of Object.entries(allSkillTools)) {
      if (enabledSet.has(name)) {
        allowed.push(...tools)
      } else {
        denied.push(...tools)
      }
    }
    allowed.push(...config.always_allowed_tools)

    if (denied.length) {
      parts.push(`\n## RESTRICCION DE TOOLS\n`)
      parts.push(`Tools permitidos: ${[...new Set(allowed)].sort().map(t => `\`${t}\``).join(', ')}`)
      parts.push(
        `\nTools DENEGADOS: ${[...new Set(denied)].sort().map(t => `\`${t}\``).join(', ')}. ` +
        `Si el usuario pide algo de estos dominios, dile que no tienes acceso.`
      )
    }
  }

  // Output format
  if (request.output_format && request.output_format !== 'text') {
    const formats: Record<string, string> = {
      excel: 'Genera el resultado como archivo Excel (.xlsx) y guardalo en el directorio actual.',
      pdf: 'Genera el resultado como archivo PDF y guardalo en el directorio actual.',
      summary: 'Responde con un resumen conciso de maximo 3-4 oraciones.',
    }
    parts.push(`\n## Formato de output\n\n${formats[request.output_format] || request.output_format}`)
  }

  // Additional instructions
  if (request.system_instructions) {
    parts.push(`\n## Instrucciones adicionales\n\n${request.system_instructions}`)
  }

  return parts.join('\n\n')
}
