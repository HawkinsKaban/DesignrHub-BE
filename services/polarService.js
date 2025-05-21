const { Polar } = require('@polar-sh/sdk');
const crypto = require('crypto');
require('dotenv').config();

// Add debug logs for initialization
console.log('Initializing Polar service...');
console.log(`POLAR_ACCESS_TOKEN exists: ${!!process.env.POLAR_ACCESS_TOKEN}`);
console.log(`NODE_ENV: ${process.env.NODE_ENV}`);

class PolarService {
    constructor() {
        try {
            this.client = new Polar({
                accessToken: process.env.POLAR_ACCESS_TOKEN,
                server: process.env.NODE_ENV === 'production' ? 'production' : 'sandbox'
            });
            console.log('✅ Polar client initialized successfully');
            
            // Log available methods for debugging
            console.log('Available customer methods:', Object.keys(this.client.customers));
            console.log('Available product methods:', Object.keys(this.client.products));
        } catch (error) {
            console.error('❌ Failed to initialize Polar client:', error);
            // Create a dummy client to prevent crashes
            this.client = {
                customers: { 
                    create: async () => ({ id: 'dummy-customer-id' }),
                    get: async () => ({}),
                    list: async () => ({ items: [] })
                },
                products: { 
                    create: async () => ({ id: 'dummy-product-id', prices: [] }),
                    update: async () => ({}),
                    get: async () => ({ prices: [] }),
                    archive: async () => ({})
                },
                prices: {
                    create: async () => ({}),
                    update: async () => ({}),
                    archive: async () => ({})
                },
                checkouts: { 
                    create: async () => ({ id: 'dummy-checkout-id', url: '#' }),
                    get: async () => ({})
                },
                orders: {
                    get: async () => ({})
                },
                discounts: {
                    create: async () => ({ id: 'dummy-discount-id' }),
                    update: async () => ({}),
                    archive: async () => ({})
                },
                subscriptions: {
                    get: async () => ({}),
                    cancel: async () => ({})
                }
            };
        }
    }

    /**
     * Customer Management
     */
    async createOrUpdateCustomer(userData) {
        try {
            console.log(`Creating/updating Polar customer for: ${userData.email}`);
            
            const customerData = {
                email: userData.email,
                name: userData.username || userData.email.split('@')[0],
                external_id: userData._id.toString(),
                metadata: {
                    user_id: userData._id.toString(),
                    registered_at: new Date().toISOString(),
                    platform: 'designrhub'
                }
            };

            // Add phone number if available
            if (userData.nomor) {
                customerData.metadata.phone = userData.nomor;
            }

            // Use create instead of upsert 
            const response = await this.client.customers.create(customerData);
            console.log(`✅ Polar customer created: ${response.id}`);
            return response;
        } catch (error) {
            console.error("❌ Error creating/updating Polar customer:", error.response?.data || error.message);
            throw new Error(`Failed to create/update customer: ${error.response?.data?.message || error.message}`);
        }
    }
    
    async getCustomer(customerId) {
        try {
            return await this.client.customers.get(customerId);
        } catch (error) {
            console.error("Error getting Polar customer:", error.response?.data || error.message);
            throw new Error(`Failed to get customer: ${error.response?.data?.message || error.message}`);
        }
    }

    async getCustomerByExternalId(externalId) {
        try {
            const query = { external_id: externalId };
            const customers = await this.client.customers.list({ query });
            
            if (customers && customers.items && customers.items.length > 0) {
                return customers.items[0];
            }
            return null;
        } catch (error) {
            console.error("Error getting Polar customer by external ID:", error.response?.data || error.message);
            return null;
        }
    }

