import { useEffect, useRef } from 'react'

const FOCUSABLE =
  'button:not([disabled]),input:not([disabled]),textarea:not([disabled]),select:not([disabled]),a[href],[tabindex]:not([tabindex="-1"])'

/**
 * モーダル内に Tab フォーカスを閉じ込め、閉じたら開く前の要素へフォーカスを戻す。
 * 返した ref をモーダルのルート要素に付ける。
 */
export function useFocusTrap<T extends HTMLElement = HTMLDivElement>(active = true) {
  const ref = useRef<T>(null)
  const prevFocus = useRef<Element | null>(null)
  useEffect(() => {
    if (!active) return
    prevFocus.current = document.activeElement
    const el = ref.current
    if (!el) return
    const focusable = () => el.querySelectorAll<HTMLElement>(FOCUSABLE)
    const trap = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return
      const items = focusable()
      if (!items.length) return
      if (e.shiftKey) {
        if (document.activeElement === items[0]) {
          e.preventDefault()
          items[items.length - 1].focus()
        }
      } else if (document.activeElement === items[items.length - 1]) {
        e.preventDefault()
        items[0].focus()
      }
    }
    el.addEventListener('keydown', trap)
    requestAnimationFrame(() => {
      const f = focusable()[0]
      if (f) f.focus()
    })
    return () => {
      el.removeEventListener('keydown', trap)
      const prev = prevFocus.current
      if (prev instanceof HTMLElement || prev instanceof SVGElement) prev.focus()
    }
  }, [active])
  return ref
}
