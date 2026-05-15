/**
 * Phase 66 Plan 03 — STORAGE-05: Unit tests for createS3StorageProvider.
 *
 * Verifies command shape for each StorageProvider method against an
 * aws-sdk-client-mock-stubbed S3Client. The same provider runs against
 * MinIO (local smoke), Hetzner Object Storage (target — see
 * docs/STORAGE-MIGRATION.md), or AWS S3 — only env var differences.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { mockClient } from 'aws-sdk-client-mock'
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
} from '@aws-sdk/client-s3'

/**
 * Minimal stand-in for the SDK's stream Body — only the
 * `transformToByteArray()` method is exercised by createS3StorageProvider.
 */
function bodyOf(text: string) {
  const bytes = new TextEncoder().encode(text)
  return {
    transformToByteArray: async () => bytes,
  }
}

import { createS3StorageProvider } from '@/lib/storage/s3-provider'

const s3Mock = mockClient(S3Client)

const config = {
  endpoint: 'http://localhost:9000',
  region: 'us-east-1',
  accessKeyId: 'minioadmin',
  secretAccessKey: 'minioadmin',
  forcePathStyle: true,
}

beforeEach(() => {
  s3Mock.reset()
})

describe('createS3StorageProvider', () => {
  describe('upload', () => {
    it('sends PutObjectCommand with Bucket, Key, Body, ContentType', async () => {
      s3Mock.on(PutObjectCommand).resolves({})
      const storage = createS3StorageProvider(config)

      await storage.upload(
        'photos',
        'co1/photos/123-shot.jpg',
        Buffer.from('hi'),
        { contentType: 'image/jpeg' },
      )

      const calls = s3Mock.commandCalls(PutObjectCommand)
      expect(calls).toHaveLength(1)
      expect(calls[0].args[0].input).toMatchObject({
        Bucket: 'photos',
        Key: 'co1/photos/123-shot.jpg',
        ContentType: 'image/jpeg',
      })
    })

    it('returns { path } matching the requested key', async () => {
      s3Mock.on(PutObjectCommand).resolves({})
      const storage = createS3StorageProvider(config)

      const result = await storage.upload(
        'photos',
        'co1/photos/abc.jpg',
        Buffer.from('x'),
      )

      expect(result).toEqual({ path: 'co1/photos/abc.jpg' })
    })

    it('throws Error when S3Client rejects', async () => {
      s3Mock.on(PutObjectCommand).rejects(new Error('access denied'))
      const storage = createS3StorageProvider(config)

      await expect(
        storage.upload('photos', 'k', Buffer.from('x')),
      ).rejects.toThrow(/access denied/)
    })

    it('normalizes Blob bodies into bytes before sending PutObjectCommand', async () => {
      s3Mock.on(PutObjectCommand).resolves({})
      const storage = createS3StorageProvider(config)
      const blob = new Blob(['hello'], { type: 'text/plain' })

      await storage.upload('pdfs', 'k.txt', blob, { contentType: 'text/plain' })

      const calls = s3Mock.commandCalls(PutObjectCommand)
      expect(calls).toHaveLength(1)
      // Body must be present (normalized to bytes); we don't constrain exact instance type
      expect(calls[0].args[0].input.Body).toBeDefined()
    })
  })

  describe('download', () => {
    it('sends GetObjectCommand and returns a Blob from response Body', async () => {
      s3Mock.on(GetObjectCommand).resolves({ Body: bodyOf('hello-content') as never })
      const storage = createS3StorageProvider(config)

      const blob = await storage.download('audio', 'co/audio/r.webm')

      expect(blob).toBeInstanceOf(Blob)
      const text = await blob.text()
      expect(text).toBe('hello-content')
      const calls = s3Mock.commandCalls(GetObjectCommand)
      expect(calls[0].args[0].input).toMatchObject({
        Bucket: 'audio',
        Key: 'co/audio/r.webm',
      })
    })

    it('throws when response has no Body', async () => {
      s3Mock.on(GetObjectCommand).resolves({})
      const storage = createS3StorageProvider(config)

      await expect(storage.download('audio', 'missing')).rejects.toThrow(
        /S3 download empty/,
      )
    })
  })

  describe('getSignedUrl', () => {
    it('returns a presigned URL string for a positive expiresInSeconds', async () => {
      const storage = createS3StorageProvider(config)

      const url = await storage.getSignedUrl('pdfs', 'co/whatsapp-pdf/1.pdf', 60)

      expect(typeof url).toBe('string')
      expect(url).toMatch(/^http/)
      expect(url).toContain('pdfs')
      // Presigned URLs encode the requested expiry
      expect(url).toMatch(/X-Amz-Expires=60/)
    })

    it('throws when expiresInSeconds is missing or <= 0 (STORAGE-04)', async () => {
      const storage = createS3StorageProvider(config)

      await expect(
        storage.getSignedUrl('pdfs', 'k', 0),
      ).rejects.toThrow(/expiresInSeconds/)

      await expect(
        storage.getSignedUrl('pdfs', 'k', -1),
      ).rejects.toThrow(/expiresInSeconds/)

      await expect(
        // intentional missing arg — verifies runtime guard, not just types
        (storage as unknown as {
          getSignedUrl: (b: string, p: string) => Promise<string>
        }).getSignedUrl('pdfs', 'k'),
      ).rejects.toThrow(/expiresInSeconds/)
    })
  })

  describe('getPublicUrl', () => {
    it('returns `${endpoint}/${bucket}/${path}` (path-style, unsigned)', () => {
      const storage = createS3StorageProvider(config)

      expect(storage.getPublicUrl('logos', 'co/logo/1-logo.png')).toBe(
        'http://localhost:9000/logos/co/logo/1-logo.png',
      )
    })

    it('uses publicUrlBase when supplied (e.g. CDN host)', () => {
      const storage = createS3StorageProvider({
        ...config,
        publicUrlBase: 'https://cdn.example.com',
      })

      expect(storage.getPublicUrl('logos', 'a.png')).toBe(
        'https://cdn.example.com/logos/a.png',
      )
    })

    it('strips a single trailing slash from publicUrlBase', () => {
      const storage = createS3StorageProvider({
        ...config,
        publicUrlBase: 'https://cdn.example.com/',
      })

      expect(storage.getPublicUrl('logos', 'a.png')).toBe(
        'https://cdn.example.com/logos/a.png',
      )
    })
  })

  describe('delete', () => {
    it('sends DeleteObjectCommand with Bucket + Key', async () => {
      s3Mock.on(DeleteObjectCommand).resolves({})
      const storage = createS3StorageProvider(config)

      await storage.delete('photos', 'co/photos/1-a.jpg')

      const calls = s3Mock.commandCalls(DeleteObjectCommand)
      expect(calls).toHaveLength(1)
      expect(calls[0].args[0].input).toMatchObject({
        Bucket: 'photos',
        Key: 'co/photos/1-a.jpg',
      })
    })

    it('propagates errors from S3Client', async () => {
      s3Mock.on(DeleteObjectCommand).rejects(new Error('forbidden'))
      const storage = createS3StorageProvider(config)

      await expect(storage.delete('photos', 'k')).rejects.toThrow(/forbidden/)
    })
  })

  describe('list', () => {
    it('sends ListObjectsV2Command and maps Contents → ListedObject[]', async () => {
      s3Mock.on(ListObjectsV2Command).resolves({
        Contents: [
          {
            Key: 'co/photos/a.jpg',
            Size: 100,
            LastModified: new Date('2026-01-01T00:00:00Z'),
          },
          { Key: 'co/photos/b.jpg' },
        ],
      })
      const storage = createS3StorageProvider(config)

      const items = await storage.list('photos', 'co/photos/')

      const calls = s3Mock.commandCalls(ListObjectsV2Command)
      expect(calls[0].args[0].input).toMatchObject({
        Bucket: 'photos',
        Prefix: 'co/photos/',
      })
      expect(items).toEqual([
        {
          name: 'co/photos/a.jpg',
          size: 100,
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
        { name: 'co/photos/b.jpg', size: undefined, updatedAt: undefined },
      ])
    })

    it('returns empty array when Contents is undefined', async () => {
      s3Mock.on(ListObjectsV2Command).resolves({})
      const storage = createS3StorageProvider(config)

      const items = await storage.list('photos')

      expect(items).toEqual([])
    })
  })
})
