import type { CoupleAccessResponse, JoinUrlResponse } from '@wym/shared'
import { Button, Card, ConfirmSheet, ja, useToast } from '@wym/ui'
import { useMemo, useState } from 'react'
import { useParams } from 'react-router'
import { LoadError, LoadingBlocks, Screen } from '../components/shell'
import { api } from '../lib/api'
import { messageOf } from '../lib/errors'
import { joinPeriodLabels } from '../lib/format'
import {
  createQrMatrix,
  downloadBlob,
  QR_QUIET_ZONE,
  type QrMatrix,
  qrFileName,
  renderQrPng,
} from '../lib/qr'
import { useAsync } from '../lib/use-async'

/** SA-05 URL の発行 */
export function JoinUrls() {
  const { tenantId = '' } = useParams()
  const { state, retry } = useAsync(async () => {
    const [join, couple] = await Promise.all([
      api.getJoinUrl(tenantId),
      api.getCoupleAccess(tenantId),
    ])
    return { join, couple }
  }, `urls:${tenantId}`)

  return (
    <Screen title={ja.admin.urls.heading} backHref={`/tenants/${tenantId}`}>
      <p className="text-sub text-muted">
        ゲストには受付のQRコードを、おふたりには専用のアルバムを。
      </p>
      {state.status === 'loading' ? <LoadingBlocks /> : null}
      {state.status === 'error' ? <LoadError error={state.error} onRetry={retry} /> : null}
      {state.status === 'ready' ? (
        <>
          <JoinSection tenantId={tenantId} initial={state.data.join} />
          <CoupleSection tenantId={tenantId} initial={state.data.couple} />
        </>
      ) : null}
    </Screen>
  )
}

function useCopy() {
  const toast = useToast()
  return async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      toast.show(ja.toasts.copied)
    } catch {
      toast.show(ja.errors.guest.INTERNAL_ERROR)
    }
  }
}

/** 画面に出す QR コード。SVG なのでどの大きさでもくっきり表示でき、余白（quiet zone）を含む */
function QrView({ matrix }: { matrix: QrMatrix }) {
  const total = matrix.size + QR_QUIET_ZONE * 2
  const path = useMemo(() => {
    const parts: string[] = []
    for (let r = 0; r < matrix.size; r++) {
      for (let c = 0; c < matrix.size; c++) {
        if (matrix.isDark(r, c)) parts.push(`M${c + QR_QUIET_ZONE} ${r + QR_QUIET_ZONE}h1v1h-1z`)
      }
    }
    return parts.join('')
  }, [matrix])
  return (
    <svg
      role="img"
      aria-label={ja.admin.urls.qrAlt}
      viewBox={`0 0 ${total} ${total}`}
      shapeRendering="crispEdges"
      className="size-64 max-w-full rounded-control border border-rule"
    >
      <rect width={total} height={total} fill="#ffffff" />
      <path d={path} fill="#000000" />
    </svg>
  )
}