    /**
     * Product Management
     */
    async createProduct(packageData) {
        try {
            // Determine recurring interval based on package duration
            // This is required by Polar API
            const recurringInterval = packageData.durationInDays <= 60 ? 'month' : 'year';
            
            // Convert price to cents (Polar expects cents)
            const priceInCents = this.convertToCents(packageData.price);
            
            // Fixed: Only include one price as required by Polar API
            // If there's a discount, use that as the price, otherwise use the regular price
            const useDiscountedPrice = packageData.onDiscount && 
                                      packageData.discountPrice && 
                                      packageData.endDiscountDate > new Date();
                                      
            const finalPriceInCents = useDiscountedPrice ? 
                this.convertToCents(packageData.discountPrice) : 
                priceInCents;
            
            const productData = {
                name: packageData.packageName,
                description: `${packageData.packageName} - ${packageData.durationName}`,
                // Add required recurringInterval field
                recurringInterval: recurringInterval,
                prices: [
                    {
                        type: "one_time", 
                        price_amount: finalPriceInCents,
                        price_currency: "IDR",
                        // If using discounted price, include that in metadata
                        ...(useDiscountedPrice && {
                            metadata: {
                                original_price: priceInCents,
                                discount_ends: packageData.endDiscountDate ? 
                                    new Date(packageData.endDiscountDate).toISOString() : null
                            }
                        })
                    }
                ],
                benefits: [
                    {
                        type: "custom",
                        description: `Access to premium features for ${packageData.durationInDays} days`,
                        properties: {
                            duration_days: packageData.durationInDays.toString(),
                            duration_name: packageData.durationName
                        }
                    }
                ],
                metadata: {
                    package_id: packageData._id.toString(),
                    duration_days: packageData.durationInDays,
                    priority: packageData.priority || 0,
                    platform: 'designrhub',
                    // Store discount info in metadata
                    has_discount: useDiscountedPrice,
                    regular_price: priceInCents,
                    ...(useDiscountedPrice && {
                        discount_price: this.convertToCents(packageData.discountPrice),
                        discount_ends: packageData.endDiscountDate ? 
                            new Date(packageData.endDiscountDate).toISOString() : null
                    })
                }
            };

            console.log("Creating Polar product:", JSON.stringify(productData, null, 2));
            
            const response = await this.client.products.create(productData);
            console.log(`✅ Polar product created: ${response.id}`);
            return response;
        } catch (error) {
            console.error("❌ Error creating Polar product:", error.response?.data || error.message);
            throw new Error(`Failed to create product: ${error.response?.data?.message || error.message}`);
        }
    }

    async updateProduct(productId, packageData) {
        try {
            // Fetch existing product first
            const existingProduct = await this.client.products.get(productId);
            
            // Determine recurring interval based on package duration
            const recurringInterval = packageData.durationInDays <= 60 ? 'month' : 'year';
            
            // Convert price to cents (Polar expects cents)
            const priceInCents = this.convertToCents(packageData.price);
            
            // Determine if discount should be applied
            const useDiscountedPrice = packageData.onDiscount && 
                                      packageData.discountPrice && 
                                      packageData.endDiscountDate > new Date();
            
            // Prepare update data
            const updateData = {
                name: packageData.packageName,
                description: `${packageData.packageName} - ${packageData.durationName}`,
                recurringInterval: recurringInterval,
                metadata: {
                    ...existingProduct.metadata,
                    package_id: packageData._id.toString(),
                    duration_days: packageData.durationInDays,
                    priority: packageData.priority || 0,
                    updated_at: new Date().toISOString(),
                    // Store discount info in metadata
                    has_discount: useDiscountedPrice,
                    regular_price: priceInCents,
                    ...(useDiscountedPrice && {
                        discount_price: this.convertToCents(packageData.discountPrice),
                        discount_ends: packageData.endDiscountDate ? 
                            new Date(packageData.endDiscountDate).toISOString() : null
                    })
                }
            };
            
            // Update the product
            const response = await this.client.products.update(productId, updateData);
            console.log(`✅ Polar product updated: ${response.id}`);
            
            // Handle price updates separately
            await this.updateProductPrices(productId, packageData);
            
            return response;
        } catch (error) {
            console.error("❌ Error updating Polar product:", error.response?.data || error.message);
            throw new Error(`Failed to update product: ${error.response?.data?.message || error.message}`);
        }
    }
    
    async updateProductPrices(productId, packageData) {
        try {
            // Get all prices for this product
            const product = await this.client.products.get(productId);
            if (!product.prices || product.prices.length === 0) {
                throw new Error("No prices found for product");
            }
            
            // Get the main price (first price)
            const mainPrice = product.prices[0];
            if (!mainPrice || !mainPrice.id) {
                throw new Error("Invalid price data for product");
            }
            
            // Determine which price to use
            const useDiscountedPrice = packageData.onDiscount && 
                                      packageData.discountPrice && 
                                      packageData.endDiscountDate > new Date();
                                      
            const finalPriceInCents = useDiscountedPrice ? 
                this.convertToCents(packageData.discountPrice) : 
                this.convertToCents(packageData.price);
            
            // Update the price
            await this.client.prices.update(mainPrice.id, {
                price_amount: finalPriceInCents,
                metadata: {
                    ...(mainPrice.metadata || {}),
                    // If using discounted price, include that in metadata
                    ...(useDiscountedPrice && {
                        original_price: this.convertToCents(packageData.price),
                        discount_ends: packageData.endDiscountDate ? 
                            new Date(packageData.endDiscountDate).toISOString() : null
                    })
                }
            });
            
            return true;
        } catch (error) {
            console.error("❌ Error updating Polar product prices:", error.response?.data || error.message);
            throw new Error(`Failed to update product prices: ${error.response?.data?.message || error.message}`);
        }
    }
    
