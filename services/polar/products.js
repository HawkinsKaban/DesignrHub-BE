// services/polar/products.js
const client = require('./client');

// Fungsi helper untuk menentukan interval berulang berdasarkan durasi hari
function determineRecurringInterval(durationInDays) {
    if (durationInDays <= 0) return 'month'; // Default atau error case
    if (durationInDays <= 31) return 'month'; // Untuk paket bulanan atau kurang
    if (durationInDays <= 366) return 'year';  // Untuk paket tahunan atau kurang
    // Untuk durasi custom yang lebih dari setahun, Polar mungkin memerlukan interval 'year'
    // dan Anda menangani logika kelipatan tahun di sisi Anda atau melalui beberapa langganan.
    // Atau, jika Polar mendukung N-month/N-year, gunakan itu. Untuk saat ini, 'year' adalah yang paling dekat.
    return 'year'; 
}

async function createProduct(packageData) {
    try {
        console.log(`[PolarProducts] Attempting to create Polar product for package: ${packageData.packageName} (ID: ${packageData._id})`);
        
        const recurringInterval = determineRecurringInterval(packageData.durationInDays);

        const basePriceUSD = parseFloat(packageData.price);
        if (isNaN(basePriceUSD) || basePriceUSD < 0) {
            throw new Error(`Invalid base price for package: ${packageData.packageName}. Must be a non-negative number.`);
        }
        const basePriceInCents = Math.round(basePriceUSD * 100);

        let finalPriceInCents = basePriceInCents;
        const isCurrentlyDiscounted = packageData.onDiscount &&
                                   packageData.discountPrice != null && // Bisa 0 untuk gratis
                                   parseFloat(packageData.discountPrice) >= 0 &&
                                   (!packageData.endDiscountDate || new Date(packageData.endDiscountDate) > new Date());
        
        let regularPriceForMetadata = basePriceInCents;
        let discountPriceForMetadata = null;

        if (isCurrentlyDiscounted) {
            const discountPriceUSD = parseFloat(packageData.discountPrice);
            if (isNaN(discountPriceUSD) || discountPriceUSD < 0) { // harga diskon bisa 0
                throw new Error(`Invalid discount price for package: ${packageData.packageName}. Must be a non-negative number.`);
            }
            finalPriceInCents = Math.round(discountPriceUSD * 100);
            discountPriceForMetadata = finalPriceInCents;
        }

        // Polar mengharuskan harga > 0 untuk tipe 'recurring', kecuali jika platformnya mendukung harga gratis.
        // Jika finalPriceInCents adalah 0, ini mungkin perlu penanganan khusus atau flag di Polar.
        if (finalPriceInCents === 0 && !(process.env.ALLOW_FREE_PRODUCTS === 'true')) {
             console.warn(`[PolarProducts] Warning: finalPriceInCents for package ${packageData.packageName} is 0. Ensure Polar setup allows free recurring tiers if intended.`);
        }
        // Jika Polar tidak mengizinkan harga 0 untuk recurring, Anda mungkin perlu set harga minimal (misal 1 cent)
        // atau ubah tipe produk/harga jika Polar memiliki cara lain untuk "gratis".
        // Untuk sekarang, kita asumsikan Polar bisa menangani 0 atau harga sangat kecil jika dikonfigurasi.

        const embeddedPriceData = {
            type: "recurring",
            recurring_interval: recurringInterval,
            price_amount: finalPriceInCents, // Harga dalam cents
            price_currency: "USD", // Pastikan konsisten
            // Metadata spesifik untuk harga ini (opsional tapi berguna)
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
            description: `${packageData.packageName} - ${packageData.durationName} access.`, // Deskripsi lebih jelas
            is_recurring: true, // Explisit menandakan produk ini untuk langganan
            // 'recurring_interval' pada level produk mungkin tidak diperlukan jika harga sudah menentukannya.
            // Cek dokumentasi Polar SDK terbaru untuk struktur payload `products.create`.
            // Jika 'recurring_interval' di level produk diperlukan, set: recurringInterval,
            prices: [embeddedPriceData], // Array harga yang di-embed
            // Benefits bisa didefinisikan di sini juga jika diinginkan.
            // benefits: [{ type: "custom", description: `Access to ${packageData.packageName}` }],
            metadata: { // Metadata di level produk
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

        // Validasi bahwa harga yang diharapkan memang terbuat
        const createdPrice = productResponse.prices?.find(p => 
            p.type === "recurring" &&
            p.recurring_interval === recurringInterval &&
            p.price_amount === finalPriceInCents &&
            p.price_currency === "USD" &&
            !p.is_archived // Polar mungkin menggunakan is_archived
        );

        if (!createdPrice) {
            console.error(`[PolarProducts] ⚠️ Failed to find or validate the created price tier for product ${productResponse.id}. Expected ${finalPriceInCents} USD/${recurringInterval}. Prices received:`, productResponse.prices);
            // Anda mungkin ingin mengarsipkan produk yang baru dibuat jika harganya tidak sesuai.
            // await client.products.archive(productResponse.id);
            throw new Error(`Price tier not created or validated as expected in Polar for product ${productResponse.id}.`);
        }
        console.log(`[PolarProducts] ✅ Price tier validated: ID ${createdPrice.id}, Amount: ${createdPrice.price_amount} ${createdPrice.price_currency}`);
        
        return productResponse; // Mengembalikan seluruh objek produk dari Polar
    } catch (error) {
        console.error("[PolarProducts] ❌ Error creating Polar product:", error.message);
        if (error.response && error.response.data) {
            console.error("[PolarProducts] Polar Error Details:", JSON.stringify(error.response.data, null, 2));
        }
        const detail = error.response?.data?.detail;
        const validationErrors = error.response?.data?.validation_errors;
        let errorMessage = detail || error.message;
        if (validationErrors) {
            errorMessage += ` Validation Errors: ${JSON.stringify(validationErrors)}`;
        }
        throw new Error(`Failed to create product in Polar: ${errorMessage}`);
    }
}

async function updateProduct(polarProductId, packageData) {
    try {
        console.log(`[PolarProducts] Updating Polar product ID: ${polarProductId} for package: ${packageData.packageName}`);
        let existingPolarProduct = await client.products.get(polarProductId);
        if (!existingPolarProduct) {
            throw new Error(`Polar product with ID ${polarProductId} not found for update.`);
        }

        const recurringInterval = determineRecurringInterval(packageData.durationInDays);
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
        
        // Payload untuk update product (biasanya nama, deskripsi, metadata)
        const productUpdatePayload = {
            name: packageData.packageName,
            description: `${packageData.packageName} - ${packageData.durationName} access.`,
            // recurring_interval: recurringInterval, // Cek apakah ini bisa diupdate di level produk
            metadata: {
                ...(existingPolarProduct.metadata || {}), // Pertahankan metadata lama jika ada
                package_id_internal: packageData._id.toString(),
                duration_days_internal: packageData.durationInDays,
                priority_internal: packageData.priority || 0,
                updated_at_internal: new Date().toISOString(),
                initial_discount_status_internal: isCurrentlyDiscounted, // Atau status diskon saat ini
                regular_price_cents_internal: regularPriceForMetadata,
                ...(isCurrentlyDiscounted && discountPriceForMetadata !== null ? {
                    discount_price_cents_internal: discountPriceForMetadata,
                    discount_ends_at_internal: packageData.endDiscountDate ? new Date(packageData.endDiscountDate).toISOString() : null
                } : { 
                    // Hapus field ini jika tidak lagi diskon
                    discount_price_cents_internal: undefined, 
                    discount_ends_at_internal: undefined   
                })
            }
        };
        // Hapus kunci metadata yang undefined agar tidak mengirim null atau string kosong jika tidak diinginkan
        Object.keys(productUpdatePayload.metadata).forEach(key => {
            if (productUpdatePayload.metadata[key] === undefined) delete productUpdatePayload.metadata[key];
        });

        console.log(`[PolarProducts] Sending product update data to Polar (Product ID: ${polarProductId}):`, JSON.stringify(productUpdatePayload, null, 2));
        existingPolarProduct = await client.products.update(polarProductId, productUpdatePayload); 
        console.log(`[PolarProducts] ✅ Polar product details (name, metadata, etc.) updated: ${polarProductId}`);

        // Manajemen Harga:
        // 1. Cari harga yang sesuai saat ini di Polar untuk produk ini.
        let currentSuitablePrice = existingPolarProduct.prices?.find(
            p => p.type === "recurring" && 
                 p.recurring_interval === recurringInterval && 
                 !p.is_archived && // Polar menggunakan is_archived
                 p.price_amount === finalPriceInCents &&
                 p.price_currency === "USD"
        );

        if (!currentSuitablePrice) {
            console.log(`[PolarProducts] No existing suitable price found, or price details (amount/interval) changed for product ${polarProductId}. Managing prices...`);
            
            // 2. Arsipkan semua harga recurring yang ada untuk interval ini, karena kita akan buat yang baru.
            if(existingPolarProduct.prices){
                for (const price of existingPolarProduct.prices) {
                    if (price.type === "recurring" && price.recurring_interval === recurringInterval && !price.is_archived) {
                        console.warn(`[PolarProducts] ⚠️ Archiving existing price ${price.id} (Amount: ${price.price_amount} ${price.price_currency}/${price.recurring_interval}) as it needs to be replaced.`);
                        try {
                            await client.prices.archive(price.id);
                            console.log(`[PolarProducts] ✅ Archived old price ${price.id}.`);
                        } catch (archiveError) {
                            console.error(`[PolarProducts] ❌ Failed to archive old price ${price.id}: ${archiveError.message}. Continuing to create new price.`);
                        }
                    }
                }
            }

            // 3. Buat harga baru.
            console.log(`[PolarProducts] Creating new price for product ${polarProductId} (Interval: ${recurringInterval}, Amount: ${finalPriceInCents} cents).`);
            const newPriceData = {
                type: "recurring",
                recurring_interval: recurringInterval,
                price_amount: finalPriceInCents, // Harga dalam cents
                price_currency: "USD",
                product_id: polarProductId, // Penting untuk mengasosiasikan harga dengan produk
                metadata: { // Metadata spesifik harga (jika perlu)
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
                // Ini bisa menjadi error kritis, pertimbangkan dampaknya.
                throw new Error(`Failed to create new price in Polar during product update: ${newPriceError.message}`);
            }
        } else {
            console.log(`[PolarProducts] Existing price ID ${currentSuitablePrice.id} (Amount: ${currentSuitablePrice.price_amount} ${currentSuitablePrice.price_currency}/${currentSuitablePrice.recurring_interval}) is suitable and up-to-date for product ${polarProductId}. No price change needed.`);
        }
        
        // Ambil lagi data produk terbaru dari Polar setelah semua perubahan
        return await client.products.get(polarProductId); 
    } catch (error) {
        console.error(`[PolarProducts] ❌ Error updating Polar product ID ${polarProductId}:`, error.message);
        if (error.response && error.response.data) {
            console.error("[PolarProducts] Polar Error Details:", JSON.stringify(error.response.data, null, 2));
        }
        const detail = error.response?.data?.detail;
        const validationErrors = error.response?.data?.validation_errors;
        let errorMessage = detail || error.message;
        if (validationErrors) {
            errorMessage += ` Validation Errors: ${JSON.stringify(validationErrors)}`;
        }
        throw new Error(`Failed to update product in Polar: ${errorMessage}`);
    }
}

async function archiveProduct(polarProductId) {
    try {
        console.log(`[PolarProducts] Attempting to archive Polar product ID: ${polarProductId}`);
        
        // Opsional: Arsipkan semua harga aktif terkait produk ini terlebih dahulu
        // Meskipun mengarsipkan produk mungkin otomatis mengarsipkan harga, ini lebih eksplisit.
        const product = await client.products.get(polarProductId);
        if (product && product.prices) {
            for (const price of product.prices) {
                if (!price.is_archived) { // Polar menggunakan is_archived
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
            // Jika produk sudah diarsipkan atau tidak ditemukan
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
            return null; // Kembalikan null agar bisa ditangani oleh pemanggil
        }
        throw new Error(`Failed to get product from Polar (ID: ${polarProductId}): ${error.response?.data?.detail || error.message}`);
    }
}

module.exports = {
    createProduct,
    updateProduct,
    archiveProduct,
    getProduct,
    determineRecurringInterval // Ekspor helper jika dibutuhkan di tempat lain
};