import { useRef, useState } from 'react'
import { supabase } from '@proto/core-web'
import { Skeleton } from '@proto/core-web'
import { cacheGet, cacheSet } from '@proto/core-web'
import { useData } from '@proto/core-web'
import { PlusIcon, XIcon, MailIcon, PhoneIcon, BuildingIcon } from 'lucide-react'
import { ShellDialog } from '@proto/core-web'
import { BaseProps } from './shared'

type Role = 'forwarder' | 'customs_agent' | 'supplier' | 'other'

interface Contact {
  id: string
  company_id: string
  order_id: string | null
  role: Role
  name: string
  email: string | null
  phone: string | null
  organization: string | null
  notes: string | null
}

const ROLE_LABELS: Record<Role, string> = {
  forwarder: 'Forwarder',
  customs_agent: 'Aduana',
  supplier: 'Proveedor',
  other: 'Otros',
}

const ROLE_ORDER: Role[] = ['forwarder', 'customs_agent', 'supplier', 'other']

function emailDomain(email: string | null): string | null {
  if (!email) return null
  const parts = email.split('@')
  return parts.length > 1 ? parts[1].toLowerCase() : null
}

function orgKey(c: Contact): string {
  return c.organization?.toLowerCase() || emailDomain(c.email) || 'sin org'
}

