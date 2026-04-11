---
name: hermes-products
description: Catalogo de productos de la empresa
mcp-tools:
  - create_product
  - list_products
  - get_product
  - update_product
  - add_order_item
  - list_order_items
  - update_order_item
  - delete_order_item
---

# Catalogo de Productos

Cada empresa tiene un catalogo de productos. Cuando se hace intake de una nueva importacion, el producto se registra en el catalogo. Los pedidos se componen de items que referencian productos del catalogo.

## Estructura

```
products (catalogo)
  └── order_items (lineas de pedido)
        └── orders (pedido)
```

## Flujo de intake con catalogo

1. Durante el intake, despues de recopilar la info del producto, usar `create_product` para registrarlo en el catalogo
2. Al crear el pedido, usar `add_order_item` para agregar el producto al pedido con cantidad y precio
3. Si el producto ya existe en el catalogo (recompra), usar `list_products` para buscarlo y reutilizarlo

## Flujo de recompra

1. Buscar producto en catalogo: `list_products` con search
2. Crear pedido
3. Agregar producto existente al pedido: `add_order_item`
4. No duplicar productos en el catalogo

## REGLA: un producto = un SKU

Cada variante de un producto (talla, color, modelo) es un producto SEPARADO en el catalogo.

Ejemplo correcto:
- "Bata de bano para spa - Talla L" → producto 1
- "Bata de bano para spa - Talla XL" → producto 2

Ejemplo INCORRECTO:
- "Bata de bano para spa" con nota "100 L + 100 XL" → NO. Son dos productos.

Esto es obligatorio porque:
- El inventario se lleva por producto
- Cada variante puede tener precio distinto
- Las recompras son por SKU individual

Al hacer intake, si el usuario menciona multiples tallas/colores/variantes, crear un producto por cada variante.

## Pedido multi-producto

Un pedido puede tener multiples productos. Cada uno se agrega como `order_item` independiente con su cantidad y precio.

## Campos del producto

- **name**: nombre corto y claro
- **description**: descripcion detallada
- **category**: textil, electronica, ferreteria, cosmetica, alimentos, etc
- **material**: composicion (100% algodon, acero 304, etc)
- **dimensions**: tallas, medidas
- **weight**: peso unitario
- **colors**: lista de colores
- **certifications**: CE, FDA, ISO, etc
- **packaging**: empaque individual
- **hs_code**: codigo arancelario
- **origin_country**: pais de origen preferido
- **reference_urls**: links de referencia
- **reference_brand**: marca de referencia
- **customization**: logo, etiqueta, empaque custom
- **regulations**: normativa chilena (SAG, ISP, SEC)
- **image_urls**: fotos del producto
