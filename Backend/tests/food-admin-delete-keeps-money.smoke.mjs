/**
 * What an admin may delete, and that a delete takes the money with it.
 *
 * Run: node tests/food-admin-delete-keeps-money.smoke.mjs
 *
 * A delivered cash order can be deleted (29 Oct 2026, admin's request): the
 * rider's earning and cash held and the restaurant's share are all summed from
 * the order and its ledger row, so removing both reverses them -- and both are
 * archived first so the delete can be undone. An order paid online (or
 * refunded) still cannot: that is the customer's money, refunded by cancelling.
 *
 * Drives the real createOrder and deleteOrderAdmin against an in-memory Mongo.
 */
import { startFoodWorld, makeChecker, thrownBy } from './food-order-fixture.mjs';

const w = await startFoodWorld('admin_delete');
const { check, summary } = makeChecker();
let failed = 1;

try {
    const items = [w.appLine(w.dish)];
    const buyer = await w.makeUser();
    const newOrder = async () => w.saved(await w.place(buyer._id, { items, pricing: await w.quote(buyer._id, { items }) }));
    const adminId = '64b000000000000000000001';

    console.log('\na delivered cash order');
    const delivered = await newOrder();
    await w.m.FoodOrder.updateOne({ _id: delivered._id }, {
        $set: { orderStatus: 'delivered', 'payment.method': 'cash', 'payment.status': 'paid', 'dispatch.deliveryPartnerId': w.rider._id },
    });
    const res1 = await w.orderService.deleteOrderAdmin(String(delivered._id), adminId);
    check('it can be deleted', res1?.deleted === true);
    check('the order is gone', !(await w.m.FoodOrder.findById(delivered._id).lean()));
    check('and so is its ledger row, so the rider and restaurant figures drop it', !(await w.m.FoodTransaction.findOne({ orderId: delivered._id }).lean()));
    const archived = await w.m.FoodOrder.db.collection('deleted_food_orders').findOne({ 'order._id': delivered._id });
    check('both were archived first, so it can be undone', Boolean(archived?.order && archived?.transaction));
    check('the archive records what was reversed', archived?.reversed?.riderCashHeld > 0 && archived?.deletedByAdminId === adminId, JSON.stringify(archived?.reversed));

    console.log('\nan order paid online');
    const paid = await newOrder();
    await w.m.FoodOrder.updateOne({ _id: paid._id }, { $set: { 'payment.method': 'razorpay', 'payment.status': 'paid', orderStatus: 'delivered' } });
    const err = await thrownBy(() => w.orderService.deleteOrderAdmin(String(paid._id), adminId));
    check('deleting it is refused', Boolean(err), err?.message || 'deleted');
    check('and the reason says to cancel and refund', /refund/i.test(err?.message || ''), err?.message);
    check('the order is still there', Boolean(await w.m.FoodOrder.findById(paid._id).lean()));

    console.log('\na refunded order');
    const refunded = await newOrder();
    await w.m.FoodOrder.updateOne({ _id: refunded._id }, {
        $set: { orderStatus: 'cancelled_by_restaurant', 'payment.method': 'razorpay', 'payment.status': 'refunded' },
    });
    check('deleting it is refused', Boolean(await thrownBy(() => w.orderService.deleteOrderAdmin(String(refunded._id), adminId))));

    console.log('\nan unpaid COD order nobody has delivered');
    const unpaid = await newOrder();
    const res = await w.orderService.deleteOrderAdmin(String(unpaid._id), adminId);
    check('can still be deleted', res?.deleted === true && !(await w.m.FoodOrder.findById(unpaid._id).lean()));

    failed = summary();
} catch (err) {
    console.log(`\n  UNCAUGHT: ${err.stack || err.message}`);
} finally {
    await w.stop();
    process.exit(failed ? 1 : 0);
}
