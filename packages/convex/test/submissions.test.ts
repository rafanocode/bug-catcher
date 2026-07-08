import { convexTest } from 'convex-test'
import { describe, expect, it } from 'vitest'
import schema from '../src/schema'
import { internal } from '../src/_generated/api'

const modules = import.meta.glob('../src/**/*.ts')

describe('submissions.insert', () => {
  it('inserts a submission with linearStatus pending', async () => {
    const t = convexTest(schema, modules)

    const storageId = await t.run(async (ctx) => {
      return await ctx.storage.store(new Blob(['fake-png-bytes']))
    })

    const submissionId = await t.mutation(internal.submissions.insert, {
      tokenIdentifier: 'user|123',
      url: 'https://app.example.com',
      userAgent: 'test-agent',
      description: 'it crashed',
      consoleEntries: [],
      screenshotId: storageId,
    })

    const stored = await t.run(async (ctx) => await ctx.db.get(submissionId))
    expect(stored?.linearStatus).toBe('pending')
    expect(stored?.description).toBe('it crashed')
  })
})

describe('submissions.updateLinearStatus', () => {
  it('updates linearStatus, linearIssueUrl, and linearError on an existing submission', async () => {
    const t = convexTest(schema, modules)

    const storageId = await t.run(async (ctx) => await ctx.storage.store(new Blob(['x'])))
    const submissionId = await t.mutation(internal.submissions.insert, {
      tokenIdentifier: 'user|123',
      url: 'https://app.example.com',
      userAgent: 'test-agent',
      description: 'it crashed',
      consoleEntries: [],
      screenshotId: storageId,
    })

    await t.mutation(internal.submissions.updateLinearStatus, {
      submissionId,
      linearStatus: 'failed',
      linearError: 'Invalid teamId',
    })

    const stored = await t.run(async (ctx) => await ctx.db.get(submissionId))
    expect(stored?.linearStatus).toBe('failed')
    expect(stored?.linearError).toBe('Invalid teamId')
    expect(stored?.linearIssueUrl).toBeUndefined()
  })
})
