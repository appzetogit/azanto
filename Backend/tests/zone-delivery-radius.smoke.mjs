/**
 * Master > Delivery Radius, zone by zone, for Food, Quick and Medical.
 *
 * Run: node tests/zone-delivery-radius.smoke.mjs
 */
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

const mongo = await MongoMemoryServer.create();
await mongoose.connect(mongo.getUri(), { dbName: 'zone_radius' });
const zr = await import('../src/core/serviceRadius/zoneRadius.js');
const { FoodRestaurant: QCStore } = await import('../src/modules/quickCommerce/modules/food/restaurant/models/restaurant.model.js');
const { FoodRestaurant } = await import('../src/modules/food/restaurant/models/restaurant.model.js');
const { FoodZone } = await import('../src/modules/food/admin/models/zone.model.js');
const { zoneModelFor } = await import('../src/modules/quickCommerce/modules/food/shared/zoneServiceability.js');

let failures = 0;
const check = async (label, fn) => {
    try { await fn(); console.log(`  ok   ${label}`); }
    catch (err) { failures += 1; console.log(`  FAIL ${label}\n       ${err.message}`); }
};
const oid = () => new mongoose.Types.ObjectId();
const pt = (lat, lng) => ({ type: 'Point', coordinates: [lng, lat] });
// Palampur; 0.01 deg of latitude is about 1.11 km.
const customer = { lat: 32.11, lng: 76.53 };

const quickZone = oid();
const medZone = oid();
const foodZone = oid();
await zoneModelFor('quick').collection.insertOne({ _id: quickZone, name: 'Palampur Quick', isActive: true });
await zoneModelFor('medical').collection.insertOne({ _id: medZone, name: 'Palampur Medical', isActive: true });
await FoodZone.collection.insertOne({ _id: foodZone, name: 'Palampur food', isActive: true });

const near = (await QCStore.collection.insertOne({ restaurantName: 'Near Mart', storeType: 'grocery', zoneId: quickZone, location: pt(32.12, 76.53) })).insertedId; // ~1.1 km
const far = (await QCStore.collection.insertOne({ restaurantName: 'Far Mart', storeType: 'grocery', zoneId: quickZone, location: pt(32.16, 76.53) })).insertedId; // ~5.6 km
const farPharmacy = { _id: oid(), restaurantName: 'Far Chemist', storeType: 'pharmacy', zoneId: medZone, location: pt(32.16, 76.53) };
await QCStore.collection.insertOne(farPharmacy);
const r1 = (await FoodRestaurant.collection.insertOne({ restaurantName: 'Dhaba', ownerPhone: '9000000001', zoneId: foodZone, location: pt(32.11, 76.53), serviceRadiusKm: 12 })).insertedId;
await FoodRestaurant.collection.insertOne({ restaurantName: 'Elsewhere', ownerPhone: '9000000002', zoneId: oid(), location: pt(32.11, 76.53), serviceRadiusKm: 12 });

await check('with no radius set, nothing is cut off', async () => {
    assert.deepEqual(await zr.storesOutOfReach('quick', customer), []);
});
await check('a 3 km Quick zone radius drops the store 5.6 km away and keeps the one 1.1 km away', async () => {
    await zr.setZoneRadius('quick', quickZone, 3);
    const out = (await zr.storesOutOfReach('quick', customer)).map(String);
    assert.deepEqual(out, [String(far)]);
    assert.equal(out.includes(String(near)), false);
});
await check('ordering from the far store is refused with the distance', async () => {
    const store = await QCStore.findById(far).lean();
    await assert.rejects(zr.assertStoreReachesPoint('quick', store, customer), /delivers within 3 km, and this address is 5\.\d+ km away/);
});
await check('a Medical zone radius applies to pharmacies only in that service', async () => {
    assert.equal((await zr.filterStoresByZoneRadius('medical', [farPharmacy], customer)).length, 1);
    await zr.setZoneRadius('medical', medZone, 2);
    assert.equal((await zr.filterStoresByZoneRadius('medical', [farPharmacy], customer)).length, 0);
});
await check('a Food zone radius is written to every restaurant in that zone, and only that zone', async () => {
    const res = await zr.setZoneRadius('food', foodZone, 4);
    assert.equal(res.restaurantsUpdated, 1);
    const all = await FoodRestaurant.find({}).select('restaurantName serviceRadiusKm').lean();
    const by = Object.fromEntries(all.map((r) => [r.restaurantName, r.serviceRadiusKm]));
    assert.deepEqual(by, { Dhaba: 4, Elsewhere: 12 });
});
await check('a Food zone radius above the platform maximum is refused', async () => {
    await assert.rejects(zr.setZoneRadius('food', foodZone, 50), /maximum/);
});
await check('blank clears it', async () => {
    await zr.setZoneRadius('quick', quickZone, '');
    assert.deepEqual(await zr.storesOutOfReach('quick', customer), []);
});
await check('the Master list shows each zone with its radius and store count', async () => {
    const quick = await zr.listZoneRadii('quick');
    assert.deepEqual(quick.map((z) => [z.name, z.stores, z.radiusKm]), [['Palampur Quick', 2, null]]);
    const med = await zr.listZoneRadii('medical');
    assert.deepEqual(med.map((z) => [z.name, z.stores, z.radiusKm]), [['Palampur Medical', 1, 2]]);
    void r1;
});

await mongoose.disconnect();
await mongo.stop();
console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
process.exit(failures ? 1 : 0);
