const mongoose = require('mongoose');

const feedbackSchema = new mongoose.Schema({
    userId: { type: String, required: true }, // Store user ID
    feedback: { type: String, required: true }, // Store feedback text
    createdAt: { type: Date, default: Date.now } // Timestamp
});

const Feedback = mongoose.model('Feedback', feedbackSchema);
module.exports = Feedback;
