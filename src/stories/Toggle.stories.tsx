import React, { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { ThemeDecorator } from './theme-decorator'

/** RedactPro.tsx 内の Toggle コンポーネントと同等の実装 */
function Toggle({
  checked = false,
  onChange,
  size = 'md',
  disabled = false,
  title,
}: {
  checked?: boolean
  onChange?: () => void
  size?: 'sm' | 'md'
  disabled?: boolean
  title?: string
}) {
  const w = size === 'sm' ? 32 : 38
  const h = size === 'sm' ? 18 : 22
  const d = size === 'sm' ? 12 : 16
  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={title}
      onClick={(e) => {
        if (disabled) return
        e.stopPropagation()
        onChange?.()
      }}
      style={{
        width: w,
        height: h,
        borderRadius: h / 2,
        border: 'none',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        background: checked ? 'var(--rp-accent)' : '#A39791',
        position: 'relative',
        transition: 'background .2s',
        flexShrink: 0,
      }}
    >
      <span
        style={{
          position: 'absolute',
          top: (h - d) / 2,
          left: checked ? w - d - 3 : 3,
          width: d,
          height: d,
          borderRadius: d / 2,
          background: '#fff',
          transition: 'left .2s',
          boxShadow: '0 1px 3px rgba(0,0,0,.25)',
        }}
      />
    </button>
  )
}

/** インタラクティブWrapper */
function ToggleInteractive(props: { size?: 'sm' | 'md'; disabled?: boolean; title?: string }) {
  const [on, setOn] = useState(false)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <Toggle {...props} checked={on} onChange={() => setOn((v) => !v)} />
      <span style={{ fontSize: 13, color: 'var(--rp-text2)' }}>{on ? 'ON' : 'OFF'}</span>
    </div>
  )
}

const meta: Meta<typeof Toggle> = {
  title: 'UI/Toggle',
  component: Toggle,
  decorators: [
    (Story) => (
      <ThemeDecorator>
        <Story />
      </ThemeDecorator>
    ),
  ],
  argTypes: {
    size: { control: 'select', options: ['sm', 'md'] },
    disabled: { control: 'boolean' },
  },
}
export default meta

type Story = StoryObj<typeof Toggle>

export const Default: Story = {
  render: () => <ToggleInteractive />,
}

export const Small: Story = {
  render: () => <ToggleInteractive size="sm" />,
}

export const DisabledState: Story = {
  args: { checked: true, disabled: true, title: '無効' },
}

export const AllStates: Story = {
  render: () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <Toggle checked={false} size="md" />
        <span style={{ fontSize: 13, color: 'var(--rp-text2)' }}>OFF (md)</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <Toggle checked={true} size="md" />
        <span style={{ fontSize: 13, color: 'var(--rp-text2)' }}>ON (md)</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <Toggle checked={false} size="sm" />
        <span style={{ fontSize: 13, color: 'var(--rp-text2)' }}>OFF (sm)</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <Toggle checked={true} size="sm" />
        <span style={{ fontSize: 13, color: 'var(--rp-text2)' }}>ON (sm)</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <Toggle checked={true} disabled size="md" />
        <span style={{ fontSize: 13, color: 'var(--rp-text2)' }}>Disabled</span>
      </div>
    </div>
  ),
}
