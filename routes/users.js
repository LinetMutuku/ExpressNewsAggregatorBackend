const express = require('express');
const router = express.Router();
const User = require('../models/User');
const SavedArticle = require('../models/SavedArticle');
const Article = require('../models/Article');
const { authenticateUser } = require('../middleware/auth');

// Get user preferences
router.get('/preferences', authenticateUser, async (req, res) => {
    try {
        console.log('Fetching preferences for user:', req.userId);
        const user = await User.findById(req.userId);
        if (!user) {
            console.log('User not found:', req.userId);
            return res.status(404).json({ message: 'User not found' });
        }
        console.log('Retrieved preferences for user:', req.userId, user.preferences);
        res.json(user.preferences || {
            categories: [],
            sources: [],
            darkMode: false,
            notifications: false
        });
    } catch (error) {
        console.error('Error fetching user preferences:', error);
        res.status(500).json({ message: 'Error fetching user preferences', error: error.message });
    }
});

// Update user preferences
router.put('/preferences', authenticateUser, async (req, res) => {
    try {
        console.log('Updating preferences for user:', req.userId, 'New preferences:', req.body.preferences);
        const updatedPreferences = {
            ...req.body.preferences,
            categories: req.body.preferences.categories || [],
            sources: req.body.preferences.sources || []
        };
        const user = await User.findByIdAndUpdate(
            req.userId,
            { $set: { preferences: updatedPreferences } },
            { new: true }
        );
        if (!user) {
            console.log('User not found for update:', req.userId);
            return res.status(404).json({ message: 'User not found' });
        }
        console.log('Updated preferences:', user.preferences);
        res.json(user.preferences);
    } catch (error) {
        console.error('Error updating user preferences:', error);
        res.status(500).json({ message: 'Error updating user preferences', error: error.message });
    }
});

// Getting saved articles
router.get('/saved-articles', authenticateUser, async (req, res) => {
    try {
        console.log('Fetching saved articles for user:', req.userId);
        const savedArticles = await SavedArticle.find({ user: req.userId });
        console.log('Retrieved saved articles for user:', req.userId, 'Count:', savedArticles.length);
        savedArticles.forEach(article => {
            console.log('Article ID:', article.articleId, 'Image URL:', article.imageUrl);
        });
        res.json(savedArticles);
    } catch (error) {
        console.error('Error fetching saved articles:', error);
        res.status(500).json({ message: 'Error fetching saved articles', error: error.message });
    }
});

// Save an article
router.post('/save-article', authenticateUser, async (req, res) => {
    try {
        const userId = req.userId;
        const { articleId } = req.body;

        console.log('Received article data:', { articleId });

        if (!articleId) {
            return res.status(400).json({ message: 'Article ID is required' });
        }

        // Check if the article is already saved
        const existingArticle = await SavedArticle.findOne({ user: userId, articleId: articleId });
        if (existingArticle) {
            console.log('Article already saved for user:', userId);
            return res.status(200).json({ message: 'Article already saved', article: existingArticle });
        }

        // Fetch the article details from your articles collection
        const articleDetails = await Article.findById(articleId);
        if (!articleDetails) {
            return res.status(404).json({ message: 'Article not found' });
        }

        const savedArticle = new SavedArticle({
            user: userId,
            articleId: articleId,
            title: articleDetails.title,
            description: articleDetails.description,
            imageUrl: articleDetails.imageUrl,
            publishedAt: articleDetails.publishedAt,
            source: articleDetails.source,
            category: articleDetails.category,
            url: articleDetails.url
        });

        await savedArticle.save();
        console.log('Article saved successfully for user:', userId);
        res.status(201).json({ message: 'Article saved successfully', article: savedArticle });
    } catch (error) {
        console.error('Error saving article:', error);
        res.status(500).json({ message: 'Error saving article', error: error.message });
    }
});


router.delete('/delete-article/:articleId', authenticateUser, async (req, res) => {
    try {
        const articleId = req.params.articleId;

        console.log(`Attempting to delete article. Article ID: ${articleId}`);

        const result = await Article.findByIdAndDelete(articleId);

        if (result) {
            console.log(`Article deleted successfully. Article ID: ${articleId}`);
            // Also remove from SavedArticles if it exists there
            await SavedArticle.deleteMany({ articleId: articleId });
            res.json({ message: 'Article deleted successfully' });
        } else {
            console.log(`Article not found. Article ID: ${articleId}`);
            res.status(404).json({ message: 'Article not found' });
        }
    } catch (error) {
        console.error('Error deleting article:', error);
        res.status(500).json({ message: 'Internal server error', error: error.message });
    }
});

// Unsave an article
router.delete('/unsave-article/:articleId', authenticateUser, async (req, res) => {
    try {
        const userId = req.userId;
        const articleId = req.params.articleId;

        console.log(`Attempting to unsave article. User ID: ${userId}, Article ID: ${articleId}`);

        const result = await SavedArticle.findOneAndDelete({ user: userId, _id: articleId });

        if (result) {
            console.log(`Article unsaved successfully. User ID: ${userId}, Article ID: ${articleId}`);
            res.json({ message: 'Article unsaved successfully' });
        } else {
            console.log(`Article not found in saved articles. User ID: ${userId}, Article ID: ${articleId}`);
            res.status(404).json({ message: 'Article not found in your saved list' });
        }
    } catch (error) {
        console.error('Error unsaving article:', error);
        res.status(500).json({ message: 'Internal server error', error: error.message });
    }
});
// Get user profile
router.get('/profile', authenticateUser, async (req, res) => {
    try {
        console.log('Fetching profile for user:', req.userId);
        const user = await User.findById(req.userId).select('-password');
        if (!user) {
            console.log('User not found:', req.userId);
            return res.status(404).json({ message: 'User not found' });
        }
        console.log('Retrieved profile for user:', req.userId);
        res.json(user);
    } catch (error) {
        console.error('Error fetching user profile:', error);
        res.status(500).json({ message: 'Error fetching user profile', error: error.message });
    }
});

// Update user profile
router.put('/profile', authenticateUser, async (req, res) => {
    try {
        console.log('Updating profile for user:', req.userId);
        const { username, email } = req.body;
        const user = await User.findByIdAndUpdate(
            req.userId,
            { $set: { username, email } },
            { new: true }
        ).select('-password');
        if (!user) {
            console.log('User not found for update:', req.userId);
            return res.status(404).json({ message: 'User not found' });
        }
        console.log('Updated profile for user:', req.userId);
        res.json(user);
    } catch (error) {
        console.error('Error updating user profile:', error);
        res.status(500).json({ message: 'Error updating user profile', error: error.message });
    }
});

module.exports = router;