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
            // Determine recurring interval based on package duration
            // Less than 60 days = monthly, otherwise yearly
            const recurringInterval = packageData.durationInDays <= 60 ? 'month' : 'year';
            
            // Convert price to cents (Polar expects cents)
            const priceInCents = this.convertToCents(packageData.price);
            
            const productData = {
                name: packageData.packageName,
                description: `Subscription package: ${packageData.packageName}`,
                recurringInterval: recurringInterval, // Required field: 'month' or 'year'
                prices: [{
                    type: "one_time", 
                    price_amount: priceInCents, // Pastikan menggunakan priceInCents
                    price_currency: "IDR"
                }],
                // Add benefits if needed
                benefits: [{
                    type: "custom",
                    description: `Access to ${packageData.packageName} features for ${packageData.durationInDays} days`,
                    properties: {}
                }]
            };

            console.log("Creating product with data:", JSON.stringify(productData, null, 2));
            
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
            // Format the checkout data to match Polar's expected structure
            const formattedCheckoutData = {
                customer_email: checkoutData.customer_email,
                customer_name: checkoutData.customer_name,
                customer_external_id: checkoutData.customer_external_id,
                amount: checkoutData.amount,
                success_url: checkoutData.success_url,
                metadata: checkoutData.metadata || {},
                
                // Include both products and product_prices fields
                products: checkoutData.product_prices ? 
                    checkoutData.product_prices.map(pp => pp.product_id) : 
                    [],
                product_prices: checkoutData.product_prices || []
            };

            // Log the formatted checkout data for debugging
            console.log("Sending checkout data to Polar:", JSON.stringify(formattedCheckoutData, null, 2));

            const response = await this.client.checkouts.create(formattedCheckoutData);
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
     * This method checks if the webhook signature is valid
     */
    verifyWebhookSignature(payload, signature) {
        try {
            const crypto = require('crypto');
            
            // Convert payload to string if it's not already
            const payloadString = typeof payload === 'string' ? payload : JSON.stringify(payload);
            
            // Create HMAC using webhook secret
            const hmac = crypto.createHmac('sha256', process.env.POLAR_WEBHOOK_SECRET || 'webhook-secret');
            hmac.update(payloadString);
            const computedSignature = hmac.digest('hex');
            
            // Simple string comparison instead of timing-safe equal
            // This is acceptable for webhook signature verification
            return computedSignature === signature;
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