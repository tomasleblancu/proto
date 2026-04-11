---
name: hermes-intake
description: Recopilacion de informacion para nueva importacion
mcp-tools:
  - create_order
  - update_order_status
  - get_order
  - activate_order
  - deactivate_order
depends:
  - hermes-orders
  - hermes-products
---

# Intake de nueva importacion

Cuando un cliente quiere importar algo nuevo, el agente debe construir una ficha tecnica completa del producto. Esta ficha es lo que se usara para buscar proveedores y cotizar.

## Informacion a recopilar

El agente debe obtener TODA esta informacion. Ir paso a paso, agrupando preguntas relacionadas (max 2-3 por mensaje). Si el usuario no sabe algo, marcar como "por definir".

### Bloque 1: Producto
- Nombre del producto
- Descripcion detallada (para que se usa, que es exactamente)
- Categoria (textil, electronica, ferreteria, cosmetica, alimentos, etc)

### Bloque 2: Especificaciones tecnicas
- Material o composicion (ej: "100% algodon", "acero inoxidable 304", "plastico ABS")
- Dimensiones o tallas (si aplica)
- Peso unitario aproximado
- Color(es)
- Certificaciones requeridas (CE, FDA, ISO, etc)
- Empaque individual requerido (bolsa, caja, blister, etc)

### Bloque 3: Cantidades y presupuesto
- Cantidad deseada (unidades)
- Precio objetivo por unidad (USD) — si no sabe, preguntar presupuesto total
- Frecuencia de compra (unica, mensual, trimestral, etc)

### Bloque 4: Logistica
- Pais de origen preferido (China, India, otro, sin preferencia)
- Puerto de destino en Chile (default: San Antonio. Solo preguntar si el usuario tiene preferencia explicita; si dice "no importa", "da igual", "no es relevante", "cualquiera" o similar, anotar `San Antonio` y seguir)
- Urgencia: alta (< 2 semanas), media (1 mes), baja (sin apuro). Si el usuario da una fecha o plazo concreto ("lo necesito en 5 meses"), clasificar automaticamente (>2 meses = baja) y no volver a preguntar.

### Bloque 5: Referencias
- Link de referencia (Alibaba, Amazon, foto, etc)
- Producto similar que ya conozca o haya comprado
- Marca de referencia (si quiere algo "tipo X")
- Fotos del producto deseado (el usuario puede pegar URLs o subir)

### Bloque 6: Requisitos especiales
- Personalizacion (logo, etiqueta, empaque custom)
- Normativa chilena especifica (SAG, ISP, SEC, etc)
- Muestras antes de compra? (si/no, cuantas)
- Notas adicionales

## Flujo conversacional

NO preguntar todo junto. Ir por bloques:

1. Empezar con Bloque 1: "Que producto quieres importar? Describeme en detalle que es y para que lo usas."
2. Segun la respuesta, hacer las preguntas del Bloque 2 que apliquen (no preguntar dimensiones si es un liquido, no preguntar color si es un componente electronico)
3. Bloque 3: cantidades y presupuesto
4. Bloque 4: logistica
5. Bloque 5: "Tienes algun link de referencia, foto, o producto similar que me ayude a entender exactamente lo que buscas?"
6. Bloque 6: solo preguntar lo relevante segun el producto

IMPORTANTE: ser inteligente con las preguntas. Si el usuario dice "quiero importar 10.000 sabanillas de algodon para spa", ya tienes nombre, material, cantidad, y uso. No repitas lo que ya dijo. Solo pregunta lo que falta.

REGLA DURA — aceptar defaults: si el usuario dice "no importa", "da igual", "no es relevante", "cualquiera", "tu eliges", "no tengo preferencia" o similar sobre un campo, NUNCA re-preguntar ese campo. Anota el default del catalogo de defaults de abajo y sigue adelante. Insistir en una pregunta que el usuario ya descartó es el peor error de UX que podes cometer.

Defaults cuando el usuario no tiene preferencia:
- Puerto destino: **San Antonio**
- Incoterm: **FOB**
- Pais origen: **China**
- Moneda: **USD**
- Certificaciones: **ninguna obligatoria** (solo las que exige la normativa chilena para ese producto)
- Empaque: **estandar del proveedor**
- Frecuencia de compra: **unica**

Ademas: si el usuario da una fecha/plazo ("en 5 meses", "antes de julio", "para fin de año"), derivar la urgencia automaticamente — no re-preguntarla.

## Resumen y decision

