/**
 * Gmail OAuth callback page — opened in the popup that the Gmail widget
 * launches. Reads ?code and ?state from the redirect, posts to the
 * gateway to exchange the code for tokens, then notifies the opener
 * window via postMessage and closes itself.
 */
import { useState } from 'react'
import { useMountEffect } from '../hooks/useMountEffect.js'
import { GATEWAY_URL } from '../lib/config.js'

type Status = 'loading' | 'success' | 'error'

export function GmailCallback() {
  const [status, setStatus] = useState<Status>('loading')
  const [message, setMessage] = useState('')

  useMountEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const code = params.get('code')
    const userId = params.get('state')

    if (!code || !userId) {
      setStatus('error')
      setMessage('Faltan parámetros de autorización en el redirect.')
      return
    }

    fetch(`${GATEWAY_URL}/gmail/callback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, user_id: userId }),
    })
      .then(res => res.json())
      .then(data => {
        if (data.connected) {
          setStatus('success')
          setMessage(`Gmail conectado: ${data.email}`)
          try { window.opener?.postMessage({ type: 'gmail-connected', email: data.email }, '*') } catch {}
          setTimeout(() => window.close(), 1500)
        } else {
          setStatus('error')
          setMessage(data.error || 'Error conectando Gmail')
        }
      })
      .catch(err => {
        setStatus('error')
        setMessage(err.message)
      })
  })

  return (
    <div className="flex items-center justify-center min-h-screen bg-background p-6">
      <div className="text-center space-y-3 max-w-sm">
        {status === 'loading' && (
          <>
            <div className="w-8 h-8 border-2 border-muted border-t-primary rounded-full animate-spin mx-auto" />
            <p className="text-sm text-muted-foreground">Conectando Gmail...</p>
          </>
        )}
        {status === 'success' && (
          <>
            <div className="w-10 h-10 rounded-full bg-primary/15 flex items-center justify-center mx-auto">
              <span className="text-primary text-lg">✓</span>
            </div>
            <p className="text-sm text-foreground">{message}</p>
            <p className="text-xs text-muted-foreground">Esta ventana se cerrará automáticamente.</p>
          </>
        )}
        {status === 'error' && (
          <>
            <div className="w-10 h-10 rounded-full bg-destructive/15 flex items-center justify-center mx-auto">
              <span className="text-destructive text-lg">✕</span>
            </div>
            <p className="text-sm text-destructive">{message}</p>
            <button onClick={() => window.close()} className="text-xs text-muted-foreground hover:text-foreground">Cerrar</button>
          </>
        )}
      </div>
    </div>
  )
}
