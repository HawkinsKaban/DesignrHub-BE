// services/polar/discounts.js
const client = require('./client');
const PackageModel = require('../../models/packageModel'); 
require('dotenv').config();

/**
 * Memetakan data voucher lokal ke payload yang diharapkan oleh Polar.sh untuk membuat atau memperbarui diskon.
 */
async function mapVoucherToPolarDiscountPayload(voucherData, existingPolarDiscount = null) {
    const metadataPayload = {
        ...(existingPolarDiscount?.metadata || {}), 
        voucher_id_internal: voucherData._id.toString(),
        platform_internal: 'designrhub',
        status_internal: voucherData.status,
        discount_type_internal: voucherData.discountType,
        discount_value_internal: voucherData.discount,
        minimum_purchase_amount_internal: voucherData.minimumPurchaseAmount || 0,
        times_used_internal: voucherData.timesUsed || 0,
        updated_at_internal: new Date().toISOString()
    };

    let polarProductIdsForRestriction = [];
    if (voucherData.packageId && voucherData.packageId.length > 0) {
        metadataPayload.package_ids_internal = voucherData.packageId.map(id => id.toString()).join(',');
        
        const packages = await PackageModel.find({ 
            '_id': { $in: voucherData.packageId } 
        }).select('polar_product_id packageName').lean();

        packages.forEach(pkg => {
            if (pkg.polar_product_id) {
                polarProductIdsForRestriction.push(pkg.polar_product_id);
            } else {
                console.warn(`[PolarDiscounts] Warning: Package '${pkg.packageName}' (ID: ${pkg._id}) for voucher '${voucherData.name}' lacks a Polar Product ID. It won't be in Polar's product restrictions.`);
            }
        });
    }

    Object.keys(metadataPayload).forEach(key => {
        if (metadataPayload[key] === undefined || metadataPayload[key] === null) {
            delete metadataPayload[key];
        }
    });

    const payload = {
        name: voucherData.name,
        code: voucherData.code, 
        // ** KOREKSI TIPE DATA TANGGAL: Gunakan objek Date JavaScript **
        startsAt: voucherData.startDate ? new Date(voucherData.startDate) : undefined,     // Objek Date
        endsAt: voucherData.endDate ? new Date(voucherData.endDate) : undefined,         // Objek Date
        maxRedemptions: voucherData.usageLimit != null ? parseInt(voucherData.usageLimit) : undefined, 
        metadata: metadataPayload
    };

    if (polarProductIdsForRestriction.length > 0) {
        payload.products = polarProductIdsForRestriction; 
    }

    if (voucherData.discountType === 'fixed') {
        const discountUSD = parseFloat(voucherData.discount);
        if (isNaN(discountUSD) || discountUSD <= 0) {
            throw new Error('Invalid fixed discount value for Polar. Must be a positive number.');
        }
        payload.type = "fixed";
        payload.amount = Math.round(discountUSD * 100); 
        payload.currency = "usd"; 
    } else if (voucherData.discountType === 'percentage') {
        const discountPercentage = parseFloat(voucherData.discount);
        if (isNaN(discountPercentage) || discountPercentage <= 0 || discountPercentage > 100) {
            throw new Error('Invalid percentage discount value for Polar. Must be > 0 and <= 100.');
        }
        payload.type = "percentage";
        payload.basisPoints = Math.round(discountPercentage * 100);
    } else {
        throw new Error(`Unsupported discount type for Polar: ${voucherData.discountType}`);
    }

    payload.duration = voucherData.polarDurationType || 'once'; 
    if (payload.duration === 'repeating') {
        if (!voucherData.polarDurationInMonths || parseInt(voucherData.polarDurationInMonths, 10) <= 0) {
            throw new Error("For 'repeating' duration, 'polarDurationInMonths' is required and must be a positive integer for Polar.");
        }
        payload.duration_in_months = parseInt(voucherData.polarDurationInMonths, 10);
    } else {
        delete payload.duration_in_months; 
    }
    
    Object.keys(payload).forEach(key => payload[key] === undefined && delete payload[key]);
    
    return payload;
}

