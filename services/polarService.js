const { Polar } = require('@polar-sh/sdk');
const crypto = require('crypto');
require('dotenv').config();

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
    }

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
            if (userData.nomor) customerData.metadata.phone = userData.nomor;
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

    async getCustomerByExternalId(externalId) {
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
    }

    async createProduct(packageData) {
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
    }

    async updateProduct(productId, packageData) {
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
        }
    }


    async getCheckout(checkoutId) {
        try {
            console.log(`[PolarService] Getting Polar checkout session by ID: ${checkoutId}`);
            return await this.client.checkouts.get(checkoutId);
        } catch (error) {
            console.error("[PolarService] ❌ Error getting Polar checkout session:", error.message);
            if (error.response && error.response.data) {
                console.error("[PolarService] Polar Error Details:", JSON.stringify(error.response.data, null, 2));
            }
            throw new Error(`Failed to get checkout session from Polar: ${error.response?.data?.detail || error.response?.data?.message || error.message}`);
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
    async createDiscount(voucherData) {
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
    }

    async updateDiscount(discountId, voucherData) {
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
    }


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
            return false;
        }
    }
}

const polarService = new PolarService();
module.exports = polarService;