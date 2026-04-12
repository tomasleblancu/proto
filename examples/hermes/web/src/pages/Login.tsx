import { useState } from 'react'
import { supabase } from 'proto/web'
import { Button } from 'proto/web'
import { Input } from 'proto/web'
import { Card, CardContent, CardHeader } from 'proto/web'
import { Avatar, AvatarFallback } from 'proto/web'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isSignUp, setIsSignUp] = useState(false)
  const [isForgot, setIsForgot] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [resetSent, setResetSent] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const { error } = isSignUp
      ? await supabase.auth.signUp({ email, password })
      : await supabase.auth.signInWithPassword({ email, password })
    if (error) setError(error.message)
    setLoading(false)
  }

  async function handleForgot(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const redirectTo = `${window.location.origin}/reset-password`
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo })
    if (error) {
      setError(error.message)
    } else {
      setResetSent(true)
    }
    setLoading(false)
  }

  if (isForgot) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Card className="w-full max-w-sm">
          <CardHeader>
            <div className="flex items-center gap-3">
              <Avatar className="w-10 h-10">
                <AvatarFallback className="bg-emerald-600 text-white text-lg font-bold">H</AvatarFallback>
              </Avatar>
              <div>
                <h1 className="text-lg font-semibold">Recuperar contrasena</h1>
                <p className="text-xs text-muted-foreground">Hermes</p>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {resetSent ? (
              <div className="space-y-3 text-center">
                <p className="text-sm text-foreground">Revisa tu email. Te enviamos un link para cambiar tu contrasena.</p>
                <button
                  onClick={() => { setIsForgot(false); setResetSent(false); setError('') }}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  Volver al login
                </button>
              </div>
            ) : (
              <>
                <form onSubmit={handleForgot} className="space-y-3">
                  <Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="tu@empresa.cl" required />
                  {error && <p className="text-xs text-destructive">{error}</p>}
                  <Button type="submit" className="w-full bg-emerald-600 hover:bg-emerald-500" disabled={loading}>
                    {loading ? '...' : 'Enviar link'}
                  </Button>
                </form>
                <button
                  onClick={() => { setIsForgot(false); setError('') }}
                  className="w-full text-center text-xs text-muted-foreground hover:text-foreground mt-4 transition-colors"
                >
                  Volver al login
                </button>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="flex items-center justify-center min-h-screen">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <div className="flex items-center gap-3">
            <Avatar className="w-10 h-10">
              <AvatarFallback className="bg-emerald-600 text-white text-lg font-bold">H</AvatarFallback>
            </Avatar>
            <div>
              <h1 className="text-lg font-semibold">Hermes</h1>
              <p className="text-xs text-muted-foreground">Gestion de importaciones</p>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-3">
            <Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="tu@empresa.cl" required />
            <Input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Contrasena" required minLength={6} />
            {error && <p className="text-xs text-destructive">{error}</p>}
            <Button type="submit" className="w-full bg-emerald-600 hover:bg-emerald-500" disabled={loading}>
              {loading ? '...' : isSignUp ? 'Crear cuenta' : 'Entrar'}
            </Button>
          </form>
          <div className="flex justify-between mt-4">
            <button onClick={() => { setIsSignUp(!isSignUp); setError('') }} className="text-xs text-muted-foreground hover:text-foreground transition-colors">
              {isSignUp ? 'Ya tengo cuenta' : 'Crear cuenta nueva'}
            </button>
            {!isSignUp && (
              <button onClick={() => { setIsForgot(true); setError('') }} className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                Olvide mi contrasena
              </button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
