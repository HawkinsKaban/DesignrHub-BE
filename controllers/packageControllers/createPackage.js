const mongoose = require("mongoose");
const PackageModel = require("../../models/packageModel")
const categorModel = require("../../models/categoryModel") // typo: categoryModel
const polarService = require("../../services/polarService");
const { errorLogs } = require("../../utils/errorLogs");

exports.createPackage = async (req, res) => {
    // Harga diasumsikan diterima dalam USD dari request body
    const { packageName, price, discountPrice, durationName, durationInDays, categoryId, onDiscount, endDiscountDate, isActive, priority } = req.body;

    const session = await mongoose.startSession();
    session.startTransaction();
    try {
        console.log(`[CreatePackage] Attempting to create package: ${packageName}`);
        if (!packageName || price == null || !durationName || durationInDays == null) { // price bisa 0
            await session.abortTransaction();
            session.endSession();
            return res.status(400).json({ message: "Package name, price, duration name, and duration in days are required." });
        }
        
        const existingPackage = await PackageModel.findOne({ packageName }).session(session);
        if (existingPackage) {
            await session.abortTransaction();
            session.endSession();
            console.warn(`[CreatePackage] Package with name ${packageName} already exists.`);
            return res.status(400).json({ message: `Package with name ${packageName} already exists.` });
        }

        // Validasi harga adalah angka
        const parsedPrice = parseFloat(price);
        if (isNaN(parsedPrice)) {
            await session.abortTransaction();
            session.endSession();
            return res.status(400).json({ message: "Price must be a valid number." });
        }
        let parsedDiscountPrice = null;
        if (discountPrice != null) {
            parsedDiscountPrice = parseFloat(discountPrice);
            if (isNaN(parsedDiscountPrice)) {
                await session.abortTransaction();
                session.endSession();
                return res.status(400).json({ message: "Discount price must be a valid number if provided." });
            }
        }


        let packageData = {
            packageName,
            price: parsedPrice, // Simpan harga USD
            discountPrice: parsedDiscountPrice, // Simpan harga diskon USD
            durationName,
            durationInDays,
            onDiscount: onDiscount || false,
            endDiscountDate: endDiscountDate ? new Date(endDiscountDate) : null,
            isActive: isActive !== undefined ? isActive : true,
            priority: priority || 0
        };

        if (categoryId) {
            const existingCategory = await categorModel.findById(categoryId).session(session);
            if (existingCategory) {
                packageData.categoryId = existingCategory._id;
            } else {
                console.warn(`[CreatePackage] Category ID ${categoryId} not found.`);
                // Decide if this should be an error or proceed without category
            }
        }

        const newPackage = new PackageModel(packageData);
        await newPackage.save({ session });
        console.log(`[CreatePackage] Package ${newPackage.packageName} saved to DB (ID: ${newPackage._id})`);

        let polarProduct = null;
        if (newPackage.isActive) { // Hanya sinkronisasi jika paket aktif
            try {
                console.log(`[CreatePackage] Syncing active package ${newPackage.packageName} with Polar.`);
                polarProduct = await polarService.createProduct(newPackage); // polarService akan menangani konversi ke cents
                newPackage.polar_product_id = polarProduct.id;
                newPackage.polar_metadata = polarProduct; // Simpan semua metadata dari Polar
                await newPackage.save({ session });
                console.log(`[CreatePackage] ✅ Package ${newPackage.packageName} synced with Polar: ${polarProduct.id}`);
            } catch (polarError) {
                console.error(`[CreatePackage] ⚠️ Failed to sync package ${newPackage.packageName} with Polar: ${polarError.message}`);
                // Jangan gagalkan pembuatan paket jika sinkronisasi Polar gagal, bisa disinkronkan nanti
                // Namun, log error ini penting untuk ditindaklanjuti.
                 errorLogs(req, res, `Polar sync failed for new package ${newPackage.packageName}: ${polarError.message}`, "controllers/packageControllers/createPackage.js (Polar Sync)");
            }
        } else {
            console.log(`[CreatePackage] Package ${newPackage.packageName} is inactive, skipping Polar sync.`);
        }

        await session.commitTransaction();
        session.endSession();

        res.status(201).json({
            message: "Package created successfully!",
            package: newPackage,
            polar_synced: !!polarProduct,
            polar_product_details: polarProduct // Mengembalikan detail produk Polar jika ada
        });

    } catch (error) {
        await session.abortTransaction();
        session.endSession();
        console.error('[CreatePackage] ❌ Server error during package creation:', error);
        errorLogs(req, res, error.message, "controllers/packageControllers/createPackage.js");
        res.status(500).json({ message: "Server error", error: error.message });
    }
}