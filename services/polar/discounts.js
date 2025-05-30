// services/polar/discounts.js
const client = require('./client');

function mapVoucherToPolarDiscountPayload(voucherData, existingPolarDiscount = null) {
    const payload = {
        name: voucherData.name,
        code: voucherData.code,
        // Polar mengharapkan tanggal dalam format YYYY-MM-DD untuk startDate dan endDate
        start_date: voucherData.startDate ? new Date(voucherData.startDate).toISOString().split('T')[0] : undefined,
        end_date: voucherData.endDate ? new Date(voucherData.endDate).toISOString().split('T')[0] : undefined,
        usage_limit: voucherData.usageLimit != null ? parseInt(voucherData.usageLimit) : null,
        // minimum_purchase_amount tidak ada di Polar Discount, ini dikelola di sisi Anda atau saat checkout
        metadata: {
            ...(existingPolarDiscount?.metadata || {}), // Pertahankan metadata lama jika ada
            voucher_id_internal: voucherData._id.toString(),
            platform_internal: 'designrhub',
            status_internal: voucherData.status,
            discount_type_internal: voucherData.discountType,
            discount_value_internal: voucherData.discount,
            minimum_purchase_amount_internal: voucherData.minimumPurchaseAmount || 0,
            package_ids_internal: voucherData.packageId?.map(id => id.toString()) || [],
            times_used_internal: voucherData.timesUsed || 0,
            updated_at_internal: new Date().toISOString()
        }
    };

    // Hapus field undefined dari payload utama
    Object.keys(payload).forEach(key => payload[key] === undefined && delete payload[key]);
     // Hapus field undefined dari metadata
    Object.keys(payload.metadata).forEach(key => payload.metadata[key] === undefined && delete payload.metadata[key]);


    if (voucherData.discountType === 'fixed') {
        const discountUSD = parseFloat(voucherData.discount);
        if (isNaN(discountUSD) || discountUSD <= 0) {
            throw new Error('Invalid fixed discount value for Polar. Must be a positive number.');
        }
        payload.type = "fixed";
        payload.amount_off = Math.round(discountUSD * 100); // Amount in cents
        payload.currency = "USD"; // Asumsi USD
    } else if (voucherData.discountType === 'percentage') {
        const discountPercentage = parseFloat(voucherData.discount);
        if (isNaN(discountPercentage) || discountPercentage <= 0 || discountPercentage > 100) {
            throw new Error('Invalid percentage discount value for Polar. Must be > 0 and <= 100.');
        }
        payload.type = "percentage";
        // Polar menggunakan basis_points (1% = 100 basis_points)
        payload.basis_points = Math.round(discountPercentage * 100); 
    } else {
        throw new Error(`Unsupported discount type for Polar: ${voucherData.discountType}`);
    }

    // Durasi diskon (once, forever, repeating)
    payload.duration = voucherData.polarDurationType || 'once'; // Default 'once'
    if (payload.duration === 'repeating') {
        if (!voucherData.polarDurationInMonths || parseInt(voucherData.polarDurationInMonths, 10) <= 0) {
            throw new Error("For 'repeating' duration, 'polarDurationInMonths' is required and must be a positive integer for Polar.");
        }
        payload.duration_in_months = parseInt(voucherData.polarDurationInMonths, 10);
    } else {
        // Hapus duration_in_months jika duration bukan 'repeating'
        delete payload.duration_in_months;
    }
    
    // Scope ke produk tertentu (jika packageId diisi)
    // Polar SDK mungkin mengharapkan `applies_to_products` dengan array ID produk Polar.
    // Ini perlu pemetaan dari packageId lokal ke polar_product_id.
    // Untuk saat ini, ini belum diimplementasikan secara detail di sini,
    // karena diskon Polar mungkin berlaku global atau membutuhkan logika apply saat checkout.
    // Jika Polar Discounts bisa di-scope ke product ID saat pembuatan/update, tambahkan di sini.
    // payload.applies_to_products = voucherData.polar_product_ids_for_discount || [];

    return payload;
}


