const express = require('express');
const mongoose = require('mongoose');
const compression = require('compression');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 8100;
const MONGO_URI = process.env.MONGO_URI;
const PUBLIC_URL = process.env.PUBLIC_URL || 'https://project-managment-zucj.onrender.com';

if (!MONGO_URI) {
  console.error('❌ MONGO_URI is required');
  process.exit(1);
}

// لا نسمح لخطأ عابر بإسقاط السيرفر كاملاً
process.on('unhandledRejection', err => console.error('Unhandled:', err));
process.on('uncaughtException', err => console.error('Uncaught:', err));

mongoose
  .connect(MONGO_URI, { serverSelectionTimeoutMS: 8000, maxPoolSize: 10 })
  .then(() => console.log('✅ Connected to MongoDB Atlas'))
  .catch(err => {
    console.error('❌ MongoDB error:', err);
    process.exit(1);
  });

/* ------------------------------------------------------------
   Schemas
   ------------------------------------------------------------ */
const TaskSchema = new mongoose.Schema(
  {
    project:   { type: String, required: true, default: 'general', index: true, trim: true, maxlength: 60 },
    title:     { type: String, required: true, trim: true, maxlength: 200 },
    assignee:  { type: String, default: 'Unassigned', trim: true, maxlength: 80 },
    deadline:  { type: String, default: '', trim: true },
    startDate: { type: String, default: '' },
    status:    { type: String, enum: ['todo', 'in-progress', 'done'], default: 'todo', index: true },
    priority:  { type: String, enum: ['low', 'medium', 'high', 'critical'], default: 'medium' },
    category:  { type: String, default: 'general', trim: true },
    completedAt: { type: Date, default: null }
  },
  { timestamps: true, versionKey: false }
);

TaskSchema.index({ project: 1, status: 1 });
TaskSchema.index({ project: 1, deadline: 1 });

const Task = mongoose.model('Task', TaskSchema);

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
app.use(compression());
app.use(express.json({ limit: '100kb' }));
// index:false → كي لا يخدم static الملف index.html مباشرة عند "/" متجاوزاً حقن وسوم المعاينة
app.use(express.static(path.join(__dirname, 'public'), { index: false }));

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

// كاش إحصائيات الصفحة (لوسوم المعاينة) — يُمسح عند أي تعديل على مهام المشروع
const statsCache = new Map();
const invalidateStats = slug => slug && statsCache.delete(String(slug).toLowerCase());

async function getSlugStats(slug) {
  const hit = statsCache.get(slug);
  if (hit && Date.now() - hit.at < 60_000) return hit.data;

  const [ws, counts] = await Promise.all([
    Workspace.findOne({ slug }).select('name').lean(),
    Task.aggregate([
      { $match: { project: slug } },
      { $group: { _id: '$status', n: { $sum: 1 } } }
    ])
  ]);

  const c = Object.fromEntries(counts.map(x => [x._id, x.n]));
  const data = {
    ws,
    total: counts.reduce((s, x) => s + x.n, 0),
    done: c.done || 0,
    todo: c.todo || 0
  };

  if (statsCache.size > 500) statsCache.clear();
  statsCache.set(slug, { at: Date.now(), data });
  return data;
}

/* ------------------------------------------------------------
   API
   ------------------------------------------------------------ */
app.get('/health', (req, res) => res.send('ok'));

// Get tasks — REQUIRES ?project=xxx  (الفرز يتم في الواجهة)
app.get('/api/tasks', async (req, res) => {
  try {
    const { project, status } = req.query;
    if (!project) return res.status(400).json({ error: 'project query param is required' });

    const filter = { project };
    if (status) filter.status = status;

    const tasks = await Task.find(filter).lean();
    res.json(tasks.map(formatTask));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create task
app.post('/api/tasks', async (req, res) => {
  try {
    const { project, title, assignee, deadline, startDate, status, priority, category } = req.body;

    if (!project) return res.status(400).json({ error: 'project is required' });
    if (!title || !title.trim()) return res.status(400).json({ error: 'title is required' });

    const saved = await new Task({
      project: project.trim(),
      title: title.trim(),
      assignee: assignee || 'Unassigned',
      deadline: deadline || '',
      startDate: startDate || new Date().toISOString().slice(0, 16),
      status: status || 'todo',
      priority: priority || 'medium',
      category: category || 'general'
    }).save();

    invalidateStats(saved.project);
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

    if (updates.status === 'done') updates.completedAt = new Date();
    else if (updates.status) updates.completedAt = null;

    const updated = await Task.findByIdAndUpdate(req.params.id, updates, {
      new: true,
      runValidators: true
    });
    if (!updated) return res.status(404).json({ error: 'Task not found' });

    invalidateStats(updated.project);
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

    invalidateStats(deleted.project);
    res.json({ success: true, id: req.params.id });
  } catch (err) {
    res.status(400).json({ error: 'Invalid task ID' });
  }
});

/* ------------------------------------------------------------
   Workspaces
   ------------------------------------------------------------ */
app.get('/createworkplace', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'createworkplace.html'));
});

app.get('/api/workspaces/:slug', async (req, res) => {
  try {
    const ws = await Workspace.findOne({ slug: req.params.slug.toLowerCase() }).lean();
    if (!ws) return res.status(404).json({ error: 'Not found' });
    res.json({ slug: ws.slug, name: ws.name, members: ws.members });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/workspaces', async (req, res) => {
  try {
    const { slug, name, members } = req.body;
    if (!slug || !name) return res.status(400).json({ error: 'slug and name are required' });
    if (['createworkplace', 'api', 'health'].includes(slug.toLowerCase()))
      return res.status(400).json({ error: 'Reserved slug' });

    const ws = await Workspace.create({
      slug,
      name,
      members: (members || []).map(m => m.trim()).filter(Boolean)
    });
    invalidateStats(ws.slug);
    res.status(201).json({ slug: ws.slug, name: ws.name, members: ws.members });
  } catch (err) {
    const msg = err.code === 11000 ? 'This link already exists' : err.message;
    res.status(400).json({ error: msg });
  }
});

/* ------------------------------------------------------------
   SPA fallback + Open Graph injection
   ------------------------------------------------------------ */
const indexTemplate = fs.readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf8');
const esc = s => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

app.get('*', async (req, res) => {
  // مسارات API المجهولة والملفات المفقودة (favicon, robots...) لا تستحق استعلامات
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Not found' });
  if (req.path.includes('.')) return res.status(404).end();

  try {
    const slug = (req.path.split('/')[1] || 'general').toLowerCase();
    const { ws, total, done, todo } = await getSlugStats(slug);

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