// ... (Fungsi createDiscount, updateDiscount, deleteDiscount tetap sama seperti di Step 34) ...
// Fungsi-fungsi tersebut akan menggunakan mapVoucherToPolarDiscountPayload yang sudah dikoreksi.
// Untuk kelengkapan, berikut seluruh file lagi:

async function createDiscount(voucherData) {
    try {
        console.log(`[PolarDiscounts] Creating Polar discount for voucher: ${voucherData.name} (Code: ${voucherData.code})`);
        const discountPayload = await mapVoucherToPolarDiscountPayload(voucherData); 
        
        console.log("[PolarDiscounts] Sending discount data to Polar:", JSON.stringify(discountPayload, null, 2));
        // Saat JSON.stringify(discountPayload) dieksekusi, objek Date akan otomatis dikonversi ke format string ISO 8601.
        // Namun, SDK Polar (Zod) mengharapkan objek Date asli sebelum serialisasi internalnya.
        const response = await client.discounts.create(discountPayload); 
        console.log(`[PolarDiscounts] ✅ Polar discount created: ${response.id}, Name: ${response.name}`);
        
        console.log(`   Response StartsAt: ${response.startsAt}, EndsAt: ${response.endsAt}, MaxRedemptions: ${response.maxRedemptions}`);
        if (response.products) console.log(`   Response Product Restrictions: ${JSON.stringify(response.products)}`);

        return response;
    } catch (error) {
        console.error("[PolarDiscounts] ❌ Error creating Polar discount:", error.message);
        let errorMessage = error.message;
        if (error.response && error.response.data) {
            console.error("[PolarDiscounts] Polar Error Details:", JSON.stringify(error.response.data, null, 2));
            const detail = error.response.data.detail;
            const validationErrors = error.response.data.validation_errors;
             if (detail) {
                if (Array.isArray(detail)) { 
                     errorMessage = detail.map(d => `${d.loc ? d.loc.join('.') : 'unknown_loc'} - ${d.msg}`).join('; ');
                } else if (typeof detail === 'string') {
                    errorMessage = detail;
                } else {
                    errorMessage = JSON.stringify(detail);
                }
            }
            if (validationErrors && (!detail || (Array.isArray(detail) && detail.length === 0))) {
                 if (Array.isArray(validationErrors)) {
                    errorMessage = validationErrors.map(err => `${err.path?.join('.') ?? err.loc?.join('.') ?? 'unknown_path'}: ${err.message ?? err.msg}`).join('; ');
                } else {
                    errorMessage = JSON.stringify(validationErrors);
                }
            }
        } else if (error.issues) { 
            errorMessage = error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`).join('; ');
        }
        throw new Error(`Failed to create discount in Polar: ${errorMessage}`);
    }
}

async function updateDiscount(polarDiscountId, voucherData) {
     try {
        console.log(`[PolarDiscounts] Updating Polar discount ID: ${polarDiscountId} for voucher: ${voucherData.name}`);
        const existingPolarDiscount = await client.discounts.get({ id: polarDiscountId });
        if (!existingPolarDiscount) {
            throw new Error(`Polar discount with ID ${polarDiscountId} not found for update.`);
        }
        
        const payloadToUpdate = await mapVoucherToPolarDiscountPayload(voucherData, existingPolarDiscount);
        
        const updatablePayload = {
            name: payloadToUpdate.name,
            startsAt: payloadToUpdate.startsAt, // Kirim sebagai objek Date
            endsAt: payloadToUpdate.endsAt,     // Kirim sebagai objek Date
            maxRedemptions: payloadToUpdate.maxRedemptions,
            products: payloadToUpdate.products, 
            metadata: payloadToUpdate.metadata,
            ...(payloadToUpdate.type === 'fixed' && payloadToUpdate.amount !== undefined && { amount: payloadToUpdate.amount }),
            ...(payloadToUpdate.type === 'percentage' && payloadToUpdate.basisPoints !== undefined && { basisPoints: payloadToUpdate.basisPoints }),
            ...(payloadToUpdate.duration && { duration: payloadToUpdate.duration }),
            ...(payloadToUpdate.duration === 'repeating' && payloadToUpdate.duration_in_months && { duration_in_months: payloadToUpdate.duration_in_months }),
        };
        if (payloadToUpdate.duration !== 'repeating') {
            updatablePayload.duration_in_months = null; 
        }
        if (!updatablePayload.products || updatablePayload.products.length === 0) {
            delete updatablePayload.products;
        }
        
        Object.keys(updatablePayload).forEach(key => updatablePayload[key] === undefined && delete updatablePayload[key]);
        if (updatablePayload.metadata) {
             Object.keys(updatablePayload.metadata).forEach(key => {
                if (updatablePayload.metadata[key] === undefined || updatablePayload.metadata[key] === null) {
                    delete updatablePayload.metadata[key];
                }
            });
        }
        
        console.log(`[PolarDiscounts] Sending discount update data to Polar (Discount ID: ${polarDiscountId}):`, JSON.stringify(updatablePayload, null, 2));
        const response = await client.discounts.update({ 
            id: polarDiscountId, 
            discountUpdate: updatablePayload 
        }); 
        console.log(`[PolarDiscounts] ✅ Polar discount updated: ${response.id}`);
        return response;
    } catch (error) {
        console.error(`[PolarDiscounts] ❌ Error updating Polar discount ID ${polarDiscountId}:`, error.message);
        let errorMessage = error.message;
        if (error.response && error.response.data) {
            console.error("[PolarDiscounts] Polar Error Details:", JSON.stringify(error.response.data, null, 2));
            const detail = error.response.data.detail;
            const validationErrors = error.response.data.validation_errors;
            if (detail) {
                if (Array.isArray(detail)) {
                     errorMessage = detail.map(d => `${d.loc.join('.')} - ${d.msg}`).join('; ');
                } else if (typeof detail === 'string') {
                    errorMessage = detail;
                } else {
                    errorMessage = JSON.stringify(detail);
                }
            }
            if (validationErrors && (!detail || (Array.isArray(detail) && detail.length === 0))) {
                 if (Array.isArray(validationErrors)) {
                    errorMessage = validationErrors.map(err => `${err.path?.join('.') ?? err.loc?.join('.') ?? 'unknown_path'}: ${err.message ?? err.msg}`).join('; ');
                } else {
                    errorMessage = JSON.stringify(validationErrors);
                }
            }
        } else if (error.issues) {
            errorMessage = error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`).join('; ');
        }
        throw new Error(`Failed to update discount in Polar: ${errorMessage}`);
    }
}

