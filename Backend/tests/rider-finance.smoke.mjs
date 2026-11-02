/**
 * Food rider money is counted once, and a withdrawal actually leaves the balance.
 *
 * Run: node tests/rider-finance.smoke.mjs
 *
 * core/finance/riderFinance.service.js is the one rider balance for taxi and food.
 * This drives the real food wallet, withdrawal and admin approval services, and the
 * real getRiderFinance, against an in-memory Mongo:
 *
 *   - earnings, bonuses and cash on delivery reach the balance and the cash limit;
 *   - an APPROVED withdrawal is subtracted, so the same money cannot be requested
 *     a second time;
 *   - one person reached through the taxi driver id or the food partner id reads
 *     one cash-in-hand;
 *   - quick commerce is gone: a stray qc_orders row is not counted.
 */
import assert from 'node:assert/strict';

process.env.RAZORPAY_KEY_ID = '';
process.env.RAZORPAY_KEY_SECRET = '';

const { default: mongoose } = await import('mongoose');
const { MongoMemoryServer } = await import('mongodb-memory-server');

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

const main = async () => {
    const mongo = await MongoMemoryServer.create();
    await mongoose.connect(mongo.getUri(), { dbName: 'rider_finance' });

    const { Driver } = await import('../src/modules/taxi/driver/models/Driver.js');
    const { FoodDeliveryPartner: FoodPartner } = await import('../src/modules/food/delivery/models/deliveryPartner.model.js');
    const { FoodOrder } = await import('../src/modules/food/orders/models/order.model.js');
    const { FoodDeliveryCashDeposit: Deposit } = await import('../src/modules/food/delivery/models/foodDeliveryCashDeposit.model.js');
    const { DeliveryBonusTransaction: Bonus } = await import('../src/modules/food/admin/models/deliveryBonusTransaction.model.js');
    const foodFinance = await import('../src/modules/food/delivery/services/deliveryFinance.service.js');
    const foodAdmin = await import('../src/modules/food/admin/services/admin.service.js');
    const {
        getRiderFinance, resolveRiderIdentity, combineDeliveryMoney, DELIVERY_VERTICALS,
    } = await import('../src/core/finance/riderFinance.service.js');

    await check('food is the only delivery vertical', async () => {
        assert.deepEqual([...DELIVERY_VERTICALS], ['food']);
    });

    const oid = () => new mongoose.Types.ObjectId();
    let phone = 9300000000;
    const foodRider = async (extra = {}) => {
        const id = oid();
        await FoodPartner.collection.insertOne({ _id: id, name: 'Food Rider', phone: String(phone++), status: 'approved', ...extra });
        return id;
    };
    const foodOrder = (rider, { earning = 0, total = 0, method = 'razorpay', status = 'delivered' } = {}) =>
        FoodOrder.collection.insertOne({
            _id: oid(), orderStatus: status, dispatch: { deliveryPartnerId: rider },
            payment: { method }, pricing: { total }, riderEarning: earning, createdAt: new Date(),
        });

    // --- an unlinked food rider -------------------------------------------------
    console.log('\nan unlinked food rider');
    const r1 = await foodRider();
    await foodOrder(r1, { earning: 300, total: 900 });
    await foodOrder(r1, { earning: 40, total: 250, method: 'cash' });
    await foodOrder(r1, { earning: 999, total: 999, status: 'cancelled' });
    await Bonus.collection.insertOne({ _id: oid(), deliveryPartnerId: r1, amount: 60, createdAt: new Date() });

    await check('is labelled a food partner with no driver', async () => {
        const identity = await resolveRiderIdentity(r1);
        assert.equal(String(identity.foodPartnerId), String(r1));
        assert.equal(identity.driverId, null);
        assert.equal(identity.qcPartnerId, undefined);
    });
    await check('earnings and bonus are in the balance: 300 + 40 + 60 = 400', async () => {
        const f = await getRiderFinance(r1);
        assert.equal(f.walletBalance, 400);
        assert.equal(f.breakdown.delivery.byVertical.food.totalEarned, 340);
        assert.deepEqual(Object.keys(f.breakdown.delivery.byVertical), ['food']);
        assert.equal(f.breakdown.delivery.totalDeliveries, 2, 'the cancelled order does not count');
    });
    await check('cash on delivery counts toward cash in hand', async () => {
        assert.equal((await getRiderFinance(r1)).cashInHand, 250);
    });
    await check('a completed deposit settles it', async () => {
        await Deposit.collection.insertOne({ _id: oid(), deliveryPartnerId: r1, amount: 100, status: 'Completed', createdAt: new Date() });
        assert.equal((await getRiderFinance(r1)).cashInHand, 150);
    });
    await check('the delivery app wallet shows the same balance', async () => {
        assert.equal((await foodFinance.getDeliveryPartnerWalletEnhanced(r1)).pocketBalance, 400);
    });
    await check('a stray qc_orders row for the same rider is not counted', async () => {
        await mongoose.connection.collection('qc_orders').insertOne({
            _id: oid(), orderStatus: 'delivered', dispatch: { deliveryPartnerId: r1 },
            payment: { method: 'cash' }, pricing: { total: 700 }, riderEarning: 500, createdAt: new Date(),
        });
        const f = await getRiderFinance(r1);
        assert.equal(f.walletBalance, 400);
        assert.equal(f.cashInHand, 150);
    });

    // --- withdrawing -------------------------------------------------------------
    console.log('\nwithdrawing');
    let w1;
    await check('a Rs 300 withdrawal is accepted against Rs 400', async () => {
        w1 = await foodFinance.requestDeliveryWithdrawal(r1, { amount: 300 });
        assert.equal(w1.status, 'pending');
        assert.equal((await getRiderFinance(r1)).walletBalance, 100);
    });
    await check('once approved, it has left the balance', async () => {
        const out = await foodAdmin.updateDeliveryWithdrawalStatus(String(w1._id), { status: 'approved' });
        assert.equal(out.status, 'approved');
        assert.equal((await getRiderFinance(r1)).walletBalance, 100);
    });
    await check('so the same Rs 300 cannot be requested a second time', async () => {
        await assert.rejects(() => foodFinance.requestDeliveryWithdrawal(r1, { amount: 300 }), /insufficient/i);
    });

    // --- one person, a taxi driver and a food partner ---------------------------
    console.log('\none person with a taxi and a food identity');
    const driverId = oid();
    const foodId = await foodRider({ driverId });
    await Driver.collection.insertOne({
        _id: driverId, name: 'Rider', phone: `+91${phone++}`,
        legacyDeliveryPartnerId: foodId, wallet: { balance: -200 },
    });
    await foodOrder(foodId, { earning: 50, total: 400, method: 'cash' });

    await check('taxi cash and food cash are one cash-in-hand, from either id', async () => {
        for (const id of [driverId, foodId]) {
            assert.equal((await getRiderFinance(id)).cashInHand, 600, `from ${id}`);
        }
    });
    await check('either id resolves to the same person', async () => {
        const a = await resolveRiderIdentity(driverId);
        const b = await resolveRiderIdentity(foodId);
        assert.equal(String(a.driverId), String(driverId));
        assert.equal(String(b.driverId), String(driverId));
        assert.equal(String(a.foodPartnerId), String(foodId));
        assert.equal(String(b.foodPartnerId), String(foodId));
    });

    // --- the pure combination --------------------------------------------------
    console.log('\ncombining sources');
    await check('sums first and derives once, so a withdrawal settles money earned elsewhere', async () => {
        const out = combineDeliveryMoney([
            { totalEarned: 500, grossCashCollected: 0, totalDeposited: 0, totalBonus: 0, totalWithdrawn: 0, pendingWithdrawals: 0, totalDeliveries: 1 },
            { totalEarned: 0, grossCashCollected: 0, totalDeposited: 0, totalBonus: 0, totalWithdrawn: 500, pendingWithdrawals: 0, totalDeliveries: 0 },
        ]);
        assert.equal(out.pocketBalanceRaw, 0);
        assert.equal(out.totalDeliveries, 1);
    });

    await mongoose.disconnect();
    await mongo.stop();

    console.log(failed ? `\n${failed} check(s) failed\n` : '\nall checks passed\n');
    process.exit(failed ? 1 : 0);
};

main().catch((err) => { console.error('FAILED:', err); process.exit(1); });
