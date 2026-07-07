import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: Date | string): string {
  return new Date(date).toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export function formatNumber(num: number): string {
  if (num >= 10000) {
    return (num / 10000).toFixed(1) + '万';
  }
  if (num >= 1000) {
    return (num / 1000).toFixed(1) + 'k';
  }
  return num.toString();
}

export function truncateText(text: string, maxLength: number = 100): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength) + '...';
}

export function getIntentColor(score: number): string {
  switch (score) {
    case 5: return 'bg-red-500 text-white';
    case 4: return 'bg-orange-500 text-white';
    case 3: return 'bg-yellow-500 text-black';
    case 2: return 'bg-blue-500 text-white';
    default: return 'bg-gray-500 text-white';
  }
}

export function getIntentLabel(score: number): string {
  switch (score) {
    case 5: return '强意向';
    case 4: return '高意向';
    case 3: return '中意向';
    case 2: return '低意向';
    default: return '无意向';
  }
}
