import { describe, it, expect } from 'vitest'
import { parseNumberLines } from '../ManebRegistrationPanel'

describe('parseNumberLines', () => {
  it('reads tab, comma and space separated lines', () => {
    expect(parseNumberLines('STU-001\t0123456789\nSTU-002,0123456790\nSTU-003 0123456791')).toEqual([
      { registrationNo: 'STU-001', candidateNo: '0123456789' },
      { registrationNo: 'STU-002', candidateNo: '0123456790' },
      { registrationNo: 'STU-003', candidateNo: '0123456791' },
    ])
  })

  it('skips blank lines and lines without an exam number', () => {
    expect(parseNumberLines('\n  \nSTU-001\nSTU-002 55\r\n')).toEqual([{ registrationNo: 'STU-002', candidateNo: '55' }])
  })
})
