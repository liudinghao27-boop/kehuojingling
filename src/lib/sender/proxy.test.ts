/**
 * parseProxyUrl 单元测试
 */

import { describe, it, expect } from 'vitest';
import { parseProxyUrl } from './proxy';

describe('parseProxyUrl', () => {
  it('解析带认证的 http 代理', () => {
    expect(parseProxyUrl('http://user:pass@1.2.3.4:8080')).toEqual({
      server: 'http://1.2.3.4:8080',
      username: 'user',
      password: 'pass',
    });
  });

  it('解析不带认证的 http 代理', () => {
    const result = parseProxyUrl('http://1.2.3.4:8080');
    expect(result).toEqual({ server: 'http://1.2.3.4:8080' });
    expect(result.username).toBeUndefined();
    expect(result.password).toBeUndefined();
  });

  it('解析 socks5 代理', () => {
    expect(parseProxyUrl('socks5://127.0.0.1:1080')).toEqual({
      server: 'socks5://127.0.0.1:1080',
    });
  });

  it('解析带认证的 socks5 代理', () => {
    expect(parseProxyUrl('socks5://u:p@proxy.example.com:1080')).toEqual({
      server: 'socks5://proxy.example.com:1080',
      username: 'u',
      password: 'p',
    });
  });

  it('对认证信息做 URL 解码', () => {
    const result = parseProxyUrl('http://user%40corp:p%40ss%23@host:3128');
    expect(result.username).toBe('user@corp');
    expect(result.password).toBe('p@ss#');
  });

  it('只有用户名没有密码时只返回用户名', () => {
    const result = parseProxyUrl('http://user@host:8080');
    expect(result).toEqual({ server: 'http://host:8080', username: 'user' });
  });

  it('非法 URL 抛错', () => {
    expect(() => parseProxyUrl('not-a-url')).toThrow();
    expect(() => parseProxyUrl('')).toThrow();
  });

  it('不支持的协议抛错', () => {
    expect(() => parseProxyUrl('ftp://host:21')).toThrow(/协议/);
  });

  it('缺少主机名抛错', () => {
    expect(() => parseProxyUrl('http://')).toThrow();
  });
});
