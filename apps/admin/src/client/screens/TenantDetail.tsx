import {
  type AdminTenantDetailResponse,
  SEATING_CHART_MAX_BYTES,
  type TenantStats,
} from '@wym/shared'
import { Button, ConfirmSheet, ja, TextField, useToast } from '@wym/ui'
import { type FormEvent, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { CourseMenuEditor } from '../components/CourseMenuEditor'
import {
  EventDateLine,
  Ledger,
  LoadError,
  LoadingBlocks,
  PeriodTag,
  Screen,
} from '../components/shell'
import { ApiClientError, api, seatingChartUrl } from '../lib/api'
import { messageOf } from '../lib/errors'
import {
  deletionDateLabel,
  formatBytes,
  formatCount,
  periodEndLabel,
  periodLabel,
  periodLabelKey,
} from '../lib/format'
import { useAsync } from '../lib/use-async'
import { fieldErrorsFrom, type TenantFormErrors, validateTenantForm } from './TenantCreate'

/** SA-04 テナント詳細・設定 */
export function TenantDetail() {
  const { tenantId = '' } = useParams()
  const { state, setState, retry } = useAsync(() => api.getTenant(tenantId), `tenant:${tenantId}`)

  if (state.status === 'loading') {
    return (
      <Screen backHref="/">
        <LoadingBlocks />
      </Screen>
    )
  }
  if (state.status === 'error') {
    return (
      <Screen title="" backHref="/">
        <LoadError error={state.error} onRetry={retry} />
      </Screen>
    )
  }
  return (
    <DetailBody
      tenantId={tenantId}
      detail={state.data}
      onUpdate={(detail) => setState({ status: 'ready', data: detail })}
    />
  )
}

function DetailBody({
  tenantId,
  detail,
  onUpdate,
}: {
  tenantId: string
  detail: AdminTenantDetailResponse
  onUpdate: (detail: AdminTenantDetailResponse) => void
}) {
  const { tenant, boundaries } = detail
  const toast = useToast()
  const navigate = useNavigate()
  const t = ja.admin.detail
  const b = ja.admin.book
  const locked = tenant.dataDeletedAt !== null

  const [confirmSuspend, setConfirmSuspend] = useState(false)
  const [busy, setBusy] = useState(false)

  const until = periodEndLabel(tenant.phase, boundaries)
  const label = periodLabel({ phase: tenant.phase, suspended: false })

  async function toggleSuspended() {
    setBusy(true)
    try {
      const { tenant: updated } = await api.updateTenant(tenantId, { suspended: !tenant.suspended })
      onUpdate({ ...detail, tenant: updated })
      toast.show(ja.toasts.saved)
      setConfirmSuspend(false)
    } catch (error) {
      toast.show(messageOf(error))
      setConfirmSuspend(false)
    } finally {
      setBusy(false)
    }
  }

  const suspendTexts = tenant.suspended ? ja.confirms.resumeTenant : ja.confirms.suspendTenant
  const links = [
    { title: t.urls, path: 'urls' },
    { title: t.photos, path: 'photos' },
    { title: t.guests, path: 'guests' },
    { title: t.preview, path: 'preview' },
  ] as const

  return (
    <Screen
      title={tenant.name}
      backHref="/"
      lead={
        <>
          <EventDateLine eventDate={tenant.eventDate} />
          <PeriodTag period={periodLabelKey(tenant)}>{periodLabel(tenant)}</PeriodTag>
        </>
      }
    >
      {/* 期間と削除予定日。停止・再開はここで行う */}
      <div className="admin-status" data-suspended={tenant.suspended || undefined}>
        <div className="admin-status-text">
          <p className="admin-status-period">
            {until ? t.periodUntil({ label, until }) : t.period({ label })}
          </p>
          <p className="admin-status-deletion">
            {ja.admin.deletionDate({ date: deletionDateLabel(boundaries) })}
          </p>
        </div>
        {locked ? null : (
          <Button
            variant="secondary"
            className={tenant.suspended ? undefined : 'admin-danger'}
            onClick={() => setConfirmSuspend(true)}
          >
            {tenant.suspended ? t.resume : t.suspend}
          </Button>
        )}
      </div>

      {locked ? null : (
        <>
          <BasicInfo tenantId={tenantId} detail={detail} onUpdate={onUpdate} />
          <Ledger title={b.materials}>
            <div className="admin-rows">
              <SeatingRow tenantId={tenantId} />
              <CourseRow tenantId={tenantId} />
            </div>
          </Ledger>
        </>
      )}

      <Ledger title={b.records}>
        <ul className="admin-index">
          {links.map((link) => (
            <li key={link.path}>
              <Link to={`/tenants/${tenantId}/${link.path}`} className="admin-index-link">
                <span className="admin-index-title">{link.title}</span>
                <span className="admin-index-leader" aria-hidden="true" />
                <span className="admin-index-mark" aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>
      </Ledger>

      <Ledger title={t.usage}>
        <UsageTally stats={tenant.stats} />
      </Ledger>

      <DeleteTenant
        tenantId={tenantId}
        name={tenant.name}
        onDeleted={() => navigate('/', { replace: true })}
      />

      <ConfirmSheet
        open={confirmSuspend}
        onClose={() => setConfirmSuspend(false)}
        onConfirm={() => void toggleSuspended()}
        body={suspendTexts.body({ name: tenant.name })}
        confirmLabel={suspendTexts.confirm}
        cancelLabel={suspendTexts.cancel}
        danger={!tenant.suspended}
        loading={busy}
      />
    </Screen>
  )
}

/** 利用状況。帳面の集計欄のように、数を大きく並べる */
function UsageTally({ stats }: { stats: TenantStats }) {
  const m = ja.admin.monitor
  const items = [
    { label: m.guests, value: formatCount(stats.guestCount) },
    { label: m.photos, value: formatCount(stats.photoCount) },
    { label: m.likes, value: formatCount(stats.likeCount) },
    { label: m.storage, value: formatBytes(stats.storageBytes) },
  ]
  return (
    <dl className="admin-tally">
      {items.map((item) => (
        <div key={item.label}>
          <dt>{item.label}</dt>
          <dd>{item.value}</dd>
        </div>
      ))}
    </dl>
  )
}

/** 基本情報（テナント名・開催日）の表示と編集 */
function BasicInfo({
  tenantId,
  detail,
  onUpdate,
}: {
  tenantId: string
  detail: AdminTenantDetailResponse
  onUpdate: (detail: AdminTenantDetailResponse) => void
}) {
  const toast = useToast()
  const t = ja.admin.detail
  const { tenant } = detail
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(tenant.name)
  const [eventDate, setEventDate] = useState(tenant.eventDate)
  const [errors, setErrors] = useState<TenantFormErrors>({})
  const [saving, setSaving] = useState(false)

  function startEdit() {
    setName(tenant.name)
    setEventDate(tenant.eventDate)
    setErrors({})
    setEditing(true)
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const found = validateTenantForm(name, eventDate)
    setErrors(found)
    if (found.name || found.eventDate) return
    setSaving(true)
    try {
      // 開催日を変えると、期間の境界も変わるので詳細を読み直す
      await api.updateTenant(tenantId, { name: name.trim(), eventDate })
      onUpdate(await api.getTenant(tenantId))
      toast.show(ja.toasts.saved)
      setEditing(false)
    } catch (error) {
      if (error instanceof ApiClientError && error.code === 'VALIDATION_ERROR') {
        setErrors(fieldErrorsFrom(error))
      } else {
        toast.show(messageOf(error))
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <Ledger
      title={t.basic}
      action={
        editing ? null : (
          <Button variant="secondary" onClick={startEdit}>
            {t.edit}
          </Button>
        )
      }
    >
      {editing ? (
        <form onSubmit={handleSubmit} noValidate className="admin-form admin-form-inline">
          <TextField
            className="admin-field"
            label={t.name}
            value={name}
            onChange={(e) => setName(e.target.value)}
            error={errors.name}
          />
          <TextField
            className="admin-field admin-field-date"
            label={t.eventDate}
            type="date"
            value={eventDate}
            onChange={(e) => setEventDate(e.target.value)}
            error={errors.eventDate}
          />
          <div className="admin-form-actions">
            <Button type="submit" loading={saving}>
              {ja.admin.save}
            </Button>
            <Button variant="secondary" onClick={() => setEditing(false)} disabled={saving}>
              {ja.admin.cancel}
            </Button>
          </div>
        </form>
      ) : (
        <dl className="admin-facts">
          <div>
            <dt>{t.name}</dt>
            <dd className="admin-facts-name">{tenant.name}</dd>
          </div>
          <div>
            <dt>{t.eventDate}</dt>
            <dd>
              <EventDateLine eventDate={tenant.eventDate} />
            </dd>
          </div>
        </dl>
      )}
    </Ledger>
  )
}

/** 席次表 PDF の登録・差し替えと確認 */
function SeatingRow({ tenantId }: { tenantId: string }) {
  const toast = useToast()
  const t = ja.admin.detail
  const [registered, setRegistered] = useState<boolean | null>(null)
  const [busy, setBusy] = useState(false)
  const [fileError, setFileError] = useState<string | null>(null)
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let cancelled = false
    api.hasSeatingChart(tenantId).then(
      (v) => !cancelled && setRegistered(v),
      () => !cancelled && setRegistered(false),
    )
    return () => {
      cancelled = true
    }
  }, [tenantId])

  async function handleFile(file: File | undefined) {
    if (!file) return
    setFileError(null)
    const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
    if (!isPdf) return setFileError(t.seatingUnsupported)
    if (file.size > SEATING_CHART_MAX_BYTES) return setFileError(t.seatingTooLarge)
    setBusy(true)
    try {
      await api.putSeatingChart(tenantId, file)
      setRegistered(true)
      toast.show(ja.toasts.saved)
    } catch (error) {
      if (error instanceof ApiClientError && error.code === 'FILE_TOO_LARGE') {
        setFileError(t.seatingTooLarge)
      } else if (error instanceof ApiClientError && error.code === 'UNSUPPORTED_FILE_TYPE') {
        setFileError(t.seatingUnsupported)
      } else {
        toast.show(messageOf(error))
      }
    } finally {
      setBusy(false)
      if (input.current) input.current.value = ''
    }
  }

  return (
    <div className="admin-row">
      <h3 className="admin-row-title">{t.seating}</h3>
      {registered === null ? null : (
        <p className="admin-row-state" data-empty={registered ? undefined : true}>
          {registered ? ja.admin.book.seatingRegistered : t.seatingNone}
        </p>
      )}
      <div className="admin-row-actions">
        <Button variant="secondary" loading={busy} onClick={() => input.current?.click()}>
          {registered ? t.seatingReplace : t.seatingRegister}
        </Button>
        {registered ? (
          <a
            href={seatingChartUrl(tenantId)}
            target="_blank"
            rel="noopener noreferrer"
            className="ui-button"
            data-variant="secondary"
          >
            {t.seatingCheck}
          </a>
        ) : null}
      </div>
      <input
        ref={input}
        type="file"
        accept="application/pdf"
        hidden
        data-testid="seating-file"
        onChange={(e) => void handleFile(e.target.files?.[0])}
      />
      {fileError ? (
        <p role="alert" className="admin-row-error">
          {fileError}
        </p>
      ) : null}
    </div>
  )
}

/** コース表の画像（枚数と編集） */
function CourseRow({ tenantId }: { tenantId: string }) {
  const t = ja.admin.detail
  const { state, retry } = useAsync(() => api.getCourseMenu(tenantId), `course:${tenantId}`)
  const [editing, setEditing] = useState(false)
  const [count, setCount] = useState<number | null>(null)

  const shown = count ?? (state.status === 'ready' ? state.data.images.length : null)

  return (
    <div className="admin-row" data-editing={editing || undefined}>
      <h3 className="admin-row-title">{t.course}</h3>
      {shown !== null ? (
        <p className="admin-row-state" data-empty={shown === 0 || undefined}>
          {t.courseCount({ count: shown })}
        </p>
      ) : null}
      {state.status === 'ready' && !editing ? (
        <div className="admin-row-actions">
          <Button variant="secondary" onClick={() => setEditing(true)}>
            {t.edit}
          </Button>
        </div>
      ) : null}
      {state.status === 'error' ? (
        <div className="admin-row-wide">
          <LoadError error={state.error} onRetry={retry} />
        </div>
      ) : null}
      {state.status === 'ready' && editing ? (
        <div className="admin-row-wide">
          <CourseMenuEditor
            tenantId={tenantId}
            initialImages={state.data.images}
            onChange={(images) => setCount(images.length)}
            onClose={() => setEditing(false)}
          />
        </div>
      ) : null}
    </div>
  )
}

/** テナントの削除（テナント名の入力を求める）。取り消せない操作として、紅の罫で区切る */
function DeleteTenant({
  tenantId,
  name,
  onDeleted,
}: {
  tenantId: string
  name: string
  onDeleted: () => void
}) {
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [typed, setTyped] = useState('')
  const [error, setError] = useState<string | undefined>()
  const [busy, setBusy] = useState(false)
  const texts = ja.confirms.deleteTenant

  async function handleConfirm() {
    setBusy(true)
    setError(undefined)
    try {
      await api.deleteTenant(tenantId, typed)
      onDeleted()
    } catch (e) {
      if (e instanceof ApiClientError && e.code === 'CONFIRMATION_MISMATCH') {
        setError(ja.errors.validation.confirmationMismatch)
      } else {
        toast.show(messageOf(e))
        setOpen(false)
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <Ledger title={ja.admin.book.danger} tone="danger">
      <div>
        <Button
          variant="secondary"
          className="admin-danger"
          onClick={() => {
            setTyped('')
            setError(undefined)
            setOpen(true)
          }}
        >
          {ja.admin.detail.delete}
        </Button>
      </div>
      <ConfirmSheet
        open={open}
        onClose={() => setOpen(false)}
        onConfirm={() => void handleConfirm()}
        body={texts.body({ name })}
        confirmLabel={texts.confirm}
        cancelLabel={texts.cancel}
        danger
        loading={busy}
        confirmDisabled={typed.length === 0}
        input={{
          label: ja.admin.detail.deleteConfirmLabel,
          value: typed,
          onChange: setTyped,
          error,
        }}
      />
    </Ledger>
  )
}
