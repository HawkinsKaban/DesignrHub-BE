const mongoose = require("mongoose");
const PackageModel = require("../../models/packageModel");
const { errorLogs } = require("../../utils/errorLogs");

exports.getActivePackages = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;

        let { sortColumn, sortOrder, categoryId } = req.query;

        if (!sortColumn) sortColumn = "priority";
        if (!sortOrder) sortOrder = -1; // Default to highest priority first
        else sortOrder = sortOrder === "asc" ? 1 : -1;

        // Build the filter to only include active packages
        const filter = {
            isActive: true
        };

        // Optional filter by category
        if (categoryId && mongoose.isValidObjectId(categoryId)) {
            filter.categoryId = new mongoose.Types.ObjectId(categoryId);
        }

        // Get current date to filter out packages with expired discounts
        const currentDate = new Date();
        
        // Find active packages
        const packages = await PackageModel.find(filter)
            .populate("categoryId", "name description")
            .limit(limit)
            .skip(skip)
            .sort({ [sortColumn]: sortOrder });
            
        // Process packages to handle discount status
        const processedPackages = packages.map(pkg => {
            const pkgObj = pkg.toObject();
            
            // If package has a discount but it's expired, turn off the discount
            if (pkg.onDiscount && pkg.endDiscountDate && new Date(pkg.endDiscountDate) < currentDate) {
                pkgObj.onDiscount = false;
            }
            
            // Calculate final price based on discount status
            pkgObj.finalPrice = pkgObj.onDiscount ? pkgObj.discountPrice : pkgObj.price;
            
            return pkgObj;
        });

        const total = await PackageModel.countDocuments(filter);
        const totalPages = Math.ceil(total / limit);

        return res.status(200).json({
            success: true,
            packages: processedPackages,
            total,
            totalPages,
            currentPage: page
        });
    } catch (error) {
        errorLogs(req, res, error, "controllers/packageControllers/getActivePackages.js");
        return res.status(500).json({ 
            success: false, 
            message: "Server error", 
            error: error.message 
        });
    }
};