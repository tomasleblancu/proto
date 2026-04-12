import { useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '@tleblancureta/proto/web'
import { Button } from '@tleblancureta/proto/web'
import { Input } from '@tleblancureta/proto/web'
import { Card, CardContent, CardHeader } from '@tleblancureta/proto/web'
import { Avatar, AvatarFallback } from '@tleblancureta/proto/web'

interface Profile {
  full_name: string | null
  role_title: string | null
  onboarding_completed: boolean
}

interface Props {
  user: User
  profile: Profile | null
  onComplete: () => void | Promise<void>
  signOut: () => void
}

interface WizardState {
  // perfil
  full_name: string
  role_title: string
  phone: string
  // empresa
  company_name: string
  rut: string
  industry: string
  size: string
  website: string
  // contacto
  contact_email: string
  contact_phone: string
  address: string
  country: string
  // experiencia
  import_experience: string
}

const INDUSTRIES = [
  'Retail / Comercio',
  'Alimentos y bebidas',
  'Textil / Moda',
  'Construccion / Ferreteria',
  'Tecnologia / Electronica',
  'Maquinaria industrial',
  'Automotriz / Repuestos',
  'Salud / Belleza',
  'Hogar / Decoracion',
  'Otro',
]

const SIZES = [
  { value: '1-10', label: '1-10 personas' },
  { value: '11-50', label: '11-50 personas' },
  { value: '51-200', label: '51-200 personas' },
  { value: '200+', label: 'Mas de 200' },
]

const EXPERIENCES = [
  { value: 'nuevo', label: 'Primera vez que importo', desc: 'Quiero entender el proceso paso a paso' },
  { value: 'ocasional', label: 'Importo ocasionalmente', desc: 'He hecho algunas importaciones antes' },
  { value: 'frecuente', label: 'Importo frecuentemente', desc: 'Es parte central de mi operacion' },
]

const STEPS = ['Bienvenida', 'Tu perfil', 'Tu empresa', 'Contacto', 'Experiencia', 'Listo']

export default function Onboarding({ user, profile, onComplete, signOut }: Props) {
  const [step, setStep] = useState(0)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const [data, setData] = useState<WizardState>({
    full_name: profile?.full_name || '',
    role_title: profile?.role_title || '',
    phone: '',
    company_name: '',
    rut: '',
    industry: '',
    size: '',
    website: '',
    contact_email: user.email || '',
    contact_phone: '',
    address: '',
    country: 'CL',
    import_experience: '',
  })

  const update = <K extends keyof WizardState>(k: K, v: WizardState[K]) =>
    setData(d => ({ ...d, [k]: v }))

  function validateStep(): string | null {
    if (step === 1) {
      if (!data.full_name.trim()) return 'Ingresa tu nombre'
      if (!data.role_title.trim()) return 'Ingresa tu cargo'
    }
    if (step === 2) {
      if (!data.company_name.trim()) return 'Ingresa el nombre de la empresa'
      if (!data.industry) return 'Selecciona un rubro'
    }
    if (step === 4) {
      if (!data.import_experience) return 'Selecciona una opcion'
    }
    return null
  }

  function next() {
    const err = validateStep()
    if (err) { setError(err); return }
    setError('')
    setStep(s => Math.min(s + 1, STEPS.length - 1))
  }
  function back() { setError(''); setStep(s => Math.max(s - 1, 0)) }

  async function finish() {
    setSaving(true)
    setError('')
    try {
      // 1. Upsert profile
      const { error: pErr } = await supabase.from('profiles').upsert({
        id: user.id,
        full_name: data.full_name,
        role_title: data.role_title,
        phone: data.phone || null,
        onboarding_completed: true,
        onboarding_completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      if (pErr) throw pErr

      // 2. Insert company
      const { error: cErr } = await supabase.from('companies').insert({
        name: data.company_name,
        rut: data.rut || null,
        contact_email: data.contact_email || null,
        contact_phone: data.contact_phone || null,
        industry: data.industry || null,
        size: data.size || null,
        website: data.website || null,
        address: data.address || null,
        country: data.country || 'CL',
        import_experience: data.import_experience || null,
        owner_id: user.id,
      })
      if (cErr) throw cErr

      sessionStorage.setItem('hermes-just-onboarded', '1')
      await onComplete()
    } catch (e: any) {
      setError(e.message || 'Error guardando datos')
      setSaving(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      <Card className="w-full max-w-xl">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Avatar className="w-10 h-10">
                <AvatarFallback className="bg-emerald-600 text-white text-lg font-bold">H</AvatarFallback>
              </Avatar>
              <div>
                <h1 className="text-lg font-semibold">Configuremos tu cuenta</h1>
                <p className="text-xs text-muted-foreground">Paso {step + 1} de {STEPS.length} — {STEPS[step]}</p>
              </div>
            </div>
            <button onClick={signOut} className="text-[10px] text-muted-foreground hover:text-foreground">Salir</button>
          </div>
          {/* Progress */}
          <div className="flex gap-1 mt-3">
            {STEPS.map((_, i) => (
              <div
                key={i}
                className={`h-1 flex-1 rounded-full transition-colors ${i <= step ? 'bg-emerald-600' : 'bg-muted'}`}
              />
            ))}
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {step === 0 && (
            <div className="space-y-3 py-4">
              <h2 className="text-xl font-semibold">Bienvenido a Hermes</h2>
              <p className="text-sm text-muted-foreground">
                Hermes es tu agente AI para gestionar importaciones. Antes de empezar,
                necesitamos un par de datos sobre ti y tu empresa para personalizar la experiencia.
              </p>
              <p className="text-sm text-muted-foreground">
                Tomara menos de 2 minutos. Al terminar tendras el chat y el panel listos para trabajar.
              </p>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-3">
              <Field label="Email">
                <Input value={user.email || ''} disabled />
              </Field>
              <Field label="Nombre completo *">
                <Input value={data.full_name} onChange={e => update('full_name', e.target.value)} placeholder="Maria Gonzalez" autoFocus />
              </Field>
              <Field label="Cargo *" hint="Ej: Gerente de Compras, Encargado de Importaciones, Dueno">
                <Input value={data.role_title} onChange={e => update('role_title', e.target.value)} placeholder="Gerente de Compras" />
              </Field>
              <Field label="Telefono">
                <Input value={data.phone} onChange={e => update('phone', e.target.value)} placeholder="+56 9 ..." />
              </Field>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-3">
              <Field label="Nombre de la empresa *">
                <Input value={data.company_name} onChange={e => update('company_name', e.target.value)} placeholder="Importadora XYZ SpA" autoFocus />
              </Field>
              <Field label="RUT empresa">
                <Input value={data.rut} onChange={e => update('rut', e.target.value)} placeholder="76.123.456-7" />
              </Field>
              <Field label="Rubro *">
                <NativeSelect value={data.industry} onChange={v => update('industry', v)}>
                  <option value="">Selecciona un rubro...</option>
                  {INDUSTRIES.map(i => <option key={i} value={i}>{i}</option>)}
                </NativeSelect>
              </Field>
              <Field label="Tamano">
                <NativeSelect value={data.size} onChange={v => update('size', v)}>
                  <option value="">Selecciona...</option>
                  {SIZES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                </NativeSelect>
              </Field>
              <Field label="Sitio web">
                <Input value={data.website} onChange={e => update('website', e.target.value)} placeholder="https://..." />
              </Field>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-3">
              <Field label="Email de contacto de la empresa">
                <Input value={data.contact_email} onChange={e => update('contact_email', e.target.value)} />
              </Field>
              <Field label="Telefono de contacto">
                <Input value={data.contact_phone} onChange={e => update('contact_phone', e.target.value)} placeholder="+56 2 ..." />
              </Field>
              <Field label="Direccion">
                <Input value={data.address} onChange={e => update('address', e.target.value)} placeholder="Av. Providencia 123, Santiago" />
              </Field>
              <Field label="Pais">
                <NativeSelect value={data.country} onChange={v => update('country', v)}>
                  <option value="CL">Chile</option>
                  <option value="PE">Peru</option>
                  <option value="AR">Argentina</option>
                  <option value="CO">Colombia</option>
                  <option value="MX">Mexico</option>
                  <option value="OTHER">Otro</option>
                </NativeSelect>
              </Field>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground mb-2">
                Esto nos ayuda a ajustar el tono y nivel de detalle del agente para ti.
              </p>
              {EXPERIENCES.map(e => (
                <button
                  key={e.value}
                  type="button"
                  onClick={() => update('import_experience', e.value)}
                  className={`w-full text-left p-3 rounded-lg border transition-colors ${
                    data.import_experience === e.value
                      ? 'border-emerald-600 bg-emerald-600/5'
                      : 'border-border hover:bg-muted/50'
                  }`}
                >
                  <div className="font-medium text-sm">{e.label}</div>
                  <div className="text-xs text-muted-foreground">{e.desc}</div>
                </button>
              ))}
            </div>
          )}

          {step === 5 && (
            <div className="space-y-3 py-2">
              <h2 className="text-lg font-semibold">Todo listo, {data.full_name.split(' ')[0]}</h2>
              <div className="text-sm space-y-1 bg-muted/40 rounded-lg p-3">
                <Row k="Cargo" v={data.role_title} />
                <Row k="Empresa" v={data.company_name} />
                {data.rut && <Row k="RUT" v={data.rut} />}
                <Row k="Rubro" v={data.industry} />
                {data.size && <Row k="Tamano" v={SIZES.find(s => s.value === data.size)?.label || data.size} />}
                <Row k="Experiencia" v={EXPERIENCES.find(e => e.value === data.import_experience)?.label || ''} />
              </div>
              <p className="text-xs text-muted-foreground">
                Al confirmar, entraras al cockpit con el chat y el panel listos para tu primer pedido.
              </p>
            </div>
          )}

          {error && <p className="text-xs text-destructive">{error}</p>}

          <div className="flex items-center justify-between pt-2">
            <Button variant="ghost" onClick={back} disabled={step === 0 || saving}>
              Atras
            </Button>
            {step < STEPS.length - 1 ? (
              <Button onClick={next} className="bg-emerald-600 hover:bg-emerald-500">
                {step === 0 ? 'Comenzar' : 'Siguiente'}
              </Button>
            ) : (
              <Button onClick={finish} disabled={saving} className="bg-emerald-600 hover:bg-emerald-500">
                {saving ? 'Guardando...' : 'Entrar al cockpit'}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      {children}
      {hint && <p className="text-[10px] text-muted-foreground">{hint}</p>}
    </div>
  )
}

function NativeSelect({ value, onChange, children }: { value: string; onChange: (v: string) => void; children: React.ReactNode }) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
    >
      {children}
    </select>
  )
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-muted-foreground">{k}</span>
      <span className="font-medium text-right">{v}</span>
    </div>
  )
}
