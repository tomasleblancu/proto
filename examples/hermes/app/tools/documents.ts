import { z } from 'zod'
import { readFileSync, existsSync } from 'node:fs'
import { basename, extname } from 'node:path'
import { defineTool, getSupabase, agent, agentErr } from '@tleblancureta/proto/mcp'
import {
  DOC_TYPES,
  DOC_KINDS,
  DOCS_THAT_TRIGGER_PAYMENT,
  getRequiredDocsForStage,
  getRequiredDocsForIncoterm,
  type OrderStatus,
  type DocKind,
  type Incoterm,
} from '../shared/index.js'

const KIND_TO_PAYMENT_TYPE: Record<string, string> = {
  proforma_invoice: 'deposit',
  forwarder_invoice: 'freight',
  customs_funds_provision: 'customs_provision',
  port_invoice: 'customs_provision (ya cubierto por la provision)',
  customs_agent_invoice: 'customs_provision (ya cubierto por la provision)',
}

const LEGACY_DOC_TYPE: Record<string, string> = {
  proforma_invoice: 'proforma_invoice',
  commercial_invoice: 'commercial_invoice',
  packing_list: 'packing_list',
  certificate_of_origin: 'certificate_of_origin',
  bill_of_lading: 'bl',
  din: 'din',
}

