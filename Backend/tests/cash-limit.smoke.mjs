/**
 * One cash limit for riders, managed in Platform settings.
 *
 * Run: node tests/cash-limit.smoke.mjs
 *
 * Before: riders (taxi and food) were limited only by the food admin's delivery
 * cash limit, with no platform-level control.
 *
 * Now they read `finance.cashLimit` from core/config (partner > zone > vertical >
 * global). An administered value wins; with none, each partner keeps today's
 * figure -- so deploying changes nothing. Checked here on a replica set:
 *
 *   riders   today's food figure until set; global applies to every
 *            vertical at once; a per-rider override wins; a vertical value does
 *            NOT touch riders (their limit spans verticals); enforcement can be
 *            switched off; riderFinance actually blocks on the resolved figure
 */
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';

let failed = 0;
const check = async (label, fn) => {
    try {
        await fn();
        console.log(`  PASS  ${label}`);
    } catch (err) {
        failed += 1;
        console.log(`  FAIL  ${label}\n        ${err.message}`);
    }
};
const oid = () => new mongoose.Types.ObjectId();

const main = async () => {
    process.env.MONGOMS_STARTUP_TIMEOUT ||= '180000';
    const replSet = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
    await mongoose.connect(replSet.getUri(), { dbName: 'cash_limit' });

    const config = await import('../src/core/config/resolver.service.js');
    const { PlatformSetting } = await import('../src/core/config/setting.model.js');
    const { resolveSharedCashLimit, getRiderFinance } = await import('../src/core/finance/riderFinance.service.js');
    const setLimit = (level, scopeId, value) => config.set('finance.cashLimit', { level, scopeId, value, updatedBy: 'test', reason: 'test' });
    const clearAll = async () => { await PlatformSetting.deleteMany({}); config.invalidateCache(); };

    // Today's rider limit lives in the food admin setting.
    await mongoose.connection.db.collection('food_delivery_cash_limits')
        .insertOne({ isActive: true, deliveryCashLimit: 1500, deliveryWithdrawalLimit: 100, createdAt: new Date() });

    console.log('\nriders (taxi + food)');
    const riderId = oid();
    await check('with nothing set in Platform settings, the food admin figure still applies', async () => {
        const r = await resolveSharedCashLimit({ partnerId: String(riderId) });
        assert.equal(r.cashLimit, 1500);
        assert.match(r.cashLimitSource, /Existing setting/);
    });
    await check('a global value applies to every rider', async () => {
        await setLimit('global', '*', 3000);
        assert.equal((await resolveSharedCashLimit({ partnerId: String(riderId) })).cashLimit, 3000);
        assert.equal((await resolveSharedCashLimit({ partnerId: String(oid()) })).cashLimit, 3000);
    });
    await check('a per-rider override wins over global', async () => {
        await setLimit('partner', String(riderId), 500);
        const r = await resolveSharedCashLimit({ partnerId: String(riderId) });
        assert.equal(r.cashLimit, 500);
        assert.equal(r.cashLimitSource, 'Partner override');
        assert.equal((await resolveSharedCashLimit({ partnerId: String(oid()) })).cashLimit, 3000, 'others unaffected');
    });
    await check('a vertical value does not change a rider\'s cross-vertical limit', async () => {
        await setLimit('vertical', 'food', 99);
        assert.equal((await resolveSharedCashLimit({ partnerId: String(oid()) })).cashLimit, 3000);
    });
    await check('switching enforcement off keeps the figure visible but stops it blocking', async () => {
        await config.set('finance.enforceCashLimit', { level: 'global', scopeId: '*', value: false, updatedBy: 'test' });
        const r = await resolveSharedCashLimit({ partnerId: String(oid()) });
        assert.equal(r.cashLimit, 0);
        assert.equal(r.configuredCashLimit, 3000);
        await config.set('finance.enforceCashLimit', { level: 'global', scopeId: '*', value: null, updatedBy: 'test' });
    });
    await check('riderFinance blocks on the resolved per-rider figure', async () => {
        const { Driver } = await import('../src/modules/taxi/driver/models/Driver.js');
        // Rs 450 of taxi cash owed (-450 signed): above taxi's -500 minimum balance, so the
        // cash limit is the rule under test -- over a 400 per-rider limit, under the global 3000.
        await setLimit('partner', String(riderId), 400);
        // Pin taxi's minimum-balance rule to -1000 so it cannot fire first.
        const { AdminAppSetting } = await import('../src/modules/taxi/admin/models/AdminAppSetting.js');
        await AdminAppSetting.collection.updateOne({ scope: 'default' }, { $set: { 'wallet_setting.driver_wallet_minimum_amount_to_get_an_order': -1000 } }, { upsert: true });
        await Driver.collection.insertOne({ _id: riderId, name: 'R', phone: '+919700000001', wallet: { balance: -450, isBlocked: false } });
        const f = await getRiderFinance(riderId);
        assert.equal(f.cashLimit, 400);
        assert.equal(f.cashInHand, 450);
        assert.equal(f.isBlocked, true);
        assert.equal(f.blockReason, 'cash_limit_reached');
        await setLimit('partner', String(riderId), null);
        const g = await getRiderFinance(riderId);
        assert.equal(g.cashLimit, 3000);
        assert.notEqual(g.blockReason, 'cash_limit_reached');
    });

    await mongoose.disconnect();
    await replSet.stop();

    console.log(failed ? `\n${failed} check(s) failed\n` : '\nall checks passed\n');
    process.exit(failed ? 1 : 0);
};

main().catch((err) => { console.error('FAILED:', err); process.exit(1); });
