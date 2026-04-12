import { useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { useTheme } from '../hooks/useTheme.js'
import { EyeIcon, EyeOffIcon, LoaderIcon } from 'lucide-react'

type Mode = 'login' | 'signup' | 'forgot'

export function LoginForm() {
  useTheme()
  const [mode, setMode] = useState<Mode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  function resetState() {
    setError(null)
    setSuccess(null)
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    resetState()
    setLoading(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setError(translateError(error.message))
    setLoading(false)
  }

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault()
    resetState()
    if (password.length < 6) { setError('La password debe tener al menos 6 caracteres'); return }
    setLoading(true)
    const { error } = await supabase.auth.signUp({
      email, password,
      options: { data: { full_name: fullName } },
    })
    if (error) {
      setError(translateError(error.message))
    } else {
      setSuccess('Cuenta creada. Revisa tu email para confirmar.')
      setMode('login')
    }
    setLoading(false)
  }

  async function handleForgot(e: React.FormEvent) {
    e.preventDefault()
    resetState()
    setLoading(true)
    const { error } = await supabase.auth.resetPasswordForEmail(email)
    if (error) {
      setError(translateError(error.message))
    } else {
      setSuccess('Email enviado. Revisa tu bandeja de entrada.')
    }
    setLoading(false)
  }

  const switchMode = (m: Mode) => { setMode(m); resetState() }

  return (
    <div className="flex h-screen bg-background text-foreground">
      {/* Left panel — branding */}
      <div className="hidden lg:flex lg:w-1/2 bg-primary/5 items-center justify-center relative overflow-hidden">
        <div className="absolute inset-0 dotted-bg opacity-40" />
        <div className="relative z-10 text-center px-12">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto mb-6">
            <div className="w-8 h-8 rounded-lg bg-primary/20" />
          </div>
          <h2 className="text-2xl font-bold text-foreground mb-2">Proto</h2>
          <p className="text-muted-foreground text-sm max-w-xs">
            Plataforma de agentes AI para tu negocio
          </p>
        </div>
      </div>

      {/* Right panel — form */}
      <div className="flex-1 flex items-center justify-center px-6">
        <div className="w-full max-w-sm">
          <div className="lg:hidden text-center mb-8">
            <div className="w-12 h-12 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto mb-4">
              <div className="w-6 h-6 rounded-md bg-primary/20" />
            </div>
          </div>

          <h1 className="text-xl font-semibold mb-1">
            {mode === 'login' && 'Iniciar sesion'}
            {mode === 'signup' && 'Crear cuenta'}
            {mode === 'forgot' && 'Recuperar password'}
          </h1>
          <p className="text-sm text-muted-foreground mb-6">
            {mode === 'login' && 'Ingresa tus credenciales para continuar'}
            {mode === 'signup' && 'Completa tus datos para registrarte'}
            {mode === 'forgot' && 'Te enviaremos un link para resetear tu password'}
          </p>

          {error && (
            <div className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800/50 rounded-lg px-3 py-2.5 mb-4">
              {error}
            </div>
          )}
          {success && (
            <div className="text-sm text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800/50 rounded-lg px-3 py-2.5 mb-4">
              {success}
            </div>
          )}

          <form onSubmit={mode === 'login' ? handleLogin : mode === 'signup' ? handleSignup : handleForgot}>
            <div className="space-y-3">
              {mode === 'signup' && (
                <div>
                  <label htmlFor="fullName" className="block text-xs font-medium text-muted-foreground mb-1.5">
                    Nombre completo
                  </label>
                  <input
                    id="fullName"
                    type="text"
                    required
                    autoComplete="name"
                    value={fullName}
                    onChange={e => setFullName(e.target.value)}
                    className="w-full px-3 py-2.5 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors"
                    placeholder="Tu nombre"
                  />
                </div>
              )}

              <div>
                <label htmlFor="email" className="block text-xs font-medium text-muted-foreground mb-1.5">
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  required
                  autoComplete="email"
                  autoFocus
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className="w-full px-3 py-2.5 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors"
                  placeholder="tu@email.com"
                />
              </div>

              {mode !== 'forgot' && (
                <div>
                  <label htmlFor="password" className="block text-xs font-medium text-muted-foreground mb-1.5">
                    Password
                  </label>
                  <div className="relative">
                    <input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      required
                      autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      className="w-full px-3 py-2.5 pr-10 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors"
                    />
                    <button
                      type="button"
                      tabIndex={-1}
                      onClick={() => setShowPassword(v => !v)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-muted-foreground/50 hover:text-muted-foreground transition-colors"
                    >
                      {showPassword
                        ? <EyeOffIcon className="w-4 h-4" />
                        : <EyeIcon className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {mode === 'login' && (
              <div className="flex justify-end mt-2">
                <button
                  type="button"
                  onClick={() => switchMode('forgot')}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  Olvidaste tu password?
                </button>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full mt-5 py-2.5 text-sm font-medium text-primary-foreground bg-primary rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
            >
              {loading && <LoaderIcon className="w-4 h-4 animate-spin" />}
              {mode === 'login' && (loading ? 'Entrando...' : 'Entrar')}
              {mode === 'signup' && (loading ? 'Creando...' : 'Crear cuenta')}
              {mode === 'forgot' && (loading ? 'Enviando...' : 'Enviar link')}
            </button>
          </form>

          <div className="mt-6 text-center text-sm text-muted-foreground">
            {mode === 'login' && (
              <>
                No tienes cuenta?{' '}
                <button onClick={() => switchMode('signup')} className="text-primary hover:text-primary/80 font-medium transition-colors">
                  Registrate
                </button>
              </>
            )}
            {(mode === 'signup' || mode === 'forgot') && (
              <>
                Ya tienes cuenta?{' '}
                <button onClick={() => switchMode('login')} className="text-primary hover:text-primary/80 font-medium transition-colors">
                  Iniciar sesion
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function translateError(msg: string): string {
  if (msg.includes('Invalid login credentials')) return 'Email o password incorrectos'
  if (msg.includes('Email not confirmed')) return 'Confirma tu email antes de ingresar'
  if (msg.includes('User already registered')) return 'Este email ya esta registrado'
  if (msg.includes('rate limit')) return 'Demasiados intentos. Espera un momento.'
  return msg
}
