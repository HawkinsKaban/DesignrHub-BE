const { Polar } = require('@polar-sh/sdk');
const crypto = require('crypto');
require('dotenv').config();

console.log('Initializing Polar service...');
console.log(`POLAR_ACCESS_TOKEN exists: ${!!process.env.POLAR_ACCESS_TOKEN}`);
console.log(`NODE_ENV: ${process.env.NODE_ENV}`);

class PolarService {
    constructor() {
        try {
            if (!process.env.POLAR_ACCESS_TOKEN) {
                throw new Error('POLAR_ACCESS_TOKEN is not set in environment variables.');
            }
            this.client = new Polar({
                accessToken: process.env.POLAR_ACCESS_TOKEN,
                // Adjust server based on NODE_ENV. Polar SDK might have specific values like 'api.polar.sh' for production
                // and 'api.sandbox.polar.sh' or similar for sandbox.
                // The SDK's 'production' or 'sandbox' string might map to these.
                // Check Polar SDK documentation if direct server URLs are needed.
                server: process.env.NODE_ENV === 'production' ? 'production' : 'sandbox'
            });
            console.log('✅ Polar client initialized successfully for environment:', process.env.NODE_ENV === 'production' ? 'production' : 'sandbox');

        } catch (error) {
            console.error('❌ Failed to initialize Polar client:', error.message);
            // Fallback dummy client for environments where Polar is not critical or for testing
            // This helps prevent the application from crashing if Polar config is missing during development/testing
            this.client = {
                customers: {
                    create: async (data) => { console.warn("Dummy Polar: customers.create called", data); return ({ id: `dummy-customer-${Date.now()}`, email: data.email }); },
                    get: async (id) => { console.warn("Dummy Polar: customers.get called", id); return ({ id }); },
                    list: async (params) => { console.warn("Dummy Polar: customers.list called", params); return ({ items: [], pagination: { total_count: 0, max_page: 1 } }); }
                },
                products: {
                    create: async (data) => {
                        console.warn("Dummy Polar: products.create called", data);
                        // Simulate a price being part of the product response
                        const priceId = `dummy-price-${Date.now()}`;
                        return ({
                            id: `dummy-product-${Date.now()}`,
                            name: data.name,
                            prices: data.prices ? data.prices.map(p => ({ // If prices were sent (though we avoid it now)
                                id: priceId,
                                product_id: `dummy-product-${Date.now()}`,
                                price_amount: p.price_amount,
                                price_currency: p.price_currency,
                                type: p.type,
                                recurring_interval: p.recurring_interval,
                                amountType: p.price_amount > 0 ? 'fixed' : 'free' // Simulate amountType
                            })) : [],
                            // Simulate a product get call for consistency if createProduct is changed to re-fetch
                        });
                    },
                    update: async (id, data) => { console.warn("Dummy Polar: products.update called", id, data); return ({ id, name: data.name }); },
                    get: async (id) => { console.warn("Dummy Polar: products.get called", id); return ({ id, prices: [{id: `dummy-price-for-${id}`, price_amount: 1000, price_currency: 'USD', type: 'recurring', recurring_interval: 'month', amountType: 'fixed'}] }); },
                    archive: async (id) => { console.warn("Dummy Polar: products.archive called", id); return ({ id, isArchived: true }); }
                },
                prices: {
                     create: async (data) => {
                        console.warn("Dummy Polar: prices.create called", data);
                        return ({
                            id: `dummy-price-${Date.now()}`,
                            product_id: data.product_id,
                            price_amount: data.price_amount,
                            price_currency: data.price_currency,
                            type: data.type,
                            recurring_interval: data.recurring_interval,
                            amountType: data.price_amount > 0 ? 'fixed' : 'free'  // Simulate amountType
                        });
                    },
                    update: async (id, data) => { console.warn("Dummy Polar: prices.update called", id, data); return ({ id, price_amount: data.price_amount }); },
                    archive: async (id) => { console.warn("Dummy Polar: prices.archive called", id); return ({ id, isArchived: true }); }
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
            // It's better to return null or let the caller handle if this is a critical failure
            return null;
        }
    }

    async createProduct(packageData) {
        try {
            console.log(`[PolarService] Creating Polar product for package: ${packageData.packageName} (ID: ${packageData._id})`);
            const recurringInterval = packageData.durationInDays <= 31 ? 'month' : (packageData.durationInDays <= 366 ? 'year' : 'month');

            const basePriceUSD = parseFloat(packageData.price);
            if (isNaN(basePriceUSD) || basePriceUSD < 0) {
                throw new Error(`Invalid base price for package: ${packageData.packageName}. Must be a non-negative number.`);
            }
            const basePriceInCents = Math.round(basePriceUSD * 100);

            let finalPriceInCents = basePriceInCents;
            const useDiscountedPrice = packageData.onDiscount &&
                                      packageData.discountPrice != null &&
                                      parseFloat(packageData.discountPrice) >= 0 &&
                                      new Date(packageData.endDiscountDate) > new Date();

            let regularPriceForMetadata = basePriceInCents;
            let discountPriceForMetadata = null;

            if (useDiscountedPrice) {
                const discountPriceUSD = parseFloat(packageData.discountPrice);
                if (isNaN(discountPriceUSD) || discountPriceUSD < 0) {
                    throw new Error(`Invalid discount price for package: ${packageData.packageName}. Must be a non-negative number.`);
                }
                finalPriceInCents = Math.round(discountPriceUSD * 100);
                discountPriceForMetadata = finalPriceInCents;
            }
            
            // Ensure that for a paid product, the final price is greater than 0.
            // Polar might create a "free" tier if price_amount is 0.
            if (finalPriceInCents <= 0) {
                 console.warn(`[PolarService] Warning: finalPriceInCents for package ${packageData.packageName} is ${finalPriceInCents}. This may result in a free tier. If this package is intended to be paid, its price must be > 0.`);
                 // Depending on business logic, you might throw an error here if a paid package results in a zero or negative price.
                 // For example: throw new Error(`Final price for package ${packageData.packageName} must be greater than 0.`);
            }


            // Step 1: Create the product shell WITHOUT prices initially
            const productShellData = {
                name: packageData.packageName,
                description: `${packageData.packageName} - ${packageData.durationName}`,
                recurringInterval: recurringInterval, 
                isRecurring: true, // Explicitly set if the product itself is a recurring subscription type
                // Add benefits if applicable at the product level
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

            console.log("[PolarService] Sending product shell data to Polar:", JSON.stringify(productShellData, null, 2));
            const productResponse = await this.client.products.create(productShellData);
            console.log(`[PolarService] ✅ Polar product shell created: ${productResponse.id}, Name: ${productResponse.name}`);

            // Step 2: Explicitly create the price for the product
            const priceData = {
                type: "recurring", // Price type
                recurring_interval: recurringInterval, // Price recurring interval
                price_amount: finalPriceInCents, // Price amount in cents
                price_currency: "USD", // Price currency
                product_id: productResponse.id, // Link to the created product
                metadata: {
                    is_discounted_price: useDiscountedPrice,
                    ...(useDiscountedPrice && {
                        original_price_cents: regularPriceForMetadata,
                        discount_ends_at: packageData.endDiscountDate ? new Date(packageData.endDiscountDate).toISOString() : null
                    })
                }
            };
            
            console.log("[PolarService] Sending price data to Polar for product " + productResponse.id + ":", JSON.stringify(priceData, null, 2));
            const createdPrice = await this.client.prices.create(priceData);
            console.log(`[PolarService] ✅ Polar price created: ID ${createdPrice.id}, Amount: ${createdPrice.price_amount} ${createdPrice.price_currency}, Type: ${createdPrice.type}, Interval: ${createdPrice.recurring_interval}`);

            // Fetch the product again to get the updated product with its prices
            const updatedProductWithPrice = await this.client.products.get(productResponse.id);

            // Validate the created price within the fetched product
            if (updatedProductWithPrice.prices && updatedProductWithPrice.prices.length > 0) {
                const relevantPrice = updatedProductWithPrice.prices.find(p => p.id === createdPrice.id);
                if (relevantPrice && relevantPrice.price_amount === finalPriceInCents && relevantPrice.type === "recurring") {
                     console.log(`[PolarService] Polar product price confirmed: ID ${relevantPrice.id}, Amount: ${relevantPrice.price_amount} ${relevantPrice.price_currency}, Type: ${relevantPrice.type}`);
                } else {
                    console.error(`[PolarService] ⚠️ Valid paid price tier NOT CONFIRMED after explicit creation for product ${productResponse.id}. Price details found:`, relevantPrice);
                    throw new Error("Failed to create and confirm a valid paid price tier in Polar.");
                }
            } else {
                 console.error(`[PolarService] ⚠️ No prices found for product ${productResponse.id} after explicit price creation and re-fetch.`);
                 throw new Error("No prices found for product after explicit price creation in Polar.");
            }

            return updatedProductWithPrice;

        } catch (error) {
            console.error("[PolarService] ❌ Error creating Polar product and/or price:", error.message);
            if (error.response && error.response.data) {
                console.error("[PolarService] Polar Error Details:", JSON.stringify(error.response.data, null, 2));
            }
            const detail = error.response?.data?.detail;
            const validationErrors = error.response?.data?.validation_errors;
            let errorMessage = detail || error.message;
            if (validationErrors) {
                errorMessage += ` Validation Errors: ${JSON.stringify(validationErrors)}`;
            }
            throw new Error(`Failed to create product/price in Polar: ${errorMessage}`);
        }
    }

    async updateProduct(productId, packageData) {
        try {
            console.log(`[PolarService] Updating Polar product ID: ${productId} for package: ${packageData.packageName}`);
            const existingProduct = await this.client.products.get(productId);
            if (!existingProduct) {
                throw new Error(`Polar product with ID ${productId} not found for update.`);
            }

            const recurringInterval = packageData.durationInDays <= 31 ? 'month' : (packageData.durationInDays <= 366 ? 'year' : 'month');
            const basePriceUSD = parseFloat(packageData.price);
            if (isNaN(basePriceUSD)|| basePriceUSD < 0) throw new Error('Invalid base price for package update.');
            const basePriceInCents = Math.round(basePriceUSD * 100);

            const useDiscountedPrice = packageData.onDiscount &&
                                      packageData.discountPrice != null &&
                                      parseFloat(packageData.discountPrice) >= 0 &&
                                      new Date(packageData.endDiscountDate) > new Date();

            let finalPriceInCents = basePriceInCents;
            let regularPriceForMetadata = basePriceInCents;
            let discountPriceForMetadata = null;

            if (useDiscountedPrice) {
                const discountPriceUSD = parseFloat(packageData.discountPrice);
                if (isNaN(discountPriceUSD) || discountPriceUSD < 0) throw new Error('Invalid discount price for package update.');
                finalPriceInCents = Math.round(discountPriceUSD * 100);
                discountPriceForMetadata = finalPriceInCents;
            }

            if (finalPriceInCents <= 0) {
                 console.warn(`[PolarService] Warning: finalPriceInCents for updating package ${packageData.packageName} is ${finalPriceInCents}.`);
            }

            const updateData = {
                name: packageData.packageName,
                description: `${packageData.packageName} - ${packageData.durationName}`,
                recurringInterval: recurringInterval,
                isRecurring: true, // Ensure this is set
                metadata: {
                    ...(existingProduct.metadata || {}), // Preserve existing metadata not explicitly overwritten
                    package_id: packageData._id.toString(),
                    duration_days: packageData.durationInDays,
                    priority: packageData.priority || 0,
                    updated_at: new Date().toISOString(),
                    has_discount: useDiscountedPrice,
                    regular_price_cents: regularPriceForMetadata,
                    ...(useDiscountedPrice && discountPriceForMetadata !== null ? {
                        discount_price_cents: discountPriceForMetadata,
                        discount_ends_at: packageData.endDiscountDate ? new Date(packageData.endDiscountDate).toISOString() : null
                    } : { // Ensure these are removed or nullified if discount is off
                        discount_price_cents: undefined,
                        discount_ends_at: undefined
                    })
                }
            };
            // Remove undefined keys from metadata to avoid issues with Polar API if it doesn't like nulls for certain fields
            Object.keys(updateData.metadata).forEach(key => updateData.metadata[key] === undefined && delete updateData.metadata[key]);


            console.log(`[PolarService] Sending product update data to Polar (Product ID: ${productId}):`, JSON.stringify(updateData, null, 2));
            const response = await this.client.products.update(productId, updateData);
            console.log(`[PolarService] ✅ Polar product updated: ${response.id}`);

            // Price handling: Archive incompatible/old prices, create/update the current one.
            let currentPriceId = null;
            if (existingProduct.prices && existingProduct.prices.length > 0) {
                for (const price of existingProduct.prices) {
                    if (price.type === "recurring" && price.recurring_interval === recurringInterval && !price.isArchived) {
                        // Found a potentially suitable existing price
                        if (price.price_amount !== finalPriceInCents ||
                            (price.metadata?.is_discounted_price !== useDiscountedPrice) ||
                            (useDiscountedPrice && price.metadata?.original_price_cents !== regularPriceForMetadata)) {
                            // Price details changed, update it
                            console.log(`[PolarService] Attempting to update existing price ID: ${price.id} for product ${productId}`);
                            await this.client.prices.update(price.id, {
                                price_amount: finalPriceInCents,
                                price_currency: "USD",
                                metadata: {
                                    ...(price.metadata || {}),
                                    is_discounted_price: useDiscountedPrice,
                                    ...(useDiscountedPrice && {
                                        original_price_cents: regularPriceForMetadata,
                                        discount_ends_at: packageData.endDiscountDate ? new Date(packageData.endDiscountDate).toISOString() : null
                                    })
                                }
                            });
                            console.log(`[PolarService] ✅ Price ID ${price.id} updated for product ${productId}.`);
                            currentPriceId = price.id;
                        } else {
                            // Price is suitable and up-to-date
                             console.log(`[PolarService] Existing price ID: ${price.id} is suitable and up-to-date for product ${productId}.`);
                            currentPriceId = price.id;
                        }
                        break; // Assuming one primary recurring price per interval
                    } else if (!price.isArchived) {
                        // Price is not suitable (e.g., different interval or type), archive it
                        console.warn(`[PolarService] ⚠️ Existing price ${price.id} type/interval mismatch or not recurring. Archiving.`);
                        try {
                            await this.client.prices.archive(price.id);
                            console.log(`[PolarService] ✅ Archived old/incompatible price ${price.id}.`);
                        } catch (archiveError) {
                            console.error(`[PolarService] ❌ Failed to archive old price ${price.id}:`, archiveError.message);
                        }
                    }
                }
            }
            
            if (!currentPriceId) { // No suitable existing price found or all were archived
                console.log(`[PolarService] Creating new price for product ${productId} as no suitable existing price found or old ones archived.`);
                const newPrice = await this.client.prices.create({
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
                console.log(`[PolarService] ✅ New recurring price created: ID ${newPrice.id} for product ${productId}.`);
            }

            return await this.client.products.get(productId); // Return the updated product

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
            if (error.response && (error.response.status === 404 || (error.response.data?.detail?.toLowerCase().includes('archived')))) {
                console.warn(`[PolarService] Product ${productId} already archived or not found in Polar for archiving.`);
                return { id: productId, isArchived: true, message: "Already archived or not found" };
            }
            throw new Error(`Failed to archive product in Polar: ${error.response?.data?.detail || error.response?.data?.message || error.message}`);
        }
    }

    async getProduct(productId) {
        try {
            console.log(`[PolarService] Getting Polar product by ID: ${productId}`);
            return await this.client.products.get(productId);
        } catch (error) {
            if (error.response && error.response.data) {
                console.error("[PolarService] Polar Error Details for getProduct:", JSON.stringify(error.response.data, null, 2));
            }
            if (error.response && error.response.status === 404) {
                console.warn(`[PolarService] Product ${productId} not found in Polar.`);
                return null; 
            }
            console.error("[PolarService] ❌ Error getting Polar product:", error.message);
            throw new Error(`Failed to get product from Polar: ${error.response?.data?.detail || error.message}`);
        }
    }

    async createCheckout(checkoutData) {
        try {
            // Ensure lineItems exist and have price_id
            if (!checkoutData.lineItems || checkoutData.lineItems.length === 0 || !checkoutData.lineItems[0].price_id) {
                 throw new Error("Checkout creation requires at least one line item with a valid price_id.");
            }
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
                // Polar expects dates in YYYY-MM-DD format for startDate and endDate
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
                    type: "fixed", // Polar specific type for fixed amount discounts
                    amountOff: Math.round(discountUSD * 100), // Amount in cents
                    currency: "USD", // Currency for the fixed amount
                };
            } else { // 'percentage'
                const discountPercentage = parseFloat(voucherData.discount);
                 if (isNaN(discountPercentage) || discountPercentage <=0 || discountPercentage > 100) {
                     throw new Error('Invalid percentage discount value. Must be > 0 and <= 100.');
                }
                discountPayload = {
                    ...discountPayloadBase,
                    type: "percentage", // Polar specific type for percentage discounts
                    basisPoints: Math.round(discountPercentage * 100), // Percentage in basis points (e.g., 10% = 1000 basis points)
                };
            }
            
            // Handle Polar's discount duration
            const polarDuration = voucherData.polarDurationType || 'once'; // Default to 'once' if not specified
            discountPayload.duration = polarDuration; // 'once', 'repeating', 'forever'

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
            if (!existingDiscount) {
                throw new Error(`Polar discount with ID ${discountId} not found for update.`);
            }


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
            } else { // 'percentage'
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
                // Ensure durationInMonths is not sent if duration is not 'repeating'
                // The Polar SDK/API might error if durationInMonths is present for 'once' or 'forever'.
                // Alternatively, Polar might ignore it. To be safe, explicitly undefined or remove.
                discountPayload.durationInMonths = undefined; 
            }
            // Clean undefined payload fields before sending
            Object.keys(discountPayload).forEach(key => discountPayload[key] === undefined && delete discountPayload[key]);


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
             if (error.response && (error.response.status === 404 || (error.response.data?.detail?.toLowerCase().includes('archived')))) {
                console.warn(`[PolarService] Discount ${discountId} already archived or not found in Polar for archiving.`);
                return { id: discountId, isArchived: true, message: "Already archived or not found" };
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

    verifyWebhookSignature(payload, signatureHeader) {
        try {
            const secret = process.env.POLAR_WEBHOOK_SECRET;
            if (!secret) {
                console.warn("[PolarService] ⚠️ POLAR_WEBHOOK_SECRET not set. Webhook signature verification will be skipped. THIS IS NOT RECOMMENDED FOR PRODUCTION.");
                // In a development/testing environment without a secret, you might choose to bypass verification.
                // For production, this should ideally throw an error or always return false if the secret is missing.
                return process.env.NODE_ENV !== 'production'; // Bypass only if not in production
            }

            if (!signatureHeader) {
                console.warn("[PolarService] Webhook signature header ('Polar-Signature') is missing.");
                return false;
            }
            
            const payloadString = typeof payload === 'string' ? payload : JSON.stringify(payload);

            // The Polar-Signature header typically looks like: "t=timestamp,v1=signature"
            const parts = signatureHeader.split(',');
            const signatureMap = {};
            parts.forEach(part => {
                const [key, value] = part.split('=');
                signatureMap[key] = value;
            });

            const timestamp = signatureMap['t'];
            const providedSignature = signatureMap['v1'];

            if (!timestamp || !providedSignature) {
                console.warn("[PolarService] Webhook signature 't' (timestamp) or 'v1' (signature) part missing in header.");
                return false;
            }

            // Optional: Check if timestamp is within a tolerable window to prevent replay attacks
            // const fiveMinutes = 5 * 60 * 1000;
            // if (Date.now() - parseInt(timestamp, 10) * 1000 > fiveMinutes) {
            //     console.warn("[PolarService] Webhook timestamp is too old.");
            //     return false;
            // }

            const signedPayload = `${timestamp}.${payloadString}`;
            const hmac = crypto.createHmac('sha256', secret);
            hmac.update(signedPayload);
            const computedSignature = hmac.digest('hex');
            
            const isValid = crypto.timingSafeEqual(Buffer.from(providedSignature, 'hex'), Buffer.from(computedSignature, 'hex'));
            
            if (!isValid) {
                console.warn(`[PolarService] Webhook signature mismatch. Provided: ${providedSignature}, Computed: ${computedSignature}`);
            } else {
                console.log("[PolarService] ✅ Webhook signature verified successfully.");
            }
            return isValid;

        } catch (error) {
            console.error("[PolarService] ❌ Webhook signature verification error:", error.message);
            return false;
        }
    }
}

const polarService = new PolarService();
module.exports = polarService;