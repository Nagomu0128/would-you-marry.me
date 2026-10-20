import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Heart } from 'lucide-react'
import { m } from 'motion/react'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import { ja } from './messages/ja'

function Counter() {
  const [count, setCount] = useState(0)
  return (
    <m.button type="button" onClick={() => setCount((c) => c + 1)}>
      <Heart aria-hidden="true" />
      <span data-testid="count">{count}</span>
    </m.button>
  )
}

describe('ui のスモークテスト', () => {
  it('コンポーネントを描画して操作できる', async () => {
    const user = userEvent.setup()
    render(<Counter />)
    expect(screen.getByTestId('count')).toHaveTextContent('0')
    await user.click(screen.getByRole('button'))
    expect(screen.getByTestId('count')).toHaveTextContent('1')
  })

  it('文言ファイルを読み込める', () => {
    expect(ja).toBeTypeOf('object')
  })
})
