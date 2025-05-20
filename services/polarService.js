const { Polar } = require('@polar-sh/sdk');
require('dotenv').config();

class PolarService {
    constructor() {
        this.client = new Polar({
            accessToken: process.env.POLAR_ACCESS_TOKEN,
            server: 'sandbox' // Gunakan 'sandbox' untuk development, 'production' untuk production
        });
    }

    /**
     * Create a product in Polar
     */
    async createProduct(packageData) {
        try {
            const productData = {
                name: packageData.packageName,
                description: `Subscription package: ${packageData.packageName}`,
                prices: [{
                    type: "one_time",
                    price_amount: packageData.price,
                    price_currency: "IDR"
                }],
                // Add benefits if needed
                benefits: [{
                    type: "custom",
                    description: `Access to ${packageData.packageName} features`,
                    properties: {}
                }]
            };

            const response = await this.client.products.create(productData);
            return response;
        } catch (error) {
            console.error("Error creating Polar product:", error.response?.data || error.message);
            throw new Error(`Failed to create product: ${error.response?.data?.message || error.message}`);
        }
    }

    /**
     * Create checkout session
     */
    async createCheckout(checkoutData) {
        try {
            const response = await this.client.checkouts.create(checkoutData);
            return response;
        } catch (error) {
            console.error("Error creating Polar checkout:", error.response?.data || error.message);
            throw new Error(`Failed to create checkout: ${error.response?.data?.message || error.message}`);
        }
    }

    /**
     * Get checkout session by ID
     */
    async getCheckout(checkoutId) {
        try {
            const response = await this.client.checkouts.get(checkoutId);
            return response;
        } catch (error) {
            console.error("Error getting Polar checkout:", error.response?.data || error.message);
            throw new Error(`Failed to get checkout: ${error.response?.data?.message || error.message}`);
        }
    }

    /**
     * Verify webhook signature
     */
    verifyWebhookSignature(payload, signature) {
        const crypto = require('crypto');
        const hmac = crypto.createHmac('sha256', process.env.POLAR_WEBHOOK_SECRET);
        hmac.update(JSON.stringify(payload));
        const computedSignature = hmac.digest('hex');
        
        try {
            return crypto.timingSafeEqual(
                Buffer.from(signature, 'hex'),
                Buffer.from(computedSignature, 'hex')
            );
        } catch (error) {
            console.error("Webhook signature verification error:", error);
            return false;
        }
    }

    /**
     * Convert IDR to cents (Polar uses cents)
     */
    convertToCents(amount) {
        return Math.round(amount * 100);
    }

    /**
     * Convert cents to IDR
     */
    convertFromCents(cents) {
        return Math.round(cents / 100);
    }
}

module.exports = new PolarService();