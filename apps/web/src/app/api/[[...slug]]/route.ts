/**
 * apps/web/src/app/api/[[...slug]]/route.ts
 *
 * [CHANGE TYPE]: TARGETED EDIT
 * [R-PHASE]: R4 — Auth/Security Domain
 * [PURPOSE]: mockReq's socket.remoteAddress was hardcoded to '127.0.0.1' for
 *   every request, regardless of the actual client. Combined with
 *   api-app.ts's new `app.set('trust proxy', 1)`, this is the other half of
 *   the actual fix for the rate limiter's inability to distinguish clients —
 *   Express's trust-proxy IP resolution reads x-forwarded-for once it trusts
 *   the immediate connection, but this mock request has no real TCP socket
 *   for Express to read a remoteAddress from at all, so remoteAddress must
 *   itself be derived from the header. Takes the first entry of
 *   x-forwarded-for (the original client, per standard chain convention —
 *   each proxy in the chain appends its own address, so entry 0 is furthest
 *   from Vercel's edge), falling back to '127.0.0.1' only when the header is
 *   absent (local dev, where there is no proxy at all).
 * [DEPENDS ON]: R4's own edit to lib/api-app.ts (`app.set('trust proxy', 1)`)
 *   — remoteAddress alone does nothing for req.ip resolution unless Express
 *   is told to trust it.
 */
import { type NextRequest, NextResponse } from 'next/server'
import { Readable } from 'node:stream'
import { createApiApp } from '@/lib/api-app'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Create the Express app once — reused across requests in the same lambda instance
const expressApp = createApiApp()

export async function GET(req: NextRequest)    { return handleRequest(req) }
export async function POST(req: NextRequest)   { return handleRequest(req) }
export async function PATCH(req: NextRequest)  { return handleRequest(req) }
export async function DELETE(req: NextRequest) { return handleRequest(req) }
export async function OPTIONS(req: NextRequest){ return handleRequest(req) }

async function handleRequest(req: NextRequest): Promise<NextResponse> {
  const url = new URL(req.url)
  // Strip /api prefix so Express routes match /students, /applications etc.
  const path = url.pathname.replace(/^\/api/, '') || '/'

  // Read body ONCE before creating the mock request
  // "Cannot convert null to object" was caused by calling arrayBuffer() on a
  // request that had already been consumed, or passing null to Buffer.from()
  let bodyBuffer: Buffer | undefined
  const hasBody = ['POST', 'PUT', 'PATCH'].includes(req.method)
  if (hasBody) {
    try {
      const ab = await req.arrayBuffer()
      if (ab.byteLength > 0) {
        bodyBuffer = Buffer.from(ab)
      }
    } catch {
      // Body was empty or already consumed — proceed without body
    }
  }

  return new Promise((resolve) => {
    const chunks: Buffer[] = []

    // Original client, per standard x-forwarded-for chain convention: each
    // proxy hop appends its own address, so the first entry is furthest from
    // Vercel's edge — the actual requester. Falls back to '127.0.0.1' when the
    // header is absent entirely (local dev, no proxy in front) or when its
    // first entry is empty — the `noUncheckedIndexedAccess` compiler option
    // types `.split(',')[0]` as `string | undefined`, so the optional chain
    // plus `||` fallback is required, not just defensive.
    const forwardedFor = req.headers.get('x-forwarded-for')
    const remoteAddress = forwardedFor?.split(',')[0]?.trim() || '127.0.0.1'

    // Build a mock of Node's IncomingMessage backed by a REAL Readable
    // stream — not a hand-rolled event emitter.
    //
    // [PRODUCTION FIX] The previous mock only implemented one of the two
    // ways middleware in this app consumes the request body:
    //   - express.json() (via body-parser/raw-body) calls
    //     req.on('data', ...) / req.on('end', ...)          — WAS handled
    //   - multer's busboy-based multipart parser calls
    //     req.pipe(busboy)                                   — WAS a no-op
    // `pipe` was stubbed as `function() { return this }` — it never wrote
    // anything to its destination. So for every route that uploads an
    // actual file (announcements, gallery, school-gallery, HR/staff photos,
    // leadership photos, library/eBook resources, assignment submissions,
    // expense receipts — every `upload.single(...)` route in this
    // codebase), busboy sat waiting forever for a 'data' event that would
    // never come. upload.single()'s next() was never called, so the route
    // handler itself never ran — the client's fetch just spun until
    // cancelled.
    //
    // This is NOT the "unhandled promise rejection" bug the try/catch
    // additions elsewhere in this codebase (announcements.ts, gallery.ts,
    // hr.ts, finances.ts, library.ts, ...) were fixing — that was a real,
    // separate issue, but its fix runs *inside* the route handler, and this
    // hang happens *before* the handler is ever invoked, so no downstream
    // try/catch could ever have caught it. Report-card generation was
    // unaffected because it never receives an uploaded file at all — the
    // server generates the PDF itself and uploads it directly via
    // uploadFile(), so no multer/busboy parsing is involved.
    //
    // A real Readable implements .pipe()/.on()/.unpipe()/.pause()/.resume()/
    // .destroy() correctly out of the box, so this fixes both consumption
    // patterns at once instead of re-simulating each library's expectations
    // by hand. We already have the full body in `bodyBuffer` (read once,
    // above), so we just push it and signal EOF immediately.
    const mockReq = new Readable({ read() {} }) as Readable & {
      method:  string
      url:     string
      headers: Record<string, string>
      socket:  { remoteAddress: string }
    }
    mockReq.method  = req.method
    mockReq.url     = path + (url.search || '')
    mockReq.headers = Object.fromEntries(req.headers.entries())
    mockReq.socket  = { remoteAddress }
    if (bodyBuffer && bodyBuffer.length > 0) mockReq.push(bodyBuffer)
    mockReq.push(null) // EOF — mirrors a real IncomingMessage once Vercel has fully received the request

    // Build a minimal mock of Node's ServerResponse
    const mockRes = {
      statusCode: 200,
      _headers: {} as Record<string, string>,
      setHeader(k: string, v: string | string[]) {
        this._headers[k.toLowerCase()] = Array.isArray(v) ? v.join(', ') : v
      },
      getHeader(k: string) { return this._headers[k.toLowerCase()] },
      removeHeader(k: string) { delete this._headers[k.toLowerCase()] },
      write(chunk: Buffer | string) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)))
        return true
      },
      end(chunk?: Buffer | string) {
        if (chunk != null) {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)))
        }
        const body = Buffer.concat(chunks)
        resolve(
          new NextResponse(body.length > 0 ? body : null, {
            status: this.statusCode,
            headers: this._headers,
          })
        )
      },
      // Express uses json() and status() — keep them working
      json(data: unknown) {
        this.setHeader('content-type', 'application/json')
        this.end(JSON.stringify(data))
      },
      status(code: number) {
        this.statusCode = code
        return this
      },
      sendStatus(code: number) {
        this.statusCode = code
        this.end(String(code))
      },
      // Satisfy Express's response interface
      writableEnded: false,
      finished: false,
      headersSent: false,
      locals: {},
    }

    // Hand off to Express
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expressApp(mockReq as any, mockRes as any)
  })
}