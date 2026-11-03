import React from 'react'
import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { ThemeDecorator } from './theme-decorator'

/** RedactPro.tsx 内の Btn コンポーネントと同等の実装 */
function Btn({
  children,
  variant = 'primary',
  disabled = false,
  style: sx,
}: {
  children: React.ReactNode
  variant?: 'primary' | 'ghost' | 'danger' | 'success'
  disabled?: boolean
  style?: React.CSSProperties
}) {
  const base: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: '11px 22px',
    borderRadius: 10,
    fontSize: 14,
    fontWeight: 600,
    fontFamily: "'Noto Sans JP','DM Sans',system-ui,sans-serif",
    cursor: disabled ? 'default' : 'pointer',
    border: 'none',
    transition: 'all .15s',
    opacity: disabled ? 0.35 : 1,
  }
  const variants: Record<string, React.CSSProperties> = {
    primary: { background: 'var(--rp-accent)', color: 'var(--rp-bg)' },
    ghost: {
      background: 'transparent',
      color: 'var(--rp-text2)',
      border: '1px solid var(--rp-border)',
    },
    danger: { background: 'rgba(220,38,38,0.1)', color: '#DC2626' },
    success: { background: 'rgba(5,150,105,0.1)', color: '#059669' },
  }
  return <button style={{ ...base, ...variants[variant], ...sx }}>{children}</button>
}

const meta: Meta<typeof Btn> = {
  title: 'UI/Btn',
  component: Btn,
  decorators: [
    (Story) => (
      <ThemeDecorator>
        <Story />
      </ThemeDecorator>
    ),
  ],
  argTypes: {
    variant: {
      control: 'select',
      options: ['primary', 'ghost', 'danger', 'success'],
    },
    disabled: { control: 'boolean' },
  },
}
export default meta

type Story = StoryObj<typeof Btn>

export const Primary: Story = {
  args: { children: 'マスキング実行', variant: 'primary' },
}

export const Ghost: Story = {
  args: { children: 'キャンセル', variant: 'ghost' },
}

export const Danger: Story = {
  args: { children: '全検出を削除', variant: 'danger' },
}

export const Success: Story = {
  args: { children: 'エクスポート完了', variant: 'success' },
}

export const Disabled: Story = {
  args: { children: '処理中...', variant: 'primary', disabled: true },
}

export const AllVariants: Story = {
  render: () => (
    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
      <Btn variant="primary">Primary</Btn>
      <Btn variant="ghost">Ghost</Btn>
      <Btn variant="danger">Danger</Btn>
      <Btn variant="success">Success</Btn>
      <Btn variant="primary" disabled>
        Disabled
      </Btn>
    </div>
  ),
}
