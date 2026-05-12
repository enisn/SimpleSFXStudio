import { useEffect, useMemo, useRef, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import type { AssistantChatMessage } from '../audio/studio/assistant'
import './AIAssistant.css'

function IconSpark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M12 3.75v4.5" />
      <path d="M12 15.75v4.5" />
      <path d="M3.75 12h4.5" />
      <path d="M15.75 12h4.5" />
      <path d="m6.15 6.15 3.2 3.2" />
      <path d="m14.65 14.65 3.2 3.2" />
      <path d="m17.85 6.15-3.2 3.2" />
      <path d="m9.35 14.65-3.2 3.2" />
    </svg>
  )
}

function IconUndo() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M9.75 7.5H5.25V3" />
      <path d="M5.25 7.5A8.25 8.25 0 1 1 3.9 15" />
    </svg>
  )
}

function IconClose() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="m6.75 6.75 10.5 10.5" />
      <path d="M17.25 6.75 6.75 17.25" />
    </svg>
  )
}

function IconSend() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M4.5 12 19.5 4.5 15 19.5 11.25 12 4.5 12Z" />
      <path d="M11.25 12 19.5 4.5" />
    </svg>
  )
}

export function LandingAssistantBubble({ to }: { to: string }) {
  return (
    <Link
      className="assistant-bubble assistant-bubble--landing"
      to={to}
      aria-label="Open AI assistant in studio"
      data-tooltip="Open AI assistant in studio"
    >
      <span className="assistant-bubble__orb" aria-hidden="true">
        AI
      </span>
      <span className="assistant-bubble__copy">
        <strong>AI Assistant</strong>
        <small>Open in Studio</small>
      </span>
    </Link>
  )
}

export function StudioAssistantBubble({
  isOpen,
  isPending,
  onToggle,
}: {
  isOpen: boolean
  isPending: boolean
  onToggle: () => void
}) {
  return (
    <button
      type="button"
      className={`assistant-bubble assistant-bubble--studio ${isOpen ? 'is-open' : ''}`}
      aria-pressed={isOpen}
      aria-label={isOpen ? 'Close AI assistant' : 'Open AI assistant'}
      data-tooltip={isOpen ? 'Close AI assistant' : 'Open AI assistant'}
      onClick={onToggle}
    >
      <span className="assistant-bubble__orb" aria-hidden="true">
        {isPending ? '...' : <IconSpark />}
      </span>
      <span className="assistant-bubble__copy">
        <strong>{isPending ? 'Thinking...' : 'AI Assistant'}</strong>
        <small>{isOpen ? 'Hide chat' : 'Patch-aware sound edits'}</small>
      </span>
    </button>
  )
}

type StudioAssistantPanelProps = {
  isOpen: boolean
  isPending: boolean
  error: string | null
  inputValue: string
  messages: AssistantChatMessage[]
  canUndo: boolean
  onInputChange: (value: string) => void
  onSubmit: (prompt?: string) => void
  onClose: () => void
  onUndo: () => void
}

const suggestionPrompts = [
  { label: 'Mobile tap', prompt: 'Build a polished mobile tap sound from scratch.' },
  { label: 'Bright short layer', prompt: 'Make the selected layer brighter and shorter.' },
  { label: 'Reward shimmer', prompt: 'Add a soft stereo shimmer layer for rewards.' },
  { label: 'Wide whoosh', prompt: 'Turn this into a futuristic whoosh with more width.' },
]

const assistantCapabilityHint =
  'I can modify layers, envelopes, filters, timing, master settings, or build a new patch from scratch.'

export function StudioAssistantPanel({
  isOpen,
  isPending,
  error,
  inputValue,
  messages,
  canUndo,
  onInputChange,
  onSubmit,
  onClose,
  onUndo,
}: StudioAssistantPanelProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!isOpen) {
      return
    }

    const element = scrollRef.current

    if (!element) {
      return
    }

    element.scrollTop = messages.length > 1 ? element.scrollHeight : 0
  }, [isOpen, messages])

  const messageCountLabel = useMemo(() => `${messages.length} messages`, [messages.length])

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    onSubmit()
  }

  return (
    <section className={`assistant-drawer ${isOpen ? 'is-open' : ''}`} aria-hidden={!isOpen}>
      <div className="assistant-drawer__header">
        <div className="assistant-drawer__headline">
          <p className="assistant-drawer__kicker">Patch-aware chat</p>
          <h2 data-tooltip={assistantCapabilityHint}>AI Assistant</h2>
        </div>
        <div className="assistant-drawer__actions">
          <button
            type="button"
            className="assistant-inline-button assistant-inline-button--icon"
            aria-label="Undo AI"
            data-tooltip="Undo AI"
            onClick={onUndo}
            disabled={!canUndo || isPending}
          >
            <IconUndo />
          </button>
          <button
            type="button"
            className="assistant-inline-button assistant-inline-button--icon"
            aria-label="Close AI assistant"
            data-tooltip="Close AI assistant"
            onClick={onClose}
          >
            <IconClose />
          </button>
        </div>
      </div>

      <div className="assistant-drawer__meta">
        <span>{messageCountLabel}</span>
        <span>{isPending ? 'Waiting for model' : 'Ready'}</span>
      </div>

      <div ref={scrollRef} className="assistant-thread" role="log" aria-live="polite">
        {messages.map((message) => (
          <article key={message.id} className={`assistant-message assistant-message--${message.role}`}>
            <span className="assistant-message__role">{message.role === 'assistant' ? 'AI' : 'You'}</span>
            <p>{message.content}</p>
          </article>
        ))}

        {error ? <div className="assistant-error">{error}</div> : null}
      </div>

      <div className="assistant-suggestions" aria-label="AI assistant suggestions">
        {suggestionPrompts.map((suggestion) => (
          <button
            key={suggestion.prompt}
            type="button"
            className="assistant-suggestion"
            data-tooltip={suggestion.prompt}
            onClick={() => onSubmit(suggestion.prompt)}
            disabled={isPending}
          >
            {suggestion.label}
          </button>
        ))}
      </div>

      <form className="assistant-composer" onSubmit={handleSubmit}>
        <label className="assistant-composer__field" htmlFor="assistant-prompt" data-tooltip={assistantCapabilityHint}>
          <span>Describe the sound you want</span>
        </label>
        <div className="assistant-composer__control">
          <textarea
            id="assistant-prompt"
            rows={3}
            placeholder="Make it punchier, shorten the tail, add a bright noise layer..."
            value={inputValue}
            onChange={(event) => onInputChange(event.currentTarget.value)}
            disabled={isPending}
          />
          <button
            type="submit"
            className="assistant-submit"
            aria-label={isPending ? 'Applying with AI' : 'Apply with AI'}
            data-tooltip={isPending ? 'Applying with AI' : 'Apply with AI'}
            disabled={isPending || inputValue.trim().length === 0}
          >
            <span className="assistant-submit__icon" aria-hidden="true">
              <IconSend />
            </span>
            <span className="assistant-submit__label">{isPending ? 'Applying...' : 'Apply with AI'}</span>
          </button>
        </div>
      </form>
    </section>
  )
}
