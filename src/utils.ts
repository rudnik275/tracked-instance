/**
 * Recursively makes all properties of T optional.
 * Arrays use element-level DeepPartial rather than making the array itself optional,
 * which allows sparse array diffs (e.g. only index 2 changed).
 */
export type DeepPartial<Value> = Value extends object
  ? Value extends Array<infer ArrayValue>
    ? Array<DeepPartial<ArrayValue>>
    : { [Property in keyof Value]?: DeepPartial<Value[Property]> }
  : Value

/**
 * Returns true only for plain objects — intentionally excludes Array, Date, File, Map,
 * and Set so they are treated as atomic leaf values rather than being traversed.
 */
export const isObject = (value: unknown) =>
  typeof value === 'object' &&
  value !== null &&
  !Array.isArray(value) &&
  !(value instanceof Date) &&
  !(value instanceof File) &&
  !(value instanceof Map) &&
  !(value instanceof Set)

/**
 * Deep-clones a value while preserving special types:
 * - Date → new Date instance with the same timestamp
 * - File → same reference (Files are immutable browser objects and cannot be meaningfully cloned)
 * - Map / Set / other class instances → same reference (treated as atomic by isObject)
 * Plain objects and arrays are recursively cloned.
 */
export const cloneDeep = <Value>(value: Value): Value => {
  if (value === null || typeof value !== 'object') return value
  if (value instanceof Date) return new Date(value.getTime()) as unknown as Value
  if (Array.isArray(value)) return (value as any[]).map(cloneDeep) as unknown as Value
  const proto = Object.getPrototypeOf(value)
  if (proto !== Object.prototype && proto !== null) return value
  const out: Record<string, any> = {}
  for (const key of Object.keys(value)) out[key] = cloneDeep((value as any)[key])
  return out as Value
}