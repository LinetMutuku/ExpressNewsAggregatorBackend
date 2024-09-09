const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const redis = require('redis');
require('dotenv').config();
const { fetchAndStoreArticles } = require('./services/newsService');

const app = express();

// Redis setup
const redisClient = redis.createClient({
    url: `redis://${process.env.REDIS_HOST}:${process.env.REDIS_PORT}`
});

redisClient.on('error', (error) => {
    console.error('Redis error:', error);
});

redisClient.connect().then(() => {
    console.log('Connected to Redis');
}).catch((err) => {
    console.error('Redis connection error:', err);
});

// Make Redis client available to all routes
app.use((req, res, next) => {
    req.redisClient = redisClient;
    next();
});

// CORS configuration
app.use(cors({
    origin: 'http://localhost:3000',
    credentials: true
}));

// Middleware
app.use(express.json());

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log('Connected to MongoDB'))
    .catch(err => console.error('Could not connect to MongoDB', err));

// Routes
const authRoutes = require('./routes/auth');
const articleRoutes = require('./routes/articles');
const userRoutes = require('./routes/users');

app.use('/api/auth', authRoutes);
app.use('/api/articles', articleRoutes);
app.use('/api/users', userRoutes);

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(500).json({ message: 'Something went wrong!', error: err.message, stack: err.stack });
});

const PORT = process.env.PORT || 5000;
const server = app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    fetchAndStoreArticles().catch(error => {
        console.error('Error fetching articles on server start:', error);
    });
    setInterval(() => {
        fetchAndStoreArticles().catch(error => {
            console.error('Error fetching articles in interval:', error);
        });
    }, 60 * 60 * 1000);
});

// Handle server shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM signal received: closing HTTP server');
    server.close(() => {
        console.log('HTTP server closed');
        mongoose.connection.close(false, () => {
            console.log('MongoDB connection closed');
            redisClient.quit().then(() => {
                console.log('Redis connection closed');
                process.exit(0);
            });
        });
    });
});

// Global promise rejection handler
process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

module.exports = app;