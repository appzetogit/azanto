// Unified gateway-payment aggregate.
//
// This touches money on a live system, so the assertions are weighted towards "the old
// behaviour is unchanged" rather than "the new feature works".
//
// Run: node tests/payments.unified.smoke.mjs

import assert from 'node:assert/strict';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';

let failures = 0;
const check = (name, fn) => {
    if (fn.constructor.name === 'AsyncFunction') throw new Error(`check("${name}") given an async fn`);
    try { fn(); console.log(`  ok   ${name}`); }
    catch (err) { failures++; console.log(`  FAIL ${name}\n         ${err.message}`); }
};

process.env.MONGOMS_STARTUP_TIMEOUT ||= '180000';
const mongod = await MongoMemoryServer.create();
process.env.MONGO_URI = mongod.getUri();
process.env.NODE_ENV = 'test';
await mongoose.connect(process.env.MONGO_URI);

const { Payment } = await import('../src/core/payments/models/payment.model.js');
const { recordPayment, getPaymentTotals } = await import('../src/core/payments/payments.facade.js');

const oid = () => new mongoose.Types.ObjectId();

console.log('\n[1] existing food behaviour is unchanged');
{
    // Exactly the shape food wrote before this change -- no vertical, no payerModel.
    const orderId = oid();
    const legacy = await Payment.create({
        orderId, userId: oid(), amount: 250, method: 'razorpay',
        gateway: 'razorpay', status: 'success', module: 'food',
    });
    check('a legacy-shaped write still succeeds', () => assert.ok(legacy._id));
    check('module is preserved', () => assert.equal(legacy.module, 'food'));
    check('vertical is derived from module', () => assert.equal(legacy.vertical, 'food'));
    check('payerModel defaults to FoodUser so populate is unchanged', () => assert.equal(legacy.payerModel, 'FoodUser'));
    const found = await Payment.findOne({ orderId });
    check('found by orderId as before', () => assert.ok(found));
}

console.log('\n[2] orderId is no longer required — other verticals have no FoodOrder');
{
    let err = null;
    try {
        await Payment.create({ userId: oid(), amount: 99, method: 'cash', vertical: 'taxi', payerModel: 'TaxiUser' });
    } catch (e) { err = e; }
    check('a payment with no orderId validates', () => assert.equal(err, null, err?.message));
}

console.log('\n[3] all four verticals write to ONE collection');
{
    const ids = {};
    for (const v of ['food', 'quickCommerce', 'taxi', 'serviceProvider']) {
        const p = await recordPayment({
            vertical: v, userId: oid(), amount: 100, method: 'razorpay',
            gateway: 'razorpay', status: 'success', subjectId: oid(),
            gatewayOrderId: `order_${v}_1`,
        });
        ids[v] = p;
    }
    check('all four persisted', () => assert.equal(Object.keys(ids).length, 4));
    check('same collection for every vertical', () => assert.equal(Payment.collection.name, 'payments'));
    check('each carries its own vertical', () =>
        assert.deepEqual(['food', 'quickCommerce', 'taxi', 'serviceProvider'].map((v) => ids[v].vertical),
            ['food', 'quickCommerce', 'taxi', 'serviceProvider']));
    check('subjectModel is set per vertical', () =>
        assert.deepEqual([ids.food.subjectModel, ids.taxi.subjectModel, ids.serviceProvider.subjectModel],
            ['FoodOrder', 'TaxiRide', 'SPBooking']));
    check('module mirrors vertical for legacy readers', () =>
        assert.equal(ids.serviceProvider.module, 'serviceProvider'));
    check('food still gets orderId populated for its existing readers', () =>
        assert.ok(ids.food.orderId));
}

console.log('\n[4] idempotency — a retried webhook must not double-count revenue');
{
    const userId = oid(); const subjectId = oid();
    const a = await recordPayment({ vertical: 'food', userId, amount: 500, method: 'razorpay', gateway: 'razorpay', gatewayOrderId: 'order_dupe_1', subjectId, status: 'created' });
    const b = await recordPayment({ vertical: 'food', userId, amount: 500, method: 'razorpay', gateway: 'razorpay', gatewayOrderId: 'order_dupe_1', subjectId, status: 'success' });
    const n = await Payment.countDocuments({ gatewayOrderId: 'order_dupe_1' });
    check('the retry updated rather than inserted', () => assert.equal(n, 1));
    check('same document', () => assert.equal(String(a._id), String(b._id)));
    check('status advanced to success', () => assert.equal(b.status, 'success'));
}

console.log('\n[5] the query that was impossible before');
{
    const totals = await getPaymentTotals({ status: 'success' });
    check(`platform total across verticals (${totals.total})`, () => assert.ok(totals.total > 0));
    check('broken down per vertical', () => assert.ok(totals.byVertical.length >= 4, JSON.stringify(totals.byVertical)));
}

console.log('\n[6] guardrails');
{
    const bad = async (input) => { try { await recordPayment(input); return null; } catch (e) { return e.message; } };
    const e1 = await bad({ vertical: 'grocery', userId: oid(), amount: 1, method: 'cash' });
    const e2 = await bad({ vertical: 'food', userId: oid(), amount: -5, method: 'cash' });
    const e3 = await bad({ vertical: 'food', amount: 5, method: 'cash' });
    check('rejects an unknown vertical', () => assert.match(e1 || '', /unknown vertical/));
    check('rejects a negative amount', () => assert.match(e2 || '', /non-negative/));
    check('rejects a missing payer', () => assert.match(e3 || '', /userId is required/));
}