async function deleteDiscount(polarDiscountId) {
    try {
        console.log(`[PolarDiscounts] Deleting Polar discount ID: ${polarDiscountId}`);
        await client.discounts.delete({ id: polarDiscountId }); 
        console.log(`[PolarDiscounts] ✅ Polar discount deleted: ${polarDiscountId}`);
        return { id: polarDiscountId, deleted: true, message: "Discount deleted successfully from Polar." }; 
    } catch (error) {
        console.error(`[PolarDiscounts] ❌ Error deleting Polar discount ${polarDiscountId}:`, error.message);
        if (error.response && error.response.data) {
            const errorDetail = error.response.data.detail || JSON.stringify(error.response.data);
             console.error("[PolarDiscounts] Polar Error Details:", errorDetail);
            if (error.response.status === 404 || (typeof errorDetail === 'string' && errorDetail.toLowerCase().includes('not found')) ) {
                console.warn(`[PolarDiscounts] Discount ${polarDiscountId} not found in Polar for deletion.`);
                return { id: polarDiscountId, deleted: false, message: "Not found in Polar." };
            }
        }
        throw new Error(`Failed to delete discount in Polar: ${error.response?.data?.detail || error.message}`);
    }
}

module.exports = {
    createDiscount,
    updateDiscount,
    deleteDiscount
};