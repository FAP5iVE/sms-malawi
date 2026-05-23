import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockCreateFile = vi.fn().mockResolvedValue({ $id: 'mock-file-id-123' })
const mockGetFileView = vi
  .fn()
  .mockReturnValue(
    new URL(
      'https://fra.cloud.appwrite.io/v1/storage/buckets/school_files/files/mock-file-id-123/view'
    )
  )
const mockGetFileDownload = vi
  .fn()
  .mockReturnValue(
    new URL(
      'https://fra.cloud.appwrite.io/v1/storage/buckets/school_files/files/mock-file-id-123/download'
    )
  )
const mockDeleteFile = vi.fn().mockResolvedValue(undefined)
const mockGetFile = vi.fn().mockResolvedValue({ $id: 'mock-file-id-123' })

const mockSetEndpoint = vi.fn()
const mockSetProject = vi.fn()
const mockSetKey = vi.fn()

vi.mock('node-appwrite', () => {
  function Client(this: any) {
    this.setEndpoint = mockSetEndpoint.mockReturnValue(this)
    this.setProject = mockSetProject.mockReturnValue(this)
    this.setKey = mockSetKey.mockReturnValue(this)
  }

  function Storage(this: any, _client: any) {
    this.createFile = mockCreateFile
    this.getFileView = mockGetFileView
    this.getFileDownload = mockGetFileDownload
    this.deleteFile = mockDeleteFile
    this.getFile = mockGetFile
  }

  return {
    Client,
    Storage,
    ID: { unique: vi.fn().mockReturnValue('mock-file-id-123') },
  }
})

vi.mock('node-appwrite/file', () => ({
  InputFile: {
    fromBuffer: vi.fn().mockReturnValue('mock-input-file'),
  },
}))

import { uploadFile, getViewUrl, deleteFile, SCHOOL_BUCKET } from '../lib/storage'

beforeEach(() => {
  vi.clearAllMocks()
  process.env.APPWRITE_ENDPOINT = 'https://fra.cloud.appwrite.io/v1'
  process.env.APPWRITE_PROJECT_ID = 'test-project-id'
  process.env.APPWRITE_API_KEY = 'test-api-key'
})

describe('Appwrite Storage — single bucket smoke test', () => {
  it('uploads to school_files and returns a fileId', async () => {
    const buffer = Buffer.from('test file content')
    const fileId = await uploadFile(SCHOOL_BUCKET, buffer, 'test.txt', 'text/plain')

    expect(typeof fileId).toBe('string')
    expect(fileId.length).toBeGreaterThan(0)
    expect(fileId).toBe('mock-file-id-123')

    const url = await getViewUrl(SCHOOL_BUCKET, fileId)
    expect(url).toContain('appwrite')

    await deleteFile(SCHOOL_BUCKET, fileId)
  })

  it('returns a view URL containing the fileId', async () => {
    mockGetFileView.mockReturnValue(
      new URL(
        'https://fra.cloud.appwrite.io/v1/storage/buckets/school_files/files/mock-file-id-123/view'
      )
    )
    const url = await getViewUrl(SCHOOL_BUCKET, 'mock-file-id-123')
    expect(url).toContain('appwrite')
    expect(url).toContain('mock-file-id-123')
  })

  it('deleteFile resolves without throwing', async () => {
    await expect(deleteFile(SCHOOL_BUCKET, 'mock-file-id-123')).resolves.toBeUndefined()
  })
})