    async archiveProduct(productId) {
        try {
            // Archive the product
            const response = await this.client.products.archive(productId);
            console.log(`✅ Polar product archived: ${productId}`);
            return response;
        } catch (error) {
            console.error("❌ Error archiving Polar product:", error.response?.data || error.message);
            throw new Error(`Failed to archive product: ${error.response?.data?.message || error.message}`);
        }
    }
    
    async getProduct(productId) {
        try {
            return await this.client.products.get(productId);
        } catch (error) {
            console.error("Error getting Polar product:", error.response?.data || error.message);
            throw new Error(`Failed to get product: ${error.response?.data?.message || error.message}`);
        }
    }

    /**
     * Checkout and Payment Processing
     */
    async createCheckout(checkoutData) {
        try {
            // First, check if customer exists and create/update if needed
            let customer;
            if (checkoutData.customer_external_id) {
                customer = await this.getCustomerByExternalId(checkoutData.customer_external_id);
                
                if (!customer) {
                    // Create minimal customer if not found
                    customer = await this.createOrUpdateCustomer({
                        _id: checkoutData.customer_external_id,
                        email: checkoutData.customer_email,
                        username: checkoutData.customer_name
                    });
                }
            }

            // Format the checkout data to match Polar's expected structure
            const formattedCheckoutData = {
                customer_id: customer?.id,
                customer_email: checkoutData.customer_email,
                customer_name: checkoutData.customer_name,
                success_url: checkoutData.success_url,
                cancel_url: checkoutData.cancel_url || process.env.FE_URL,
                metadata: checkoutData.metadata || {},
            };
            
            // If there's an amount without product_prices, use it as a custom amount checkout
            if (checkoutData.amount && (!checkoutData.product_prices || !checkoutData.product_prices.length)) {
                formattedCheckoutData.amount = checkoutData.amount;
                formattedCheckoutData.currency = "IDR";
            }
            
            // Include products if provided
            if (checkoutData.product_prices && checkoutData.product_prices.length > 0) {
                formattedCheckoutData.product_prices = checkoutData.product_prices;
            }

            console.log("Creating Polar checkout:", JSON.stringify(formattedCheckoutData, null, 2));
            
            const response = await this.client.checkouts.create(formattedCheckoutData);
            console.log(`✅ Polar checkout created: ${response.id}`);
            return response;
        } catch (error) {
            console.error("❌ Error creating Polar checkout:", error.response?.data || error.message);
            throw new Error(`Failed to create checkout: ${error.response?.data?.message || error.message}`);
        }
    }

    async getCheckout(checkoutId) {
        try {
            return await this.client.checkouts.get(checkoutId);
        } catch (error) {
            console.error("Error getting Polar checkout:", error.response?.data || error.message);
            throw new Error(`Failed to get checkout: ${error.response?.data?.message || error.message}`);
        }
    }
    
    async getOrder(orderId) {
        try {
            return await this.client.orders.get(orderId);
        } catch (error) {
            console.error("Error getting Polar order:", error.response?.data || error.message);
            throw new Error(`Failed to get order: ${error.response?.data?.message || error.message}`);
        }
    }

    /**
     * Voucher Management
     */
    async createDiscount(voucherData) {
        try {
            let discountType = 'percentage';
            let discountValue = parseFloat(voucherData.discount);
            
            // Convert fixed discount to percentage if needed
            if (voucherData.discountType === 'fixed') {
                discountType = 'fixed';
            }
            
            const discountData = {
                name: voucherData.name,
                code: voucherData.code,
                type: discountType,
                value: discountValue,
                start_date: new Date(voucherData.startDate).toISOString(),
                end_date: new Date(voucherData.endDate).toISOString(),
                metadata: {
                    voucher_id: voucherData._id.toString(),
                    platform: 'designrhub',
                    status: voucherData.status
                }
            };
            
            // Add product restrictions if applicable
            if (voucherData.packageId && voucherData.packageId.length > 0) {
                discountData.metadata.package_ids = voucherData.packageId.map(id => id.toString());
            }
            
            console.log("Creating Polar discount:", JSON.stringify(discountData, null, 2));
            
            const response = await this.client.discounts.create(discountData);
            console.log(`✅ Polar discount created: ${response.id}`);
            return response;
        } catch (error) {
            console.error("❌ Error creating Polar discount:", error.response?.data || error.message);
            throw new Error(`Failed to create discount: ${error.response?.data?.message || error.message}`);
        }
    }
    
