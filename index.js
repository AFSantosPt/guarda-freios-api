const express = require("express");
const cors = require("cors");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const PDFDocument = require("pdfkit");
const app = express();

app.use(cors());
app.use(express.json());

// ✅ Lista de utilizadores válidos
const utilizadores = [
  { numero: "180939", password: "andres91", tipo: "Tripulante+" },
  { numero: "18001", password: "1234", tipo: "Tripulante+" },
  { numero: "18003", password: "4321", tipo: "Tripulante" },
  { numero: "teste", password: "teste", tipo: "Tripulante" },
];

// ✅ Estrutura de pastas
const uploadDir = path.join(__dirname, "uploads");
const chapasDir = path.join(uploadDir, "chapas");
const servicosDir = path.join(uploadDir, "servicos");
const horariosDir = path.join(uploadDir, "horarios");
[uploadDir, chapasDir, servicosDir, horariosDir].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// ✅ Função auxiliar: configuração de uploads
function storageFor(folder) {
  return multer.diskStorage({
    destination: (req, file, cb) => cb(null, folder),
    filename: (req, file, cb) => cb(null, Date.now() + "_" + file.originalname)
  });
}

// ✅ Função utilitária txt → pdf
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

// -------------------- UPLOADS -------------------- //

// ⬆️ Upload de Chapas
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

// ⬆️ Upload de Serviços
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

// ⬆️ Upload de Horários
const uploadHorario = multer({ storage: storageFor(horariosDir) });
app.post("/horarios/upload", uploadHorario.single("file"), (req, res) => {
  res.json({
    tipo: "horario",
    nome: req.file.originalname,
    ficheiro: `/uploads/horarios/${req.file.filename}`
  });
});

// ❌ Apagar Horário
app.delete("/horarios/:ficheiro", (req, res) => {
  const filePath = path.join(horariosDir, req.params.ficheiro);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
    res.json({ sucesso: true });
  } else {
    res.status(404).json({ sucesso: false, mensagem: "Ficheiro não encontrado" });
  }
});

// 📅 Listar Horários por data
app.get("/horarios/:data", (req, res) => {
  const { data } = req.params;
  const files = fs.readdirSync(horariosDir).filter(f => f.startsWith(data));

  const lista = files.map(file => {
    const partes = file.replace(".pdf", "").split("_"); 
    return {
      carreira: partes[1] || "??",
      chapa: partes[2] || "??",
      ficheiro: `/uploads/horarios/${file}`
    };
  });

  res.json(lista);
});

// -------------------- SERVIÇOS (Calendário) -------------------- //
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

// -------------------- LOGIN -------------------- //
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

// -------------------- TESTE + STATIC -------------------- //
app.get("/", (req, res) => {
  res.send("API do Guarda-Freios a funcionar 🚂");
});

app.use("/uploads", express.static(uploadDir));

// Porta do Railway
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor a correr na porta ${PORT}`));
