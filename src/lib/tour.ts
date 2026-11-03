/**
 * intro.js のガイドツアーを起動する
 *
 * intro.js と CSS は初回起動時にだけ読み込む（初期表示を軽くするため）。
 * 画面に存在しない要素のステップは飛ばし、ツアーを閉じたら doneKey を記録して次回から自動起動しない。
 */
import type { IntroStep } from '@/lib/intro-steps'

export async function launchTour(steps: IntroStep[], doneKey: string | null): Promise<void> {
  const introJs = (await import('intro.js')).default
  await import('intro.js/introjs.css')
  await import('@/styles/introjs-overrides.css')
  const { INTRO_OPTIONS } = await import('@/lib/intro-steps')
  const validSteps = steps.filter((s) => document.querySelector(s.element))
  if (validSteps.length === 0) return
  // ツールチップは body 直下に描画されるので、アプリのテーマを body にも写す
  const theme = document.querySelector('[data-theme]')?.getAttribute('data-theme') || 'dark'
  document.body.setAttribute('data-theme', theme)
  const tour = introJs()
  tour.setOptions({ ...INTRO_OPTIONS, steps: validSteps })
  // 「いま何番目か」を常に示す（例: 7 / 12）
  const total = validSteps.length
  const renderStepCounter = () => {
    const tooltip = document.querySelector('.introjs-tooltip')
    if (!tooltip) return
    const idx = tour.currentStep() ?? 0
    const current = Math.min(total, Math.max(1, idx + 1))
    let el = tooltip.querySelector('.introjs-stepcounter')
    if (!el) {
      el = document.createElement('div')
      el.className = 'introjs-stepcounter'
      const anchor =
        tooltip.querySelector('.introjs-progress') ||
        tooltip.querySelector('.introjs-tooltipbuttons')
      if (anchor) tooltip.insertBefore(el, anchor)
      else tooltip.appendChild(el)
    }
    el.textContent = `${current} / ${total}`
    el.setAttribute('aria-label', `全${total}ステップ中 ${current}番目`)
  }
  const cleanup = () => {
    document.body.removeAttribute('data-theme')
    if (doneKey) {
      try {
        localStorage.setItem(doneKey, '1')
      } catch {
        // 保存できなくても次回もう一度ツアーが出るだけ
      }
    }
  }
  tour.oncomplete(cleanup)
  tour.onexit(cleanup)
  tour.onafterchange(() => {
    renderStepCounter()
  })
  tour.start()
  setTimeout(renderStepCounter, 0)
}
