/**
 * apps/web/src/lib/feedback.ts
 *
 * [CHANGE TYPE]: NEW FILE
 * [PURPOSE]: ONE place that decides what a user is told when an action they
 *   triggered (Save, Delete, Finalize, Approve ...) starts, succeeds or
 *   fails. Before this, most buttons did their work silently: a failed save
 *   looked identical to a successful one, and a click that was rejected by
 *   the server (a validation error, a permission error, a dropped
 *   connection) produced no visible change at all.
 *
 *   Two entry points:
 *
 *   1. Mutations (useMutation) are covered AUTOMATICALLY by the MutationCache
 *      in QueryProvider.tsx - every failed mutation shows an error toast, and
 *      a mutation that carries `meta: { successMessage }` shows a success
 *      toast. Nothing to call from a component. Hooks tune it with:
 *         meta.successMessage  - success toast text
 *         meta.failureTitle    - error toast headline (the reason is shown
 *                                beneath it)
 *         meta.feedback        - 'manual' = the caller owns the messaging;
 *                                the global toasts stay out of the way
 *
 *   2. Everything else (a Save button that calls apiFetch directly, a file
 *      download, a bulk step) uses runWithFeedback() below, which gives the
 *      same loading -> success | failure toast sequence.
 */
import { toast } from 'sonner'
import { ApiError } from '@/lib/api-client'

const GENERIC_FAILURE = 'Something went wrong. Please try again.'

/** A message a person can act on, from whatever was thrown. */
export function getErrorMessage(err: unknown, fallback: string = GENERIC_FAILURE): string {
  if (err instanceof ApiError || err instanceof Error) {
    const msg = err.message?.trim()
    if (msg) return msg
  }
  if (typeof err === 'string' && err.trim()) return err
  return fallback
}

export function notifySuccess(message: string, description?: string): void {
  toast.success(message, description ? { description } : undefined)
}

/** `title` says what failed; the reason (from `err`) goes beneath it. */
export function notifyError(title: string, err?: unknown): void {
  if (err === undefined) {
    toast.error(title)
    return
  }
  toast.error(title, { description: getErrorMessage(err) })
}

export interface FeedbackOptions<T> {
  /** Shown as a spinner toast while the action runs. Omit for instant actions. */
  loading?: string
  /** Success text; may use the result. Omit to stay quiet on success. */
  success?: string | ((result: T) => string)
  /** Headline of the failure toast - the reason is appended beneath it. */
  failure: string
}

/**
 * Runs `action`, telling the user it is working, then that it worked or why it
 * did not. Resolves to the action's result, or `undefined` if it failed (the
 * failure has already been shown - callers only need to react to success).
 *
 * @example
 *   const saved = await runWithFeedback(
 *     () => apiFetch('/settings/exam', { method: 'PUT', body: JSON.stringify(v) }),
 *     { loading: 'Saving…', success: 'Settings saved', failure: 'Could not save settings' },
 *   )
 *   if (saved) setDirty(false)
 */
export async function runWithFeedback<T>(
  action: () => Promise<T>,
  opts: FeedbackOptions<T>,
): Promise<T | undefined> {
  const id = opts.loading ? toast.loading(opts.loading) : undefined
  try {
    const result = await action()
    const message = typeof opts.success === 'function' ? opts.success(result) : opts.success
    if (message) toast.success(message, { id })
    else if (id !== undefined) toast.dismiss(id)
    return result
  } catch (err) {
    toast.error(opts.failure, { id, description: getErrorMessage(err) })
    return undefined
  }
}
