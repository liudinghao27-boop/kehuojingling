"use client";

import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const result = await signIn('credentials', {
        email,
        password,
        redirect: false,
      });

      if (result?.error) {
        setError('邮箱或密码错误');
        return;
      }

      router.push('/dashboard');
      router.refresh();
    } catch {
      setError('登录失败，请稍后重试');
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
          <h1 className="text-3xl font-bold text-gray-900 tracking-tight">登录</h1>
          <p className="mt-2 text-sm text-gray-400">获客精灵</p>
        </div>

        {error && (
          <div className="mb-6 bg-gray-50 text-gray-900 px-4 py-3 rounded-2xl text-sm text-center">
            {error}
          </div>
        )}

        <form className="space-y-5" onSubmit={handleSubmit}>
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
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3.5 text-sm font-medium text-white bg-gray-900 rounded-full hover:bg-gray-800 active:scale-95 transition-all disabled:opacity-50"
          >
            {loading ? '登录中...' : '登录'}
          </button>
        </form>

        <div className="mt-8 text-center">
          <p className="text-sm text-gray-400">
            还没有账号？{' '}
            <Link href="/register" className="text-gray-900 hover:text-gray-600 transition-colors">
              立即注册
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
