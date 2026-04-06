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

const MENTION_REGEX = /@(\w+)/g;

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function highlightMentions(text: string): string {
  return escapeHtml(text).replace(MENTION_REGEX, (match, username) => {
    if (MOCK_USERS.some((u) => u.username === username)) {
      return `<span class="mention">${match}</span>`;
    }
    return match;
  });
}

function getPlainText(el: HTMLElement): string {
  // Walk the DOM to extract text, converting <br> and block boundaries to newlines
  let text = '';
  for (const node of el.childNodes) {
    if (node.nodeType === Node.TEXT_NODE) {
      text += node.textContent;
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
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount || !editorRef.current) return 0;

    const range = sel.getRangeAt(0);
    const el = editorRef.current;

    // Walk all nodes and count characters + BRs up to caret position
    let offset = 0;
    const walker = document.createTreeWalker(
      el,
      NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT,
      {
        acceptNode: (node) => {
          if (node.nodeType === Node.TEXT_NODE) return NodeFilter.FILTER_ACCEPT;
          if (node.nodeName === 'BR') return NodeFilter.FILTER_ACCEPT;
          return NodeFilter.FILTER_SKIP;
        }
      }
    );

    let node: Node | null;
    while ((node = walker.nextNode())) {
      if (node === range.startContainer) {
        // Caret is in this text node
        offset += range.startOffset;
        break;
      }

      if (node.nodeType === Node.TEXT_NODE) {
        offset += (node as Text).length;
      } else if (node.nodeName === 'BR') {
        offset += 1;
      }

      // Check if caret is right after a BR (parent node positioning)
      if (range.startContainer === el || range.startContainer.nodeType === Node.ELEMENT_NODE) {
        const container = range.startContainer as Element;
        const children = Array.from(container.childNodes);
        const nodeIndex = children.indexOf(node as ChildNode);
        if (nodeIndex !== -1 && nodeIndex < range.startOffset) {
          // We've passed this node
        } else if (nodeIndex === range.startOffset - 1 && node.nodeName === 'BR') {
          offset += 1;
          break;
        }
      }
    }

    return offset;
  }, []);

  const restoreCaret = useCallback((targetOffset: number) => {
    const el = editorRef.current;
    if (!el) return;

    const walker = document.createTreeWalker(
      el,
      NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT,
      {
        acceptNode: (node) => {
          if (node.nodeType === Node.TEXT_NODE) return NodeFilter.FILTER_ACCEPT;
          if (node.nodeName === 'BR') return NodeFilter.FILTER_ACCEPT;
          return NodeFilter.FILTER_SKIP;
        }
      }
    );

    let currentOffset = 0;
    let node: Node | null;

    while ((node = walker.nextNode())) {
      if (node.nodeType === Node.TEXT_NODE) {
        const textNode = node as Text;
        const len = textNode.length;
        if (currentOffset + len >= targetOffset) {
          // Caret goes inside this text node
          const sel = window.getSelection();
          const range = document.createRange();
          range.setStart(textNode, targetOffset - currentOffset);
          range.collapse(true);
          sel?.removeAllRanges();
          sel?.addRange(range);
          return;
        }
        currentOffset += len;
      } else if (node.nodeName === 'BR') {
        currentOffset += 1;
        if (currentOffset >= targetOffset) {
          // Caret goes right after this BR
          const sel = window.getSelection();
          const range = document.createRange();
          const parent = node.parentNode!;
          const brIndex = Array.from(parent.childNodes).indexOf(node as ChildNode);
          range.setStart(parent, brIndex + 1);
          range.collapse(true);
          sel?.removeAllRanges();
          sel?.addRange(range);
          return;
        }
      }
    }

    // Fallback: put caret at end
    const sel = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    sel?.removeAllRanges();
    sel?.addRange(range);
  }, []);

  const rehighlight = useCallback(() => {
    const el = editorRef.current;
    if (!el) return;
    const caretPos = saveCaret();
    const plain = getPlainText(el);
    // Convert newlines to <br> for contenteditable, then highlight mentions
    const lines = plain.split('\n');
    const html = lines.map((line) => highlightMentions(line)).join('<br>');
    el.innerHTML = html;
    restoreCaret(caretPos);
  }, [saveCaret, restoreCaret]);

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

  const handleInput = useCallback(() => {
    const el = editorRef.current;
    if (!el) return;
    setIsEmpty(getPlainText(el).trim().length === 0);
    rehighlight();
    checkForMentionTrigger();
  }, [rehighlight, checkForMentionTrigger]);

  const insertMention = useCallback(
    (user: User) => {
      const el = editorRef.current;
      if (!el) return;
      el.focus();

      // Delete the partial @query before inserting
      const plain = getPlainText(el);
      const caretPos = saveCaret();
      const textBeforeCaret = plain.slice(0, caretPos);
      const match = textBeforeCaret.match(/@(\w*)$/);
      if (match) {
        // Select and delete the @partial text
        const deleteCount = match[0].length;
        for (let i = 0; i < deleteCount; i++) {
          document.execCommand('delete', false);
        }
      }

      document.execCommand(
        'insertHTML',
        false,
        `<span class="mention">@${user.username}</span>&nbsp;`
      );
      setShowDropdown(false);
      setIsEmpty(false);
      // Re-run highlight after insertion
      setTimeout(() => rehighlight(), 0);
    },
    [saveCaret, rehighlight]
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
    const text = e.clipboardData?.getData('text/plain') || '';
    document.execCommand('insertText', false, text);
  }, []);

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
