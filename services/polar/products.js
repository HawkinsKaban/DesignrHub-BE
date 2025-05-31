// services/polar/products.js
const client = require('./client');
require('dotenv').config(); 

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
             console.warn(`[PolarProducts] Warning: finalPriceInCents for package ${packageData.packageName} is 0. This might still result in a free tier if Polar handles 0 amount as free.`);
        }

        // STRUKTUR HARGA DISEMATKAN - BERDASARKAN STRATEGI ALTERNATIF YANG BERHASIL DARI SCRIPT TES ANDA
        const embeddedPriceData = {
            amountType: "fixed",                 // Eksplisit "fixed"
            type: "recurring",                    // Eksplisit "recurring"
            recurringInterval: determinedInterval,  // Eksplisit interval harga (camelCase)
            priceAmount: finalPriceInCents,       // camelCase, dalam sen
            priceCurrency: "usd",                 // camelCase, lowercase 'usd'
            metadata: { 
                is_discounted_price_at_creation: isCurrentlyDiscounted,
                ...(isCurrentlyDiscounted && {
                    original_price_cents_at_creation: regularPriceForMetadata,
                    discount_ends_at_internal: packageData.endDiscountDate ? new Date(packageData.endDiscountDate).toISOString() : null
                }),
                package_id_internal: packageData._id.toString(),
            }
        };

        const productPayload = {
            name: packageData.packageName,
            description: `${packageData.packageName} - ${packageData.durationName} access.`,
            isRecurring: true, 
            recurringInterval: determinedInterval, // Interval utama produk (camelCase)
            prices: [embeddedPriceData],          
            // organizationId: DIHAPUS karena token sudah scoped ke organisasi
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

        console.log("[PolarProducts] Sending product data to Polar (using successful structure):", JSON.stringify(productPayload, null, 2)); 
        const productResponse = await client.products.create(productPayload);
        
        if (!productResponse || !productResponse.id) {
            console.error("[PolarProducts] ⚠️ Product creation with Polar did not return a valid product ID.", productResponse);
            throw new Error("Polar product creation failed to return a valid product object or ID.");
        }
        console.log(`[PolarProducts] ✅ Polar product created: ${productResponse.id}, Name: ${productResponse.name}`);
        console.log("[PolarProducts] Full Product Response from Polar:", JSON.stringify(productResponse, null, 2));

        // Validasi harga yang dibuat di Polar berdasarkan respons yang Anda log dari skrip tes yang berhasil
        const createdPrice = productResponse.prices?.find(p => 
            p.amountType === 'fixed' &&                
            p.priceAmount === finalPriceInCents &&           
            p.priceCurrency?.toLowerCase() === "usd" &&      
            p.type === "recurring" &&
            p.recurringInterval === determinedInterval &&      
            !p.isArchived                                 
        );

        if (!createdPrice) {
            console.error(`[PolarProducts] ⚠️ Failed to find or validate the created PAID price tier for product ${productResponse.id}. Expected ${finalPriceInCents} USD/${determinedInterval} with amountType 'fixed'. Prices received:`, JSON.stringify(productResponse.prices, null, 2));
            
            // Aktifkan kembali logika arsip jika diinginkan setelah masalah utama teratasi
            // try {
            //     await client.products.update(productResponse.id, { is_archived: true });
            //     console.log(`[PolarProducts] Cleaned up (archived) Polar product ${productResponse.id} due to price validation failure.`);
            // } catch (cleanupError) { 
            //     console.error(`[PolarProducts] ⚠️ Failed to cleanup (archive) Polar product ${productResponse.id} after price validation failure: ${cleanupError.message}`);
            // }
            throw new Error(`Price tier not created or validated as expected in Polar for product ${productResponse.id}.`);
        }
        console.log(`[PolarProducts] ✅ Price tier validated: ID ${createdPrice.id}, Amount: ${createdPrice.priceAmount} ${createdPrice.priceCurrency}, AmountType: ${createdPrice.amountType}, Type: ${createdPrice.type}, Interval: ${createdPrice.recurringInterval}`);
        
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
            isRecurring: true,
            recurringInterval: determinedInterval, 
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

        // Validasi harga yang ada atau buat yang baru
        let currentSuitablePrice = existingPolarProduct.prices?.find(
            p => p.amountType === 'fixed' && 
                 p.type === "recurring" &&
                 p.recurringInterval === determinedInterval && 
                 !p.isArchived &&                           
                 p.priceAmount === finalPriceInCents && // Gunakan priceAmount dari respons       
                 p.priceCurrency?.toLowerCase() === "usd" // Gunakan priceCurrency dari respons     
        );

        if (!currentSuitablePrice) {
            console.log(`[PolarProducts] No existing suitable paid price found, or price details changed for product ${polarProductId}. Managing prices...`);
            
            if(existingPolarProduct.prices){
                for (const price of existingPolarProduct.prices) {
                    if (price.type === "recurring" && price.recurringInterval === determinedInterval && !price.isArchived) {
                        console.warn(`[PolarProducts] ⚠️ Archiving existing price ${price.id} (Amount: ${price.priceAmount || price.amount || 'N/A'} ${price.priceCurrency || price.currency || 'N/A'}/${price.recurringInterval}) as it needs to be replaced.`);
                        try {
                             await client.prices.update(price.id, { is_archived: true }); 
                            console.log(`[PolarProducts] ✅ Archived old price ${price.id}.`);
                        } catch (archiveError) {
                            console.error(`[PolarProducts] ❌ Failed to archive old price ${price.id}: ${archiveError.message}. Continuing to create new price.`);
                        }
                    }
                }
            }

            console.log(`[PolarProducts] Creating new price for product ${polarProductId} (Interval: ${determinedInterval}, Amount: ${finalPriceInCents} cents).`);
            // Gunakan struktur yang sama dengan embeddedPriceData yang berhasil
            const newPricePayload = {
                amountType: "fixed",
                type: "recurring",
                recurringInterval: determinedInterval,
                priceAmount: finalPriceInCents,          
                priceCurrency: "usd",                                 
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
                const newPrice = await client.prices.create(newPricePayload);
                console.log(`[PolarProducts] ✅ New recurring price created: ID ${newPrice.id} for product ${polarProductId}.`);
            } catch (newPriceError) {
                console.error(`[PolarProducts] ❌ Failed to create new price for product ${polarProductId} during update: ${newPriceError.message}`);
                throw new Error(`Failed to create new price in Polar during product update: ${newPriceError.message}`);
            }
        } else {
            console.log(`[PolarProducts] Existing price ID ${currentSuitablePrice.id} (Amount: ${currentSuitablePrice.priceAmount} ${currentSuitablePrice.priceCurrency}/${currentSuitablePrice.recurringInterval}) is suitable and up-to-date for product ${polarProductId}. No price change needed.`);
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
        const response = await client.products.update(polarProductId, { is_archived: true }); 
        console.log(`[PolarProducts] ✅ Polar product successfully archived (via update): ${polarProductId}`);
        return response;
    } catch (error) {
        console.error(`[PolarProducts] ❌ Error archiving Polar product ${polarProductId}:`, error.message);
        let detailedErrorMessage = `Failed to archive product in Polar (ID: ${polarProductId}): ${error.message}`;
        if (error.response && error.response.data) {
            const polarError = error.response.data;
            console.error("[PolarProducts] Polar Error Details for archive:", JSON.stringify(polarError, null, 2));
            const specificDetail = polarError.detail || JSON.stringify(polarError.validation_errors || polarError);
            detailedErrorMessage = `Failed to archive product in Polar (ID: ${polarProductId}): ${specificDetail}`;
            
            if (error.response.status === 404) {
                console.warn(`[PolarProducts] Product ${polarProductId} not found in Polar for archiving.`);
                return { id: polarProductId, is_archived: true, message: "Not found, assumed archived or never existed" };
            } else if (typeof specificDetail === 'string' && specificDetail.toLowerCase().includes('archived')) {
                 console.warn(`[PolarProducts] Product ${polarProductId} already archived in Polar.`);
                return { id: polarProductId, is_archived: true, message: "Already archived" };
            }
        }
        if (error.message && error.message.includes("Expected object, received string") && 
            error.response && error.response.data && error.response.data.path && error.response.data.path.length === 0) {
             console.error("[PolarProducts] Archival failed likely due to SDK expecting a different payload structure for `products.update` when archiving. The payload `{ is_archived: true }` might be too minimal or incorrectly structured for the SDK version.");
             detailedErrorMessage = `Failed to archive product ${polarProductId} due to SDK payload expectation for update/archive.`;
        }
        throw new Error(detailedErrorMessage);
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