import { z } from 'zod'
import { randomUUID, createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { defineTool, getSupabase } from '@tleblancureta/proto/mcp'

// In-memory cache: sha256(image bytes) -> { offers, expiresAt }
const CACHE_TTL_MS = 24 * 60 * 60 * 1000 // 24h
const CACHE_MAX = 500
const cache = new Map<string, { offers: any[]; expiresAt: number }>()

function cacheKey(bytes: Uint8Array, limit: number, language: string): string {
  const h = createHash('sha256').update(bytes).digest('hex')
  return `${h}:${limit}:${language}`
}

function cacheGet(key: string): any[] | null {
  const entry = cache.get(key)
  if (!entry) return null
  if (entry.expiresAt < Date.now()) {
    cache.delete(key)
    return null
  }
  return entry.offers
}

function cacheSet(key: string, offers: any[]): void {
  if (cache.size >= CACHE_MAX) {
    const firstKey = cache.keys().next().value
    if (firstKey) cache.delete(firstKey)
  }
  cache.set(key, { offers, expiresAt: Date.now() + CACHE_TTL_MS })
}

const APP_KEY = 'a5m1ismomeptugvfmkkjnwwqnwyrhpb1'
const APP_NAME = 'magellan'

const BASE_HEADERS = {
  Accept: 'application/json, text/plain, */*',
  Origin: 'https://www.alibaba.com/',
  Referer: 'https://www.alibaba.com/',
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36',
}

interface OssCredentials {
  accessid: string
  policy: string
  signature: string
  imagePath: string
  host: string
}

async function fetchCredentials(): Promise<OssCredentials> {
  const cb = `jQuery${randomUUID().replace(/-/g, '')}_${Date.now()}`
  const url = `https://open-s.alibaba.com/openservice/ossUploadSecretKeyDataService?appKey=${APP_KEY}&appName=${APP_NAME}&callback=${cb}`
  const res = await fetch(url, { headers: BASE_HEADERS })
  if (!res.ok) throw new Error(`credentials http ${res.status}`)
  const text = await res.text()
  const match = text.match(/jQuery[^(]+\((.*)\)/)
  if (!match) throw new Error('credentials parse error')
  const json = JSON.parse(match[1])
  if (json.code !== 200) throw new Error(`credentials error: ${json.msg}`)
  return json.data
}

async function uploadImage(creds: OssCredentials, bytes: Uint8Array, mime: string): Promise<string> {
  const key = `${creds.imagePath}/${randomUUID()}.jpg`
  const fd = new FormData()
  const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
  const blob = new Blob([ab], { type: mime })
  fd.append('name', 'image.jpg')
  fd.append('OSSAccessKeyId', creds.accessid)
  fd.append('success_action_status', '200')
  fd.append('signature', creds.signature)
  fd.append('key', key)
  fd.append('policy', creds.policy)
  fd.append('file', blob, 'image.jpg')

  const res = await fetch(creds.host, { method: 'POST', body: fd })
  if (!res.ok) throw new Error(`oss upload http ${res.status}: ${await res.text().catch(() => '')}`)
  return key
}

async function searchByKey(key: string, pageSize: number, language: string) {
  const sp = new URLSearchParams({
    pageSize: String(pageSize),
    beginPage: '1',
    imageType: 'oss',
    imageAddress: `/${key}`,
    categoryId: '66666666',
    region: '15,351,13,355',
    language,
  })
  const res = await fetch(`https://open-s.alibaba.com/openservice/imageSearchViewService?${sp}`, {
    headers: BASE_HEADERS,
  })
  if (!res.ok) throw new Error(`search http ${res.status}`)
  const json = await res.json() as any
  const offers: any[] = json?.data?.offers || []

  return offers.map(p => ({
    id: p.productId || p.id,
    title: p.title,
    price: p.price,
    promotion_price: p.promotionPrice || null,
    discount: p.discount || null,
    url: p.productUrl,
    thumbnail: p.mainImage?.startsWith('//') ? `https:${p.mainImage}` : p.mainImage,
    supplier: p.companyName,
    country: p.countryCode,
    review_score: p.reviewScore || null,
    review_count: p.reviewCount || null,
    moq: p.moqV2 || null,
    shipping_time: p.shippingTime || null,
    customizable: !!p.customizable,
    trade_product: !!p.tradeProduct,
    gold_supplier_years: p.goldSupplierYears || null,
  }))
}

async function sourceFromBytes(bytes: Uint8Array, mime: string, pageSize: number, language: string) {
  const ck = cacheKey(bytes, pageSize, language)
  const cached = cacheGet(ck)
  if (cached) return { offers: cached, cached: true }

  const creds = await fetchCredentials()
  const key = await uploadImage(creds, bytes, mime)
  const offers = await searchByKey(key, pageSize, language)
  cacheSet(ck, offers)
  return { offers, cached: false }
}

async function bytesFromSource(source: string): Promise<{ bytes: Uint8Array; mime: string; ext: string }> {
  if (/^https?:\/\//i.test(source)) {
    const res = await fetch(source)
    if (!res.ok) throw new Error(`fetch image http ${res.status}`)
    const mime = res.headers.get('content-type') || 'image/jpeg'
    const ext = mime.includes('png') ? 'png' : mime.includes('webp') ? 'webp' : 'jpg'
    return { bytes: new Uint8Array(await res.arrayBuffer()), mime, ext }
  }
  const buf = await readFile(source)
  const lower = source.toLowerCase()
  const ext = lower.endsWith('.png') ? 'png' : lower.endsWith('.webp') ? 'webp' : 'jpg'
  const mime = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg'
  return { bytes: new Uint8Array(buf), mime, ext }
}

export default [
  defineTool({
    name: 'attach_product_image',
    description: 'Download an image from a URL or local path, upload it to the product-images bucket, and append it to products.image_urls for the given product. Returns the public URL. Use this BEFORE searching Alibaba when the user provides an image for a product.',
    schema: {
      product_id: z.string().describe('Product ID in the catalog'),
      image_source: z.string().describe('Public URL or absolute local file path of the image'),
    },
    handler: async ({ product_id, image_source }) => {
      try {
        const db = getSupabase()
        const { data: product, error: pErr } = await db
          .from('products')
          .select('id, company_id, image_urls')
          .eq('id', product_id)
          .single()
        if (pErr || !product) throw new Error(`product not found: ${pErr?.message || product_id}`)

        const { bytes, mime, ext } = await bytesFromSource(image_source)
        const path = `${product.company_id}/${product_id}/${Date.now()}.${ext}`
        const { error: upErr } = await db.storage
          .from('product-images')
          .upload(path, bytes, { contentType: mime, upsert: false })
        if (upErr) throw new Error(`storage upload: ${upErr.message}`)

        const { data: pub } = db.storage.from('product-images').getPublicUrl(path)
        const publicUrl = pub.publicUrl

        const newUrls = [...(product.image_urls || []), publicUrl]
        const { error: updErr } = await db
          .from('products')
          .update({ image_urls: newUrls })
          .eq('id', product_id)
        if (updErr) throw new Error(`db update: ${updErr.message}`)

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({ public_url: publicUrl, product_id, total_images: newUrls.length }),
            },
          ],
        }
      } catch (err: any) {
        return {
          content: [{ type: 'text' as const, text: `Error: ${err?.message || String(err)}` }],
          isError: true,
        }
      }
    },
  }),

  defineTool({
    name: 'search_alibaba_by_image_url',
    description: 'Search Alibaba suppliers by image. Pass a public image URL. Returns up to N offers with supplier, price, MOQ, URL. Use for sourcing during intake.',
    schema: {
      image_url: z.string().url().describe('Public URL of the reference product image'),
      limit: z.number().int().min(1).max(40).default(20).describe('Max offers to return (default 20)'),
      language: z.enum(['es', 'en']).default('es').describe('Result language'),
    },
    handler: async ({ image_url, limit, language }) => {
      try {
        const imgRes = await fetch(image_url)
        if (!imgRes.ok) throw new Error(`image fetch http ${imgRes.status}`)
        const mime = imgRes.headers.get('content-type') || 'image/jpeg'
        const bytes = new Uint8Array(await imgRes.arrayBuffer())
        const { offers, cached } = await sourceFromBytes(bytes, mime, limit, language)
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ count: offers.length, cached, offers }, null, 2) }],
        }
      } catch (err: any) {
        return {
          content: [{ type: 'text' as const, text: `Error: ${err?.message || String(err)}` }],
          isError: true,
        }
      }
    },
  }),

  defineTool({
    name: 'search_alibaba_by_image_path',
    description: 'Search Alibaba suppliers by a local image file path (inside the session directory). Returns offers with supplier, price, MOQ, URL.',
    schema: {
      file_path: z.string().describe('Absolute path to an image file'),
      limit: z.number().int().min(1).max(40).default(20),
      language: z.enum(['es', 'en']).default('es'),
    },
    handler: async ({ file_path, limit, language }) => {
      try {
        const buf = await readFile(file_path)
        const bytes = new Uint8Array(buf)
        const mime = file_path.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg'
        const { offers, cached } = await sourceFromBytes(bytes, mime, limit, language)
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ count: offers.length, cached, offers }, null, 2) }],
        }
      } catch (err: any) {
        return {
          content: [{ type: 'text' as const, text: `Error: ${err?.message || String(err)}` }],
          isError: true,
        }
      }
    },
  }),
]
