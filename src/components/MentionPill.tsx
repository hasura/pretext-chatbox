import type { MentionType } from '../types/document.js'

type Props = {
  mentionType: MentionType
}

function displayName(m: MentionType): string {
  switch (m.kind) {
    case 'user': return m.id  // placeholder: real app resolves UUID → name
    case 'promptql': return 'PromptQL'
  }
}

function icon(m: MentionType): string {
  switch (m.kind) {
    case 'user': return '@'
    case 'promptql': return '>'
  }
}

export function MentionPill({ mentionType }: Props) {
  const name = displayName(mentionType)
  const prefix = icon(mentionType)
  const className = mentionType.kind === 'promptql'
    ? 'mention-pill mention-pill--promptql'
    : 'mention-pill mention-pill--user'

  return (
    <span className={className} data-mention-kind={mentionType.kind}>
      <span className="mention-pill__icon">{prefix}</span>
      <span className="mention-pill__name">{name}</span>
    </span>
  )
}
