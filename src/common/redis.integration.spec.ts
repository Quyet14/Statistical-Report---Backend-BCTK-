import net from 'node:net';
import { randomUUID } from 'node:crypto';
import { connectRateLimitStores } from './rate-limit-stores';

const run =
  process.env.RUN_REDIS_INTEGRATION === 'true' ? describe : describe.skip;
run(
  'Real Redis: shared counters and reconnect after a transport interruption',
  () => {
    it('fails closed during outage and resumes with the same shared bucket', async () => {
      const realUrl = new URL(
        process.env.REDIS_INTEGRATION_URL ?? 'redis://127.0.0.1:6379',
      );
      if (
        realUrl.protocol !== 'redis:' ||
        !['127.0.0.1', 'localhost', '[::1]'].includes(realUrl.hostname)
      )
        throw new Error('Integration tests require a dedicated loopback Redis');
      const sockets = new Set<net.Socket>();
      let offline = false;
      const proxy = net.createServer((socket) => {
        if (offline) {
          socket.destroy();
          return;
        }
        const upstream = net.connect({
          host: realUrl.hostname.replace(/[\[\]]/g, ''),
          port: Number(realUrl.port || 6379),
        });
        for (const connection of [socket, upstream]) {
          sockets.add(connection);
          connection.on('close', () => sockets.delete(connection));
          connection.on('error', () => {
            socket.destroy();
            upstream.destroy();
          });
        }
        socket.pipe(upstream);
        upstream.pipe(socket);
      });
      await new Promise<void>((resolve) =>
        proxy.listen(0, '127.0.0.1', resolve),
      );
      const originalUrl = process.env.RATE_LIMIT_REDIS_URL;
      const originalPrefix = process.env.RATE_LIMIT_PREFIX;
      const forwardedUrl = new URL(realUrl);
      forwardedUrl.hostname = '127.0.0.1';
      forwardedUrl.port = String((proxy.address() as net.AddressInfo).port);
      process.env.RATE_LIMIT_REDIS_URL = forwardedUrl.toString();
      process.env.RATE_LIMIT_PREFIX = `careops-integration:${randomUUID()}:`;
      let first: Awaited<ReturnType<typeof connectRateLimitStores>> | undefined;
      let second: typeof first;
      const until = async (condition: () => boolean) => {
        const end = Date.now() + 15000;
        while (!condition()) {
          if (Date.now() >= end) throw new Error('Readiness did not change');
          await new Promise((resolve) => setTimeout(resolve, 50));
        }
      };
      try {
        first = await connectRateLimitStores();
        second = await connectRateLimitStores();
        for (const store of [
          ...Object.values(first.stores!),
          ...Object.values(second.stores!),
        ])
          await store.init?.({ windowMs: 60000 } as any);
        expect((await first.stores!.api.increment('probe')).totalHits).toBe(1);
        expect((await second.stores!.api.increment('probe')).totalHits).toBe(2);
        offline = true;
        for (const socket of sockets) socket.destroy();
        await until(() => !first!.ready() && !second!.ready());
        await expect(first.stores!.api.increment('probe')).rejects.toThrow();
        offline = false;
        await until(() => first!.ready() && second!.ready());
        expect((await second.stores!.api.increment('probe')).totalHits).toBe(3);
        for (const store of Object.values(first.stores!))
          await store.resetKey('probe');
      } finally {
        await first?.close();
        await second?.close();
        for (const socket of sockets) socket.destroy();
        await new Promise<void>((resolve) => proxy.close(() => resolve()));
        if (originalUrl === undefined) delete process.env.RATE_LIMIT_REDIS_URL;
        else process.env.RATE_LIMIT_REDIS_URL = originalUrl;
        if (originalPrefix === undefined) delete process.env.RATE_LIMIT_PREFIX;
        else process.env.RATE_LIMIT_PREFIX = originalPrefix;
      }
    }, 45000);
  },
);
