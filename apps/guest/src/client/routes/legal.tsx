import { legal, ScreenHeader } from '@wym/ui'
import { useNavigate } from 'react-router'

// 利用規約（/terms）・プライバシーポリシー（/privacy）
export function LegalRoute({ kind }: { kind: 'terms' | 'privacy' }) {
  const navigate = useNavigate()
  const doc = legal[kind]
  // 直接開いたときは戻り先がないので、戻るボタンを出さない
  const canGoBack = window.history.length > 1

  return (
    <div>
      <ScreenHeader title={doc.title} {...(canGoBack ? { onBack: () => navigate(-1) } : {})} />
      <article className="flex flex-col gap-6 px-screen pb-8">
        <p className="text-body">{doc.intro}</p>
        {doc.sections.map((section) => (
          <section key={section.heading} className="flex flex-col gap-2">
            <h2 className="text-heading-md">{section.heading}</h2>
            {section.paragraphs.map((paragraph) => (
              <p key={paragraph} className="text-body text-charcoal">
                {paragraph}
              </p>
            ))}
          </section>
        ))}
      </article>
    </div>
  )
}
