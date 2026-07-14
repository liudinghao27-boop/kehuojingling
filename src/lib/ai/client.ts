import OpenAI from 'openai';

let openai: OpenAI | null = null;

export function getAIClient(): OpenAI {
  if (!openai) {
    openai = createAIClient(process.env.OPENAI_API_KEY);
  }
  return openai;
}

export function createAIClient(apiKey?: string): OpenAI {
  return new OpenAI({
    apiKey: apiKey || process.env.OPENAI_API_KEY || '',
    baseURL: process.env.OPENAI_BASE_URL || 'https://api.deepseek.com/v1',
  });
}

export function getAIModel(): string {
  return process.env.OPENAI_MODEL || 'deepseek-v4-flash';
}

export function hasAIKeyConfigured(apiKey?: string): boolean {
  return !!(apiKey || process.env.OPENAI_API_KEY);
}
