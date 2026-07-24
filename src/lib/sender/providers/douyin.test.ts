/**
 * Douyin sender provider 单元测试
 *
 * 通过 vi.mock('playwright') 拦截浏览器启动，不运行真实 Chromium。
 */

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { Browser, BrowserContext, Page, Locator, ElementHandle } from 'playwright';

vi.mock('playwright', async () => {
  return {
    chromium: {
      launch: vi.fn(),
      launchPersistentContext: vi.fn(),
    },
  };
});

vi.mock('../utils', () => ({
  sleep: () => Promise.resolve(),
  randomDelay: () => Promise.resolve(),
}));

import { chromium } from 'playwright';
import {
  parseCookies,
  getCookies,
  douyinProvider,
} from './douyin';
import type { SendDmParams, SendReplyParams } from '../types';

type LocatorConfig = {
  visible?: boolean;
  count?: number;
  attribute?: Record<string, string>;
  evaluateResult?: unknown;
};

function createFakeLocator(config: LocatorConfig = {}): Locator {
  const self: Locator = {
    first: () => self,
    filter: () => self,
    locator: () => self,
    isVisible: () => Promise.resolve(config.visible ?? false),
    count: () => Promise.resolve(config.count ?? 1),
    nth: () => self,
    last: () => self,
    click: () => Promise.resolve(),
    fill: () => Promise.resolve(),
    press: () => Promise.resolve(),
    pressSequentially: () => Promise.resolve(),
    getAttribute: (name: string) => Promise.resolve(config.attribute?.[name] ?? ''),
    evaluate: () => Promise.resolve(config.evaluateResult),
  } as unknown as Locator;
  return self;
}

type PageConfig = {
  locators?: Record<string, Locator>;
  evaluateSequence?: unknown[];
  urlValue?: string;
  onEventHandlers?: Record<string, ((...args: unknown[]) => void)[]>;
};

function createFakePage(config: PageConfig = {}): Page {
  let evaluateIndex = 0;
  const handlers: Record<string, ((...args: unknown[]) => void)[]> = config.onEventHandlers ?? {};

  const page: Page = {
    goto: vi.fn(() => Promise.resolve(undefined as unknown as Response)),
    url: vi.fn(() => config.urlValue ?? 'https://www.douyin.com/video/123'),
    waitForTimeout: () => Promise.resolve(),
    waitForLoadState: () => Promise.resolve(),
    waitForSelector: () => Promise.resolve(createFakeLocator() as unknown as ElementHandle<Node>),
    setDefaultTimeout: () => {},
    screenshot: () => Promise.resolve(Buffer.from('')),
    close: () => Promise.resolve(),
    // 拟人化浏览会用到鼠标滚动/移动
    mouse: {
      wheel: () => Promise.resolve(),
      move: () => Promise.resolve(),
    },
    on: (event: string, handler: (...args: unknown[]) => void) => {
      if (!handlers[event]) handlers[event] = [];
      handlers[event].push(handler);
    },
    context: () => fakeContext,
    evaluate: () => {
      const result = config.evaluateSequence?.[evaluateIndex];
      evaluateIndex++;
      return Promise.resolve(result);
    },
    evaluateHandle: () =>
      Promise.resolve({
        asElement: () => createFakeLocator() as unknown as ElementHandle<Node>,
      } as unknown as ElementHandle<Node>),
    locator: (selector: string) => {
      if (config.locators?.[selector]) return config.locators[selector];
      // 动态标记选择器默认可见且 evaluate 返回 true，便于覆盖评论/作者容器
      if (selector.includes('[data-douyin-sender')) {
        return createFakeLocator({ visible: true, evaluateResult: true });
      }
      return createFakeLocator();
    },
  } as unknown as Page;

  return page;
}

const fakePage = createFakePage();

