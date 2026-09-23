const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 8100;
const MONGO_URI = process.env.MONGO_URI;

/* ------------------------------------------------------------
   Database Connection
   ------------------------------------------------------------ */
if (!MONGO_URI) {
  console.error('❌ MONGO_URI environment variable is required');
  process.exit(1);
}

mongoose
  .connect(MONGO_URI)
  .then(() => console.log('✅ Connected to MongoDB Atlas'))
  .catch(err => {
    console.error('❌ MongoDB connection error:', err);
    process.exit(1);
  });

/* ------------------------------------------------------------
   Schema — with improved validation & indexes
   ------------------------------------------------------------ */
const TaskSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Task title is required'],
      trim: true,
      maxlength: [200, 'Title too long (max 200 chars)']
    },
    assignee: {
      type: String,
      default: 'Unassigned',
      trim: true,
      maxlength: [80, 'Assignee name too long']
    },
    deadline: {
      type: String,
      default: '',
      trim: true
    },
    // ISO start date for timeline visualization
    startDate: {
      type: String,
      default: ''
    },
    status: {
      type: String,
      enum: ['todo', 'in-progress', 'done'],
      default: 'todo',
      index: true
    },
    priority: {
      type: String,
      enum: ['low', 'medium', 'high', 'critical'],
      default: 'medium'
    },
    category: {
      type: String,
      default: 'general',
      trim: true
    },
    completedAt: {
      type: Date,
      default: null
    },
    order: {
      type: Number,
      default: 0
    }
  },
  {
    timestamps: true,
    versionKey: false
  }
);

// Compound index for fast queries
TaskSchema.index({ status: 1, deadline: 1 });
TaskSchema.index({ deadline: 1 });

const Task = mongoose.model('Task', TaskSchema);

/* ------------------------------------------------------------
   Middleware
   ------------------------------------------------------------ */
app.use(cors());
app.use(express.json({ limit: '100kb' }));

// Rate limiter for API
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please slow down.' }
});
app.use('/api/', apiLimiter);

// Serve static files from /public
app.use(express.static(path.join(__dirname, 'public')));

/* ------------------------------------------------------------
   Helpers
   ------------------------------------------------------------ */
const formatTask = t => ({
  id: t._id.toString(),
  title: t.title,
  assignee: t.assignee,
  deadline: t.deadline,
  startDate: t.startDate,
  status: t.status,
  priority: t.priority,
  category: t.category,
  completedAt: t.completedAt,
  order: t.order,
  createdAt: t.createdAt,
  updatedAt: t.updatedAt
});

/* ------------------------------------------------------------
   Routes
   ------------------------------------------------------------ */

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    db: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    timestamp: new Date().toISOString()
  });
});

// GET all tasks
app.get('/api/tasks', async (req, res) => {
  try {
    const { status, assignee, from, to } = req.query;
    const filter = {};
    if (status) filter.status = status;
    if (assignee) filter.assignee = assignee;
    if (from || to) {
      filter.deadline = {};
      if (from) filter.deadline.$gte = from;
      if (to) filter.deadline.$lte = to;
    }

    const tasks = await Task.find(filter).sort({ deadline: 1, createdAt: -1 });
    res.json(tasks.map(formatTask));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET single task
app.get('/api/tasks/:id', async (req, res) => {
  try {
    const task = await Task.findById(req.params.id);
    if (!task) return res.status(404).json({ error: 'Task not found' });
    res.json(formatTask(task));
  } catch (err) {
    res.status(400).json({ error: 'Invalid task ID' });
  }
});

// CREATE task
app.post('/api/tasks', async (req, res) => {
  try {
    const {
      title,
      assignee,
      deadline,
      startDate,
      status,
      priority,
      category
    } = req.body;

    if (!title || !title.trim()) {
      return res.status(400).json({ error: 'Task title is required' });
    }

    const newTask = new Task({
      title: title.trim(),
      assignee: assignee || 'Unassigned',
      deadline: deadline || '',
      startDate: startDate || new Date().toISOString().slice(0, 16),
      status: status || 'todo',
      priority: priority || 'medium',
      category: category || 'general'
    });

    const saved = await newTask.save();
    res.status(201).json(formatTask(saved));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// UPDATE task (full or partial)
app.put('/api/tasks/:id', async (req, res) => {
  try {
    const updates = { ...req.body };

    // If status changes to done, stamp completedAt
    if (updates.status === 'done') {
      updates.completedAt = new Date();
    } else if (updates.status && updates.status !== 'done') {
      updates.completedAt = null;
    }

    // Remove fields that shouldn't be updated directly
    delete updates.id;
    delete updates._id;
    delete updates.createdAt;

    const updated = await Task.findByIdAndUpdate(req.params.id, updates, {
      new: true,
      runValidators: true
    });

    if (!updated) return res.status(404).json({ error: 'Task not found' });
    res.json(formatTask(updated));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// DELETE task
app.delete('/api/tasks/:id', async (req, res) => {
  try {
    const deleted = await Task.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Task not found' });
    res.json({ success: true, id: req.params.id });
  } catch (err) {
    res.status(400).json({ error: 'Invalid task ID' });
  }
});

// Bulk delete completed tasks
app.delete('/api/tasks', async (req, res) => {
  try {
    const { status } = req.query;
    if (status === 'done') {
      const result = await Task.deleteMany({ status: 'done' });
      return res.json({ success: true, deletedCount: result.deletedCount });
    }
    res.status(400).json({ error: 'Bulk delete requires ?status=done' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// SPA fallback → serve index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

/* ------------------------------------------------------------
   Error handler
   ------------------------------------------------------------ */
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

/* ------------------------------------------------------------
   Graceful shutdown
   ------------------------------------------------------------ */
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, closing gracefully...');
  await mongoose.connection.close();
  process.exit(0);
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📁 Serving static files from /public`);
});