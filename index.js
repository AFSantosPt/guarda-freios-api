const express = require("express");
const cors = require("cors");
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
