const express = require('express');
const cors = require('cors');
const path = require('node:path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const app = express();
const PORT = process.env.PORT || 5000;
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

app.use(cors({ origin: FRONTEND_URL }));
app.use(express.json());

app.get('/api/health', (req, res) => {
  res.json({ success: true, message: 'PayNet API is running' });
});

app.listen(PORT, () => {
  console.log(`PayNet API is running at http://localhost:${PORT}`);
}).on('error', (error) => {
  console.error('Could not start PayNet API:', error.message);
  process.exit(1);
});
