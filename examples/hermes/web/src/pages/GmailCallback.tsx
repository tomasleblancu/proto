import { useState } from 'react'
import { GATEWAY_URL } from 'proto/web'
import { useMountEffect } from 'proto/web'

export default function GmailCallback() {
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading')
  const [message, setMessage] = useState('')

  useMountEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const code = params.get('code')
    const userId = params.get('state') // we passed user_id as state

    if (!code || !userId) {
      setStatus('error')
      setMessage('Faltan parametros de autorizacion')
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
          // Close popup after 2s
          setTimeout(() => window.close(), 2000)
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
    <div className="flex items-center justify-center min-h-screen bg-background">
      <div className="text-center space-y-3">
        {status === 'loading' && (
          <>
            <div className="w-8 h-8 border-2 border-muted border-t-emerald-500 rounded-full animate-spin mx-auto" />
            <p className="text-sm text-muted-foreground">Conectando Gmail...</p>
          </>
        )}
        {status === 'success' && (
          <>
            <div className="w-10 h-10 rounded-full bg-emerald-600/20 flex items-center justify-center mx-auto">
              <span className="text-emerald-400 text-lg">✓</span>
            </div>
            <p className="text-sm text-foreground">{message}</p>
            <p className="text-xs text-muted-foreground">Esta ventana se cerrara automaticamente...</p>
          </>
        )}
        {status === 'error' && (
          <>
            <div className="w-10 h-10 rounded-full bg-destructive/20 flex items-center justify-center mx-auto">
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
