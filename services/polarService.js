// services/polarService.js
const productsAPI = require('./polar/products');
const customersAPI = require('./polar/customers');
const checkoutsAPI = require('./polar/checkouts');
const ordersAPI = require('./polar/orders');
const discountsAPI = require('./polar/discounts');
const client = require('./polar/client'); // SDK client instance

// standardwebhooks untuk verifikasi webhook
// const { Webhook } = require('standardwebhooks');
// Atau, jika SDK Polar menyediakan utilitasnya sendiri:
const { validateEvent, WebhookVerificationError } = require('@polar-sh/sdk/webhooks');


class PolarService {
    constructor() {
        console.log("PolarService class instantiated. Using modules from ./polar/ sub-directory.");
    }

    // Customers
    async createOrUpdateCustomer(userData) {
        return customersAPI.createOrUpdateCustomer(userData);
    }
    async getCustomerByExternalId(externalId) {
        return customersAPI.getCustomerByExternalId(externalId);
    }

    // Products
    async createProduct(packageData) {
        return productsAPI.createProduct(packageData);
    }
    async updateProduct(productId, packageData) {
        return productsAPI.updateProduct(productId, packageData);
    }
    async archiveProduct(productId) {
        return productsAPI.archiveProduct(productId);
    }
    async getProduct(productId) {
        return productsAPI.getProduct(productId);
    }

    // Checkouts
    async createCheckout(checkoutData) {
        // Pastikan checkoutData.line_items sudah benar formatnya
        // Contoh: checkoutData.line_items = [{ price_id: "price_xxx", quantity: 1 }]
        if (!checkoutData.line_items) { // atau `!checkoutData.products` tergantung SDK
            throw new Error("line_items (or products) are required for creating checkout.");
        }
        return checkoutsAPI.createCheckout(checkoutData);
    }
    async getCheckout(checkoutId) {
        return checkoutsAPI.getCheckout(checkoutId);
    }

    // Orders
    async getOrder(orderId) {
        return ordersAPI.getOrder(orderId);
    }

    // Discounts
    async createDiscount(voucherData) {
        return discountsAPI.createDiscount(voucherData);
    }
    async updateDiscount(discountId, voucherData) {
        return discountsAPI.updateDiscount(discountId, voucherData);
    }
    async archiveDiscount(discountId) {
        return discountsAPI.archiveDiscount(discountId);
    }
    
    // Subscriptions (Langsung menggunakan client SDK)
    async getSubscription(subscriptionId) {
        if (client && client.subscriptions && typeof client.subscriptions.get === 'function') {
            try {
                console.log(`[PolarService] Getting Polar subscription by ID: ${subscriptionId}`);
                return await client.subscriptions.get(subscriptionId); // Asumsi SDK punya client.subscriptions.get({id: subscriptionId})
            } catch (error) {
                // ... (error handling seperti yang sudah Anda miliki)
                console.error(`[PolarService] ❌ Error getting Polar subscription (ID: ${subscriptionId}):`, error.message);
                if (error.response && error.response.data) {
                    console.error("[PolarService] Polar Error Details for getSubscription:", JSON.stringify(error.response.data, null, 2));
                }
                throw new Error(`Failed to get subscription from Polar (ID: ${subscriptionId}): ${error.response?.data?.detail || error.response?.data?.message || error.message}`);
            }
        }
        console.warn("[PolarService] getSubscription: Polar client or method not available.");
        throw new Error("Polar client.subscriptions.get is not available or not a function.");
    }

    async cancelSubscription(subscriptionId) {
         if (client && client.subscriptions && typeof client.subscriptions.cancel === 'function') {
            try {
                console.log(`[PolarService] Canceling Polar subscription by ID: ${subscriptionId}`);
                return await client.subscriptions.cancel(subscriptionId);  // Asumsi SDK punya client.subscriptions.cancel({id: subscriptionId})
            } catch (error) {
                // ... (error handling seperti yang sudah Anda miliki)
                console.error(`[PolarService] ❌ Error canceling Polar subscription (ID: ${subscriptionId}):`, error.message);
                if (error.response && error.response.data) {
                    console.error("[PolarService] Polar Error Details for cancelSubscription:", JSON.stringify(error.response.data, null, 2));
                }
                throw new Error(`Failed to cancel subscription in Polar (ID: ${subscriptionId}): ${error.response?.data?.detail || error.message}`);
            }
        }
        console.warn("[PolarService] cancelSubscription: Polar client or method not available.");
        throw new Error("Polar client.subscriptions.cancel is not available or not a function.");
    }

    // Webhooks
    verifyWebhookSignature(rawBody, signatureHeader) {
        const secret = process.env.POLAR_WEBHOOK_SECRET;
        if (!secret) {
            console.error("[PolarService] CRITICAL: POLAR_WEBHOOK_SECRET is not configured. Cannot verify webhook signature.");
            // Di produksi, ini harusnya menghasilkan error atau setidaknya flag bahwa verifikasi tidak bisa dilakukan.
            // Jika tidak ada secret, dan kita di produksi, verifikasi harus gagal.
            if (process.env.NODE_ENV === 'production') return false;
            // Di non-prod, jika tidak ada secret, kita bisa log warning dan return true (untuk testing lokal tanpa ngrok/secret)
            // TAPI ini berisiko jika tidak sengaja terdeploy.
            console.warn("[PolarService] POLAR_WEBHOOK_SECRET not set. Skipping signature verification (non-production only with this setting).");
            return true; // HATI-HATI dengan ini di production.
        }

        try {
            // Menggunakan utilitas dari @polar-sh/sdk/webhooks
            // `rawBody` harus berupa Buffer atau string mentah
            // `signatureHeader` adalah nilai dari header 'Polar-Signature'
            const event = validateEvent(
                rawBody, // ini harus raw body (Buffer atau string)
                { 'polar-signature': signatureHeader }, // headers object
                secret
            );
            console.log("[PolarService] Webhook signature verified successfully using @polar-sh/sdk/webhooks.");
            return event; // Mengembalikan event yang sudah divalidasi dan di-parse
        } catch (error) {
            if (error instanceof WebhookVerificationError) {
                console.error("[PolarService] Webhook signature verification failed (WebhookVerificationError):", error.message);
            } else {
                console.error("[PolarService] An unexpected error occurred during webhook signature verification:", error.message);
            }
            return false;
        }
    }
}

const polarServiceInstance = new PolarService();
module.exports = polarServiceInstance;