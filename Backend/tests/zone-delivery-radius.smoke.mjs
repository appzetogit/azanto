/**
 * Master > Delivery Radius, zone by zone, for Food (quick commerce and medical
 * are gone, so they are no longer services here).
 *
 * Run: node tests/zone-delivery-radius.smoke.mjs
 */
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

const mongo = await MongoMemoryServer.create();
await mongoose.connect(mongo.getUri(), { dbName: 'zone_radius' });
const zr = await import('../src/core/serviceRadius/zoneRadius.js');
const { FoodRestaurant } = await import('../src/modules/food/restaurant/models/restaurant.model.js');
const { FoodZone } = await import('../src/modules/food/admin/models/zone.model.js');

let failures = 0;
const check = async (label, fn) => {
    try { await fn(); console.log(`  ok   ${label}`); }
    catch (err) { failures += 1; console.log(`  FAIL ${label}\n       ${err.message}`); }
};
const oid = () => new mongoose.Types.ObjectId();
const pt = (lat, lng) => ({ type: 'Point', coordinates: [lng, lat] });
// Palampur; 0.01 deg of latitude is about 1.11 km.
const customer = { lat: 32.11, lng: 76.53 };

const foodZone = oid();
await FoodZone.collection.insertOne({ _id: foodZone, name: 'Palampur food', isActive: true });

await FoodRestaurant.collection.insertOne({ restaurantName: 'Dhaba', ownerPhone: '9000000001', zoneId: foodZone, location: pt(32.11, 76.53), serviceRadiusKm: 12 });
await FoodRestaurant.collection.insertOne({ restaurantName: 'Far Dhaba', ownerPhone: '9000000003', zoneId: foodZone, location: pt(32.16, 76.53), serviceRadiusKm: 12 }); // ~5.6 km
await FoodRestaurant.collection.insertOne({ restaurantName: 'Elsewhere', ownerPhone: '9000000002', zoneId: oid(), location: pt(32.11, 76.53), serviceRadiusKm: 12 });

await check('with no radius set, nothing is cut off', async () => {
    const stores = await FoodRestaurant.find({ zoneId: foodZone }).lean();
    assert.equal((await zr.filterStoresByZoneRadius('food', stores, customer)).length, 2);
});
await check('a Food zone radius is written to every restaurant in that zone, and only that zone', async () => {
    const res = await zr.setZoneRadius('food', foodZone, 4);
    assert.equal(res.restaurantsUpdated, 2);
    const all = await FoodRestaurant.find({}).select('restaurantName serviceRadiusKm').lean();
    const by = Object.fromEntries(all.map((r) => [r.restaurantName, r.serviceRadiusKm]));
    assert.deepEqual(by, { Dhaba: 4, 'Far Dhaba': 4, Elsewhere: 12 });
});
await check('the zone radius keeps the restaurant 0 km away and drops the one 5.6 km away', async () => {
    const stores = await FoodRestaurant.find({ zoneId: foodZone }).lean();
    const kept = await zr.filterStoresByZoneRadius('food', stores, customer);
    assert.deepEqual(kept.map((r) => r.restaurantName), ['Dhaba']);
});
await check('a Food zone radius above the platform maximum is refused', async () => {
    await assert.rejects(zr.setZoneRadius('food', foodZone, 50), /maximum/);
});
await check('the Master list shows each zone with its radius and store count', async () => {
    const food = await zr.listZoneRadii('food');
    assert.deepEqual(food.map((z) => [z.name, z.stores, z.radiusKm]), [['Palampur food', 2, 4]]);
});
await check('blank clears it', async () => {
    await zr.setZoneRadius('food', foodZone, '');
    assert.deepEqual((await zr.listZoneRadii('food')).map((z) => z.radiusKm), [null]);
});
await check('quick and medical are no longer services here', async () => {
    assert.deepEqual([...zr.ZONE_RADIUS_VERTICALS], ['food']);
    await assert.rejects(zr.setZoneRadius('quick', oid(), 3), /Unknown service/);
    await assert.rejects(zr.listZoneRadii('medical'), /Unknown service/);
});

await mongoose.disconnect();
await mongo.stop();
console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
process.exit(failures ? 1 : 0);
