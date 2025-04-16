const express = require('express');
const cors = require('cors');
const Papa = require('papaparse');
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const { OAuth2Client } = require('google-auth-library');
const Comment = require('./models/Comment'); // Import the Comment model
const Discussion = require('./models/Discussion'); // Assuming you have a Discussion model
const User = require('./models/User'); // Assuming you have a User model
const QuestionDiscussion = require('./models/QuestionDiscussion'); // Import the new model
const axios = require('axios');
require('dotenv').config();
// Import models from models directory
// const User = require('./models/User');
// const Discussion = require('./modelsjljl/Discussilon');



const app = express();
app.use(cors());
app.use(express.json());


const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const MONGODB_URI = process.env.MONGODB_URI;

const client = new OAuth2Client(GOOGLE_CLIENT_ID);

mongoose.connect(MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.error(err));

// List of available companies
const COMPANIES = [
  "adobe", "airtel", "amazon", "amex", "app_dynamics", "apple", "arista", 
  "atlassian", "audible", "bookingcom", "capitol_one", "cisco", "deshaw", 
  "deutsche_bank", "flipkart", "goldman sachs", "google", "ibm", "infosys", 
  "intel", "intuit", "jpmorgan", "mathworks", "meta", "microsoft", "nvidia", 
  "oracle", "paypal", "paytm", "phonepe", "pinterest", "qualcomm", "salesforce", 
  "samsung", "saplabs", "servicenow", "snapchat", "spotify", "uber", "visa", 
  "walmart", "wayfair", "zoho", "zscaler"
];

// GET endpoint for companies list
app.get('/api/companies', (req, res) => {
  res.json(COMPANIES);
});

// GET endpoint for company-specific questions
app.get('/api/questions/:company', async (req, res) => {
  const company = req.params.company.toLowerCase();
  
  // Construct the URL for the CSV file based on the company name
  // console.log(company);
  // console.log(COMPANIES);
  const csvUrl = `https://raw.githubusercontent.com/Hemant9785/dsa_server/main/results/${company}.csv`;

  try {
    const response = await axios.get(csvUrl);
    const data = response.data;

    // Parse the CSV data
    Papa.parse(data, {
      header: true,
      complete: (results) => {
        const questions = results.data
          .filter(item => item.Link && item.Title) // Filter out incomplete rows
          .map(item => ({
            link: item['Link'],
            difficulty: item['Difficulty'],
            title: item['Title'],
          }));
        res.json(questions);
      },
      error: (error) => {
        console.error("CSV Parsing Error:", error);
        res.status(500).json({ error: 'Error parsing questions data' });
      }
    });
  } catch (err) {
    console.error("Error fetching file:", err);
    return res.status(500).json({ error: 'Error fetching questions file' });
  }
});

// Google Sign-In endpoint
app.post('/auth/google', async (req, res) => {
  try {
    const { credential } = req.body;
    const ticket = await client.verifyIdToken({
      idToken: credential,
      audience: GOOGLE_CLIENT_ID
    });

    const payload = ticket.getPayload();
    const { sub: googleId, email, name } = payload;

    // Check if user exists
    let user = await User.findOne({ googleId });
    
    if (!user) {
      // Create new user if doesn't exist
      user = new User({
        googleId,
        email,
        name,
        solvedQuestions: []
      });
      await user.save();
    }

    res.json({
      id: user._id,
      name: user.name,
      email: user.email,
      solvedQuestions: user.solvedQuestions
    });
  } catch (error) {
    console.error('Authentication error:', error);
    res.status(401).json({ error: 'Authentication failed' });
  }
});

// Get solved questions for the current user
app.get('/api/user/solved-questions', async (req, res) => {
  try {
    // Get user ID from Authorization header or query param
    const userId = req.headers.authorization?.split(' ')[1] || req.query.userId;
    
    if (!userId) {
      return res.status(401).json({ error: 'User ID required' });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ solvedQuestions: user.solvedQuestions });
  } catch (error) {
    console.error('Error fetching solved questions:', error);
    res.status(500).json({ error: 'Failed to fetch solved questions' });
  }
});

