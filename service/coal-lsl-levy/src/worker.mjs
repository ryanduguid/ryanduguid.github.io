import { httpServerHandler } from 'cloudflare:node';
import { env } from 'cloudflare:workers';
import { createApp } from './server.mjs';
import { createRegister } from './register.mjs';
import { rateBytes, methodBytes, engineBytes, codeRevision } from '../work/worker-evidence.mjs';

const app = createApp({
  register: createRegister({ rateBytes, methodBytes, engineBytes }),
  codeRevision,
  publicBaseUrl: '/',
  rateLimitScope: 'per client IP, per Cloudflare location; eventually consistent',
  log: () => {},
  // ponytail: Cloudflare counters are local to a location and eventually
  // consistent. A strict global quota would need a coordinated store.
  throttle: {
    async take(_key, request) {
      // Cloudflare supplies this header. Forwarded headers are never trusted.
      const key = request.headers['cf-connecting-ip'] ?? request.socket.remoteAddress ?? 'unknown';
      const { success } = await env.COAL_LSL_RATE_LIMITER.limit({ key });
      return { allowed: success, retryAfterSeconds: 60 };
    },
  },
});

app.server.listen(8080);
export default httpServerHandler({ port: 8080 });
