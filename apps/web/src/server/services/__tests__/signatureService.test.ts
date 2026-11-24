// @vitest-environment node
/**
 * Digital signature: what is accepted, who can change it, and that it only reaches a PDF when the school
 * allows it and the person has one.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import zlib from 'node:zlib'

const m = vi.hoisted(() => {
  const model = () => ({ findUnique: vi.fn(), upsert: vi.fn(), deleteMany: vi.fn() })
  return { prisma: { userSignature: model(), systemSettings: model() }, audit: { log: vi.fn(), logAsync: vi.fn() } }
})

vi.mock('server-only', () => ({}))
vi.mock('@/lib/prisma', () => ({ prisma: m.prisma }))
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))
vi.mock('@/server/services/auditService', () => m.audit)
vi.mock('@/server/services/schoolLogoService', () => ({ getRasterSchoolLogo: vi.fn() }))
vi.mock('@/server/services/settingsService', () => ({ getIdentitySettings: vi.fn() }))

import * as svc from '../signatureService'
import { SIGNATURE_MAX_BYTES } from '@shared/constants/signature'
import { createPdfDoc, drawSignatory, withSignature, type PdfSignatory } from '../pdfBranding'

/** A real, valid white PNG of the given size. */
function png(width: number, height: number): Buffer {
  const chunk = (type: string, data: Buffer): Buffer => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length)
    const body = Buffer.concat([Buffer.from(type), data])
    const crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32(body) >>> 0)
    return Buffer.concat([len, body, crc])
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = 0
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(width, 255)])
  const raw = Buffer.concat(Array.from({ length: height }, () => row))
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))])
}

/** The smallest header a JPEG reader needs to find the size. */
function jpegHeader(width: number, height: number): Buffer {
  const sof = Buffer.from([0xff, 0xc0, 0x00, 0x0b, 0x08, height >> 8, height & 255, width >> 8, width & 255, 0x01, 0x01, 0x11, 0x00])
  return Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00]), sof, Buffer.from([0xff, 0xd9])])
}

beforeEach(() => {
  vi.clearAllMocks()
  m.prisma.systemSettings.findUnique.mockResolvedValue(null)
})

describe('validateSignature', () => {
  it('accepts a PNG and a JPG of a signature shape', () => {
    expect(svc.validateSignature(png(400, 150))).toMatchObject({ mime: 'image/png', width: 400, height: 150 })
    expect(svc.validateSignature(jpegHeader(500, 200))).toMatchObject({ mime: 'image/jpeg', width: 500, height: 200 })
  })

  it('refuses a file that is not a PNG or JPG, whatever it is called', () => {
    expect(() => svc.validateSignature(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'))).toThrow('PNG or JPG')
    expect(() => svc.validateSignature(Buffer.from('GIF89a......................'))).toThrow('PNG or JPG')
  })

  it('refuses an image that is too big, too small, or the wrong shape', () => {
    expect(() => svc.validateSignature(Buffer.alloc(SIGNATURE_MAX_BYTES + 1, 1))).toThrow('200 KB')
    expect(() => svc.validateSignature(png(60, 20))).toThrow('too small')
    expect(() => svc.validateSignature(png(2000, 400))).toThrow('too large')
    expect(() => svc.validateSignature(png(300, 300))).toThrow('wider than it is tall')
    expect(() => svc.validateSignature(png(1500, 100))).toThrow('wider than it is tall')
  })
})

describe('owner actions', () => {
  it('saves for the signed-in user only and records it', async () => {
    m.prisma.userSignature.findUnique.mockResolvedValue({ updatedAt: new Date('2026-11-23'), sizeBytes: 100 })
    const status = await svc.saveSignature('u1', 'academic', png(400, 150))
    expect(m.prisma.userSignature.upsert.mock.calls[0]![0].where).toEqual({ uid: 'u1' })
    expect(m.audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'signature.uploaded', actorUid: 'u1' }))
    expect(status.hasSignature).toBe(true)
  })

  it('does not save a bad file', async () => {
    await expect(svc.saveSignature('u1', 'academic', Buffer.from('nope'))).rejects.toThrow('PNG or JPG')
    expect(m.prisma.userSignature.upsert).not.toHaveBeenCalled()
  })

  it('removing records only when something was removed', async () => {
    m.prisma.userSignature.deleteMany.mockResolvedValueOnce({ count: 0 })
    await svc.removeSignature('u1', 'academic')
    expect(m.audit.log).not.toHaveBeenCalled()
    m.prisma.userSignature.deleteMany.mockResolvedValueOnce({ count: 1 })
    await svc.removeSignature('u1', 'academic')
    expect(m.audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'signature.removed' }))
  })
})

