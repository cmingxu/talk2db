// Polyfills for Chrome 90 (released April 2021) compatibility.
// Chrome 90 supports ES modules and most modern JS, but these APIs were
// added later. Dependencies (React 19, etc.) may use them at runtime.

// ---------------------------------------------------------------------------
// AbortSignal.timeout() — Chrome 103+
// React 19 uses AbortSignal internally for Suspense and concurrent features.
// ---------------------------------------------------------------------------
if (typeof AbortSignal !== 'undefined' && !('timeout' in AbortSignal)) {
  Object.defineProperty(AbortSignal, 'timeout', {
    value(ms: number): AbortSignal {
      const controller = new AbortController()
      setTimeout(() => {
        controller.abort(
          new DOMException('The operation was aborted due to timeout', 'TimeoutError'),
        )
      }, ms)
      return controller.signal
    },
    writable: true,
    configurable: true,
  })
}

// ---------------------------------------------------------------------------
// Array.prototype.at() — Chrome 92+
// ---------------------------------------------------------------------------
if (!Array.prototype.at) {
  Object.defineProperty(Array.prototype, 'at', {
    value(this: unknown[], index: number): unknown {
      const len = this.length
      const k = index < 0 ? len + index : index
      if (k < 0 || k >= len) return undefined
      return this[k]
    },
    writable: true,
    configurable: true,
  })
}

// ---------------------------------------------------------------------------
// String.prototype.at() — Chrome 92+
// ---------------------------------------------------------------------------
if (!String.prototype.at) {
  Object.defineProperty(String.prototype, 'at', {
    value(this: string, index: number): string | undefined {
      const len = this.length
      const k = index < 0 ? len + index : index
      if (k < 0 || k >= len) return undefined
      return this[k]
    },
    writable: true,
    configurable: true,
  })
}

// ---------------------------------------------------------------------------
// Object.hasOwn() — Chrome 93+
// ---------------------------------------------------------------------------
if (!Object.hasOwn) {
  Object.defineProperty(Object, 'hasOwn', {
    value(obj: object, prop: PropertyKey): boolean {
      return Object.prototype.hasOwnProperty.call(obj, prop)
    },
    writable: true,
    configurable: true,
  })
}

// ---------------------------------------------------------------------------
// structuredClone() — Chrome 98+
// Note: JSON round-trip does not handle Date, RegExp, Map, Set, ArrayBuffer,
// etc. A full structured clone is impractical to polyfill; this covers the
// most common use case (plain objects/arrays/primitives).
// ---------------------------------------------------------------------------
if (typeof structuredClone === 'undefined') {
  ;(globalThis as Record<string, unknown>).structuredClone = <T>(value: T): T =>
    JSON.parse(JSON.stringify(value))
}

// ---------------------------------------------------------------------------
// Array.prototype.findLast() / findLastIndex() — Chrome 97+
// ---------------------------------------------------------------------------
if (!Array.prototype.findLast) {
  Object.defineProperty(Array.prototype, 'findLast', {
    value<T>(
      this: T[],
      predicate: (value: T, index: number, obj: T[]) => boolean,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      thisArg?: any,
    ): T | undefined {
      for (let i = this.length - 1; i >= 0; i--) {
        if (predicate.call(thisArg, this[i], i, this)) return this[i]
      }
      return undefined
    },
    writable: true,
    configurable: true,
  })
}

if (!Array.prototype.findLastIndex) {
  Object.defineProperty(Array.prototype, 'findLastIndex', {
    value<T>(
      this: T[],
      predicate: (value: T, index: number, obj: T[]) => boolean,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      thisArg?: any,
    ): number {
      for (let i = this.length - 1; i >= 0; i--) {
        if (predicate.call(thisArg, this[i], i, this)) return i
      }
      return -1
    },
    writable: true,
    configurable: true,
  })
}

export {}
