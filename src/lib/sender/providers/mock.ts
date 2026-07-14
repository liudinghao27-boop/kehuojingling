import {
  SenderProvider,
  SendReplyParams,
  SendDmParams,
  PlatformCredentials,
} from '../types';

export const mockProvider: SenderProvider = {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async sendReply(_: SendReplyParams) {
    return { success: true };
  },

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async sendDm(_: SendDmParams) {
    return { success: true };
  },

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async validateCredentials(_: PlatformCredentials) {
    return { valid: true };
  },
};
