import { spawn } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { config, CLAUDE_MODEL, MAX_TURNS, TIMEOUT_SECONDS } from './config.js'
import { prepareSession, syncCredentialsBack } from './session.js'
import type { ChatRequest, ChatResponse, SSEEvent } from '@tleblancureta/proto/shared'

function buildAllowedTools(): string {
  const baseTools = ['Bash', 'Read']
  const mcpTools = Object.keys(config.mcp_servers).map(name => `mcp__${name}`)
  return [...baseTools, ...mcpTools].join(',')
}

function prependTimestamp(message: string): string {
  const now = new Date()
  const formatter = new Intl.DateTimeFormat('es-CL', {
    timeZone: config.timezone,
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
  return `[${formatter.format(now)} (${config.timezone})]\n\n${message}`
}

/** Persist Claude's session_id so we can --resume on next request */
function getSessionFile(sessionDir: string): string {
  return join(sessionDir, '.claude-session-id')
}

function getSavedSessionId(sessionDir: string): string | null {
  const file = getSessionFile(sessionDir)
  if (existsSync(file)) return readFileSync(file, 'utf-8').trim()
  return null
}

function saveSessionId(sessionDir: string, sessionId: string) {
  writeFileSync(getSessionFile(sessionDir), sessionId)
}

function buildCmd(
  message: string,
  promptFile: string,
  sessionDir: string,
  outputFormat: string,
  mcpConfigFile: string,
): string[] {
  const savedClaudeSession = getSavedSessionId(sessionDir)

  const cmd = [
    'claude',
    '-p', message,
    '--model', CLAUDE_MODEL,
    '--allowedTools', buildAllowedTools(),
    '--max-turns', String(MAX_TURNS),
    '--mcp-config', mcpConfigFile,
  ]

  // Always include system prompt (works with both new and resumed sessions)
  cmd.push('--system-prompt-file', promptFile)

  if (savedClaudeSession) {
    // Resume existing session (keeps conversation history)
    cmd.push('--resume', savedClaudeSession)
  }

  // Output format: always json for blocking (to capture session_id), stream-json for streaming
  cmd.push('--output-format', outputFormat)

  if (outputFormat === 'stream-json') {
    cmd.push('--verbose')
  }

  return cmd
}

/**
 * Execute a Claude Code turn (blocking, returns full response).
 */
export async function runClaude(request: ChatRequest): Promise<ChatResponse> {
  const { sessionId, sessionDir, env, promptFile, mcpConfigFile, claudeConfigDir } = await prepareSession(request)
  const message = prependTimestamp(request.message)
  const cmd = buildCmd(message, promptFile, sessionDir, 'json', mcpConfigFile)

  const start = Date.now()

  return new Promise((resolve, reject) => {
    const proc = spawn(cmd[0], cmd.slice(1), {
      cwd: sessionDir,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    let stdout = ''
    let stderr = ''
    let lastActivity = Date.now()
    proc.stdout.on('data', (data) => { stdout += data.toString(); lastActivity = Date.now() })
    proc.stderr.on('data', (data) => { stderr += data.toString(); lastActivity = Date.now() })

    // Idle timeout (no absolute deadline)
    const timer = setInterval(() => {
      if (Date.now() - lastActivity > TIMEOUT_SECONDS * 1000) {
        proc.kill('SIGKILL')
        clearInterval(timer)
        reject(new Error('Claude Code idle timeout'))
      }
    }, 5000)

    proc.on('close', (code) => {
      clearInterval(timer)
      const durationMs = Date.now() - start
      syncCredentialsBack(claudeConfigDir)

      if (code !== 0) {
        reject(new Error(`Claude Code error (rc=${code}): ${stderr.slice(0, 500)}`))
        return
      }

      // Parse JSON response to get session_id
      try {
        const result = JSON.parse(stdout.trim())
        if (result.session_id) saveSessionId(sessionDir, result.session_id)

        resolve({
          response: result.result || stdout.trim(),
          session_id: sessionId,
          duration_ms: durationMs,
          cost_usd: result.total_cost_usd,
        })
      } catch {
        resolve({
          response: stdout.trim(),
          session_id: sessionId,
          duration_ms: durationMs,
        })
      }
    })
  })
}

/**
 * Execute a Claude Code turn and yield SSE events.
 */
export async function* streamClaude(request: ChatRequest): AsyncGenerator<SSEEvent> {
  const { sessionId, sessionDir, env, promptFile, mcpConfigFile, claudeConfigDir } = await prepareSession(request)
  const message = prependTimestamp(request.message)
  const cmd = buildCmd(message, promptFile, sessionDir, 'stream-json', mcpConfigFile)

  const start = Date.now()

  yield { type: 'init', session_id: sessionId }

  const proc = spawn(cmd[0], cmd.slice(1), {
    cwd: sessionDir,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  // Idle timeout: kill the process only if it goes silent for TIMEOUT_SECONDS.
  // No absolute deadline — long tool chains (multi-scrape, etc) are OK as long
  // as they keep producing output.
  let lastActivity = Date.now()
  const idleCheck = setInterval(() => {
    if (Date.now() - lastActivity > TIMEOUT_SECONDS * 1000) {
      proc.kill('SIGKILL')
      clearInterval(idleCheck)
    }
  }, 5000)
  let buffer = ''

  try {
    for await (const chunk of proc.stdout) {
      lastActivity = Date.now()

      buffer += chunk.toString()
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed) continue

        let event: any
        try { event = JSON.parse(trimmed) } catch { continue }

        const etype = event.type || ''

        if (etype === 'assistant') {
          for (const block of event.message?.content || []) {
            if (block.type === 'thinking') {
              yield { type: 'thinking', text: block.thinking || '' }
            } else if (block.type === 'text') {
              yield { type: 'text', text: block.text }
            } else if (block.type === 'tool_use') {
              yield { type: 'tool_use', tool: block.name || '', args: block.input || {} }
            }
          }
        } else if (etype === 'tool_result') {
          let content = event.content || ''
          if (Array.isArray(content)) {
            content = content.filter((c: any) => c.type === 'text').map((c: any) => c.text).join('\n')
          }
          yield { type: 'tool_result', tool: event.tool_use_id || '', content: String(content).slice(0, 2000) }
        } else if (etype === 'result') {
          const durationMs = Date.now() - start
          const costUsd = event.total_cost_usd

          // Save session ID for --resume on next request
          if (event.session_id) saveSessionId(sessionDir, event.session_id)

          yield {
            type: 'result',
            text: event.result || '',
            session_id: sessionId,
            duration_ms: durationMs,
            cost_usd: costUsd,
            num_turns: event.num_turns,
          }
        }
      }
    }
  } catch (err) {
    proc.kill('SIGKILL')
    yield { type: 'error', message: String(err) }
  } finally {
    clearInterval(idleCheck)
    // Kill the process if still running (e.g. consumer broke out of the loop)
    if (!proc.killed) proc.kill('SIGTERM')
    syncCredentialsBack(claudeConfigDir)
  }
}
