// services/polar/products.js
const client = require('./client');

function determineRecurringInterval(durationInDays) {
    if (durationInDays <= 0) return 'month'; 
    if (durationInDays <= 31) return 'month'; 
    if (durationInDays <= 366) return 'year';  
    return 'year'; 
}

async function createProduct(packageData) {
    try {
        console.log(`[PolarProducts] Attempting to create Polar product for package: ${packageData.packageName} (ID: ${packageData._id})`);
        
        const determinedInterval = determineRecurringInterval(packageData.durationInDays);

        const basePriceUSD = parseFloat(packageData.price);
        if (isNaN(basePriceUSD) || basePriceUSD < 0) {
            throw new Error(`Invalid base price for package: ${packageData.packageName}. Must be a non-negative number.`);
        }
        const basePriceInCents = Math.round(basePriceUSD * 100);

        let finalPriceInCents = basePriceInCents;
        const isCurrentlyDiscounted = packageData.onDiscount &&
                                   packageData.discountPrice != null && 
                                   parseFloat(packageData.discountPrice) >= 0 &&
                                   (!packageData.endDiscountDate || new Date(packageData.endDiscountDate) > new Date());
        
        let regularPriceForMetadata = basePriceInCents;
        let discountPriceForMetadata = null;

        if (isCurrentlyDiscounted) {
            const discountPriceUSD = parseFloat(packageData.discountPrice);
            if (isNaN(discountPriceUSD) || discountPriceUSD < 0) {
                throw new Error(`Invalid discount price for package: ${packageData.packageName}. Must be a non-negative number.`);
            }
            finalPriceInCents = Math.round(discountPriceUSD * 100);
            discountPriceForMetadata = finalPriceInCents;
        }

        if (finalPriceInCents === 0 && !(process.env.ALLOW_FREE_PRODUCTS === 'true')) {
             console.warn(`[PolarProducts] Warning: finalPriceInCents for package ${packageData.packageName} is 0. Ensure Polar setup allows free recurring tiers if intended.`);
        }

        // VVV MODIFIED PRICE EMBEDDING STRUCTURE VVV
        const embeddedPriceData = {
            type: "recurring",
            recurring_interval: determinedInterval, // Polar API likely expects snake_case for this field in price object
            amount: finalPriceInCents,             // Changed from price_amount to amount
            currency: "USD",                 // Changed from price_currency to currency
            metadata: { 
                is_discounted_price_at_creation: isCurrentlyDiscounted,
                ...(isCurrentlyDiscounted && {
                    original_price_cents_at_creation: regularPriceForMetadata,
                    discount_ends_at_internal: packageData.endDiscountDate ? new Date(packageData.endDiscountDate).toISOString() : null
                }),
                package_id_internal: packageData._id.toString(),
            }
        };
        // ^^^ MODIFIED PRICE EMBEDDING STRUCTURE ^^^

        const productPayload = {
            name: packageData.packageName,
            description: `${packageData.packageName} - ${packageData.durationName} access.`,
            is_recurring: true,
            recurringInterval: determinedInterval, // camelCase for the top-level product property based on previous error
            prices: [embeddedPriceData], 
            metadata: { 
                package_id_internal: packageData._id.toString(),
                duration_days_internal: packageData.durationInDays,
                priority_internal: packageData.priority || 0,
                platform_internal: 'designrhub',
                initial_discount_status_internal: isCurrentlyDiscounted,
                regular_price_cents_internal: regularPriceForMetadata,
                ...(isCurrentlyDiscounted && discountPriceForMetadata !== null && {
                    discount_price_cents_internal: discountPriceForMetadata,
                    discount_ends_at_internal: packageData.endDiscountDate ? new Date(packageData.endDiscountDate).toISOString() : null
                })
            }
        };

        console.log("[PolarProducts] Sending product data to Polar (with prices array):", JSON.stringify(productPayload, null, 2)); 
        const productResponse = await client.products.create(productPayload);
        
        if (!productResponse || !productResponse.id) {
            console.error("[PolarProducts] ⚠️ Product creation with Polar did not return a valid product ID.", productResponse);
            throw new Error("Polar product creation failed to return a valid product object or ID.");
        }
        console.log(`[PolarProducts] ✅ Polar product created: ${productResponse.id}, Name: ${productResponse.name}`);

        // VVV ADJUSTED VALIDATION LOGIC VVV
        const createdPrice = productResponse.prices?.find(p => 
            p.type === "recurring" &&
            p.recurringInterval === determinedInterval && // API returns camelCase 'recurringInterval'
            p.amountType !== 'free' &&                  // Ensure it's not free
            p.amount === finalPriceInCents &&           // Check 'amount'
            p.currency?.toLowerCase() === "usd" &&      // Check 'currency' (make it case-insensitive for safety)
            !p.isArchived                               // Check 'isArchived'
        );

        if (!createdPrice) {
            console.error(`[PolarProducts] ⚠️ Failed to find or validate the created price tier for product ${productResponse.id}. Expected ${finalPriceInCents} USD/${determinedInterval}. Prices received:`, productResponse.prices);
            throw new Error(`Price tier not created or validated as expected in Polar for product ${productResponse.id}.`);
        }
        // Use createdPrice.amount and createdPrice.currency for logging, as these are confirmed fields from response
        console.log(`[PolarProducts] ✅ Price tier validated: ID ${createdPrice.id}, Amount: ${createdPrice.amount} ${createdPrice.currency}`);
        // ^^^ ADJUSTED VALIDATION LOGIC ^^^
        
        return productResponse;
    } catch (error) {
        console.error("[PolarProducts] ❌ Error creating Polar product:", error.message);
        let detailedErrorMessage = error.message;
        if (error.response && error.response.data) {
            const polarError = error.response.data;
            console.error("[PolarProducts] Polar Error Details:", JSON.stringify(polarError, null, 2));
            detailedErrorMessage = polarError.detail || JSON.stringify(polarError.validation_errors || polarError);
            if (polarError.validation_errors) {
                const formattedValidationErrors = polarError.validation_errors.map(err => ({ ...err, path: err.path?.join('.') ?? 'unknown_path', message: err.message }));
                detailedErrorMessage += ` Validation Errors: ${JSON.stringify(formattedValidationErrors)}`;
            }
        } else if (error.issues) { 
             detailedErrorMessage = error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`).join('; ');
        }
        throw new Error(`Failed to create product in Polar: ${detailedErrorMessage}`);
    }
}

async function updateProduct(polarProductId, packageData) {
    try {
        console.log(`[PolarProducts] Updating Polar product ID: ${polarProductId} for package: ${packageData.packageName}`);
        let existingPolarProduct = await client.products.get(polarProductId);
        if (!existingPolarProduct) {
            throw new Error(`Polar product with ID ${polarProductId} not found for update.`);
        }

        const determinedInterval = determineRecurringInterval(packageData.durationInDays); 
        const basePriceUSD = parseFloat(packageData.price);
        if (isNaN(basePriceUSD) || basePriceUSD < 0) throw new Error('Invalid base price for package update.');
        const basePriceInCents = Math.round(basePriceUSD * 100);

        const isCurrentlyDiscounted = packageData.onDiscount &&
                                   packageData.discountPrice != null &&
                                   parseFloat(packageData.discountPrice) >= 0 &&
                                   (!packageData.endDiscountDate || new Date(packageData.endDiscountDate) > new Date());
        
        let finalPriceInCents = basePriceInCents;
        let regularPriceForMetadata = basePriceInCents;
        let discountPriceForMetadata = null;

        if (isCurrentlyDiscounted) {
            const discountPriceUSD = parseFloat(packageData.discountPrice);
            if (isNaN(discountPriceUSD) || discountPriceUSD < 0) throw new Error('Invalid discount price for package update.');
            finalPriceInCents = Math.round(discountPriceUSD * 100);
            discountPriceForMetadata = finalPriceInCents;
        }
        
        const productUpdatePayload = {
            name: packageData.packageName,
            description: `${packageData.packageName} - ${packageData.durationName} access.`,
            recurringInterval: determinedInterval, // Assuming top-level can be updated, use camelCase for SDK input
            metadata: {
                ...(existingPolarProduct.metadata || {}), 
                package_id_internal: packageData._id.toString(),
                duration_days_internal: packageData.durationInDays,
                priority_internal: packageData.priority || 0,
                updated_at_internal: new Date().toISOString(),
                initial_discount_status_internal: isCurrentlyDiscounted, 
                regular_price_cents_internal: regularPriceForMetadata,
                ...(isCurrentlyDiscounted && discountPriceForMetadata !== null ? {
                    discount_price_cents_internal: discountPriceForMetadata,
                    discount_ends_at_internal: packageData.endDiscountDate ? new Date(packageData.endDiscountDate).toISOString() : null
                } : { 
                    discount_price_cents_internal: undefined, 
                    discount_ends_at_internal: undefined   
                })
            }
        };
        Object.keys(productUpdatePayload.metadata).forEach(key => {
            if (productUpdatePayload.metadata[key] === undefined) delete productUpdatePayload.metadata[key];
        });

        console.log(`[PolarProducts] Sending product update data to Polar (Product ID: ${polarProductId}):`, JSON.stringify(productUpdatePayload, null, 2));
        existingPolarProduct = await client.products.update(polarProductId, productUpdatePayload); 
        console.log(`[PolarProducts] ✅ Polar product details (name, metadata, etc.) updated: ${polarProductId}`);

        let currentSuitablePrice = existingPolarProduct.prices?.find(
            p => p.type === "recurring" && 
                 p.recurringInterval === determinedInterval && // API returns camelCase
                 !p.isArchived && 
                 p.amountType !== 'free' &&
                 p.amount === finalPriceInCents &&       // Check 'amount'
                 p.currency?.toLowerCase() === "usd"     // Check 'currency'
        );

        if (!currentSuitablePrice) {
            console.log(`[PolarProducts] No existing suitable price found, or price details (amount/interval) changed for product ${polarProductId}. Managing prices...`);
            
            if(existingPolarProduct.prices){
                for (const price of existingPolarProduct.prices) {
                    if (price.type === "recurring" && price.recurringInterval === determinedInterval && !price.isArchived) {
                        console.warn(`[PolarProducts] ⚠️ Archiving existing price ${price.id} (Amount: ${price.amount || 'N/A'} ${price.currency || 'N/A'}/${price.recurringInterval}) as it needs to be replaced.`);
                        try {
                            await client.prices.archive(price.id);
                            console.log(`[PolarProducts] ✅ Archived old price ${price.id}.`);
                        } catch (archiveError) {
                            console.error(`[PolarProducts] ❌ Failed to archive old price ${price.id}: ${archiveError.message}. Continuing to create new price.`);
                        }
                    }
                }
            }

            console.log(`[PolarProducts] Creating new price for product ${polarProductId} (Interval: ${determinedInterval}, Amount: ${finalPriceInCents} cents).`);
            const newPriceData = {
                type: "recurring",
                recurring_interval: determinedInterval, // snake_case for API
                amount: finalPriceInCents,             // amount for API
                currency: "USD",                 // currency for API
                product_id: polarProductId, 
                metadata: { 
                    is_discounted_price_at_creation: isCurrentlyDiscounted,
                     ...(isCurrentlyDiscounted && {
                        original_price_cents_at_creation: regularPriceForMetadata,
                        discount_ends_at_internal: packageData.endDiscountDate ? new Date(packageData.endDiscountDate).toISOString() : null
                    }),
                    package_id_internal: packageData._id.toString(),
                }
            };
            try {
                const newPrice = await client.prices.create(newPriceData);
                console.log(`[PolarProducts] ✅ New recurring price created: ID ${newPrice.id} for product ${polarProductId}.`);
            } catch (newPriceError) {
                console.error(`[PolarProducts] ❌ Failed to create new price for product ${polarProductId} during update: ${newPriceError.message}`);
                throw new Error(`Failed to create new price in Polar during product update: ${newPriceError.message}`);
            }
        } else {
            console.log(`[PolarProducts] Existing price ID ${currentSuitablePrice.id} (Amount: ${currentSuitablePrice.amount} ${currentSuitablePrice.currency}/${currentSuitablePrice.recurringInterval}) is suitable and up-to-date for product ${polarProductId}. No price change needed.`);
        }
        
        return await client.products.get(polarProductId); 
    } catch (error) {
        console.error(`[PolarProducts] ❌ Error updating Polar product ID ${polarProductId}:`, error.message);
        let detailedErrorMessage = error.message;
        if (error.response && error.response.data) {
            const polarError = error.response.data;
            console.error("[PolarProducts] Polar Error Details:", JSON.stringify(polarError, null, 2));
            detailedErrorMessage = polarError.detail || JSON.stringify(polarError.validation_errors || polarError);
            if (polarError.validation_errors) {
                const formattedValidationErrors = polarError.validation_errors.map(err => ({ ...err, path: err.path?.join('.') ?? 'unknown_path', message: err.message }));
                detailedErrorMessage += ` Validation Errors: ${JSON.stringify(formattedValidationErrors)}`;
            }
        }
        throw new Error(`Failed to update product in Polar: ${detailedErrorMessage}`);
    }
}

async function archiveProduct(polarProductId) {
    try {
        console.log(`[PolarProducts] Attempting to archive Polar product ID: ${polarProductId}`);
        
        const product = await client.products.get(polarProductId);
        if (product && product.prices) {
            for (const price of product.prices) {
                if (!price.is_archived) { 
                    try {
                        await client.prices.archive(price.id);
                        console.log(`[PolarProducts] ✅ Archived price ${price.id} for product ${polarProductId}.`);
                    } catch(priceArchiveError) {
                         console.warn(`[PolarProducts] ⚠️ Could not archive price ${price.id} for product ${polarProductId}: ${priceArchiveError.message}. Product archival will proceed.`);
                    }
                }
            }
        }

        const response = await client.products.archive(polarProductId);
        console.log(`[PolarProducts] ✅ Polar product successfully archived: ${polarProductId}`);
        return response;
    } catch (error) {
        console.error(`[PolarProducts] ❌ Error archiving Polar product ${polarProductId}:`, error.message);
        if (error.response && error.response.data) {
            const errorDetail = error.response.data.detail || JSON.stringify(error.response.data);
             console.error("[PolarProducts] Polar Error Details:", errorDetail);
            if (error.response.status === 404 || (typeof errorDetail === 'string' && errorDetail.toLowerCase().includes('not found')) || (typeof errorDetail === 'string' && errorDetail.toLowerCase().includes('archived'))) {
                console.warn(`[PolarProducts] Product ${polarProductId} already archived or not found in Polar for archiving.`);
                return { id: polarProductId, is_archived: true, message: "Already archived or not found" };
            }
        }
        throw new Error(`Failed to archive product in Polar: ${error.response?.data?.detail || error.message}`);
    }
}

async function getProduct(polarProductId) {
    try {
        console.log(`[PolarProducts] Getting Polar product by ID: ${polarProductId}`);
        const product = await client.products.get(polarProductId);
        console.log(`[PolarProducts] ✅ Successfully retrieved Polar product ID: ${polarProductId}`);
        return product;
    } catch (error) {
        console.error(`[PolarProducts] ❌ Error getting Polar product (ID: ${polarProductId}):`, error.message);
        if (error.response && error.response.data) {
            console.error("[PolarProducts] Polar Error Details:", JSON.stringify(error.response.data, null, 2));
        }
        if (error.response && error.response.status === 404) {
            console.warn(`[PolarProducts] Product ${polarProductId} not found in Polar.`);
            return null; 
        }
        throw new Error(`Failed to get product from Polar (ID: ${polarProductId}): ${error.response?.data?.detail || error.message}`);
    }
}

module.exports = {
    createProduct,
    updateProduct,
    archiveProduct,
    getProduct,
    determineRecurringInterval 
};