/**
 * Recursive renderer for agent-generated UI specs.
 *
 * The agent sends a JSON tree via the `render_ui` MCP tool. Each node has
 * `{ type: 'PrimitiveName', ...props, children?: UINode[] }`. Unknown types
 * render a muted fallback so the agent can iterate.
 */
import type { ComponentType, ReactNode } from 'react'
import * as P from './Primitives'

export interface UINode {
  type: string
  children?: UINode[]
  [prop: string]: any
}

const PRIMITIVES: Record<string, ComponentType<any>> = {
  Stack: P.Stack,
  Row: P.Row,
  Grid: P.Grid,
  Heading: P.Heading,
  Text: P.Text,
  Image: P.Image,
  Badge: P.Badge,
  Stat: P.Stat,
  Rating: P.Rating,
  GoldSupplier: P.GoldSupplier,
  Card: P.Card,
  CardBody: P.CardBody,
  LinkOut: P.LinkOut,
  Button: P.Button,
  Table: P.Table,
}

export const KNOWN_PRIMITIVES = Object.keys(PRIMITIVES)

interface Props {
  spec: UINode | UINode[] | null | undefined
  onSendToChat?: (message: string) => void
}

export function Generative({ spec, onSendToChat }: Props) {
  if (!spec) return null
  const nodes = Array.isArray(spec) ? spec : [spec]
  return <>{nodes.map((n, i) => renderNode(n, i, onSendToChat))}</>
}

function renderNode(node: UINode, key: number | string, onSendToChat?: (m: string) => void): ReactNode {
  if (!node || typeof node !== 'object') return null
  const { type, children, ...props } = node
  const Cmp = PRIMITIVES[type]

  if (!Cmp) {
    return (
      <div key={key} className="text-[10px] text-muted-foreground/60 italic">
        [unknown primitive: {String(type)}]
      </div>
    )
  }

  // Inject onSendToChat into any primitive that accepts it (Button)
  const injectedProps = type === 'Button' ? { ...props, onSendToChat } : props

  const renderedChildren =
    Array.isArray(children) && children.length > 0
      ? children.map((c, i) => renderNode(c, `${key}-${i}`, onSendToChat))
      : undefined

  return (
    <Cmp key={key} {...injectedProps}>
      {renderedChildren}
    </Cmp>
  )
}
