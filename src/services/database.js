import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import bcrypt from 'bcryptjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dataDir = path.join(__dirname, '../../data');
const dbFile = path.join(dataDir, 'database.json');

// Criar diretório se não existir
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Estrutura inicial da base de dados
const initialData = {
  utilizadores: [
    {
      id: 1,
      numero: '18001',
      nome: 'António Silva',
      password: bcrypt.hashSync('123456', 10),
      cargo: 'Gestor',
      email: 'antonio.silva@carris.pt',
      ativo: true
    },
    {
      id: 2,
      numero: '18002',
      nome: 'João Silva',
      password: bcrypt.hashSync('123456', 10),
      cargo: 'Tripulante',
      email: 'joao.silva@carris.pt',
      ativo: true
    },
    {
      id: 3,
      numero: '180939',
      nome: 'Maria Santos',
      password: bcrypt.hashSync('123456', 10),
      cargo: 'Tripulante',
      email: 'maria.santos@carris.pt',
      ativo: true
    }
  ],
  gps_sessoes: [],
  rendicoes: [],
  observacoes: [],
  notificacoes: []
};

// Carregar ou criar base de dados
let db = initialData;

if (fs.existsSync(dbFile)) {
  try {
    const data = fs.readFileSync(dbFile, 'utf8');
    db = JSON.parse(data);
    console.log('✅ Base de dados carregada');
  } catch (error) {
    console.error('Erro ao carregar base de dados, usando dados iniciais');
    db = initialData;
  }
} else {
  saveDatabase();
  console.log('✅ Base de dados criada');
}

// Salvar base de dados
export function saveDatabase() {
  try {
    fs.writeFileSync(dbFile, JSON.stringify(db, null, 2));
    return true;
  } catch (error) {
    console.error('Erro ao salvar base de dados:', error);
    return false;
  }
}

// Salvar automaticamente a cada 5 segundos se houver mudanças
let hasChanges = false;
setInterval(() => {
  if (hasChanges) {
    saveDatabase();
    hasChanges = false;
  }
}, 5000);

// Marcar que houve mudanças
function markChanged() {
  hasChanges = true;
}

// Funções de acesso aos dados

// Utilizadores
export function getUtilizadores() {
  return db.utilizadores;
}

export function getUtilizadorByNumero(numero) {
  return db.utilizadores.find(u => u.numero === numero && u.ativo);
}

export function getUtilizadorById(id) {
  return db.utilizadores.find(u => u.id === id);
}

export function updateUtilizador(id, updates) {
  const index = db.utilizadores.findIndex(u => u.id === id);
  if (index !== -1) {
    db.utilizadores[index] = { ...db.utilizadores[index], ...updates };
    markChanged();
    return db.utilizadores[index];
  }
  return null;
}

// GPS
export function addGPSSession(data) {
  // Desativar sessões antigas do mesmo tripulante
  db.gps_sessoes.forEach(s => {
    if (s.tripulante_id === data.tripulante_id) {
      s.ativo = false;
    }
  });

  const session = {
    id: db.gps_sessoes.length + 1,
    ...data,
    ativo: true,
    timestamp: new Date().toISOString()
  };

  db.gps_sessoes.push(session);
  markChanged();
  return session;
}

export function stopGPS(tripulanteId) {
  db.gps_sessoes.forEach(s => {
    if (s.tripulante_id === tripulanteId) {
      s.ativo = false;
    }
  });
  markChanged();
}

export function getGPSByCarreira(carreira, timeoutMs = 30000) {
  const cutoffTime = new Date(Date.now() - timeoutMs);
  
  return db.gps_sessoes.filter(s => 
    s.carreira === carreira && 
    s.ativo && 
    new Date(s.timestamp) > cutoffTime
  );
}

// Rendições
export function addRendicao(data) {
  const rendicao = {
    id: db.rendicoes.length + 1,
    ...data,
    hora_chegada: new Date().toISOString(),
    status: 'pendente'
  };

  db.rendicoes.push(rendicao);
  markChanged();
  return rendicao;
}

export function getRendicoes(carreira = null, limit = 50) {
  let rendicoes = db.rendicoes;
  
  if (carreira) {
    rendicoes = rendicoes.filter(r => r.carreira === carreira);
  }

  return rendicoes
    .sort((a, b) => new Date(b.hora_chegada) - new Date(a.hora_chegada))
    .slice(0, limit);
}

// Observações
export function addObservacao(data) {
  const observacao = {
    id: db.observacoes.length + 1,
    ...data,
    timestamp: new Date().toISOString()
  };

  db.observacoes.push(observacao);
  markChanged();
  return observacao;
}

export function getObservacoesByCarreira(carreira, limit = 50) {
  return db.observacoes
    .filter(o => o.carreira === carreira)
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
    .slice(0, limit);
}

export function cleanOldObservacoes(hoursOld = 24) {
  const cutoffTime = new Date(Date.now() - hoursOld * 3600000);
  const before = db.observacoes.length;
  
  db.observacoes = db.observacoes.filter(o => 
    new Date(o.timestamp) > cutoffTime
  );

  const removed = before - db.observacoes.length;
  if (removed > 0) {
    markChanged();
    console.log(`🗑️ ${removed} observações antigas removidas`);
  }
  
  return removed;
}

// Notificações
export function addNotificacao(data) {
  const notificacao = {
    id: db.notificacoes.length + 1,
    ...data,
    lida: false,
    timestamp: new Date().toISOString()
  };

  db.notificacoes.push(notificacao);
  markChanged();
  return notificacao;
}

export function getNotificacoesNaoLidas(utilizadorId, limit = 50) {
  return db.notificacoes
    .filter(n => n.destinatario_id === utilizadorId && !n.lida)
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
    .slice(0, limit);
}

export function markNotificacaoLida(id) {
  const notificacao = db.notificacoes.find(n => n.id === id);
  if (notificacao) {
    notificacao.lida = true;
    markChanged();
    return true;
  }
  return false;
}

export default {
  getUtilizadores,
  getUtilizadorByNumero,
  getUtilizadorById,
  updateUtilizador,
  addGPSSession,
  stopGPS,
  getGPSByCarreira,
  addRendicao,
  getRendicoes,
  addObservacao,
  getObservacoesByCarreira,
  cleanOldObservacoes,
  addNotificacao,
  getNotificacoesNaoLidas,
  markNotificacaoLida,
  saveDatabase
};
