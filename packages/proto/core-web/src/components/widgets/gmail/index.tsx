/**
 * Gmail widget — built-in proto widget.
 *
 * Lets the user connect their Gmail via OAuth so the agent can read,
 * search, and send mail on their behalf via the gmail_* MCP tools.
 *
 * Wired by the gateway routes /gmail/auth + /gmail/callback (popup flow)
 * and the GmailCallback page mounted at /gmail/callback in the SPA.
 */
import { useEffect, useState } from 'react'
import { defineWidget } from '../../../lib/define-widget.js'
import { useData } from '../../../hooks/useData.js'
import { useAuth } from '../../../hooks/useAuth.js'
import { supabase } from '../../../lib/supabase.js'
import { GATEWAY_URL } from '../../../lib/config.js'
import { Button } from '../../ui/button.js'
import { Skeleton } from '../../ui/skeleton.js'
import { CheckIcon, LinkIcon, MailIcon } from 'lucide-react'

interface GmailToken {
  email: string | null
  connected_at: string
}

export const gmailWidget = defineWidget({
  type: 'gmail',
  title: 'Gmail',
  icon: '📧',
  category: 'general',
  defaultSize: { w: 3, h: 3, minW: 2, minH: 2 },
  render: () => <GmailPanel />,
})

export default gmailWidget

function GmailPanel() {
  const { user } = useAuth()
  const userId = user?.id
  const [refreshTick, setRefreshTick] = useState(0)
  const [popupOpen, setPopupOpen] = useState(false)

  const { data: token, loading } = useData(
    'gmail-token',
    async () => {
      if (!userId) return null
      const { data } = await supabase
        .from('gmail_tokens')
        .select('email, connected_at')
        .eq('user_id', userId)
        .single()
      return (data as GmailToken | null) || null
    },
    [userId, refreshTick],
    null,
  )

  // Listen for the callback page broadcasting success via postMessage,
  // and re-check status when the popup closes (user might have cancelled).
  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (e.data?.type === 'gmail-connected') {
        setPopupOpen(false)
        setRefreshTick(t => t + 1)
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [])

  async function connect() {
    if (!userId) return
    try {
      const res = await fetch(`${GATEWAY_URL}/gmail/auth?user_id=${userId}`)
      const { url, error } = await res.json()
      if (!url) {
        alert(error || 'No se pudo iniciar el flow de Gmail')
        return
      }
      const popup = window.open(url, 'gmail-oauth', 'width=500,height=700')
      if (!popup) return
      setPopupOpen(true)
      // Fallback: poll until the popup closes, then re-check status
      const timer = setInterval(() => {
        if (popup.closed) {
          clearInterval(timer)
          setPopupOpen(false)
          setRefreshTick(t => t + 1)
        }
      }, 500)
    } catch (err: any) {
      alert(`Error: ${err.message}`)
    }
  }

  if (loading) {
    return (
      <div className="p-3 space-y-2">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-8 w-full" />
      </div>
    )
  }

  if (!userId) {
    return (
      <div className="p-3 text-xs text-muted-foreground">
        Iniciá sesión para conectar Gmail.
      </div>
    )
  }

  if (token) {
    const since = new Date(token.connected_at).toLocaleDateString()
    return (
      <div className="p-3 space-y-2">
        <div className="flex items-center gap-2 p-2 rounded-lg bg-primary/5 border border-primary/20">
          <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
            <CheckIcon className="w-4 h-4 text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium truncate">{token.email || 'Gmail'}</p>
            <p className="text-[10px] text-muted-foreground">Conectado desde {since}</p>
          </div>
        </div>
        <Button variant="outline" size="sm" className="h-7 text-xs w-full" onClick={connect} disabled={popupOpen}>
          <LinkIcon className="w-3 h-3 mr-1.5" />
          {popupOpen ? 'Esperando autorización...' : 'Reconectar'}
        </Button>
        <p className="text-[10px] text-muted-foreground/70 leading-snug">
          El agente puede leer, buscar y enviar mails desde esta cuenta. Probá: <em>"¿Tengo mails sin leer?"</em>
        </p>
      </div>
    )
  }

  return (
    <div className="p-3 space-y-3">
      <div className="flex items-center gap-2">
        <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center shrink-0">
          <MailIcon className="w-4 h-4 text-muted-foreground" />
        </div>
        <div>
          <p className="text-xs font-medium">Gmail no conectado</p>
          <p className="text-[10px] text-muted-foreground">Conectá tu cuenta para que el agente lea y envíe mails.</p>
        </div>
      </div>
      <Button size="sm" className="h-7 text-xs w-full" onClick={connect} disabled={popupOpen}>
        <LinkIcon className="w-3 h-3 mr-1.5" />
        {popupOpen ? 'Esperando autorización...' : 'Conectar Gmail'}
      </Button>
    </div>
  )
}
