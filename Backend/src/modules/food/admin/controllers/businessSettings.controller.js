import { FoodBusinessSettings } from '../models/businessSettings.model.js';
import { overlayBusinessSettings, syncManagedFromLegacy } from '../../../../core/settings/platformProfile.service.js';
import crypto from 'crypto';
import { FoodPetpoojaSettings } from '../models/petpoojaSettings.model.js';
import { sendResponse } from '../../../../utils/response.js';
import { uploadImageBufferDetailed } from '../../../../services/cloudinary.service.js';

const maskSecret = (value) => {
    const str = String(value || '');
    if (!str) return '';
    if (str.length <= 4) return '••••';
    return `${'•'.repeat(Math.max(4, str.length - 4))}${str.slice(-4)}`;
};

/**
 * Returns the platform's global PetPooja credentials for the admin panel.
 * Secrets are masked; `hasApiKey`/`hasClientCode` tell the UI whether a value is set.
 */
/** The callback URL to register with Petpooja, token included. Empty until a secret exists. */
const petpoojaWebhookUrl = (req, secret) => {
    if (!secret) return '';
    const host = req.get?.('x-forwarded-host') || req.get?.('host') || '';
    const proto = req.get?.('x-forwarded-proto') || req.protocol || 'https';
    return `${proto}://${host}/api/v1/petpooja/webhook?token=${encodeURIComponent(secret)}`;
};

export async function getPetpoojaSettings(req, res, next) {
    try {
        let settings = await FoodPetpoojaSettings.findOne().lean();
        if (!settings) {
            settings = await FoodPetpoojaSettings.create({});
            settings = settings.toObject();
        }
        return sendResponse(res, 200, 'PetPooja settings fetched successfully', {
            enabled: settings.enabled,
            apiUrl: settings.apiUrl,
            apiKeyMasked: maskSecret(settings.apiKey),
            clientCodeMasked: maskSecret(settings.clientCode),
            hasApiKey: Boolean(settings.apiKey),
            hasClientCode: Boolean(settings.clientCode),
            webhookUrl: petpoojaWebhookUrl(req, settings.webhookSecret),
            updatedAt: settings.updatedAt,
        });
    } catch (error) {
        next(error);
    }
}

/**
 * Updates the global PetPooja credentials from the admin panel.
 * apiKey / clientCode are only overwritten when a non-empty value is supplied,
 * so the admin isn't forced to re-enter secrets on every save.
 */
export async function updatePetpoojaSettings(req, res, next) {
    try {
        const { enabled, apiKey, clientCode, apiUrl } = req.body || {};

        let settings = await FoodPetpoojaSettings.findOne();
        if (!settings) settings = new FoodPetpoojaSettings();

        if (enabled !== undefined) settings.enabled = Boolean(enabled);
        if (apiUrl !== undefined) {
            if (apiUrl && !/^https?:\/\/.+/i.test(String(apiUrl).trim())) {
                return res.status(400).json({ success: false, message: 'apiUrl must be a valid http(s) URL' });
            }
            if (apiUrl) settings.apiUrl = String(apiUrl).trim();
        }
        if (typeof apiKey === 'string' && apiKey.trim()) settings.apiKey = apiKey.trim();
        if (typeof clientCode === 'string' && clientCode.trim()) settings.clientCode = clientCode.trim();

        // Guard: can't enable the integration without both credentials present.
        if (settings.enabled && (!settings.apiKey || !settings.clientCode)) {
            return res.status(400).json({ success: false, message: 'apiKey and clientCode are required to enable PetPooja' });
        }

        // The status webhook refuses every call without this secret.
        if (settings.enabled && !settings.webhookSecret) {
            settings.webhookSecret = crypto.randomBytes(24).toString('hex');
        }

        await settings.save();
        return sendResponse(res, 200, 'PetPooja settings updated successfully', {
            enabled: settings.enabled,
            apiUrl: settings.apiUrl,
            apiKeyMasked: maskSecret(settings.apiKey),
            clientCodeMasked: maskSecret(settings.clientCode),
            hasApiKey: Boolean(settings.apiKey),
            hasClientCode: Boolean(settings.clientCode),
            webhookUrl: petpoojaWebhookUrl(req, settings.webhookSecret),
        });
    } catch (error) {
        next(error);
    }
}

/**
 * Sets (or clears) the platform admin UPI QR shown to customers when a delivery
 * partner has not uploaded their own QR. The image itself is uploaded via
 * /uploads/image by the admin panel; this only stores the resulting URL, so
 * there is no multipart body and none of the heavy business-form validation.
 * Pass an empty url to clear it.
 */
export async function setAdminUpiQr(req, res, next) {
    try {
        const url = typeof req.body?.url === 'string' ? req.body.url.trim() : '';
        if (url && !/^https?:\/\/.+/i.test(url)) {
            return res.status(400).json({ success: false, message: 'url must be a valid http(s) link' });
        }

        let settings = await FoodBusinessSettings.findOne();
        if (!settings) settings = new FoodBusinessSettings();

        settings.adminUpiQr = { url, publicId: settings.adminUpiQr?.publicId || '' };
        await settings.save();

        return sendResponse(res, 200, url ? 'Admin QR saved' : 'Admin QR removed', {
            adminUpiQr: settings.adminUpiQr,
        });
    } catch (error) {
        next(error);
    }
}