export default [
  defineTool({
    name: 'upload_document',
    description: 'Upload a document linked to an import order.',
    schema: {
      order_id: z.string().describe('Order ID'),
      company_id: z.string().describe('Company ID'),
      doc_type: z.enum(DOC_TYPES).describe('Document type'),
      filename: z.string().describe('Original filename'),
      storage_path: z.string().describe('Path in Supabase Storage'),
    },
    handler: async (args) => {
      const db = getSupabase()
      const { data, error } = await db.from('documents').insert({
        order_id: args.order_id,
        company_id: args.company_id,
        doc_type: args.doc_type,
        filename: args.filename,
        storage_path: args.storage_path,
        validated: false,
      }).select('id').single()

      if (error) return agentErr(`Error subiendo documento: ${error.message}`)
      return agent({
        summary: `Documento subido: ${args.filename} (${args.doc_type})`,
        data: { id: data.id, filename: args.filename, doc_type: args.doc_type },
        hint: 'Prefiere attach_document sobre upload_document — soporta doc_kind tipado y hints de pago.',
      })
    },
  }),

  defineTool({
    name: 'list_documents',
    description: 'List all documents for an order.',
    schema: { order_id: z.string().describe('Order ID') },
    handler: async (args) => {
      const db = getSupabase()
      const { data, error } = await db
        .from('documents')
        .select('id, kind, doc_type, filename, triggers_payment, extracted, upload_status')
        .eq('order_id', args.order_id)
        .order('created_at', { ascending: true })

      if (error) return agentErr(`Error listando documentos: ${error.message}`)

      const documents = (data || []).map(d => ({
        id: d.id,
        kind: d.kind,
        doc_type: d.doc_type,
        filename: d.filename,
        triggers_payment: d.triggers_payment,
        has_extracted: !!d.extracted,
        upload_status: d.upload_status,
      }))

      return agent({
        summary: `${documents.length} documento(s) para pedido ${args.order_id}`,
        data: { documents },
      })
    },
  }),

  defineTool({
    name: 'validate_document_set',
    description: 'Check if all required documents for a given order stage are present.',
    schema: {
      order_id: z.string().describe('Order ID'),
      stage: z.string().describe('Order stage to validate against'),
    },
    handler: async (args) => {
      const db = getSupabase()
      const { data: docs, error } = await db
        .from('documents')
        .select('doc_type')
        .eq('order_id', args.order_id)

      if (error) return agentErr(`Error validando documentos: ${error.message}`)

      const existingTypes = new Set(docs?.map(d => d.doc_type) ?? [])
      const required = getRequiredDocsForStage(args.stage as OrderStatus)
      const missing = required.filter(t => !existingTypes.has(t))

      return agent({
        summary: missing.length === 0
          ? `Todos los docs requeridos para "${args.stage}" estan presentes.`
          : `Faltan ${missing.length} doc(s) para "${args.stage}": ${missing.join(', ')}`,
        data: { stage: args.stage, missing, present: [...existingTypes] },
        hint: missing.length > 0
          ? 'Recopila los documentos faltantes con attach_document antes de avanzar de fase.'
          : undefined,
      })
    },
  }),

  defineTool({
    name: 'attach_document',
    description: 'Adjunta un documento tipado (state-machine aware) a un pedido/item. USA SIEMPRE ESTE TOOL con `kind` explicito — no uses upload_document. Si el doc dispara pago, devuelve un hint para que registres el payment. Si es un comprobante de pago, pasa `receipt_for_document_id` apuntando a la factura original.',
    schema: {
      company_id: z.string(),
      order_id: z.string(),
      kind: z.enum(DOC_KINDS),
      filename: z.string(),
      storage_path: z.string(),
      item_id: z.string().optional(),
      extracted: z.record(z.any()).describe('Contenido estructurado extraido del documento (montos, fechas, items). OBLIGATORIO — lee el archivo antes de adjuntar.'),
      receipt_for_document_id: z.string().optional().describe('Si kind=payment_receipt, id de la factura que este comprobante justifica.'),
    },
    handler: async (args) => {
      const db = getSupabase()
      const triggers_payment = DOCS_THAT_TRIGGER_PAYMENT.includes(args.kind as DocKind)
      const { receipt_for_document_id, extracted, ...rest } = args
      const { data, error } = await db.from('documents').insert({
        ...rest,
        doc_type: LEGACY_DOC_TYPE[args.kind] || 'other',
        triggers_payment,
        upload_status: 'attached',
        extracted,
      }).select('id, order_id, item_id, kind, filename, storage_path').single()
      if (error) return agentErr(`Error adjuntando documento: ${error.message}`)

      if (args.kind === 'payment_receipt' && receipt_for_document_id) {
        await db.from('documents').update({ receipt_document_id: data.id }).eq('id', receipt_for_document_id)
      }

      let hint: string | undefined
      if (triggers_payment) {
        const paymentType = KIND_TO_PAYMENT_TYPE[args.kind] || 'other'
        hint = `Este doc dispara pago. Llama record_payment(linked_document_id="${data.id}", type="${paymentType}").`
      }

      return agent({
        summary: `Documento adjuntado: ${args.kind} "${args.filename}"`,
        data: {
          id: data.id,
          order_id: data.order_id,
          item_id: data.item_id,
          kind: args.kind,
          filename: args.filename,
          triggers_payment,
        },
        hint,
      })
    },
  }),

  defineTool({
    name: 'list_required_docs',
    description: 'Devuelve los docs requeridos para un incoterm dado.',
    schema: { incoterm: z.enum(['EXW', 'FOB', 'CIF', 'DDP']) },
    handler: async ({ incoterm }) => {
      const docs = getRequiredDocsForIncoterm(incoterm as Incoterm)
      return agent({
        summary: `Docs requeridos para ${incoterm}: ${docs.join(', ')}`,
        data: { incoterm, required_docs: docs },
      })
    },
  }),

  defineTool({
    name: 'get_document',
    description: 'Obtiene metadata de un documento. Si tiene extracted, no necesitas descargar el archivo.',
    schema: { document_id: z.string().describe('Document ID') },
    handler: async (args) => {
      const db = getSupabase()
      const { data, error } = await db
        .from('documents')
        .select('id, kind, doc_type, filename, storage_path, extracted, triggers_payment, receipt_document_id')
        .eq('id', args.document_id)
        .single()

      if (error) return agentErr(`Error obteniendo documento: ${error.message}`)

      const hasExtracted = !!data.extracted

      let download_url: string | undefined
      if (!hasExtracted) {
        const { data: urlData } = await db.storage
          .from('documents')
          .createSignedUrl(data.storage_path, 3600)
        download_url = urlData?.signedUrl
      }

      return agent({
        summary: `Documento: ${data.kind || data.doc_type} "${data.filename}"${hasExtracted ? ' (extracted disponible)' : ''}`,
        data: {
          id: data.id,
          kind: data.kind,
          doc_type: data.doc_type,
          filename: data.filename,
          extracted: data.extracted,
          triggers_payment: data.triggers_payment,
          ...(download_url ? { download_url } : {}),
        },
        hint: !hasExtracted
          ? 'Este documento no tiene extracted. Despues de leerlo, llama update_document(document_id, extracted={...}) para persistir los datos.'
          : undefined,
      })
    },
  }),

  defineTool({
    name: 'update_document',
    description: 'Actualiza campos de un documento existente. Uso principal: guardar `extracted` despues de leer un PDF por primera vez.',
    schema: {
      document_id: z.string(),
      extracted: z.record(z.any()).optional().describe('Contenido estructurado extraido del documento'),
      kind: z.enum(DOC_KINDS).optional().describe('Corregir el tipo del documento'),
      notes: z.string().optional(),
    },
    handler: async (args) => {
      const db = getSupabase()
      const { document_id, ...patch } = args
      const clean = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined))
      if (Object.keys(clean).length === 0) return agentErr('Nada que actualizar')
      const { data, error } = await db.from('documents').update(clean).eq('id', document_id).select('id, kind, extracted').single()
      if (error) return agentErr(`Error actualizando documento: ${error.message}`)

      return agent({
        summary: `Documento ${document_id} actualizado: ${Object.keys(clean).join(', ')}`,
        data: { id: data.id, kind: data.kind, has_extracted: !!data.extracted },
      })
    },
  }),

  defineTool({
    name: 'upload_to_storage',
    description: 'Sube un archivo local a Supabase Storage y devuelve el storage_path. Usalo SIEMPRE despues de que el usuario suba un archivo por chat — el archivo temporal se borra en 5 min.',
    schema: {
      local_path: z.string().describe('Path absoluto del archivo local'),
      company_id: z.string().describe('Company ID'),
      order_id: z.string().optional().describe('Order ID'),
      filename: z.string().optional().describe('Nombre del archivo para Storage'),
    },
    handler: async (args) => {
      if (!existsSync(args.local_path)) {
        return agentErr(`Archivo no encontrado: ${args.local_path}. Puede que ya se haya borrado (TTL 5 min).`)
      }

      const buffer = readFileSync(args.local_path)
      const name = args.filename || basename(args.local_path)
      const ext = extname(name).toLowerCase()

      const MIME_MAP: Record<string, string> = {
        '.pdf': 'application/pdf',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.gif': 'image/gif',
        '.webp': 'image/webp',
        '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        '.xls': 'application/vnd.ms-excel',
        '.doc': 'application/msword',
        '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      }
      const contentType = MIME_MAP[ext] || 'application/octet-stream'

      const ts = Date.now()
      const folder = args.order_id ? `${args.company_id}/${args.order_id}` : args.company_id
      const storagePath = `${folder}/${ts}-${name}`

      const db = getSupabase()
      const { error } = await db.storage.from('documents').upload(storagePath, buffer, {
        contentType,
        cacheControl: '3600',
        upsert: false,
      })

      if (error) return agentErr(`Error subiendo a Storage: ${error.message}`)

      return agent({
        summary: `Archivo subido a Storage: ${name}`,
        data: { storage_path: storagePath, filename: name, content_type: contentType },
        hint: 'Ahora llama attach_document con este storage_path para registrar el documento.',
      })
    },
  }),
]
