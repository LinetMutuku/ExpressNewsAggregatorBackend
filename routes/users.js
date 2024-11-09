const express = require('express');
const router = express.Router();
const User = require('../models/User');
const UserPreference = require('../models/UserPreference');
const SavedArticle = require('../models/SavedArticle');
const Article = require('../models/Article');
const { authenticateUser } = require('../middleware/auth');
const nodemailer = require('nodemailer');
const webpush = require('web-push');
const twilio = require('twilio');

// Initialize services
const emailTransporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD
    }
});

webpush.setVapidDetails(
    'mailto:' + process.env.EMAIL_USER,
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
);

const twilioClient = twilio(
    process.env.TWILIO_ACCOUNT_SID,
    process.env.TWILIO_AUTH_TOKEN
);

// Get user preferences
router.get('/preferences', authenticateUser, async (req, res) => {
    try {
        console.log('Fetching preferences for user:', req.userId);
        let userPreferences = await UserPreference.findOne({ user: req.userId });

        if (!userPreferences) {
            userPreferences = await UserPreference.create({
                user: req.userId,
                darkMode: false,
                notifications: {
                    push: { enabled: false },
                    sms: { enabled: false },
                    email: {
                        digest: false,
                        frequency: 'weekly'
                    }
                },
                categories: [],
                sources: [],
                emailDigest: false,
                autoSave: true,
                privacyMode: {
                    enabled: false,
                    dataCollection: true
                },
                twoFactorAuth: {
                    enabled: false,
                    method: 'email'
                }
            });
            console.log('Created default preferences for user:', req.userId);
        }

        console.log('Retrieved preferences for user:', req.userId, userPreferences);
        res.json(userPreferences);
    } catch (error) {
        console.error('Error fetching user preferences:', error);
        res.status(500).json({ message: 'Error fetching user preferences', error: error.message });
    }
});

// Update user preferences
router.put('/preferences', authenticateUser, async (req, res) => {
    try {
        console.log('Updating preferences for user:', req.userId, 'New preferences:', req.body.preferences);
        const user = await User.findById(req.userId);
        const previousPreferences = await UserPreference.findOne({ user: req.userId });
        const updatedPreferences = req.body.preferences;

        let userPreferences = await UserPreference.findOneAndUpdate(
            { user: req.userId },
            { $set: updatedPreferences },
            { new: true, upsert: true }
        );

        // Handle Email Digest Changes
        if (updatedPreferences.notifications?.email?.digest &&
            (!previousPreferences?.notifications?.email?.digest ||
                previousPreferences.notifications.email.frequency !== updatedPreferences.notifications.email.frequency)) {

            await emailTransporter.sendMail({
                to: user.email,
                subject: 'News Digest Activated',
                html: `
                    <h2>Welcome to Your News Digest</h2>
                    <p>You'll receive news updates ${updatedPreferences.notifications.email.frequency}</p>
                    <p>You can customize your preferences anytime in your settings.</p>
                `
            });
        }

        // Handle 2FA Setup
        if (updatedPreferences.twoFactorAuth?.enabled && !previousPreferences?.twoFactorAuth?.enabled) {
            const verificationCode = Math.floor(100000 + Math.random() * 900000);

            if (updatedPreferences.twoFactorAuth.method === 'sms' && updatedPreferences.twoFactorAuth.phone) {
                await twilioClient.messages.create({
                    body: `Your verification code is: ${verificationCode}`,
                    to: updatedPreferences.twoFactorAuth.phone,
                    from: process.env.TWILIO_PHONE_NUMBER
                });
            } else {
                await emailTransporter.sendMail({
                    to: user.email,
                    subject: '2FA Verification Code',
                    html: `
                        <h2>Two-Factor Authentication Setup</h2>
                        <p>Your verification code is: <strong>${verificationCode}</strong></p>
                        <p>Enter this code in the app to complete 2FA setup.</p>
                    `
                });
            }

            // Store verification code temporarily (you might want to use Redis for this)
            userPreferences.twoFactorAuth.tempCode = verificationCode;
            await userPreferences.save();
        }

        // Handle Push Notification Changes
        if (updatedPreferences.notifications?.push?.enabled &&
            !previousPreferences?.notifications?.push?.enabled) {
            // Store push subscription
            if (updatedPreferences.notifications.push.subscription) {
                userPreferences.notifications.push.subscription = updatedPreferences.notifications.push.subscription;
                await userPreferences.save();

                // Send test notification
                await webpush.sendNotification(
                    updatedPreferences.notifications.push.subscription,
                    JSON.stringify({
                        title: 'Notifications Enabled',
                        body: 'You will now receive push notifications for important updates.'
                    })
                );
            }
        }

        res.json(userPreferences);
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
        const userPreferences = await UserPreference.findOne({ user: userId });

        if (!articleId) {
            return res.status(400).json({ message: 'Article ID is required' });
        }

        const existingArticle = await SavedArticle.findOne({ user: userId, articleId: articleId });
        if (existingArticle) {
            return res.status(200).json({ message: 'Article already saved', article: existingArticle });
        }

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
            url: articleDetails.url,
            isPrivate: userPreferences?.privacyMode?.enabled || false
        });

        await savedArticle.save();

        // Send push notification if enabled
        if (userPreferences?.notifications?.push?.enabled &&
            userPreferences.notifications.push.subscription) {
            await webpush.sendNotification(
                userPreferences.notifications.push.subscription,
                JSON.stringify({
                    title: 'Article Saved',
                    body: articleDetails.title
                })
            );
        }

        res.status(201).json({ message: 'Article saved successfully', article: savedArticle });
    } catch (error) {
        console.error('Error saving article:', error);
        res.status(500).json({ message: 'Error saving article', error: error.message });
    }
});


// Delete article
router.delete('/delete-article/:articleId', authenticateUser, async (req, res) => {
    try {
        const articleId = req.params.articleId;

        console.log(`Attempting to delete article. Article ID: ${articleId}`);

        const result = await Article.findByIdAndDelete(articleId);

        if (result) {
            console.log(`Article deleted successfully. Article ID: ${articleId}`);
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

// Unsave article
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