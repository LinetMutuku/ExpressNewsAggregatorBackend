const nodemailer = require('nodemailer');
const webpush = require('web-push');
const twilio = require('twilio');
const UserPreference = require('../models/UserPreference');
const ActivityLog = require('../models/ActivityLog');
const schedule = require('node-schedule');

class PreferenceService {
    constructor() {
        // Initialize notification services
        this.emailTransporter = nodemailer.createTransport({
            // Configure your email service
            service: 'gmail',
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASSWORD
            }
        });

        // Initialize web push
        webpush.setVapidDetails(
            'mailto:your@email.com',
            process.env.VAPID_PUBLIC_KEY,
            process.env.VAPID_PRIVATE_KEY
        );

        // Initialize SMS service
        this.twilioClient = twilio(
            process.env.TWILIO_ACCOUNT_SID,
            process.env.TWILIO_AUTH_TOKEN
        );

        // Schedule daily jobs
        this.initializeScheduledJobs();
    }

    // Email Digest Service
    async sendEmailDigest(userId) {
        const userPrefs = await UserPreference.findOne({ user: userId })
            .populate('user');

        if (!userPrefs.notifications.email.digest) return;

        const digest = await this.generateDigest(userId);
        await this.emailTransporter.sendMail({
            to: userPrefs.user.email,
            subject: 'Your News Digest',
            html: digest
        });
    }

    // Push Notification Service
    async sendPushNotification(userId, notification) {
        const userPrefs = await UserPreference.findOne({ user: userId });
        if (!userPrefs.notifications.push.enabled) return;

        const subscription = await this.getPushSubscription(userId);
        await webpush.sendNotification(subscription, JSON.stringify(notification));
    }

    // Two-Factor Authentication
    async setupTwoFactor(userId, method) {
        const userPrefs = await UserPreference.findOne({ user: userId });

        switch (method) {
            case 'email':
                const code = crypto.randomBytes(32).toString('hex');
                // Store code and send email
                break;
            case 'authenticator':
                // Generate and return QR code
                break;
            case 'sms':
                // Send verification SMS
                break;
        }
    }

    // Privacy Mode
    async enablePrivacyMode(userId) {
        const updates = {
            'privacyMode.enabled': true,
            'privacyMode.dataCollection': false,
            'privacyMode.shareReadingHistory': false
        };

        await UserPreference.findOneAndUpdate(
            { user: userId },
            { $set: updates }
        );

        // Clear user's tracking data
        await this.clearUserData(userId);
    }

    // Activity Logging
    async logActivity(userId, action, details) {
        const userPrefs = await UserPreference.findOne({ user: userId });
        if (!userPrefs.activityLog.enabled) return;

        await ActivityLog.create({
            user: userId,
            action,
            details,
            timestamp: new Date()
        });
    }

    // Priority Support
    async initiatePrioritySupport(userId, issue) {
        const userPrefs = await UserPreference.findOne({ user: userId });
        if (!userPrefs.prioritySupport.enabled) return;

        const supportTicket = await this.createPrioritySupportTicket(userId, issue);
        await this.notifySupportTeam(supportTicket);

        return supportTicket;
    }

    // Scheduled Jobs
    initializeScheduledJobs() {
        // Daily email digest
        schedule.scheduleJob('0 8 * * *', async () => {
            const users = await UserPreference.find({
                'notifications.email.digest': true,
                'notifications.email.frequency': 'daily'
            });

            for (const user of users) {
                await this.sendEmailDigest(user.user);
            }
        });

        // Weekly email digest
        schedule.scheduleJob('0 8 * * 1', async () => {
            const users = await UserPreference.find({
                'notifications.email.digest': true,
                'notifications.email.frequency': 'weekly'
            });

            for (const user of users) {
                await this.sendEmailDigest(user.user);
            }
        });

        // Clean up old activity logs
        schedule.scheduleJob('0 0 * * *', async () => {
            const users = await UserPreference.find({
                'activityLog.enabled': true
            });

            for (const user of users) {
                const cutoffDate = new Date();
                cutoffDate.setDate(cutoffDate.getDate() - user.activityLog.retentionDays);

                await ActivityLog.deleteMany({
                    user: user.user,
                    timestamp: { $lt: cutoffDate }
                });
            }
        });
    }

    // Helper methods
    async generateDigest(userId) {
        // Generate personalized content digest
        // This would include saved articles, recommendations, etc.
    }

    async clearUserData(userId) {
        // Clear user's tracking data when privacy mode is enabled
    }

    async createPrioritySupportTicket(userId, issue) {
        // Create and return a priority support ticket
    }

    async notifySupportTeam(ticket) {
        // Notify support team about new priority ticket
    }
}

module.exports = new PreferenceService();