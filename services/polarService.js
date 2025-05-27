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
                // Pastikan NODE_ENV diatur dengan benar untuk 'development' (sandbox) atau 'production'
                server: process.env.NODE_ENV === 'production' ? 'production' : 'sandbox'
            });
            console.log('✅ Polar client initialized successfully for environment:', process.env.NODE_ENV === 'production' ? 'production' : 'sandbox');

        } catch (error) {
            console.error('❌ Failed to initialize Polar client:', error);
            this.client = { // Dummy client
                customers: {
                    create: async (data) => { console.warn("Dummy Polar: customers.create called", data); return ({ id: `dummy-customer-${Date.now()}` }); },
                    get: async (id) => { console.warn("Dummy Polar: customers.get called", id); return ({ id }); },
                    list: async (query) => { console.warn("Dummy Polar: customers.list called", query); return ({ items: [] }); }
                },
                products: {
                    create: async (data) => { console.warn("Dummy Polar: products.create called", data); return ({ id: `dummy-product-${Date.now()}`, prices: [{ id: `dummy-price-${Date.now()}`, price_amount: data.prices[0]?.price_amount, price_currency: data.prices[0]?.price_currency }] }); },
                    update: async (id, data) => { console.warn("Dummy Polar: products.update called", id, data); return ({ id }); },
                    get: async (id) => { console.warn("Dummy Polar: products.get called", id); return ({ id, prices: [] }); },
                    archive: async (id) => { console.warn("Dummy Polar: products.archive called", id); return ({ id }); }
                },
                prices: {
                    create: async (data) => { console.warn("Dummy Polar: prices.create called", data); return ({ id: `dummy-price-${Date.now()}` }); },
                    update: async (id, data) => { console.warn("Dummy Polar: prices.update called", id, data); return ({ id }); },
                    archive: async (id) => { console.warn("Dummy Polar: prices.archive called", id); return ({ id }); }
                },
                checkouts: {
                    create: async (data) => { console.warn("Dummy Polar: checkouts.create called", data); return ({ id: `dummy-checkout-${Date.now()}`, url: `http://localhost/dummy-checkout/${Date.now()}`, expires_at: new Date(Date.now() + 3600 * 1000).toISOString() }); },
                    get: async (id) => { console.warn("Dummy Polar: checkouts.get called", id); return ({ id }); }
                },
                orders: {
                    get: async (id) => { console.warn("Dummy Polar: orders.get called", id); return ({ id }); }
                },
                discounts: {
                    create: async (data) => { console.warn("Dummy Polar: discounts.create called", data); return ({ id: `dummy-discount-${Date.now()}` }); },
                    update: async (id, data) => { console.warn("Dummy Polar: discounts.update called", id, data); return ({ id }); },
                    archive: async (id) => { console.warn("Dummy Polar: discounts.archive called", id); return ({ id }); }
                },
                subscriptions: {
                    get: async (id) => { console.warn("Dummy Polar: subscriptions.get called", id); return ({ id }); },
                    cancel: async (id) => { console.warn("Dummy Polar: subscriptions.cancel called", id); return ({ id }); }
                }
            };
        }
    }

    /**
     * Customer Management
     */
    async createOrUpdateCustomer(userData) {
        try {
            console.log(`[PolarService] Creating/updating Polar customer for: ${userData.email}`);

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

            if (userData.nomor) {
                customerData.metadata.phone = userData.nomor;
            }

            console.log("[PolarService] Sending customer data to Polar:", JSON.stringify(customerData, null, 2));
            const response = await this.client.customers.create(customerData);
            console.log(`[PolarService] ✅ Polar customer created/retrieved: ${response.id}`);
            return response;
        } catch (error) {
            console.error("[PolarService] ❌ Error creating/updating Polar customer:", error.message);
            if (error.response && error.response.data) {
                console.error("[PolarService] Polar Error Details:", JSON.stringify(error.response.data, null, 2));
            }
            throw new Error(`Failed to create/update customer in Polar: ${error.response?.data?.detail || error.response?.data?.message || error.message}`);
        }
    }

    async getCustomer(customerId) {
        try {
            console.log(`[PolarService] Getting Polar customer by ID: ${customerId}`);
            return await this.client.customers.get(customerId);
        } catch (error) {
            console.error("[PolarService] ❌ Error getting Polar customer:", error.message);
            if (error.response && error.response.data) {
                console.error("[PolarService] Polar Error Details:", JSON.stringify(error.response.data, null, 2));
            }
            throw new Error(`Failed to get customer from Polar: ${error.response?.data?.detail || error.response?.data?.message || error.message}`);
        }
    }

    async getCustomerByExternalId(externalId) {
        try {
            console.log(`[PolarService] Getting Polar customer by external ID: ${externalId}`);
            const query = { external_id: externalId };
            const customers = await this.client.customers.list({ query });

            if (customers && customers.items && customers.items.length > 0) {
                console.log(`[PolarService] ✅ Found Polar customer by external ID: ${customers.items[0].id}`);
                return customers.items[0];
            }
            console.log(`[PolarService] No Polar customer found for external ID: ${externalId}`);
            return null;
        } catch (error) {
            console.error("[PolarService] ❌ Error getting Polar customer by external ID:", error.message);
             if (error.response && error.response.data) {
                console.error("[PolarService] Polar Error Details:", JSON.stringify(error.response.data, null, 2));
            }
            return null; // Return null on error to avoid breaking flows, error is logged
        }
    }

    /**
     * Product Management
     */
    async createProduct(packageData) {
        try {
            console.log(`[PolarService] Creating Polar product for package: ${packageData.packageName} (ID: ${packageData._id})`);
            const recurringInterval = packageData.durationInDays <= 60 ? 'month' : 'year';

            const basePriceUSD = parseFloat(packageData.price);
            if (isNaN(basePriceUSD)) {
                throw new Error(`Invalid base price for package: ${packageData.packageName}`);
            }
            const basePriceInCents = Math.round(basePriceUSD * 100);

            let finalPriceInCents = basePriceInCents;
            const useDiscountedPrice = packageData.onDiscount &&
                                      packageData.discountPrice != null &&
                                      new Date(packageData.endDiscountDate) > new Date();

            let regularPriceForMetadata = basePriceInCents;
            let discountPriceForMetadata = null;

            if (useDiscountedPrice) {
                const discountPriceUSD = parseFloat(packageData.discountPrice);
                if (isNaN(discountPriceUSD)) {
                    throw new Error(`Invalid discount price for package: ${packageData.packageName}`);
                }
                finalPriceInCents = Math.round(discountPriceUSD * 100);
                discountPriceForMetadata = finalPriceInCents;
            }

            const productData = {
                name: packageData.packageName,
                description: `${packageData.packageName} - ${packageData.durationName}`,
                recurringInterval: recurringInterval,
                prices: [
                    {
                        type: "one_time",
                        price_amount: finalPriceInCents,
                        price_currency: "USD",
                        metadata: {
                            is_discounted_price: useDiscountedPrice,
                            ...(useDiscountedPrice && {
                                original_price_cents: regularPriceForMetadata,
                                discount_ends_at: packageData.endDiscountDate ? new Date(packageData.endDiscountDate).toISOString() : null
                            })
                        }
                    }
                ],
                benefits: [
                    {
                        type: "custom",
                        description: `Access to premium features for ${packageData.durationInDays} days for package ${packageData.packageName}`,
                        properties: {
                            duration_days: packageData.durationInDays.toString(),
                            duration_name: packageData.durationName,
                            package_name: packageData.packageName
                        }
                    }
                ],
                metadata: {
                    package_id: packageData._id.toString(),
                    duration_days: packageData.durationInDays,
                    priority: packageData.priority || 0,
                    platform: 'designrhub',
                    has_discount: useDiscountedPrice,
                    regular_price_cents: regularPriceForMetadata,
                    ...(useDiscountedPrice && discountPriceForMetadata !== null && {
                        discount_price_cents: discountPriceForMetadata,
                        discount_ends_at: packageData.endDiscountDate ? new Date(packageData.endDiscountDate).toISOString() : null
                    })
                }
            };

            console.log("[PolarService] Sending product data to Polar:", JSON.stringify(productData, null, 2));
            const response = await this.client.products.create(productData);
            console.log(`[PolarService] ✅ Polar product created: ${response.id}, Name: ${response.name}`);
            if (response.prices && response.prices.length > 0) {
                console.log(`[PolarService] Polar product price created: ${response.prices[0].price_amount} ${response.prices[0].price_currency}`);
            } else {
                console.warn(`[PolarService] ⚠️ Polar product created WITHOUT prices: ${response.id}`);
            }
            return response;
        } catch (error) {
            console.error("[PolarService] ❌ Error creating Polar product:", error.message);
            if (error.response && error.response.data) {
                console.error("[PolarService] Polar Error Details:", JSON.stringify(error.response.data, null, 2));
            }
            throw new Error(`Failed to create product in Polar: ${error.response?.data?.detail || error.response?.data?.message || error.message}`);
        }
    }

    async updateProduct(productId, packageData) {
        try {
            console.log(`[PolarService] Updating Polar product ID: ${productId} for package: ${packageData.packageName}`);
            const existingProduct = await this.client.products.get(productId);
            if (!existingProduct) {
                throw new Error(`Polar product with ID ${productId} not found for update.`);
            }

            const recurringInterval = packageData.durationInDays <= 60 ? 'month' : 'year';
            const basePriceUSD = parseFloat(packageData.price);
            if (isNaN(basePriceUSD)) throw new Error('Invalid base price for package update.');
            const basePriceInCents = Math.round(basePriceUSD * 100);

            const useDiscountedPrice = packageData.onDiscount &&
                                      packageData.discountPrice != null &&
                                      new Date(packageData.endDiscountDate) > new Date();

            let finalPriceInCents = basePriceInCents;
            let regularPriceForMetadata = basePriceInCents;
            let discountPriceForMetadata = null;

            if (useDiscountedPrice) {
                const discountPriceUSD = parseFloat(packageData.discountPrice);
                if (isNaN(discountPriceUSD)) throw new Error('Invalid discount price for package update.');
                finalPriceInCents = Math.round(discountPriceUSD * 100);
                discountPriceForMetadata = finalPriceInCents;
            }

            const updateData = {
                name: packageData.packageName,
                description: `${packageData.packageName} - ${packageData.durationName}`,
                recurringInterval: recurringInterval, // This might not be updatable directly, or might need new price creation.
                                                      // Polar's API for product updates is limited. Usually prices are managed separately.
                metadata: {
                    ...(existingProduct.metadata || {}), // Preserve existing metadata
                    package_id: packageData._id.toString(),
                    duration_days: packageData.durationInDays,
                    priority: packageData.priority || 0,
                    updated_at: new Date().toISOString(),
                    has_discount: useDiscountedPrice,
                    regular_price_cents: regularPriceForMetadata,
                    ...(useDiscountedPrice && discountPriceForMetadata !== null && {
                        discount_price_cents: discountPriceForMetadata,
                        discount_ends_at: packageData.endDiscountDate ? new Date(packageData.endDiscountDate).toISOString() : null
                    })
                }
            };
            
            console.log(`[PolarService] Sending product update data to Polar (Product ID: ${productId}):`, JSON.stringify(updateData, null, 2));
            const response = await this.client.products.update(productId, updateData);
            console.log(`[PolarService] ✅ Polar product updated: ${response.id}`);

            // Prices in Polar are often immutable or require archiving old ones and creating new ones.
            // For simplicity, if the price amount or currency changes, we might need to create a new price and archive the old one.
            // However, the current Polar SDK might handle this by updating the existing first price.
            // We will attempt to update the first price associated with the product.
            if (existingProduct.prices && existingProduct.prices.length > 0) {
                const priceToUpdate = existingProduct.prices[0];
                 console.log(`[PolarService] Attempting to update price ID: ${priceToUpdate.id} for product ${productId}`);
                await this.client.prices.update(priceToUpdate.id, {
                    price_amount: finalPriceInCents,
                    price_currency: "USD", // Ensure currency is USD
                     metadata: {
                        ...(priceToUpdate.metadata || {}),
                        is_discounted_price: useDiscountedPrice,
                        ...(useDiscountedPrice && {
                            original_price_cents: regularPriceForMetadata,
                            discount_ends_at: packageData.endDiscountDate ? new Date(packageData.endDiscountDate).toISOString() : null
                        })
                    }
                });
                console.log(`[PolarService] ✅ Price ID ${priceToUpdate.id} updated for product ${productId}.`);
            } else {
                console.warn(`[PolarService] ⚠️ No prices found to update for product ${productId}. Creating a new price.`);
                 await this.client.prices.create({
                    type: "one_time",
                    price_amount: finalPriceInCents,
                    price_currency: "USD",
                    product_id: productId,
                     metadata: {
                        is_discounted_price: useDiscountedPrice,
                        ...(useDiscountedPrice && {
                            original_price_cents: regularPriceForMetadata,
                            discount_ends_at: packageData.endDiscountDate ? new Date(packageData.endDiscountDate).toISOString() : null
                        })
                    }
                });
                console.log(`[PolarService] ✅ New price created for product ${productId}.`);
            }
            
            // Re-fetch the product to get the latest state including prices
            return await this.client.products.get(productId);

        } catch (error) {
            console.error("[PolarService] ❌ Error updating Polar product:", error.message);
            if (error.response && error.response.data) {
                console.error("[PolarService] Polar Error Details:", JSON.stringify(error.response.data, null, 2));
            }
            throw new Error(`Failed to update product in Polar: ${error.response?.data?.detail || error.response?.data?.message || error.message}`);
        }
    }

    async archiveProduct(productId) {
        try {
            console.log(`[PolarService] Archiving Polar product ID: ${productId}`);
            const response = await this.client.products.archive(productId);
            console.log(`[PolarService] ✅ Polar product archived: ${productId}`);
            return response;
        } catch (error) {
            console.error("[PolarService] ❌ Error archiving Polar product:", error.message);
            if (error.response && error.response.data) {
                console.error("[PolarService] Polar Error Details:", JSON.stringify(error.response.data, null, 2));
            }
            throw new Error(`Failed to archive product in Polar: ${error.response?.data?.detail || error.response?.data?.message || error.message}`);
        }
    }

    async getProduct(productId) {
        try {
            console.log(`[PolarService] Getting Polar product by ID: ${productId}`);
            return await this.client.products.get(productId);
        } catch (error) {
            console.error("[PolarService] ❌ Error getting Polar product:", error.message);
            if (error.response && error.response.data) {
                console.error("[PolarService] Polar Error Details:", JSON.stringify(error.response.data, null, 2));
            }
            throw new Error(`Failed to get product from Polar: ${error.response?.data?.detail || error.response?.data?.message || error.message}`);
        }
    }

    /**
     * Checkout and Payment Processing
     */
    async createCheckout(checkoutData) {
        try {
            console.log("[PolarService] Creating Polar checkout with data:", checkoutData);
            let customer;
            if (checkoutData.customer_external_id) {
                customer = await this.getCustomerByExternalId(checkoutData.customer_external_id);
                if (!customer) {
                    console.log(`[PolarService] Customer not found by external_id ${checkoutData.customer_external_id}, creating new customer.`);
                    customer = await this.createOrUpdateCustomer({
                        _id: checkoutData.customer_external_id,
                        email: checkoutData.customer_email,
                        username: checkoutData.customer_name
                        // nomor: checkoutData.customer_phone // Jika ada nomor telepon
                    });
                }
            }

            const formattedCheckoutData = {
                customer_id: customer?.id, // Optional: if customer is known
                customer_email: checkoutData.customer_email, // Required if customer_id is not set
                // customer_name: checkoutData.customer_name, // Optional
                success_url: checkoutData.success_url,
                cancel_url: checkoutData.cancel_url || `${process.env.FE_URL}payment/cancelled`, // Default cancel URL
                metadata: checkoutData.metadata || {},
                // Default currency to USD if not provided
                currency: checkoutData.currency || "USD",
            };

            if (checkoutData.product_prices && checkoutData.product_prices.length > 0) {
                formattedCheckoutData.product_prices = checkoutData.product_prices.map(pp => ({
                    product_id: pp.product_id,
                    price_id: pp.price_id
                }));
                 console.log(`[PolarService] Checkout for product_prices: ${JSON.stringify(formattedCheckoutData.product_prices)}`);
            } else if (checkoutData.amount) {
                // Amount should be in cents
                formattedCheckoutData.amount = checkoutData.amount; // Asumsi amount sudah dalam cents
                 console.log(`[PolarService] Checkout for custom amount: ${formattedCheckoutData.amount} ${formattedCheckoutData.currency}`);
            } else {
                throw new Error("Checkout must have either product_prices or an amount.");
            }
            
            // Add discount code if provided
            if (checkoutData.metadata && checkoutData.metadata.voucher_code) {
                formattedCheckoutData.discount_code = checkoutData.metadata.voucher_code;
                console.log(`[PolarService] Applying discount code: ${formattedCheckoutData.discount_code} to checkout.`);
            }


            console.log("[PolarService] Sending checkout data to Polar:", JSON.stringify(formattedCheckoutData, null, 2));
            const response = await this.client.checkouts.create(formattedCheckoutData);
            console.log(`[PolarService] ✅ Polar checkout created: ${response.id}, URL: ${response.url}`);
            return response;
        } catch (error) {
            console.error("[PolarService] ❌ Error creating Polar checkout:", error.message);
            if (error.response && error.response.data) {
                console.error("[PolarService] Polar Error Details:", JSON.stringify(error.response.data, null, 2));
            }
            throw new Error(`Failed to create checkout in Polar: ${error.response?.data?.detail || error.response?.data?.message || error.message}`);
        }
    }

    async getCheckout(checkoutId) {
        try {
            console.log(`[PolarService] Getting Polar checkout by ID: ${checkoutId}`);
            return await this.client.checkouts.get(checkoutId);
        } catch (error) {
            console.error("[PolarService] ❌ Error getting Polar checkout:", error.message);
            if (error.response && error.response.data) {
                console.error("[PolarService] Polar Error Details:", JSON.stringify(error.response.data, null, 2));
            }
            throw new Error(`Failed to get checkout from Polar: ${error.response?.data?.detail || error.response?.data?.message || error.message}`);
        }
    }

    async getOrder(orderId) {
        try {
            console.log(`[PolarService] Getting Polar order by ID: ${orderId}`);
            return await this.client.orders.get(orderId);
        } catch (error) {
            console.error("[PolarService] ❌ Error getting Polar order:", error.message);
            if (error.response && error.response.data) {
                console.error("[PolarService] Polar Error Details:", JSON.stringify(error.response.data, null, 2));
            }
            throw new Error(`Failed to get order from Polar: ${error.response?.data?.detail || error.response?.data?.message || error.message}`);
        }
    }

    /**
     * Voucher (Discount) Management
     */
    async createDiscount(voucherData) {
        try {
            console.log(`[PolarService] Creating Polar discount for voucher: ${voucherData.name} (Code: ${voucherData.code})`);
            let polarDiscountType = voucherData.discountType === 'fixed' ? 'fixed' : 'percentage';
            let polarDiscountValue;

            if (polarDiscountType === 'fixed') {
                // Assume voucherData.discount is in USD, convert to cents for Polar
                const discountUSD = parseFloat(voucherData.discount);
                if (isNaN(discountUSD)) throw new Error('Invalid fixed discount value.');
                polarDiscountValue = Math.round(discountUSD * 100);
            } else { // percentage
                polarDiscountValue = parseFloat(voucherData.discount);
                if (isNaN(polarDiscountValue)) throw new Error('Invalid percentage discount value.');
            }

            const discountPayload = {
                name: voucherData.name,
                code: voucherData.code,
                type: polarDiscountType,
                value: polarDiscountValue, // value is percentage (e.g., 10 for 10%) or fixed amount in cents
                currency: polarDiscountType === 'fixed' ? 'USD' : undefined, // Currency only for fixed type
                start_date: new Date(voucherData.startDate).toISOString().split('T')[0], // YYYY-MM-DD
                end_date: new Date(voucherData.endDate).toISOString().split('T')[0],     // YYYY-MM-DD
                metadata: {
                    voucher_id_internal: voucherData._id.toString(),
                    platform: 'designrhub',
                    status_internal: voucherData.status,
                    // ...(voucherData.usageLimit && { max_redemptions: voucherData.usageLimit }), // Jika Polar mendukung
                    // ...(voucherData.minimumPurchaseAmount && { minimum_amount_cents: Math.round(parseFloat(voucherData.minimumPurchaseAmount) * 100) }) // Jika Polar mendukung
                }
            };

            // Polar's discount might not directly support product restrictions in the same way.
            // This is often handled at the checkout/order level by applying the discount code
            // and letting Polar validate if it applies to the items in the cart.
            // For now, we store package IDs in metadata if needed for internal logic.
            if (voucherData.packageId && voucherData.packageId.length > 0) {
                discountPayload.metadata.restricted_package_ids_internal = voucherData.packageId.map(id => id.toString());
            }

            console.log("[PolarService] Sending discount data to Polar:", JSON.stringify(discountPayload, null, 2));
            const response = await this.client.discounts.create(discountPayload);
            console.log(`[PolarService] ✅ Polar discount created: ${response.id}`);
            return response;
        } catch (error) {
            console.error("[PolarService] ❌ Error creating Polar discount:", error.message);
            if (error.response && error.response.data) {
                console.error("[PolarService] Polar Error Details:", JSON.stringify(error.response.data, null, 2));
            }
            throw new Error(`Failed to create discount in Polar: ${error.response?.data?.detail || error.response?.data?.message || error.message}`);
        }
    }

    async updateDiscount(discountId, voucherData) {
         try {
            console.log(`[PolarService] Updating Polar discount ID: ${discountId} for voucher: ${voucherData.name}`);
            let polarDiscountType = voucherData.discountType === 'fixed' ? 'fixed' : 'percentage';
            let polarDiscountValue;

            if (polarDiscountType === 'fixed') {
                const discountUSD = parseFloat(voucherData.discount);
                if (isNaN(discountUSD)) throw new Error('Invalid fixed discount value for update.');
                polarDiscountValue = Math.round(discountUSD * 100);
            } else {
                polarDiscountValue = parseFloat(voucherData.discount);
                if (isNaN(polarDiscountValue)) throw new Error('Invalid percentage discount value for update.');
            }
            
            // Fetch existing discount to preserve other metadata if necessary
            const existingDiscount = await this.client.discounts.get(discountId);

            const discountPayload = {
                name: voucherData.name,
                code: voucherData.code, // Polar might not allow code updates, or it might create a new one.
                type: polarDiscountType,
                value: polarDiscountValue,
                currency: polarDiscountType === 'fixed' ? 'USD' : undefined,
                start_date: new Date(voucherData.startDate).toISOString().split('T')[0],
                end_date: new Date(voucherData.endDate).toISOString().split('T')[0],
                metadata: {
                    ...(existingDiscount.metadata || {}), // Preserve existing metadata
                    voucher_id_internal: voucherData._id.toString(),
                    status_internal: voucherData.status,
                    updated_at: new Date().toISOString(),
                }
            };
            
            if (voucherData.packageId && voucherData.packageId.length > 0) {
                discountPayload.metadata.restricted_package_ids_internal = voucherData.packageId.map(id => id.toString());
            } else {
                 discountPayload.metadata.restricted_package_ids_internal = []; // Clear if not provided
            }

            console.log(`[PolarService] Sending discount update data to Polar (Discount ID: ${discountId}):`, JSON.stringify(discountPayload, null, 2));
            const response = await this.client.discounts.update(discountId, discountPayload);
            console.log(`[PolarService] ✅ Polar discount updated: ${response.id}`);
            return response;
        } catch (error) {
            console.error("[PolarService] ❌ Error updating Polar discount:", error.message);
            if (error.response && error.response.data) {
                console.error("[PolarService] Polar Error Details:", JSON.stringify(error.response.data, null, 2));
            }
            throw new Error(`Failed to update discount in Polar: ${error.response?.data?.detail || error.response?.data?.message || error.message}`);
        }
    }

    async archiveDiscount(discountId) {
        try {
            console.log(`[PolarService] Archiving Polar discount ID: ${discountId}`);
            const response = await this.client.discounts.archive(discountId);
            console.log(`[PolarService] ✅ Polar discount archived: ${discountId}`);
            return response;
        } catch (error) {
            console.error("[PolarService] ❌ Error archiving Polar discount:", error.message);
            if (error.response && error.response.data) {
                console.error("[PolarService] Polar Error Details:", JSON.stringify(error.response.data, null, 2));
            }
            throw new Error(`Failed to archive discount in Polar: ${error.response?.data?.detail || error.response?.data?.message || error.message}`);
        }
    }


    /**
     * Subscription Management
     */
    async getSubscription(subscriptionId) {
        try {
            console.log(`[PolarService] Getting Polar subscription by ID: ${subscriptionId}`);
            return await this.client.subscriptions.get(subscriptionId);
        } catch (error) {
            console.error("[PolarService] ❌ Error getting Polar subscription:", error.message);
            if (error.response && error.response.data) {
                console.error("[PolarService] Polar Error Details:", JSON.stringify(error.response.data, null, 2));
            }
            throw new Error(`Failed to get subscription from Polar: ${error.response?.data?.detail || error.response?.data?.message || error.message}`);
        }
    }

    async cancelSubscription(subscriptionId) {
        try {
            console.log(`[PolarService] Cancelling Polar subscription ID: ${subscriptionId}`);
            const response = await this.client.subscriptions.cancel(subscriptionId);
            console.log(`[PolarService] ✅ Polar subscription cancelled: ${subscriptionId}`);
            return response;
        } catch (error) {
            console.error("[PolarService] ❌ Error cancelling Polar subscription:", error.message);
            if (error.response && error.response.data) {
                console.error("[PolarService] Polar Error Details:", JSON.stringify(error.response.data, null, 2));
            }
            throw new Error(`Failed to cancel subscription in Polar: ${error.response?.data?.detail || error.response?.data?.message || error.message}`);
        }
    }

    /**
     * Webhook Verification
     */
    verifyWebhookSignature(payload, signature) {
        try {
            if (!process.env.POLAR_WEBHOOK_SECRET) {
                console.warn("[PolarService] ⚠️ POLAR_WEBHOOK_SECRET not set - webhook verification will be skipped for this request (NOT RECOMMENDED FOR PRODUCTION)");
                return true; // Atau false jika ingin lebih ketat bahkan saat secret tidak ada
            }

            const payloadString = typeof payload === 'string' ? payload : JSON.stringify(payload);
            const hmac = crypto.createHmac('sha256', process.env.POLAR_WEBHOOK_SECRET);
            hmac.update(payloadString);
            const computedSignature = hmac.digest('hex');

            if (typeof signature !== 'string' || typeof computedSignature !== 'string') {
                console.warn("[PolarService] Webhook signature or computed signature is not a string.");
                return false;
            }
            
            // crypto.timingSafeEqual requires buffers of the same byte length
            const sigBuffer = Buffer.from(signature, 'utf8');
            const computedSigBuffer = Buffer.from(computedSignature, 'utf8');

            if (sigBuffer.length !== computedSigBuffer.length) {
                console.warn("[PolarService] Webhook signature length mismatch.");
                return false;
            }

            const isValid = crypto.timingSafeEqual(sigBuffer, computedSigBuffer);
            console.log(`[PolarService] Webhook signature verification result: ${isValid}`);
            return isValid;

        } catch (error) {
            console.error("[PolarService] ❌ Webhook signature verification error:", error);
            return false;
        }
    }
}

const polarService = new PolarService();
module.exports = polarService;