async function createDiscount(voucherData) {
    try {
        console.log(`[PolarDiscounts] Creating Polar discount for voucher: ${voucherData.name} (Code: ${voucherData.code})`);
        const discountPayload = mapVoucherToPolarDiscountPayload(voucherData);
        
        console.log("[PolarDiscounts] Sending discount data to Polar:", JSON.stringify(discountPayload, null, 2));
        const response = await client.discounts.create(discountPayload);
        console.log(`[PolarDiscounts] ✅ Polar discount created: ${response.id}`);
        return response;
    } catch (error) {
        console.error("[PolarDiscounts] ❌ Error creating Polar discount:", error.message);
        if (error.response && error.response.data) {
            console.error("[PolarDiscounts] Polar Error Details:", JSON.stringify(error.response.data, null, 2));
            const validationErrors = error.response.data.validation_errors;
            if (validationErrors) console.error("[PolarDiscounts] Validation Errors:", JSON.stringify(validationErrors, null, 2));
        }
        throw new Error(`Failed to create discount in Polar: ${error.response?.data?.detail || error.response?.data?.message || error.message}`);
    }
}

async function updateDiscount(polarDiscountId, voucherData) {
     try {
        console.log(`[PolarDiscounts] Updating Polar discount ID: ${polarDiscountId} for voucher: ${voucherData.name}`);
        const existingPolarDiscount = await client.discounts.get(polarDiscountId);
        if (!existingPolarDiscount) {
            throw new Error(`Polar discount with ID ${polarDiscountId} not found for update.`);
        }
        
        const payloadToUpdate = mapVoucherToPolarDiscountPayload(voucherData, existingPolarDiscount);
        // Beberapa field mungkin tidak bisa diupdate setelah pembuatan (misal type atau code).
        // Filter payload hanya untuk field yang diizinkan untuk diupdate oleh Polar SDK.
        // Contoh: hapus 'type', 'code' jika tidak bisa diubah.
        // delete payloadToUpdate.type; 
        // delete payloadToUpdate.code; // Kode biasanya tidak bisa diubah

        console.log(`[PolarDiscounts] Sending discount update data to Polar (Discount ID: ${polarDiscountId}):`, JSON.stringify(payloadToUpdate, null, 2));
        const response = await client.discounts.update(polarDiscountId, payloadToUpdate);
        console.log(`[PolarDiscounts] ✅ Polar discount updated: ${response.id}`);
        return response;
    } catch (error) {
        console.error(`[PolarDiscounts] ❌ Error updating Polar discount ID ${polarDiscountId}:`, error.message);
        if (error.response && error.response.data) {
            console.error("[PolarDiscounts] Polar Error Details:", JSON.stringify(error.response.data, null, 2));
            const validationErrors = error.response.data.validation_errors;
            if (validationErrors) console.error("[PolarDiscounts] Validation Errors:", JSON.stringify(validationErrors, null, 2));
        }
        throw new Error(`Failed to update discount in Polar: ${error.response?.data?.detail || error.response?.data?.message || error.message}`);
    }
}

async function archiveDiscount(polarDiscountId) {
    try {
        console.log(`[PolarDiscounts] Archiving Polar discount ID: ${polarDiscountId}`);
        const response = await client.discounts.archive(polarDiscountId);
        console.log(`[PolarDiscounts] ✅ Polar discount archived: ${polarDiscountId}`);
        return response;
    } catch (error) {
        console.error(`[PolarDiscounts] ❌ Error archiving Polar discount ${polarDiscountId}:`, error.message);
        if (error.response && error.response.data) {
            const errorDetail = error.response.data.detail || JSON.stringify(error.response.data);
             console.error("[PolarDiscounts] Polar Error Details:", errorDetail);
            if (error.response.status === 404 || (typeof errorDetail === 'string' && errorDetail.toLowerCase().includes('not found')) || (typeof errorDetail === 'string' && errorDetail.toLowerCase().includes('archived'))) {
                console.warn(`[PolarDiscounts] Discount ${polarDiscountId} already archived or not found in Polar.`);
                return { id: polarDiscountId, is_archived: true, message: "Already archived or not found" };
            }
        }
        throw new Error(`Failed to archive discount in Polar: ${error.response?.data?.detail || error.message}`);
    }
}

module.exports = {
    createDiscount,
    updateDiscount,
    archiveDiscount
};