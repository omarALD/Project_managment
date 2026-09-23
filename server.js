const express = require('express');
const mongoose = require('mongoose');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 8100;
const MONGO_URI = process.env.MONGO_URI;

if (!MONGO_URI) {
  console.error('❌ MONGO_URI is required');
  process.exit(1);
}

mongoose.connect(MONGO_URI)
  .then(() => console.log('✅ Connected to MongoDB Atlas'))
  .catch(err => {
    console.error('❌ MongoDB error:', err);
    process.exit(1);
  });

/* ------------------------------------------------------------
   Schema — with project field
   ------------------------------------------------------------ */
const TaskSchema = new mongoose.Schema(
  {
    project: {
      type: String,
      required: true,
      default: 'general',
      index: true,
      trim: true,
      maxlength: 60
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200
    },
    assignee: {
      type: String,
      default: 'Unassigned',
      trim: true,
      maxlength: 80
    },
    deadline: {
      type: String,
      default: '',
      trim: true
    },
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
    }
  },
  { timestamps: true, versionKey: false }
);

TaskSchema.index({ project: 1, status: 1 });
TaskSchema.index({ project: 1, deadline: 1 });

const Task = mongoose.model('Task', TaskSchema);

/* ------------------------------------------------------------
   Middleware
   ------------------------------------------------------------ */
app.use(express.json({ limit: '100kb' }));
app.use(express.static(path.join(__dirname, 'public')));

/* ------------------------------------------------------------
   Helpers
   ------------------------------------------------------------ */
const formatTask = t => ({
  id: t._id.toString(),
  project: t.project,
  title: t.title,
  assignee: t.assignee,
  deadline: t.deadline,
  startDate: t.startDate,
  status: t.status,
  priority: t.priority,
  category: t.category,
  completedAt: t.completedAt,
  createdAt: t.createdAt,
  updatedAt: t.updatedAt
});

/* ------------------------------------------------------------
   Routes
   ------------------------------------------------------------ */

// Get tasks — REQUIRES ?project=xxx
app.get('/api/tasks', async (req, res) => {
  try {
    const { project, status } = req.query;
    if (!project) {
      return res.status(400).json({ error: 'project query param is required' });
    }

    const filter = { project };
    if (status) filter.status = status;

    const tasks = await Task.find(filter).sort({ deadline: 1, createdAt: -1 });
    res.json(tasks.map(formatTask));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create task
app.post('/api/tasks', async (req, res) => {
  try {
    const {
      project,
      title,
      assignee,
      deadline,
      startDate,
      status,
      priority,
      category
    } = req.body;

    if (!project) return res.status(400).json({ error: 'project is required' });
    if (!title || !title.trim()) return res.status(400).json({ error: 'title is required' });

    const newTask = new Task({
      project: project.trim(),
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

// Update task
app.put('/api/tasks/:id', async (req, res) => {
  try {
    const updates = { ...req.body };
    delete updates.id;
    delete updates._id;
    delete updates.createdAt;
    delete updates.project; // منع نقل المهمة بين المشاريع

    if (updates.status === 'done') {
      updates.completedAt = new Date();
    } else if (updates.status && updates.status !== 'done') {
      updates.completedAt = null;
    }

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

// Delete task
app.delete('/api/tasks/:id', async (req, res) => {
  try {
    const deleted = await Task.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Task not found' });
    res.json({ success: true, id: req.params.id });
  } catch (err) {
    res.status(400).json({ error: 'Invalid task ID' });
  }
});

// SPA fallback — يدعم /sec201 /sec202 ...
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});