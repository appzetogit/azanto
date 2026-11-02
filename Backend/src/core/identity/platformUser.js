import mongoose from 'mongoose';

/**
 * The customer's one platform account, for a service's customer id.
 *
 * Food and Taxi key customers by the platform account (`users`), so the id is
 * already the answer when that account exists. Quick commerce and Services kept
 * their own customer rows (`qc_users`, `sp_users`) and were translated here;
 * both are gone. Shared features -- the inbox (core/notifications/customerInbox.js)
 * -- still ask here, so a service with its own customers can be added back in
 * one place.
 */

const isId = (v) => mongoose.Types.ObjectId.isValid(String(v || ''));

/**
 * The customer's platform (`users`) id for a customer id, and which service
 * that id came from (null: it is a platform id). null when there is no platform
 * account to file it under.
 */
export async function platformUserIdFor(id) {
  if (!isId(id)) return null;
  const _id = new mongoose.Types.ObjectId(String(id));
  const own = await mongoose.connection.collection('users').findOne({ _id }, { projection: { _id: 1 } });
  return own ? { platformId: String(_id), vertical: null } : null;
}