// Mark a question as solved
app.post('/api/user/solved-questions/add', async (req, res) => {
  try {
    // Get user ID from Authorization header or request body
    const userId = req.headers.authorization?.split(' ')[1] || req.body.userId;
    const { title } = req.body;
    
    if (!userId || !title) {
      return res.status(400).json({ error: 'User ID and question title are required' });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Add the question title to the solvedQuestions array if not already present
    if (!user.solvedQuestions.includes(title)) {
      user.solvedQuestions.push(title);
      await user.save();
    }

    res.json({ solvedQuestions: user.solvedQuestions });
  } catch (error) {
    console.error('Error marking question as solved:', error);
    res.status(500).json({ error: 'Failed to mark question as solved' });
  }
});

// Unmark a question as solved
app.post('/api/user/solved-questions/remove', async (req, res) => {
  try {
    // Get user ID from Authorization header or request body
    const userId = req.headers.authorization?.split(' ')[1] || req.body.userId;
    const { title } = req.body;
    
    if (!userId || !title) {
      return res.status(400).json({ error: 'User ID and question title are required' });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Remove the question title from the solvedQuestions array
    user.solvedQuestions = user.solvedQuestions.filter(questionTitle => questionTitle !== title);
    await user.save();

    res.json({ solvedQuestions: user.solvedQuestions });
  } catch (error) {
    console.error('Error unmarking question as solved:', error);
    res.status(500).json({ error: 'Failed to unmark question as solved' });
  }
});

// GET endpoint for discussions with optional tag filter
app.get('/api/discussions', async (req, res) => {
  try {
    const { tag, page = 1, limit = 10 } = req.query;
    const skip = (page - 1) * parseInt(limit);

    let query = {};
    if (tag && tag.trim()) {
      query.tags = {
        $regex: new RegExp(tag.trim(), 'i')
      };
    }

    const discussions = await Discussion.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .populate('user', 'name email')
      .populate({
        path: 'comments',
        populate: { path: 'user', select: 'name' }
      })
      .exec();

    const total = await Discussion.countDocuments(query);

    res.json({
      discussions,
      total,
      hasMore: total > skip + discussions.length
    });
  } catch (error) {
    console.error('Error fetching discussions:', error);
    res.status(500).json({ error: 'Failed to fetch discussions', details: error.message });
  }
});

// GET all discussions (as per your requirement #2)
app.get('/api/discussions/all', async (req, res) => {
  try {
    
    
    const discussions = await Discussion.find()
      .sort({ createdAt: -1 }) // Sort by most recent first
      .populate('user', 'name email')
      .exec();

   
    
    res.json(discussions);
  } catch (error) {
    console.error('Error fetching all discussions:', error);
    res.status(500).json({ error: 'Failed to fetch discussions', details: error.message });
  }
});

// Create a new discussion (already exists but move it to match your new URL pattern)
app.post('/api/discussions/create', async (req, res) => {
  try {

    
    const { title, content, tags, userId } = req.body;
    
    // Validate input
    if (!title || !content || !tags || !userId) {
      
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Validate user exists
    const user = await User.findById(userId);
    if (!user) {
      
      return res.status(404).json({ error: 'User not found' });
    }

    // Process tags: trim, convert to lowercase, and remove duplicates
    const processedTags = [...new Set(
      tags.map(tag => tag.toLowerCase().trim()).filter(tag => tag)
    )];

    

    const discussion = new Discussion({
      title: title.trim(),
      content: content.trim(),
      tags: processedTags,
      user: userId,
      upvotes: [],
      downvotes: [],
      comments: []
    });

    await discussion.save();
    
    
    // Populate user details before sending response
    await discussion.populate('user', 'name email');
    
    res.status(201).json(discussion);
  } catch (error) {
    console.error('Error creating discussion:', error);
    if (error.name === 'ValidationError') {
      return res.status(400).json({ error: 'Invalid input data', details: error.message });
    }
    res.status(500).json({ error: 'Failed to create discussion', details: error.message });
  }
});

// Keep the original endpoint for backward compatibility
app.post('/api/discussions', async (req, res) => {
  try {
    // Forward to the new endpoint
    const { title, content, tags, userId } = req.body;
    
    // Validate input
    if (!title || !content || !tags || !userId) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Validate user exists
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Process tags
    const processedTags = [...new Set(
      tags.map(tag => tag.toLowerCase().trim()).filter(tag => tag)
    )];

    const discussion = new Discussion({
      title: title.trim(),
      content: content.trim(),
      tags: processedTags,
      user: userId,
      upvotes: [],
      downvotes: [],
      comments: []
    });

    await discussion.save();
    await discussion.populate('user', 'name email');
    
    res.status(201).json(discussion);
  } catch (error) {
    console.error('Error creating discussion:', error);
    if (error.name === 'ValidationError') {
      return res.status(400).json({ error: 'Invalid input data' });
    }
    res.status(500).json({ error: 'Failed to create discussion' });
  }
});

// Edit a discussion
app.put('/api/discussions/edit/:id', async (req, res) => {
  try {
  
    
    const { id } = req.params;
    const { title, content, tags, userId } = req.body;

    if (!title || !content || !tags || !userId) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const discussion = await Discussion.findById(id);
    if (!discussion) {
      return res.status(404).json({ error: 'Discussion not found' });
    }

    // Check if the user is the creator of the discussion
    if (discussion.user.toString() !== userId) {
      return res.status(403).json({ error: 'Unauthorized to edit this discussion' });
    }

    // Process tags
    const processedTags = [...new Set(
      tags.map(tag => tag.toLowerCase().trim()).filter(tag => tag)
    )];

    discussion.title = title.trim();
    discussion.content = content.trim();
    discussion.tags = processedTags;
    discussion.updatedAt = Date.now();

    await discussion.save();
    await discussion.populate('user', 'name email');

    res.json(discussion);
  } catch (error) {
    console.error('Error updating discussion:', error);
    res.status(500).json({ error: 'Failed to update discussion', details: error.message });
  }
});

// Keep the original patch endpoint for backward compatibility
app.patch('/api/discussions/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { title, content, tags, userId } = req.body;

    if (!title || !content || !tags || !userId) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const discussion = await Discussion.findById(id);
    if (!discussion) {
      return res.status(404).json({ error: 'Discussion not found' });
    }

    // Check if the user is the creator of the discussion
    if (discussion.user.toString() !== userId) {
      return res.status(403).json({ error: 'Unauthorized to edit this discussion' });
    }

    // Process tags
    const processedTags = [...new Set(
      tags.map(tag => tag.toLowerCase().trim()).filter(tag => tag)
    )];

    discussion.title = title.trim();
    discussion.content = content.trim();
    discussion.tags = processedTags;
    discussion.updatedAt = Date.now();

    await discussion.save();
    await discussion.populate('user', 'name email');

    res.json(discussion);
  } catch (error) {
    console.error('Error updating discussion:', error);
    res.status(500).json({ error: 'Failed to update discussion' });
  }
});

// Add a comment to a discussion
app.post('/api/comments/:discussionId', async (req, res) => {
  console.log("0"); // This should print if the endpoint is hit
  try {
    const { discussionId } = req.params;
    const { userId, text, parentCommentId } = req.body;

    if (!text || !userId) {
      return res.status(400).json({ error: 'Text and userId are required' });
    }

    const discussion = await Discussion.findById(discussionId);
    if (!discussion) {
      return res.status(404).json({ error: 'Discussion not found' });
    }

    const comment = new Comment({
      text,
      user: userId,
      discussion: discussionId,
      parentCommentId: parentCommentId || null,
    });
    await comment.save();
    await comment.populate('user', 'name');

    if (!discussion.comments) {
      discussion.comments = [];
    }
    discussion.comments.push(comment._id);
    await discussion.save();

    res.status(201).json(comment);
  } catch (error) {
    console.error('Error creating comment:', error);
    res.status(500).json({ error: 'Failed to create comment' });
  }
});

// Get comments for a discussion
app.get('/api/comments/:discussionId', async (req, res) => {
  try {
    const { discussionId } = req.params;

    const comments = await Comment.find({ discussion: discussionId }).populate('user', 'name');

    const buildCommentTree = (parentId = null) => {
      return comments
        .filter(comment => String(comment.parentCommentId) === String(parentId))
        .map(comment => ({
          ...comment.toObject(),
          replies: buildCommentTree(comment._id),
        }));
    };

    const commentTree = buildCommentTree();

    res.json(commentTree);
  } catch (error) {
    console.error('Error fetching comments:', error);
    res.status(500).json({ error: 'Failed to fetch comments' });
  }
});

// Vote on a discussion or comment
app.post('/api/discussions/vote', async (req, res) => {
  try {
    
    
    const { targetId, type, vote, userId } = req.body;
    
    if (!targetId || !type || !vote || !userId) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    if (type !== 'discussion' && type !== 'comment') {
      return res.status(400).json({ error: 'Invalid target type' });
    }

    if (vote !== 1 && vote !== -1) {
      return res.status(400).json({ error: 'Invalid vote value' });
    }

    let target;
    if (type === 'discussion') {
      target = await Discussion.findById(targetId);
    } else {
      target = await Comment.findById(targetId);
    }

    if (!target) {
      return res.status(404).json({ error: `${type} not found` });
    }

    // Initialize arrays if they don't exist
    if (!target.upvotes) target.upvotes = [];
    if (!target.downvotes) target.downvotes = [];

    // Remove user from both arrays first
    target.upvotes = target.upvotes.filter(id => id.toString() !== userId);
    target.downvotes = target.downvotes.filter(id => id.toString() !== userId);

    // Add user to the appropriate array
    if (vote === 1) {
      target.upvotes.push(userId);
    } else {
      target.downvotes.push(userId);
    }

    await target.save();
    await target.populate('user', 'name email');
    
    res.json(target);
  } catch (error) {
    console.error(`Error voting on ${req.body.type}:`, error);
    res.status(500).json({ error: `Failed to vote on ${req.body.type}`, details: error.message });
  }
});

// Maintain the original vote endpoint for backward compatibility
app.post('/api/discussions/:id/vote', async (req, res) => {
  try {
    const { id } = req.params;
    const { userId, voteType } = req.body;

    const discussion = await Discussion.findById(id);
    if (!discussion) {
      return res.status(404).json({ error: 'Discussion not found' });
    }

    // Initialize arrays if they don't exist
    if (!discussion.upvotes) discussion.upvotes = [];
    if (!discussion.downvotes) discussion.downvotes = [];

    // Remove user from both arrays first
    discussion.upvotes = discussion.upvotes.filter(id => id.toString() !== userId);
    discussion.downvotes = discussion.downvotes.filter(id => id.toString() !== userId);

    // Add user to the appropriate array
    if (voteType === 'upvote') {
      discussion.upvotes.push(userId);
    } else if (voteType === 'downvote') {
      discussion.downvotes.push(userId);
    }

    await discussion.save();
    await discussion.populate('user', 'name email');
    
    res.json(discussion);
  } catch (error) {
    console.error('Error voting on discussion:', error);
    res.status(500).json({ error: 'Failed to vote on discussion' });
  }
});

// Helper function to build a nested comment tree


// Start the server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log("hello");

  console.log(`Server is running on port ${PORT}`);

}); 

