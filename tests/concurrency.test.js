import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const PORT = 47811;
process.env.SERVER_PORT = String(PORT);
process.env.ROUTING_PATH = fileURLToPath(new URL('./fixtures/routes', import.meta.url));
process.env.JWT_SECRET = 'test-secret';
process.env.JWT_SALT = '10';

const { init, AuthService } = await import('../dist/index.js');

const accounts = { 1: { id: 1, name: 'first' }, 2: { id: 2, name: 'second' } };

await init({
    accountResolver: async (userId) => {
        await new Promise(r => setTimeout(r, 10));
        return accounts[userId] ?? null;
    },
    permissionsResolver: () => [],
});

const call = (userId, note) => fetch(`http://localhost:${PORT}/api/v1/whoami`, {
    method: 'POST',
    headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${AuthService.generate({ userId })}`,
    },
    body: JSON.stringify({ note }),
}).then(r => r.json());

test('concurrent requests on the same endpoint do not share request data', async () => {
    const [first, second] = await Promise.all([
        call(1, 'note-1'),
        new Promise(r => setTimeout(r, 30)).then(() => call(2, 'note-2')),
    ]);

    assert.deepEqual(first, { noteBefore: 'note-1', noteAfter: 'note-1', account: 'first', tokenUserId: 1 });
    assert.deepEqual(second, { noteBefore: 'note-2', noteAfter: 'note-2', account: 'second', tokenUserId: 2 });
});
