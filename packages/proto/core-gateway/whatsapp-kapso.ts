/**
 * WhatsApp channel via Kapso — webhook-driven ingester.
 *
 * Same pattern as mail-ingester.ts: receives inbound messages via webhook,
 * routes to the right company, calls runClaude(), and replies via Kapso API.
 *
 * No-op if KAPSO_API_URL is not set.
 *
 * Env vars:
 *   KAPSO_API_URL            — Kapso API base (e.g. https://api.kapso.ai)
 *   KAPSO_API_KEY            — API key for Kapso Platform API
 *   KAPSO_WEBHOOK_SECRET     — HMAC secret for verifying webhook signatures
 *   KAPSO_PHONE_NUMBER_ID    — WhatsApp Business phone number ID
 *   KAPSO_DEFAULT_COMPANY_ID — Fallback company when phone lookup fails
 */
import { createHmac } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { runClaude } from './claude-runner.js'
import {
  KAPSO_API_URL,
  KAPSO_API_KEY,
  KAPSO_WEBHOOK_SECRET,
  KAPSO_PHONE_NUMBER_ID,
  KAPSO_DEFAULT_COMPANY_ID,
} from './config.js'
import { loadSkills } from './registry.js'

// ── Types ───────────────────────────────────────────────────────────

interface KapsoMessagePayload {
  message: {
    id: string
    timestamp: string
    type: string
    text?: { body: string }
    kapso: {
      direction: 'inbound' | 'outbound'
      status: string
      content: string
      media_url?: string
    }
  }
  conversation: {
    id: string
    phone_number: string
    status: string
    phone_number_id: string
    kapso: {
      contact_name?: string
    }
  }
  phone_number_id: string
}

interface WebhookEvent {
  event: string
  payload: KapsoMessagePayload
}

// ── Signature verification ──────────────────────────────────────────

export function verifyWebhookSignature(
  secret: string,
  rawBody: string,
  signature: string,
): boolean {
  if (!secret || !signature) return false
  const expected = createHmac('sha256', secret).update(rawBody).digest('hex')
  return expected === signature
}

// ── Company resolution ──────────────────────────────────────────────

function getSupabase() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key)
}

/**
 * Resolve a WhatsApp phone number to a company_id.
 *
 * Lookup order:
 *   1. whatsapp_companies table (phone_number → company_id)
 *   2. KAPSO_DEFAULT_COMPANY_ID env var
 *   3. null (message dropped)
 */
export async function resolveCompanyByPhone(
  phone: string,
): Promise<{ companyId: string; contactName?: string } | null> {
  const db = getSupabase()
  if (db) {
    const { data } = await db
      .from('whatsapp_companies')
      .select('company_id, contact_name')
      .eq('phone_number', phone)
      .maybeSingle()

    if (data) {
      return { companyId: data.company_id, contactName: data.contact_name }
    }
  }

  if (KAPSO_DEFAULT_COMPANY_ID) {
    return { companyId: KAPSO_DEFAULT_COMPANY_ID }
  }

  return null
}

// ── Send reply via Kapso Meta proxy ─────────────────────────────────

export async function sendWhatsAppReply(
  phoneNumberId: string,
  recipientPhone: string,
  text: string,
): Promise<{ ok: boolean; error?: string }> {
  const url = `${KAPSO_API_URL}/platform/v1/meta/whatsapp/v24.0/${phoneNumberId}/messages`

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': KAPSO_API_KEY,
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: recipientPhone,
        type: 'text',
        text: { body: text },
      }),
    })

    if (!res.ok) {
      const body = await res.text()
      return { ok: false, error: `${res.status}: ${body}` }
    }
    return { ok: true }
  } catch (err: any) {
    return { ok: false, error: err?.message || 'fetch failed' }
  }
}

// ── Inbound message handler ─────────────────────────────────────────

function getAllSkillNames(): string[] {
  try {
    return loadSkills().map(s => s.name)
  } catch {
    return []
  }
}

const ALL_SKILLS = getAllSkillNames()

export async function handleInboundMessage(
  payload: KapsoMessagePayload,
): Promise<void> {
  const { message, conversation } = payload
  const phoneNumberId = payload.phone_number_id || KAPSO_PHONE_NUMBER_ID

  // Only process inbound text messages
  if (message.kapso.direction !== 'inbound') return
  const text = message.kapso.content || message.text?.body || ''
  if (!text.trim()) return

  const senderPhone = conversation.phone_number
  const contactName = conversation.kapso.contact_name || senderPhone
  const conversationId = conversation.id

  console.log(`[whatsapp-kapso] inbound from ${senderPhone} (${contactName}): ${text.slice(0, 80)}`)

  // Resolve company
  const route = await resolveCompanyByPhone(senderPhone)
  if (!route) {
    console.log(`[whatsapp-kapso] no company match for ${senderPhone}, dropping`)
    return
  }

  // Build context
  const companyContext = [
    `[Mensaje recibido por WhatsApp]`,
    `Remitente: ${contactName} (${senderPhone})`,
    `Conversación: ${conversationId}`,
  ].join('\n')

  // Build prompt
  const prompt = [
    `Estás recibiendo un mensaje por WhatsApp. Tu respuesta será enviada directamente al usuario.`,
    ``,
    `Remitente: ${contactName} (${senderPhone})`,
    ``,
    `--- Mensaje ---`,
    text,
    `--- Fin ---`,
    ``,
    `Respondé de forma concisa y directa. Formato texto plano (sin markdown). Usá las tools MCP que necesites.`,
  ].join('\n')

  // Dispatch to Claude
  let agentResponse = ''
  try {
    const result = await runClaude({
      company_id: route.companyId,
      user_id: senderPhone,
      message: prompt,
      channel: 'whatsapp',
      session_key: `wa-${conversationId}`,
      enabled_skills: ALL_SKILLS,
      company_context: companyContext,
      selected_files: [],
    })
    agentResponse = result.response || '(sin respuesta)'
  } catch (err: any) {
    console.error('[whatsapp-kapso] runClaude failed:', err?.message || err)
    agentResponse = 'Lo siento, hubo un error procesando tu mensaje. Intentá de nuevo.'
  }

  // Reply via Kapso
  const sendResult = await sendWhatsAppReply(phoneNumberId, senderPhone, agentResponse)
  if (!sendResult.ok) {
    console.error('[whatsapp-kapso] reply failed:', sendResult.error)
  } else {
    console.log(`[whatsapp-kapso] replied to ${senderPhone} (${agentResponse.length} chars)`)
  }
}

// ── Startup ─────────────────────────────────────────────────────────

export function startWhatsAppChannel(): void {
  if (!KAPSO_API_URL || !KAPSO_API_KEY) {
    console.log('[whatsapp-kapso] disabled (no KAPSO_API_URL configured)')
    return
  }
  console.log(`[whatsapp-kapso] enabled — webhook at POST /whatsapp/webhook`)
  if (!KAPSO_WEBHOOK_SECRET) {
    console.warn('[whatsapp-kapso] WARNING: KAPSO_WEBHOOK_SECRET not set — webhook signature verification disabled')
  }
  if (!KAPSO_PHONE_NUMBER_ID) {
    console.warn('[whatsapp-kapso] WARNING: KAPSO_PHONE_NUMBER_ID not set — replies may fail')
  }
}