app.delete('/api/discussions/:discussionId', async (req, res) => {
  try {
    const { discussionId } = req.params;
    const userId = req.body.userId;

    const discussion = await Discussion.findById(discussionId);
    if (!discussion) {
      return res.status(404).json({ error: 'Discussion not found' });
    }

    if (discussion.user.toString() !== userId) {
      return res.status(403).json({ error: 'Not authorized to delete this discussion' });
    }

    // Delete all comments associated with the discussion
    await Comment.deleteMany({ discussion: discussionId });

    // Use findByIdAndDelete to delete the discussion
    await Discussion.findByIdAndDelete(discussionId);

    res.status(200).json({ message: 'Discussion and associated comments deleted successfully' });
  } catch (error) {
    console.error('Error deleting discussion:', error);
    res.status(500).json({ error: 'Failed to delete discussion' });
  }
}); 

// Create a new discussion for a specific question
app.post('/api/question-discussions', async (req, res) => {
  try {
    const { title, content, userId, questionTitle } = req.body;

    if (!title || !content || !userId || !questionTitle) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const discussion = new QuestionDiscussion({
      title: title.trim(),
      content: content.trim(),
      user: userId,
      questionTitle: questionTitle.trim(),
      comments: [],
    });

    await discussion.save();
    await discussion.populate('user', 'name email');

    res.status(201).json(discussion);
  } catch (error) {
    console.error('Error creating question discussion:', error);
    res.status(500).json({ error: 'Failed to create question discussion' });
  }
});

