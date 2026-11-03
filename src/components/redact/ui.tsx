/**
 * 画面共通の小さな部品（バッジ・ボタン・スイッチ・ピル・レイアウトアイコン）
 *
 * 見た目は src/app/redact-pro.module.css のクラスで決まる。ボタン階層は docs/DESIGN.md §6。
 */
import type { ButtonHTMLAttributes, CSSProperties, HTMLAttributes, ReactNode } from 'react'
import s from '@/app/redact-pro.module.css'

interface BadgeProps extends Omit<HTMLAttributes<HTMLSpanElement>, 'color'> {
  children?: ReactNode
  color?: string
  bg?: string
  style?: CSSProperties
}

export function Badge({ children, color, bg, style: sx, ...rest }: BadgeProps) {
  return (
    <span {...rest} className={s.badge} style={{ color, background: bg, ...sx }}>
      {children}
    </span>
  )
}

export type BtnVariant = 'primary' | 'ghost' | 'outline' | 'danger' | (string & {})

interface BtnProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onClick'> {
  variant?: BtnVariant
  onClick?: ButtonHTMLAttributes<HTMLButtonElement>['onClick']
  disabled?: boolean
}

/**
 * aria-label 未指定時は title をアクセシブルネームに使う。
 * disabled は属性ではなく data-disabled で表し、フォーカス可能なまま押下だけ無効にする。
 */
export function Btn({
  children,
  variant = 'primary',
  onClick,
  disabled,
  style: sx,
  title,
  ...rest
}: BtnProps) {
  return (
    <button
      onClick={disabled ? undefined : onClick}
      title={title}
      aria-label={rest['aria-label'] || title}
      {...rest}
      className={`${s.btn} ${s[`btn-${variant}`] || ''}`}
      data-disabled={!!disabled}
      style={sx}
    >
      {children}
    </button>
  )
}

interface ToggleProps {
  checked: boolean
  onChange?: () => void
  size?: 'sm' | 'md' | (string & {})
  disabled?: boolean
  title?: string
}

export function Toggle({ checked, onChange, size = 'md', disabled = false, title }: ToggleProps) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={title}
      onClick={(e) => {
        if (disabled) return
        // 行全体のクリック（項目へジャンプ）と二重に発火させない
        e.stopPropagation()
        if (onChange) onChange()
      }}
      className={s.toggle}
      data-size={size}
      data-checked={checked}
      data-disabled={disabled}
    >
      <span className={s['toggle-knob']} />
    </button>
  )
}

interface PillProps {
  children?: ReactNode
  active?: boolean
  onClick?: () => void
  color?: string
}

export function Pill({ children, active, onClick, color }: PillProps) {
  return (
    <button
      onClick={onClick}
      className={s.pill}
      data-active={!!active}
      style={color && active ? { background: `${color}1A`, color } : undefined}
    >
      {children}
    </button>
  )
}

interface LayoutIconProps {
  cols: { f: number }[]
  active?: boolean
  color: string
}

export function LayoutIcon({ cols, active, color }: LayoutIconProps) {
  return (
    <div
      className={s['layout-icon']}
      data-active={!!active}
      style={active ? { border: `1.5px solid ${color}`, background: `${color}18` } : undefined}
    >
      {cols.map((c, i) => (
        <span
          key={i}
          className={s['layout-icon-bar']}
          data-active={!!active}
          style={{ flex: c.f, ...(active ? { background: color } : undefined) }}
        />
      ))}
    </div>
  )
}