// The Google Maps API key the apps use for HTTP Maps services. Saved here and
// read by every app via the public business-settings endpoint, so it can be
// rotated without a rebuild.
export async function setMapApiKey(req, res, next) {
    try {
        const key = typeof req.body?.mapApiKey === 'string' ? req.body.mapApiKey.trim() : '';
        // A Google Maps key is "AIza" + 35 url-safe chars; validate loosely so a
        // paste with surrounding spaces still works but obvious junk is refused.
        if (key && !/^AIza[0-9A-Za-z_-]{20,}$/.test(key)) {
            return res.status(400).json({ success: false, message: 'That does not look like a Google Maps API key.' });
        }

        let settings = await FoodBusinessSettings.findOne();
        if (!settings) settings = new FoodBusinessSettings();

        settings.mapApiKey = key;
        await settings.save();

        return sendResponse(res, 200, key ? 'Map key saved' : 'Map key cleared', {
            mapApiKey: settings.mapApiKey,
        });
    } catch (error) {
        next(error);
    }
}

export async function getBusinessSettings(req, res, next) {
    try {
        let settings = await FoodBusinessSettings.findOne().lean();
        if (!settings) {
            // Create default settings if none exist
            settings = await FoodBusinessSettings.create({
                companyName: 'Quick Drop',
                email: 'admin@Quick Drop.com'
            });
        }
        // Master settings win where set (core/settings/platformProfile.service.js).
        return sendResponse(res, 200, 'Business settings fetched successfully', await overlayBusinessSettings(settings));
    } catch (error) {
        next(error);
    }
}

export async function updateBusinessSettings(req, res, next) {
    try {
        const data = req.body.data ? JSON.parse(req.body.data) : {};
        const { companyName, email, phoneCountryCode, phoneNumber, address, state, pincode, region } = data;

        // Validation
        if (!companyName || companyName.trim().length < 2 || companyName.trim().length > 50) {
            return res.status(400).json({ success: false, message: 'Company name must be between 2 and 50 characters' });
        }
        if (!email || email.length > 100 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
            return res.status(400).json({ success: false, message: 'Invalid email address (max 100 characters)' });
        }
        if (!phoneNumber || !/^\d{7,15}$/.test(phoneNumber.trim())) {
            return res.status(400).json({ success: false, message: 'Invalid phone number (7-15 digits required)' });
        }
        if (address && address.length > 250) {
            return res.status(400).json({ success: false, message: 'Address is too long (max 250 characters)' });
        }
        if (state && state.length > 50) {
            return res.status(400).json({ success: false, message: 'State name is too long (max 50 characters)' });
        }
        if (pincode && !/^\d{4,10}$/.test(pincode.trim())) {
            return res.status(400).json({ success: false, message: 'Invalid pincode (4-10 digits required)' });
        }

        let settings = await FoodBusinessSettings.findOne();
        if (!settings) {
            settings = new FoodBusinessSettings();
        }

        if (companyName) settings.companyName = companyName;
        if (email) settings.email = email;
        if (phoneCountryCode || phoneNumber) {
            settings.phone = {
                countryCode: phoneCountryCode || settings.phone?.countryCode || '+91',
                number: phoneNumber || settings.phone?.number || ''
            };
        }
        if (address !== undefined) settings.address = address;
        if (state !== undefined) settings.state = state;
        if (pincode !== undefined) settings.pincode = pincode;
        if (region) settings.region = region;

        // Handle file uploads
        if (req.files) {
            if (req.files.logo) {
                const logoResult = await uploadImageBufferDetailed(req.files.logo[0].buffer, 'business/logos');
                settings.logo = {
                    url: logoResult.secure_url,
                    publicId: logoResult.public_id
                };
            }
            if (req.files.favicon) {
                const faviconResult = await uploadImageBufferDetailed(req.files.favicon[0].buffer, 'business/favicons');
                settings.favicon = {
                    url: faviconResult.secure_url,
                    publicId: faviconResult.public_id
                };
            }
            if (req.files.restaurantLogo) {
                const logoResult = await uploadImageBufferDetailed(req.files.restaurantLogo[0].buffer, 'business/restaurantLogos');
                settings.restaurantLogo = {
                    url: logoResult.secure_url,
                    publicId: logoResult.public_id
                };
            }
            if (req.files.deliveryPartnerLogo) {
                const logoResult = await uploadImageBufferDetailed(req.files.deliveryPartnerLogo[0].buffer, 'business/deliveryPartnerLogos');
                settings.deliveryPartnerLogo = {
                    url: logoResult.secure_url,
                    publicId: logoResult.public_id
                };
            }
        }

        await settings.save();
        await syncManagedFromLegacy({ name: companyName, email, phone: phoneNumber, address, state, pincode, logoUrl: settings.logo?.url, faviconUrl: settings.favicon?.url });
        return sendResponse(res, 200, 'Business settings updated successfully', await overlayBusinessSettings(settings.toObject()));
    } catch (error) {
        next(error);
    }
}

