import { isValidEventDate, TENANT_NAME_MAX_LENGTH } from '@wym/shared'
import { Button, ja, TextField, useToast } from '@wym/ui'
import { type FormEvent, useState } from 'react'
import { useNavigate } from 'react-router'
import { Screen } from '../components/shell'
import { ApiClientError, api } from '../lib/api'
import { messageOf } from '../lib/errors'

export type TenantFormErrors = { name?: string; eventDate?: string }

/** テナント名（1〜50 文字）と開催日を検証する。SA-03 と SA-04 の編集で共通 */
export function validateTenantForm(name: string, eventDate: string): TenantFormErrors {
  const errors: TenantFormErrors = {}
  const length = Array.from(name.trim()).length
  if (length < 1 || length > TENANT_NAME_MAX_LENGTH) {
    errors.name = ja.errors.validation.tenantName
  }
  if (!isValidEventDate(eventDate)) errors.eventDate = ja.errors.validation.eventDate
  return errors
}

/** サーバーの `VALIDATION_ERROR`（fields）を、項目の下の文言にする */
export function fieldErrorsFrom(error: ApiClientError): TenantFormErrors {
  const out: TenantFormErrors = {}
  if (error.fields?.name) out.name = ja.errors.validation.tenantName
  if (error.fields?.eventDate) out.eventDate = ja.errors.validation.eventDate
  return out
}

/** SA-03 テナント作成 */
export function TenantCreate() {
  const navigate = useNavigate()
  const toast = useToast()
  const [name, setName] = useState('')
  const [eventDate, setEventDate] = useState('')
  const [errors, setErrors] = useState<TenantFormErrors>({})
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const found = validateTenantForm(name, eventDate)
    setErrors(found)
    if (found.name || found.eventDate) return
    setSubmitting(true)
    try {
      const { tenant } = await api.createTenant({ name: name.trim(), eventDate })
      navigate(`/tenants/${tenant.id}`)
    } catch (error) {
      if (error instanceof ApiClientError && error.code === 'VALIDATION_ERROR') {
        setErrors(fieldErrorsFrom(error))
      } else {
        toast.show(messageOf(error))
      }
      setSubmitting(false)
    }
  }

  return (
    <Screen title={ja.admin.create.heading} backHref="/">
      <p className="text-sub text-muted">特別な一日のために、新しいページを用意しましょう。</p>
      <form onSubmit={handleSubmit} noValidate className="admin-form">
        <TextField
          label={ja.admin.create.name}
          value={name}
          onChange={(e) => setName(e.target.value)}
          error={errors.name}
          count={Array.from(name).length}
          max={TENANT_NAME_MAX_LENGTH}
        />
        <TextField
          label={ja.admin.create.eventDate}
          type="date"
          value={eventDate}
          onChange={(e) => setEventDate(e.target.value)}
          error={errors.eventDate}
        />
        <Button type="submit" fullWidth loading={submitting}>
          {ja.admin.create.submit}
        </Button>
      </form>
    </Screen>
  )
}
