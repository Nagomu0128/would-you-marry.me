import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { MotionProvider } from './provider'
import { Reveal } from './Reveal'

describe('Reveal', () => {
  it('指定した要素とクラスで中身を表示する', () => {
    render(
      <MotionProvider>
        <ul>
          <Reveal as="li" className="row" delay={0.1}>
            <p>席次表</p>
          </Reveal>
        </ul>
        <Reveal as="section">
          <p>御品書き</p>
        </Reveal>
      </MotionProvider>,
    )
    const li = screen.getByText('席次表').parentElement
    expect(li?.tagName).toBe('LI')
    expect(li).toHaveClass('row')
    expect(screen.getByText('御品書き').parentElement?.tagName).toBe('SECTION')
  })
})
