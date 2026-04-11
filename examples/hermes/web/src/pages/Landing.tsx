import { ArrowRight } from 'lucide-react'

export default function Landing() {
  return (
    <div className="min-h-screen bg-background text-foreground font-sans antialiased">
      {/* Nav */}
      <nav className="max-w-5xl mx-auto px-6 py-6 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md bg-emerald-600 flex items-center justify-center text-[11px] font-bold text-white">H</div>
          <span className="font-semibold text-sm tracking-tight">Hermes</span>
        </div>
        <div className="flex items-center gap-6 text-xs text-muted-foreground">
          <a href="#producto" className="hover:text-foreground transition-colors">Producto</a>
          <a href="#como" className="hover:text-foreground transition-colors">Cómo funciona</a>
          <a href="/login" className="text-foreground hover:text-emerald-600 transition-colors">Ingresar</a>
        </div>
      </nav>

      {/* Hero */}
      <section className="max-w-5xl mx-auto px-6 pt-24 pb-32">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-border text-[11px] text-muted-foreground mb-8">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
          Agente AI para importaciones
        </div>
        <h1 className="text-5xl md:text-6xl font-semibold tracking-tight leading-[1.05] max-w-3xl">
          Importar desde China,<br />sin la fricción.
        </h1>
        <p className="mt-6 text-base text-muted-foreground max-w-xl leading-relaxed">
          Hermes es un agente que gestiona tus pedidos end-to-end: sourcing, negociación,
          documentación, aduana y last-mile. Hecho para pymes chilenas.
        </p>
        <div className="mt-10 flex items-center gap-4">
          <a
            href="/login"
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-foreground text-background rounded-md text-sm font-medium hover:opacity-90 transition-opacity"
          >
            Empezar <ArrowRight className="w-3.5 h-3.5" />
          </a>
          <a href="#como" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
            Ver cómo funciona
          </a>
        </div>
      </section>

      {/* Features */}
      <section id="producto" className="max-w-5xl mx-auto px-6 py-24 border-t border-border">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-px bg-border">
          {[
            { k: '01', t: 'State machine', d: 'Cada item avanza por 13 fases auditables, del sourcing al closed.' },
            { k: '02', t: 'Documentos', d: 'BL, factura, packing list, DIN. Validación y trazabilidad automática.' },
            { k: '03', t: 'Multi-proveedor', d: 'Pedidos consolidados con items de distintos suppliers en un solo BL.' },
            { k: '04', t: 'Gmail nativo', d: 'Conecta tu Gmail. Hermes lee, busca y responde hilos con proveedores.' },
            { k: '05', t: 'Gates humanos', d: 'El agente nunca aprueba costos finales ni recepciones sin tu confirmación.' },
            { k: '06', t: 'Chat + Cockpit', d: 'Conversa en lenguaje natural. Widgets se montan solos según contexto.' },
          ].map(f => (
            <div key={f.k} className="bg-background p-8">
              <div className="text-[11px] text-muted-foreground font-mono mb-4">{f.k}</div>
              <div className="text-sm font-medium mb-2">{f.t}</div>
              <div className="text-xs text-muted-foreground leading-relaxed">{f.d}</div>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section id="como" className="max-w-5xl mx-auto px-6 py-24 border-t border-border">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-12">
          <div className="md:col-span-4">
            <div className="text-[11px] text-muted-foreground font-mono mb-3">CÓMO FUNCIONA</div>
            <h2 className="text-2xl font-semibold tracking-tight">Un flujo. Cero hojas de cálculo.</h2>
          </div>
          <div className="md:col-span-8 space-y-px bg-border">
            {[
              ['Conecta', 'Gmail, proveedores, forwarder. Hermes indexa tu operación en minutos.'],
              ['Conversa', 'Pídele cotizar, negociar, armar el pedido. Te responde con acciones, no con resúmenes.'],
              ['Supervisa', 'Cada fase queda trazada. Tú apruebas los gates críticos. El resto, automático.'],
            ].map(([t, d], i) => (
              <div key={i} className="bg-background py-6 flex gap-6">
                <div className="text-[11px] text-muted-foreground font-mono pt-0.5">0{i + 1}</div>
                <div>
                  <div className="text-sm font-medium mb-1">{t}</div>
                  <div className="text-xs text-muted-foreground leading-relaxed">{d}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="max-w-5xl mx-auto px-6 py-32 border-t border-border text-center">
        <h2 className="text-3xl md:text-4xl font-semibold tracking-tight">
          Tu próximo pedido, sin estrés.
        </h2>
        <p className="mt-4 text-sm text-muted-foreground">
          Hermes está en beta privada. Escríbenos para acceder.
        </p>
        <a
          href="/login"
          className="mt-8 inline-flex items-center gap-2 px-5 py-2.5 bg-foreground text-background rounded-md text-sm font-medium hover:opacity-90 transition-opacity"
        >
          Solicitar acceso <ArrowRight className="w-3.5 h-3.5" />
        </a>
      </section>

      {/* Footer */}
      <footer className="max-w-5xl mx-auto px-6 py-10 border-t border-border flex items-center justify-between text-[11px] text-muted-foreground">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded bg-emerald-600 flex items-center justify-center text-[9px] font-bold text-white">H</div>
          <span>Hermes · Santiago, Chile</span>
        </div>
        <div>© {new Date().getFullYear()}</div>
      </footer>
    </div>
  )
}
