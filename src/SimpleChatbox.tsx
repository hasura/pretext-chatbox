import { useRef, useState, useCallback, useEffect } from 'react';

interface User {
  username: string;
  displayName: string;
}

const MOCK_USERS: User[] = [
  { username: 'tanmai', displayName: 'Tanmai Gopal' },
  { username: 'alice', displayName: 'Alice Chen' },
  { username: 'bob', displayName: 'Bob Smith' },
  { username: 'carol', displayName: 'Carol Davis' },
  { username: 'dave', displayName: 'Dave Wilson' },
  { username: 'eve', displayName: 'Eve Martinez' },
  { username: 'frank', displayName: 'Frank Lee' },
  { username: 'grace', displayName: 'Grace Kim' },
];

const MENTION_SEPARATOR = '\u200b';

function isKnownUser(username: string): boolean {
  return MOCK_USERS.some((u) => u.username === username);
}

function normalizeEditorText(text: string): string {
  return text
    .replaceAll(MENTION_SEPARATOR, '')
    .replaceAll('\u00a0', ' ');
}

function getVisibleTextLength(text: string): number {
  return normalizeEditorText(text).length;
}

function containsKnownMention(text: string): boolean {
  return Array.from(text.matchAll(/@(\w+)/g)).some(([, username]) => isKnownUser(username));
}

function getPlainText(el: HTMLElement): string {
  // Walk the DOM to extract text, converting <br> and block boundaries to newlines
  let text = '';
  for (const node of el.childNodes) {
    if (node.nodeType === Node.TEXT_NODE) {
      text += normalizeEditorText(node.textContent ?? '');
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const tag = (node as HTMLElement).tagName;
      if (tag === 'BR') {
        text += '\n';
      } else if (tag === 'DIV' || tag === 'P') {
        if (text.length > 0 && !text.endsWith('\n')) text += '\n';
        text += getPlainText(node as HTMLElement);
      } else {
        text += getPlainText(node as HTMLElement);
      }
    }
  }
  return text;
}

function getOffsetFromPoint(root: HTMLElement, node: Node, offset: number): number {
  const range = document.createRange();
  range.selectNodeContents(root);
  range.setEnd(node, offset);
  const container = document.createElement('div');
  container.appendChild(range.cloneContents());
  return getPlainText(container).length;
}

function getSelectionOffsets(root: HTMLElement): { start: number; end: number } | null {
  const selection = window.getSelection();
  if (!selection || !selection.rangeCount) return null;

  const range = selection.getRangeAt(0);
  if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) {
    return null;
  }

  return {
    start: getOffsetFromPoint(root, range.startContainer, range.startOffset),
    end: getOffsetFromPoint(root, range.endContainer, range.endOffset),
  };
}

function resolveDomPoint(root: HTMLElement, targetOffset: number): { node: Node; offset: number } {
  if (targetOffset <= 0) {
    return { node: root, offset: 0 };
  }

  const walker = document.createTreeWalker(
    root,
    NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT,
    {
      acceptNode: (node) => {
        if (node.nodeType === Node.TEXT_NODE) return NodeFilter.FILTER_ACCEPT;
        if (node.nodeName === 'BR') return NodeFilter.FILTER_ACCEPT;
        return NodeFilter.FILTER_SKIP;
      },
    }
  );

  let currentOffset = 0;
  let node: Node | null;

  while ((node = walker.nextNode())) {
    if (node.nodeType === Node.TEXT_NODE) {
      const textNode = node as Text;
      const nextOffset = currentOffset + getVisibleTextLength(textNode.data);
      if (targetOffset <= nextOffset) {
        let visibleOffset = targetOffset - currentOffset;
        let domOffset = 0;

        while (domOffset < textNode.length) {
          if (textNode.data[domOffset] === MENTION_SEPARATOR) {
            domOffset += 1;
            continue;
          }
          if (visibleOffset === 0) {
            break;
          }
          visibleOffset -= 1;
          domOffset += 1;
        }

        while (domOffset < textNode.length && textNode.data[domOffset] === MENTION_SEPARATOR) {
          domOffset += 1;
        }

        return {
          node: textNode,
          offset: domOffset,
        };
      }
      currentOffset = nextOffset;
      continue;
    }

    currentOffset += 1;
    if (targetOffset <= currentOffset) {
      const parent = node.parentNode ?? root;
      const index = Array.from(parent.childNodes).indexOf(node as ChildNode);
      return { node: parent, offset: index + 1 };
    }
  }

  return { node: root, offset: root.childNodes.length };
}

