import { expect, test, type Locator, type Page } from '@playwright/test';

async function getEditor(page: Page): Promise<Locator> {
  return page.locator('.chatbox-editor');
}

async function inspectEditor(page: Page) {
  return await page.evaluate(() => {
    const getPlainText = (el: HTMLElement): string => {
      let text = '';
      for (const node of el.childNodes) {
        if (node.nodeType === Node.TEXT_NODE) {
          text += node.textContent ?? '';
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
    };

    const editor = document.querySelector('.chatbox-editor') as HTMLElement | null;
    if (!editor) {
      throw new Error('Editor not found');
    }

    const selection = window.getSelection();
    if (!selection || !selection.rangeCount) {
      throw new Error('Selection not found');
    }

    const range = selection.getRangeAt(0).cloneRange();
    range.selectNodeContents(editor);
    range.setEnd(selection.getRangeAt(0).startContainer, selection.getRangeAt(0).startOffset);

    const container = document.createElement('div');
    container.append(range.cloneContents());

    const plainText = getPlainText(editor);
    const caretOffset = getPlainText(container).length;
    const beforeCaret = plainText.slice(0, caretOffset);
    const lines = beforeCaret.split('\n');

    return {
      plainText,
      caretOffset,
      line: lines.length,
      column: lines.at(-1)?.length ?? 0,
      html: editor.innerHTML,
    };
  });
}

async function setCaretOffset(page: Page, offset: number) {
  await page.evaluate((targetOffset) => {
    const editor = document.querySelector('.chatbox-editor') as HTMLElement | null;
    if (!editor) {
      throw new Error('Editor not found');
    }

    const selection = window.getSelection();
    const range = document.createRange();
    let pos = 0;

    const getNodeIndex = (node: Node): number =>
      Array.from(node.parentNode?.childNodes ?? []).findIndex((child) => child === node);

    const applyRange = () => {
      range.collapse(true);
      selection?.removeAllRanges();
      selection?.addRange(range);
    };

    const walk = (node: Node): boolean => {
      if (node.nodeType === Node.TEXT_NODE) {
        const textNode = node as Text;
        const nextPos = pos + textNode.length;
        if (targetOffset <= nextPos) {
          range.setStart(textNode, targetOffset - pos);
          applyRange();
          return true;
        }
        pos = nextPos;
        return false;
      }

      if (node.nodeType !== Node.ELEMENT_NODE) {
        return false;
      }

      const element = node as HTMLElement;
      if (element.tagName === 'BR') {
        const parent = element.parentNode;
        if (!parent) return false;

        const nodeIndex = getNodeIndex(element);
        if (targetOffset <= pos) {
          range.setStart(parent, nodeIndex);
          applyRange();
          return true;
        }

        pos += 1;
        if (targetOffset <= pos) {
          range.setStart(parent, nodeIndex + 1);
          applyRange();
          return true;
        }

        return false;
      }

      for (const child of element.childNodes) {
        if (walk(child)) return true;
      }

      return false;
    };

    for (const child of editor.childNodes) {
      if (walk(child)) return;
    }

    range.selectNodeContents(editor);
    range.collapse(false);
    applyRange();
  }, offset);
}

test.describe('SimpleChatbox caret restoration', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.chatbox-editor');
  });

  test('keeps the caret on the next line after Shift+Enter rehighlighting', async ({
    page,
  }) => {
    const editor = await getEditor(page);

    await editor.click();
    await page.keyboard.type('Line one');
    await page.keyboard.press('Shift+Enter');
    await page.waitForTimeout(100);

    const afterBreak = await inspectEditor(page);
    expect(afterBreak.caretOffset).toBe(9);
    expect(afterBreak.line).toBe(2);
    expect(afterBreak.column).toBe(0);
    expect(afterBreak.plainText.startsWith('Line one\n')).toBe(true);

    await page.keyboard.type('Line two');
    await page.waitForTimeout(100);

    const afterTyping = await inspectEditor(page);
    expect(afterTyping.plainText).toBe('Line one\nLine two');
    expect(afterTyping.caretOffset).toBe(17);
    expect(afterTyping.line).toBe(2);
    expect(afterTyping.column).toBe(8);
  });

  test('keeps the caret on the correct line after Backspace following ArrowDown navigation', async ({
    page,
  }) => {
    const editor = await getEditor(page);

    await editor.click();
    for (const line of ['alpha', 'bravo', 'charlie', 'delta']) {
      await page.keyboard.type(line);
      if (line !== 'delta') {
        await page.keyboard.press('Shift+Enter');
      }
    }
    await page.waitForTimeout(100);

    await setCaretOffset(page, 3);
    for (let i = 0; i < 3; i += 1) {
      await page.keyboard.press('ArrowDown');
    }
    await page.waitForTimeout(100);

    const afterArrows = await inspectEditor(page);
    expect(afterArrows.line).toBe(4);
    expect(afterArrows.column).toBe(3);
    expect(afterArrows.caretOffset).toBe(23);

    await page.keyboard.press('Backspace');
    await page.waitForTimeout(100);

    const afterBackspace = await inspectEditor(page);
    expect(afterBackspace.plainText).toBe('alpha\nbravo\ncharlie\ndeta');
    expect(afterBackspace.line).toBe(4);
    expect(afterBackspace.column).toBe(2);
    expect(afterBackspace.caretOffset).toBe(22);
  });
});
