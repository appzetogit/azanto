/**
 * Cancelling a food order frees its rider for taxi rides too.
 *
 * 28 Oct, Indore: FOD-7701814 was cancelled but its rider's unified driver
 * record kept the busy lock, so the only rider in the city was never offered
 * a ride and the app showed no vehicle at all.
 *
 * Run: node tests/food-cancel-frees-rider.smoke.mjs
 */
import mongoose from 'mongoose';
import { startFoodWorld, makeChecker } from './food-order-fixture.mjs';

const w = await startFoodWorld('cancel_frees_rider');
const { check, summary } = makeChecker();
let failed = 1;

try {
    const { Driver } = await import('../src/modules/taxi/driver/models/Driver.js');
    const items = [w.appLine(w.dish)];
    const buyer = await w.makeUser();

    // The rider's unified driver record, linked from the food partner.
    const driverId = new mongoose.Types.ObjectId();
    await Driver.collection.insertOne({ _id: driverId, name: 'Rider', phone: '9000000777', isOnline: true });
    await w.m.FoodDeliveryPartner.collection.updateOne({ _id: w.rider._id }, { $set: { driverId } });

    const accepted = async () => {
        const order = await w.saved(await w.place(buyer._id, { items, pricing: await w.quote(buyer._id, { items }) }));
        await w.m.FoodOrder.updateOne({ _id: order._id }, {
            $set: { orderStatus: 'confirmed', 'dispatch.status': 'accepted', 'dispatch.deliveryPartnerId': w.rider._id },
        });
        // The same claim accepting a delivery makes.
        const { acquireDriverAssignment } = await import('../src/modules/taxi/driver/services/driverAssignmentService.js');
        await acquireDriverAssignment(driverId, 'delivery', order._id);
        return String(order._id);
    };
    const lockOf = async () => (await Driver.collection.findOne({ _id: driverId })).activeAssignment;

    const a = await accepted();
    check('accepting puts the rider on the delivery', Boolean(await lockOf()));
    await w.orderService.updateOrderStatusRestaurant(a, null, 'cancelled_by_restaurant', 'test', { role: 'ADMIN', id: null });
    check('an admin cancel frees the rider', (await lockOf()) === null, JSON.stringify(await lockOf()));

    const b = await accepted();
    await w.m.FoodOrder.updateOne({ _id: b }, { $set: { orderStatus: 'created' } });
    await w.orderService.cancelOrder(b, String(buyer._id), 'changed my mind').catch(() => {});
    const status = (await w.m.FoodOrder.findById(b).lean()).orderStatus;
    check('a customer cancel frees the rider', status !== 'cancelled_by_user' || (await lockOf()) === null, `${status} ${JSON.stringify(await lockOf())}`);

    failed = summary();
} finally {
    await w.stop();
    process.exit(failed ? 1 : 0);
}