const fakeContext: BrowserContext = {
  browser: () => fakeBrowser,
  newPage: () => Promise.resolve(fakePage),
  addCookies: () => Promise.resolve(),
  addInitScript: () => Promise.resolve(),
  setDefaultTimeout: () => {},
  waitForEvent: () => Promise.resolve(null),
  pages: () => Promise.resolve([]),
  close: () => Promise.resolve(),
} as unknown as BrowserContext;

const fakeBrowser: Browser = {
  newContext: () => Promise.resolve(fakeContext),
  close: () => Promise.resolve(),
  process: () => undefined,
} as unknown as Browser;

function setupLaunchMock(page: Page = fakePage) {
  const mocked = chromium as unknown as {
    launch: ReturnType<typeof vi.fn>;
    launchPersistentContext: ReturnType<typeof vi.fn>;
  };
  mocked.launch.mockResolvedValue({
    ...fakeBrowser,
    newContext: () => Promise.resolve({
      ...fakeContext,
      newPage: () => Promise.resolve(page),
    }),
  } as Browser);
  mocked.launchPersistentContext.mockResolvedValue({
    ...fakeContext,
    newPage: () => Promise.resolve(page),
  } as BrowserContext);
}

describe('parseCookies', () => {
  it('parses JSON array format', () => {
    const raw = JSON.stringify([
      { name: 'sessionid', value: 'abc', domain: '.douyin.com', path: '/' },
      { name: 'ttwid', value: 'def' },
    ]);
    const cookies = parseCookies(raw);
    expect(cookies).toHaveLength(2);
    expect(cookies[0]).toEqual({
      name: 'sessionid',
      value: 'abc',
      domain: '.douyin.com',
      path: '/',
    });
    expect(cookies[1]).toEqual({
      name: 'ttwid',
      value: 'def',
      domain: '.douyin.com',
      path: '/',
    });
  });

  it('parses JSON object format', () => {
    const raw = JSON.stringify({ name: 'sessionid', value: 'abc' });
    const cookies = parseCookies(raw);
    expect(cookies).toHaveLength(1);
    expect(cookies[0]).toEqual({
      name: 'sessionid',
      value: 'abc',
      domain: '.douyin.com',
      path: '/',
    });
  });

  it('parses key=value; ... string format', () => {
    const raw = 'sessionid=abc; ttwid=hello%20world';
    const cookies = parseCookies(raw);
    expect(cookies).toHaveLength(2);
    expect(cookies[0]).toEqual({
      name: 'sessionid',
      value: 'abc',
      domain: '.douyin.com',
      path: '/',
    });
    expect(cookies[1]).toEqual({
      name: 'ttwid',
      value: 'hello world',
      domain: '.douyin.com',
      path: '/',
    });
  });

  it('returns empty array for empty or invalid input', () => {
    expect(parseCookies('')).toEqual([]);
    expect(parseCookies('   ')).toEqual([]);
    expect(parseCookies('noequalsign')).toEqual([]);
  });
});

describe('getCookies', () => {
  afterEach(() => {
    delete process.env.DOUYIN_COOKIES;
  });

  it('prefers credentials.cookies over env var', () => {
    process.env.DOUYIN_COOKIES = 'env-cookie';
    const params = {
      credentials: { cookies: 'credential-cookie' },
    } as unknown as SendReplyParams;
    expect(getCookies(params)).toBe('credential-cookie');
  });

  it('falls back to DOUYIN_COOKIES env var', () => {
    process.env.DOUYIN_COOKIES = 'env-cookie';
    const params = {} as SendReplyParams;
    expect(getCookies(params)).toBe('env-cookie');
  });

  it('returns undefined when neither is set', () => {
    const params = {} as SendReplyParams;
    expect(getCookies(params)).toBeUndefined();
  });
});

