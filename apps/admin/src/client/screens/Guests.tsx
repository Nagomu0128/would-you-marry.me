import { type AdminGuest, validateNickname } from '@wym/shared'
import { Button, ConfirmSheet, ja, useToast } from '@wym/ui'
import { useState } from 'react'
import { useParams } from 'react-router'
import { AdminEmpty, LoadError, LoadingBlocks, Screen } from '../components/shell'
import { ApiClientError, api } from '../lib/api'
import { messageOf } from '../lib/errors'
import { useAsync } from '../lib/use-async'

/** SA-09 参加者管理 */
export function Guests() {
  const { tenantId = '' } = useParams()
  const toast = useToast()
  const { state, retry, refresh } = useAsync(() => api.listGuests(tenantId), `guests:${tenantId}`)
  const [editing, setEditing] = useState<AdminGuest | null>(null)
  const [value, setValue] = useState('')
  const [error, setError] = useState<string | undefined>()
  const [busy, setBusy] = useState(false)

  // 文字数は参加者と同じ規則（`validateNickname`、書記素単位）で数える
  const validation = validateNickname(value)
  const lengthError =
    !validation.ok && validation.field === 'TOO_LONG'
      ? ja.errors.validation.nicknameTooLong
      : undefined

  function open(guest: AdminGuest) {
    setEditing(guest)
    setValue(guest.nickname ?? '')
    setError(undefined)
  }

  async function submit() {
    if (!editing) return
    if (!validation.ok) {
      setError(
        validation.field === 'TOO_LONG'
          ? ja.errors.validation.nicknameTooLong
          : ja.errors.validation.nicknameEmpty,
      )
      return
    }
    setBusy(true)
    setError(undefined)
    try {
      await api.updateGuest(tenantId, editing.id, { nickname: validation.value })
      toast.show(ja.toasts.saved)
      setEditing(null)
      refresh()
    } catch (e) {
      if (e instanceof ApiClientError && e.code === 'NICKNAME_TAKEN') {
        setError(ja.errors.guest.NICKNAME_TAKEN)
      } else if (e instanceof ApiClientError && e.code === 'VALIDATION_ERROR') {
        setError(
          e.fields?.nickname === 'TOO_LONG'
            ? ja.errors.validation.nicknameTooLong
            : ja.errors.validation.nicknameEmpty,
        )
      } else {
        toast.show(messageOf(e))
        setEditing(null)
      }
    } finally {
      setBusy(false)
    }
  }

  // ニックネーム登録済みの人だけが一覧に出る（未登録は API が返さない）
  const guests =
    state.status === 'ready' ? state.data.guests.filter((g) => g.nickname !== null) : []

  return (
    <Screen title={ja.admin.detail.guests} backHref={`/tenants/${tenantId}`}>
      {state.status === 'loading' ? <LoadingBlocks /> : null}
      {state.status === 'error' ? <LoadError error={state.error} onRetry={retry} /> : null}
      {state.status === 'ready' && guests.length === 0 ? (
        <AdminEmpty message={ja.admin.guests.empty} />
      ) : null}
      {state.status === 'ready' && guests.length > 0 ? (
        // 芳名帳のように、記帳の順に番号を振って名前を並べる
        <ol className="admin-guests">
          {guests.map((guest, index) => (
            <li key={guest.id} className="admin-guest">
              <span className="admin-guest-no" aria-hidden="true">
                {index + 1}
              </span>
              <p id={`guest-${guest.id}`} className="admin-guest-name">
                {guest.nickname}
              </p>
              <p className="admin-guest-count">
                {ja.admin.guests.photoCount({ count: guest.photoCount })}
              </p>
              <Button
                variant="secondary"
                className="admin-guest-change"
                aria-describedby={`guest-${guest.id}`}
                onClick={() => open(guest)}
              >
                {ja.guest.home.change}
              </Button>
            </li>
          ))}
        </ol>
      ) : null}

      <ConfirmSheet
        open={editing !== null}
        onClose={() => setEditing(null)}
        onConfirm={() => void submit()}
        body={ja.admin.guests.changeBody({ nickname: editing?.nickname ?? '' })}
        confirmLabel={ja.guest.nickname.changeSubmit}
        cancelLabel={ja.admin.cancel}
        loading={busy}
        input={{
          label: ja.admin.guests.nicknameLabel,
          value,
          onChange: (next) => {
            setValue(next)
            setError(undefined)
          },
          error: error ?? lengthError,
        }}
      />
    </Screen>
  )
}
