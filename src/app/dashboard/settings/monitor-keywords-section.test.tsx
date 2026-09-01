// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MonitorKeywordsSection } from './monitor-keywords-section';

// React 19 的 act 需要显式声明测试环境
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type KeywordItem = { id: string; keyword: string; source: string | null; createdAt: string };

function makeItem(id: string, keyword: string): KeywordItem {
  return { id, keyword, source: null, createdAt: '2026-08-01T00:00:00.000Z' };
}

// 轻量 fetch 响应，避免依赖 node Response 在 jsdom 下的兼容细节
function jsonOk(data: unknown) {
  return { ok: true, status: 200, json: async () => data } as Response;
}

let container: HTMLDivElement;
let root: Root;
let fetchMock: ReturnType<typeof vi.fn>;

async function renderSection() {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(<MonitorKeywordsSection />);
  });
}

function click(el: Element) {
  el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
}

function deleteButtons(): HTMLButtonElement[] {
  return Array.from(document.body.querySelectorAll('button')).filter(
    (b) => b.textContent?.trim() === '删除'
  ) as HTMLButtonElement[];
}

function findButton(text: string): HTMLButtonElement | undefined {
  return Array.from(document.body.querySelectorAll('button')).find((b) =>
    b.textContent?.includes(text)
  ) as HTMLButtonElement | undefined;
}

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(async () => {
  if (root) {
    await act(async () => {
      root.unmount();
    });
  }
  container?.remove();
  vi.unstubAllGlobals();
});

describe('MonitorKeywordsSection', () => {
  it('加载并展示监控词列表', async () => {
    fetchMock.mockResolvedValueOnce(jsonOk({ items: [makeItem('1', '英语培训'), makeItem('2', '贷款中介')] }));

    await renderSection();

    expect(fetchMock).toHaveBeenCalledWith('/api/keywords/monitor');
    expect(document.body.textContent).toContain('英语培训');
    expect(document.body.textContent).toContain('贷款中介');
  });

  it('词库为空时展示空态文案', async () => {
    fetchMock.mockResolvedValueOnce(jsonOk({ items: [] }));

    await renderSection();

    expect(document.body.textContent).toContain('暂无监控关键词');
  });

  it('删除需确认，确认后调用 DELETE 接口并重新拉取列表', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonOk({ items: [makeItem('1', '英语培训'), makeItem('2', '贷款中介')] }))
      .mockResolvedValueOnce(jsonOk({ success: true }))
      .mockResolvedValueOnce(jsonOk({ items: [makeItem('2', '贷款中介')] }));

    await renderSection();

    // 点击第一行（英语培训）的删除按钮，弹出确认框
    await act(async () => {
      click(deleteButtons()[0]);
    });
    expect(document.body.textContent).toContain('确定要删除关键词「英语培训」吗');

    await act(async () => {
      click(findButton('确认删除')!);
    });

    // DELETE 请求体按后端约定传 keywords 数组，随后重新 GET 刷新
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/keywords/monitor', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ keywords: ['英语培训'] }),
    });
    expect(fetchMock).toHaveBeenNthCalledWith(3, '/api/keywords/monitor');
    expect(document.body.textContent).not.toContain('英语培训');
    expect(document.body.textContent).toContain('贷款中介');
  });

  it('取消删除不发起 DELETE 请求', async () => {
    fetchMock.mockResolvedValueOnce(jsonOk({ items: [makeItem('1', '英语培训')] }));

    await renderSection();

    await act(async () => {
      click(deleteButtons()[0]);
    });
    await act(async () => {
      click(findButton('取消')!);
    });

    // 只有初始 GET，没有 DELETE
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(document.body.textContent).toContain('英语培训');
  });
});
