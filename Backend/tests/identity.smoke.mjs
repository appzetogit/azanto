// Identity merge, phase 1: one platform identity per customer, linked explicitly.
//
// Run: node tests/identity.smoke.mjs

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

const { FoodUser } = await import('../src/core/users/user.model.js');
// A stand-in for a service that keeps its own customer rows: linkSatellite takes
// any model with phone, name and platformUserId.
const Satellite = mongoose.model('TestSatelliteUser', new mongoose.Schema({
    name: String,
    phone: String,
    platformUserId: { type: mongoose.Schema.Types.ObjectId, default: null },
}), 'test_satellite_users');
const { ensurePlatformUser, linkSatellite } = await import('../src/core/identity/identityLink.service.js');
const { resolveCustomerIdentities } = await import('../src/core/activity/identityResolver.js');

console.log('\n[1] ensurePlatformUser');
{
    const id1 = await ensurePlatformUser({ phone: '9876500001', name: 'A' });
    check('creates a platform user for a new phone', () => assert.ok(id1));

    const id2 = await ensurePlatformUser({ phone: '+91 98765 00001' });
    check('a prefixed variant of the same phone reuses it', () => assert.equal(String(id2), String(id1)));

    const before = await FoodUser.countDocuments();
    await ensurePlatformUser({ phone: '9876500001' });
    const after = await FoodUser.countDocuments();
    check('no duplicate platform users created', () => assert.equal(after, before));

    const bad = await ensurePlatformUser({ phone: '123' });
    check('unusable phone -> null, not a throw', () => assert.equal(bad, null));

    const stored = await FoodUser.findById(id1).lean();
    check('created identity stores the normalized phone', () => assert.equal(stored.phone, '9876500001'));
}

console.log('\n[2] linkSatellite stamps the satellite');
{
    const sat = await Satellite.create({ name: 'Sat Cust', phone: '9876500002' });
    const pid = await linkSatellite(Satellite, sat._id, { phone: '9876500002', name: 'Sat Cust' });
    check('returns the platform id', () => assert.ok(pid));

    const reread = await Satellite.findById(sat._id).lean();
    check('the satellite carries platformUserId', () => assert.equal(String(reread.platformUserId), String(pid)));

    // A failing link must never throw at a registration site.
    let threw = null;
    try { await linkSatellite(Satellite, sat._id, { phone: 'garbage' }); } catch (e) { threw = e; }
    check('bad phone -> null, never a throw', () => assert.equal(threw, null));
}

console.log('\n[3] the resolver: food and taxi share one identity');
{
    const master = await FoodUser.create({ phone: '9876500003', name: 'Linked' });
    // Quick commerce and services are gone: their old customer rows, even linked,
    // are not part of the customer any more.
    await mongoose.connection.collection('qc_users').insertOne({ phone: '9876500003', platformUserId: master._id });
    await mongoose.connection.collection('sp_users').insertOne({ phone: '9876500003', platformUserId: master._id });

    const r = await resolveCustomerIdentities(master._id);
    check('the caller is their only id', () => assert.deepEqual(r.ids.map(String), [String(master._id)]));
    check('resolved as food/taxi only', () => assert.deepEqual(r.resolved, ['food/taxi']));

    const phoneless = await FoodUser.create({ phone: '0000000004', name: 'NoPhone' });
    await FoodUser.updateOne({ _id: phoneless._id }, { $set: { phone: '' } });
    const r2 = await resolveCustomerIdentities(phoneless._id);
    check('resolution needs no phone', () => assert.deepEqual(r2.ids.map(String), [String(phoneless._id)]));
}

await mongoose.disconnect();
await mongod.stop();
console.log(`\n${failures === 0 ? 'PASS' : `FAIL — ${failures} check(s) failed`}\n`);
process.exit(failures === 0 ? 0 : 1);
