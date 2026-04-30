export function getAtPath(obj: any, path: string[]): unknown {
  let cur: any = obj
  for (const key of path) {
    if (cur == null) return undefined
    cur = cur[key]
  }
  return cur
}

const hasOwn = (obj: object, key: string) => Object.prototype.hasOwnProperty.call(obj, key)

export function hasAtPath(obj: any, path: string[]): boolean {
  if (path.length === 0) return obj !== undefined
  let cur: any = obj
  for (let i = 0; i < path.length - 1; i++) {
    if (cur == null || typeof cur !== 'object' || !hasOwn(cur, path[i])) return false
    cur = cur[path[i]]
  }
  return cur != null && typeof cur === 'object' && hasOwn(cur, path[path.length - 1]!)
}

const isIntegerKey = (key: string) => /^(?:0|[1-9]\d*)$/.test(key)

export function setAtPath(obj: Record<string, any>, path: string[], value: unknown): void {
  if (path.length === 0) return
  let target: any = obj
  for (let i = 0; i < path.length - 1; i++) {
    const key = path[i]
    const existing = target[key]
    if (existing == null || typeof existing !== 'object') {
      target[key] = isIntegerKey(path[i + 1]!) ? [] : {}
    }
    target = target[key]
  }
  target[path[path.length - 1]!] = value
}

export function unsetAtPath(obj: any, path: string[]): boolean {
  if (path.length === 0) return false
  let cur: any = obj
  for (let i = 0; i < path.length - 1; i++) {
    if (cur == null || typeof cur !== 'object') return true
    cur = cur[path[i]]
  }
  if (cur == null || typeof cur !== 'object') return true
  return delete cur[path[path.length - 1]!]
}
