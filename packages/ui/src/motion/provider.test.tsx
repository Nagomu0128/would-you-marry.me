import { render, screen } from '@testing-library/react'
import { m } from 'motion/react'
import { describe, expect, it, vi } from 'vitest'

const configSpy = vi.hoisted(() => vi.fn())

vi.mock('motion/react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('motion/react')>()
  return {
    ...actual,
    MotionConfig: (props: Parameters<typeof actual.MotionConfig>[0]) => {
      configSpy(props.reducedMotion)
      return actual.MotionConfig(props)
    },
  }
})

import { MotionProvider, REDUCED_MOTION_MODE } from './provider'

describe('MotionProvider', () => {
  it('端末の「動きを減らす」設定に従う（reducedMotion="user"）', () => {
    render(
      <MotionProvider>
        <m.p>内容</m.p>
      </MotionProvider>,
    )
    expect(REDUCED_MOTION_MODE).toBe('user')
    expect(configSpy).toHaveBeenCalledWith('user')
    expect(screen.getByText('内容')).toBeInTheDocument()
  })
})
