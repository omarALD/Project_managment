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


/* ---------- Workspace schema ---------- */
const WorkspaceSchema = new mongoose.Schema(
  {
    slug:    { type: String, required: true, unique: true, lowercase: true, trim: true },
    name:    { type: String, required: true, trim: true, maxlength: 100 },
    members: { type: [String], default: [] }
  },
  { timestamps: true, versionKey: false }
);
const Workspace = mongoose.model('Workspace', WorkspaceSchema);
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

// صفحة إنشاء workplace
app.get('/createworkplace', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'createworkplace.html'));
});

// جلب إعدادات workplace
app.get('/api/workspaces/:slug', async (req, res) => {
  const ws = await Workspace.findOne({ slug: req.params.slug.toLowerCase() });
  if (!ws) return res.status(404).json({ error: 'Not found' });
  res.json({ slug: ws.slug, name: ws.name, members: ws.members });
});

// إنشاء workplace
app.post('/api/workspaces', async (req, res) => {
  try {
    const { slug, name, members } = req.body;
    if (!slug || !name) return res.status(400).json({ error: 'slug and name are required' });
    if (['createworkplace', 'api'].includes(slug.toLowerCase()))
      return res.status(400).json({ error: 'Reserved slug' });

    const ws = await Workspace.create({
      slug,
      name,
      members: (members || []).map(m => m.trim()).filter(Boolean)
    });
    res.status(201).json({ slug: ws.slug, name: ws.name, members: ws.members });
  } catch (err) {
    const msg = err.code === 11000 ? 'This link already exists' : err.message;
    res.status(400).json({ error: msg });
  }
});
// SPA fallback — يدعم /sec201 /sec202 ...
const fs = require('fs'); // أضف هذا السطر في أعلى server.js مع بقية الـ requires

// 1. مسار توليد صورة المعاينة الديناميكية للرابط (Open Graph Card)
app.get('/og/:slug.svg', async (req, res) => {
  try {
    const slug = req.params.slug.toLowerCase();
    const ws = await Workspace.findOne({ slug });
    const title = ws ? ws.name : slug.toUpperCase();
    const membersCount = ws && ws.members.length ? ws.members.length : 4;

    const tasks = await Task.find({ project: slug });
    const total = tasks.length;
    const done = tasks.filter(t => t.status === 'done').length;
    const inProgress = tasks.filter(t => t.status === 'in-progress').length;
    const pct = total ? Math.round((done / total) * 100) : 0;

    // حماية النصوص من رموز XML الخاصة
    const esc = s => String(s).replace(/[<>&'"]/g, c => ({
      '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;'
    }[c]));

    const svg = `<svg width="1200" height="630" viewBox="0 0 1200 630" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#0f1115"/>
          <stop offset="100%" stop-color="#1a1f2e"/>
        </linearGradient>
        <linearGradient id="bar" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stop-color="#3b73d9"/>
          <stop offset="100%" stop-color="#6aa0fa"/>
        </linearGradient>
      </defs>
      <rect width="1200" height="630" fill="url(#bg)"/>
      <rect x="60" y="60" width="1080" height="510" rx="32" fill="#161922" stroke="#2a2e36" stroke-width="2"/>
      
      <rect x="110" y="115" width="190" height="42" rx="21" fill="#17264a" stroke="#3b73d9" stroke-width="1.5"/>
      <text x="205" y="142" fill="#93bbff" font-family="system-ui, -apple-system, sans-serif" font-size="18" font-weight="700" text-anchor="middle">${esc(slug.toUpperCase())}</text>
      
      <text x="110" y="235" fill="#f0f1f4" font-family="system-ui, -apple-system, sans-serif" font-size="52" font-weight="700">${esc(title.slice(0, 38))}</text>
      <text x="110" y="290" fill="#9ca0aa" font-family="system-ui, -apple-system, sans-serif" font-size="26">Team Task Manager · ${membersCount} Members · ${total} Total Tasks</text>
      
      <text x="110" y="385" fill="#c5c8cf" font-family="system-ui, -apple-system, sans-serif" font-size="22" font-weight="600">Progress: ${done} Done · ${inProgress} In Progress</text>
      <text x="1090" y="385" fill="#6aa0fa" font-family="system-ui, -apple-system, sans-serif" font-size="26" font-weight="700" text-anchor="end">${pct}%</text>
      
      <rect x="110" y="410" width="980" height="24" rx="12" fill="#2a2e36"/>
      <rect x="110" y="410" width="${Math.max(24, Math.round(980 * (pct / 100)))}" height="24" rx="12" fill="url(#bar)"/>
      
      <text x="110" y="510" fill="#757a86" font-family="monospace" font-size="20">project-managment-zucj.onrender.com/${esc(slug)}</text>
    </svg>`;

    res.setHeader('Content-Type', 'image/svg+xml');
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.send(svg);
  } catch (err) {
    res.status(500).end();
  }
});

// 2. SPA fallback مع حقن وسوم المعاينة (Open Graph) لكل رابط
const indexTemplate = fs.readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf8');

// رابط ثابت (نتجنب مشكلة http/https خلف proxy الخاص بـ Render)
const PUBLIC_URL = process.env.PUBLIC_URL || 'https://project-managment-zucj.onrender.com';
const esc = s => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

app.get('*', async (req, res) => {
  try {
    const slug = (req.path.split('/')[1] || 'general').toLowerCase();
    const ws = await Workspace.findOne({ slug });
    const tasks = await Task.find({ project: slug });

    const total = tasks.length;
    const done = tasks.filter(t => t.status === 'done').length;
    const todo = tasks.filter(t => t.status === 'todo').length;

    const pageTitle = ws
      ? `${ws.name} (${slug.toUpperCase()}) — Team Tasks`
      : `${slug.toUpperCase()} — Team Task Manager`;

    const description = total > 0
      ? `📋 ${total} Tasks (${done} Done, ${todo} To Do) • Kanban Board & Deadlines`
      : `Kanban board, deadlines, and progress tracker for ${ws ? ws.name : slug.toUpperCase()}.`;

    const fullUrl = `${PUBLIC_URL}/${slug}`;
    const ogImage = `${PUBLIC_URL}/og-preview.jpg`;

    const ogTags = `
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="Team Task Manager">
  <meta property="og:title" content="${esc(pageTitle)}">
  <meta property="og:description" content="${esc(description)}">
  <meta property="og:url" content="${fullUrl}">
  <meta property="og:image" content="${ogImage}">
  <meta property="og:image:type" content="image/jpeg">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${esc(pageTitle)}">
  <meta name="twitter:description" content="${esc(description)}">
  <meta name="twitter:image" content="${ogImage}">`;

    const html = indexTemplate
      .replace(/<title>.*?<\/title>/, () => `<title>${esc(pageTitle)}</title>${ogTags}`)
      .replace(/<meta name="description" content=".*?">/, () => `<meta name="description" content="${esc(description)}">`);

    res.send(html);
  } catch (err) {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  }
});


app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});