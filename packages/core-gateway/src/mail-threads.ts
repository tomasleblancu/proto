import { randomUUID } from 'node:crypto'
import { getSupabase } from './supabase.js'

/**
 * Mail thread + message persistence. The "state" of the email-as-chat
 * channel: threads map to Claude CLI session_keys so back-and-forth replies
 * resume context automatically, and messages let us dedup inbound by
 * Message-ID and find parents via In-Reply-To.
 */

export interface MailThread {
  id: string
  company_id: string
  subject: string | null
  session_key: string
  initiated_by: 'in' | 'out'
  source_task_id: string | null
  external_address: string
  closed: boolean
  last_activity_at: string
}

export interface MailMessage {
  id: string
  thread_id: string
  company_id: string
  direction: 'in' | 'out'
  message_id: string
  in_reply_to: string | null
  from_address: string
  to_address: string
  subject: string | null
  body: string | null
  run_id: string | null
  created_at: string
}

/**
 * RFC 5322 Message-ID generator. Format: <hermes-{uuid}@hermes>.
 * Must be stable and unique so both outbound (we set it) and inbound
 * dedup (we look it up) point at the same row.
 */
export function generateMessageId(domain = 'hermes'): string {
  return `<hermes-${randomUUID()}@${domain}>`
}

/**
 * Look up a thread by one of its message IDs (for inbound reply routing).
 */
export async function findThreadByMessageId(messageId: string): Promise<MailThread | null> {
  const db = getSupabase()
  const { data } = await db
    .from('mail_messages')
    .select('thread_id, mail_threads!inner(*)')
    .eq('message_id', messageId)
    .maybeSingle()
  // Supabase returns nested relation as object
  const thread = (data as any)?.mail_threads
  return thread ?? null
}

/**
 * Dedup check: has this Message-ID already been stored?
 */
export async function isMessageIdProcessed(messageId: string): Promise<boolean> {
  const db = getSupabase()
  const { data } = await db
    .from('mail_messages')
    .select('id')
    .eq('message_id', messageId)
    .maybeSingle()
  return !!data
}

interface CreateThreadOpts {
  companyId: string
  subject: string | null
  initiatedBy: 'in' | 'out'
  sourceTaskId?: string | null
  externalAddress: string
  sessionKey?: string // pass explicit session_key to reuse, otherwise generated
}

export async function createThread(opts: CreateThreadOpts): Promise<MailThread> {
  const db = getSupabase()
  const sessionKey = opts.sessionKey || `mail-thread-${randomUUID()}`
  const { data, error } = await db
    .from('mail_threads')
    .insert({
      company_id: opts.companyId,
      subject: normalizeSubject(opts.subject),
      session_key: sessionKey,
      initiated_by: opts.initiatedBy,
      source_task_id: opts.sourceTaskId ?? null,
      external_address: opts.externalAddress,
    })
    .select('*')
    .single()
  if (error || !data) throw new Error(`createThread failed: ${error?.message}`)
  return data as MailThread
}

interface RecordMessageOpts {
  threadId: string
  companyId: string
  direction: 'in' | 'out'
  messageId: string
  inReplyTo?: string | null
  fromAddress: string
  toAddress: string
  subject?: string | null
  body?: string | null
  runId?: string | null
}

export async function recordMessage(opts: RecordMessageOpts): Promise<MailMessage> {
  const db = getSupabase()
  const { data, error } = await db
    .from('mail_messages')
    .insert({
      thread_id: opts.threadId,
      company_id: opts.companyId,
      direction: opts.direction,
      message_id: opts.messageId,
      in_reply_to: opts.inReplyTo ?? null,
      from_address: opts.fromAddress,
      to_address: opts.toAddress,
      subject: opts.subject ?? null,
      body: opts.body ?? null,
      run_id: opts.runId ?? null,
    })
    .select('*')
    .single()
  if (error || !data) throw new Error(`recordMessage failed: ${error?.message}`)
  return data as MailMessage
}

/**
 * Fetch prior messages in a thread ordered chronologically — used to build
 * the conversation history prompt for the agent on inbound replies.
 */
export async function listThreadMessages(threadId: string, limit = 20): Promise<MailMessage[]> {
  const db = getSupabase()
  const { data } = await db
    .from('mail_messages')
    .select('*')
    .eq('thread_id', threadId)
    .order('created_at', { ascending: true })
    .limit(limit)
  return (data || []) as MailMessage[]
}

/**
 * Strip "Re: " / "Fwd: " prefixes so the thread subject stays stable.
 */
export function normalizeSubject(subject: string | null | undefined): string | null {
  if (!subject) return null
  return subject.replace(/^\s*(re|fwd|fw):\s*/gi, '').trim() || null
}
