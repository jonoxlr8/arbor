import assert from 'node:assert/strict';
import test from 'node:test';
import { AdminAccessError, createAdminApi, validReview, type RequestReview } from './ownerAdmin';
const id = '00000000-0000-4000-8000-000000000001';
const row: RequestReview = { id, investment_name: 'Example fund', provider: 'Example provider', received_at: '2026-10-02T23:00:00Z', status: 'new', revision: 0, updated_at: null };
const api = (value: unknown, status = 200) => createAdminApi(async () => 'synthetic', async () => new Response(JSON.stringify(value), { status }));
test('Admin sends only status and expected revision with the current owner token', async () => {
    const client = createAdminApi(async (owner) => { assert.equal(owner, id); return 'synthetic'; }, async (url, options) => {
        assert.match(String(url), new RegExp(`/v2/admin/requests/${id}/status$`));
        assert.equal(options?.cache, 'no-store');
        assert.equal(options?.method, 'PUT');
        assert.equal((options?.headers as Record<string, string>).Authorization, 'Bearer synthetic');
        assert.deepEqual(JSON.parse(String(options?.body)), { status: 'reviewing', expected_revision: 0 });
        return new Response(JSON.stringify({ ...row, status: 'reviewing', revision: 1, updated_at: '2026-10-02T23:01:00+00:00' }));
    });
    assert.equal((await client.change(id, row, 'reviewing')).revision, 1);
});
for (const status of [401, 403])
    test(`Admin denial ${status} has a distinct safe error for clearing displayed records`, async () => {
        await assert.rejects(api({ detail: 'private detail' }, status).detail(id, id), reason => reason instanceof AdminAccessError && !reason.message.includes('private detail'));
    });
for (const status of [404, 409, 503])
    test(`Admin ${status} never confirms a status write`, async () => {
        await assert.rejects(api({ detail: 'private detail' }, status).change(id, row, 'resolved'), reason => reason instanceof Error && !reason.message.includes('private detail'));
    });
for (const invalid of [{ ...row, user_id: id }, { ...row, revision: true }, { ...row, revision: -1 }, { ...row, revision: Number.MAX_SAFE_INTEGER + 1 }, { ...row, received_at: '2026-10-02T23:00:00' }, { ...row, updated_at: 'invalid' }, { ...row, id: 1 }, { ...row, status: 'supported' }])
    test(`Admin rejects malformed or extra fields ${JSON.stringify(invalid)}`, async () => {
        assert.equal(validReview(invalid), false);
        await assert.rejects(api(invalid).detail(id, id), /verified/);
    });
test('Admin distinguishes denied access from malformed access and verifies bounded pages', async () => {
    assert.equal(await api({ allowed: false }).access(id), false);
    await assert.rejects(api({ allowed: true, user_id: id }).access(id), /verified/);
    assert.deepEqual(await api({ items: [row], has_more: false, offset: 0 }).list(id), { items: [row], has_more: false, offset: 0 });
    for (const value of [{ items: [row], has_more: 0, offset: 0 }, { items: [row], has_more: false, offset: 50 }, { items: Array(51).fill(row), has_more: true, offset: 0 }])
        await assert.rejects(api(value).list(id), /verified/);
});
test('Admin invalid selectors never reach token or network', async () => {
    let calls = 0;
    const client = createAdminApi(async () => { calls++; return 'synthetic'; }, async () => { calls++; return new Response(); });
    await assert.rejects(client.list(id, -1));
    await assert.rejects(client.detail(id, 'other'));
    await assert.rejects(client.change(id, { ...row, revision: -1 }, 'new'));
    assert.equal(calls, 0);
});
test('Admin status receipt must match the request and chosen status', async () => {
    await assert.rejects(api({ ...row, status: 'new' }).change(id, row, 'resolved'), /confirmed/);
    await assert.rejects(api({ ...row, id: '00000000-0000-4000-8000-000000000002', status: 'resolved' }).change(id, row, 'resolved'), /confirmed/);
});
