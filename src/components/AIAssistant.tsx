import { useEffect, useMemo, useRef, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import type { AssistantChatMessage } from '../audio/studio/assistant'
import './AIAssistant.css'

export function LandingAssistantBubble({ to }: { to: string }) {
  return (
    <Link className="assistant-bubble assistant-bubble--landing" to={to} aria-label="Open AI assistant in studio">
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
      onClick={onToggle}
    >
      <span className="assistant-bubble__orb" aria-hidden="true">
        {isPending ? '...' : 'AI'}
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
  currentPatchName: string
  canUndo: boolean
  onInputChange: (value: string) => void
  onSubmit: (prompt?: string) => void
  onClose: () => void
  onUndo: () => void
}

const suggestionPrompts = [
  'Build a polished mobile tap sound from scratch.',
  'Make the selected layer brighter and shorter.',
  'Add a soft stereo shimmer layer for rewards.',
  'Turn this into a futuristic whoosh with more width.',
]

export function StudioAssistantPanel({
  isOpen,
  isPending,
  error,
  inputValue,
  messages,
  currentPatchName,
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

    element.scrollTop = element.scrollHeight
  }, [isOpen, messages])

  const messageCountLabel = useMemo(() => `${messages.length} messages`, [messages.length])

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    onSubmit()
  }

  return (
    <section className={`assistant-drawer ${isOpen ? 'is-open' : ''}`} aria-hidden={!isOpen}>
      <div className="assistant-drawer__header">
        <div>
          <p className="assistant-drawer__kicker">Patch-aware chat</p>
          <h2>AI Assistant</h2>
          <p className="assistant-drawer__note">Editing `{currentPatchName}`. Can change layers, envelopes, filters, timing, and master FX.</p>
        </div>
        <div className="assistant-drawer__actions">
          <button type="button" className="assistant-inline-button" onClick={onUndo} disabled={!canUndo || isPending}>
            Undo AI
          </button>
          <button type="button" className="assistant-inline-button" onClick={onClose}>
            Close
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
        {suggestionPrompts.map((prompt) => (
          <button key={prompt} type="button" className="assistant-suggestion" onClick={() => onSubmit(prompt)} disabled={isPending}>
            {prompt}
          </button>
        ))}
      </div>

      <form className="assistant-composer" onSubmit={handleSubmit}>
        <label className="assistant-composer__field" htmlFor="assistant-prompt">
          <span>Describe the sound you want</span>
          <textarea
            id="assistant-prompt"
            rows={4}
            placeholder="Example: make this punchier, shorten the tail, add a bright noise layer, and widen the stereo image."
            value={inputValue}
            onChange={(event) => onInputChange(event.currentTarget.value)}
            disabled={isPending}
          />
        </label>

        <button type="submit" className="assistant-submit" disabled={isPending || inputValue.trim().length === 0}>
          {isPending ? 'Applying...' : 'Apply with AI'}
        </button>
      </form>
    </section>
  )
}
