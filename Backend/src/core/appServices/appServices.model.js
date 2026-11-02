import mongoose from 'mongoose';

/**
 * The switches behind which services the customer app shows, and where.
 *
 * One document with a fixed id, so the whole answer is one cached read and an
 * upsert cannot race two copies into existence. See appServices.rules.js for
 * what the switches mean.
 */
const appServicesSchema = new mongoose.Schema(
    {
        _id: { type: String, default: 'platform' },
        services: {
            type: Map,
            of: new mongoose.Schema(
                {
                    enabled: { type: Boolean, default: true },
                    // Why the admin switched it off, shown to the customer when
                    // they tap the greyed-out module. Empty while the service is
                    // on; cleared again when it is switched back on.
                    reason: { type: String, default: '' },
                    updatedBy: { type: String, default: '' },
                    updatedAt: { type: Date, default: null },
                },
                { _id: false },
            ),
            default: () => new Map(),
        },
        zoneRules: [
            new mongoose.Schema(
                {
                    service: { type: String, required: true },
                    // A string rather than an ObjectId: taxi's zones and the other
                    // three live in different collections, and nothing here joins
                    // on it.
                    zoneId: { type: String, required: true },
                    enabled: { type: Boolean, default: true },
                    // Why this zone was switched off, shown to the customer there.
                    reason: { type: String, default: '' },
                    updatedBy: { type: String, default: '' },
                    updatedAt: { type: Date, default: null },
                },
                { _id: false },
            ),
        ],
    },
    { collection: 'platform_app_services', timestamps: true },
);

export const AppServicesState = mongoose.models.PlatformAppServices
    || mongoose.model('PlatformAppServices', appServicesSchema, 'platform_app_services');
