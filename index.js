import express from "express";
import cors from "cors";

const app = express();
app.use(cors());
app.use(express.json());

// Login de teste
const users = [
  { numero: "123456", password: "teste123" },
  { numero: "654321", password: "senha456" }
];

app.post("/login", (req, res) => {
  const { numero, password } = req.body;
  const user = users.find(
    (u) => u.numero === numero && u.password === password
  );

  if (user) {
    res.json({ success: true, token: "fake-jwt-token-123" });
  } else {
    res.json({ success: false });
  }
});

// 🚀 Porta dinâmica obrigatória para Railway
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`API a correr na porta ${PORT}`));
