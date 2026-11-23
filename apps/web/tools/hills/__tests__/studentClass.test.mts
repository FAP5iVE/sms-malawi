import test from 'node:test'
import assert from 'node:assert/strict'
import { studentClassName, studentClassLabel, studentStream, studentClassWithStream } from '../../../src/lib/hills/studentClass.js'

test('reads the flat className the endpoints return', () => {
  assert.equal(studentClassName({ className: 'Form 3 B', classForm: 3 }), 'Form 3 B')
})
test('still reads a nested class object', () => {
  assert.equal(studentClassName({ class: { name: 'Form 1 A' } }), 'Form 1 A')
})
test('no class gives null and the fallback', () => {
  assert.equal(studentClassName({ className: null }), null)
  assert.equal(studentClassName(undefined), null)
  assert.equal(studentClassLabel({ className: '  ' }), 'No class yet')
  assert.equal(studentClassLabel(null, 'Unassigned'), 'Unassigned')
})
test('stream shows only when the form has more than one stream', () => {
  assert.equal(studentStream({ classStream: 'B', classStreamCount: 2 }), 'B')
  assert.equal(studentStream({ classStream: 'A', classStreamCount: 1 }), null)
  assert.equal(studentStream({ classStream: '', classStreamCount: 3 }), null)
  assert.equal(studentStream({ classStream: 'C' }), 'C')
})
test('class with stream: no double letter, no stream for a single-stream form', () => {
  assert.equal(studentClassWithStream({ className: 'Form 3 B', classStream: 'B', classStreamCount: 2 }), 'Form 3 B')
  assert.equal(studentClassWithStream({ className: 'Form 3', classStream: 'B', classStreamCount: 2 }), 'Form 3 B')
  assert.equal(studentClassWithStream({ className: 'Form 3', classStream: 'A', classStreamCount: 1 }), 'Form 3')
  assert.equal(studentClassWithStream({ className: null }), null)
})