// Get discussions for a specific question title
app.get('/api/question-discussions/:questionTitle', async (req, res) => {
  try {
    const { questionTitle } = req.params;

    const discussions = await QuestionDiscussion.find({ questionTitle })
      .sort({ createdAt: -1 })
      .populate('user', 'name email')
      .populate({
        path: 'comments',
        populate: { path: 'user', select: 'name' }
      })
      .exec();

    res.json(discussions);
  } catch (error) {
    console.error('Error fetching question discussions:', error);
    res.status(500).json({ error: 'Failed to fetch question discussions' });
  }
});

// Add a comment to a question-specific discussion
app.post('/api/question-comment/:discussionId', async (req, res) => {
  try {
    const { discussionId } = req.params;
    const { userId, text } = req.body;

    if (!text || !userId) {
      return res.status(400).json({ error: 'Text and userId are required' });
    }

    const discussion = await QuestionDiscussion.findById(discussionId);
    if (!discussion) {
      return res.status(404).json({ error: 'Discussion not found' });
    }

    const comment = new Comment({
      text,
      user: userId,
      discussion: discussionId,
    });
    await comment.save();
    await comment.populate('user', 'name');

    if (!discussion.comments) {
      discussion.comments = [];
    }
    discussion.comments.push(comment._id);
    await discussion.save();

    res.status(201).json(comment);
  } catch (error) {
    console.error('Error creating question-specific comment:', error);
    res.status(500).json({ error: 'Failed to create question-specific comment' });
  }
});