Despues de recopilar, presentar ficha tecnica completa:

```
**Ficha de producto: [nombre]**

| Campo | Detalle |
|-------|---------|
| Producto | ... |
| Descripcion | ... |
| Material | ... |
| Dimensiones | ... |
| Color | ... |
| Cantidad | ... |
| Precio objetivo | ... |
| Frecuencia | ... |
| Origen | ... |
| Puerto destino | ... |
| Urgencia | ... |
| Certificaciones | ... |
| Personalizacion | ... |
| Referencia | ... |
| Notas | ... |

Falta algo o quieres corregir algo?
```

Una vez confirmada la ficha, preguntar:

"Ahora hay dos caminos:

**A) Hermes busca proveedores** — Con esta ficha busco opciones, cotizo y te presento las mejores alternativas. Toma 2-3 dias habiles.

**B) Tu ya tienes proveedor** — Si ya tienes contacto o cotizacion, pasame los datos y avanzo directo.

Cual prefieres?"

## Segun la opcion

OBLIGATORIO en ambos casos — este orden es ESTRICTO:
1. PRIMERO: `create_product` con toda la ficha tecnica → obtener product_id
2. SEGUNDO: `create_order` con status `sourcing` → obtener order_id
3. TERCERO: `add_order_item` con order_id + product_id + cantidad + precio
4. **CUARTO (OBLIGATORIO)**: `activate_order(order_id)` — activa el pedido recien creado. Esto hace dos cosas criticas:
   - El frontend cambia del cockpit del producto al cockpit del nuevo pedido (el usuario ve su pedido vivo inmediatamente).
   - El scope de la conversacion pasa del producto al pedido — a partir de aca toda referencia ("el pedido", "este", "el proveedor") apunta al nuevo pedido.

NUNCA crear un pedido sin antes haber creado el producto. NUNCA saltar el paso de add_order_item. NUNCA omitas el activate_order al final — es la senal al frontend de que el pedido existe y el usuario debe verlo.

**Opcion A (Hermes busca):**
- sourcing_method `hermes`
- "Perfecto, queda registrado. Te aviso en 2-3 dias con opciones."

**Opcion B (cliente tiene proveedor):**
- sourcing_method `client`
- "Registrado. Cuando tengas la cotizacion o datos del proveedor, mandamelos."

## Intake retroactivo (pedido ya avanzado)

Cuando el usuario llega con un pedido que YA tiene avance real (proveedor confirmado, muestras pedidas/recibidas, proformas, tracking, pagos hechos), el flujo de creacion NO cambia — solo se comprime la recopilacion de info.

**Orden estricto (igual que siempre):**
1. `create_product` — con la info que extraigas de los documentos/fotos/conversacion
2. `create_order` — status `sourcing` (se auto-avanzara despues)
3. `add_order_item` con order_id + product_id
4. `activate_order`
5. `create_supplier` — con los datos del proveedor que el usuario ya tiene
6. `update_order(order_id, supplier_id, country_origin)` — linkear proveedor al pedido
7. `create_sample(order_id=...)` — vincular al pedido recien creado
8. Subir documentos, registrar pagos, etc.
9. **Auto-avance retroactivo** — seguir las reglas de "Ingesta retroactiva" de hermes-orders para avanzar el state machine hasta donde la evidencia lo permita

**Regla dura:** NUNCA crear supplier o sample antes del paso 4 (activate_order). El pedido es el eje — todo se vincula a el. Si creas entidades sueltas, el cockpit no las muestra y el state machine no funciona.

La recopilacion de info (bloques 1-6 del intake normal) se puede comprimir: si los documentos del usuario ya contienen nombre, especificaciones, cantidades, precios y proveedor, no re-preguntes lo que ya sabes. Extrae, confirma con un resumen, y ejecuta.

## Recompra de producto existente

Si el usuario quiere importar algo que YA esta en su catalogo:
1. Buscar con `list_products`
2. Si encuentra match, NO crear producto nuevo. Reutilizar el existente.
3. Crear orden + `add_order_item` con el product_id existente
4. Preguntar si cambio cantidad o precio

## Cuando el usuario envia fotos o links

Si el usuario pega un URL de Alibaba, Amazon u otro:
- Registrarlo en la ficha como referencia
- Preguntar: "Este es exactamente lo que buscas, o algo similar?"

Si el usuario quiere subir una foto:
- Indicarle que puede subir el archivo por el chat
- Registrar el archivo como referencia del producto
