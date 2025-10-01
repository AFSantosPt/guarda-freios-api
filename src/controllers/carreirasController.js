import { getVeiculos12E } from "../services/carrisService.js";

export async function listarVeiculos12E(req, res) {
  const dados = await getVeiculos12E();
  res.json(dados);
}
