import { handlePublicReaderRequest, type ReaderEnv } from './reader';

export default {
  async fetch(request: Request, env: ReaderEnv): Promise<Response> {
    return handlePublicReaderRequest(request, env);
  },
};
