/**
 * apps/web/tools/hills/lib/paths.mts
 *
 * [PURPOSE]: Small shared helpers for the Hills guardrail scripts: glob
 *   matching (with `!negation`), a recursive file walker and git helpers.
 *   Deliberately dependency-free.
 */

import { execFileSync } from 'node:child_process'
import { readdirSync, statSync } from 'node:fs'
import path from 'node:path'

export function globToRegExp(glob: string): RegExp {
  let re = ''
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i] as string
    if (c === '*') {
      if (glob[i + 1] === '*') {
        i++
        if (glob[i + 1] === '/') {
          i++
          re += '(?:.*/)?'
        } else re += '.*'
      } else re += '[^/]*'
    } else if (c === '?') re += '[^/]'
    else re += c.replace(/[.+^${}()|[\]\\]/g, '\\$&')
  }
  return new RegExp(`^${re}$`)
}

/** Patterns in order; a leading "!" re-includes paths an earlier pattern matched. */
export function matchesAny(file: string, patterns: readonly string[]): boolean {
  let hit = false
  for (const p of patterns) {
    if (p.startsWith('!')) {
      if (globToRegExp(p.slice(1)).test(file)) hit = false
    } else if (globToRegExp(p).test(file)) hit = true
  }
  return hit
}

export function walk(dir: string, accept: (rel: string) => boolean, root = dir): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '.next' || name.startsWith('.git')) continue
    const abs = path.join(dir, name)
    const rel = path.relative(root, abs).split(path.sep).join('/')
    if (statSync(abs).isDirectory()) out.push(...walk(abs, accept, root))
    else if (accept(rel)) out.push(rel)
  }
  return out.sort()
}

export function git(args: string[], cwd: string): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 })
}

export function gitTopLevel(cwd: string): string {
  return git(['rev-parse', '--show-toplevel'], cwd).trim()
}
