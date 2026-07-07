export interface User {
  id: string;
  email: string;
  name: string | null;
  plan: 'FREE' | 'BASIC' | 'PRO' | 'ENTERPRISE';
  createdAt: Date;
}

export interface Video {
  id: string;
  url: string;
  platform: 'DOUYIN' | 'KUAISHOU' | 'SHIPINHAO';
  title: string | null;
  author: string | null;
  status: 'MONITORING' | 'PAUSED' | 'COMPLETED' | 'ERROR';
  createdAt: Date;
}

export interface Comment {
  id: string;
  content: string;
  authorName: string;
  authorAvatar: string | null;
  intentScore: number;
  intentKeywords: string[];
  status: 'NEW' | 'ANALYZED' | 'REPLIED' | 'DM_SENT' | 'CONVERTED';
  createdAt: Date;
}

export interface Stats {
  totalVideos: number;
  totalComments: number;
  highIntentComments: number;
  repliesSent: number;
  dmsSent: number;
  conversionRate: number;
}
