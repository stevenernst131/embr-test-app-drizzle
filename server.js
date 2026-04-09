const express = require('express');
const path = require('path');
const { db, pool } = require('./db');
const { todos, users, posts } = require('./drizzle/schema');
const { eq, desc } = require('drizzle-orm');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Health check endpoint
app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({
      status: 'healthy',
      database: 'connected',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      database: 'disconnected',
      error: error.message,
      timestamp: new Date().toISOString(),
    });
  }
});

// --- Todo CRUD ---
app.get('/api/todos', async (req, res) => {
  const result = await db.select().from(todos).orderBy(desc(todos.createdAt));
  res.json(result);
});

app.post('/api/todos', async (req, res) => {
  const { title } = req.body;
  if (!title) return res.status(400).json({ error: 'title is required' });
  const [todo] = await db.insert(todos).values({ title }).returning();
  res.status(201).json(todo);
});

app.patch('/api/todos/:id', async (req, res) => {
  const { id } = req.params;
  const { title, completed } = req.body;
  const updates = {};
  if (title !== undefined) updates.title = title;
  if (completed !== undefined) updates.completed = completed;
  updates.updatedAt = new Date();
  try {
    const [todo] = await db.update(todos).set(updates).where(eq(todos.id, parseInt(id))).returning();
    if (!todo) return res.status(404).json({ error: 'Todo not found' });
    res.json(todo);
  } catch {
    res.status(404).json({ error: 'Todo not found' });
  }
});

app.delete('/api/todos/:id', async (req, res) => {
  try {
    const [deleted] = await db.delete(todos).where(eq(todos.id, parseInt(req.params.id))).returning();
    if (!deleted) return res.status(404).json({ error: 'Todo not found' });
    res.status(204).send();
  } catch {
    res.status(404).json({ error: 'Todo not found' });
  }
});

// --- User + Post endpoints ---
app.get('/api/users', async (req, res) => {
  const allUsers = await db.select().from(users);
  const allPosts = await db.select().from(posts);
  const result = allUsers.map(u => ({
    ...u,
    posts: allPosts.filter(p => p.authorId === u.id),
  }));
  res.json(result);
});

app.get('/api/posts', async (req, res) => {
  const allPosts = await db.select().from(posts).orderBy(desc(posts.createdAt));
  const allUsers = await db.select().from(users);
  const result = allPosts.map(p => ({
    ...p,
    author: allUsers.find(u => u.id === p.authorId) || { name: 'Unknown', email: '' },
  }));
  res.json(result);
});

// --- DB info endpoint ---
app.get('/api/db/info', async (req, res) => {
  try {
    const { rows: todoRows } = await pool.query('SELECT COUNT(*) as count FROM todos');
    const { rows: userRows } = await pool.query('SELECT COUNT(*) as count FROM users');
    const { rows: postRows } = await pool.query('SELECT COUNT(*) as count FROM posts');
    res.json({
      tables: {
        todos: parseInt(todoRows[0].count),
        users: parseInt(userRows[0].count),
        posts: parseInt(postRows[0].count),
      },
      databaseUrl: process.env.DATABASE_URL ? '(set)' : '(not set)',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// --- Stats endpoint (added in r2-test-branch) ---
app.get('/api/stats', async (req, res) => {
  try {
    const allTodos = await db.select().from(todos);
    const completedCount = allTodos.filter(t => t.completed).length;
    res.json({
      branch: 'r2-test-branch',
      totalTodos: allTodos.length,
      completedTodos: completedCount,
      pendingTodos: allTodos.length - completedCount,
      completionRate: allTodos.length > 0
        ? Math.round((completedCount / allTodos.length) * 100)
        : 0,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Embr Test App (Drizzle) running on http://0.0.0.0:${PORT}`);
  console.log(`DATABASE_URL: ${process.env.DATABASE_URL ? '(configured)' : '(not set)'}`);
});
