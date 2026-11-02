/**
 * Rider Pocket (driver app > Wallet): an admin wallet adjustment is not a bonus.
 *
 * 29 Oct, jk: a Rs 1500 admin top-up covering his security deposit showed as
 * "Bonus Rs 1500" and the week as Rs 1613, for Rs 113 earned.
 *
 * Run: node tests/rider-pocket-adjustment-not-bonus.smoke.mjs
 */
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

const mongo = await MongoMemoryServer.create();
await mongoose.connect(mongo.getUri(), { dbName: 'pocket_adjustment' });
const { FoodDeliveryPartner } = await import('../src/modules/food/delivery/models/deliveryPartner.model.js');
const { DeliveryBonusTransaction } = await import('../src/modules/food/admin/models/deliveryBonusTransaction.model.js');
const { FoodOrder } = await import('../src/modules/food/orders/models/order.model.js');
const { getDeliveryPocketDetails } = await import('../src/modules/food/delivery/services/delivery.service.js');

let failures = 0;
const check = async (label, fn) => {
    try { await fn(); console.log(`  ok   ${label}`); }
    catch (err) { failures += 1; console.log(`  FAIL ${label}\n       ${err.message}`); }
};
const oid = () => new mongoose.Types.ObjectId();
const now = new Date();

const rider = (await FoodDeliveryPartner.collection.insertOne({ _id: oid(), name: 'jk', phone: '9000006961', status: 'approved' })).insertedId;
// One delivered food order this week, Rs 113 to the rider.
await FoodOrder.collection.insertOne({
    _id: oid(), orderId: 'FOD-TEST1', orderStatus: 'delivered', riderEarning: 113,
    dispatch: { deliveryPartnerId: rider }, deliveredAt: now, createdAt: now, updatedAt: now,
});
await DeliveryBonusTransaction.collection.insertMany([
    { deliveryPartnerId: rider, transactionId: 'ADJ-1', amount: 1500, reference: 'Admin wallet adjustment', createdAt: now, updatedAt: now },
    { deliveryPartnerId: rider, transactionId: 'ADJ-2', amount: 40, reference: 'Admin wallet adjustment: fuel refund', createdAt: now, updatedAt: now },
    { deliveryPartnerId: rider, transactionId: 'BON-1', amount: 50, reference: 'Rain bonus', createdAt: now, updatedAt: now },
]);

const pocket = await getDeliveryPocketDetails(String(rider), {});

await check('the week counts earnings and real bonuses only', async () => {
    assert.deepEqual([pocket.summary.totalEarning, pocket.summary.totalBonus, pocket.summary.grandTotal], [113, 50, 163]);
});
await check('admin wallet adjustments are reported apart, not as bonus', async () => {
    assert.equal(pocket.summary.adminAdjustments, 1540);
    assert.deepEqual(pocket.transactions.bonus.map((t) => t.amount), [50]);
    assert.deepEqual(pocket.transactions.adjustment.map((t) => t.amount).sort((a, b) => a - b), [40, 1500]);
});
await check('a rider with only an adjustment shows a week of Rs 0 bonus', async () => {
    const other = (await FoodDeliveryPartner.collection.insertOne({ _id: oid(), name: 'x', phone: '9000000001', status: 'approved' })).insertedId;
    await DeliveryBonusTransaction.collection.insertOne({ deliveryPartnerId: other, transactionId: 'ADJ-3', amount: 1500, reference: 'Admin wallet adjustment', createdAt: now, updatedAt: now });
    const p = await getDeliveryPocketDetails(String(other), {});
    assert.deepEqual([p.summary.totalBonus, p.summary.grandTotal, p.summary.adminAdjustments], [0, 0, 1500]);
});

await mongoose.disconnect();
await mongo.stop();
console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
process.exit(failures ? 1 : 0);
