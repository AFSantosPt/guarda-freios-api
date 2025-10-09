import pg from 'pg';
const { Pool } = pg;

// Configuração do pool de conexões PostgreSQL
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? {
    rejectUnauthorized: false
  } : false,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Evento de erro
pool.on('error', (err) => {
  console.error('❌ Erro inesperado no cliente PostgreSQL:', err);
});

// Testar conexão
pool.query('SELECT NOW()', (err, res) => {
  if (err) {
    console.error('❌ Erro ao conectar ao PostgreSQL:', err.message);
  } else {
    console.log('✅ PostgreSQL conectado:', res.rows[0].now);
  }
});

export default pool;

