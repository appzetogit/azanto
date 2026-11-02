/**
 * Restaurant payout cycle (10 days) and the automatic withdrawal at its end.
 *
 * Run: node tests/restaurant-payout-cycle.smoke.mjs
 */
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';

const replSet = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
await mongoose.connect(replSet.getUri(), { dbName: 'payout_cycle' });
const cycle = await import('../src/modules/food/restaurant/services/payoutCycle.service.js');
const { FoodRestaurant } = await import('../src/modules/food/restaurant/models/restaurant.model.js');
const { FoodTransaction } = await import('../src/modules/food/orders/models/foodTransaction.model.js');
const { FoodRestaurantWithdrawal } = await import('../src/modules/food/restaurant/models/foodRestaurantWithdrawal.model.js');
await FoodRestaurantWithdrawal.syncIndexes();

let failures = 0;
const check = async (label, fn) => {
    try { await fn(); console.log(`  ok   ${label}`); }
    catch (err) { failures += 1; console.log(`  FAIL ${label}\n       ${err.message}`); }
};
const oid = () => new mongoose.Types.ObjectId();
// Noon India time on a given date.
const ist = (y, m, d) => new Date(Date.UTC(y, m - 1, d, 6, 30));

await check('10-day cycles: 1-10, 11-20, 21 to month end (no 1-day cycle on the 31st)', async () => {
    assert.equal(cycle.cycleContaining(ist(2026, 10, 5)).label, '1-10 Oct 2026');
    assert.equal(cycle.cycleContaining(ist(2026, 10, 11)).label, '11-20 Oct 2026');
    assert.equal(cycle.cycleContaining(ist(2026, 10, 31)).label, '21-31 Oct 2026');
    assert.equal(cycle.cycleContaining(ist(2026, 2, 28)).label, '21-28 Feb 2026');
});
await check('on the 11th the cycle being closed is 1-10; on the 1st it is 21-end of last month', async () => {
    assert.equal(cycle.previousCycle(ist(2026, 10, 11)).label, '1-10 Oct 2026');
    assert.equal(cycle.previousCycle(ist(2026, 11, 1)).label, '21-31 Oct 2026');
});
await check('cycles follow India time: 00:15 IST on the 11th is already the new cycle', async () => {
    const justAfterMidnightIst = new Date(Date.UTC(2026, 9, 10, 18, 45));
    assert.equal(cycle.cycleContaining(justAfterMidnightIst).label, '11-20 Oct 2026');
});

const restaurant = async (name, earned) => {
    const id = (await FoodRestaurant.collection.insertOne({
        _id: oid(), restaurantName: name, ownerName: 'O', ownerPhone: String(Math.random()).slice(2, 12),
        status: 'approved', accountNumber: '1234567890', ifscCode: 'HDFC0001234', accountHolderName: name,
        location: { type: 'Point', coordinates: [76.5, 32.1] }, createdAt: new Date(),
    })).insertedId;
    if (earned) {
        await FoodTransaction.collection.insertOne({ _id: oid(), orderId: oid(), restaurantId: id, status: 'captured', amounts: { restaurantShare: earned }, createdAt: new Date() });
    }
    return id;
};
const withMoney = await restaurant('Rainbow Restro', 850);
const nothing = await restaurant('Empty Kitchen', 0);
const alreadyAsked = await restaurant('Asked Already', 400);
await FoodRestaurantWithdrawal.create({ restaurantId: alreadyAsked, amount: 100, status: 'pending' });

let first;
await check('the run files one withdrawal for the whole available balance, marked automatic with the cycle', async () => {
    first = await cycle.runAutoWithdrawals({ now: ist(2026, 10, 11) });
    assert.equal(first.cycleLabel, '1-10 Oct 2026');
    assert.equal(first.created.length, 1);
    const w = await FoodRestaurantWithdrawal.findOne({ restaurantId: withMoney }).lean();
    assert.deepEqual([w.amount, w.status, w.autoCreated, w.autoCycleLabel], [850, 'pending', true, '1-10 Oct 2026']);
    assert.equal(w.bankDetails.accountNumber, '1234567890');
});
await check('nothing to withdraw, or a request already waiting: skipped', async () => {
    assert.equal(await FoodRestaurantWithdrawal.countDocuments({ restaurantId: nothing }), 0);
    assert.equal(await FoodRestaurantWithdrawal.countDocuments({ restaurantId: alreadyAsked }), 1);
    assert.equal(first.skipped, 2);
});
await check('running again for the same cycle files nothing twice', async () => {
    const again = await cycle.runAutoWithdrawals({ now: ist(2026, 10, 12) });
    assert.equal(again.created.length, 0);
    assert.equal(await FoodRestaurantWithdrawal.countDocuments({ restaurantId: withMoney }), 1);
});
await check('the night run only acts in the first two days of a cycle; "run now" any day', async () => {
    const late = await cycle.runAutoWithdrawals({ now: ist(2026, 10, 29) });
    assert.equal(late.notCycleStart, true);
    const forced = await cycle.runAutoWithdrawals({ now: ist(2026, 10, 29), force: true });
    assert.equal(forced.cycleLabel, '11-20 Oct 2026');
});
await check('switched off, the night run files nothing (admin "run now" still can)', async () => {
    await cycle.savePayoutCycleSettings({ autoWithdrawal: false });
    const off = await cycle.runAutoWithdrawals({ now: ist(2026, 10, 21) });
    assert.equal(off.disabled, true);
    await cycle.savePayoutCycleSettings({ autoWithdrawal: true, cycleDays: 10 });
});
await check('the cycle length is checked', async () => {
    await assert.rejects(cycle.savePayoutCycleSettings({ cycleDays: 0 }), /1 to 31/);
    assert.equal((await cycle.savePayoutCycleSettings({ cycleDays: 7 })).cycleDays, 7);
    assert.equal(cycle.cycleContaining(ist(2026, 10, 9), 7).label, '8-14 Oct 2026');
    await cycle.savePayoutCycleSettings({ cycleDays: 10 });
});

await mongoose.disconnect();
await replSet.stop();
console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
process.exit(failures ? 1 : 0);
