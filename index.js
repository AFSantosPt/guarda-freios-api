const express = require("express");
const cors = require("cors");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const PDFDocument = require("pdfkit");
const app = express();

app.use(cors());
app.use(express.json());

// Endpoint de teste
app.get("/", (req, res) => {
  res.send("API do Guarda-Freios a funcionar 🚂");
});

// Lista de utilizadores válidos
const utilizadores = [
  { numero: "180939", password: "andres91", tipo: "Tripulante+" },
  { numero: "18001", password: "1234", tipo: "Tripulante+" },
  { numero: "18003", password: "4321", tipo: "Tripulante" },
  { numero: "teste", password: "teste", tipo: "Tripulante" },
];

// Pastas de uploads
const uploadDir = path.join(__dirname, "uploads");
const chapasDir = path.join(uploadDir, "chapas");
const servicosDir = path.join(uploadDir, "servicos");
[uploadDir, chapasDir, servicosDir].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});


// Configuração de upload dinâmico
function storageFor(folder) {
  return multer.diskStorage({
    destination: (req, file, cb) => cb(null, folder),
    filename: (req, file, cb) => cb(null, Date.now() + ".txt")
  });
}

// Função utilitária txt → pdf
function txtParaPdf(txtPath) {
  const pdfPath = txtPath.replace(".txt", ".pdf");
  const conteudo = fs.readFileSync(txtPath, "utf8");
  const doc = new PDFDocument();
  const stream = fs.createWriteStream(pdfPath);
  
  doc.pipe(stream);
  doc.fontSize(14).text(conteudo, { align: "left" });
  doc.end();

  return pdfPath;
}

// Upload de Chapas
const uploadChapa = multer({ storage: storageFor(chapasDir) });
app.post("/upload/chapa", uploadChapa.single("file"), (req, res) => {
  const txtPath = path.join(chapasDir, req.file.filename);
  const pdfPath = txtParaPdf(txtPath);
  res.json({
    tipo: "chapa",
    nome: req.file.originalname.replace(".txt", ""),
    txtFile: `/uploads/chapas/${req.file.filename}`,
    pdfFile: `/uploads/chapas/${path.basename(pdfPath)}`
  });
});

// Upload de Serviços
const uploadServico = multer({ storage: storageFor(servicosDir) });
app.post("/upload/servico", uploadServico.single("file"), (req, res) => {
  const txtPath = path.join(servicosDir, req.file.filename);
  const pdfPath = txtParaPdf(txtPath);
  res.json({
    tipo: "servico",
    nome: req.file.originalname.replace(".txt", ""),
    txtFile: `/uploads/servicos/${req.file.filename}`,
    pdfFile: `/uploads/servicos/${path.basename(pdfPath)}`
  });
});

// Servir ficheiros
app.use("/uploads", express.static(uploadDir));

// API básica para serviços do calendário
let servicos = {}; // { "2025-09-22": { partes: [...] } }

app.get("/servicos/:data", (req, res) => {
  const { data } = req.params;
  res.json(servicos[data] || { partes: [] });
});

app.post("/servicos/:data", (req, res) => {
  const { data } = req.params;
  const { partes } = req.body;
  servicos[data] = {
    partes,
    estado: "pendente",
    criadoEm: Date.now(),
    expiraEm: Date.now() + 24 * 60 * 60 * 1000
  };
  res.json({ success: true, servico: servicos[data] });
});

// Endpoint de login
app.post("/login", (req, res) => {
  const { user, pass } = req.body;

  const encontrado = utilizadores.find(
    (u) => u.numero === user && u.password === pass
  );

  if (encontrado) {
    res.json({
      success: true,
      message: "Login OK",
      numero: encontrado.numero,
      tipo: encontrado.tipo,
    });
  } else {
    res.status(401).json({ success: false, message: "Credenciais inválidas" });
  }
});

// Porta do Railway
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor a correr na porta ${PORT}`));
