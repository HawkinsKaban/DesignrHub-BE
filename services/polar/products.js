const client = require('./client');

async function createProduct(packageData) {
    try {
        console.log(`[PolarProducts] Attempting to create Polar product (with embedded price) for package: ${packageData.packageName} (ID: ${packageData._id})`);
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

        if (finalPriceInCents < 0 && !(process.env.ALLOW_FREE_PRODUCTS === 'true')) {
             console.warn(`[PolarProducts] Warning: finalPriceInCents for package ${packageData.packageName} is ${finalPriceInCents}. This might result in a free tier if not handled correctly by Polar when prices are embedded.`);
        }

        const embeddedPriceData = {
            type: "recurring",
            recurring_interval: recurringInterval,
            price_amount: finalPriceInCents,
            price_currency: "USD",
            metadata: {
                is_discounted_price: useDiscountedPrice,
                ...(useDiscountedPrice && {
                    original_price_cents: regularPriceForMetadata,
                    discount_ends_at: packageData.endDiscountDate ? new Date(packageData.endDiscountDate).toISOString() : null
                })
            }
        };

        const productPayload = {
            name: packageData.packageName,
            description: `${packageData.packageName} - ${packageData.durationName}`,
            recurringInterval: recurringInterval, 
            isRecurring: true,
            prices: [embeddedPriceData],
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

        console.log("[PolarProducts] Sending product data (with prices array) to Polar:", JSON.stringify(productPayload, null, 2));
        const productResponse = await client.products.create(productPayload);
        
        console.log("[PolarProducts] Raw response from products.create (with embedded price):", JSON.stringify(productResponse, null, 2));
        
        if (!productResponse || !productResponse.id) {
            console.error("[PolarProducts] ⚠️ Product creation with Polar did not return a valid response or ID.", productResponse);
            throw new Error("Polar product creation failed to return a valid product object or ID.");
        }
        console.log(`[PolarProducts] ✅ Polar product created: ${productResponse.id}, Name: ${productResponse.name}`);

        if (productResponse.prices && productResponse.prices.length > 0) {
            const relevantPrice = productResponse.prices.find(
                p => p.type === "recurring" &&
                     p.recurring_interval === recurringInterval &&
                     !p.isArchived &&
                     ((typeof p.price_amount === 'number' && p.price_amount === finalPriceInCents) || 
                      (p.amountType && p.amountType !== 'free' && typeof p.price_amount === 'number' && p.price_amount > 0))
            );

            console.log("[PolarProducts] Product's relevant price for validation (from products.create response):", JSON.stringify(relevantPrice, null, 2));

            if (relevantPrice && relevantPrice.amountType !== 'free' && typeof relevantPrice.price_amount === 'number' && relevantPrice.price_amount === finalPriceInCents) {
                 console.log(`[PolarProducts] Polar product price confirmed: ID ${relevantPrice.id}, Amount: ${relevantPrice.price_amount} ${relevantPrice.price_currency}, Type: ${relevantPrice.type}, AmountType: ${relevantPrice.amountType}`);
            } else if (relevantPrice && relevantPrice.amountType === 'free') {
                console.error(`[PolarProducts] ⚠️ Price tier embedded but created as 'free'. Product: ${productResponse.id}. Price details:`, relevantPrice);
                throw new Error(`Failed to create a PAID price tier in Polar (embedded). Price was created as 'free'. Product ID: ${productResponse.id}`);
            } else if (relevantPrice) { 
                console.error(`[PolarProducts] ⚠️ Price tier embedded but amount/type mismatch or not confirmed as paid. Expected amount ${finalPriceInCents}, got ${relevantPrice.price_amount}. AmountType: ${relevantPrice.amountType}. Product: ${productResponse.id}. Price:`, relevantPrice);
                throw new Error(`Embedded price tier amount/type mismatch or not confirmed as paid. Expected amount ${finalPriceInCents}, got ${relevantPrice.price_amount}. Product ID: ${productResponse.id}`);
            } else { 
                console.error(`[PolarProducts] ⚠️ No suitable recurring price tier found in product response after creation. Product ID: ${productResponse.id}. All prices in response:`, productResponse.prices);
                throw new Error(`No suitable recurring price tier confirmed in product response after creation for product ${productResponse.id}.`);
            }
        } else {
             console.error(`[PolarProducts] ⚠️ No prices array found in product response. Product ID: ${productResponse.id}.`);
             throw new Error(`No prices array found for product after creation (Product ID: ${productResponse.id}).`);
        }
        return productResponse; 
    } catch (error) {
        console.error("[PolarProducts] ❌ Error creating Polar product with embedded price:", error.message);
        if (error.response && error.response.data) {
            console.error("[PolarProducts] Polar Error Details:", JSON.stringify(error.response.data, null, 2));
        }
        const detail = error.response?.data?.detail;
        const validationErrors = error.response?.data?.validation_errors;
        let errorMessage = detail || error.message;
        if (validationErrors) {
            errorMessage += ` Validation Errors: ${JSON.stringify(validationErrors)}`;
        }
        throw new Error(`Failed to create product with embedded price in Polar: ${errorMessage}`);
    }
}

async function updateProduct(productId, packageData) {
    try {
        console.log(`[PolarProducts] Updating Polar product ID: ${productId} for package: ${packageData.packageName}`);
        let existingProduct = await client.products.get(productId);
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

        if (finalPriceInCents <= 0 && !(process.env.ALLOW_FREE_PRODUCTS === 'true')) {
             console.warn(`[PolarProducts] Warning: finalPriceInCents for updating package ${packageData.packageName} is ${finalPriceInCents}.`);
        }
        
        const productUpdatePayload = {
            name: packageData.packageName,
            description: `${packageData.packageName} - ${packageData.durationName}`,
            metadata: {
                ...(existingProduct.metadata || {}), 
                package_id: packageData._id.toString(),
                duration_days: packageData.durationInDays,
                priority: packageData.priority || 0,
                updated_at: new Date().toISOString(),
                has_discount: useDiscountedPrice,
                regular_price_cents: regularPriceForMetadata,
                ...(useDiscountedPrice && discountPriceForMetadata !== null ? {
                    discount_price_cents: discountPriceForMetadata,
                    discount_ends_at: packageData.endDiscountDate ? new Date(packageData.endDiscountDate).toISOString() : null
                } : { 
                    discount_price_cents: undefined, 
                    discount_ends_at: undefined   
                })
            }
        };
         Object.keys(productUpdatePayload.metadata).forEach(key => {
            if (productUpdatePayload.metadata[key] === undefined) delete productUpdatePayload.metadata[key];
        });

        console.log(`[PolarProducts] Sending product update data (metadata/name) to Polar (Product ID: ${productId}):`, JSON.stringify(productUpdatePayload, null, 2));
        existingProduct = await client.products.update(productId, productUpdatePayload); 
        console.log(`[PolarProducts] ✅ Polar product (metadata/name/description) updated: ${productId}`);

        let existingSuitablePrice = existingProduct.prices?.find(
            p => p.type === "recurring" && 
                 p.recurring_interval === recurringInterval && 
                 !p.isArchived &&
                 p.price_amount === finalPriceInCents
        );

        if (!existingSuitablePrice) {
            console.log(`[PolarProducts] No existing suitable price found, or price details changed. Managing prices for product ${productId}.`);
            if(existingProduct.prices){
                for (const price of existingProduct.prices) {
                    if (!price.isArchived && price.type === "recurring" && price.recurring_interval === recurringInterval) {
                         console.warn(`[PolarProducts] ⚠️ Archiving existing price ${price.id} for interval ${recurringInterval} as it needs to be replaced.`);
                        try {
                            await client.prices.archive(price.id);
                            console.log(`[PolarProducts] ✅ Archived price ${price.id}.`);
                        } catch (archiveError) {
                            console.error(`[PolarProducts] ❌ Failed to archive price ${price.id}: ${archiveError.message}.`);
                        }
                    }
                }
            }
            console.log(`[PolarProducts] Creating new price for product ${productId} (interval: ${recurringInterval}, amount: ${finalPriceInCents}).`);
            const newPriceData = {
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
            };
            try {
                const newPrice = await client.prices.create(newPriceData);
                console.log(`[PolarProducts] ✅ New recurring price created: ID ${newPrice.id} for product ${productId}.`);
            } catch (newPriceError) {
                console.error(`[PolarProducts] ❌ Failed to create new price for product ${productId} during update: ${newPriceError.message}`);
                throw new Error(`Failed to create new price in Polar during product update: ${newPriceError.message}`);
            }
        } else {
            console.log(`[PolarProducts] Existing price ID ${existingSuitablePrice.id} is suitable and up-to-date.`);
        }
        
        return await client.products.get(productId); 
    } catch (error) {
        console.error("[PolarProducts] ❌ Error updating Polar product:", error.message);
        if (error.response && error.response.data) {
            console.error("[PolarProducts] Polar Error Details:", JSON.stringify(error.response.data, null, 2));
        }
        throw new Error(`Failed to update product in Polar: ${error.response?.data?.detail || error.response?.data?.message || error.message}`);
    }
}

async function archiveProduct(productId) {
    try {
        console.log(`[PolarProducts] Archiving Polar product ID: ${productId}`);
        const product = await client.products.get(productId);
        if (product && product.prices) {
            for (const price of product.prices) {
                if (!price.isArchived) {
                    try {
                        await client.prices.archive(price.id);
                        console.log(`[PolarProducts] ✅ Archived price ${price.id} for product ${productId} before product archival.`);
                    } catch(priceArchiveError) {
                         console.warn(`[PolarProducts] ⚠️ Could not archive price ${price.id} for product ${productId}: ${priceArchiveError.message}`);
                    }
                }
            }
        }
        const response = await client.products.archive(productId);
        console.log(`[PolarProducts] ✅ Polar product archived: ${productId}`);
        return response;
    } catch (error) {
        console.error(`[PolarProducts] ❌ Error archiving Polar product ${productId}:`, error.message);
        // ... (sisa error handling sama)
        if (error.response && (error.response.status === 404 || (error.response.data?.detail?.toLowerCase().includes('archived')))) {
            console.warn(`[PolarProducts] Product ${productId} already archived or not found in Polar for archiving.`);
            return { id: productId, isArchived: true, message: "Already archived or not found" };
        }
        throw new Error(`Failed to archive product in Polar: ${error.response?.data?.detail || error.response?.data?.message || error.message}`);
    }
}

async function getProduct(productId) {
    try {
        console.log(`[PolarProducts] Getting Polar product by ID: ${productId}`);
        return await client.products.get(productId);
    } catch (error) {
        console.error(`[PolarProducts] ❌ Error getting Polar product (ID: ${productId}):`, error.message);
        // ... (sisa error handling sama)
        if (error.response && error.response.data) {
            const polarErrorDetail = error.response.data.detail || JSON.stringify(error.response.data);
            console.error("[PolarProducts] Polar Error Details for getProduct:", polarErrorDetail);
             if (typeof polarErrorDetail === 'string' && polarErrorDetail.includes("Expected object, received string")) {
                 console.error(`[PolarProducts] SDK input validation error for products.get with ID: ${productId}. Detail: ${polarErrorDetail}`);
                 throw new Error(`Polar SDK validation error for products.get (ID: ${productId}): ${polarErrorDetail}`);
            }
        }
        if (error.response && error.response.status === 404) {
            console.warn(`[PolarProducts] Product ${productId} not found in Polar.`);
            return null; 
        }
        throw new Error(`Failed to get product from Polar (ID: ${productId}): ${error.response?.data?.detail || error.message}`);
    }
}

module.exports = {
    createProduct,
    updateProduct,
    archiveProduct,
    getProduct
};