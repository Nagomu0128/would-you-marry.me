import { legal, ScreenHeader } from '@wym/ui'
import { useNavigate } from 'react-router'

// 利用規約（/terms）・プライバシーポリシー（/privacy）。同じ紙の上で静かに読める文書
export function LegalRoute({ kind }: { kind: 'terms' | 'privacy' }) {
  const navigate = useNavigate()
  const doc = legal[kind]
  // 直接開いたときは戻り先がないので、戻るボタンを出さない
  const canGoBack = window.history.length > 1

  return (
    <div>
      <ScreenHeader title={doc.title} {...(canGoBack ? { onBack: () => navigate(-1) } : {})} />
      <article className="legal-copy">
        <p className="legal-intro">{doc.intro}</p>
        {doc.sections.map((section) => (
          <section key={section.heading} className="legal-section">
            <h2>{section.heading}</h2>
            {section.paragraphs.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
          </section>
        ))}
      </article>
    </div>
  )
}