describe('douyinProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupLaunchMock();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe('validateCredentials', () => {
    it('returns valid when logged-in indicators are visible', async () => {
      const page = createFakePage({
        locators: {
          'text=推荐': createFakeLocator({ visible: true }),
          'text=发布': createFakeLocator({ visible: false }),
          'text=登录': createFakeLocator({ visible: false }),
        },
      });
      setupLaunchMock(page);

      const result = await douyinProvider.validateCredentials({
        cookies: JSON.stringify([{ name: 'sessionid', value: 'abc' }]),
      });
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('returns invalid when login prompt is visible', async () => {
      const page = createFakePage({
        locators: {
          'text=推荐': createFakeLocator({ visible: true }),
          'text=发布': createFakeLocator({ visible: false }),
          'text=登录': createFakeLocator({ visible: true }),
        },
      });
      setupLaunchMock(page);

      const result = await douyinProvider.validateCredentials({
        cookies: JSON.stringify([{ name: 'sessionid', value: 'abc' }]),
      });
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Cookie 失效或无法登录抖音');
    });

    it('returns invalid when cookies are missing', async () => {
      const result = await douyinProvider.validateCredentials({});
      expect(result.valid).toBe(false);
      expect(result.error).toBe('未提供 Cookie');
    });
  });

  describe('sendReply', () => {
    const replyParams: SendReplyParams = {
      userId: 'u1',
      platform: 'DOUYIN',
      videoUrl: 'https://www.douyin.com/video/123',
      commentId: 'c1',
      authorName: '作者',
      commentContent: '这条评论内容很长用于匹配',
      content: '感谢支持！',
      credentials: {
        cookies: JSON.stringify([{ name: 'sessionid', value: 'abc' }]),
      },
    };

    it('returns success on happy path', async () => {
      const page = createFakePage({
        urlValue: 'https://www.douyin.com/video/123',
        locators: {
          'text=最新': createFakeLocator({ visible: false }),
          [`[data-douyin-sender-`]: createFakeLocator({ visible: true }),
          'text=回复': createFakeLocator({ visible: true }),
          'textarea, [contenteditable="true"]': createFakeLocator({
            visible: true,
            count: 1,
            evaluateResult: true,
          }),
        },
        evaluateSequence: [
          null, // detectAuthDialog
          undefined, // prepareCommentSection scroll
          true, // findCommentByJs: found
          true, // input click send button
          null, // detectBlock
          false, // publishFailed
          true, // verifyReplyPublished
        ],
      });
      setupLaunchMock(page);

      const result = await douyinProvider.sendReply(replyParams);
      expect(result.success).toBe(true);
    });

    it('returns failure when comment container is not found', async () => {
      const page = createFakePage({
        urlValue: 'https://www.douyin.com/video/123',
        locators: {
          'text=最新': createFakeLocator({ visible: false }),
        },
        evaluateSequence: [
          null, // detectAuthDialog
          undefined, // prepareCommentSection scroll
          false, // findCommentByJs: not found
        ],
      });
      setupLaunchMock(page);

      const result = await douyinProvider.sendReply(replyParams);
      expect(result.success).toBe(false);
      expect(result.error).toContain('未找到目标评论内容');
    });

    it('returns failure when cookies are missing', async () => {
      const result = await douyinProvider.sendReply({
        ...replyParams,
        credentials: {},
      });
      expect(result.success).toBe(false);
      expect(result.error).toBe('未配置抖音 Cookie');
    });
  });

  describe('sendDm', () => {
    const dmParams: SendDmParams = {
      userId: 'u1',
      platform: 'DOUYIN',
      videoUrl: 'https://www.douyin.com/video/123',
      commentId: 'c1',
      authorName: '作者',
      commentContent: '这条评论内容很长用于匹配',
      content: '您好！',
      credentials: {
        cookies: JSON.stringify([{ name: 'sessionid', value: 'abc' }]),
      },
    };

    it('returns success on happy path', async () => {
      const page = createFakePage({
        urlValue: 'https://www.douyin.com/video/123',
        locators: {
          'text=最新': createFakeLocator({ visible: false }),
          [`[data-douyin-sender-`]: createFakeLocator({ visible: true }),
          [`[data-douyin-sender-author-`]: createFakeLocator({ visible: true }),
          'textarea, [contenteditable="true"]': createFakeLocator({ visible: true }),
        },
        evaluateSequence: [
          null, // detectAuthDialog
          undefined, // prepareCommentSection scroll
          true, // findCommentByJs: found
          true, // authorFound
          true, // dmClicked
          true, // inputFound
          true, // sendClicked
        ],
      });
      setupLaunchMock(page);

      const result = await douyinProvider.sendDm(dmParams);
      expect(result.success).toBe(true);
    });

    it('returns failure when comment container is not found', async () => {
      const page = createFakePage({
        urlValue: 'https://www.douyin.com/video/123',
        locators: {
          'text=最新': createFakeLocator({ visible: false }),
        },
        evaluateSequence: [
          null, // detectAuthDialog
          undefined, // prepareCommentSection scroll
          false, // findCommentByJs: not found
        ],
      });
      setupLaunchMock(page);

      const result = await douyinProvider.sendDm(dmParams);
      expect(result.success).toBe(false);
      expect(result.error).toContain('未找到目标评论内容');
    });

    it('returns failure when cookies are missing', async () => {
      const result = await douyinProvider.sendDm({
        ...dmParams,
        credentials: {},
      });
      expect(result.success).toBe(false);
      expect(result.error).toBe('未配置抖音 Cookie');
    });
  });

  describe('proxy 与指纹选项', () => {
    const proxyReplyParams: SendReplyParams = {
      userId: 'u1',
      platform: 'DOUYIN',
      videoUrl: 'https://www.douyin.com/video/123',
      commentId: 'c1',
      authorName: '作者',
      commentContent: '这条评论内容很长用于匹配',
      content: '感谢支持！',
      credentials: {
        cookies: JSON.stringify([{ name: 'sessionid', value: 'abc' }]),
      },
    };

    function createHappyPage(): Page {
      return createFakePage({
        urlValue: 'https://www.douyin.com/video/123',
        locators: {
          'text=最新': createFakeLocator({ visible: false }),
          [`[data-douyin-sender-`]: createFakeLocator({ visible: true }),
          'text=回复': createFakeLocator({ visible: true }),
          'textarea, [contenteditable="true"]': createFakeLocator({
            visible: true,
            count: 1,
            evaluateResult: true,
          }),
        },
        evaluateSequence: [
          null, // detectAuthDialog
          undefined, // prepareCommentSection scroll
          true, // findCommentByJs: found
          true, // input click send button
          null, // detectBlock
          false, // publishFailed
          true, // verifyReplyPublished
        ],
      });
    }

    function mockedChromium() {
      return chromium as unknown as {
        launch: ReturnType<typeof vi.fn>;
        launchPersistentContext: ReturnType<typeof vi.fn>;
      };
    }

    function resetSharedState() {
      const g = globalThis as unknown as Record<string, unknown>;
      g.__douyinSenderBrowser = null;
      g.__douyinSenderContext = null;
      g.__douyinSenderContextPromise = null;
      g.__douyinSenderContextKey = null;
    }

    it('credentials.proxyUrl 会传给 chromium.launch 的 proxy 选项', async () => {
      setupLaunchMock(createHappyPage());

      const result = await douyinProvider.sendReply({
        ...proxyReplyParams,
        credentials: {
          ...proxyReplyParams.credentials,
          proxyUrl: 'http://user:pass@1.2.3.4:8080',
        },
      });
      expect(result.success).toBe(true);
      expect(mockedChromium().launch).toHaveBeenCalledWith(
        expect.objectContaining({
          proxy: {
            server: 'http://1.2.3.4:8080',
            username: 'user',
            password: 'pass',
          },
        })
      );
    });

    it('无 proxyUrl 时 launch 选项不含 proxy', async () => {
      setupLaunchMock(createHappyPage());

      const result = await douyinProvider.sendReply(proxyReplyParams);
      expect(result.success).toBe(true);
      const launchArg = mockedChromium().launch.mock.calls[0][0] as Record<string, unknown>;
      expect(launchArg).not.toHaveProperty('proxy');
    });

    it('非法 proxyUrl 直接失败并提示代理问题', async () => {
      setupLaunchMock(createHappyPage());

      const result = await douyinProvider.sendReply({
        ...proxyReplyParams,
        credentials: {
          ...proxyReplyParams.credentials,
          proxyUrl: 'not-a-valid-url',
        },
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain('代理');
    });

    it('newContext 带上 UA/locale/timezone 与随机 viewport', async () => {
      const page = createHappyPage();
      const newContextMock = vi.fn<(options?: unknown) => Promise<BrowserContext>>(() =>
        Promise.resolve({
          ...fakeContext,
          newPage: () => Promise.resolve(page),
        } as unknown as BrowserContext)
      );
      mockedChromium().launch.mockResolvedValue({
        ...fakeBrowser,
        newContext: newContextMock,
      } as unknown as Browser);

      const result = await douyinProvider.sendReply(proxyReplyParams);
      expect(result.success).toBe(true);
      const contextArg = newContextMock.mock.calls[0][0] as {
        userAgent: string;
        locale: string;
        timezoneId: string;
        viewport: { width: number; height: number };
      };
      expect(contextArg.userAgent).toMatch(/Chrome\/1\d{2}\.0\.0\.0/);
      expect(contextArg.locale).toBe('zh-CN');
      expect(contextArg.timezoneId).toBe('Asia/Shanghai');
      expect(contextArg.viewport.width).toBeGreaterThanOrEqual(1200);
      expect(contextArg.viewport.width).toBeLessThanOrEqual(1440);
      expect(contextArg.viewport.height).toBeGreaterThanOrEqual(720);
      expect(contextArg.viewport.height).toBeLessThanOrEqual(900);
    });

    it('context 上注入反检测 init script', async () => {
      const page = createHappyPage();
      const addInitScriptMock = vi.fn(() => Promise.resolve());
      mockedChromium().launch.mockResolvedValue({
        ...fakeBrowser,
        newContext: () =>
          Promise.resolve({
            ...fakeContext,
            addInitScript: addInitScriptMock,
            newPage: () => Promise.resolve(page),
          } as unknown as BrowserContext),
      } as unknown as Browser);

      await douyinProvider.sendReply(proxyReplyParams);
      expect(addInitScriptMock).toHaveBeenCalledTimes(1);
    });

    it('有头模式共享 context 按 cookies+proxy 区分，proxy 变化会重启', async () => {
      vi.stubEnv('SENDER_HEADLESS', 'false');
      resetSharedState();
      setupLaunchMock(createHappyPage());

      const paramsWithProxy = (proxyUrl: string): SendReplyParams => ({
        ...proxyReplyParams,
        credentials: { ...proxyReplyParams.credentials, proxyUrl },
      });

      await douyinProvider.sendReply(paramsWithProxy('http://a:8080'));
      await douyinProvider.sendReply(paramsWithProxy('http://a:8080'));
      // 相同 cookies+proxy：复用同一个持久化 context，不重启
      expect(mockedChromium().launchPersistentContext).toHaveBeenCalledTimes(1);
      // 第二次启动必须带 proxy 选项
      expect(mockedChromium().launchPersistentContext).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          proxy: { server: 'http://a:8080' },
        })
      );

      await douyinProvider.sendReply(paramsWithProxy('http://b:9090'));
      // proxy 变化：缓存 key 不同，重启浏览器避免串代理
      expect(mockedChromium().launchPersistentContext).toHaveBeenCalledTimes(2);
    });
  });
});
