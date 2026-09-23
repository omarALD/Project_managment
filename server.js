const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 8100;
const DATA_FILE = path.join(__dirname, 'tasks.json');

app.use(express.json());
app.use(express.static(__dirname));

// دالة مساعدة لقراءة المهام من ملف JSON
function readTasks() {
    if (!fs.existsSync(DATA_FILE)) {
        fs.writeFileSync(DATA_FILE, JSON.stringify([]));
    }
    const data = fs.readFileSync(DATA_FILE, 'utf-8');
    return JSON.parse(data || '[]');
}

// دالة مساعدة لحفظ المهام
function saveTasks(tasks) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(tasks, null, 2));
}

// 1. جلب كافة المهام
app.get('/api/tasks', (req, res) => {
    res.json(readTasks());
});

// 2. إضافة مهمة جديدة
app.post('/api/tasks', (req, res) => {
    const { title, assignee, deadline } = req.body;
    if (!title) return res.status(400).json({ error: 'عنوان المهمة مطلوب' });

    const tasks = readTasks();
    const newTask = {
        id: Date.now().toString(),
        title,
        assignee: assignee || 'غير محدد',
        deadline: deadline || 'بدون تاريخ',
        status: 'todo', // todo, in-progress, done
        createdAt: new Date().toISOString()
    };

    tasks.push(newTask);
    saveTasks(tasks);
    res.status(201).json(newTask);
});

// 3. تحديث حالة المهمة
app.put('/api/tasks/:id', (req, res) => {
    const { id } = req.params;
    const { status, title, assignee, deadline } = req.body;
    let tasks = readTasks();
    
    const taskIndex = tasks.findIndex(t => t.id === id);
    if (taskIndex === -1) return res.status(404).json({ error: 'المهمة غير موجودة' });

    if (status) tasks[taskIndex].status = status;
    if (title) tasks[taskIndex].title = title;
    if (assignee) tasks[taskIndex].assignee = assignee;
    if (deadline) tasks[taskIndex].deadline = deadline;

    saveTasks(tasks);
    res.json(tasks[taskIndex]);
});

// 4. حذف مهمة
app.delete('/api/tasks/:id', (req, res) => {
    const { id } = req.params;
    let tasks = readTasks();
    tasks = tasks.filter(t => t.id !== id);
    saveTasks(tasks);
    res.json({ success: true });
});

app.listen(PORT, () => {
    console.log(`\n🚀 سيرفر إدارة المهام يعمل على: http://localhost:${PORT}\n`);
});