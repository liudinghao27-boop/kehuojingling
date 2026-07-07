"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function RegisterPage() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (password !== confirmPassword) {
      setError('两次输入的密码不一致');
      return;
    }

    if (password.length < 6) {
      setError('密码至少6位');
      return;
    }

    setLoading(true);

    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || '注册失败');
        return;
      }

      router.push('/login');
    } catch {
      setError('注册失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-white">
      <div className="w-full max-w-sm px-6">
        <div className="text-center mb-10">
          <div className="w-16 h-16 rounded-2xl bg-gray-900 flex items-center justify-center text-white text-2xl font-bold mx-auto mb-6">
            K
          </div>
          <h1 className="text-3xl font-bold text-gray-900 tracking-tight">注册</h1>
          <p className="mt-2 text-sm text-gray-400">获客精灵</p>
        </div>

        {error && (
          <div className="mb-6 bg-gray-50 text-gray-900 px-4 py-3 rounded-2xl text-sm text-center">
            {error}
          </div>
        )}

        <form className="space-y-5" onSubmit={handleSubmit}>
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-2">
              昵称
            </label>
            <input
              id="name"
              name="name"
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="block w-full rounded-2xl bg-gray-50 border-0 px-4 py-3.5 text-gray-900 text-sm focus:bg-white focus:ring-2 focus:ring-gray-200 transition-all"
              placeholder="您的昵称"
            />
          </div>

          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
              邮箱
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="block w-full rounded-2xl bg-gray-50 border-0 px-4 py-3.5 text-gray-900 text-sm focus:bg-white focus:ring-2 focus:ring-gray-200 transition-all"
              placeholder="your@email.com"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
              密码
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="block w-full rounded-2xl bg-gray-50 border-0 px-4 py-3.5 text-gray-900 text-sm focus:bg-white focus:ring-2 focus:ring-gray-200 transition-all"
              placeholder="至少6位密码"
            />
          </div>

          <div>
            <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-2">
              确认密码
            </label>
            <input
              id="confirmPassword"
              name="confirmPassword"
              type="password"
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="block w-full rounded-2xl bg-gray-50 border-0 px-4 py-3.5 text-gray-900 text-sm focus:bg-white focus:ring-2 focus:ring-gray-200 transition-all"
              placeholder="再次输入密码"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3.5 text-sm font-medium text-white bg-gray-900 rounded-full hover:bg-gray-800 active:scale-95 transition-all disabled:opacity-50"
          >
            {loading ? '注册中...' : '创建账号'}
          </button>
        </form>

        <div className="mt-8 text-center">
          <p className="text-sm text-gray-400">
            已有账号？{' '}
            <Link href="/login" className="text-gray-900 hover:text-gray-600 transition-colors">
              立即登录
            </Link>
          </p>
        </div>

        <p className="mt-12 text-center text-xs text-gray-300">
          © 2024 获客精灵
        </p>
      </div>
    </div>
  );
}
