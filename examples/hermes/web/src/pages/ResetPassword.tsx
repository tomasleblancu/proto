import { useState } from 'react'
import { supabase } from '@proto/core-web'
import { Button } from '@proto/core-web'
import { Input } from '@proto/core-web'
import { Card, CardContent, CardHeader } from '@proto/core-web'
import { Avatar, AvatarFallback } from '@proto/core-web'

export default function ResetPassword() {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (password !== confirm) {
      setError('Las contrasenas no coinciden')
      return
    }
    setLoading(true)
    const { error } = await supabase.auth.updateUser({ password })
    if (error) {
      setError(error.message)
    } else {
      setDone(true)
    }
    setLoading(false)
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
              <h1 className="text-lg font-semibold">Nueva contrasena</h1>
              <p className="text-xs text-muted-foreground">Hermes</p>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {done ? (
            <div className="space-y-3 text-center">
              <p className="text-sm text-foreground">Contrasena actualizada.</p>
              <Button
                className="w-full bg-emerald-600 hover:bg-emerald-500"
                onClick={() => { window.location.href = '/' }}
              >
                Ir al inicio
              </Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-3">
              <Input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Nueva contrasena"
                required
                minLength={6}
              />
              <Input
                type="password"
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                placeholder="Confirmar contrasena"
                required
                minLength={6}
              />
              {error && <p className="text-xs text-destructive">{error}</p>}
              <Button type="submit" className="w-full bg-emerald-600 hover:bg-emerald-500" disabled={loading}>
                {loading ? '...' : 'Cambiar contrasena'}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
