import type { Document, Segment, MentionType } from '../types/document.js'

// ─── Mention Tag Regex ───────────────────────────────────────────────────────
// Matches self-closing XML-like mention tags:
//   <user_mention id="UUID" />
//   <promptql_mention />

const MENTION_RE = /<(user_mention|promptql_mention)(?:\s+id="([^"]*)")?\s*\/>/g

// ─── Parser ──────────────────────────────────────────────────────────────────
// Parses raw source text into a Document of typed segments.
// Pure function: string → Document. No side effects.

export function parseDocument(source: string): Document {
  const segments: Segment[] = []
  let lastIndex = 0

  // Reset regex state for reuse
  MENTION_RE.lastIndex = 0

  let match: RegExpExecArray | null
  while ((match = MENTION_RE.exec(source)) !== null) {
    const matchStart = match.index
    const matchEnd = matchStart + match[0].length

    // Text before this mention
    if (matchStart > lastIndex) {
      segments.push({ kind: 'text', content: source.slice(lastIndex, matchStart) })
    }

    // The mention itself
    const tagName = match[1]
    const mentionType: MentionType = tagName === 'user_mention'
      ? { kind: 'user', id: match[2] ?? '' }
      : { kind: 'promptql' }

    segments.push({
      kind: 'mention',
      mentionType,
      sourceText: match[0],
    })

    lastIndex = matchEnd
  }

  // Trailing text
  if (lastIndex < source.length) {
    segments.push({ kind: 'text', content: source.slice(lastIndex) })
  }

  // Edge case: empty source
  if (segments.length === 0) {
    segments.push({ kind: 'text', content: '' })
  }

  return { segments, source }
}

// ─── Serializer ──────────────────────────────────────────────────────────────
// Reconstruct source text from a Document (inverse of parse).

export function serializeDocument(doc: Document): string {
  return doc.segments.reduce((acc, seg) => {
    switch (seg.kind) {
      case 'text': return acc + seg.content
      case 'mention': return acc + seg.sourceText
    }
  }, '')
}
