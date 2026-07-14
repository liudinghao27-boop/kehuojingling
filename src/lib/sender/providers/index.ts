import { SenderProvider } from '../types';
import { mockProvider } from './mock';
import { douyinProvider } from './douyin';

export const providers: Record<string, SenderProvider> = {
  mock: mockProvider,
  douyin: douyinProvider,
};
