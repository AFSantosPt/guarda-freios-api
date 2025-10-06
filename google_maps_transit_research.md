# Pesquisa: Google Maps Transit API

## Transit Layer - Google Maps JavaScript API

### O que é o Transit Layer?

O Transit Layer do Google Maps JavaScript API permite exibir a rede de transporte público de uma cidade no mapa usando o objeto `TransitLayer`.

### Características:

1. **Visualização de Linhas de Transporte**
   - Quando ativado, o Transit Layer exibe as principais linhas de transporte como linhas grossas e coloridas
   - A cor da linha é definida com base nas informações do operador da linha de transporte
   - Altera o estilo do mapa base para enfatizar melhor as rotas de transporte

2. **Implementação Básica**

```javascript
function initMap() {
  const map = new google.maps.Map(
    document.getElementById("map"),
    {
      zoom: 13,
      center: { lat: 51.501904, lng: -0.115871 }, // Londres
    }
  );

  const transitLayer = new google.maps.TransitLayer();
  transitLayer.setMap(map);
}
```

### Limitações do Transit Layer:

- **Apenas visualização**: O Transit Layer mostra as linhas de transporte no mapa, mas NÃO fornece:
  - Posições em tempo real dos veículos
  - Horários
  - Dados GTFS-RT
  - Informações detalhadas sobre veículos específicos

### Para Dados em Tempo Real:

Para obter dados em tempo real (posições de veículos, horários, etc.), é necessário:

1. **Google Transit Partner Program**
   - Para agências de transporte público que querem incluir seus dados
   - Link: https://maps.google.com/help/maps/mapcontent/transit/

2. **Acesso direto aos feeds GTFS-RT**
   - Carris Metropolitana tem GTFS-RT disponível
   - Transitland oferece acesso a feeds GTFS-RT (requer subscrição)

## Próximos Passos:

1. Pesquisar feeds GTFS-RT da Carris (elétricos de Lisboa)
2. Verificar se há API pública disponível
3. Implementar solução alternativa se necessário


## GTFS da Carris (Elétricos de Lisboa)

### Informações Encontradas:

**Onestop ID:** f-carris~pt  
**Operadora:** Companhia Carris de Ferro de Lisboa (CARRIS)  
**Formato:** GTFS (Schedule)

### URLs Disponíveis:

1. **GTFS Atual (Static):**
   - URL: `https://gateway.carris.pt/gateway/gtfs/carris_gtfs.zip`
   - Última atualização: 2025-10-02 (2 horas atrás)
   - Contém: Horários programados, rotas, paragens

2. **GTFS Histórico:**
   - URL: `http://www.transporlis.pt/Portals/0/OpenData/GTFS_Carris.zip`
   - Versões antigas disponíveis

3. **Licença:**
   - URL: `https://dadosabertos.cm-lisboa.pt/dataset/carris`
   - Dados abertos da Câmara Municipal de Lisboa

### Limitações:

⚠️ **IMPORTANTE:** A Carris disponibiliza apenas **GTFS Schedule** (horários programados), **NÃO tem GTFS-RT** (tempo real) público.

Isto significa que:
- ✅ Podemos obter: Rotas, paragens, horários programados
- ❌ NÃO podemos obter: Posições GPS em tempo real dos elétricos

### Alternativas para Dados em Tempo Real:

1. **Simulação baseada em horários**
   - Usar GTFS Schedule para calcular posições estimadas
   - Interpolar posição com base no horário e percurso

2. **API privada da Carris**
   - Pode existir mas não é pública
   - Requer autorização da Carris

3. **Web scraping**
   - Não recomendado (termos de serviço)

### Conclusão:

Para a aplicação Guarda-Freios, a melhor abordagem é:
1. Usar GTFS Schedule da Carris para dados de rotas e paragens reais
2. Implementar sistema de simulação/estimativa de posições
3. Permitir que tripulantes confirmem posições manualmente (já implementado)


## Ferramentas de Visualização GTFS Encontradas

### Bibliotecas JavaScript:

1. **Node-GTFS**
   - URL: https://github.com/BlinkTagInc/node-gtfs
   - Carrega dados GTFS, descompacta e armazena em MongoDB
   - Útil para backend

2. **gtfs-utils**
   - JavaScript utilities para processar datasets GTFS
   - Pode calcular tempos de chegada/partida

3. **GTFS-viz**
   - Converte dataset GTFS em SQLite DB + GeoJSONs / KMLs
   - Útil para visualização em mapas

### Visualizadores:

1. **GTFS to HTML**
   - Constrói tabelas HTML a partir de dados GTFS
   - Bom para horários

2. **GTFS Visualizations**
   - Visualização de dados GTFS

3. **LiveMap**
   - Visualização em tempo real de transporte público baseada em GTFS
   - URL: https://github.com/vasile/transit-map
   - **PROMISSOR para o nosso caso!**

4. **gtfs-rt-inspector**
   - Web app para inspecionar e analisar feeds GTFS Realtime
   - URL: https://github.com/derhuerst/gtfs-rt-inspector

### Solução Recomendada:

**Abordagem Híbrida com OpenStreetMap + Leaflet:**

1. **Leaflet.js** (biblioteca de mapas open-source)
   - Não requer chave de API
   - Usa tiles do OpenStreetMap (gratuito)
   - Leve (42 KB)
   - Mobile-friendly

2. **GTFS da Carris**
   - Baixar e processar GTFS Schedule
   - Extrair rotas e paragens da Carreira 12E
   - Criar GeoJSON com percurso

3. **Visualização**
   - Desenhar percurso no mapa Leaflet
   - Marcar paragens
   - Mostrar posições estimadas dos elétricos
   - Sistema colaborativo de confirmação

### Implementação Proposta:

```javascript
// 1. Usar Leaflet.js para o mapa
// 2. OpenStreetMap para tiles (gratuito)
// 3. Processar GTFS da Carris para obter dados reais
// 4. Desenhar rotas e paragens
// 5. Sistema de tracking colaborativo
```

Esta solução:
- ✅ Não requer chaves de API
- ✅ Usa dados oficiais da Carris
- ✅ É totalmente gratuita
- ✅ Funciona offline (após cache)
- ✅ Mobile-friendly
