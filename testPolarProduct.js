// testPolarProduct.js (Revisi berdasarkan file Anda uploaded:testPolarProduct.js dan temuan terbaru)
require('dotenv').config(); 
const { Polar } = require('@polar-sh/sdk');

const accessToken = process.env.POLAR_ACCESS_TOKEN;

if (!accessToken) {
    console.error("❌ Error: POLAR_ACCESS_TOKEN tidak di-set di environment variables.");
    process.exit(1);
}

const polar = new Polar({
    accessToken: accessToken,
    server: process.env.NODE_ENV === 'production' ? 'production' : 'sandbox' 
});

// ========================================
// STRATEGI UTAMA (PERFECT POLAR PRODUCT CREATION TEST - REVISED)
// ========================================
async function createPerfectPolarProduct() {
    console.log("🚀 [PolarTest] PERFECT POLAR PRODUCT CREATION TEST (REVISED)");
    console.log("=".repeat(60));
    console.log(`Server: ${process.env.NODE_ENV === 'production' ? 'PRODUCTION' : 'SANDBOX'}`);
    console.log("=".repeat(60));

    const timestamp = Date.now();
    const productName = `Perfect Product Revised ${timestamp}`;
    const priceInCents = 1500; // Contoh: 15.00 USD
    const currency = "usd"; // Sesuai contoh SDK (lowercase)
    const recurringIntervalValue = "month";
    
    try {
        console.log("\n📦 STEP 1: Creating product with SDK example structure (NO organizationId)...");
        
        const productPayload = {
            name: productName,
            description: "Test product created via Polar SDK, minimal price object, no organizationId.",
            isRecurring: true,
            recurringInterval: recurringIntervalValue,
            prices: [{
                priceAmount: priceInCents, 
                priceCurrency: currency 
            }],
            // organizationId: process.env.POLAR_ORGANIZATION_ID, // DIHAPUS - Penyebab error sebelumnya
            metadata: {
                test_id: `perfect-revised-${timestamp}`,
                strategy: "sdk_example_no_org_id",
                created_by: "sdk_test_script"
            }
        };

        console.log("📤 Payload yang akan dikirim ke polar.products.create():");
        console.log(JSON.stringify(productPayload, null, 2));

        let product = await polar.products.create(productPayload);
        console.log(`✅ Product created successfully: ${product.id}`);
        console.log("📋 Detail Produk Lengkap dari Polar (Setelah Create):");
        console.log(JSON.stringify(product, null, 2)); // Log respons lengkap

        // Validasi harga
        if (product.prices && product.prices.length > 0) {
            const price = product.prices[0];
            console.log(`\n💰 Price analysis (from product create response):`);
            console.log(`   ID: ${price.id}`);
            console.log(`   AmountType: ${price.amountType}`); // Harusnya bukan 'free'
            console.log(`   Amount: ${price.amount}`);         // Harusnya 1500
            console.log(`   Currency: ${price.currency}`);       // Harusnya 'usd'
            console.log(`   Type: ${price.type}`);             // Harusnya 'recurring'
            console.log(`   RecurringInterval: ${price.recurringInterval}`); // Harusnya 'month'

            if (price.amountType !== 'free' && price.amount === priceInCents && price.currency?.toLowerCase() === currency) {
                console.log("🎉 SUCCESS! Paid price created successfully within product creation!");
            } else {
                console.log("⚠️  Price created is still free or incorrect. This embedded price method is not working as expected.");
                // Jika masih gratis, ini mengindikasikan masalah lebih dalam dengan 'products.create' untuk harga berulang berbayar.
            }
        } else {
            console.log("⚠️ No prices array in product response or prices array is empty.");
        }
        return product;

    } catch (error) {
        console.error("❌ Error in createPerfectPolarProduct:", error.message);
        if (error.response?.data) {
            console.error("🔍 API Response Error:", JSON.stringify(error.response.data, null, 2));
        }
        if (error.issues) { // Error validasi Zod dari SDK
            console.error("🔍 Validation Issues (SDK):", JSON.stringify(error.issues, null, 2));
        }
        if (!error.response?.data && !error.issues) {
            console.error("Full error object:", error);
        }
        return null;
    }
}

// ... (Fungsi tryAlternativeApproach, tryFallbackStrategy, generateFinalReport, cleanupIfNeeded bisa Anda simpan atau hapus jika tidak digunakan lagi untuk tes ini)

// ============================================
// MAIN EXECUTION
// ============================================
async function main() {
    const startTime = Date.now();
    console.log(`🚀 Starting Revised Polar Test at ${new Date().toISOString()}`);
    
    let createdProduct = null;
    
    try {
        createdProduct = await createPerfectPolarProduct(); // Hanya jalankan strategi utama yang direvisi
        
        if (createdProduct) {
            // generateFinalReport(createdProduct); // Anda bisa aktifkan ini jika fungsinya sudah disesuaikan
            console.log(`\n[Main] Produk tes (mungkin) berhasil dibuat: ${createdProduct.id}`);
            const price = createdProduct.prices && createdProduct.prices.length > 0 ? createdProduct.prices[0] : null;
            if (price && price.amountType !== 'free' && price.amount === 1500) { // Ganti 1500 dengan priceInCents jika variabelnya di-scope
                console.log(`[Main] ✅ Harga berbayar terkonfirmasi: ${price.amount} ${price.currency}`);
            } else {
                console.log(`[Main] ⚠️ Harga produk masih gratis atau tidak sesuai harapan.`);
            }
        } else {
            console.log("[Main] ❌ Strategi utama gagal membuat produk dengan benar.");
        }

    } catch (mainError) {
        console.error("❌ Main execution failed:", mainError.message);
        console.error(mainError.stack);
    } finally {
        const endTime = Date.now();
        const duration = ((endTime - startTime) / 1000).toFixed(2);
        
        console.log(`\n⏱️  Total execution time: ${duration} seconds`);
        if (createdProduct) {
            console.log(`📊 Produk ID yang dibuat (jika ada): ${createdProduct.id}`);
            // Untuk cleanup:
            // if (createdProduct.id) { await cleanupIfNeeded([createdProduct.id]); }
        }
        console.log("\n🏁 Revised Polar Test completed!");
    }
}

main().catch(error => {
    console.error("💥 Fatal error:", error);
    process.exit(1);
});