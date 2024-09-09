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
app.use('/api/articles', articleRoutes);  // This line sets up the articles router
app.use('/api/users', userRoutes);

// Add a test route for Redis
app.get('/test-redis', async (req, res) => {
    try {
        await redisClient.set('test_key', 'Hello Redis!', {
            EX: 60
        });
        const value = await redisClient.get('test_key');
        res.json({ message: 'Redis test successful', value });
    } catch (error) {
        res.status(500).json({ message: 'Redis test failed', error: error.message });
    }
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Error:', err);
    res.status(500).json({ message: 'Something went wrong!', error: err.message });
});

const PORT = process.env.PORT || 5000;
const server = app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    // Fetch articles immediately when the server starts
    fetchAndStoreArticles().catch(error => {
        console.error('Error fetching articles on server start:', error);
    });
    // Set up periodic fetching (e.g., every hour)
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

module.exports = app;