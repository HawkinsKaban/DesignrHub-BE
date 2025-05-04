const mongoose = require("mongoose");
const PaymentModel = require("../../models/paymentModel");
const { errorLogs } = require("../../utils/errorLogs");

exports.getPaymentStats = async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        
        // Set default date range to the last 30 days if not provided
        const end = endDate ? new Date(endDate) : new Date();
        end.setHours(23, 59, 59, 999);
        
        const start = startDate ? new Date(startDate) : new Date();
        if (!startDate) {
            start.setDate(start.getDate() - 30);
        }
        start.setHours(0, 0, 0, 0);
        
        // Query for statistics
        const stats = await PaymentModel.aggregate([
            {
                $match: {
                    payment_time: { $gte: start, $lte: end }
                }
            },
            {
                $group: {
                    _id: "$payment_status",
                    count: { $sum: 1 },
                    totalAmount: { $sum: "$total" }
                }
            }
        ]);
        
        // Calculate total revenue from paid transactions
        const revenue = stats.find(item => item._id === "paid")?.totalAmount || 0;
        
        // Format the statistics in a more user-friendly way
        const formattedStats = {
            period: {
                start: start.toISOString().split('T')[0],
                end: end.toISOString().split('T')[0]
            },
            totalTransactions: stats.reduce((sum, item) => sum + item.count, 0),
            totalRevenue: revenue,
            statusBreakdown: stats.reduce((acc, item) => {
                acc[item._id] = {
                    count: item.count,
                    amount: item.totalAmount
                };
                return acc;
            }, {})
        };
        
        // Get daily revenue trend
        const dailyRevenue = await PaymentModel.aggregate([
            {
                $match: {
                    payment_time: { $gte: start, $lte: end },
                    payment_status: "paid"
                }
            },
            {
                $group: {
                    _id: {
                        year: { $year: "$payment_time" },
                        month: { $month: "$payment_time" },
                        day: { $dayOfMonth: "$payment_time" }
                    },
                    total: { $sum: "$total" },
                    count: { $sum: 1 }
                }
            },
            { $sort: { "_id.year": 1, "_id.month": 1, "_id.day": 1 } }
        ]);
        
        // Format daily revenue for easy chart rendering
        const revenueByDay = dailyRevenue.map(item => ({
            date: `${item._id.year}-${String(item._id.month).padStart(2, '0')}-${String(item._id.day).padStart(2, '0')}`,
            revenue: item.total,
            transactions: item.count
        }));
        
        // Get payment method breakdown
        const methodBreakdown = await PaymentModel.aggregate([
            {
                $match: {
                    payment_time: { $gte: start, $lte: end },
                    payment_status: "paid"
                }
            },
            {
                $group: {
                    _id: "$method",
                    total: { $sum: "$total" },
                    count: { $sum: 1 }
                }
            },
            { $sort: { "total": -1 } }
        ]);
        
        // Add all statistics to the response
        formattedStats.dailyRevenue = revenueByDay;
        formattedStats.paymentMethods = methodBreakdown.map(item => ({
            method: item._id,
            total: item.total,
            count: item.count,
            percentage: Math.round((item.total / revenue) * 100)
        }));
        
        return res.status(200).json({
            success: true,
            data: formattedStats
        });
        
    } catch (error) {
        errorLogs(req, res, error.message, "controllers/paymentControllers/getPaymentStats.js");
        return res.status(500).json({
            success: false,
            message: "Error retrieving payment statistics",
            error: error.message
        });
    }
};