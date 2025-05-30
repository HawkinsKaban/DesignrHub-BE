// controllers/packageControllers/createPackage.js
const mongoose = require("mongoose");
const PackageModel = require("../../models/packageModel");
const CategoryModel = require("../../models/categoryModel"); // Nama model yang benar
const polarService = require("../../services/polarService");
const { errorLogs } = require("../../utils/errorLogs");

exports.createPackage = async (req, res) => {
    // Harga diasumsikan diterima dalam USD dari request body
    const { packageName, price, discountPrice, durationName, durationInDays, categoryId, onDiscount, endDiscountDate, isActive, priority } = req.body;

    const session = await mongoose.startSession();
    session.startTransaction();
    try {
        console.log(`[CreatePackageCtrl] Attempting to create package: ${packageName}`);
        if (!packageName || price == null || !durationName || durationInDays == null) {
            await session.abortTransaction();
            session.endSession();
            return res.status(400).json({ message: "Package name, price, duration name, and duration in days are required." });
        }
        
        const existingPackage = await PackageModel.findOne({ packageName }).session(session);
        if (existingPackage) {
            await session.abortTransaction();
            session.endSession();
            console.warn(`[CreatePackageCtrl] Package with name ${packageName} already exists.`);
            return res.status(400).json({ message: `Package with name ${packageName} already exists.` });
        }

        const parsedPrice = parseFloat(price);
        if (isNaN(parsedPrice) || parsedPrice < 0) { // Harga tidak boleh negatif
            await session.abortTransaction();
            session.endSession();
            return res.status(400).json({ message: "Price must be a valid non-negative number." });
        }
        let parsedDiscountPrice = null;
        if (discountPrice != null) { // discountPrice bisa null jika tidak ada diskon
            parsedDiscountPrice = parseFloat(discountPrice);
            if (isNaN(parsedDiscountPrice) || parsedDiscountPrice < 0) { // Harga diskon juga tidak boleh negatif
                await session.abortTransaction();
                session.endSession();
                return res.status(400).json({ message: "Discount price must be a valid non-negative number if provided." });
            }
            if (parsedDiscountPrice > parsedPrice) {
                await session.abortTransaction();
                session.endSession();
                return res.status(400).json({ message: "Discount price cannot be greater than the original price." });
            }
        }

        let packageData = {
            packageName,
            price: parsedPrice,
            discountPrice: parsedDiscountPrice,
            durationName,
            durationInDays: parseInt(durationInDays),
            onDiscount: onDiscount || false,
            endDiscountDate: endDiscountDate ? new Date(endDiscountDate) : null,
            isActive: isActive !== undefined ? isActive : true,
            priority: priority != null ? parseInt(priority) : 0
        };

        if (categoryId) {
            if (!mongoose.Types.ObjectId.isValid(categoryId)) {
                await session.abortTransaction(); session.endSession();
                return res.status(400).json({ message: "Invalid Category ID format." });
            }
            const existingCategory = await CategoryModel.findById(categoryId).session(session); // Gunakan CategoryModel
            if (existingCategory) {
                packageData.categoryId = existingCategory._id;
            } else {
                console.warn(`[CreatePackageCtrl] Category ID ${categoryId} not found. Package will be created without a category.`);
                // Anda bisa memilih untuk error di sini jika kategori wajib
                // return res.status(400).json({ message: `Category with ID ${categoryId} not found.` });
            }
        }

        const newPackage = new PackageModel(packageData);
        await newPackage.save({ session });
        console.log(`[CreatePackageCtrl] Package ${newPackage.packageName} saved to DB (ID: ${newPackage._id})`);

        let polarProduct = null;
        let polarSyncError = null;
        if (newPackage.isActive) {
            try {
                console.log(`[CreatePackageCtrl] Syncing active package ${newPackage.packageName} with Polar.`);
                polarProduct = await polarService.createProduct(newPackage); // polarService menangani konversi ke cents
                newPackage.polar_product_id = polarProduct.id;
                newPackage.polar_metadata = polarProduct; 
                await newPackage.save({ session });
                console.log(`[CreatePackageCtrl] ✅ Package ${newPackage.packageName} synced with Polar: ${polarProduct.id}`);
            } catch (error) {
                polarSyncError = error.message; // Tangkap pesan error
                console.error(`[CreatePackageCtrl] ⚠️ Failed to sync package ${newPackage.packageName} with Polar: ${polarSyncError}`);
                errorLogs(req, null, `Polar sync failed for new package ${newPackage.packageName}: ${polarSyncError}`, "controllers/packageControllers/createPackage.js (Polar Sync)");
                // Jangan gagalkan transaksi utama jika sinkronisasi gagal, tapi catat errornya.
                // Paket akan tetap dibuat di DB lokal.
            }
        } else {
            console.log(`[CreatePackageCtrl] Package ${newPackage.packageName} is inactive, skipping Polar sync.`);
        }

        await session.commitTransaction();
        session.endSession();

        res.status(201).json({
            message: "Package created successfully!" + (polarSyncError ? ` Polar sync failed: ${polarSyncError}` : (polarProduct ? " Synced with Polar." : " Not synced with Polar (inactive).")),
            package: newPackage,
            polar_synced: !!polarProduct && !polarSyncError,
            polar_product_id: polarProduct ? polarProduct.id : null,
            polar_sync_error: polarSyncError // Sertakan error sinkronisasi di respons jika ada
        });

    } catch (error) {
        if (session.inTransaction()) {
            await session.abortTransaction();
        }
        session.endSession();
        console.error('[CreatePackageCtrl] ❌ Server error during package creation:', error);
        errorLogs(req, res, error.message, "controllers/packageControllers/createPackage.js");
        res.status(500).json({ message: "Server error", error: error.message });
    }
}