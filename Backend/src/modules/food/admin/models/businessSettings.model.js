import mongoose from 'mongoose';

const businessSettingsSchema = new mongoose.Schema(
    {
        companyName: { type: String, required: true, default: 'Quick Drop' },
        email: { type: String, required: true, default: 'admin@quickdropsindia.com' },
        phone: {
            countryCode: { type: String, default: '+91' },
            number: { type: String, default: '' }
        },
        address: { type: String, default: '' },
        state: { type: String, default: '' },
        pincode: { type: String, default: '' },
        region: { type: String, default: 'India' },
        logo: {
            url: { type: String, default: '' },
            publicId: { type: String, default: '' }
        },
        favicon: {
            url: { type: String, default: '' },
            publicId: { type: String, default: '' }
        },
        restaurantLogo: {
            url: { type: String, default: '' },
            publicId: { type: String, default: '' }
        },
        deliveryPartnerLogo: {
            url: { type: String, default: '' },
            publicId: { type: String, default: '' }
        },
        // Platform UPI QR shown to customers by a delivery partner who has not
        // uploaded their own QR. Set by the admin; read by the delivery app via
        // the public business-settings endpoint.
        adminUpiQr: {
            url: { type: String, default: '' },
            publicId: { type: String, default: '' }
        },
        // Google Maps API key used by the apps for HTTP Maps services (geocoding
        // etc.). Set by the admin here and read by every app via the public
        // business-settings endpoint, so the key can be rotated without a
        // rebuild. (The native map-display key stays in each app's manifest and
        // is build-time only.)
        mapApiKey: { type: String, default: '' }
    },
    { timestamps: true }
);

export const FoodBusinessSettings = mongoose.model('FoodBusinessSettings', businessSettingsSchema);

