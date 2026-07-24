/**
 * 代理解析工具
 *
 * 队列侧会把账号级代理放在 credentials.proxyUrl，
 * 形态如 http://user:pass@host:port 或 socks5://host:port。
 * Playwright 的 proxy 是 launch 级选项，需要 { server, username, password } 结构。
 */

export type PlaywrightProxyOptions = {
  server: string;
  username?: string;
  password?: string;
};

const SUPPORTED_PROTOCOLS = new Set(['http', 'https', 'socks5']);

/**
 * 把代理 URL 解析为 Playwright launch 选项所需的 proxy 结构。
 * 非法格式或不支持的协议直接抛错，让调用方尽早暴露配置问题。
 */
export function parseProxyUrl(proxyUrl: string): PlaywrightProxyOptions {
  let url: URL;
  try {
    url = new URL(proxyUrl);
  } catch {
    throw new Error(`代理地址格式无效: ${proxyUrl}`);
  }

  const protocol = url.protocol.replace(':', '').toLowerCase();
  if (!SUPPORTED_PROTOCOLS.has(protocol)) {
    throw new Error(`不支持的代理协议: ${protocol}（仅支持 http/https/socks5）`);
  }
  if (!url.hostname) {
    throw new Error(`代理地址缺少主机名: ${proxyUrl}`);
  }

  // url.host 已包含端口；Playwright 要求 server 带协议前缀
  const result: PlaywrightProxyOptions = {
    server: `${protocol}://${url.host}`,
  };
  // 认证信息可能是 URL 编码的（密码常含 @ # 等字符）
  if (url.username) {
    result.username = decodeURIComponent(url.username);
  }
  if (url.password) {
    result.password = decodeURIComponent(url.password);
  }
  return result;
}