function setSelectionOffsets(root: HTMLElement, start: number, end: number = start): void {
  const selection = window.getSelection();
  if (!selection) return;

  const range = createRangeFromOffsets(root, start, end);
  selection.removeAllRanges();
  selection.addRange(range);
}

function createRangeFromOffsets(root: HTMLElement, start: number, end: number): Range {
  const range = document.createRange();
  const startPoint = resolveDomPoint(root, start);
  const endPoint = resolveDomPoint(root, end);
  range.setStart(startPoint.node, startPoint.offset);
  range.setEnd(endPoint.node, endPoint.offset);
  return range;
}

function findMentionElement(node: Node | null, root: HTMLElement): HTMLSpanElement | null {
  let current = node;
  while (current && current !== root) {
    if (current instanceof HTMLSpanElement && current.classList.contains('mention')) {
      return current;
    }
    current = current.parentNode;
  }
  return null;
}

interface SimpleChatboxProps {
  onSend?: (message: string) => void;
  placeholder?: string;
}

export default function SimpleChatbox({
  onSend,
  placeholder = 'Type a message... Use @ to mention someone',
}: SimpleChatboxProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const [dropdownFilter, setDropdownFilter] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isEmpty, setIsEmpty] = useState(true);

  const filteredUsers = MOCK_USERS.filter((u) =>
    u.username.toLowerCase().startsWith(dropdownFilter.toLowerCase())
  );

  const saveCaret = useCallback((): number => {
    const el = editorRef.current;
    if (!el) return 0;
    return getSelectionOffsets(el)?.start ?? 0;
  }, []);

  const restoreCaret = useCallback((startOffset: number, endOffset: number = startOffset) => {
    const el = editorRef.current;
    if (!el) return;
    setSelectionOffsets(el, startOffset, endOffset);
  }, []);

  const breakMentionAtSelection = useCallback(() => {
    const el = editorRef.current;
    if (!el) return false;

    const selection = window.getSelection();
    if (!selection || !selection.rangeCount) return false;

    const range = selection.getRangeAt(0);
    if (!el.contains(range.startContainer) || !el.contains(range.endContainer)) {
      return false;
    }

    const mentions = Array.from(
      new Set(
        [range.startContainer, range.endContainer]
          .map((node) => findMentionElement(node, el))
          .filter((mention): mention is HTMLSpanElement => mention !== null)
      )
    );

    if (mentions.length === 0) return false;

    const offsets = getSelectionOffsets(el);
    for (const mention of mentions) {
      const separator = mention.nextSibling;
      if (separator?.nodeType === Node.TEXT_NODE) {
        const textNode = separator as Text;
        textNode.data = textNode.data.replace(/^\u200b+/, '');
        if (textNode.length === 0) {
          textNode.remove();
        }
      }
      mention.replaceWith(document.createTextNode(mention.textContent ?? ''));
    }
    el.normalize();
    if (offsets) {
      restoreCaret(offsets.start, offsets.end);
    }
    return true;
  }, [restoreCaret]);

  const checkForMentionTrigger = useCallback(() => {
    const el = editorRef.current;
    if (!el) return;
    const plain = getPlainText(el);
    const caretPos = saveCaret();
    const textBeforeCaret = plain.slice(0, caretPos);
    const match = textBeforeCaret.match(/@(\w*)$/);
    if (match) {
      setShowDropdown(true);
      setDropdownFilter(match[1]);
      setSelectedIndex(0);
    } else {
      setShowDropdown(false);
    }
  }, [saveCaret]);

  const handleBeforeInput = useCallback((e: React.FormEvent<HTMLDivElement>) => {
    const nativeEvent = e.nativeEvent as InputEvent | undefined;
    if (!nativeEvent) return;
    if (nativeEvent.inputType === 'historyUndo' || nativeEvent.inputType === 'historyRedo') {
      return;
    }
    breakMentionAtSelection();
  }, [breakMentionAtSelection]);

  const handleInput = useCallback(() => {
    const el = editorRef.current;
    if (!el) return;
    breakMentionAtSelection();
    setIsEmpty(getPlainText(el).trim().length === 0);
    checkForMentionTrigger();
  }, [breakMentionAtSelection, checkForMentionTrigger]);

  const insertMention = useCallback(
    (user: User) => {
      const el = editorRef.current;
      if (!el) return;
      el.focus();

      const plain = getPlainText(el);
      const caretPos = saveCaret();
      const textBeforeCaret = plain.slice(0, caretPos);
      const match = textBeforeCaret.match(/@(\w*)$/);
      if (match) {
        restoreCaret(caretPos - match[0].length, caretPos);
      }

      document.execCommand(
        'insertHTML',
        false,
        `<span class="mention">@${user.username}</span>&nbsp;`
      );
      setShowDropdown(false);
      setIsEmpty(false);
    },
    [restoreCaret, saveCaret]
  );

  const handleSend = useCallback(() => {
    const el = editorRef.current;
    if (!el) return;
    const text = getPlainText(el).trim();
    if (!text) return;
    onSend?.(text);
    el.innerHTML = '';
    setIsEmpty(true);
    setShowDropdown(false);
  }, [onSend]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (showDropdown) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          setSelectedIndex((i) => Math.min(i + 1, filteredUsers.length - 1));
          return;
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          setSelectedIndex((i) => Math.max(i - 1, 0));
          return;
        }
        if (e.key === 'Enter' || e.key === 'Tab') {
          if (filteredUsers.length > 0) {
            e.preventDefault();
            insertMention(filteredUsers[selectedIndex]);
            return;
          }
        }
        if (e.key === 'Escape') {
          e.preventDefault();
          setShowDropdown(false);
          return;
        }
      }

      if (e.key === 'Enter') {
        if (!e.shiftKey) {
          e.preventDefault();
          handleSend();
        } else {
          e.preventDefault();
          document.execCommand('insertLineBreak');
        }
      }
    },
    [showDropdown, filteredUsers, selectedIndex, insertMention, handleSend]
  );

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    e.preventDefault();

    const el = editorRef.current;
    if (!el) return;

    const text = (e.clipboardData?.getData('text/plain') || '').replace(/\r\n?/g, '\n');
    if (!text) return;

    el.focus();
    breakMentionAtSelection();

    if (containsKnownMention(text) || text.includes('\n')) {
      const lines = text.split('\n');

      lines.forEach((line, lineIndex) => {
        let lastIndex = 0;

        for (const match of line.matchAll(/@(\w+)/g)) {
          const fullMatch = match[0];
          const username = match[1];
          const matchIndex = match.index ?? 0;
          const leadingText = line.slice(lastIndex, matchIndex);

          if (leadingText) {
            document.execCommand('insertText', false, leadingText);
          }

          if (isKnownUser(username)) {
            document.execCommand(
              'insertHTML',
              false,
              `<span class="mention">${fullMatch}</span>${MENTION_SEPARATOR}`
            );
          } else {
            document.execCommand('insertText', false, fullMatch);
          }

          lastIndex = matchIndex + fullMatch.length;
        }

        const trailingText = line.slice(lastIndex);
        if (trailingText) {
          document.execCommand('insertText', false, trailingText);
        }

        if (lineIndex < lines.length - 1) {
          document.execCommand('insertLineBreak');
        }
      });
    } else {
      document.execCommand('insertText', false, text);
    }

    setIsEmpty(getPlainText(el).trim().length === 0);
    checkForMentionTrigger();
  }, [breakMentionAtSelection, checkForMentionTrigger]);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (editorRef.current && !editorRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div className="simple-chatbox">
      <div className="chatbox-wrapper">
        {isEmpty && (
          <div className="chatbox-placeholder">{placeholder}</div>
        )}
        <div
          ref={editorRef}
          className="chatbox-editor"
          contentEditable
          onBeforeInput={handleBeforeInput}
          onInput={handleInput}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          role="textbox"
          aria-multiline="true"
          aria-placeholder={placeholder}
        />
        {showDropdown && filteredUsers.length > 0 && (
          <div className="mention-dropdown">
            {filteredUsers.map((user, i) => (
              <div
                key={user.username}
                className={`mention-option ${i === selectedIndex ? 'selected' : ''}`}
                onMouseDown={(e) => {
                  e.preventDefault();
                  insertMention(user);
                }}
                onMouseEnter={() => setSelectedIndex(i)}
              >
                <span className="mention-username">@{user.username}</span>
                <span className="mention-name">{user.displayName}</span>
              </div>
            ))}
          </div>
        )}
      </div>
      <button className="send-button" onClick={handleSend} disabled={isEmpty}>
        Send
      </button>
    </div>
  );
}
