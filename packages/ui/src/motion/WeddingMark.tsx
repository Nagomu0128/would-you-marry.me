import type { SVGProps } from 'react'

/**
 * One continuous ribbon, tied around two wedding bands.
 * Static SVG keeps the invitation masthead crisp without an asset request.
 */
export function WeddingMark({ className, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 180 124"
      width={180}
      height={124}
      className={['wedding-mark', className].filter(Boolean).join(' ')}
      aria-hidden="true"
      focusable="false"
      fill="none"
      {...props}
    >
      <g stroke="currentColor" strokeWidth="1.25" strokeLinecap="round">
        <path d="M78 45C53 18 28 30 42 49C51 61 76 60 90 56C104 60 129 61 138 49C152 30 127 18 102 45" />
        <path d="M82 49C66 35 49 34 48 43C47 52 65 56 82 54M98 49C114 35 131 34 132 43C133 52 115 56 98 54" />
        <path d="M83 50C84 44 96 44 97 50L96 58C93 61 87 61 84 58Z" />
        <path d="M84 58C73 70 74 91 59 105L58 91L46 93C61 80 62 65 78 57M96 58C107 70 106 91 121 105L122 91L134 93C119 80 118 65 102 57" />
        <path d="M72 60C48 72 58 105 81 101C100 98 106 76 90 66" />
        <path d="M108 60C132 72 122 105 99 101C80 98 74 76 90 66" />
        <path d="M64 15L68 22M90 9V18M116 15L112 22" opacity=".6" />
      </g>
    </svg>
  )
}
