import { type AdminTenantDetailResponse, SEATING_CHART_MAX_BYTES } from '@wym/shared'
import { Button, Card, ConfirmSheet, ja, ListCard, TextField, useToast } from '@wym/ui'
import { type FormEvent, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { CourseMenuEditor } from '../components/CourseMenuEditor'
import { Badge, LoadError, LoadingBlocks, RouterLink, Screen } from '../components/shell'
import { ApiClientError, api, seatingChartUrl } from '../lib/api'
import { messageOf } from '../lib/errors'
import {
  deletionDateLabel,
  formatBytes,
  formatCount,
  periodEndLabel,
  periodLabel,
} from '../lib/format'
import { useAsync } from '../lib/use-async'
import { fieldErrorsFrom, type TenantFormErrors, validateTenantForm } from './TenantCreate'

/** SA-04 テナント詳細・設定 */
export function TenantDetail() {
  const { tenantId = '' } = useParams()
  const { state, setState, retry } = useAsync(() => api.getTenant(tenantId), `tenant:${tenantId}`)

  if (state.status === 'loading') {
    return (
      <Screen title="" backHref="/">
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

  return (
    <Screen title={tenant.name} backHref="/">
      <section className="flex flex-col gap-2">
        <p>
          {until ? t.periodUntil({ label, until }) : t.period({ label })}{' '}
          {tenant.suspended ? <Badge tone="warn">{ja.admin.periodLabels.suspended}</Badge> : null}
        </p>
        <p className="text-sub text-warm-gray">
          {ja.admin.deletionDate({ date: deletionDateLabel(boundaries) })}
        </p>
        {locked ? null : (
          <div>
            <Button variant="secondary" onClick={() => setConfirmSuspend(true)}>
              {tenant.suspended ? t.resume : t.suspend}
            </Button>
          </div>
        )}
      </section>

      {locked ? null : (
        <>
          <BasicInfo tenantId={tenantId} detail={detail} onUpdate={onUpdate} />
          <SeatingRow tenantId={tenantId} />
          <CourseRow tenantId={tenantId} />
        </>
      )}

      <div className="flex flex-col gap-3">
        <ListCard title={t.urls} href={`/tenants/${tenantId}/urls`} LinkComponent={RouterLink} />
        <ListCard
          title={t.photos}
          href={`/tenants/${tenantId}/photos`}
          LinkComponent={RouterLink}
        />
        <ListCard
          title={t.guests}
          href={`/tenants/${tenantId}/guests`}
          LinkComponent={RouterLink}
        />
        <ListCard
          title={t.preview}
          href={`/tenants/${tenantId}/preview`}
          LinkComponent={RouterLink}
        />
      </div>

      <section className="flex flex-col gap-1">
        <h2 className="text-heading-md">{t.usage}</h2>
        <p>
          {t.usageLine({
            guests: formatCount(tenant.stats.guestCount),
            photos: formatCount(tenant.stats.photoCount),
            likes: formatCount(tenant.stats.likeCount),
            storage: formatBytes(tenant.stats.storageBytes),
          })}
        </p>
      </section>

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
    <Card className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-heading-md">{t.basic}</h2>
        {editing ? null : (
          <Button variant="text" onClick={startEdit}>
            {t.edit}
          </Button>
        )}
      </div>
      {editing ? (
        <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-3">
          <TextField
            label={t.name}
            value={name}
            onChange={(e) => setName(e.target.value)}
            error={errors.name}
          />
          <TextField
            label={t.eventDate}
            type="date"
            value={eventDate}
            onChange={(e) => setEventDate(e.target.value)}
            error={errors.eventDate}
          />
          <div className="flex gap-2">
            <Button type="submit" loading={saving}>
              {ja.admin.save}
            </Button>
            <Button variant="secondary" onClick={() => setEditing(false)} disabled={saving}>
              {ja.admin.cancel}
            </Button>
          </div>
        </form>
      ) : (
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sub">
          <dt className="text-warm-gray">{t.name}</dt>
          <dd className="break-words">{tenant.name}</dd>
          <dt className="text-warm-gray">{t.eventDate}</dt>
          <dd>{tenant.eventDate}</dd>
        </dl>
      )}
    </Card>
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
    <Card className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-heading-md">
          {t.seating}
          {registered === false ? (
            <span className="ml-2 text-sub font-normal text-warm-gray">{t.seatingNone}</span>
          ) : null}
        </h2>
        <div className="flex gap-2">
          <Button variant="secondary" loading={busy} onClick={() => input.current?.click()}>
            {registered ? t.seatingReplace : t.seatingRegister}
          </Button>
          {registered ? (
            <a
              href={seatingChartUrl(tenantId)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-control min-w-tap items-center justify-center rounded-control border border-charcoal px-6 text-body font-semibold text-charcoal"
            >
              {t.seatingCheck}
            </a>
          ) : null}
        </div>
      </div>
      <input
        ref={input}
        type="file"
        accept="application/pdf"
        className="sr-only"
        data-testid="seating-file"
        onChange={(e) => void handleFile(e.target.files?.[0])}
      />
      {fileError ? (
        <p role="alert" className="text-sub text-error">
          {fileError}
        </p>
      ) : null}
    </Card>
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
    <Card className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-heading-md">
          {t.course}
          {shown !== null ? (
            <span className="ml-2 text-sub font-normal text-warm-gray">
              {t.courseCount({ count: shown })}
            </span>
          ) : null}
        </h2>
        {state.status === 'ready' && !editing ? (
          <Button variant="text" onClick={() => setEditing(true)}>
            {t.edit}
          </Button>
        ) : null}
      </div>
      {state.status === 'error' ? <LoadError error={state.error} onRetry={retry} /> : null}
      {state.status === 'ready' && editing ? (
        <CourseMenuEditor
          tenantId={tenantId}
          initialImages={state.data.images}
          onChange={(images) => setCount(images.length)}
          onClose={() => setEditing(false)}
        />
      ) : null}
    </Card>
  )
}

/** テナントの削除（テナント名の入力を求める） */
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
    <div>
      <Button
        variant="secondary"
        className="border-error text-error"
        onClick={() => {
          setTyped('')
          setError(undefined)
          setOpen(true)
        }}
      >
        {ja.admin.detail.delete}
      </Button>
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
    </div>
  )
}
