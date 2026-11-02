/**
 * The ride vehicle list offers a vehicle only when a rider of that exact
 * vehicle is nearby. 28 Oct, Indore: one EV Scooty rider online made Bike and
 * Scooty show "Closest driver 1-2 min away" too.
 *
 * Run: node tests/taxi-suggestions-exact-vehicle.smoke.mjs
 */
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

const mongo = await MongoMemoryServer.create();
await mongoose.connect(mongo.getUri(), { dbName: 'suggest_exact' });
const { Driver } = await import('../src/modules/taxi/driver/models/Driver.js');
const { Vehicle } = await import('../src/modules/taxi/admin/models/Vehicle.js');
const { listAvailableDrivers } = await import('../src/modules/taxi/user/controllers/rideController.js');
await Driver.createIndexes().catch(() => {});

let failures = 0;
const check = async (label, fn) => {
    try { await fn(); console.log(`  ok   ${label}`); }
    catch (err) { failures += 1; console.log(`  FAIL ${label}\n       ${err.message}`); }
};
const oid = () => new mongoose.Types.ObjectId();
const bike = oid(); const scooty = oid(); const ev = oid();
await Vehicle.collection.insertMany([
    { _id: bike, name: 'Bike', vehicle_type: 'bike', icon_types: 'bike' },
    { _id: scooty, name: 'Scooty', vehicle_type: 'bike', icon_types: 'bike' },
    { _id: ev, name: 'EV Scooty', vehicle_type: 'bike', icon_types: 'bike' },
]);
// One rider online, on an EV Scooty, filed under the shared 'bike' class.
await Driver.collection.insertOne({
    _id: oid(), name: 'Dummy new', phone: '9000000099', isOnline: true, isOnRide: false, approve: true, status: 'approved',
    registerFor: 'taxi', workMode: 'all', serviceCapabilities: ['taxi', 'delivery'], activeAssignment: null, deletedAt: null, vehicleTypeId: ev, vehicleType: 'bike', vehicleIconType: 'bike',
    location: { type: 'Point', coordinates: [75.8839, 22.7244] }, updatedAt: new Date(),
});
await Driver.collection.createIndex({ location: '2dsphere' });

const ask = async (vehicleTypeId) => {
    let body = null;
    const res = { status() { return this; }, json(b) { body = b; return this; } };
    await listAvailableDrivers({ query: { vehicleTypeId: String(vehicleTypeId), lat: '22.7250', lng: '75.8845' } }, res);
    const data = body?.data ?? body;
    return data?.closestDriverEtaMinutes ?? null;
};

await check('EV Scooty is offered: its own rider is nearby', async () => {
    assert.notEqual(await ask(ev), null);
});
await check('Bike and Scooty are not offered: no rider of either is online', async () => {
    assert.equal(await ask(bike), null);
    assert.equal(await ask(scooty), null);
});

await mongoose.disconnect();
await mongo.stop();
console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
process.exit(failures ? 1 : 0);
