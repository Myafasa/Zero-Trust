require('dotenv').config();
const express = require('express');
const guard = require('../shared/guard');
const db = require('../db/database');

const app = express();
app.use(express.json());
app.use(guard);

app.get('/transkrip/:nim', (req, res) => { /* query transkrip by nim */ });
app.post('/transkrip/sinkron', (req, res) => { /* simpan data nilai final */ });

app.listen(process.env.TRANSKRIP_PORT, () => console.log('Transkrip :3002'));