// Get comments for a question-specific discussion
app.get('/api/question-comment/:discussionId', async (req, res) => {
  try {
    const { discussionId } = req.params;

    const comments = await Comment.find({ discussion: discussionId }).populate('user', 'name');

    res.json(comments);
  } catch (error) {
    console.error('Error fetching question-specific comments:', error);
    res.status(500).json({ error: 'Failed to fetch question-specific comments' });
  }
});

// Add a nested comment to a question-specific discussion
app.post('/api/question-comment-reply/:discussionId', async (req, res) => {
  try {
    const { discussionId } = req.params;
    const { userId, text, parentCommentId } = req.body;

    if (!text || !userId) {
      return res.status(400).json({ error: 'Text and userId are required' });
    }

    const discussion = await QuestionDiscussion.findById(discussionId);
    if (!discussion) {
      return res.status(404).json({ error: 'Discussion not found' });
    }

    const comment = new Comment({
      text,
      user: userId,
      discussion: discussionId,
      parentCommentId: parentCommentId || null,
    });
    await comment.save();
    await comment.populate('user', 'name');

    if (!discussion.comments) {
      discussion.comments = [];
    }
    discussion.comments.push(comment._id);
    await discussion.save();

    res.status(201).json(comment);
  } catch (error) {
    console.error('Error creating nested comment:', error);
    res.status(500).json({ error: 'Failed to create nested comment' });
  }
});

// Get nested comments for a question-specific discussion
app.get('/api/question-comment-reply/:discussionId', async (req, res) => {
  try {
    const { discussionId } = req.params;

    const comments = await Comment.find({ discussion: discussionId }).populate('user', 'name');

    const buildCommentTree = (parentId = null) => {
      return comments
        .filter(comment => String(comment.parentCommentId) === String(parentId))
        .map(comment => ({
          ...comment.toObject(),
          replies: buildCommentTree(comment._id),
        }));
    };

    const commentTree = buildCommentTree();

    res.json(commentTree);
  } catch (error) {
    console.error('Error fetching nested comments:', error);
    res.status(500).json({ error: 'Failed to fetch nested comments' });
  }
});

