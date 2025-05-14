const mongoose = require("mongoose");
const TypeModel = require("../../models/typeModel");
const CategoryModel = require("../../models/categoryModel");
const { errorLogs } = require("../../utils/errorLogs");

exports.getApplicationsByCategory = async (req, res) => {
    try {
        const { categoryId } = req.query;
        
        // Validate if categoryId is provided
        if (!categoryId) {
            return res.status(400).json({ 
                success: false, 
                message: "Category ID is required" 
            });
        }

        // Check if category exists
        const category = await CategoryModel.findById(categoryId);
        if (!category) {
            return res.status(404).json({ 
                success: false, 
                message: "Category not found" 
            });
        }

        // Find all active types (applications) that belong to this category
        // Only select fields needed for landing page display: name and logo
        const applications = await TypeModel.find({ 
            categoryId: { $in: [categoryId] },
            isActive: true
        }).select("name logo").lean();

        // Transform response to be more frontend-friendly
        const formattedApplications = applications.map(app => ({
            id: app._id,
            name: app.name,
            logoUrl: app.logo // This assumes logo contains a path/URL to the image
        }));

        return res.status(200).json({
            success: true,
            count: formattedApplications.length,
            category: category.name,
            applications: formattedApplications
        });

    } catch (error) {
        errorLogs(req, res, error.message, "controllers/categoryControllers/getApplicationsByCategory.js");
        return res.status(500).json({ 
            success: false, 
            message: "Server error", 
            error: error.message 
        });
    }
};