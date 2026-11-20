import type {
  ErrorResponse,
  GroveResponse,
  InitResponse,
  ShareResponse,
  SubmitResponse,
  WaterResponse,
} from '../shared/api';

export const LOCAL = import.meta.env.MODE === 'preview';

type Api = {
  init(): Promise<InitResponse>;
  submit(moves: number[][]): Promise<SubmitResponse>;
  grove(): Promise<GroveResponse>;
  water(owner: string): Promise<WaterResponse>;
  share(): Promise<ShareResponse>;
};

class ApiError extends Error {}

const call = async <T,>(path: string, body?: unknown): Promise<T> => {
  let res: Response;
  try {
    res = await fetch(`/api/${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  } catch {
    throw new ApiError('No connection. Check your network and try again.');
  }
  const data: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const msg =
      data && typeof data === 'object' && 'message' in data
        ? String((data as ErrorResponse).message)
        : `Server said ${res.status}.`;
    throw new ApiError(msg);
  }
  return data as T;
};

const remote: Api = {
  init: () => call('init'),
  submit: (moves) => call('submit', { moves }),
  grove: () => call('grove'),
  water: (owner) => call('water', { owner }),
  share: () => call('share', {}),
};

let localApi: Promise<Api> | null = null;
const getApi = (): Promise<Api> => {
  if (!LOCAL) return Promise.resolve(remote);
  localApi ??= import('./local/mock').then((m) => m.mockApi);
  return localApi;
};

export const api: Api = {
  init: async () => (await getApi()).init(),
  submit: async (m) => (await getApi()).submit(m),
  grove: async () => (await getApi()).grove(),
  water: async (o) => (await getApi()).water(o),
  share: async () => (await getApi()).share(),
};
