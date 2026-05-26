import { type NextRequest, NextResponse } from 'next/server'
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

    // Build a minimal mock of Node's IncomingMessage
    const mockReq = {
      method: req.method,
      url: path + (url.search || ''),
      headers: Object.fromEntries(req.headers.entries()),
      socket: { remoteAddress: '127.0.0.1' },
      // Make it readable-stream compatible
      _readableState: { objectMode: false },
      readable: true,
      on: function(event: string, listener: (...args: unknown[]) => void) {
        if (event === 'data' && bodyBuffer) {
          // Emit body data synchronously — Express reads it immediately
          Promise.resolve().then(() => listener(bodyBuffer!))
        }
        if (event === 'end') {
          Promise.resolve().then(() => {
            if (bodyBuffer) listener()
            else listener()
          })
        }
        return this
      },
      removeListener: function() { return this },
      pipe: function() { return this },
      resume: function() { return this },
      destroy: function() {},
    }

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