    async updateDiscount(discountId, voucherData) {
        try {
            let discountType = 'percentage';
            let discountValue = parseFloat(voucherData.discount);
            
            // Convert fixed discount to percentage if needed
            if (voucherData.discountType === 'fixed') {
                discountType = 'fixed';
            }
            
            const discountData = {
                name: voucherData.name,
                code: voucherData.code,
                type: discountType,
                value: discountValue,
                start_date: new Date(voucherData.startDate).toISOString(),
                end_date: new Date(voucherData.endDate).toISOString(),
                metadata: {
                    voucher_id: voucherData._id.toString(),
                    platform: 'designrhub',
                    status: voucherData.status
                }
            };
            
            // Add product restrictions if applicable
            if (voucherData.packageId && voucherData.packageId.length > 0) {
                discountData.metadata.package_ids = voucherData.packageId.map(id => id.toString());
            }
            
            console.log("Updating Polar discount:", JSON.stringify(discountData, null, 2));
            
            const response = await this.client.discounts.update(discountId, discountData);
            console.log(`✅ Polar discount updated: ${response.id}`);
            return response;
        } catch (error) {
            console.error("❌ Error updating Polar discount:", error.response?.data || error.message);
            throw new Error(`Failed to update discount: ${error.response?.data?.message || error.message}`);
        }
    }
    
    async archiveDiscount(discountId) {
        try {
            const response = await this.client.discounts.archive(discountId);
            console.log(`✅ Polar discount archived: ${discountId}`);
            return response;
        } catch (error) {
            console.error("❌ Error archiving Polar discount:", error.response?.data || error.message);
            throw new Error(`Failed to archive discount: ${error.response?.data?.message || error.message}`);
        }
    }

    /**
     * Subscription Management
     */
    async getSubscription(subscriptionId) {
        try {
            return await this.client.subscriptions.get(subscriptionId);
        } catch (error) {
            console.error("Error getting Polar subscription:", error.response?.data || error.message);
            throw new Error(`Failed to get subscription: ${error.response?.data?.message || error.message}`);
        }
    }
    
    async cancelSubscription(subscriptionId) {
        try {
            const response = await this.client.subscriptions.cancel(subscriptionId);
            console.log(`✅ Polar subscription cancelled: ${subscriptionId}`);
            return response;
        } catch (error) {
            console.error("❌ Error cancelling Polar subscription:", error.response?.data || error.message);
            throw new Error(`Failed to cancel subscription: ${error.response?.data?.message || error.message}`);
        }
    }

    /**
     * Webhook Verification
     */
    verifyWebhookSignature(payload, signature) {
        try {
            if (!process.env.POLAR_WEBHOOK_SECRET) {
                console.warn("⚠️ POLAR_WEBHOOK_SECRET not set - webhook verification will fail");
                return false;
            }
            
            // Convert payload to string if it's not already
            const payloadString = typeof payload === 'string' ? payload : JSON.stringify(payload);
            
            // Create HMAC using webhook secret
            const hmac = crypto.createHmac('sha256', process.env.POLAR_WEBHOOK_SECRET);
            hmac.update(payloadString);
            const computedSignature = hmac.digest('hex');
            
            // Use crypto.timingSafeEqual for secure comparison
            if (typeof signature !== 'string' || typeof computedSignature !== 'string') {
                return false;
            }
            
            try {
                // Convert signatures to Buffer for comparison
                const signatureBuffer = Buffer.from(signature);
                const computedBuffer = Buffer.from(computedSignature);
                
                // This will throw if lengths don't match
                return crypto.timingSafeEqual(signatureBuffer, computedBuffer);
            } catch (err) {
                console.error("Signature comparison error:", err);
                return false;
            }
        } catch (error) {
            console.error("Webhook signature verification error:", error);
            return false;
        }
    }

    /**
     * Utility Functions
     */
    convertToCents(amount) {
        return Math.round(parseFloat(amount) * 100);
    }

    convertFromCents(cents) {
        return Math.round(cents / 100);
    }
}

// Create and export a singleton instance
const polarService = new PolarService();
module.exports = polarService;