console.log('\n[7] food is cut over — createPayment now goes through the facade');
{
    const { createPayment, getPaymentsByOrder } = await import('../src/core/payments/payment.service.js');
    const orderId = oid(); const userId = oid();

    const cash = await createPayment({ orderId, userId, amount: 300, method: 'cash' });
    check('cash still lands as pending', () => assert.equal(cash.status, 'pending'));
    check('vertical is stamped food', () => assert.equal(cash.vertical, 'food'));
    check('orderId still written, so getPaymentsByOrder keeps working', () =>
        assert.equal(String(cash.orderId), String(orderId)));
    check('subjectModel is FoodOrder', () => assert.equal(cash.subjectModel, 'FoodOrder'));
    check('returns a plain object as before', () => assert.equal(typeof cash.toObject, 'undefined'));

    const byOrder = await getPaymentsByOrder(orderId);
    check('getPaymentsByOrder finds it', () => assert.equal(byOrder.length, 1));

    // An order legitimately has several attempts: the first fails, the customer retries.
    // Each must stay its own row or support and reconciliation lose the history.
    await createPayment({ orderId, userId, amount: 300, method: 'razorpay', gateway: 'razorpay' });
    const attempts = await getPaymentsByOrder(orderId);
    check(`a second attempt is a SEPARATE row (${attempts.length})`, () => assert.equal(attempts.length, 2));

    // ...but a retried webhook carrying the same gateway order id must not duplicate.
    const g = `order_food_retry_${Date.now()}`;
    await createPayment({ orderId: oid(), userId, amount: 75, method: 'razorpay', gateway: 'razorpay', gatewayOrderId: g });
    await createPayment({ orderId: oid(), userId, amount: 75, method: 'razorpay', gateway: 'razorpay', gatewayOrderId: g });
    const dupes = await Payment.countDocuments({ gatewayOrderId: g });
    check('same gatewayOrderId still collapses to one row', () => assert.equal(dupes, 1));
}

console.log('\n[8] taxi — all five gateway flows mirrored');
{
    const readFile = (await import('node:fs/promises')).readFile;
    const rel = (p) => readFile(new URL(p, import.meta.url), 'utf8');

    const { mirrorTaxiPayment } = await import('../src/modules/taxi/services/paymentMirror.service.js');

    // Taxi verifies inline in five handlers rather than through one choke point, so
    // the risk is missing one. Assert each file is wired.
    const wiring = {
        'rideController (completion + tip)': ['../src/modules/taxi/user/controllers/rideController.js', 2],
        'poolingController': ['../src/modules/taxi/user/controllers/poolingController.js', 1],
        'userController (wallet top-up)': ['../src/modules/taxi/user/controllers/userController.js', 1],
        'driverController (driver top-up)': ['../src/modules/taxi/driver/controllers/driverController.js', 1],
    };
    for (const [label, [path, expected]] of Object.entries(wiring)) {
        const src = await rel(path);
        const calls = (src.match(/await mirrorTaxiPayment\(/g) || []).length;
        const imported = /import \{ mirrorTaxiPayment \}/.test(src);
        check(`${label}: ${calls}/${expected} call(s), imported`, () => {
            assert.equal(calls, expected, `expected ${expected} mirror call(s), found ${calls}`);
            assert.ok(imported, 'mirrorTaxiPayment is not imported');
        });
    }

    const svc = await rel('../src/modules/taxi/services/paymentMirror.service.js');
    check('mirror cannot throw', () => assert.match(svc, /catch \(err\)[\s\S]*payment still valid/));
    check('mock orders are skipped', () => assert.match(svc, /if \(mock\) return;/));

    // Behaviour
    const userId = oid(); const subjectId = oid();
    await mirrorTaxiPayment({ orderId: `order_taxi_${Date.now()}`, paymentId: 'pay_1', amount: 250, userId, subjectId, purpose: 'ride' });
    const p = await Payment.findOne({ vertical: 'taxi', userId });
    check('a taxi ride payment reaches the shared collection', () => assert.ok(p));
    check('subjectModel is TaxiRide', () => assert.equal(p.subjectModel, 'TaxiRide'));

    // A mock order must never be counted as revenue.
    const mockUser = oid();
    await mirrorTaxiPayment({ orderId: 'mock_order_1', paymentId: 'x', amount: 999, userId: mockUser, purpose: 'ride', mock: true });
    const mocked = await Payment.findOne({ userId: mockUser });
    check('mock orders are not recorded', () => assert.equal(mocked, null));

    // A bad amount is dropped, not thrown.
    let threw = null;
    try { await mirrorTaxiPayment({ orderId: 'o', paymentId: 'p', amount: 0, userId: oid(), purpose: 'ride' }); }
    catch (e) { threw = e; }
    check('a zero amount is skipped without throwing', () => assert.equal(threw, null));

    const totals = await getPaymentTotals({ status: 'success' });
    const vs = totals.byVertical.map((v) => v.vertical);
    check('ALL FOUR verticals now report into one total', () => {
        for (const v of ['food', 'quickCommerce', 'serviceProvider', 'taxi']) assert.ok(vs.includes(v), `${v} missing`);
    });
}

await mongoose.disconnect();
await mongod.stop();
console.log(`\n${failures === 0 ? 'PASS' : `FAIL — ${failures} check(s) failed`}\n`);
process.exit(failures === 0 ? 0 : 1);
