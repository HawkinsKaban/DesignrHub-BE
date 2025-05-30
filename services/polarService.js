// hawkinskaban/designrhub-be/DesignrHub-BE-b6b71c7cbe6c9bb82dbe45c75398166882decdfc/services/polarService.js

// Import functions directly from their respective modules
const productsAPI = require('./polar/products');
const customersAPI = require('./polar/customers');
const checkoutsAPI = require('./polar/checkouts');
const ordersAPI = require('./polar/orders');
const discountsAPI = require('./polar/discounts');
const client = require('./polar/client'); // The initialized Polar SDK client

// standardwebhooks is a dependency of @polar-sh/sdk, used for webhook verification
const { Webhook } = require('standardwebhooks');

class PolarService {
    constructor() {
        // The Polar SDK client is initialized in './polar/client.js'
        // and used by the individual API modules (productsAPI, customersAPI, etc.)
        console.log("PolarService class instantiated. Using direct imports from ./polar/ submodules.");
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

    // Subscriptions
    // These methods will now call the Polar SDK client directly.
    // The dummy client in your services/polar/client.js suggests these methods exist and take an ID directly.
    async getSubscription(subscriptionId) {
        if (client && client.subscriptions && typeof client.subscriptions.get === 'function') {
            try {
                console.log(`[PolarService] Getting Polar subscription by ID: ${subscriptionId}`);
                return await client.subscriptions.get(subscriptionId);
            } catch (error) {
                console.error(`[PolarService] ❌ Error getting Polar subscription (ID: ${subscriptionId}):`, error.message);
                if (error.response && error.response.data) {
                    console.error("[PolarService] Polar Error Details for getSubscription:", JSON.stringify(error.response.data, null, 2));
                }
                throw new Error(`Failed to get subscription from Polar (ID: ${subscriptionId}): ${error.response?.data?.detail || error.message}`);
            }
        }
        console.warn("[PolarService] getSubscription: Polar client or method not available.");
        throw new Error("Polar client.subscriptions.get is not available or not a function.");
    }

    async cancelSubscription(subscriptionId) {
        if (client && client.subscriptions && typeof client.subscriptions.cancel === 'function') {
            try {
                console.log(`[PolarService] Canceling Polar subscription by ID: ${subscriptionId}`);
                return await client.subscriptions.cancel(subscriptionId);
            } catch (error) {
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
    verifyWebhookSignature(payload, signatureHeader) {
        // Ensure POLAR_WEBHOOK_SECRET is available in your .env file
        const secret = process.env.POLAR_WEBHOOK_SECRET;
        if (!secret) {
            console.error("[PolarService] POLAR_WEBHOOK_SECRET is not configured. Cannot verify webhook signature.");
            return false;
        }

        try {
            const wh = new Webhook(secret);
            
            // The 'payload' should be the raw request body (Buffer or string).
            // 'signatureHeader' is the value of the 'Polar-Signature' or 'X-Polar-Signature' header.
            // The verify method will throw an error if verification fails.
            wh.verify(payload, signatureHeader); 
            console.log("[PolarService] Webhook signature verified successfully.");
            return true;
        } catch (err) {
            console.error("[PolarService] Webhook signature verification failed:", err.message);
            return false;
        }
    }
}

const polarServiceInstance = new PolarService();
module.exports = polarServiceInstance;