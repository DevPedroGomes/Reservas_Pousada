# Sistema de Reservas - Pousada

Sistema de gerenciamento de reservas para pousada com 25 quartos, desenvolvido com Node.js no backend e JavaScript puro no frontend. Esta aplicação utiliza Supabase (PostgreSQL) como banco de dados para garantir persistência e segurança dos dados.

## 📋 Características

- Autenticação de usuários com JWT
- Dashboard com visão geral das reservas
- Gerenciamento completo de reservas (criar, editar, excluir)
- Controle de pagamentos e valores das reservas
- Filtros por status, período e pagamento
- Verificação de disponibilidade de quartos
- Backup automático dos dados
- Interface responsiva e moderna

## 🔧 Tecnologias Utilizadas

### Backend
- Node.js + Express.js
- Autenticação JWT
- Supabase (PostgreSQL gerenciado)
- Rate limiting e proteções contra ataques
- Sistema de cache para consultas frequentes
- Logging e monitoramento de atividades

### Frontend
- JavaScript puro
- HTML5 + CSS3
- Bootstrap 5
- Flatpickr para seleção de datas

## 🛠️ Arquitetura de Banco de Dados

O sistema utiliza o Supabase como solução de banco de dados PostgreSQL gerenciado, proporcionando:

- **Persistência de dados**: Armazenamento confiável sem risco de perda durante reinicializações do servidor
- **Escalabilidade**: Capacidade para crescer conforme a demanda
- **Segurança avançada**: Políticas de acesso a nível de linha (RLS)
- **Funções SQL protegidas**: Usando `SECURITY DEFINER` para operações críticas

### Tabelas Principais

1. **usuarios**:
   - `id`: Identificador único (SERIAL)
   - `username`: Nome de usuário único
   - `password`: Senha criptografada com bcrypt
   - `nome`: Nome completo
   - `role`: Papel do usuário
   - `created_at`: Data de criação

2. **reservas**:
   - `id`: Identificador único (SERIAL)
   - `nome`: Nome do hóspede
   - `cpf`: Documento do hóspede
   - `quarto`: Número do quarto
   - `data_entrada` e `data_saida`: Período da reserva
   - `status`: Estado da reserva (ativa, finalizada, cancelada)
   - `valor`: Valor da reserva
   - `pago`: Status de pagamento (boolean)
   - `observacoes`: Notas adicionais
   - `criado_por`: Referência ao usuário que criou
   - `created_at` e `updated_at`: Carimbos de data

## ⚡ Otimizações de Performance

1. **Sistema de Cache**:
   - Cache em memória para consultas frequentes
   - TTL configurável para invalidação automática
   - Invalidação seletiva de cache

2. **Índices no Banco de Dados**:
   - Índice em `status` para filtros rápidos
   - Índice em `pago` para consultas financeiras
   - Chaves primárias otimizadas

3. **Consultas Otimizadas**:
   - Uso de consultas preparadas para evitar SQL injection
   - Seleção apenas dos campos necessários
   - Uso de paginação quando necessário

## 🔒 Medidas de Segurança

1. **Autenticação e Autorização**:
   - JWT com tempo de expiração
   - Senhas criptografadas com bcrypt
   - Verificação de tokens em cada requisição
   - Controle de acesso baseado em funções

2. **Proteção Contra Ataques**:
   - Rate limiting para prevenir força bruta
   - Proteção contra XSS com cabeçalhos HTTP seguros
   - Validação de entrada em todas as rotas
   - Remoção de informações sensíveis do servidor (x-powered-by)

3. **Segurança no Banco de Dados**:
   - Políticas de acesso a nível de linha (RLS)
   - Funções SQL com SECURITY DEFINER
   - Separação de credenciais de leitura/escrita

4. **Monitoramento e Logs**:
   - Registro de atividades suspeitas
   - Log de transações importantes
   - Monitoramento de performance

## 🚀 Instalação

1. Clone o repositório:
```bash
git clone [URL_DO_REPOSITÓRIO]
cd reserva-pousada
```

2. Instale as dependências:
```bash
cd backend
npm install
```

3. Configure as variáveis de ambiente (crie um arquivo .env):
```
NODE_ENV=development
PORT=3000
JWT_SECRET=sua_chave_secreta_aqui
SUPABASE_URL=https://seu-projeto.supabase.co
SUPABASE_KEY=sua_chave_anon_key
```

4. Inicie o servidor:
```bash
npm start
```

O sistema estará disponível em `http://localhost:3000`

## 🚀 Deploy

### Preparando para Produção

1. Configure um projeto Supabase:
   - Crie uma conta em [supabase.com](https://supabase.com)
   - Crie um novo projeto
   - Execute os scripts SQL fornecidos para criar as funções necessárias

2. Configure as variáveis de ambiente no servidor de hospedagem:
   - `NODE_ENV=production`
   - `JWT_SECRET=chave_secreta_forte_e_unica`
   - `SUPABASE_URL` e `SUPABASE_KEY` do seu projeto
   - `CORS_ORIGIN` com o domínio exato (para mais segurança)

3. Configure backups diários:
   - Use a função de backup incluída (`node backend/backup.js`)
   - Armazene os backups em local seguro

## 📋 Uso

1. Acesse o sistema no navegador
2. Faça login com as credenciais padrão (primeira vez):
   - Usuário: admin
   - Senha: admin123
3. **Importante**: Altere a senha padrão após o primeiro login

## 🔄 Backups

O sistema inclui um script de backup automático que exporta todos os dados do Supabase para arquivos JSON.

Para executar manualmente:
```bash
cd backend
npm run backup
```

Os backups são armazenados em `backend/backup/` e os 10 mais recentes são mantidos automaticamente.

## 📄 Licença

Este projeto está sob a licença ISC. 