import type { ErrorEvent } from '@sentry/cloudflare'
import { describe, expect, it } from 'vitest'
import { scrubEvent } from './sentry'

describe('scrubEvent（Sentry に個人情報を送らない）', () => {
  it('例外の message・breadcrumbs・ユーザー・Cookie・クエリ・ヘッダー・本文を取り除く', () => {
    const event: ErrorEvent = {
      type: undefined,
      message: 'nickname=たろう',
      exception: {
        values: [
          {
            type: 'DrizzleQueryError',
            value: 'Failed query: select ... params: join-token-secret,session-hash,たろう',
          },
        ],
      },
      breadcrumbs: [{ message: 'select ... params: secret' }],
      extra: { token: 'secret' },
      user: { ip_address: '203.0.113.1', email: 'a@example.com' },
      request: {
        url: 'https://would-you-marry.me/join/abc?t=join-token-secret',
        query_string: 't=join-token-secret',
        cookies: { wym_g_x: 'session-secret' },
        headers: { cookie: 'wym_g_x=session-secret', 'cf-connecting-ip': '203.0.113.1' },
        data: '{"passcode":"AB12CD34"}',
      },
    }
    const scrubbed = scrubEvent(event)
    const text = JSON.stringify(scrubbed)
    for (const secret of ['secret', 'たろう', '203.0.113.1', 'a@example.com', 'AB12CD34']) {
      expect(text).not.toContain(secret)
    }
    expect(scrubbed.exception?.values?.[0]?.type).toBe('DrizzleQueryError')
    expect(scrubbed.request?.url).toBe('https://would-you-marry.me/join/abc')
  })
})
