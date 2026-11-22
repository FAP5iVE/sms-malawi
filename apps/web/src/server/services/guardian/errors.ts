/**
 * Errors the guardian services throw. `status` is read by sendError / the global
 * error handler; `code` is a stable machine-readable reason for the UI and tests.
 * Messages are safe to show to staff. The PARENT-facing code never echoes `code`
 * or `message` from these (see parent routes): a guardian only ever sees a generic reply.
 */
export class GuardianError extends Error {
  readonly status: number
  readonly code: string
  readonly problems?: { code: string; message: string }[]
  constructor(status: number, code: string, message: string, problems?: { code: string; message: string }[]) {
    super(message)
    this.name = 'GuardianError'
    this.status = status
    this.code = code
    if (problems) this.problems = problems
  }
}

export const notFound = (what: string) => new GuardianError(404, 'NOT_FOUND', `${what} not found.`)
export const conflict = (code: string, message: string) => new GuardianError(409, code, message)
export const forbidden = (message = 'You do not have permission to do that.') => new GuardianError(403, 'FORBIDDEN', message)
export const unprocessable = (code: string, message: string, problems?: { code: string; message: string }[]) =>
  new GuardianError(422, code, message, problems)
