import nodemailer, { type Transporter } from 'nodemailer'
import { config } from './config.js'
import {
  createThread,
  findThreadByMessageId,
  generateMessageId,
  recordMessage,
  type MailThread,
} from './mail-threads.js'

/**
 * System mailer. Single SMTP identity used for all outbound
 * notifications across all companies. Distinct from the user's personal
 * Gmail (which lives in gmail_tokens and is only used when the agent
 * reads/writes the user's own inbox as a tool).
 *
 * Every outbound also records a row in mail_messages so inbound replies
 * can be routed back to the same thread/session_key.
 */

let transporter: Transporter | null = null
let cachedFrom: string | null = null
let cachedReplyTo: string | null = null

function getTransporter(): Transporter | null {
  if (transporter) return transporter

  const host = process.env.MAIL_SMTP_HOST || process.env.HERMES_SMTP_HOST
  const port = parseInt(process.env.MAIL_SMTP_PORT || process.env.HERMES_SMTP_PORT || '587', 10)
  const user = process.env.MAIL_SMTP_USER || process.env.HERMES_SMTP_USER
  const pass = process.env.MAIL_SMTP_PASS || process.env.HERMES_SMTP_PASS

  if (!host || !user || !pass) return null

  transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  })

  const fromEnv = process.env.MAIL_SMTP_FROM || process.env.HERMES_SMTP_FROM
  cachedFrom = fromEnv || `${config.display_name} <${user}>`
  cachedReplyTo = process.env.MAIL_SMTP_REPLY_TO || process.env.HERMES_SMTP_REPLY_TO || cachedFrom

  return transporter
}

export interface SendResult {
  ok: boolean
  messageId?: string
  threadId?: string
  error?: string
}

export interface SendOptions {
  /** Company this mail belongs to — required so the thread is scoped correctly. */
  companyId: string
  /** Recipient address. */
  to: string
  /** Subject line. "Re: " will be added automatically if replying. */
  subject: string
  /** text/plain body. */
  body: string
  /** If replying to an existing thread, pass its id. */
  threadId?: string
  /** If replying, the parent Message-ID (goes into In-Reply-To / References). */
  inReplyTo?: string
  /** If this mail originates from a scheduled task, link it. */
  sourceTaskId?: string | null
  /** Optional explicit session_key for thread creation. */
  sessionKey?: string
}

/**
 * Send mail from the system account and record it as an outbound
 * thread message. Returns the generated Message-ID + thread id for
 * downstream bookkeeping. Never throws.
 */
export async function sendSystemMail(opts: SendOptions): Promise<SendResult> {
  const t = getTransporter()
  if (!t) {
    return {
      ok: false,
      error: 'MAIL_SMTP_* env vars not configured. Set MAIL_SMTP_HOST, _USER, _PASS (and optionally _PORT, _FROM, _REPLY_TO).',
    }
  }

  // Thread resolution: reuse an existing one or create a new one
  let thread: MailThread | null = null
  if (opts.threadId) {
    // Caller passed an explicit thread — look it up via its latest message
    // (simplest path: findThreadByMessageId of inReplyTo)
    if (opts.inReplyTo) {
      thread = await findThreadByMessageId(opts.inReplyTo)
    }
  }
  if (!thread) {
    try {
      thread = await createThread({
        companyId: opts.companyId,
        subject: opts.subject,
        initiatedBy: 'out',
        sourceTaskId: opts.sourceTaskId,
        externalAddress: opts.to,
        sessionKey: opts.sessionKey,
      })
    } catch (err: any) {
      return { ok: false, error: `createThread: ${err?.message || err}` }
    }
  }

  // Generate a stable Message-ID we control so dedup + threading work
  const messageId = generateMessageId()
  const subject = opts.inReplyTo && !/^\s*re:/i.test(opts.subject)
    ? `Re: ${opts.subject}`
    : opts.subject

  try {
    await t.sendMail({
      from: cachedFrom!,
      replyTo: cachedReplyTo!,
      to: opts.to,
      subject,
      text: opts.body,
      messageId,
      ...(opts.inReplyTo
        ? { inReplyTo: opts.inReplyTo, references: opts.inReplyTo }
        : {}),
    })
  } catch (err: any) {
    return { ok: false, error: err?.message || String(err) }
  }

  // Record the outbound message
  try {
    await recordMessage({
      threadId: thread.id,
      companyId: opts.companyId,
      direction: 'out',
      messageId,
      inReplyTo: opts.inReplyTo ?? null,
      fromAddress: cachedFrom!,
      toAddress: opts.to,
      subject,
      body: opts.body,
    })
  } catch (err: any) {
    // Mail already sent; surface but don't rollback
    return { ok: true, messageId, threadId: thread.id, error: `record failed: ${err?.message}` }
  }

  return { ok: true, messageId, threadId: thread.id }
}

export function isMailConfigured(): boolean {
  return getTransporter() !== null
}

/** @deprecated Use sendSystemMail instead. */
export const sendFromHermes = sendSystemMail
/** @deprecated Use isMailConfigured instead. */
export const isHermesMailConfigured = isMailConfigured
