/**
 * Every id a single customer is known by, across the verticals.
 *
 * The activity feed is keyed on the userId each vertical stamped on its own document.
 * Food and taxi both key on `users`, so the caller's token id is the only id there is.
 * Quick-commerce (`qc_users`) and service-provider (`sp_users`) kept their own user
 * documents, linked by phone, which is why this resolver once looked further; both
 * verticals are gone, so it no longer has to.
 *
 * Kept as the one place the feed asks "which ids are this customer", so a vertical
 * with its own identity can be added back here without touching the controllers.
 *
 * @param {string} masterUserId  `users._id` from the caller's token
 * @returns {Promise<{ids: string[], resolved: string[]}>}
 */
export const resolveCustomerIdentities = async (masterUserId) => ({
    ids: [masterUserId],
    resolved: ['food/taxi'],
});