export function OrderContactsWidget({ orderId, refreshKey }: BaseProps) {
  const key = `order-contacts:${orderId}`
  const [editing, setEditing] = useState<Contact | null>(null)
  const [picking, setPicking] = useState<Role | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  const { data: fetched } = useData(
    async () => {
      const { data: order } = await supabase.from('orders').select('company_id').eq('id', orderId).maybeSingle()
      if (!order) return null
      // Fetch contacts visible in this order (company-wide + order-specific)
      const { data } = await supabase
        .from('contacts')
        .select('*')
        .eq('company_id', order.company_id)
        .or(`order_id.is.null,order_id.eq.${orderId}`)
        .order('role')
        .order('organization')
        .order('name')
      // Also fetch all company contacts for the picker (includes those assigned to other orders)
      const { data: allCompany } = await supabase
        .from('contacts')
        .select('*')
        .eq('company_id', order.company_id)
        .is('order_id', null)
        .order('role')
        .order('name')
      const list = (data || []) as Contact[]
      cacheSet(key, list)
      return { contacts: list, allCompany: (allCompany || []) as Contact[], companyId: order.company_id }
    },
    [orderId, refreshKey, reloadKey, key],
    cacheGet<Contact[]>(key) ? { contacts: cacheGet<Contact[]>(key)!, allCompany: [] as Contact[], companyId: null as string | null } : null,
  )

  const contacts = fetched?.contacts ?? null
  const allCompany = fetched?.allCompany ?? []
  const companyId = fetched?.companyId ?? null

  if (!contacts || !companyId) return (
    <div className="space-y-3">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i}>
          <Skeleton className="h-2 w-16 mb-1.5" />
          <div className="rounded-md border border-border/40 px-2 py-1.5 space-y-1">
            <Skeleton className="h-3 w-28" />
            <Skeleton className="h-2.5 w-40" />
          </div>
        </div>
      ))}
    </div>
  )

  // Group by role, then by organization within each role
  const byRole = ROLE_ORDER.map(role => {
    const items = contacts.filter(c => c.role === role)
    const orgs = new Map<string, Contact[]>()
    for (const c of items) {
      const k = orgKey(c)
      if (!orgs.has(k)) orgs.set(k, [])
      orgs.get(k)!.push(c)
    }
    return { role, items, orgs }
  })

  async function saveContact(c: Partial<Contact>) {
    if (c.id) {
      await supabase.from('contacts').update({
        name: c.name, email: c.email, phone: c.phone,
        organization: c.organization, notes: c.notes,
        role: c.role, order_id: c.order_id,
        updated_at: new Date().toISOString(),
      }).eq('id', c.id)
    } else {
      await supabase.from('contacts').insert({
        company_id: companyId,
        order_id: c.order_id ?? null,
        role: c.role,
        name: c.name,
        email: c.email || null,
        phone: c.phone || null,
        organization: c.organization || null,
      })
    }
    setEditing(null)
    setReloadKey(k => k + 1)
  }

  async function deleteContact(id: string) {
    await supabase.from('contacts').delete().eq('id', id)
    setEditing(null)
    setReloadKey(k => k + 1)
  }

  async function assignToOrder(contactId: string) {
    // Duplicate the company contact as an order-scoped contact
    const source = allCompany.find(c => c.id === contactId)
    if (!source) return
    await supabase.from('contacts').insert({
      company_id: companyId,
      order_id: orderId,
      role: source.role,
      name: source.name,
      email: source.email,
      phone: source.phone,
      organization: source.organization,
    })
    setPicking(null)
    setReloadKey(k => k + 1)
  }

  return (
    <div className="space-y-3">
      {byRole.map(({ role, items, orgs }) => (
        <div key={role}>
          <div className="flex items-center justify-between mb-1">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground/60">{ROLE_LABELS[role]}</p>
            <button
              onClick={() => {
                // If company has contacts for this role, show picker; otherwise create new
                const available = allCompany.filter(c => c.role === role)
                if (available.length > 0) {
                  setPicking(role)
                } else {
                  setEditing({
                    id: '', company_id: companyId!, order_id: null, role,
                    name: '', email: '', phone: '', organization: '', notes: '',
                  })
                }
              }}
              className="p-0.5 text-muted-foreground/50 hover:text-foreground"
              aria-label="Agregar contacto"
            >
              <PlusIcon className="w-3 h-3" />
            </button>
          </div>
          {items.length === 0 ? (
            <p className="text-[11px] text-muted-foreground/40 italic">Sin contactos</p>
          ) : (
            <div className="space-y-1.5">
              {Array.from(orgs.entries()).map(([org, people]) => (
                <div key={org} className="rounded-md border border-border/40 px-2 py-1.5">
                  {org !== 'sin org' && (
                    <div className="flex items-center gap-1 mb-1">
                      <BuildingIcon className="w-2.5 h-2.5 text-muted-foreground/50" />
                      <span className="text-[10px] font-medium text-muted-foreground/70">{people[0].organization || org}</span>
                    </div>
                  )}
                  <div className="space-y-0.5">
                    {people.map(c => (
                      <div
                        key={c.id}
                        className="group flex items-start gap-2 text-[11px] rounded px-1 py-0.5 hover:bg-muted/30 cursor-pointer"
                        onClick={() => setEditing(c)}
                      >
                        <div className="flex-1 min-w-0">
                          <span className="font-medium">{c.name}</span>
                          {c.order_id
                            ? <span className="ml-1 text-[9px] text-amber-600">(orden)</span>
                            : <span className="ml-1 text-[9px] text-emerald-600">(empresa)</span>}
                          <div className="flex items-center gap-2 text-muted-foreground">
                            {c.email && (
                              <span className="flex items-center gap-0.5 truncate">
                                <MailIcon className="w-2.5 h-2.5 shrink-0" />{c.email}
                              </span>
                            )}
                            {c.phone && (
                              <span className="flex items-center gap-0.5 truncate">
                                <PhoneIcon className="w-2.5 h-2.5 shrink-0" />{c.phone}
                              </span>
                            )}
                          </div>
                        </div>
                        <button
                          onClick={(e) => { e.stopPropagation(); deleteContact(c.id) }}
                          className="opacity-0 group-hover:opacity-100 text-muted-foreground/50 hover:text-destructive mt-0.5"
                          aria-label="Eliminar"
                        >
                          <XIcon className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}

      {/* Picker: select existing company contact to assign to this order */}
      <ShellDialog
        open={!!picking}
        onClose={() => setPicking(null)}
        title={`Asignar ${picking ? ROLE_LABELS[picking] : ''} a este pedido`}
        description="Elige un contacto existente o crea uno nuevo."
      >
        {picking && (() => {
          const orderContactIds = new Set(contacts.filter(c => c.order_id === orderId).map(c => `${c.name}-${c.email}`))
          const available = allCompany.filter(c => c.role === picking && !orderContactIds.has(`${c.name}-${c.email}`))
          return (
            <div className="space-y-2">
              {available.length === 0 && (
                <p className="text-xs text-muted-foreground/60 text-center py-2">No hay contactos de empresa disponibles para asignar.</p>
              )}
              {available.map(c => (
                <button
                  key={c.id}
                  onClick={() => assignToOrder(c.id)}
                  className="w-full text-left p-2 rounded-md border border-border hover:bg-accent/50 hover:border-primary/30 transition-colors"
                >
                  <p className="text-xs font-medium">{c.name}{c.organization && <span className="font-normal text-muted-foreground"> · {c.organization}</span>}</p>
                  {c.email && <p className="text-[10px] text-muted-foreground">{c.email}</p>}
                </button>
              ))}
              <button
                onClick={() => {
                  setPicking(null)
                  setEditing({
                    id: '', company_id: companyId!, order_id: null, role: picking,
                    name: '', email: '', phone: '', organization: '', notes: '',
                  })
                }}
                className="w-full text-center text-xs text-primary hover:text-primary/80 py-2"
              >
                + Crear contacto nuevo
              </button>
            </div>
          )
        })()}
      </ShellDialog>

      <ContactForm
        contact={editing}
        orderId={orderId}
        onSave={saveContact}
        onDelete={deleteContact}
        onCancel={() => setEditing(null)}
      />
    </div>
  )
}

function ContactForm({
  contact, orderId, onSave, onDelete, onCancel,
}: {
  contact: Contact | null
  orderId: string
  onSave: (c: Partial<Contact>) => Promise<void>
  onDelete: (id: string) => Promise<void>
  onCancel: () => void
}) {
  const [form, setForm] = useState<Contact | null>(contact)
  const prevContact = useRef(contact)
  if (prevContact.current !== contact) {
    prevContact.current = contact
    setForm(contact)
  }
  const isNew = !contact?.id

  return (
    <ShellDialog
      open={!!contact}
      onClose={onCancel}
      title={`${isNew ? 'Nuevo' : 'Editar'} contacto${form ? ` · ${ROLE_LABELS[form.role]}` : ''}`}
      description="Los contactos de empresa estan disponibles en todos los pedidos."
    >
      {form && (
        <div className="space-y-3">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Nombre</label>
            <input
              autoFocus
              value={form.name}
              onChange={e => setForm({ ...form, name: e.target.value })}
              className="w-full text-sm px-3 py-2 rounded-md border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Organizacion</label>
            <input
              value={form.organization || ''}
              onChange={e => setForm({ ...form, organization: e.target.value })}
              placeholder="ej: Klog, Menares"
              className="w-full text-sm px-3 py-2 rounded-md border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Email</label>
              <input
                value={form.email || ''}
                onChange={e => setForm({ ...form, email: e.target.value })}
                className="w-full text-sm px-3 py-2 rounded-md border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Telefono</label>
              <input
                value={form.phone || ''}
                onChange={e => setForm({ ...form, phone: e.target.value })}
                className="w-full text-sm px-3 py-2 rounded-md border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Alcance</label>
            <select
              value={form.order_id ? 'order' : 'company'}
              onChange={e => setForm({ ...form, order_id: e.target.value === 'order' ? orderId : null })}
              className="w-full text-sm px-3 py-2 rounded-md border border-border bg-background"
            >
              <option value="company">Empresa — disponible en todos los pedidos</option>
              <option value="order">Solo esta orden</option>
            </select>
          </div>
          <div className="flex justify-between pt-2 border-t border-border/40">
            <div>
              {!isNew && (
                <button
                  onClick={() => { if (confirm(`Eliminar ${form.name}?`)) onDelete(form.id) }}
                  className="text-sm px-3 py-1.5 rounded-md text-destructive hover:bg-destructive/10"
                >
                  Eliminar
                </button>
              )}
            </div>
            <div className="flex gap-2">
              <button
                onClick={onCancel}
                className="text-sm px-3 py-1.5 rounded-md text-muted-foreground hover:text-foreground"
              >
                Cancelar
              </button>
              <button
                onClick={() => onSave(form)}
                disabled={!form.name.trim()}
                className="text-sm px-4 py-1.5 rounded-md bg-primary text-primary-foreground disabled:opacity-50 hover:bg-primary/90"
              >
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}
    </ShellDialog>
  )
}