function JoinSection({ tenantId, initial }: { tenantId: string; initial: JoinUrlResponse }) {
  const toast = useToast()
  const copy = useCopy()
  const [join, setJoin] = useState(initial)
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)
  const t = ja.admin.urls

  const url = join.url
  const matrix = useMemo(() => (url ? createQrMatrix(url) : null), [url])

  async function issue() {
    setBusy(true)
    try {
      setJoin(await api.issueJoinUrl(tenantId))
      toast.show(ja.toasts.saved)
    } catch (error) {
      toast.show(messageOf(error))
    } finally {
      setBusy(false)
      setConfirm(false)
    }
  }

  async function saveQr() {
    if (!matrix) return
    try {
      downloadBlob(await renderQrPng(matrix), qrFileName(tenantId))
    } catch {
      toast.show(ja.errors.guest.INTERNAL_ERROR)
    }
  }

  const reissue = ja.confirms.reissueJoinUrl
  return (
    <Card className="flex flex-col gap-3">
      <p className="eyebrow text-accent">01 / For our guests</p>
      <h2 className="font-editorial text-heading-md">{t.joinTitle}</h2>
      {join.url === null || matrix === null ? (
        <>
          <p className="text-sub text-muted">{t.joinNone}</p>
          <div>
            <Button loading={busy} onClick={() => void issue()}>
              {t.issue}
            </Button>
          </div>
        </>
      ) : (
        <>
          <div className="my-2 border border-rule bg-paper p-6 self-center">
            <QrView matrix={matrix} />
            <p className="mt-3 text-center text-caption text-muted">
              カメラで読み取って、ご参加ください
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="min-w-0 flex-1 break-all text-sub">{join.url}</p>
            <Button variant="secondary" onClick={() => void copy(join.url ?? '')}>
              {ja.admin.copy}
            </Button>
          </div>
          <p className="text-sub">
            {t.joinPeriod(joinPeriodLabels(join.joiningStart, join.joiningEnd))}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => void saveQr()}>
              {t.qrSave}
            </Button>
            <Button variant="secondary" onClick={() => setConfirm(true)}>
              {t.reissue}
            </Button>
          </div>
        </>
      )}
      <ConfirmSheet
        open={confirm}
        onClose={() => setConfirm(false)}
        onConfirm={() => void issue()}
        body={reissue.body}
        confirmLabel={reissue.confirm}
        cancelLabel={reissue.cancel}
        loading={busy}
      />
    </Card>
  )
}

function CoupleSection({ tenantId, initial }: { tenantId: string; initial: CoupleAccessResponse }) {
  const toast = useToast()
  const copy = useCopy()
  const [couple, setCouple] = useState(initial)
  // パスコードは発行した直後だけ、この画面の状態として持つ（再読み込みや画面遷移で消える）
  const [passcode, setPasscode] = useState<string | null>(null)
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)
  const t = ja.admin.urls

  async function issue() {
    setBusy(true)
    try {
      const issued = await api.issueCoupleAccess(tenantId)
      setCouple({ url: issued.url, issuedAt: issued.issuedAt, termsAgreedAt: null })
      setPasscode(issued.passcode)
      toast.show(ja.toasts.saved)
    } catch (error) {
      toast.show(messageOf(error))
    } finally {
      setBusy(false)
      setConfirm(false)
    }
  }

  const reissue = ja.confirms.reissueCoupleUrl
  const issued = couple.url !== null
  return (
    <Card className="flex flex-col gap-3">
      <p className="eyebrow text-accent">02 / For the couple</p>
      <h2 className="font-editorial text-heading-md">{t.coupleTitle}</h2>
      {couple.url === null ? (
        <p className="text-sub text-muted">{t.coupleNone}</p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <p className="min-w-0 flex-1 break-all text-sub">{couple.url}</p>
            <Button variant="secondary" onClick={() => void copy(couple.url ?? '')}>
              {ja.admin.copy}
            </Button>
          </div>
          <p className="text-sub text-muted">
            {couple.termsAgreedAt ? t.termsAgreed : t.termsNotAgreed}
          </p>
        </>
      )}
      <div>
        <Button
          variant={issued ? 'secondary' : 'primary'}
          loading={busy}
          onClick={() => (issued ? setConfirm(true) : void issue())}
        >
          {issued ? t.reissue : t.issue}
        </Button>
      </div>
      {passcode ? (
        <div className="flex flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <p>
              {t.passcode}: <span className="font-mono text-heading-md">{passcode}</span>
            </p>
            <Button variant="secondary" onClick={() => void copy(passcode)}>
              {ja.admin.copy}
            </Button>
          </div>
          <p className="text-sub text-error">※ {ja.admin.passcodeNotice}</p>
        </div>
      ) : null}
      <ConfirmSheet
        open={confirm}
        onClose={() => setConfirm(false)}
        onConfirm={() => void issue()}
        body={reissue.body}
        confirmLabel={reissue.confirm}
        cancelLabel={reissue.cancel}
        loading={busy}
      />
    </Card>
  )
}
