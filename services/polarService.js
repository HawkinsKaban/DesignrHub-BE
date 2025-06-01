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
<<<<<<< Updated upstream
        console.log("PolarService class instantiated. Using modules from ./polar/ sub-directory.");
=======
        try {
            this.client = new Polar({
                accessToken: process.env.POLAR_ACCESS_TOKEN,
                server: process.env.NODE_ENV === 'production' ? 'production' : 'sandbox'
            });
            console.log('✅ Polar client initialized successfully for environment:', process.env.NODE_ENV === 'production' ? 'production' : 'sandbox');

        } catch (error) {
            console.error('❌ Failed to initialize Polar client:', error);
            // Dummy client for fallback or testing if initialization fails
            this.client = {
                customers: {
                    create: async (data) => { console.warn("Dummy Polar: customers.create called", data); return ({ id: `dummy-customer-${Date.now()}` }); },
                    get: async (id) => { console.warn("Dummy Polar: customers.get called", id); return ({ id }); },
                    list: async (params) => { console.warn("Dummy Polar: customers.list called", params); return ({ items: [], pagination: { total_count: 0, max_page: 1 } }); }
                },
                products: {
                    create: async (data) => { console.warn("Dummy Polar: products.create called", data); return ({ id: `dummy-product-${Date.now()}`, prices: [{ id: `dummy-price-${Date.now()}`, price_amount: data.prices[0]?.price_amount, price_currency: data.prices[0]?.price_currency, type: data.prices[0]?.type, recurring_interval: data.prices[0]?.recurring_interval }] }); },
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
>>>>>>> Stashed changes
    }

    // Customers
    async createOrUpdateCustomer(userData) {
        return customersAPI.createOrUpdateCustomer(userData);
    }
    async getCustomerByExternalId(externalId) {
<<<<<<< Updated upstream
        return customersAPI.getCustomerByExternalId(externalId);
=======
        try {
            console.log(`[PolarService] Getting Polar customer by external ID: ${externalId}`);
            const customers = await this.client.customers.list({ external_id: externalId });
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
            return null;
        }
>>>>>>> Stashed changes
    }

    // Products
    async createProduct(packageData) {
<<<<<<< Updated upstream
        return productsAPI.createProduct(packageData);
=======
        try {
            console.log(`[PolarService] Creating Polar product for package: ${packageData.packageName} (ID: ${packageData._id})`);
            const recurringInterval = packageData.durationInDays <= 31 ? 'month' : (packageData.durationInDays <= 366 ? 'year' : 'month'); // Simplified logic

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
                recurringInterval: recurringInterval, // Product is recurring
                prices: [
                    {
                        type: "recurring", // Price is also recurring
                        recurring_interval: recurringInterval, // Price's interval matches product's
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
                console.log(`[PolarService] Polar product price created: ID ${response.prices[0].id}, Amount: ${response.prices[0].price_amount} ${response.prices[0].price_currency}, Type: ${response.prices[0].type}, Interval: ${response.prices[0].recurring_interval}`);
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
>>>>>>> Stashed changes
    }
    async updateProduct(productId, packageData) {
<<<<<<< Updated upstream
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
=======
        try {
            console.log(`[PolarService] Updating Polar product ID: ${productId} for package: ${packageData.packageName}`);
            const existingProduct = await this.client.products.get(productId);
            if (!existingProduct) {
                throw new Error(`Polar product with ID ${productId} not found for update.`);
            }

            const recurringInterval = packageData.durationInDays <= 31 ? 'month' : (packageData.durationInDays <= 366 ? 'year' : 'month'); // Simplified logic
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
                recurringInterval: recurringInterval, // Update product's recurring interval
                metadata: {
                    ...(existingProduct.metadata || {}),
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

            // Handle price update or creation
            // It's generally better to archive old prices and create new ones if the core attributes (like type/interval) change.
            // For simplicity, if a price exists, we update its amount. If not, we create a new one.
            // Polar might not allow changing an existing price's type or interval.
            
            let priceUpdatedOrCreated = false;
            if (existingProduct.prices && existingProduct.prices.length > 0) {
                const priceToUpdate = existingProduct.prices[0]; // Assuming one primary price
                // Check if the existing price is compatible (recurring and same interval)
                if (priceToUpdate.type === "recurring" && priceToUpdate.recurring_interval === recurringInterval) {
                    console.log(`[PolarService] Attempting to update existing price ID: ${priceToUpdate.id} for product ${productId}`);
                    await this.client.prices.update(priceToUpdate.id, {
                        price_amount: finalPriceInCents,
                        price_currency: "USD", // Assuming USD
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
                    priceUpdatedOrCreated = true;
                } else {
                    console.warn(`[PolarService] ⚠️ Existing price ${priceToUpdate.id} type/interval mismatch. Archiving and creating a new one.`);
                    try {
                        await this.client.prices.archive(priceToUpdate.id);
                        console.log(`[PolarService] ✅ Archived old price ${priceToUpdate.id}.`);
                    } catch (archiveError) {
                        console.error(`[PolarService] ❌ Failed to archive old price ${priceToUpdate.id}:`, archiveError.message);
                    }
                }
            }
            
            if (!priceUpdatedOrCreated) {
                console.log(`[PolarService] Creating new price for product ${productId} as no suitable existing price found or old one archived.`);
                await this.client.prices.create({
                    type: "recurring",
                    recurring_interval: recurringInterval,
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
                console.log(`[PolarService] ✅ New recurring price created for product ${productId}.`);
            }

            return await this.client.products.get(productId); // Return the updated product with potentially new/updated price

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
            console.error(`[PolarService] ❌ Error archiving Polar product ${productId}:`, error.message);
            if (error.response && error.response.data) {
                console.error("[PolarService] Polar Error Details:", JSON.stringify(error.response.data, null, 2));
            }
            if (error.response && (error.response.status === 404 || (error.response.data && error.response.data.detail && error.response.data.detail.toLowerCase().includes('archived')))) {
                console.warn(`[PolarService] Product ${productId} already archived or not found in Polar for archiving.`);
                return { id: productId, archived: true, message: "Already archived or not found" };
            }
            throw new Error(`Failed to archive product in Polar: ${error.response?.data?.detail || error.response?.data?.message || error.message}`);
        }
    }


    async getProduct(productId) {
        try {
            console.log(`[PolarService] Getting Polar product by ID: ${productId}`);
            // The Polar SDK's get method might not require a body.
            // If it does and you're passing a string where an object is expected by the SDK's internal fetch/validation,
            // that could be an issue. However, typically, a GET request with an ID in the path doesn't have a body.
            // Assuming the SDK handles this correctly.
            return await this.client.products.get(productId);
        } catch (error) {
            console.error("[PolarService] ❌ Error getting Polar product:", error.message);
            if (error.response && error.response.data) {
                console.error("[PolarService] Polar Error Details for getProduct:", JSON.stringify(error.response.data, null, 2));
                // The error "Expected object, received string" might be how the SDK surfaces a 404 or malformed JSON from Polar.
            }
             // Don't rethrow if it's a "not found" type of error from Polar (often a 404 status or specific detail message)
            if (error.response && error.response.status === 404) {
                console.warn(`[PolarService] Product ${productId} not found in Polar.`);
                return null; // Explicitly return null for "not found"
            }
            throw new Error(`Failed to get product from Polar: ${error.response?.data?.detail || error.response?.data?.message || error.message}`);
        }
    }


    async createCheckout(checkoutData) {
        try {
            console.log("[PolarService] Creating Polar checkout session with data:", JSON.stringify(checkoutData, null, 2));
            const response = await this.client.checkouts.create(checkoutData);
            console.log(`[PolarService] ✅ Polar checkout session created: ${response.id}, URL: ${response.url}`);
            return response;
        } catch (error) {
            console.error("[PolarService] ❌ Error creating Polar checkout session:", error.message);
            if (error.response && error.response.data) {
                console.error("[PolarService] Polar Error Details:", JSON.stringify(error.response.data, null, 2));
            }
            throw new Error(`Failed to create checkout session in Polar: ${error.response?.data?.detail || error.response?.data?.message || error.message}`);
>>>>>>> Stashed changes
        }
        return checkoutsAPI.createCheckout(checkoutData);
    }
<<<<<<< Updated upstream
=======


>>>>>>> Stashed changes
    async getCheckout(checkoutId) {
        return checkoutsAPI.getCheckout(checkoutId);
    }

    // Orders
    async getOrder(orderId) {
        return ordersAPI.getOrder(orderId);
    }

    // Discounts
    async createDiscount(voucherData) {
<<<<<<< Updated upstream
        return discountsAPI.createDiscount(voucherData);
=======
        try {
            console.log(`[PolarService] Creating Polar discount for voucher: ${voucherData.name} (Code: ${voucherData.code})`);

            const discountPayloadBase = {
                name: voucherData.name,
                code: voucherData.code,
                startDate: new Date(voucherData.startDate).toISOString().split('T')[0], 
                endDate: new Date(voucherData.endDate).toISOString().split('T')[0],     
                metadata: {
                    voucher_id_internal: voucherData._id.toString(),
                    platform: 'designrhub',
                    status_internal: voucherData.status,
                }
            };

            let discountPayload;

            if (voucherData.discountType === 'fixed') {
                const discountUSD = parseFloat(voucherData.discount);
                if (isNaN(discountUSD) || discountUSD <= 0) { 
                    throw new Error('Invalid fixed discount value. Must be a positive number.');
                }
                discountPayload = {
                    ...discountPayloadBase,
                    type: "fixed",
                    amountOff: Math.round(discountUSD * 100), 
                    currency: "USD",
                };
            } else { 
                const discountPercentage = parseFloat(voucherData.discount);
                 if (isNaN(discountPercentage) || discountPercentage <=0 || discountPercentage > 100) {
                     throw new Error('Invalid percentage discount value. Must be > 0 and <= 100.');
                }
                discountPayload = {
                    ...discountPayloadBase,
                    type: "percentage",
                    basisPoints: Math.round(discountPercentage * 100), 
                };
            }

            const polarDuration = voucherData.polarDurationType || 'once';
            discountPayload.duration = polarDuration;

            if (polarDuration === 'repeating') {
                if (!voucherData.polarDurationInMonths || parseInt(voucherData.polarDurationInMonths, 10) <= 0) {
                    throw new Error("For 'repeating' duration, 'polarDurationInMonths' is required and must be a positive integer.");
                }
                discountPayload.durationInMonths = parseInt(voucherData.polarDurationInMonths, 10);
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
            const errorMessage = error.response?.data?.detail || error.response?.data?.message || error.message;
            if (error.response?.data?.validation_errors) {
                 console.error("[PolarService] Validation Errors:", JSON.stringify(error.response.data.validation_errors, null, 2));
            }
            throw new Error(`Failed to create discount in Polar: ${errorMessage}`);
        }
>>>>>>> Stashed changes
    }
    async updateDiscount(discountId, voucherData) {
<<<<<<< Updated upstream
        return discountsAPI.updateDiscount(discountId, voucherData);
    }
    async archiveDiscount(discountId) {
        return discountsAPI.archiveDiscount(discountId);
=======
         try {
            console.log(`[PolarService] Updating Polar discount ID: ${discountId} for voucher: ${voucherData.name}`);

            const existingDiscount = await this.client.discounts.get(discountId);

            const discountPayloadBase = {
                name: voucherData.name,
                code: voucherData.code,
                startDate: new Date(voucherData.startDate).toISOString().split('T')[0],
                endDate: new Date(voucherData.endDate).toISOString().split('T')[0],
                metadata: {
                    ...(existingDiscount.metadata || {}),
                    voucher_id_internal: voucherData._id.toString(),
                    status_internal: voucherData.status,
                    updated_at: new Date().toISOString(),
                }
            };

            let discountPayload;

            if (voucherData.discountType === 'fixed') {
                const discountUSD = parseFloat(voucherData.discount);
                if (isNaN(discountUSD) || discountUSD <= 0) {
                     throw new Error('Invalid fixed discount value for update. Must be a positive number.');
                }
                discountPayload = {
                    ...discountPayloadBase,
                    type: "fixed",
                    amountOff: Math.round(discountUSD * 100),
                    currency: "USD",
                };
            } else { 
                const discountPercentage = parseFloat(voucherData.discount);
                 if (isNaN(discountPercentage) || discountPercentage <=0 || discountPercentage > 100) {
                     throw new Error('Invalid percentage discount value for update. Must be > 0 and <= 100.');
                }
                discountPayload = {
                    ...discountPayloadBase,
                    type: "percentage",
                    basisPoints: Math.round(discountPercentage * 100),
                };
            }

            const polarDuration = voucherData.polarDurationType || existingDiscount.duration || 'once';
            discountPayload.duration = polarDuration;

            if (polarDuration === 'repeating') {
                const durationInMonths = voucherData.polarDurationInMonths || existingDiscount.durationInMonths;
                if (!durationInMonths || parseInt(durationInMonths, 10) <= 0) {
                    throw new Error("For 'repeating' duration, 'durationInMonths' is required and must be a positive integer.");
                }
                discountPayload.durationInMonths = parseInt(durationInMonths, 10);
            } else {
                delete discountPayload.durationInMonths;
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
             const errorMessage = error.response?.data?.detail || error.response?.data?.message || error.message;
            if (error.response?.data?.validation_errors) {
                 console.error("[PolarService] Validation Errors:", JSON.stringify(error.response.data.validation_errors, null, 2));
            }
            throw new Error(`Failed to update discount in Polar: ${errorMessage}`);
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
>>>>>>> Stashed changes
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

<<<<<<< Updated upstream
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
=======
    verifyWebhookSignature(payload, signature) {
        try {
            if (!process.env.POLAR_WEBHOOK_SECRET) {
                console.warn("[PolarService] ⚠️ POLAR_WEBHOOK_SECRET not set - webhook verification will be skipped for this request (NOT RECOMMENDED FOR PRODUCTION)");
                return true;
            }

            const payloadString = typeof payload === 'string' ? payload : JSON.stringify(payload);
            const hmac = crypto.createHmac('sha256', process.env.POLAR_WEBHOOK_SECRET);
            hmac.update(payloadString);
            const computedSignature = hmac.digest('hex');

            if (typeof signature !== 'string' || typeof computedSignature !== 'string') {
                console.warn("[PolarService] Webhook signature or computed signature is not a string.");
                return false;
            }

            const parts = signature.split(',');
            let sigValue;
            for (const part of parts) {
                const [key, value] = part.split('=');
                if (key === 'v1') sigValue = value;
            }

            if (!sigValue) {
                console.warn("[PolarService] Webhook signature value (v1) not found in header.");
                return false;
            }

            const sigBuffer = Buffer.from(sigValue, 'utf8'); // Polar hex encodes the signature
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
>>>>>>> Stashed changes
            return false;
        }
    }
}

const polarServiceInstance = new PolarService();
module.exports = polarServiceInstance;