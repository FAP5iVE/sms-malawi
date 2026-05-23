'use strict'
import { InputFile } from 'node-appwrite/file'
import * as sdk from 'node-appwrite'

export const SCHOOL_BUCKET = 'school_files' as const

// Keep STORAGE_BUCKETS for backward-compat — all values point to school_files
export const STORAGE_BUCKETS = {
  STUDENT_FILES: SCHOOL_BUCKET,
  DIGITAL_LIBRARY: SCHOOL_BUCKET,
  PAYSLIPS: SCHOOL_BUCKET,
  REPORT_CARDS: SCHOOL_BUCKET,
} as const

export type StorageBucket = typeof SCHOOL_BUCKET

function getClient(): sdk.Client {
  return new sdk.Client()
    .setEndpoint(process.env.APPWRITE_ENDPOINT!)
    .setProject(process.env.APPWRITE_PROJECT_ID!)
    .setKey(process.env.APPWRITE_API_KEY!)
}

export async function uploadFile(
  _bucket: string,
  buffer: Buffer,
  filename: string,
  mimeType: string,
  fileId?: string
): Promise<string> {
  const storage = new sdk.Storage(getClient())
  const id = fileId ?? sdk.ID.unique()
  const blob = new Blob([buffer], { type: mimeType })
  const file = await storage.createFile(
    SCHOOL_BUCKET,
    id,
    new File([blob], filename, { type: mimeType })
  )
  return file.$id
}

export async function getViewUrl(_bucket: string, fileId: string): Promise<string> {
  const storage = new sdk.Storage(getClient())
  return storage.getFileView(SCHOOL_BUCKET, fileId).toString()
}

export async function getDownloadUrl(_bucket: string, fileId: string): Promise<string> {
  const storage = new sdk.Storage(getClient())
  return storage.getFileDownload(SCHOOL_BUCKET, fileId).toString()
}

export async function deleteFile(_bucket: string, fileId: string): Promise<void> {
  const storage = new sdk.Storage(getClient())
  await storage.deleteFile(SCHOOL_BUCKET, fileId)
}

export async function getFileMetadata(_bucket: string, fileId: string) {
  const storage = new sdk.Storage(getClient())
  return storage.getFile(SCHOOL_BUCKET, fileId)
}
