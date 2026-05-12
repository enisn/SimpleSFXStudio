import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

type TooltipPlacement = 'top' | 'bottom' | 'left' | 'right'

type TooltipState = {
  text: string
  x: number
  y: number
  placement: TooltipPlacement
}

const tooltipOffset = 10
const tooltipMaxWidth = 260
const viewportPadding = 12

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function findTooltipTarget(target: EventTarget | null) {
  return target instanceof HTMLElement ? target.closest<HTMLElement>('[data-tooltip]') : null
}

function getPlacement(element: HTMLElement, rect: DOMRect): TooltipPlacement {
  const preferred = element.dataset.tooltipPosition as TooltipPlacement | undefined

  if (preferred === 'left' && rect.left < tooltipMaxWidth + viewportPadding * 2) {
    return 'right'
  }

  if (preferred === 'bottom' && window.innerHeight - rect.bottom < 56) {
    return 'top'
  }

  if ((!preferred || preferred === 'top') && rect.top < 56) {
    return 'bottom'
  }

  return preferred ?? 'top'
}

function getTooltipState(element: HTMLElement): TooltipState | null {
  const text = element.dataset.tooltip?.trim()

  if (!text) {
    return null
  }

  const rect = element.getBoundingClientRect()
  const placement = getPlacement(element, rect)

  if (placement === 'left') {
    return {
      text,
      placement,
      x: rect.left - tooltipOffset,
      y: clamp(rect.top + rect.height / 2, viewportPadding, window.innerHeight - viewportPadding),
    }
  }

  if (placement === 'right') {
    return {
      text,
      placement,
      x: rect.right + tooltipOffset,
      y: clamp(rect.top + rect.height / 2, viewportPadding, window.innerHeight - viewportPadding),
    }
  }

  return {
    text,
    placement,
    x: clamp(
      rect.left + rect.width / 2,
      viewportPadding + tooltipMaxWidth / 2,
      window.innerWidth - viewportPadding - tooltipMaxWidth / 2,
    ),
    y: placement === 'bottom' ? rect.bottom + tooltipOffset : rect.top - tooltipOffset,
  }
}

function TooltipLayer() {
  const [tooltip, setTooltip] = useState<TooltipState | null>(null)

  useEffect(() => {
    function showTooltip(event: Event) {
      const element = findTooltipTarget(event.target)
      setTooltip(element ? getTooltipState(element) : null)
    }

    function hideTooltip(event?: Event) {
      const nextTarget = event && 'relatedTarget' in event ? event.relatedTarget : null

      if (nextTarget instanceof Node) {
        const currentElement = event ? findTooltipTarget(event.target) : null

        if (currentElement?.contains(nextTarget)) {
          return
        }
      }

      setTooltip(null)
    }

    function hideOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setTooltip(null)
      }
    }

    document.addEventListener('pointerover', showTooltip, true)
    document.addEventListener('pointerout', hideTooltip, true)
    document.addEventListener('mouseover', showTooltip, true)
    document.addEventListener('mouseout', hideTooltip, true)
    document.addEventListener('focusin', showTooltip, true)
    document.addEventListener('focusout', hideTooltip, true)
    document.addEventListener('keydown', hideOnEscape)
    window.addEventListener('scroll', hideTooltip, true)
    window.addEventListener('resize', hideTooltip)

    return () => {
      document.removeEventListener('pointerover', showTooltip, true)
      document.removeEventListener('pointerout', hideTooltip, true)
      document.removeEventListener('mouseover', showTooltip, true)
      document.removeEventListener('mouseout', hideTooltip, true)
      document.removeEventListener('focusin', showTooltip, true)
      document.removeEventListener('focusout', hideTooltip, true)
      document.removeEventListener('keydown', hideOnEscape)
      window.removeEventListener('scroll', hideTooltip, true)
      window.removeEventListener('resize', hideTooltip)
    }
  }, [])

  if (!tooltip) {
    return null
  }

  return createPortal(
    <div
      className={`app-tooltip app-tooltip--${tooltip.placement}`}
      role="tooltip"
      style={{ left: tooltip.x, top: tooltip.y }}
    >
      {tooltip.text}
    </div>,
    document.body,
  )
}

export default TooltipLayer
