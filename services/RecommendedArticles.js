const Article = require('../models/Article');
const User = require('../models/User');
const mongoose = require('mongoose');

async function getRecommendedArticles(userId, page = 1, limit = 20) {
    try {
        if (!mongoose.Types.ObjectId.isValid(userId)) {
            throw new Error('Invalid userId format');
        }

        const user = await User.findById(userId);
        if (!user) {
            throw new Error('User not found');
        }

        const userPreferences = Array.isArray(user.preferences.categories) ? user.preferences.categories : [];
        const readArticles = Array.isArray(user.readArticles) ? user.readArticles : [];

        const skip = (page - 1) * limit;

        // Simplified query to fetch articles
        const recommendedArticles = await Article.find({
            _id: { $nin: readArticles },
            category: { $in: userPreferences.length > 0 ? userPreferences : { $exists: true } }
        })
            .sort({ publishedAt: -1 })
            .skip(skip)
            .limit(limit)
            .lean();

        const totalRecommendations = await Article.countDocuments({
            _id: { $nin: readArticles },
            category: { $in: userPreferences.length > 0 ? userPreferences : { $exists: true } }
        });

        return {
            recommendations: recommendedArticles,
            currentPage: page,
            totalPages: Math.ceil(totalRecommendations / limit),
            totalRecommendations
        };
    } catch (error) {
        console.error('Error in recommendation service:', error);
        throw error;
    }
}

module.exports = { getRecommendedArticles };