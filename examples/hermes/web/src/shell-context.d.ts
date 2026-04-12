import type { CartItem } from './shared/types'

declare module 'proto/web' {
  interface ShellContext {
    cartItems: CartItem[]
    addToCart: (item: CartItem) => void
    openCreateOrder: (product?: { id: string; name: string }) => void
    openCreateProduct: () => void
  }
}

export {}
