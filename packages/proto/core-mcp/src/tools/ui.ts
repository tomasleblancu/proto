import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'

/**
 * Generative UI: the agent calls `render_ui` to project an interactive
 * component tree into the frontend shell. The tool itself is a no-op on the
 * server — its purpose is to emit a `tool_use` event in the SSE stream that
 * the frontend can intercept and render.
 */
export function registerUiTools(server: McpServer) {
  server.tool(
    'render_ui',
    `Project an interactive component tree into the user's shell (right canvas). The other widgets minimize so the user can focus on exploring the generated UI.

Use this WHENEVER you have structured data the user should browse visually: supplier search results, product comparisons, timelines, dashboards, tables, etc. Prefer this over large markdown tables in chat.

The \`spec\` is a JSON tree of primitives. Each node = { "type": "PrimitiveName", ...props, "children": [...] }.

## Available primitives

### Layout
- **Stack** { gap?: 1-6, children } — vertical flex column.
- **Row** { gap?: 1-6, align?: "start"|"center"|"end"|"baseline", children } — horizontal flex.
- **Grid** { cols: 1|2|3|4, gap?: 1-6, children } — responsive grid.

### Typography
- **Heading** { text: string, level?: 1|2|3 }
- **Text** { text: string, muted?: boolean, size?: "xs"|"sm" }

### Content
- **Image** { src: string, alt?: string, aspect?: "square"|"video"|"auto" (default "square"), fit?: "cover"|"contain" (default "contain" — shows whole image) }
- **Badge** { text: string, variant?: "default"|"secondary"|"outline"|"success"|"warning" }
- **Stat** { label: string, value: string, hint?: string, tone?: "default"|"success"|"warning"|"danger" } — big number card.
- **Rating** { score: number, count?: number } — star rating.
- **GoldSupplier** { years: number } — Alibaba gold supplier badge.

### Containers
- **Card** { children } — elevated rounded container. Usually holds Image + CardBody.
- **CardBody** { children } — padded flex-column inside a Card.

### Interactive
- **LinkOut** { href: string, label?: string } — external link button.
- **Button** { label: string, send?: string, action?: string, actionPayload?: object, variant?: "default"|"primary"|"ghost" } — clicking either sends \`send\` as a new chat message OR fires a frontend \`action\` directly (no LLM roundtrip). If \`action\` is set it takes priority. Available actions:
  - \`save_alternative\`: saves an Alibaba supplier to product_alternatives. actionPayload = { company_id (required), product_id?, supplier (required), title?, url?, thumbnail?, price?, moq?, review_score?, review_count?, gold_supplier_years?, country? }. Button shows "✓ <supplier> guardado como alternativa" on success.

### Tabular
- **Table** { columns: string[], rows: (string|number)[][] } — simple table.

## Example (supplier results)

{
  "type": "Stack", "gap": 3, "children": [
    { "type": "Text", "text": "5 proveedores encontrados", "muted": true },
    { "type": "Grid", "cols": 2, "gap": 3, "children": [
      {
        "type": "Card", "children": [
          { "type": "Image", "src": "https://...", "aspect": "video" },
          { "type": "CardBody", "children": [
            { "type": "Text", "text": "Albornoz spa algodon 100%" },
            { "type": "Row", "gap": 2, "children": [
              { "type": "Badge", "text": "USD 6.60-8.80", "variant": "success" },
              { "type": "Badge", "text": "MOQ 50" }
            ]},
            { "type": "Row", "gap": 2, "children": [
              { "type": "Rating", "score": 4.9, "count": 120 },
              { "type": "GoldSupplier", "years": 9 }
            ]},
            { "type": "Text", "text": "Shanghai General Textile", "muted": true, "size": "xs" },
            { "type": "Row", "gap": 1, "children": [
              { "type": "LinkOut", "href": "https://alibaba.com/...", "label": "Ver" },
              { "type": "Button", "label": "Guardar", "send": "Guarda Shanghai General Textile como referencia", "variant": "primary" }
            ]}
          ]}
        ]
      }
    ]}
  ]
}

## Rules
- Keep specs compact. Don't duplicate text that's already in chat.
- Use Grid cols:2 for 4-10 cards, cols:3 for 12+.
- Always include a Button with a useful follow-up action per card when possible.
- Unknown primitives render a placeholder — don't invent new types.`,
    {
      spec: z
        .any()
        .describe('UI tree: { type, ...props, children? } or an array of such nodes.'),
      title: z
        .string()
        .optional()
        .describe('Widget title shown in the header. Keep it short (e.g. "Proveedores").'),
    },
    async ({ spec, title }) => {
      // No-op. The value is in the tool_use event itself.
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ rendered: true, title: title || 'Vista generada' }),
          },
        ],
      }
    },
  )
}
