const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config({ path: '../.env' }); // Load .env from parent

const app = express();
const PORT = 3001; // Run on different port than Flask/FastAPI

app.use(cors());
app.use(express.json());

// MongoDB Connection
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/almox_db';
mongoose.connect(MONGO_URI)
  .then(() => console.log('✅ Node.js conectado ao MongoDB!'))
  .catch(err => console.error('Erro ao conectar:', err));

// Simple Schema for Products (reading existing collection)
// Note: 'collection: products' matches the existing collection name
const ProdutoSchema = new mongoose.Schema({
  nome: String,
  codigo: String,
  descricao: String
}, { collection: 'produtos', strict: false }); // strict: false allows reading fields not defined here

const Produto = mongoose.model('Produto', ProdutoSchema);

// Endpoint to list products
app.get('/api/node/produtos', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 20;
    const produtos = await Produto.find().limit(limit);
    res.json({
      source: "Node.js API",
      count: produtos.length,
      data: produtos
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Servidor Node.js rodando em http://localhost:${PORT}`);
});
