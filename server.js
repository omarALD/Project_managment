const express = require('express');
const mongoose = require('mongoose');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 8100;

// قراءة رابط الاتصال من متغيرات البيئة
const MONGO_URI = process.env.MONGO_URI;

mongoose.connect(MONGO_URI)
  .then(() => console.log('Connected to MongoDB Atlas successfully!'))
  .catch(err => console.error('MongoDB connection error:', err));

// تعريف نموذج البيانات (Schema)
const TaskSchema = new mongoose.Schema({
  title: { type: String, required: true },
  assignee: { type: String, default: 'غير محدد' },
  deadline: { type: String, default: 'بدون تاريخ' },
  status: { type: String, default: 'todo' },
  createdAt: { type: Date, default: Date.now }
});

const Task = mongoose.model('Task', TaskSchema);

app.use(express.json());
app.use(express.static(__dirname));

// 1. جلب كافة المهام
app.get('/api/tasks', async (req, res) => {
  try {
    const tasks = await Task.find();
    const formatted = tasks.map(t => ({
      id: t._id.toString(),
      title: t.title,
      assignee: t.assignee,
      deadline: t.deadline,
      status: t.status
    }));
    res.json(formatted);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2. إضافة مهمة جديدة
app.post('/api/tasks', async (req, res) => {
  try {
    const { title, assignee, deadline } = req.body;
    if (!title) return res.status(400).json({ error: 'عنوان المهمة مطلوب' });

    const newTask = new Task({ title, assignee, deadline, status: 'todo' });
    await newTask.save();
    res.status(201).json({ id: newTask._id.toString(), ...newTask._doc });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3. تحديث حالة المهمة
app.put('/api/tasks/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { status, title, assignee, deadline } = req.body;

    const updatedTask = await Task.findByIdAndUpdate(
      id,
      { status, title, assignee, deadline },
      { new: true }
    );
    res.json(updatedTask);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 4. حذف مهمة
app.delete('/api/tasks/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await Task.findByIdAndDelete(id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});