describe('loadSignatureImage', () => {
  const row = { mime: 'image/png', data: png(400, 150), width: 400, height: 150 }

  it('returns the image for a person who has one and logs that it was printed', async () => {
    m.prisma.userSignature.findUnique.mockResolvedValue(row)
    const img = await svc.loadSignatureImage('u1', 'receipt')
    expect(img?.format).toBe('PNG')
    expect(img?.dataUri.startsWith('data:image/png;base64,')).toBe(true)
    expect(m.audit.logAsync).toHaveBeenCalledWith(expect.objectContaining({ action: 'signature.printed' }))
  })

  it('returns nothing when the person has none, has no uid, or the school switched it off', async () => {
    m.prisma.userSignature.findUnique.mockResolvedValue(null)
    expect(await svc.loadSignatureImage('u1', 'receipt')).toBeNull()
    expect(await svc.loadSignatureImage(null, 'receipt')).toBeNull()
    m.prisma.userSignature.findUnique.mockResolvedValue(row)
    m.prisma.systemSettings.upsert.mockResolvedValue({})
    await svc.setUsingSignatures(false, 'a1', 'admin') // clears the cache
    m.prisma.systemSettings.findUnique.mockResolvedValue({ value: false })
    expect(await svc.loadSignatureImage('u1', 'receipt')).toBeNull()
    expect(m.audit.logAsync).not.toHaveBeenCalled()
  })

  it('never fails a document: a database error leaves the line blank', async () => {
    m.prisma.systemSettings.upsert.mockResolvedValue({})
    await svc.setUsingSignatures(true, 'a1', 'admin')
    m.prisma.systemSettings.findUnique.mockResolvedValue(null)
    m.prisma.userSignature.findUnique.mockRejectedValue(new Error('db down'))
    expect(await svc.loadSignatureImage('u1', 'receipt')).toBeNull()
  })
})

describe('on the PDF', () => {
  const sig: PdfSignatory = { uid: 'u1', name: 'Mercy Banda', title: 'Class teacher', unit: null }

  it('withSignature adds the image only when the person has one', async () => {
    await svc.setUsingSignatures(true, 'a1', 'admin')
    m.prisma.userSignature.findUnique.mockResolvedValue({ mime: 'image/png', data: png(400, 150), width: 400, height: 150 })
    expect((await withSignature(sig, 'receipt'))?.signature?.format).toBe('PNG')
    m.prisma.userSignature.findUnique.mockResolvedValue(null)
    expect((await withSignature(sig, 'receipt'))?.signature).toBeUndefined()
    expect(await withSignature(null, 'receipt')).toBeNull()
    expect(await withSignature({ ...sig, uid: undefined }, 'receipt')).toEqual({ ...sig, uid: undefined })
  })

  it('drawSignatory puts the picture on the page, and nothing extra without one', async () => {
    await svc.setUsingSignatures(true, 'a1', 'admin')
    m.prisma.userSignature.findUnique.mockResolvedValue({ mime: 'image/png', data: png(400, 150), width: 400, height: 150 })
    const signed = await withSignature(sig, 'receipt')
    const render = (s: PdfSignatory): string => {
      const doc = createPdfDoc()
      drawSignatory(doc, { x: 15, y: 100, w: 72, sig: s, org: 'Chikangawa Hills Academy', space: 14 })
      return Buffer.from(doc.output('arraybuffer')).toString('latin1')
    }
    expect(render(signed!)).toContain('/Subtype /Image')
    expect(render(sig)).not.toContain('/Subtype /Image')
  })
})
