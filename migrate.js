// migrate.js — شغّله مرة واحدة: node migrate.js
const mongoose = require('mongoose');
(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  const Task = mongoose.connection.collection('tasks');
  const fixes = {
    'Omar Al-Humaidi': 'Omar Alhomidi',
    'Salman Al-Saai': 'Salman Alsaai',
    'Al-Jaber': 'Abdulrahman Alajbar'
  };
  for (const [from, to] of Object.entries(fixes)) {
    const r = await Task.updateMany({ assignee: from }, { $set: { assignee: to } });
    console.log(`${from} → ${to}: ${r.modifiedCount}`);
  }
  process.exit(0);
})();